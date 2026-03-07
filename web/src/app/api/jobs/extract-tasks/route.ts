import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { extractTaskFromAgentmailMessage } from '@/lib/extractTask';
import { extractWithOpenAI } from '@/lib/openai';

export const dynamic = 'force-dynamic';

const EXTRACTOR_VERSION = 'v0-heuristic-2026-03-06';

function requireJobSecret(req: Request) {
  const configured = process.env.EXTRACT_JOBS_SECRET;
  if (!configured) {
    throw new Error('Server misconfigured: missing EXTRACT_JOBS_SECRET');
  }

  const got = req.headers.get('x-jobs-secret');
  if (!got || got !== configured) {
    throw new Error('Unauthorized: missing/invalid x-jobs-secret');
  }
}

export async function POST(req: Request) {
  try {
    requireJobSecret(req);

    const supabase = getSupabaseServerClient();

    // Load allowed tags (seeded in Supabase).
    const { data: tagsData, error: tagsErr } = await supabase
      .from('tags')
      .select('id,name,category')
      .eq('active', true);

    if (tagsErr) {
      return NextResponse.json({ ok: false, error: tagsErr.message }, { status: 500 });
    }

    const tags = (tagsData ?? []) as { id: string; name: string; category: 'area' | 'topic' }[];
    const allowedAreas = tags.filter((t) => t.category === 'area').map((t) => t.name);
    const allowedTopics = tags.filter((t) => t.category === 'topic').map((t) => t.name);

    // Pull latest messages. We avoid ordering by a specific column because schema can vary.
    const { data: msgs, error: msgErr } = await supabase
      .from('agentmail_messages')
      .select('message_id, subject, from, to, text, ts, inserted_at')
      .limit(50);

    if (msgErr) {
      return NextResponse.json({ ok: false, error: msgErr.message }, { status: 500 });
    }

    const messages = (msgs ?? []) as Record<string, unknown>[];

    let seen = 0;
    let created = 0;
    let skipped = 0;

    for (const m of messages) {
      const messageId = String(m.message_id ?? '').trim();
      if (!messageId) continue;
      seen++;

      // idempotency: check processing marker
      const { data: marker, error: markerErr } = await supabase
        .from('agentmail_message_processing')
        .select('message_id')
        .eq('message_id', messageId)
        .maybeSingle();

      if (markerErr) {
        return NextResponse.json({ ok: false, error: markerErr.message }, { status: 500 });
      }
      if (marker) continue;

      // v0: use OpenAI to decide actionable + extract title/tags.
      // Keep heuristic as fallback if OpenAI is not configured.
      let actionable = true;
      let title = '';
      let notes: string | undefined;
      let areas: string[] = [];
      let topics: string[] = [];
      let confidence: 'auto_high' | 'auto_low' = 'auto_low';

      if (process.env.OPENAI_API_KEY) {
        const oa = await extractWithOpenAI({
          subject: String(m.subject ?? ''),
          from: String(m.from ?? ''),
          to: String(m.to ?? ''),
          text: String(m.text ?? ''),
          allowedAreas,
          allowedTopics,
        });
        actionable = oa.actionable;
        title = (oa.title ?? '').trim();
        notes = oa.notes;
        areas = oa.areas ?? [];
        topics = oa.topics ?? [];
        confidence = oa.confidence === 'high' ? 'auto_high' : 'auto_low';
      } else {
        const extracted = extractTaskFromAgentmailMessage(m);
        if (extracted.skipReason) actionable = false;
        title = extracted.title;
        notes = extracted.notes;
      }

      if (!actionable) {
        skipped++;
        const { error: insErr } = await supabase.from('agentmail_message_processing').insert({
          message_id: messageId,
          extractor_version: EXTRACTOR_VERSION,
        });
        if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
        continue;
      }

      if (!title) title = String(m.subject ?? '(no subject)');

      // Some deployments may be missing the `notes` column if the SQL wasn’t applied fully.
      // If PostgREST complains about missing `notes`, retry the insert without it.
      const insertBase = {
        title,
        status: 'triage',
        source_message_id: messageId,
      };

      const tryInsert = async (payload: Record<string, unknown>) =>
        supabase.from('tasks').insert(payload).select('id').maybeSingle();

      let { data: taskRow, error: taskErr } = await tryInsert({
        ...insertBase,
        notes: notes ?? null,
      });

      if (taskErr && /notes.*column/i.test(taskErr.message)) {
        ({ data: taskRow, error: taskErr } = await tryInsert(insertBase));
      }

      if (taskErr) return NextResponse.json({ ok: false, error: taskErr.message }, { status: 500 });

      const taskId = (taskRow as { id?: string } | null)?.id ?? null;

      // Tag assignments (task target)
      if (taskId) {
        const wanted = new Set([...areas, ...topics]);
        const toAssign = tags.filter((t) => wanted.has(t.name));

        if (toAssign.length) {
          const rows = toAssign.map((t) => ({
            tag_id: t.id,
            target_type: 'task',
            target_id: taskId,
            confidence,
          }));

          const { error: tagErr } = await supabase.from('tag_assignments').insert(rows);
          if (tagErr) {
            // non-fatal for MVP; still record processing + task
            console.warn('tag assignment failed', tagErr.message);
          }
        }
      }

      const { error: procErr } = await supabase.from('agentmail_message_processing').insert({
        message_id: messageId,
        extractor_version: EXTRACTOR_VERSION,
        task_id: taskId,
      });

      if (procErr) return NextResponse.json({ ok: false, error: procErr.message }, { status: 500 });

      created++;
    }

    return NextResponse.json({ ok: true, seen, created, skipped, extractorVersion: EXTRACTOR_VERSION });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith('Unauthorized') ? 401 : msg.startsWith('Server misconfigured') ? 500 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

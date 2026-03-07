import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { extractTaskFromAgentmailMessage } from '@/lib/extractTask';
import { extractWithOpenAI } from '@/lib/openai';

export const dynamic = 'force-dynamic';

const EXTRACTOR_VERSION = `openai-v0-actionable-${process.env.OPENAI_MODEL ?? 'gpt-4.1-mini'}`;

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

    const url = new URL(req.url);
    const reprocess = url.searchParams.get('reprocess') === '1';

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
    let updated = 0;
    let skipped = 0;
    let alreadyProcessed = 0;

    for (const m of messages) {
      const messageId = String(m.message_id ?? '').trim();
      if (!messageId) continue;
      seen++;

      // idempotency: check processing marker (unless reprocess=1)
      const { data: marker, error: markerErr } = await supabase
        .from('agentmail_message_processing')
        .select('message_id, task_id')
        .eq('message_id', messageId)
        .maybeSingle();

      if (markerErr) {
        return NextResponse.json({ ok: false, error: markerErr.message }, { status: 500 });
      }
      if (marker && !reprocess) {
        alreadyProcessed++;
        continue;
      }

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

      // Upsert by source_message_id (so reprocess updates instead of duplicating)
      const { data: existingTask, error: existingErr } = await supabase
        .from('tasks')
        .select('id, status')
        .eq('source_message_id', messageId)
        .limit(1)
        .maybeSingle();

      if (existingErr) return NextResponse.json({ ok: false, error: existingErr.message }, { status: 500 });

      const et = (existingTask ?? null) as null | { id?: string; status?: string };
      const existingId = et?.id ?? null;

      // Preserve status if user already moved it out of triage.
      const desiredStatus = et?.status && et.status !== 'triage' ? et.status : 'triage';

      const writePayloadBase = {
        title,
        status: desiredStatus,
        source_message_id: messageId,
        updated_at: new Date().toISOString(),
      };

      const tryInsert = async (payload: Record<string, unknown>) =>
        supabase.from('tasks').insert(payload).select('id').maybeSingle();
      const tryUpdate = async (payload: Record<string, unknown>) =>
        supabase.from('tasks').update(payload).eq('id', existingId as string).select('id').maybeSingle();

      let taskId: string | null = null;

      if (existingId) {
        let { data, error } = await tryUpdate({
          ...writePayloadBase,
          notes: notes ?? null,
        });

        if (error && /notes.*column/i.test(error.message)) {
          ({ data, error } = await tryUpdate(writePayloadBase));
        }

        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        taskId = ((data as unknown as { id?: string } | null)?.id ?? existingId) as string;
        updated++;
      } else {
        let { data, error } = await tryInsert({
          ...writePayloadBase,
          notes: notes ?? null,
        });

        if (error && /notes.*column/i.test(error.message)) {
          ({ data, error } = await tryInsert(writePayloadBase));
        }

        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        taskId = ((data as unknown as { id?: string } | null)?.id ?? null) as string | null;
        created++;
      }

      // Tag assignments (task target). Replace on reprocess.
      if (taskId) {
        const wanted = new Set([...areas, ...topics]);
        const toAssign = tags.filter((t) => wanted.has(t.name));

        // Clear existing assignments for this task.
        const { error: delErr } = await supabase
          .from('tag_assignments')
          .delete()
          .eq('target_type', 'task')
          .eq('target_id', taskId);

        if (delErr) {
          console.warn('tag assignment delete failed', delErr.message);
        }

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
            console.warn('tag assignment insert failed', tagErr.message);
          }
        }
      }

      const { error: procErr } = await supabase
        .from('agentmail_message_processing')
        .upsert(
          {
            message_id: messageId,
            extractor_version: EXTRACTOR_VERSION,
            task_id: taskId,
            processed_at: new Date().toISOString(),
          },
          { onConflict: 'message_id' }
        );

      if (procErr) return NextResponse.json({ ok: false, error: procErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      seen,
      created,
      updated,
      skipped,
      alreadyProcessed,
      reprocess,
      extractorVersion: EXTRACTOR_VERSION,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith('Unauthorized') ? 401 : msg.startsWith('Server misconfigured') ? 500 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

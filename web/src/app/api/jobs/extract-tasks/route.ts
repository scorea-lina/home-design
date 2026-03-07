import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { extractTaskFromAgentmailMessage } from '@/lib/extractTask';

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

    // Pull latest messages. We avoid ordering by a specific column because schema can vary.
    const { data: msgs, error: msgErr } = await supabase
      .from('agentmail_messages')
      .select('message_id, subject, from, text, ts, inserted_at')
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

      const extracted = extractTaskFromAgentmailMessage(m);
      if (extracted.skipReason) {
        skipped++;
        // Still mark processed to avoid repeated work
        const { error: insErr } = await supabase.from('agentmail_message_processing').insert({
          message_id: messageId,
          extractor_version: EXTRACTOR_VERSION,
        });
        if (insErr) {
          return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
        }
        continue;
      }

      // Some deployments may be missing the `notes` column if the SQL wasn’t applied fully.
      // If PostgREST complains about missing `notes`, retry the insert without it.
      const insertBase = {
        title: extracted.title,
        status: extracted.status,
        source_message_id: messageId,
      };

      const tryInsert = async (payload: Record<string, unknown>) =>
        supabase.from('tasks').insert(payload).select('id').maybeSingle();

      let { data: taskRow, error: taskErr } = await tryInsert({
        ...insertBase,
        notes: extracted.notes ?? null,
      });

      if (taskErr && /notes.*column/i.test(taskErr.message)) {
        ({ data: taskRow, error: taskErr } = await tryInsert(insertBase));
      }

      if (taskErr) {
        return NextResponse.json({ ok: false, error: taskErr.message }, { status: 500 });
      }

      const taskId = (taskRow as { id?: string } | null)?.id ?? null;

      const { error: procErr } = await supabase.from('agentmail_message_processing').insert({
        message_id: messageId,
        extractor_version: EXTRACTOR_VERSION,
        task_id: taskId,
      });

      if (procErr) {
        return NextResponse.json({ ok: false, error: procErr.message }, { status: 500 });
      }

      created++;
    }

    return NextResponse.json({ ok: true, seen, created, skipped, extractorVersion: EXTRACTOR_VERSION });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith('Unauthorized') ? 401 : msg.startsWith('Server misconfigured') ? 500 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

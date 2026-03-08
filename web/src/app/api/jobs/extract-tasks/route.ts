import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { extractTaskFromAgentmailMessage } from '@/lib/extractTask';
import { extractWithOpenAI } from '@/lib/openai';

export const dynamic = 'force-dynamic';

const EXTRACTOR_VERSION = `openai-v1-multi-${process.env.OPENAI_MODEL ?? 'gpt-4.1-mini'}`;

function requireJobSecret(req: Request) {
  // Accept Vercel cron bearer token (CRON_SECRET) — Vercel injects this automatically.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization') ?? '';
    if (authHeader === `Bearer ${cronSecret}`) return;
  }

  // Accept manual x-jobs-secret header (local dev / manual triggers).
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

    // Pull latest messages.
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

    const debug: {
      enabled: boolean;
      samples: Array<{
        messageId: string;
        actionable: boolean;
        taskCount: number;
        tasks: Array<{ title: string; suggestedAreas: string[]; suggestedTopics: string[]; matchedTagNames: string[] }>;
        error?: string;
      }>;
    } = { enabled: reprocess, samples: [] };

    for (const m of messages) {
      const messageId = String(m.message_id ?? '').trim();
      if (!messageId) continue;
      seen++;

      // idempotency: check processing marker (unless reprocess=1)
      const { data: marker, error: markerErr } = await supabase
        .from('agentmail_message_processing')
        .select('message_id')
        .eq('message_id', messageId)
        .maybeSingle();

      if (markerErr) {
        return NextResponse.json({ ok: false, error: markerErr.message }, { status: 500 });
      }
      if (marker && !reprocess) {
        alreadyProcessed++;
        continue;
      }

      const hasOpenAI = !!(process.env.OPENAI_API_KEY || process.env.HOMEDESIGN_OPENAI_API_KEY);

      let actionable = true;
      let confidence: 'auto_high' | 'auto_low' = 'auto_low';
      type TaskDraft = { title: string; notes?: string; areas: string[]; topics: string[] };
      let taskDrafts: TaskDraft[] = [];

      if (hasOpenAI) {
        const oa = await extractWithOpenAI({
          subject: String(m.subject ?? ''),
          from: String(m.from ?? ''),
          to: String(m.to ?? ''),
          text: String(m.text ?? ''),
          allowedAreas,
          allowedTopics,
        });
        actionable = oa.actionable;
        confidence = oa.confidence === 'high' ? 'auto_high' : 'auto_low';

        if (actionable) {
          taskDrafts = oa.tasks.map((t) => {
            const areas = t.areas ?? [];
            const topics = t.topics ?? [];
            // Demo-friendly fallback: ensure non-empty tags for actionable tasks.
            const finalTopics = topics.length
              ? topics
              : allowedTopics.includes('Open Questions')
                ? ['Open Questions']
                : allowedTopics.slice(0, 1);
            const finalAreas = areas.length ? areas : allowedAreas.slice(0, 1);
            return { title: t.title, notes: t.notes, areas: finalAreas, topics: finalTopics };
          });

          // If model returned actionable but no tasks, synthesize one from subject.
          if (taskDrafts.length === 0) {
            taskDrafts = [{
              title: String(m.subject ?? '(no subject)'),
              areas: allowedAreas.slice(0, 1),
              topics: allowedTopics.includes('Open Questions') ? ['Open Questions'] : allowedTopics.slice(0, 1),
            }];
          }
        }
      } else {
        // Heuristic fallback (no OpenAI configured).
        const extracted = extractTaskFromAgentmailMessage(m);
        if (extracted.skipReason) {
          actionable = false;
        } else {
          taskDrafts = [{ title: extracted.title, notes: extracted.notes, areas: [], topics: [] }];
        }
      }

      if (!actionable || taskDrafts.length === 0) {
        skipped++;
        await supabase.from('agentmail_message_processing').upsert(
          { message_id: messageId, extractor_version: EXTRACTOR_VERSION, processed_at: new Date().toISOString() },
          { onConflict: 'message_id' }
        );
        continue;
      }

      // On reprocess: wipe existing tasks for this message so we can re-insert cleanly.
      if (reprocess) {
        const { data: existingTasks } = await supabase
          .from('tasks')
          .select('id')
          .eq('source_message_id', messageId);
        const existingIds = ((existingTasks ?? []) as { id: string }[]).map((t) => t.id);
        if (existingIds.length) {
          // Delete tag_assignments first (no FK cascade), then tasks.
          await supabase.from('tag_assignments').delete().in('target_id', existingIds);
          await supabase.from('tasks').delete().eq('source_message_id', messageId);
        }
      }

      const debugTaskEntries: (typeof debug.samples)[0]['tasks'] = [];

      for (const draft of taskDrafts) {
        const title = draft.title || String(m.subject ?? '(no subject)');

        // Check for existing task (non-reprocess path) to preserve status.
        let existingStatus: string | null = null;
        if (!reprocess) {
          const { data: ex } = await supabase
            .from('tasks')
            .select('id, status')
            .eq('source_message_id', messageId)
            .eq('title', title)
            .maybeSingle();
          const exT = ex as null | { id?: string; status?: string };
          existingStatus = exT?.status ?? null;
        }

        // Canonical statuses are: todo | done. Preserve done if user marked it done.
        const status = existingStatus === 'done' ? 'done' : 'todo';

        const emailText = String(m.text ?? '').trim();
        const emailRaw = String(m.raw ?? '').trim();
        const summaryText = emailText || emailRaw;
        const summary = summaryText ? summaryText.slice(0, 500) : null;

        const ts = m.ts ?? m.inserted_at ?? null;
        const sourceEmailDate = ts ? new Date(String(ts)).toISOString() : null;

        const taskPayload: Record<string, unknown> = {
          title,
          status,
          source_message_id: messageId,
          source_email_date: sourceEmailDate,
          summary,
          notes: draft.notes ?? null,
          updated_at: new Date().toISOString(),
        };

        const { data: taskRow, error: taskErr } = await supabase
          .from('tasks')
          .insert(taskPayload)
          .select('id')
          .maybeSingle();

        if (taskErr) {
          return NextResponse.json({ ok: false, error: taskErr.message }, { status: 500 });
        }
        const taskId = (taskRow as null | { id?: string })?.id ?? null;
        created++;

        // Assign tags.
        if (taskId) {
          const wanted = new Set([...draft.areas, ...draft.topics]);
          const toAssign = tags.filter((t) => wanted.has(t.name));
          if (toAssign.length) {
            const rows = toAssign.map((t) => ({
              tag_id: t.id, target_type: 'task', target_id: taskId, confidence,
            }));
            const { error: tagErr } = await supabase.from('tag_assignments').insert(rows);
            if (tagErr) console.warn('tag assignment insert failed', tagErr.message);
          }
          debugTaskEntries.push({
            title,
            suggestedAreas: draft.areas,
            suggestedTopics: draft.topics,
            matchedTagNames: toAssign.map((t) => t.name),
          });
        }
      }

      // Increment updated count when previously processed (reprocess path deleted + re-created).
      if (reprocess) { updated++; created -= taskDrafts.length; }

      if (debug.enabled && debug.samples.length < 3) {
        debug.samples.push({
          messageId,
          actionable,
          taskCount: taskDrafts.length,
          tasks: debugTaskEntries,
        });
      }

      await supabase.from('agentmail_message_processing').upsert(
        { message_id: messageId, extractor_version: EXTRACTOR_VERSION, processed_at: new Date().toISOString() },
        { onConflict: 'message_id' }
      );
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
      debug: debug.enabled ? debug : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith('Unauthorized') ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

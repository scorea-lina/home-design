import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

/** Parse agentmail ts (epoch seconds float) or ISO string → JS Date */
function parseTs(ts: unknown): Date | null {
  if (ts == null) return null;
  const n = Number(ts);
  if (!isNaN(n) && n > 1_000_000_000) return new Date(n * 1000); // epoch seconds
  const d = new Date(String(ts));
  return isNaN(d.getTime()) ? null : d;
}

export default async function InboxPage() {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from('agentmail_messages')
    .select('message_id,subject,from,ts,inserted_at,text')
    .limit(50);

  const rows = (data ?? []) as Record<string, unknown>[];

  // Sort by ts desc (epoch seconds).
  rows.sort((a, b) => {
    const an = Number(a.ts ?? 0);
    const bn = Number(b.ts ?? 0);
    return bn - an;
  });

  const messageIds = rows.map((r) => String(r.message_id ?? '')).filter(Boolean);

  // Batch-fetch tasks for these emails (source_message_id IN [...]).
  type TaskRow = { source_message_id: string; id: string };
  let tasksByMsgId: Record<string, TaskRow[]> = {};

  if (messageIds.length) {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id,source_message_id')
      .in('source_message_id', messageIds)
      .neq('status', 'archived');

    for (const t of (tasks ?? []) as TaskRow[]) {
      const mid = t.source_message_id ?? '';
      if (!mid) continue;
      (tasksByMsgId[mid] ??= []).push(t);
    }
  }

  // Batch-fetch tag assignments for those tasks.
  const allTaskIds = Object.values(tasksByMsgId).flat().map((t) => t.id);
  let tagsByTaskId: Record<string, string[]> = {};

  if (allTaskIds.length) {
    const { data: assigns } = await supabase
      .from('tag_assignments')
      .select('target_id, tags(name)')
      .eq('target_type', 'task')
      .in('target_id', allTaskIds);

    for (const a of (assigns ?? []) as any[]) {
      const tid = String(a.target_id ?? '');
      const name = a.tags?.name;
      if (!tid || !name) continue;
      (tagsByTaskId[tid] ??= []).push(String(name));
    }
  }

  // Aggregate top tags per email (unique, up to 3).
  function topTagsForEmail(messageId: string): string[] {
    const tasks = tasksByMsgId[messageId] ?? [];
    const seen = new Set<string>();
    for (const t of tasks) {
      for (const tag of tagsByTaskId[t.id] ?? []) {
        seen.add(tag);
        if (seen.size >= 3) break;
      }
      if (seen.size >= 3) break;
    }
    return Array.from(seen);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Inbox</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Timeline of ingested emails (from <code>public.agentmail_messages</code>).
        </p>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
          Failed to load: {error.message}
        </div>
      ) : null}

      <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
        {rows.length === 0 ? (
          <div className="p-4 text-sm text-zinc-500">No emails yet.</div>
        ) : (
          rows.map((row) => {
            const messageId = String(row.message_id ?? '');
            const subject = String(row.subject ?? '(no subject)');
            const from = String(row.from ?? '(unknown sender)');
            const date = parseTs(row.ts ?? row.inserted_at);
            const dateStr = date ? date.toLocaleString() : '';
            const tasks = tasksByMsgId[messageId] ?? [];
            const tags = topTagsForEmail(messageId);
            const preview = String(row.text ?? '').slice(0, 160).trim();

            return (
              <Link
                key={messageId}
                href={`/inbox/${encodeURIComponent(messageId)}`}
                className="block p-4 hover:bg-zinc-900/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-zinc-100">{subject}</div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      <span>{from}</span>
                      {dateStr ? <span> · {dateStr}</span> : null}
                    </div>
                    {preview ? (
                      <div className="mt-1.5 line-clamp-2 text-xs text-zinc-400">{preview}</div>
                    ) : null}
                    {tags.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-zinc-700 bg-zinc-950/60 px-2 py-0.5 text-[10px] text-zinc-400"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {tasks.length > 0 ? (
                    <span className="shrink-0 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-300">
                      {tasks.length} task{tasks.length !== 1 ? 's' : ''}
                    </span>
                  ) : null}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

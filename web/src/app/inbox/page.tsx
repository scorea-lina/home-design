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

  rows.sort((a, b) => {
    const an = Number(a.ts ?? 0);
    const bn = Number(b.ts ?? 0);
    return bn - an;
  });

  const messageIds = rows.map((r) => String(r.message_id ?? '')).filter(Boolean);

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
        <h1 className="text-2xl font-semibold tracking-tight text-cream-950">Inbox</h1>
      </header>

      {error ? (
        <div className="rounded-xl border border-terra-400/30 bg-terra-400/10 p-4 text-sm text-terra-600">
          Failed to load: {error.message}
        </div>
      ) : null}

      <div className="divide-y divide-cream-300 rounded-xl border border-cream-400/60 bg-white shadow-warm">
        {rows.length === 0 ? (
          <div className="p-4 text-sm text-cream-600">No emails yet.</div>
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
                className="block p-4 transition-colors hover:bg-cream-100/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-cream-950">{subject}</div>
                    <div className="mt-0.5 text-xs text-cream-600">
                      <span>{from}</span>
                      {dateStr ? <span> · {dateStr}</span> : null}
                    </div>
                    {preview ? (
                      <div className="mt-1.5 line-clamp-2 text-xs text-cream-700">{preview}</div>
                    ) : null}
                    {tags.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-cream-400 bg-cream-200 px-2 py-0.5 text-[10px] text-cream-700"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {tasks.length > 0 ? (
                    <span className="shrink-0 rounded-full border border-cream-400 bg-cream-100 px-2 py-0.5 text-[11px] text-cream-800">
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

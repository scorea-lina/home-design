'use client';

import { useEffect, useState } from 'react';

type TaskTag = { name: string; category: string };

type ArchivedTask = {
  id: string;
  title: string;
  summary?: string | null;
  source_message_id?: string | null;
  source_email_date?: string | null;
  source_message_ts?: number | null;
  archived_at?: string | null;
  notes?: string | null;
  tags?: TaskTag[];
};

function dayKey(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Unknown date';
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return 'Unknown date';
  }
}

export default function ArchivePage() {
  const [tasks, setTasks] = useState<ArchivedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  async function loadArchive() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/archive', { cache: 'no-store' });
      const json = (await res.json()) as { ok: boolean; tasks?: ArchivedTask[]; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setTasks(json.tasks ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function restore(taskId: string) {
    setRestoring(taskId);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'todo' }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      // Remove from local list immediately (optimistic).
      setTasks((ts) => ts.filter((t) => t.id !== taskId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRestoring(null);
    }
  }

  useEffect(() => {
    void loadArchive();
  }, []);

  // Group by day of archived_at.
  const groups: { day: string; tasks: ArchivedTask[] }[] = [];
  const seen: Record<string, number> = {};
  for (const t of tasks) {
    const day = dayKey(t.archived_at);
    if (seen[day] === undefined) {
      seen[day] = groups.length;
      groups.push({ day, tasks: [] });
    }
    groups[seen[day]].tasks.push(t);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Archive</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Tasks you've archived — out of the way, but not gone.
          </p>
        </div>
        <a
          href="/"
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
        >
          ← Back to Kanban
        </a>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-zinc-500">Loading archive…</div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          Nothing archived yet.
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.day}>
              <div className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
                {group.day}
              </div>
              <div className="space-y-2">
                {group.tasks.map((t) => {
                  const tags = (t.tags ?? []).slice(0, 6);
                  const inboxHref = t.source_message_id
                    ? `/inbox/${encodeURIComponent(String(t.source_message_id))}`
                    : null;

                  return (
                    <div
                      key={t.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-base font-medium text-zinc-100">{t.title}</div>

                          {t.source_message_ts != null ? (
                            <div className="mt-1 text-xs text-zinc-500">
                              Email: {new Date(Number(t.source_message_ts) * 1000).toLocaleString()}
                            </div>
                          ) : null}

                          {tags.length ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {tags.map((tag) => (
                                <span
                                  key={`${tag.category}:${tag.name}`}
                                  className="rounded-full border border-zinc-700 bg-zinc-950/60 px-2 py-0.5 text-[11px] text-zinc-400"
                                >
                                  {tag.name}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          {t.summary ? (
                            <div className="mt-2 line-clamp-2 text-sm text-zinc-400">
                              {t.summary}
                            </div>
                          ) : null}

                          {inboxHref ? (
                            <a
                              href={inboxHref}
                              className="mt-2 inline-block text-xs text-zinc-400 underline underline-offset-4 hover:text-zinc-200"
                            >
                              View email →
                            </a>
                          ) : null}
                        </div>

                        <button
                          onClick={() => void restore(t.id)}
                          disabled={restoring === t.id}
                          className="shrink-0 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                        >
                          {restoring === t.id ? 'Restoring…' : 'Restore'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

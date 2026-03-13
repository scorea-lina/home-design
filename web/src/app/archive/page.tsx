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
  const [q, setQ] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [allTagNames, setAllTagNames] = useState<string[]>([]);

  async function loadTags() {
    try {
      const res = await fetch('/api/tags', { cache: 'no-store' });
      const json = (await res.json()) as { ok: boolean; tags?: Array<{ name: string }>; error?: string };
      if (!res.ok || !json.ok) return;
      const names = Array.from(new Set((json.tags ?? []).map((t) => String(t.name ?? '')).filter(Boolean))).sort();
      setAllTagNames(names);
    } catch {
      // ignore
    }
  }

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
      setTasks((ts) => ts.filter((t) => t.id !== taskId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRestoring(null);
    }
  }

  useEffect(() => {
    void loadArchive();
    void loadTags();
  }, []);

  const availableTags = Array.from(
    new Set(tasks.flatMap((t) => (t.tags ?? []).map((tg) => tg.name)).filter(Boolean))
  ).sort();

  const filteredTasks = tasks.filter((t) => {
    const qq = q.trim().toLowerCase();
    if (qq && !String(t.title ?? '').toLowerCase().includes(qq)) return false;
    if (tagFilter) {
      const names = new Set((t.tags ?? []).map((tg) => tg.name));
      if (!names.has(tagFilter)) return false;
    }
    return true;
  });

  const groups: { day: string; tasks: ArchivedTask[] }[] = [];
  const seen: Record<string, number> = {};
  for (const t of filteredTasks) {
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
          <h1 className="text-2xl font-semibold tracking-tight text-cream-950">Archive</h1>
          <p className="mt-1 text-sm text-cream-700">
            Tasks you've archived — out of the way, but not gone.
          </p>
        </div>
        <a
          href="/"
          className="rounded-lg border border-cream-400 bg-cream-100 px-3 py-2 text-sm text-cream-900 hover:bg-cream-200"
        >
          ← Back to Tracker
        </a>
      </header>


      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search archived tasks…"
          className="w-full rounded-lg border border-cream-400 bg-cream-50 px-3 py-2 text-sm text-cream-950 placeholder:text-cream-600 focus:border-wood-500 focus:outline-none md:w-[360px]"
        />
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="rounded-lg border border-cream-400 bg-cream-50 px-3 py-2 text-sm text-cream-950"
        >
          <option value="">All tags</option>
          {allTagNames.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {(q || tagFilter) ? (
          <button
            onClick={() => { setQ(''); setTagFilter(''); }}
            className="rounded-lg border border-cream-400 bg-cream-100 px-3 py-2 text-sm text-cream-900 hover:bg-cream-200"
          >
            Clear
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-terra-400/30 bg-terra-400/10 p-4 text-sm text-terra-600">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-cream-600">Loading archive…</div>
      ) : filteredTasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-cream-400 p-8 text-center text-sm text-cream-600">
          No archived tasks match your filters.
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.day}>
              <div className="mb-3 text-xs font-medium uppercase tracking-wider text-cream-600">
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
                      className="rounded-lg border border-cream-400/60 bg-white p-4 shadow-warm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-base font-medium text-cream-950">{t.title}</div>

                          {t.source_message_ts != null ? (
                            <div className="mt-1 text-xs text-cream-600">
                              Email: {new Date(Number(t.source_message_ts) * 1000).toLocaleString()}
                            </div>
                          ) : null}

                          {tags.length ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {tags.map((tag) => (
                                <span
                                  key={`${tag.category}:${tag.name}`}
                                  className="rounded-full border border-cream-400 bg-cream-200 px-2 py-0.5 text-[11px] text-cream-700"
                                >
                                  {tag.name}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          {t.summary ? (
                            <div className="mt-2 line-clamp-2 text-sm text-cream-700">
                              {t.summary}
                            </div>
                          ) : null}

                          {inboxHref ? (
                            <a
                              href={inboxHref}
                              className="mt-2 inline-block text-xs text-wood-600 underline underline-offset-4 hover:text-wood-700"
                            >
                              View email →
                            </a>
                          ) : null}
                        </div>

                        <button
                          onClick={() => void restore(t.id)}
                          disabled={restoring === t.id}
                          className="shrink-0 rounded border border-cream-400 px-2 py-1 text-xs text-cream-800 hover:bg-cream-200 disabled:opacity-50"
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

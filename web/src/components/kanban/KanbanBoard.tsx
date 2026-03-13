'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import NewTaskModal from './NewTaskModal';

type ColumnId = 'todo' | 'discussed' | 'done';

type RawStatus = 'done' | 'discussed' | 'triage' | 'todo' | 'doing' | (string & {});

type TaskTag = { id?: string; name: string; category: 'area' | 'topic' | (string & {}) };

type Task = {
  id: string;
  title: string;
  status: RawStatus;
  source_message_id?: string | null;
  summary?: string | null;
  source_email_date?: string | null;
  source_message_ts?: number | null;
  notes?: string | null;
  position?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  tags?: TaskTag[];
};

function normalizeStatus(status: RawStatus | null | undefined): ColumnId {
  if (status === 'done') return 'done';
  if (status === 'discussed') return 'discussed';
  return 'todo';
}

const columns: { id: ColumnId; title: string }[] = [
  { id: 'todo', title: 'To Do' },
  { id: 'discussed', title: 'Discussed' },
  { id: 'done', title: 'Done' },
];

export default function KanbanBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [archiveCount, setArchiveCount] = useState<number | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [showNewTask, setShowNewTask] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tasks', { cache: 'no-store' });
      const json = (await res.json()) as { ok: boolean; tasks?: Task[]; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setTasks(json.tasks ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }

    // Refresh archive count in background (best-effort).
    fetch('/api/archive', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: any) => { if (typeof j.total === 'number') setArchiveCount(j.total); })
      .catch(() => {});
  }

  async function addTask() {
    const t = title.trim();
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: t }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setTitle('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }

  async function patchStatus(taskId: string, status: 'todo' | 'discussed' | 'done' | 'archived') {
    const prev = tasks;

    // Optimistic UI
    if (status === 'archived') {
      setTasks((ts) => ts.filter((t) => t.id !== taskId));
    } else {
      setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, status } : t)));
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);

      await refresh();
    } catch (e) {
      setTasks(prev);
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }

  async function reorderTodo(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    // Compute new positions: splice dragged item before target in the current todo list.
    const todoTasks = tasks.filter((t) => String(t.status) === 'todo' || String(t.status) === 'triage' || String(t.status) === 'doing');
    const rest = todoTasks.filter((t) => t.id !== draggedId);
    const targetIdx = rest.findIndex((t) => t.id === targetId);
    const newOrder = [...rest];
    newOrder.splice(targetIdx === -1 ? rest.length : targetIdx, 0, todoTasks.find((t) => t.id === draggedId)!);
    // Assign sequential positions starting at 1.
    const posMap: Record<string, number> = {};
    newOrder.forEach((t, i) => { posMap[t.id] = i + 1; });
    // Optimistic update.
    setTasks((ts) => ts.map((t) => posMap[t.id] != null ? { ...t, position: posMap[t.id] } : t));
    // Persist all changed positions.
    await Promise.all(
      Object.entries(posMap).map(([id, position]) =>
        fetch(`/api/tasks/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ position }),
        })
      )
    );
  }

  async function saveEdit(taskId: string) {
    const t = editTitle.trim();
    if (!t) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: t, notes: editNotes.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      // Optimistic update in local state.
      setTasks((ts) => ts.map((tk) =>
        tk.id === taskId ? { ...tk, title: t, notes: editNotes.trim() || null } : tk
      ));
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditSaving(false);
    }
  }

  // Derive unique area tags across all loaded tasks for filter pills.
  const allAreaTags = useMemo(() => {
    const seen = new Set<string>();
    for (const t of tasks) {
      for (const tag of t.tags ?? []) {
        if (tag.category === 'area') seen.add(tag.name);
      }
    }
    return Array.from(seen).sort();
  }, [tasks]);

  // Apply tag filters client-side (show task if it has ANY of the active filters).
  const visibleTasks = useMemo(() => {
    if (activeFilters.size === 0) return tasks;
    return tasks.filter((t) =>
      (t.tags ?? []).some((tag) => activeFilters.has(tag.name))
    );
  }, [tasks, activeFilters]);

  const grouped = useMemo(() => {
    const g: Record<ColumnId, Task[]> = { todo: [], discussed: [], done: [] };
    for (const t of visibleTasks) {
      g[normalizeStatus(t.status)].push(t);
    }

    // Ensure stable, immediate UI ordering:
    // - To Do: position ASC (null last)
    // - Done: updated_at/created_at DESC
    g.todo.sort((a, b) => {
      const at = a.source_message_ts != null
        ? Number(a.source_message_ts)
        : a.source_email_date
          ? +new Date(String(a.source_email_date)) / 1000
          : (a.updated_at ?? a.created_at)
            ? +new Date(String(a.updated_at ?? a.created_at)) / 1000
            : 0;
      const bt = b.source_message_ts != null
        ? Number(b.source_message_ts)
        : b.source_email_date
          ? +new Date(String(b.source_email_date)) / 1000
          : (b.updated_at ?? b.created_at)
            ? +new Date(String(b.updated_at ?? b.created_at)) / 1000
            : 0;
      if (bt !== at) return bt - at; // newest first
      const aid = String(a.id ?? '');
      const bid = String(b.id ?? '');
      return bid.localeCompare(aid);
    });
    g.discussed.sort((a, b) => {
      const at = a.updated_at ?? a.created_at;
      const bt = b.updated_at ?? b.created_at;
      const an = at ? +new Date(String(at)) : 0;
      const bn = bt ? +new Date(String(bt)) : 0;
      return bn - an;
    });
    g.done.sort((a, b) => {
      const at = a.updated_at ?? a.created_at;
      const bt = b.updated_at ?? b.created_at;
      const an = at ? +new Date(String(at)) : 0;
      const bn = bt ? +new Date(String(bt)) : 0;
      return bn - an;
    });

    return g;
  }, [visibleTasks]);

  useEffect(() => {
    void refresh();
  }, []);

  // Support ?highlight=<taskId> from search: scroll + flash the card.
  const searchParams = useSearchParams();
  const highlightParam = searchParams?.get('highlight') ?? null;

  useEffect(() => {
    if (!highlightParam) return;
    setHighlightId(highlightParam);
    // Remove from URL without reload.
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('highlight');
      window.history.replaceState({}, '', url.toString());
    }
  }, [highlightParam]);

  // Scroll to highlighted card once tasks are loaded.
  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => {
      const el = cardRefs.current[highlightId];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const clear = setTimeout(() => setHighlightId(null), 2000);
      return () => clearTimeout(clear);
    }, 400);
    return () => clearTimeout(t);
  }, [highlightId, tasks]);

  return (
    <div className="space-y-4">
      {/* New Task modal */}
      {showNewTask ? (
        <NewTaskModal
          onClose={() => setShowNewTask(false)}
          onCreated={(task) => {
            // Optimistic insert into To Do.
            setTasks((ts) => [
              { id: task.id, title: task.title, status: 'todo', notes: task.notes ?? null, tags: task.tags },
              ...ts,
            ]);
            setShowNewTask(false);
          }}
        />
      ) : null}

      {/* Tag filter pills */}
      {allAreaTags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {allAreaTags.map((tag) => {
            const active = activeFilters.has(tag);
            return (
              <button
                key={tag}
                onClick={() =>
                  setActiveFilters((prev) => {
                    const next = new Set(prev);
                    if (next.has(tag)) next.delete(tag);
                    else next.add(tag);
                    return next;
                  })
                }
                className={
                  active
                    ? 'rounded-full border border-zinc-400 bg-zinc-200 px-3 py-1 text-xs font-medium text-zinc-900'
                    : 'rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                }
              >
                {tag}
              </button>
            );
          })}
          {activeFilters.size > 0 ? (
            <button
              onClick={() => setActiveFilters(new Set())}
              className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-500 hover:text-zinc-200"
            >
              Clear filters ×
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
          Failed to load: {error}
        </div>
      ) : null}

      <section className="flex items-start gap-4 overflow-x-auto pb-2">
        {columns.map((col) => (
          <div key={col.id} className="w-[400px] min-w-[400px] shrink-0 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium text-zinc-200">{col.title}</div>
                {col.id === 'todo' ? (
                  <button
                    onClick={() => setShowNewTask(true)}
                    className="rounded border border-zinc-700 px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    +
                  </button>
                ) : null}
              </div>
              <div className="text-xs text-zinc-500">{grouped[col.id].length}</div>
            </div>

            <div className="grid gap-2">
              {grouped[col.id].length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-800 p-3 text-sm text-zinc-500">
                  No tasks.
                </div>
              ) : null}

              {grouped[col.id].map((t) => {
                const current = normalizeStatus(t.status);
                const isExpanded = !!expanded[t.id];
                const tags = (t.tags ?? []).slice(0, 6);

                const inboxHref = t.source_message_id
                  ? `/inbox/${encodeURIComponent(String(t.source_message_id))}`
                  : null;

                return (
                  <div
                    key={t.id}
                    ref={(el) => { cardRefs.current[t.id] = el; }}
                    role="button"
                    tabIndex={0}
                    draggable={col.id === 'todo'}
                    onDragStart={() => { dragIdRef.current = t.id; }}
                    onDragEnd={() => { dragIdRef.current = null; setDragOverId(null); }}
                    onDragOver={(e) => { if (col.id === 'todo') { e.preventDefault(); setDragOverId(t.id); } }}
                    onDragLeave={() => setDragOverId(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverId(null);
                      const from = dragIdRef.current;
                      if (from && from !== t.id && col.id === 'todo') void reorderTodo(from, t.id);
                    }}
                    onClick={() => {
                      setExpanded((p) => {
                        const next = !p[t.id];
                        if (!next && editingId === t.id) setEditingId(null);
                        return { ...p, [t.id]: next };
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setExpanded((p) => {
                          const next = !p[t.id];
                          if (!next && editingId === t.id) setEditingId(null);
                          return { ...p, [t.id]: next };
                        });
                      }
                    }}
                    className={`cursor-pointer rounded-lg border p-4 hover:bg-zinc-900/60 ${
                      highlightId === t.id
                        ? 'border-zinc-400 bg-zinc-800 ring-2 ring-zinc-400 ring-offset-1 ring-offset-black transition-all duration-700'
                        : dragOverId === t.id
                        ? 'border-zinc-500 bg-zinc-800/60'
                        : 'border-zinc-800 bg-zinc-900/40'
                    }`}
                  >
                    {/* Collapsed header (always visible): title + tags + CTAs */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {isExpanded && editingId === t.id ? (
                          <input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void saveEdit(t.id); if (e.key === 'Escape') setEditingId(null); }}
                            className="w-full rounded border border-zinc-600 bg-zinc-800 px-1 py-0.5 text-base font-medium text-zinc-100 focus:outline-none"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div
                            className={`text-base font-medium text-zinc-100 ${isExpanded ? 'cursor-text rounded px-1 py-0.5 hover:bg-zinc-800/60' : ''}`}
                            onClick={isExpanded ? (e) => {
                              e.stopPropagation();
                              setEditTitle(t.title);
                              setEditNotes(t.notes ?? '');
                              setEditingId(t.id);
                            } : undefined}
                          >
                            {t.title}
                          </div>
                        )}
                        {t.source_message_ts != null ? (
                          <div className="mt-1 text-xs text-zinc-500">
                            Email: {new Date(Number(t.source_message_ts) * 1000).toLocaleString()}
                          </div>
                        ) : t.source_email_date ? (
                          <div className="mt-1 text-xs text-zinc-500">
                            Email: {new Date(String(t.source_email_date)).toLocaleString()}
                          </div>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {tags.map((tag) => (
                            <span
                              key={`${tag.category}:${tag.name}`}
                              className="rounded-full border border-zinc-700 bg-zinc-950/60 px-2 py-0.5 text-[11px] text-zinc-300"
                            >
                              {tag.name}
                            </span>
                          ))}
                          {isExpanded ? (
                            <InlineTagEditor
                              taskId={t.id}
                              tags={t.tags ?? []}
                              onChange={(nextTags) => {
                                setTasks((ts) => ts.map((tk) => (tk.id === t.id ? { ...tk, tags: nextTags } : tk)));
                              }}
                            />
                          ) : null}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {/* Back arrow: discussed→todo, done→discussed */}
                        {current === 'discussed' ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); void patchStatus(t.id, 'todo'); }}
                            title="Move to To Do"
                            className="rounded border border-zinc-700 p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
                            disabled={loading}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                          </button>
                        ) : current === 'done' ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); void patchStatus(t.id, 'discussed'); }}
                            title="Move to Discussed"
                            className="rounded border border-zinc-700 p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
                            disabled={loading}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                          </button>
                        ) : null}
                        {/* Forward: todo→discussed (speech bubble), discussed→done (checkmark) */}
                        {current === 'todo' ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); void patchStatus(t.id, 'discussed'); }}
                            title="Mark as Discussed"
                            className="rounded border border-zinc-700 p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-blue-400 disabled:opacity-50"
                            disabled={loading}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                          </button>
                        ) : null}
                        {current !== 'done' ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); void patchStatus(t.id, 'done'); }}
                            title="Mark as Done"
                            className="rounded border border-zinc-700 p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-emerald-400 disabled:opacity-50"
                            disabled={loading}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          </button>
                        ) : null}
                        <button
                          onClick={(e) => { e.stopPropagation(); void patchStatus(t.id, 'archived'); }}
                          title="Archive"
                          className="rounded border border-zinc-700 p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
                          disabled={loading}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>
                        </button>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded ? (
                      <div className="mt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                        {/* Notes: click to edit, or show textarea if editing */}
                        {editingId === t.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Escape') setEditingId(null); }}
                              rows={3}
                              className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 focus:outline-none"
                              placeholder="Notes (optional)"
                              autoFocus={!t.notes}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => void saveEdit(t.id)}
                                disabled={editSaving || !editTitle.trim()}
                                className="rounded border border-zinc-500 px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
                              >
                                {editSaving ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div
                              className="cursor-text rounded px-1 py-0.5 text-sm hover:bg-zinc-800/60"
                              onClick={() => {
                                setEditTitle(t.title);
                                setEditNotes(t.notes ?? '');
                                setEditingId(t.id);
                              }}
                            >
                              {t.notes ? (
                                <div className="text-zinc-300">
                                  <div className="text-xs font-medium text-zinc-500">Notes</div>
                                  <div className="mt-1 whitespace-pre-wrap">{t.notes}</div>
                                </div>
                              ) : (
                                <div className="text-xs text-zinc-500">Click to add notes…</div>
                              )}
                            </div>

                            {inboxHref ? (
                              <a
                                href={inboxHref}
                                className="inline-block text-sm text-zinc-200 underline underline-offset-4 hover:text-white"
                              >
                                View email →
                              </a>
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* Archive entry point */}
      <div className="pt-2 text-center">
        <a
          href="/archive"
          className="text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-300"
        >
          View Archive{archiveCount !== null ? ` (${archiveCount})` : ''}
        </a>
      </div>

    </div>
  );
}


function InlineTagEditor({
  taskId,
  tags,
  onChange,
}: {
  taskId: string;
  tags: TaskTag[];
  onChange: (tags: TaskTag[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [allTags, setAllTags] = useState<{ id: string; name: string; category: string }[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch('/api/tags')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setAllTags(j.tags ?? []);
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    function onPointerDown(e: PointerEvent) {
      const el = popRef.current;
      if (!el) return;
      const target = e.target as Node | null;
      if (target && !el.contains(target)) setOpen(false);
    }

    document.addEventListener('keydown', onKeyDown);
    // capture=true so it still fires even if inner handlers stopPropagation
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open]);

  const selectedIds = useMemo(() => {
    const s = new Set<string>();
    for (const t of tags) {
      if (t.id) s.add(String(t.id));
    }
    return s;
  }, [tags]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return allTags;
    return allTags.filter((t) =>
      t.name.toLowerCase().includes(qq) || t.category.toLowerCase().includes(qq)
    );
  }, [allTags, q]);

  async function toggle(tag: { id: string; name: string; category: string }) {
    const enabled = !selectedIds.has(tag.id);

    // Optimistic update local chips immediately.
    const prev = tags;
    const next: TaskTag[] = enabled
      ? [{ id: tag.id, name: tag.name, category: tag.category }, ...tags]
      : tags.filter((t) => String(t.id ?? '') !== tag.id);
    onChange(next);

    setSaving(tag.id);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/tags`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tagId: tag.id, enabled }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
    } catch {
      // rollback
      onChange(prev);
    } finally {
      setSaving(null);
    }
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((p) => !p); }}
        className="rounded-full border border-zinc-700 px-1.5 py-0.5 text-[11px] leading-none text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
        title="Add tag"
      >
        +
      </button>

      {open ? (
        <div
          ref={popRef}
          className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-zinc-800 bg-zinc-950 p-2 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tags…"
            className="mb-2 w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
          <div className="max-h-52 overflow-auto">
            {filtered.length === 0 ? (
              <div className="p-2 text-xs text-zinc-500">No tags found.</div>
            ) : (
              <div className="grid gap-1">
                {filtered.map((tag) => {
                  const sel = selectedIds.has(tag.id);
                  const busy = saving === tag.id;
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => void toggle(tag)}
                      disabled={!!saving}
                      className={
                        sel
                          ? 'flex items-center justify-between rounded border border-zinc-400 bg-zinc-200 px-2 py-1 text-xs font-medium text-zinc-900'
                          : 'flex items-center justify-between rounded border border-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-600'
                      }
                    >
                      <span className="truncate">{tag.name}</span>
                      <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wider opacity-70">
                        {busy ? '…' : sel ? 'ON' : tag.category}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </span>
  );
}

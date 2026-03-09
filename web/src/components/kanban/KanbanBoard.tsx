'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import NewTaskModal from './NewTaskModal';

type ColumnId = 'todo' | 'done' | 'resolved';

type RawStatus = 'done' | 'triage' | 'todo' | 'doing' | (string & {});

type TaskTag = { id?: string; name: string; category: 'area' | 'topic' | (string & {}) };

type Task = {
  id: string;
  title: string;
  status: RawStatus;
  source_message_id?: string | null;
  summary?: string | null;
  source_email_date?: string | null;
  notes?: string | null;
  position?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  tags?: TaskTag[];
};

function normalizeStatus(status: RawStatus | null | undefined): ColumnId {
  if (status === 'done') return 'done';
  return 'todo';
}

const columns: { id: ColumnId; title: string }[] = [
  { id: 'todo', title: 'To Do' },
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
  const [undo, setUndo] = useState<null | { taskId: string; prevStatus: ColumnId }>(null);
  const undoTimerRef = useRef<number | null>(null);

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

  async function patchStatus(taskId: string, status: 'todo' | 'done' | 'archived' | 'resolved') {
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

  async function move(taskId: string, to: ColumnId) {
    await patchStatus(taskId, to);
  }

  function showUndo(taskId: string, prevStatus: ColumnId) {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    setUndo({ taskId, prevStatus });
    undoTimerRef.current = window.setTimeout(() => setUndo(null), 8000);
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
    const g: Record<ColumnId, Task[]> = { todo: [], resolved: [], done: [] };
    for (const t of visibleTasks) {
      g[normalizeStatus(t.status)].push(t);
    }

    // Ensure stable, immediate UI ordering:
    // - To Do: position ASC (null last)
    // - Done: updated_at/created_at DESC
    g.todo.sort((a, b) => {
      const ap = a.position != null ? Number(a.position) : Infinity;
      const bp = b.position != null ? Number(b.position) : Infinity;
      return ap - bp;
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
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowNewTask(true)}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-800"
        >
          ＋ New Task
        </button>
        <button
          onClick={() => void refresh()}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800"
          disabled={loading}
        >
          Refresh
        </button>
      </div>

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
          Kanban failed to load: {error}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {columns.map((col) => (
          <div key={col.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium text-zinc-200">{col.title}</div>
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

                let date = '';
                if (t.source_email_date) {
                  try {
                    date = new Date(String(t.source_email_date)).toLocaleString();
                  } catch {
                    date = String(t.source_email_date);
                  }
                }

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
                    onClick={() => setExpanded((p) => ({ ...p, [t.id]: !p[t.id] }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setExpanded((p) => ({ ...p, [t.id]: !p[t.id] }));
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
                        <div className="text-base font-medium text-zinc-100">{t.title}</div>
                        {tags.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {tags.map((tag) => (
                              <span
                                key={`${tag.category}:${tag.name}`}
                                className="rounded-full border border-zinc-700 bg-zinc-950/60 px-2 py-0.5 text-[11px] text-zinc-300"
                              >
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 flex-col gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void patchStatus(t.id, 'done');
                          }}
                          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                          disabled={loading || current === 'done'}
                        >
                          Mark as Done
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void patchStatus(t.id, 'archived');
                          }}
                          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                          disabled={loading}
                        >
                          Archive
                        </button>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded ? (
                      <div className="mt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                        {editingId === t.id ? (
                          /* Inline edit form */
                          <div className="space-y-2">
                            <input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 focus:outline-none"
                              placeholder="Title"
                              autoFocus
                            />
                            <textarea
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              rows={3}
                              className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 focus:outline-none"
                              placeholder="Notes (optional)"
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
                          /* Read-only expanded view */
                          <>
                            <button
                              onClick={() => {
                                setEditTitle(t.title);
                                setEditNotes(t.notes ?? '');
                                setEditingId(t.id);
                              }}
                              className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                            >
                              Edit
                            </button>

                            {/* Inline tag editor */}
                            <InlineTagEditor
                              taskId={t.id}
                              tags={t.tags ?? []}
                              onChange={(nextTags) => {
                                setTasks((ts) => ts.map((tk) => (tk.id === t.id ? { ...tk, tags: nextTags } : tk)));
                              }}
                            />

                            {t.summary ? (
                              <div className="text-sm text-zinc-300">
                                <div className="text-xs font-medium text-zinc-500">Summary</div>
                                <div className="mt-1 whitespace-pre-wrap">{t.summary}</div>
                              </div>
                            ) : null}

                            {t.notes ? (
                              <div className="text-sm text-zinc-300">
                                <div className="text-xs font-medium text-zinc-500">Notes</div>
                                <div className="mt-1 whitespace-pre-wrap">{t.notes}</div>
                              </div>
                            ) : null}

                            {date ? (
                              <div className="text-sm text-zinc-300">
                                <span className="text-xs font-medium text-zinc-500">Email sent:</span>{' '}
                                {date}
                              </div>
                            ) : null}

                            {inboxHref ? (
                              <a
                                href={inboxHref}
                                className="inline-block text-sm text-zinc-200 underline underline-offset-4 hover:text-white"
                              >
                                View email →
                              </a>
                            ) : null}

                            <div className="flex flex-wrap gap-2 pt-1">
                              {columns
                                .filter((c) => c.id !== current)
                                .map((c) => (
                                  <button
                                    key={c.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void move(t.id, c.id);
                                    }}
                                    className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                                    disabled={loading}
                                  >
                                    Move to {c.title}
                                  </button>
                                ))}
                            </div>
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

  const visibleChips = (tags ?? []).slice(0, 12);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {visibleChips.map((t) => (
          <span
            key={`${t.id ?? t.name}-${t.name}`}
            className="rounded-full border border-zinc-700 bg-zinc-950/60 px-2 py-0.5 text-[10px] text-zinc-400"
          >
            {t.name}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
        >
          ＋ tag
        </button>
      </div>

      {open ? (
        <div
          ref={popRef}
          className="rounded-lg border border-zinc-800 bg-zinc-950 p-2"
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
    </div>
  );
}

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
    const todoTasks = tasks.filter((t) => String(t.status) === 'todo' || String(t.status) === 'triage' || String(t.status) === 'doing');
    const rest = todoTasks.filter((t) => t.id !== draggedId);
    const targetIdx = rest.findIndex((t) => t.id === targetId);
    const newOrder = [...rest];
    newOrder.splice(targetIdx === -1 ? rest.length : targetIdx, 0, todoTasks.find((t) => t.id === draggedId)!);
    const posMap: Record<string, number> = {};
    newOrder.forEach((t, i) => { posMap[t.id] = i + 1; });
    setTasks((ts) => ts.map((t) => posMap[t.id] != null ? { ...t, position: posMap[t.id] } : t));
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

  const allAreaTags = useMemo(() => {
    const seen = new Set<string>();
    for (const t of tasks) {
      for (const tag of t.tags ?? []) {
        if (tag.category === 'area') seen.add(tag.name);
      }
    }
    return Array.from(seen).sort();
  }, [tasks]);

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
      if (bt !== at) return bt - at;
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

  const searchParams = useSearchParams();
  const highlightParam = searchParams?.get('highlight') ?? null;

  useEffect(() => {
    if (!highlightParam) return;
    setHighlightId(highlightParam);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('highlight');
      window.history.replaceState({}, '', url.toString());
    }
  }, [highlightParam]);

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
      {showNewTask ? (
        <NewTaskModal
          onClose={() => setShowNewTask(false)}
          onCreated={(task) => {
            setTasks((ts) => [
              { id: task.id, title: task.title, status: 'todo', notes: task.notes ?? null, tags: task.tags, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
              ...ts,
            ]);
            setShowNewTask(false);
          }}
        />
      ) : null}

      {/* Tag filter pills */}
      <div className="flex flex-wrap items-center gap-2">
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
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                active
                  ? 'bg-wood-500 text-white'
                  : 'bg-cream-200 text-cream-900 hover:bg-cream-300 hover:text-cream-950'
              }`}
            >
              {tag}
            </button>
          );
        })}
        {activeFilters.size > 0 ? (
          <button
            onClick={() => setActiveFilters(new Set())}
            className="rounded-full bg-cream-200 px-3 py-1 text-xs text-cream-600 transition-colors hover:bg-cream-300 hover:text-cream-900"
          >
            Clear filters ×
          </button>
        ) : null}
        <CreateTagButton onCreated={() => void refresh()} />
      </div>

      {error ? (
        <div className="rounded-xl border border-terra-400/30 bg-terra-400/10 p-4 text-sm text-terra-600">
          Failed to load: {error}
        </div>
      ) : null}

      <section className="flex items-start gap-4 overflow-x-auto pb-2">
        {columns.map((col) => (
          <div key={col.id} className="w-[400px] min-w-[400px] shrink-0 rounded-xl border border-cream-400/60 bg-cream-100/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium text-cream-900">{col.title}</div>
                {col.id === 'todo' ? (
                  <button
                    onClick={() => setShowNewTask(true)}
                    className="rounded border border-cream-400 px-1.5 py-0.5 text-xs text-cream-700 hover:bg-cream-300 hover:text-cream-900"
                  >
                    +
                  </button>
                ) : null}
              </div>
              <div className="text-xs text-cream-600">{grouped[col.id].length}</div>
            </div>

            <div className="grid gap-2">
              {grouped[col.id].length === 0 ? (
                <div className="rounded-lg border border-dashed border-cream-400 p-3 text-sm text-cream-600">
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
                    className={`cursor-pointer rounded-lg border p-4 shadow-warm transition-all hover:shadow-warm-md ${
                      highlightId === t.id
                        ? 'border-wood-500 bg-white ring-2 ring-wood-400 ring-offset-1 ring-offset-cream-200 transition-all duration-700'
                        : dragOverId === t.id
                        ? 'border-cream-500 bg-cream-50'
                        : 'border-cream-400/60 bg-white'
                    }`}
                  >
                    {/* Collapsed header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {isExpanded && editingId === t.id ? (
                          <input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void saveEdit(t.id); if (e.key === 'Escape') setEditingId(null); }}
                            className="w-full rounded border border-cream-400 bg-cream-50 px-1 py-0.5 text-base font-medium text-cream-950 focus:outline-none focus:border-wood-500"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div
                            className={`text-base font-medium text-cream-950 ${isExpanded ? 'cursor-text rounded px-1 py-0.5 hover:bg-cream-200/60' : ''}`}
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
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {tags.map((tag) => (
                            <span
                              key={`${tag.category}:${tag.name}`}
                              className="rounded-full border border-cream-400 bg-cream-200 px-2 py-0.5 text-[11px] text-cream-950"
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
                        {current === 'discussed' ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); void patchStatus(t.id, 'todo'); }}
                            title="Move to To Do"
                            className="rounded border border-cream-400 p-1.5 text-cream-600 hover:bg-cream-200 hover:text-cream-900 disabled:opacity-50"
                            disabled={loading}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                          </button>
                        ) : current === 'done' ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); void patchStatus(t.id, 'discussed'); }}
                            title="Move to Discussed"
                            className="rounded border border-cream-400 p-1.5 text-cream-600 hover:bg-cream-200 hover:text-cream-900 disabled:opacity-50"
                            disabled={loading}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                          </button>
                        ) : null}
                        {current === 'todo' ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); void patchStatus(t.id, 'discussed'); }}
                            title="Mark as Discussed"
                            className="rounded border border-cream-400 p-1.5 text-cream-600 hover:bg-cream-200 hover:text-wood-600 disabled:opacity-50"
                            disabled={loading}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>
                          </button>
                        ) : null}
                        {current !== 'done' ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); void patchStatus(t.id, 'done'); }}
                            title="Mark as Done"
                            className="rounded border border-cream-400 p-1.5 text-cream-600 hover:bg-cream-200 hover:text-sage-600 disabled:opacity-50"
                            disabled={loading}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          </button>
                        ) : null}
                        <button
                          onClick={(e) => { e.stopPropagation(); void patchStatus(t.id, 'archived'); }}
                          title="Archive"
                          className="rounded border border-cream-400 p-1.5 text-cream-600 hover:bg-cream-200 hover:text-cream-900 disabled:opacity-50"
                          disabled={loading}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>
                        </button>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded ? (
                      <div className="mt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                        {editingId === t.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Escape') setEditingId(null); }}
                              rows={3}
                              className="w-full rounded border border-cream-400 bg-cream-50 px-2 py-1 text-sm text-cream-950 focus:outline-none focus:border-wood-500"
                              placeholder="Notes (optional)"
                              autoFocus={!t.notes}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => void saveEdit(t.id)}
                                disabled={editSaving || !editTitle.trim()}
                                className="rounded border border-cream-500 px-2 py-1 text-xs text-cream-900 hover:bg-cream-200 disabled:opacity-50"
                              >
                                {editSaving ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="rounded border border-cream-400 px-2 py-1 text-xs text-cream-700 hover:bg-cream-200"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div
                              className="cursor-text rounded px-1 py-0.5 text-sm hover:bg-cream-200/60"
                              onClick={() => {
                                setEditTitle(t.title);
                                setEditNotes(t.notes ?? '');
                                setEditingId(t.id);
                              }}
                            >
                              {t.notes ? (
                                <div className="text-cream-800">
                                  <div className="text-xs font-medium text-cream-600">Notes</div>
                                  <div className="mt-1 whitespace-pre-wrap">{t.notes}</div>
                                </div>
                              ) : (
                                <div className="text-xs text-cream-600">Click to add notes…</div>
                              )}
                            </div>

                            {inboxHref ? (
                              <a
                                href={inboxHref}
                                className="inline-block text-sm text-wood-600 underline underline-offset-4 hover:text-wood-700"
                              >
                                View email →
                              </a>
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : null}

                    {(() => {
                      const d = t.source_email_date
                        ? new Date(String(t.source_email_date))
                        : t.source_message_ts != null
                          ? new Date(Number(t.source_message_ts) * 1000)
                          : t.created_at
                            ? new Date(String(t.created_at))
                            : null;
                      return d ? (
                        <div className="mt-2 text-right text-[11px] text-cream-500">
                          {d.toLocaleDateString()}
                        </div>
                      ) : null;
                    })()}
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
          className="text-sm text-cream-600 underline underline-offset-4 hover:text-cream-900"
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
        className="rounded-full border border-cream-400 px-1.5 py-0.5 text-[11px] leading-none text-cream-700 hover:border-cream-500 hover:text-cream-900"
        title="Add tag"
      >
        +
      </button>

      {open ? (
        <div
          ref={popRef}
          className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-cream-400 bg-white p-2 shadow-warm-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tags…"
            className="mb-2 w-full rounded border border-cream-400 bg-cream-50 px-2 py-1 text-xs text-cream-950 placeholder:text-cream-600 focus:outline-none focus:border-wood-500"
          />
          <div className="max-h-52 overflow-auto">
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
                        ? 'flex items-center justify-between rounded border border-wood-500 bg-wood-500 px-2 py-1 text-xs font-medium text-white'
                        : 'flex items-center justify-between rounded border border-cream-300 px-2 py-1 text-xs text-cream-800 hover:border-cream-500'
                    }
                  >
                    <span className="truncate">{tag.name}</span>
                    <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wider opacity-70">
                      {busy ? '…' : sel ? 'ON' : tag.category}
                    </span>
                  </button>
                );
              })}
              {q.trim() && !allTags.some((t) => t.name.toLowerCase() === q.trim().toLowerCase()) ? (
                <button
                  type="button"
                  onClick={async () => {
                    const name = q.trim();
                    if (!name) return;
                    setSaving('__new__');
                    try {
                      const res = await fetch('/api/tags', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ name, category: 'area' }),
                      });
                      const json = await res.json();
                      if (json.ok && json.tag) {
                        const newTag = json.tag;
                        setAllTags((prev) => [...prev, newTag]);
                        setQ('');
                        void toggle(newTag);
                      }
                    } finally {
                      setSaving(null);
                    }
                  }}
                  disabled={!!saving}
                  className="flex items-center gap-1.5 rounded border border-dashed border-wood-400 px-2 py-1 text-xs text-wood-700 hover:bg-wood-50"
                >
                  <span>+</span>
                  <span>Create &ldquo;{q.trim()}&rdquo;</span>
                </button>
              ) : null}
              {filtered.length === 0 && !q.trim() ? (
                <div className="p-2 text-xs text-cream-600">No tags found.</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </span>
  );
}


function CreateTagButton({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'area' | 'topic' | 'feature'>('area');
  const [saving, setSaving] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

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
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open]);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed, category }),
      });
      const json = await res.json();
      if (json.ok) {
        setName('');
        setOpen(false);
        onCreated();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="rounded-full border border-dashed border-cream-500 px-3 py-1 text-xs text-cream-600 transition-colors hover:border-wood-500 hover:text-wood-700"
        title="Create new tag"
      >
        + New tag
      </button>

      {open ? (
        <div
          ref={popRef}
          className="absolute left-0 top-full z-20 mt-1 w-60 rounded-lg border border-cream-400 bg-white p-3 shadow-warm-lg"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void create(); }}
            placeholder="Tag name…"
            className="mb-2 w-full rounded border border-cream-400 bg-cream-50 px-2 py-1.5 text-xs text-cream-950 placeholder:text-cream-600 focus:outline-none focus:border-wood-500"
            autoFocus
          />
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => setCategory('area')}
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                category === 'area'
                  ? 'bg-wood-500 text-white'
                  : 'border border-cream-300 text-cream-700 hover:border-cream-500'
              }`}
            >
              Area
            </button>
            <button
              type="button"
              onClick={() => setCategory('topic')}
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                category === 'topic'
                  ? 'bg-wood-500 text-white'
                  : 'border border-cream-300 text-cream-700 hover:border-cream-500'
              }`}
            >
              Topic
            </button>
            <button
              type="button"
              onClick={() => setCategory('feature')}
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                category === 'feature'
                  ? 'bg-wood-500 text-white'
                  : 'border border-cream-300 text-cream-700 hover:border-cream-500'
              }`}
            >
              Feature
            </button>
          </div>
          <button
            type="button"
            onClick={() => void create()}
            disabled={saving || !name.trim()}
            className="w-full rounded bg-wood-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-wood-600 disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create tag'}
          </button>
        </div>
      ) : null}
    </span>
  );
}

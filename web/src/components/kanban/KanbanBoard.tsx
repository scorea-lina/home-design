'use client';

import { useEffect, useMemo, useState } from 'react';

type ColumnId = 'triage' | 'todo' | 'doing' | 'done';

type Task = {
  id: string;
  title: string;
  status: ColumnId;
  source_message_id?: string | null;
  notes?: string | null;
};

const columns: { id: ColumnId; title: string }[] = [
  { id: 'triage', title: 'Triage' },
  { id: 'todo', title: 'To Do' },
  { id: 'doing', title: 'Doing' },
  { id: 'done', title: 'Done' },
];

export default function KanbanBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');

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

  async function move(taskId: string, to: ColumnId) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: to }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }

  const grouped = useMemo(() => {
    const g: Record<ColumnId, Task[]> = { triage: [], todo: [], doing: [], done: [] };
    for (const t of tasks) g[t.status ?? 'triage'].push(t);
    return g;
  }, [tasks]);

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Quick add…"
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 md:w-[360px]"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void addTask();
          }}
        />
        <button
          onClick={() => void addTask()}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800"
          disabled={loading}
        >
          Add task
        </button>
        <button
          onClick={() => void refresh()}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800"
          disabled={loading}
        >
          Refresh
        </button>
        <div className="text-xs text-zinc-500">Backed by Supabase `public.tasks`.</div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
          Kanban failed to load: {error}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
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

              {grouped[col.id].map((t) => (
                <div key={t.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                  <div className="text-sm text-zinc-100">{t.title}</div>
                  {t.source_message_id ? (
                    <div className="mt-1 text-xs text-zinc-500">Source: inbox</div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {columns
                      .filter((c) => c.id !== t.status)
                      .map((c) => (
                        <button
                          key={c.id}
                          onClick={() => void move(t.id, c.id)}
                          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                          disabled={loading}
                        >
                          Move to {c.title}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

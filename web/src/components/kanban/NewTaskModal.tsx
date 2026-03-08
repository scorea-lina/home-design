'use client';

import { useEffect, useRef, useState } from 'react';

type Tag = { id: string; name: string; category: string };

export default function NewTaskModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (task: { id: string; title: string; notes?: string | null; tags: Tag[] }) => void;
}) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    fetch('/api/tags').then((r) => r.json()).then((j) => {
      if (j.ok) setAllTags(j.tags ?? []);
    }).catch(() => {});
  }, []);

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) { setError('Title is required.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: t, notes: notes.trim() || null, tags: Array.from(selectedTagIds) }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const selectedTags = allTags.filter((tg) => selectedTagIds.has(tg.id));
      onCreated({ id: json.id, title: t, notes: notes.trim() || null, tags: selectedTags });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  const areas = allTags.filter((t) => t.category === 'area');
  const topics = allTags.filter((t) => t.category === 'topic');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">New Task</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">✕</button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">Title <span className="text-red-400">*</span></label>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title…"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
            />
          </div>

          {/* Tags */}
          {allTags.length > 0 ? (
            <div>
              <label className="mb-2 block text-xs font-medium text-zinc-400">Tags</label>
              {areas.length > 0 ? (
                <div className="mb-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-600">Areas</div>
                  <div className="flex flex-wrap gap-1.5">
                    {areas.map((tag) => {
                      const sel = selectedTagIds.has(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => setSelectedTagIds((p) => {
                            const n = new Set(p);
                            sel ? n.delete(tag.id) : n.add(tag.id);
                            return n;
                          })}
                          className={sel
                            ? 'rounded-full border border-zinc-400 bg-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-900'
                            : 'rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:border-zinc-500'}
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {topics.length > 0 ? (
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-600">Topics</div>
                  <div className="flex flex-wrap gap-1.5">
                    {topics.map((tag) => {
                      const sel = selectedTagIds.has(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => setSelectedTagIds((p) => {
                            const n = new Set(p);
                            sel ? n.delete(tag.id) : n.add(tag.id);
                            return n;
                          })}
                          className={sel
                            ? 'rounded-full border border-zinc-400 bg-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-900'
                            : 'rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:border-zinc-500'}
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">Notes <span className="text-zinc-600">(optional)</span></label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes or context…"
              rows={3}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
            />
          </div>

          {error ? <div className="text-sm text-red-400">{error}</div> : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

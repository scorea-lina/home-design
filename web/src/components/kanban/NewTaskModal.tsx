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
      className="fixed inset-0 z-50 flex items-center justify-center bg-cream-950/30 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-cream-400/60 bg-white p-6 shadow-warm-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-cream-950">New Task</h2>
          <button onClick={onClose} className="text-cream-600 hover:text-cream-900">✕</button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-cream-700">Title <span className="text-terra-500">*</span></label>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title…"
              className="w-full rounded-lg border border-cream-400 bg-cream-50 px-3 py-2 text-sm text-cream-950 placeholder:text-cream-600 focus:border-wood-500 focus:outline-none"
            />
          </div>

          {allTags.length > 0 ? (
            <div>
              <label className="mb-2 block text-xs font-medium text-cream-700">Tags</label>
              {areas.length > 0 ? (
                <div className="mb-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-cream-600">Areas</div>
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
                            ? 'rounded-full border border-wood-500 bg-wood-500 px-2 py-0.5 text-[11px] font-medium text-white'
                            : 'rounded-full border border-cream-400 px-2 py-0.5 text-[11px] text-cream-700 hover:border-cream-500'}
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
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-cream-600">Topics</div>
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
                            ? 'rounded-full border border-wood-500 bg-wood-500 px-2 py-0.5 text-[11px] font-medium text-white'
                            : 'rounded-full border border-cream-400 px-2 py-0.5 text-[11px] text-cream-700 hover:border-cream-500'}
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

          <div>
            <label className="mb-1 block text-xs font-medium text-cream-700">Notes <span className="text-cream-600">(optional)</span></label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes or context…"
              rows={3}
              className="w-full rounded-lg border border-cream-400 bg-cream-50 px-3 py-2 text-sm text-cream-950 placeholder:text-cream-600 focus:border-wood-500 focus:outline-none"
            />
          </div>

          {error ? <div className="text-sm text-terra-500">{error}</div> : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-cream-400 px-4 py-2 text-sm text-cream-800 hover:bg-cream-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-wood-500 px-4 py-2 text-sm font-medium text-white hover:bg-wood-600 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

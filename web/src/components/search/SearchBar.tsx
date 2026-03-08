'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type TaskTag = { name: string; category: string };

type SearchResult =
  | { kind: 'task'; id: string; title: string; status: string; summary: string | null; source_message_id: string | null; tags: TaskTag[] }
  | { kind: 'email'; id: string; title: string; from: string; ts: string | null };

function statusBadge(status: string) {
  const cls =
    status === 'done'
      ? 'bg-emerald-900/60 text-emerald-300 border-emerald-800'
      : 'bg-zinc-800 text-zinc-300 border-zinc-700';
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {status === 'done' ? 'Done' : 'To Do'}
    </span>
  );
}

export default function SearchBar({ onTaskSelect }: { onTaskSelect?: (taskId: string) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
        const json = await res.json();
        setResults(json.results ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Close dropdown on outside click.
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  function handleTaskClick(id: string) {
    setOpen(false);
    setQuery('');
    if (onTaskSelect) {
      onTaskSelect(id);
    } else {
      router.push(`/?highlight=${encodeURIComponent(id)}`);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        placeholder="Search tasks…"
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
      />
      {loading ? (
        <div className="absolute right-2 top-2.5 text-xs text-zinc-500">…</div>
      ) : null}

      {open && results.length > 0 ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[360px] max-w-lg overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
          {results.map((r, i) => (
            <div
              key={`${r.kind}:${r.id}:${i}`}
              role="button"
              tabIndex={0}
              onClick={() =>
                r.kind === 'task'
                  ? handleTaskClick(r.id)
                  : window.open(`/inbox/${encodeURIComponent(r.id)}`, '_self')
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  r.kind === 'task'
                    ? handleTaskClick(r.id)
                    : window.open(`/inbox/${encodeURIComponent(r.id)}`, '_self');
                }
              }}
              className="cursor-pointer border-b border-zinc-800 px-4 py-3 hover:bg-zinc-800 last:border-0"
            >
              {r.kind === 'task' ? (
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-100">{r.title}</span>
                    {statusBadge(r.status)}
                  </div>
                  {r.tags.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {r.tags.slice(0, 5).map((t) => (
                        <span
                          key={`${t.category}:${t.name}`}
                          className="rounded-full border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400"
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {r.summary ? (
                    <div className="mt-1 line-clamp-1 text-xs text-zinc-500">{r.summary}</div>
                  ) : null}
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">Email</span>
                    <span className="text-sm font-medium text-zinc-100">{r.title}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">From: {r.from}</div>
                </div>
              )}
            </div>
          ))}
          {results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-zinc-500">No results for "{query}"</div>
          ) : null}
        </div>
      ) : open && !loading ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 shadow-2xl">
          <span className="text-sm text-zinc-500">No results for &ldquo;{query}&rdquo;</span>
        </div>
      ) : null}
    </div>
  );
}

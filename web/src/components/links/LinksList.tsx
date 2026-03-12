"use client";

import { useEffect, useMemo, useState } from "react";

type LinkRow = {
  id: string;
  source_message_id: string;
  url: string;
  title: string | null;
  description: string | null;
  created_at: string;
};

export function LinksList() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        setError(null);
        setWarning(null);

        const res = await fetch("/api/links", { cache: "no-store" });
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json?.error || `HTTP ${res.status}`);
        }

        if (!cancelled) {
          setWarning(typeof json?.warning === "string" ? json.warning : null);
          setLinks(Array.isArray(json?.links) ? json.links : []);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const emptyState = useMemo(() => {
    if (loading) return null;
    if (error) return null;
    if (links.length > 0) return null;
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4 text-sm text-zinc-300">
        No links yet.
      </div>
    );
  }, [error, links.length, loading]);

  return (
    <div className="space-y-3">
      {loading ? <div className="text-sm text-zinc-400">Loading…</div> : null}
      {error ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-200">
          Failed to load links: {error}
        </div>
      ) : null}
      {warning ? (
        <div className="rounded-lg border border-yellow-900/60 bg-yellow-950/30 p-4 text-sm text-yellow-200">
          Warning: {warning}
        </div>
      ) : null}

      {emptyState}

      {links.length > 0 ? (
        <ul className="space-y-2">
          {links.map((l) => (
            <li key={l.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
              <a className="text-zinc-100 underline" href={l.url} target="_blank" rel="noreferrer">
                {l.title || l.url}
              </a>
              <div className="mt-1 text-xs text-zinc-500">{new Date(l.created_at).toLocaleString()}</div>
              {l.description ? <div className="mt-2 text-sm text-zinc-300">{l.description}</div> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

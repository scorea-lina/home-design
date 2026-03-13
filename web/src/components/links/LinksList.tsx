"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LinkDrawer } from "./LinkDrawer";

export type TagInfo = {
  id: string;
  name: string;
  category: string;
};

export type LinkRow = {
  id: string;
  source_message_id: string;
  url: string;
  title: string | null;
  description: string | null;
  summary: string | null;
  notes: string | null;
  og_image_url: string | null;
  hostname: string;
  sender_name: string | null;
  sender_email: string | null;
  archived_at: string | null;
  created_at: string;
  tags: TagInfo[];
};

export function LinksList({ archived = false }: { archived?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [selectedLink, setSelectedLink] = useState<LinkRow | null>(null);
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    try {
      setError(null);
      const qs = archived ? "?archived=1" : "";
      const res = await fetch(`/api/links${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setLinks(Array.isArray(json?.links) ? json.links : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [archived]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const allTags = useMemo(() => {
    const map = new Map<string, TagInfo>();
    for (const link of links) {
      for (const tag of link.tags) {
        map.set(tag.id, tag);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [links]);

  const filteredLinks = useMemo(() => {
    if (!filterTag) return links;
    return links.filter((l) => l.tags.some((t) => t.id === filterTag));
  }, [links, filterTag]);

  return (
    <>
      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilterTag(null)}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              !filterTag
                ? "bg-wood-500 text-white"
                : "bg-cream-200 text-cream-900 hover:bg-cream-300 hover:text-cream-950"
            }`}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => setFilterTag(filterTag === tag.id ? null : tag.id)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                filterTag === tag.id
                  ? "bg-wood-500 text-white"
                  : "bg-cream-200 text-cream-900 hover:bg-cream-300 hover:text-cream-950"
              }`}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}

      {loading && <div className="text-sm text-cream-700">Loading...</div>}
      {error && (
        <div className="mb-4 rounded-lg border border-terra-400/30 bg-terra-400/10 p-4 text-sm text-terra-600">
          Failed to load links: {error}
        </div>
      )}

      {!loading && filteredLinks.length === 0 && !error && (
        <div className="rounded-lg border border-cream-400/60 bg-cream-100/50 p-4 text-sm text-cream-800">
          {archived ? "No archived links." : "No links yet."}
        </div>
      )}

      {filteredLinks.length > 0 && (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
          {filteredLinks.map((link) => (
            <div
              key={link.id}
              className="mb-4 break-inside-avoid cursor-pointer overflow-hidden rounded-xl border border-cream-400/60 bg-white shadow-warm transition-all hover:shadow-warm-md hover:border-cream-500"
              onClick={() => setSelectedLink(link)}
            >
              {link.og_image_url && (
                <img
                  src={link.og_image_url}
                  alt=""
                  className="w-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}

              <div className="p-4 space-y-2">
                <div className="text-sm font-medium text-cream-950 line-clamp-2">
                  {link.title || link.hostname || link.url}
                </div>

                {link.summary && (
                  <div className="text-xs text-cream-700 line-clamp-3">{link.summary}</div>
                )}

                {!link.summary && link.description && (
                  <div className="text-xs text-cream-700 line-clamp-2">{link.description}</div>
                )}

                {link.hostname && link.title && link.title !== link.hostname && (
                  <div className="text-xs text-cream-600">{link.hostname}</div>
                )}

                {link.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {link.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag.id}
                        className="rounded-full bg-cream-200 px-1.5 py-0.5 text-[10px] text-cream-900"
                      >
                        {tag.name}
                      </span>
                    ))}
                    {link.tags.length > 4 && (
                      <span className="text-[10px] text-cream-600">+{link.tags.length - 4}</span>
                    )}
                  </div>
                )}

                {link.notes && (
                  <div className="text-xs italic text-cream-600 line-clamp-1">{link.notes}</div>
                )}

                <div className="flex items-center justify-between text-[11px] text-cream-600">
                  <span>{link.sender_name || link.sender_email || ""}</span>
                  <span>{new Date(link.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedLink && (
        <LinkDrawer
          link={selectedLink}
          onClose={() => setSelectedLink(null)}
          onUpdate={fetchLinks}
        />
      )}
    </>
  );
}

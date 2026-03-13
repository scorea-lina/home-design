"use client";

import { useCallback, useEffect, useState } from "react";
import type { LinkRow, TagInfo } from "./LinksList";

type Props = {
  link: LinkRow;
  onClose: () => void;
  onUpdate: () => Promise<void>;
};

export function LinkDrawer({ link, onClose, onUpdate }: Props) {
  const [notes, setNotes] = useState(link.notes ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [allTags, setAllTags] = useState<TagInfo[]>([]);
  const [tagSearch, setTagSearch] = useState("");

  useEffect(() => {
    fetch("/api/tags", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (Array.isArray(json?.tags)) setAllTags(json.tags);
      })
      .catch(() => {});
  }, []);

  const handleSaveNotes = useCallback(async () => {
    setSaving(true);
    try {
      await fetch(`/api/links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      await onUpdate();
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }, [link.id, notes, onUpdate]);

  const handleArchive = useCallback(async () => {
    await fetch(`/api/links/${link.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived_at: link.archived_at ? null : new Date().toISOString() }),
    });
    await onUpdate();
    onClose();
  }, [link.id, link.archived_at, onUpdate, onClose]);

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-cream-950/10" onClick={onClose} />

      <div className="flex h-full w-full max-w-xl flex-col border-l border-cream-400/60 bg-white shadow-warm-xl">
        <div className="flex items-center justify-between border-b border-cream-300 p-4">
          <h2 className="text-lg font-semibold text-cream-950 line-clamp-1">
            {link.title || link.hostname || "Link Detail"}
          </h2>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-cream-600 hover:bg-cream-200 hover:text-cream-900"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="block rounded-lg border border-cream-400/60 bg-cream-50 p-3 text-sm text-wood-600 underline hover:border-cream-500 hover:text-wood-700 break-all"
          >
            {link.url}
          </a>

          {link.summary && (
            <div className="text-sm text-cream-800">{link.summary}</div>
          )}

          {link.description && (
            <div className="text-sm text-cream-700">{link.description}</div>
          )}

          <div className="flex gap-2">
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-wood-500 px-4 py-2 text-sm font-medium text-white hover:bg-wood-600"
            >
              Open Link
            </a>
            <button
              onClick={handleArchive}
              className="rounded-lg border border-cream-400 bg-cream-100 px-4 py-2 text-sm text-cream-800 hover:bg-cream-200"
            >
              {link.archived_at ? "Restore" : "Archive"}
            </button>
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-xs font-medium text-cream-700">Tags</span>
              <button
                onClick={() => setShowTagPicker(!showTagPicker)}
                className="rounded bg-cream-200 px-2 py-0.5 text-xs text-cream-700 hover:bg-cream-300 hover:text-cream-900"
              >
                + Tag
              </button>
            </div>
            {link.tags && link.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {link.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="group flex items-center gap-1 rounded-full bg-cream-200 px-2 py-1 text-xs text-cream-800"
                  >
                    {tag.name}
                    <button
                      onClick={async () => {
                        await fetch(`/api/links/${link.id}/tags`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ tagId: tag.id, enabled: false }),
                        });
                        await onUpdate();
                      }}
                      className="hidden text-cream-600 hover:text-terra-500 group-hover:inline"
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            )}
            {showTagPicker && (
              <div className="mt-2 rounded-lg border border-cream-400 bg-cream-50 p-2">
                <input
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  placeholder="Search tags..."
                  className="mb-2 w-full rounded border border-cream-400 bg-white px-2 py-1 text-sm text-cream-900 placeholder-cream-600 focus:outline-none focus:border-wood-500"
                  autoFocus
                />
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {allTags
                    .filter((t) => t.name.toLowerCase().includes(tagSearch.toLowerCase()))
                    .map((tag) => {
                      const isActive = link.tags?.some((t) => t.id === tag.id);
                      return (
                        <button
                          key={tag.id}
                          onClick={async () => {
                            await fetch(`/api/links/${link.id}/tags`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ tagId: tag.id, enabled: !isActive }),
                            });
                            await onUpdate();
                          }}
                          className={`block w-full rounded px-2 py-1 text-left text-xs transition-colors ${
                            isActive
                              ? "bg-wood-500/15 text-wood-700"
                              : "text-cream-800 hover:bg-cream-200"
                          }`}
                        >
                          <span className="text-cream-600">{tag.category}</span> {tag.name}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            {editing ? (
              <>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes..."
                  rows={3}
                  className="w-full rounded-lg border border-cream-400 bg-cream-50 px-3 py-2 text-sm text-cream-900 placeholder-cream-600 focus:border-wood-500 focus:outline-none"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveNotes}
                    disabled={saving}
                    className="rounded-lg bg-wood-500 px-3 py-1.5 text-sm text-white hover:bg-wood-600 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="rounded-lg border border-cream-400 bg-cream-100 px-3 py-1.5 text-sm text-cream-800 hover:bg-cream-200"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div
                onClick={() => setEditing(true)}
                className="cursor-pointer rounded-lg border border-cream-400/60 bg-cream-50 p-3 text-sm hover:border-cream-500"
              >
                <div className="text-xs font-medium text-cream-700 mb-1">Notes</div>
                <div className="text-cream-800">
                  {link.notes || "Click to add notes"}
                </div>
              </div>
            )}
          </div>

          {link.source_message_id && (
            <div className="text-sm">
              <a
                href={`/inbox/${encodeURIComponent(link.source_message_id)}`}
                className="text-wood-600 underline hover:text-wood-700"
              >
                View source email
              </a>
            </div>
          )}

          <div className="space-y-1 text-xs text-cream-600">
            {link.sender_name && <div>From: {link.sender_name}</div>}
            {link.sender_email && <div>Email: {link.sender_email}</div>}
            <div>Received: {new Date(link.created_at).toLocaleString()}</div>
            {link.hostname && <div>Domain: {link.hostname}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

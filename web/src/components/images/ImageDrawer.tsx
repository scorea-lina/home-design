"use client";

import { useCallback, useEffect, useState } from "react";
import type { ImageRow, TagInfo } from "./ImageGrid";
import { MarkupEditor } from "./MarkupEditor";

type Props = {
  image: ImageRow;
  allImages: ImageRow[];
  onClose: () => void;
  onUpdate: () => Promise<void>;
};

export function ImageDrawer({ image, allImages, onClose, onUpdate }: Props) {
  const [activeImage, setActiveImage] = useState<ImageRow>(image);
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(activeImage.notes ?? "");
  const [title, setTitle] = useState(activeImage.title ?? "");
  const [saving, setSaving] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [showMarkup, setShowMarkup] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [allTags, setAllTags] = useState<TagInfo[]>([]);
  const [tagSearch, setTagSearch] = useState("");

  // Fetch all available tags for the picker.
  useEffect(() => {
    fetch("/api/tags", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (Array.isArray(json?.tags)) setAllTags(json.tags);
      })
      .catch(() => {});
  }, []);

  // Get the root original ID.
  const originalId = image.original_image_id ?? image.id;

  // All versions: original + clones, sorted chronologically.
  const thread = [
    allImages.find((i) => i.id === originalId),
    ...allImages.filter((i) => i.original_image_id === originalId),
  ].filter(Boolean) as ImageRow[];

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await fetch(`/api/images/${activeImage.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, notes }),
      });
      await onUpdate();
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }, [activeImage.id, title, notes, onUpdate]);

  const handleClone = useCallback(async () => {
    setCloning(true);
    try {
      const res = await fetch(`/api/images/${activeImage.id}/clone`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.ok && json.image) {
        await onUpdate();
        // Switch to the new clone and open markup editor.
        setActiveImage(json.image);
        setShowMarkup(true);
      }
    } finally {
      setCloning(false);
    }
  }, [activeImage.id, onUpdate]);

  const handleArchive = useCallback(async () => {
    await fetch(`/api/images/${activeImage.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived_at: new Date().toISOString() }),
    });
    await onUpdate();
    onClose();
  }, [activeImage.id, onUpdate, onClose]);

  const handleMarkupSave = useCallback(
    async (markupJson: any, dataUrl: string) => {
      // Save markup annotations to the image record.
      await fetch(`/api/images/${activeImage.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markup_json: markupJson }),
      });
      await onUpdate();
      setShowMarkup(false);
    },
    [activeImage.id, onUpdate]
  );

  if (showMarkup && activeImage.public_url) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="relative max-h-[90vh] w-full max-w-5xl overflow-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-4">
          <button
            onClick={() => setShowMarkup(false)}
            className="absolute right-4 top-4 z-10 rounded bg-zinc-800 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-700"
          >
            Cancel
          </button>
          <MarkupEditor
            imageUrl={activeImage.public_url}
            existingMarkup={activeImage.markup_json}
            onSave={handleMarkupSave}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer */}
      <div className="flex h-full w-full max-w-xl flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 p-4">
          <h2 className="text-lg font-semibold text-zinc-100">
            {activeImage.title || activeImage.file_name || "Image Detail"}
          </h2>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            Close
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Main image */}
          {activeImage.public_url && (
            <img
              src={activeImage.public_url}
              alt={activeImage.title || "Image"}
              className="w-full rounded-lg border border-zinc-800"
            />
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleClone}
              disabled={cloning}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {cloning ? "Cloning..." : "Clone & Edit"}
            </button>
            <button
              onClick={() => {
                if (activeImage.original_image_id) {
                  setShowMarkup(true);
                } else {
                  handleClone();
                }
              }}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
            >
              Markup
            </button>
            <button
              onClick={handleArchive}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
            >
              Archive
            </button>
          </div>

          {/* Tags */}
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-400">Tags</span>
              <button
                onClick={() => setShowTagPicker(!showTagPicker)}
                className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              >
                + Tag
              </button>
            </div>
            {activeImage.tags && activeImage.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {activeImage.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="group flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300"
                  >
                    {tag.name}
                    <button
                      onClick={async () => {
                        await fetch(`/api/images/${activeImage.id}/tags`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ tagId: tag.id, enabled: false }),
                        });
                        await onUpdate();
                      }}
                      className="hidden text-zinc-500 hover:text-red-400 group-hover:inline"
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            )}
            {showTagPicker && (
              <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-900 p-2">
                <input
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  placeholder="Search tags..."
                  className="mb-2 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none"
                  autoFocus
                />
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {allTags
                    .filter((t) => t.name.toLowerCase().includes(tagSearch.toLowerCase()))
                    .map((tag) => {
                      const isActive = activeImage.tags?.some((t) => t.id === tag.id);
                      return (
                        <button
                          key={tag.id}
                          onClick={async () => {
                            await fetch(`/api/images/${activeImage.id}/tags`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ tagId: tag.id, enabled: !isActive }),
                            });
                            await onUpdate();
                          }}
                          className={`block w-full rounded px-2 py-1 text-left text-xs transition-colors ${
                            isActive
                              ? "bg-blue-600/20 text-blue-300"
                              : "text-zinc-300 hover:bg-zinc-800"
                          }`}
                        >
                          <span className="text-zinc-500">{tag.category}</span> {tag.name}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* Title & Notes */}
          <div className="space-y-2">
            {editing ? (
              <>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
                />
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes..."
                  rows={3}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div
                onClick={() => setEditing(true)}
                className="cursor-pointer rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-sm hover:border-zinc-600"
              >
                <div className="font-medium text-zinc-200">
                  {activeImage.title || "Click to add title"}
                </div>
                <div className="mt-1 text-zinc-400">
                  {activeImage.notes || "Click to add notes"}
                </div>
              </div>
            )}
          </div>

          {/* Source email link */}
          {activeImage.source_message_id && (
            <div className="text-sm">
              <a
                href={`/inbox/${encodeURIComponent(activeImage.source_message_id)}`}
                className="text-blue-400 underline hover:text-blue-300"
              >
                View source email
              </a>
            </div>
          )}

          {/* Metadata */}
          <div className="space-y-1 text-xs text-zinc-500">
            <div>Source: {activeImage.source_type}</div>
            {activeImage.file_size_bytes && (
              <div>Size: {(activeImage.file_size_bytes / 1024 / 1024).toFixed(1)} MB</div>
            )}
            <div>Uploaded: {new Date(activeImage.created_at).toLocaleString()}</div>
          </div>

          {/* Timeline filmstrip */}
          {thread.length > 1 && (
            <div>
              <div className="mb-2 text-xs font-medium text-zinc-400">
                Versions ({thread.length})
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {thread.map((img, i) => (
                  <button
                    key={img.id}
                    onClick={() => {
                      setActiveImage(img);
                      setTitle(img.title ?? "");
                      setNotes(img.notes ?? "");
                      setEditing(false);
                    }}
                    className={`flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                      img.id === activeImage.id
                        ? "border-blue-500"
                        : "border-zinc-700 hover:border-zinc-500"
                    }`}
                  >
                    {img.public_url && (
                      <img
                        src={img.public_url}
                        alt={`Version ${i + 1}`}
                        className="h-16 w-16 object-cover"
                      />
                    )}
                    <div className="px-1 py-0.5 text-center text-[10px] text-zinc-400">
                      {i === 0 ? "Original" : `v${i}`}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

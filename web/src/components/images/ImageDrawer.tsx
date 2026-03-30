"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ImageRow, TagInfo } from "./ImageGrid";
import { MarkupEditor } from "./MarkupEditor";
import { ImageZoomCrop } from "./ImageZoomCrop";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const BUCKET = "images";

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
  const [showZoom, setShowZoom] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
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

  const originalId = image.original_image_id ?? image.id;

  const thread = ([
    allImages.find((i) => i.id === originalId),
    ...allImages.filter((i) => i.original_image_id === originalId),
  ].filter(Boolean) as ImageRow[]).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

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
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const storagePath = activeImage.storage_path;

      const supabase = getSupabaseBrowserClient();
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, blob, { contentType: "image/png", upsert: true });

      if (uploadErr) {
        console.error("Failed to save annotated image:", uploadErr);
      }

      await fetch(`/api/images/${activeImage.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markup_json: markupJson }),
      });
      await onUpdate();
      setShowMarkup(false);
    },
    [activeImage.id, activeImage.storage_path, onUpdate]
  );

  const handleCopy = useCallback(async () => {
    if (!activeImage.public_url) return;
    setCopyStatus("Copying...");
    try {
      const res = await fetch(activeImage.public_url);
      const blob = await res.blob();
      const pngBlob = blob.type === "image/png"
        ? blob
        : await new Promise<Blob>((resolve) => {
            const img = new window.Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
              const canvas = document.createElement("canvas");
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
              const ctx = canvas.getContext("2d")!;
              ctx.drawImage(img, 0, 0);
              canvas.toBlob((b) => resolve(b!), "image/png");
            };
            img.src = activeImage.public_url!;
          });
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": pngBlob }),
      ]);
      setCopyStatus("Copied!");
    } catch {
      setCopyStatus("Failed");
    }
    setTimeout(() => setCopyStatus(null), 2000);
  }, [activeImage.public_url]);

  const handleDownload = useCallback(async () => {
    if (!activeImage.public_url) return;
    const res = await fetch(activeImage.public_url);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeImage.file_name || activeImage.title || "image";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activeImage.public_url, activeImage.file_name, activeImage.title]);

  const handleCrop = useCallback(
    async (dataUrl: string) => {
      try {
        const res = await fetch(`/api/images/${activeImage.id}/crop`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl }),
        });
        const json = await res.json();
        if (json.ok && json.image) {
          await onUpdate();
          setActiveImage(json.image);
          setShowZoom(false);
          setShowMarkup(true);
        }
      } catch (err) {
        console.error("Crop failed:", err);
      }
    },
    [activeImage.id, onUpdate]
  );

  if (showZoom && activeImage.public_url) {
    return (
      <ImageZoomCrop
        imageUrl={activeImage.public_url}
        onCrop={handleCrop}
        onClose={() => setShowZoom(false)}
      />
    );
  }

  if (showMarkup && activeImage.public_url) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-cream-950/40 backdrop-blur-sm">
        <div className="relative max-h-[90vh] w-full max-w-5xl overflow-auto rounded-2xl border border-cream-400/60 bg-white p-4 shadow-warm-xl">
          <MarkupEditor
            imageUrl={activeImage.public_url}
            existingMarkup={activeImage.markup_json}
            onSave={handleMarkupSave}
            onCancel={() => setShowMarkup(false)}
          />
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-cream-950/10" onClick={onClose} />

      <div className="flex h-full w-full max-w-xl flex-col border-l border-cream-400/60 bg-white shadow-warm-xl">
        <div className="flex items-center justify-between border-b border-cream-300 p-4">
          <h2 className="text-lg font-semibold text-cream-950">
            {activeImage.title || activeImage.file_name || "Image Detail"}
          </h2>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-cream-600 hover:bg-cream-200 hover:text-cream-900"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeImage.public_url && (
            <button
              onClick={() => setShowZoom(true)}
              className="group relative w-full overflow-hidden rounded-lg border border-cream-400/60"
            >
              <img
                src={activeImage.public_url}
                alt={activeImage.title || "Image"}
                className="w-full"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-cream-950/0 transition-colors group-hover:bg-cream-950/20">
                <span className="rounded bg-cream-950/70 px-3 py-1.5 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Zoom &amp; Crop
                </span>
              </div>
            </button>
          )}

          {thread.length > 1 && (
            <div>
              <div className="mb-2 text-xs font-medium text-cream-700">
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
                        ? "border-wood-500"
                        : "border-cream-400 hover:border-cream-500"
                    }`}
                  >
                    {img.public_url && (
                      <img
                        src={img.public_url}
                        alt={`Version ${i + 1}`}
                        className="h-16 w-16 object-cover"
                      />
                    )}
                    <div className="px-1 py-0.5 text-center text-[10px] text-cream-700">
                      {i === 0 ? "Original" : `v${i}`}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleClone}
              disabled={cloning}
              className="rounded-lg bg-wood-500 px-4 py-2 text-sm font-medium text-white hover:bg-wood-600 disabled:opacity-50"
            >
              {cloning ? "Cloning..." : "Clone"}
            </button>
            <button
              onClick={() => {
                if (activeImage.original_image_id) {
                  setShowMarkup(true);
                } else {
                  handleClone();
                }
              }}
              className="rounded-lg border border-cream-400 bg-cream-100 px-4 py-2 text-sm text-cream-800 hover:bg-cream-200"
            >
              Edit
            </button>
            <button
              onClick={handleCopy}
              className="rounded-lg border border-cream-400 bg-cream-100 px-4 py-2 text-sm text-cream-800 hover:bg-cream-200"
            >
              {copyStatus || "Copy"}
            </button>
            <button
              onClick={handleDownload}
              className="rounded-lg border border-cream-400 bg-cream-100 px-4 py-2 text-sm text-cream-800 hover:bg-cream-200"
            >
              Download
            </button>
            <button
              onClick={handleArchive}
              className="rounded-lg border border-cream-400 bg-cream-100 px-4 py-2 text-sm text-cream-800 hover:bg-cream-200"
            >
              Archive
            </button>
            {activeImage.original_image_id && (
              <button
                onClick={async () => {
                  if (!confirm("Delete this clone? This cannot be undone.")) return;
                  await fetch(`/api/images/${activeImage.id}`, { method: "DELETE" });
                  await onUpdate();
                  const original = allImages.find((i) => i.id === activeImage.original_image_id);
                  if (original) {
                    setActiveImage(original);
                    setTitle(original.title ?? "");
                    setNotes(original.notes ?? "");
                  } else {
                    onClose();
                  }
                }}
                className="rounded-lg border border-terra-400/40 bg-terra-400/10 px-4 py-2 text-sm text-terra-600 hover:bg-terra-400/20"
              >
                Delete
              </button>
            )}
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
            {activeImage.tags && activeImage.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {activeImage.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="group flex items-center gap-1 rounded-full bg-cream-200 px-2 py-1 text-xs text-cream-800"
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
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title"
                  className="w-full rounded-lg border border-cream-400 bg-cream-50 px-3 py-2 text-sm text-cream-900 placeholder-cream-600 focus:border-wood-500 focus:outline-none"
                />
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes..."
                  rows={3}
                  className="w-full rounded-lg border border-cream-400 bg-cream-50 px-3 py-2 text-sm text-cream-900 placeholder-cream-600 focus:border-wood-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
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
                <div className="font-medium text-cream-900">
                  {activeImage.title || "Click to add title"}
                </div>
                <div className="mt-1 text-cream-700">
                  {activeImage.notes || "Click to add notes"}
                </div>
              </div>
            )}
          </div>

          {activeImage.source_message_id && (
            <div className="text-sm">
              <a
                href={`/inbox/${encodeURIComponent(activeImage.source_message_id)}`}
                className="text-wood-600 underline hover:text-wood-700"
              >
                View source email
              </a>
            </div>
          )}

          <div className="space-y-1 text-xs text-cream-600">
            <div>Source: {activeImage.source_type}</div>
            {activeImage.file_size_bytes && (
              <div>Size: {(activeImage.file_size_bytes / 1024 / 1024).toFixed(1)} MB</div>
            )}
            <div>Uploaded: {new Date(activeImage.created_at).toLocaleString()}</div>
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { ImageDrawer } from "./ImageDrawer";

const BUCKET = "images";

export type TagInfo = {
  id: string;
  name: string;
  category: string;
};

export type ImageRow = {
  id: string;
  source_type: string;
  source_message_id: string | null;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  original_image_id: string | null;
  markup_json: any;
  title: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  public_url: string | null;
  tags: TagInfo[];
};

export function ImageGrid() {
  const [images, setImages] = useState<ImageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImageRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchImages = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/images", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setImages(Array.isArray(json?.images) ? json.images : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const pdfPageToBlob = useCallback(
    async (pdfDoc: any, pageNum: number): Promise<Blob> => {
      const page = await pdfDoc.getPage(pageNum);
      const scale = 2;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      return new Promise((resolve) =>
        canvas.toBlob((b: Blob | null) => resolve(b!), "image/png")
      );
    },
    []
  );

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files).filter((f) =>
        f.type.startsWith("image/") || f.type === "application/pdf"
      );
      if (fileArray.length === 0) return;

      setUploading(true);
      try {
        const supabase = getSupabaseBrowserClient();

        for (const file of fileArray) {
          if (file.type === "application/pdf") {
            const pdfjsLib = await import("pdfjs-dist");
            pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const baseName = file.name.replace(/\.pdf$/i, "");

            for (let p = 1; p <= pdfDoc.numPages; p++) {
              const blob = await pdfPageToBlob(pdfDoc, p);
              const storagePath = `uploads/${crypto.randomUUID()}.png`;

              const { error: uploadErr } = await supabase.storage
                .from(BUCKET)
                .upload(storagePath, blob, { contentType: "image/png", upsert: false });

              if (uploadErr) {
                console.error(`PDF page ${p} upload failed:`, uploadErr);
                continue;
              }

              await fetch("/api/images", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  storage_path: storagePath,
                  file_name: `${baseName} - page ${p}.png`,
                  mime_type: "image/png",
                  file_size_bytes: blob.size,
                  source_type: "pdf_page",
                }),
              });
            }
          } else {
            const ext = file.name.split(".").pop() || "png";
            const storagePath = `uploads/${crypto.randomUUID()}.${ext}`;

            const { error: uploadErr } = await supabase.storage
              .from(BUCKET)
              .upload(storagePath, file, { contentType: file.type, upsert: false });

            if (uploadErr) {
              console.error("Upload failed:", uploadErr);
              continue;
            }

            await fetch("/api/images", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                storage_path: storagePath,
                file_name: file.name,
                mime_type: file.type,
                file_size_bytes: file.size,
                source_type: "upload",
              }),
            });
          }
        }

        await fetchImages();
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setUploading(false);
      }
    },
    [fetchImages, pdfPageToBlob]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length) {
        uploadFiles(e.dataTransfer.files);
      }
    },
    [uploadFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const originals = images.filter((img) => !img.original_image_id);

  return (
    <>
      {/* Upload area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`mb-6 flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed p-8 text-sm transition-colors ${
          dragOver
            ? "border-wood-500 bg-wood-500/10 text-wood-600"
            : "border-cream-400 text-cream-700 hover:border-cream-500 hover:text-cream-800"
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {uploading ? (
          <span>Uploading...</span>
        ) : (
          <span>Drop images or PDF here, or click to upload</span>
        )}
      </div>

      {loading && <div className="text-sm text-cream-700">Loading...</div>}
      {error && (
        <div className="mb-4 rounded-lg border border-terra-400/30 bg-terra-400/10 p-4 text-sm text-terra-600">
          {error}
        </div>
      )}

      {!loading && originals.length === 0 && !error && (
        <div className="rounded-lg border border-cream-400/60 bg-cream-100/50 p-4 text-sm text-cream-800">
          No images yet. Upload some images or forward emails with images to get started.
        </div>
      )}

      {originals.length > 0 && (
        <div className="columns-2 gap-4 sm:columns-3 lg:columns-4">
          {originals.map((img) => {
            const cloneCount = images.filter(
              (c) => c.original_image_id === img.id
            ).length;

            return (
              <div
                key={img.id}
                className="mb-4 break-inside-avoid cursor-pointer overflow-hidden rounded-xl border border-cream-400/60 bg-white shadow-warm transition-all hover:shadow-warm-md hover:border-cream-500"
                onClick={() => setSelectedImage(img)}
              >
                {img.public_url && (
                  <img
                    src={img.public_url}
                    alt={img.title || img.file_name || "Image"}
                    className="w-full object-cover"
                    loading="lazy"
                  />
                )}
                <div className="p-3">
                  {img.title && (
                    <div className="text-sm font-medium text-cream-950 line-clamp-2">
                      {img.title}
                    </div>
                  )}
                  {img.file_name && !img.title && (
                    <div className="text-sm text-cream-800 line-clamp-1">
                      {img.file_name}
                    </div>
                  )}
                  {img.tags && img.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {img.tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag.id}
                          className="rounded-full bg-cream-200 px-1.5 py-0.5 text-[10px] text-cream-900"
                        >
                          {tag.name}
                        </span>
                      ))}
                      {img.tags.length > 4 && (
                        <span className="text-[10px] text-cream-600">+{img.tags.length - 4}</span>
                      )}
                    </div>
                  )}
                  <div className="mt-1 flex items-center gap-2 text-xs text-cream-600">
                    <span>{new Date(img.created_at).toLocaleDateString()}</span>
                    {cloneCount > 0 && (
                      <span className="rounded-full bg-cream-200 px-1.5 py-0.5 text-cream-700">
                        {cloneCount} clone{cloneCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedImage && (
        <ImageDrawer
          image={selectedImage}
          allImages={images}
          onClose={() => setSelectedImage(null)}
          onUpdate={fetchImages}
        />
      )}
    </>
  );
}

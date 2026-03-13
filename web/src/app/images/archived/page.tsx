"use client";

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type ArchivedImage = {
  id: string;
  file_name: string | null;
  title: string | null;
  public_url: string | null;
  archived_at: string | null;
  created_at: string;
};

export default function ImagesArchivedPage() {
  const [images, setImages] = useState<ArchivedImage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchArchived = useCallback(async () => {
    const res = await fetch('/api/images?archived=1', { cache: 'no-store' });
    const json = await res.json();
    setImages(json?.images ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchArchived(); }, [fetchArchived]);

  const handleRestore = useCallback(async (id: string) => {
    await fetch(`/api/images/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived_at: null }),
    });
    fetchArchived();
  }, [fetchArchived]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Images (Archived)</h1>
        <Link href="/images" className="text-sm text-zinc-400 hover:text-zinc-200">
          Back to Images
        </Link>
      </div>

      {loading && <div className="text-sm text-zinc-400">Loading...</div>}

      {!loading && images.length === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4 text-sm text-zinc-300">
          No archived images.
        </div>
      )}

      {images.length > 0 && (
        <div className="columns-2 gap-4 sm:columns-3 lg:columns-4">
          {images.map((img) => (
            <div key={img.id} className="mb-4 break-inside-avoid overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
              {img.public_url && (
                <img src={img.public_url} alt={img.title || img.file_name || ''} className="w-full object-cover" loading="lazy" />
              )}
              <div className="p-3">
                <div className="text-sm text-zinc-300">{img.title || img.file_name || 'Untitled'}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  Archived {img.archived_at ? new Date(img.archived_at).toLocaleDateString() : ''}
                </div>
                <button
                  onClick={() => handleRestore(img.id)}
                  className="mt-2 rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                >
                  Restore
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

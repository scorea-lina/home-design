export default async function TranscriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Transcript: {id}</h1>
        <p className="mt-1 text-sm text-zinc-400">Chunks + tags + extracted todos (scaffold).</p>
      </header>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="text-sm font-medium text-zinc-200">Chunks</div>
        <div className="mt-3 grid gap-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="text-xs text-zinc-500">Chunk {n} · Speaker: Unknown</div>
              <div className="mt-2 text-sm text-zinc-200">
                Placeholder transcript chunk text…
              </div>
              <div className="mt-2 text-xs text-zinc-500">Tags: —</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="text-sm font-medium text-zinc-200">Extracted To-Dos</div>
        <div className="mt-2 text-sm text-zinc-500">None yet.</div>
      </div>
    </div>
  );
}

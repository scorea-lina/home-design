export default function SearchPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Search</h1>
        <p className="mt-1 text-sm text-zinc-400">Single box + filters (scaffold).</p>
      </header>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <label className="text-sm text-zinc-300">Query</label>
        <input
          placeholder="Search emails, transcripts, attachments…"
          className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
        />
        <div className="mt-4 text-sm text-zinc-500">No results (yet).</div>
      </div>
    </div>
  );
}

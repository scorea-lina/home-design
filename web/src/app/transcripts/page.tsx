import Link from 'next/link';

export default function TranscriptListPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Transcripts</h1>
        <p className="mt-1 text-sm text-zinc-400">Meeting transcript PDFs (scaffold).</p>
      </header>

      <div className="rounded-xl border border-zinc-800 p-4 text-sm text-zinc-500">
        No transcripts yet. Example: <Link className="underline hover:text-zinc-200" href="/transcripts/demo">open demo transcript</Link>.
      </div>
    </div>
  );
}

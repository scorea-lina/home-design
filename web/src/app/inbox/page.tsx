import Link from 'next/link';

export default function InboxPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Inbox</h1>
          <p className="mt-1 text-sm text-zinc-400">Timeline of ingested emails (scaffold).</p>
        </div>
        <Link
          href="/"
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800"
        >
          Switch to Kanban
        </Link>
      </header>

      <div className="rounded-xl border border-zinc-800">
        <div className="border-b border-zinc-800 p-4 text-sm font-medium text-zinc-200">Recent</div>
        <div className="p-4 text-sm text-zinc-500">No emails ingested yet.</div>
      </div>
    </div>
  );
}

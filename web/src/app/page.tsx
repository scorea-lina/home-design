import Link from 'next/link';

export default function KanbanHomePage() {
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Kanban</h1>
          <p className="mt-1 text-sm text-zinc-400">Kanban-first landing (scaffold).</p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/inbox"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800"
          >
            Switch to Inbox
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {['Open', 'Resolved', 'Archived (hidden later)'].map((col) => (
          <div key={col} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-3 text-sm font-medium text-zinc-200">{col}</div>
            <div className="rounded-lg border border-dashed border-zinc-800 p-3 text-sm text-zinc-500">
              No cards yet.
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

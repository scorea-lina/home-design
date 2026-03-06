export default async function InboxDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Inbox Item</h1>
        <p className="mt-1 text-sm text-zinc-400">Detail view (prototype): {id}</p>
      </header>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="text-sm font-medium text-zinc-200">Header</div>
        <div className="mt-2 text-sm text-zinc-400">From / To / Date / Tags go here.</div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="text-sm font-medium text-zinc-200">Body</div>
        <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">
          Placeholder email body. Later: render chunks + attachments + extracted todos.
        </div>
      </div>
    </div>
  );
}

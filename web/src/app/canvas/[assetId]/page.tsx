export default async function CanvasAssetPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Canvas</h1>
        <p className="mt-1 text-sm text-zinc-400">Asset: {assetId} (prototype).</p>
      </header>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="text-sm font-medium text-zinc-200">Editor</div>
        <div className="mt-2 text-sm text-zinc-500">Open → crop → annotate → save vN.</div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800">
            Save vN
          </button>
          <button className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800">
            Copy to clipboard
          </button>
          <button className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800">
            Copy link
          </button>
          <button className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800">
            Attach to ticket
          </button>
        </div>
      </div>
    </div>
  );
}

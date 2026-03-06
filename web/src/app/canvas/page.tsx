import Link from 'next/link';

export default function CanvasIndexPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Canvas</h1>
        <p className="mt-1 text-sm text-zinc-400">Select an asset to open (prototype).</p>
      </header>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="text-sm font-medium text-zinc-200">Assets</div>
        <div className="mt-2 text-sm text-zinc-500">No real assets yet. Try demo:</div>
        <div className="mt-3">
          <Link
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800"
            href="/canvas/demo-asset"
          >
            Open demo asset
          </Link>
        </div>
      </div>
    </div>
  );
}

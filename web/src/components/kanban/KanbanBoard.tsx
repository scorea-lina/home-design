'use client';

import { useMemo, useState } from 'react';

type ColumnId = 'open' | 'resolved';

type Card = {
  id: string;
  title: string;
  columnId: ColumnId;
};

const columns: { id: ColumnId; title: string }[] = [
  { id: 'open', title: 'Open' },
  { id: 'resolved', title: 'Resolved' },
];

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function KanbanBoard() {
  const [cards, setCards] = useState<Card[]>(() => [
    { id: 'seed-1', title: 'Review kitchen counter options', columnId: 'open' },
    { id: 'seed-2', title: 'Confirm Utility Room layout', columnId: 'open' },
  ]);
  const [title, setTitle] = useState('');

  const grouped = useMemo(() => {
    const g: Record<ColumnId, Card[]> = { open: [], resolved: [] };
    for (const c of cards) g[c.columnId].push(c);
    return g;
  }, [cards]);

  function addCard() {
    const t = title.trim();
    if (!t) return;
    setCards((prev) => [{ id: newId(), title: t, columnId: 'open' }, ...prev]);
    setTitle('');
  }

  function move(cardId: string, to: ColumnId) {
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, columnId: to } : c)));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Quick add…"
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 md:w-[360px]"
          onKeyDown={(e) => {
            if (e.key === 'Enter') addCard();
          }}
        />
        <button
          onClick={addCard}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800"
        >
          Add card
        </button>
        <div className="text-xs text-zinc-500">In-memory for tonight (DB next).</div>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {columns.map((col) => (
          <div key={col.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium text-zinc-200">{col.title}</div>
              <div className="text-xs text-zinc-500">{grouped[col.id].length}</div>
            </div>

            <div className="grid gap-2">
              {grouped[col.id].length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-800 p-3 text-sm text-zinc-500">
                  No cards.
                </div>
              ) : null}

              {grouped[col.id].map((card) => (
                <div key={card.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                  <div className="text-sm text-zinc-100">{card.title}</div>
                  <div className="mt-2 flex gap-2">
                    {card.columnId !== 'open' ? (
                      <button
                        onClick={() => move(card.id, 'open')}
                        className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                      >
                        Move to Open
                      </button>
                    ) : null}
                    {card.columnId !== 'resolved' ? (
                      <button
                        onClick={() => move(card.id, 'resolved')}
                        className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                      >
                        Resolve
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';

const KanbanBoard = dynamic(() => import('@/components/kanban/KanbanBoard'), { ssr: false });

export default function KanbanHomePage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Kanban</h1>
        <p className="mt-1 text-sm text-zinc-400">
          New extracted items land in <span className="text-zinc-200">To Do</span>.
        </p>
      </header>

      <Suspense>
        <KanbanBoard />
      </Suspense>
    </div>
  );
}

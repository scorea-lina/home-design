'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';

const KanbanBoard = dynamic(() => import('@/components/kanban/KanbanBoard'), { ssr: false });

export default function KanbanHomePage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-cream-950">Tracker</h1>
      </header>

      <Suspense>
        <KanbanBoard />
      </Suspense>
    </div>
  );
}

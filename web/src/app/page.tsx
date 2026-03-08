'use client';

import dynamic from 'next/dynamic';
import SearchBar from '@/components/search/SearchBar';

const KanbanBoard = dynamic(() => import('@/components/kanban/KanbanBoard'), { ssr: false });

export default function KanbanHomePage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Kanban</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Kanban-first landing. New extracted items land in <span className="text-zinc-200">To Do</span>.
          </p>
        </div>
        <SearchBar />
      </header>

      <KanbanBoard />
    </div>
  );
}

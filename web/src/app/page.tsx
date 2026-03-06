import KanbanBoard from '@/components/kanban/KanbanBoard';

export default function KanbanHomePage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Kanban</h1>
        <p className="mt-1 text-sm text-zinc-400">Kanban-first landing (prototype).</p>
      </header>

      <KanbanBoard />
    </div>
  );
}

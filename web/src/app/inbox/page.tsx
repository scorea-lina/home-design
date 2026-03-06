import Link from 'next/link';

type InboxItem = {
  id: string;
  subject: string;
  from: string;
  date: string;
  preview: string;
};

const seed: InboxItem[] = [
  {
    id: 'email-1',
    subject: 'Kitchen counter: quartz vs marble',
    from: 'Amy Alexander',
    date: 'Today',
    preview: 'Sharing two options + rough pricing…',
  },
  {
    id: 'email-2',
    subject: 'Utility Room layout decision needed',
    from: 'Todd Bennett',
    date: 'Yesterday',
    preview: 'Need confirmation on door swing + cabinet depth…',
  },
];

export default function InboxPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Inbox</h1>
        <p className="mt-1 text-sm text-zinc-400">Timeline of ingested emails (prototype).</p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[360px_1fr]">
        <div className="rounded-xl border border-zinc-800">
          <div className="border-b border-zinc-800 p-4 text-sm font-medium text-zinc-200">Recent</div>
          <div className="divide-y divide-zinc-800">
            {seed.map((item) => (
              <Link
                key={item.id}
                href={`/inbox/${item.id}`}
                className="block p-4 hover:bg-zinc-900/40"
              >
                <div className="text-sm font-medium text-zinc-100">{item.subject}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {item.from} · {item.date}
                </div>
                <div className="mt-2 text-sm text-zinc-400">{item.preview}</div>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="text-sm font-medium text-zinc-200">Select an email</div>
          <div className="mt-2 text-sm text-zinc-500">Click an item on the left to view details.</div>
        </div>
      </div>
    </div>
  );
}

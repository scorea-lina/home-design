import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

type InboxItem = {
  id: string;
  subject: string;
  from: string;
  date: string;
  preview: string;
};

function toInboxItem(row: Record<string, unknown>): InboxItem {
  const r = row as Record<string, unknown>;

  const id = String(r.id ?? r.message_id ?? r.msg_id ?? r.rfc822_message_id ?? '');
  const subject = String(r.subject ?? r.message_subject ?? '(no subject)');

  const from =
    String(
      r.from_name ??
        r.from ??
        r.from_email ??
        r.sender ??
        r.sender_email ??
        r.mail_from ??
        ''
    ) || '(unknown sender)';

  const dateRaw = r.date ?? r.sent_at ?? r.received_at ?? r.created_at;
  const date = dateRaw ? new Date(String(dateRaw)).toLocaleString() : '';

  const preview = String(r.snippet ?? r.preview ?? r.body_preview ?? '').slice(0, 280);

  return { id, subject, from, date, preview };
}

export default async function InboxPage() {
  const supabase = getSupabaseServerClient();

  // Source of truth: public.agentmail_messages
  const { data, error } = await supabase
    .from('agentmail_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  const rows = (data ?? []) as Record<string, unknown>[];
  const items = rows.map(toInboxItem).filter((x) => x.id);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Inbox</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Timeline of ingested emails (from Supabase: <code>public.agentmail_messages</code>).
        </p>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
          Failed to load from Supabase: {error.message}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[360px_1fr]">
        <div className="rounded-xl border border-zinc-800">
          <div className="border-b border-zinc-800 p-4 text-sm font-medium text-zinc-200">Recent</div>
          <div className="divide-y divide-zinc-800">
            {items.length ? (
              items.map((item) => (
                <Link
                  key={item.id}
                  href={`/inbox/${encodeURIComponent(item.id)}`}
                  className="block p-4 hover:bg-zinc-900/40"
                >
                  <div className="text-sm font-medium text-zinc-100">{item.subject}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {item.from}
                    {item.date ? ` · ${item.date}` : ''}
                  </div>
                  <div className="mt-2 text-sm text-zinc-400">{item.preview}</div>
                </Link>
              ))
            ) : (
              <div className="p-4 text-sm text-zinc-500">
                No rows found in <code>public.agentmail_messages</code> yet.
              </div>
            )}
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

import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

function pickText(row: Record<string, unknown>, keys: string[], fallback = '') {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).length) return String(v);
  }
  return fallback;
}

export default async function InboxDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Route param is URL-encoded (often an RFC Message-ID like "<...@...>")
  const messageId = decodeURIComponent(id);

  const supabase = getSupabaseServerClient();

  // NOTE: PostgREST will error if we reference columns that do not exist.
  // `public.agentmail_messages` columns (per TesterBot):
  // fetched_at, from, inbox_address, inserted_at, message_id, raw, subject, text, thread_id, to, ts
  const { data, error } = await supabase
    .from('agentmail_messages')
    .select('*')
    .eq('message_id', messageId)
    .limit(1)
    .maybeSingle();

  const row = (data ?? {}) as Record<string, unknown>;

  const subject = pickText(row, ['subject', 'message_subject'], '(no subject)');
  const from = pickText(row, ['from_name', 'from', 'from_email', 'sender', 'sender_email', 'mail_from'], '(unknown sender)');
  const to = pickText(row, ['to', 'to_email', 'recipient', 'recipient_email'], '');
  const dateRaw = row.ts ?? row.received_at ?? row.inserted_at ?? row.fetched_at ?? row.date ?? row.sent_at ?? row.created_at;
  const date = dateRaw ? new Date(String(dateRaw)).toLocaleString() : '';
  const body = pickText(row, ['text', 'body_text', 'raw_text', 'body', 'raw', 'snippet'], '(no body)');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Inbox Item</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Supabase detail (from <code>public.agentmail_messages</code>)
        </p>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
          Failed to load from Supabase: {error.message}
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="text-sm font-medium text-zinc-200">Header</div>
        <div className="mt-2 space-y-1 text-sm text-zinc-300">
          <div>
            <span className="text-zinc-500">Subject:</span> {subject}
          </div>
          <div>
            <span className="text-zinc-500">From:</span> {from}
          </div>
          {to ? (
            <div>
              <span className="text-zinc-500">To:</span> {to}
            </div>
          ) : null}
          {date ? (
            <div>
              <span className="text-zinc-500">Date:</span> {date}
            </div>
          ) : null}
          <div>
            <span className="text-zinc-500">ID:</span> {id}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="text-sm font-medium text-zinc-200">Body</div>
        <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">{body}</div>
      </div>
    </div>
  );
}

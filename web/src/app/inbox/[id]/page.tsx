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

  const messageId = decodeURIComponent(id);

  const supabase = getSupabaseServerClient();

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
  const tsRaw = row.ts ?? row.received_at ?? row.inserted_at ?? row.fetched_at ?? row.date ?? row.sent_at ?? row.created_at;
  let date = '';
  if (tsRaw != null) {
    const n = Number(tsRaw);
    const d = (!isNaN(n) && n > 1_000_000_000) ? new Date(n * 1000) : new Date(String(tsRaw));
    date = isNaN(d.getTime()) ? '' : d.toLocaleString();
  }
  const body = pickText(row, ['text', 'body_text', 'raw_text', 'body', 'raw', 'snippet'], '(no body)');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-cream-950">Inbox Item</h1>
      </header>

      {error ? (
        <div className="rounded-xl border border-terra-400/30 bg-terra-400/10 p-4 text-sm text-terra-600">
          Failed to load from Supabase: {error.message}
        </div>
      ) : null}

      <div className="rounded-xl border border-cream-400/60 bg-white p-4 shadow-warm">
        <div className="text-sm font-medium text-cream-900">Header</div>
        <div className="mt-2 space-y-1 text-sm text-cream-800">
          <div>
            <span className="text-cream-600">Subject:</span> {subject}
          </div>
          <div>
            <span className="text-cream-600">From:</span> {from}
          </div>
          {to ? (
            <div>
              <span className="text-cream-600">To:</span> {to}
            </div>
          ) : null}
          {date ? (
            <div>
              <span className="text-cream-600">Date:</span> {date}
            </div>
          ) : null}
          <div>
            <span className="text-cream-600">ID:</span> {id}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-cream-400/60 bg-white p-4 shadow-warm">
        <div className="text-sm font-medium text-cream-900">Body</div>
        <div className="mt-2 whitespace-pre-wrap text-sm text-cream-800">{body}</div>
      </div>
    </div>
  );
}

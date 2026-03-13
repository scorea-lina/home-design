import Link from 'next/link';
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

  // Fetch tasks linked to this email
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, status, notes')
    .eq('source_message_id', messageId);

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Link
          href="/inbox"
          className="rounded-lg border border-cream-400 px-2.5 py-1.5 text-sm text-cream-700 transition-colors hover:bg-cream-200 hover:text-cream-900"
        >
          <span aria-hidden="true">&larr;</span> Inbox
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-cream-950">{subject}</h1>
      </header>

      {error ? (
        <div className="rounded-xl border border-terra-400/30 bg-terra-400/10 p-4 text-sm text-terra-600">
          Failed to load from Supabase: {error.message}
        </div>
      ) : null}

      <div className="rounded-xl border border-cream-400/60 bg-white p-4 shadow-warm">
        <div className="space-y-1 text-sm text-cream-800">
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
        </div>
      </div>

      <div className="rounded-xl border border-cream-400/60 bg-white p-4 shadow-warm">
        <div className="whitespace-pre-wrap text-sm text-cream-800">{body}</div>
      </div>

      {tasks && tasks.length > 0 ? (
        <div className="space-y-3">
          <div className="text-sm font-medium text-cream-900">
            {tasks.length} task{tasks.length !== 1 ? 's' : ''} from this email
          </div>
          <div className="space-y-2">
            {tasks.map((task) => (
              <Link
                key={task.id}
                href={`/?highlight=${task.id}`}
                className="block rounded-xl border border-cream-400/60 bg-white p-3 shadow-warm transition-colors hover:border-wood-400 hover:bg-cream-50"
              >
                <div className="text-sm font-medium text-cream-950">{task.title}</div>
                <div className="mt-1">
                  {task.notes ? (
                    <span className="text-xs text-cream-600 line-clamp-1">{task.notes}</span>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

type AgentmailInbox = { inbox_id?: string; id?: string; address?: string; email?: string };

type AgentmailThread = { thread_id?: string; id?: string };

type AgentmailMessage = Record<string, unknown> & {
  message_id?: string;
  id?: string;
  subject?: string;
  from?: string;
  to?: unknown;
  text?: string;
  timestamp?: string; // ISO
  created_at?: string; // ISO
  updated_at?: string;
};

function requireJobSecret(req: Request) {
  // Accept Vercel Cron (scheduled) invocations.
  if (req.headers.get('x-vercel-cron') === '1') return;

  // Accept CRON_SECRET bearer for manual triggers.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization') ?? '';
    if (authHeader === `Bearer ${cronSecret}`) return;
  }

  const configured = process.env.EXTRACT_JOBS_SECRET;
  if (!configured) {
    throw new Error('Server misconfigured: missing EXTRACT_JOBS_SECRET');
  }
  const got = req.headers.get('x-jobs-secret');
  if (!got || got !== configured) {
    throw new Error('Unauthorized: missing/invalid x-jobs-secret');
  }
}

function agentmailKey(): string {
  const k = (process.env.AGENTMAIL_API_KEY ?? '').trim();
  if (!k) throw new Error('Missing AGENTMAIL_API_KEY');
  return k;
}

const API_BASE = 'https://api.agentmail.to/v0';

async function agentmailGet(path: string, params?: Record<string, string | number | boolean>) {
  const key = agentmailKey();
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Agentmail GET ${path} failed ${res.status}: ${JSON.stringify(json)?.slice(0, 200)}`);
  }
  return json as any;
}

function pickList<T = any>(data: any): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    for (const k of ['items', 'data', 'inboxes', 'threads', 'messages']) {
      if (Array.isArray((data as any)[k])) return (data as any)[k] as T[];
    }
  }
  return [];
}

function stableMsgId(m: AgentmailMessage): string {
  return String(m.message_id ?? (m as any).messageId ?? m.id ?? '').trim();
}

function msgIso(m: AgentmailMessage): string | null {
  const v = (m.timestamp ?? m.created_at ?? (m as any).received_at ?? (m as any).date) as any;
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') {
    const sec = v > 10_000_000_000 ? v / 1000 : v;
    return new Date(sec * 1000).toISOString();
  }
  return null;
}

function normalizeRow(inboxAddress: string, inboxId: string, threadId: string, msg: AgentmailMessage) {
  const message_id = stableMsgId(msg) || (msg as any).smtp_id || `ts:${msgIso(msg) ?? ''}:${threadId}`;
  const iso = msgIso(msg);
  const ts = iso ? new Date(iso).getTime() / 1000 : null;

  return {
    message_id,
    thread_id: threadId,
    inbox_address: inboxAddress || inboxId,
    from: (msg as any).from ?? null,
    to: (msg as any).to ?? null,
    subject: (msg as any).subject ?? null,
    ts,
    fetched_at: new Date().toISOString(),
    text: (msg as any).text ?? (msg as any).extracted_text ?? (msg as any).preview ?? null,
    raw: msg,
  };
}

export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  try {
    requireJobSecret(req);
    const supabase = getSupabaseServerClient();

    const url = new URL(req.url);
    const backfillHours = Number(url.searchParams.get('backfillHours') ?? '0');

    const { data: stateRow } = await supabase
      .from('ingest_state')
      .select('key,cursor_ts,cursor_message_id')
      .eq('key', 'agentmail')
      .maybeSingle();

    const now = Date.now();
    const sinceIso =
      backfillHours > 0
        ? new Date(now - backfillHours * 3600 * 1000).toISOString()
        : stateRow?.cursor_ts
          ? new Date(String(stateRow.cursor_ts)).toISOString()
          : null;

    const inboxAddr = process.env.AGENTMAIL_INBOX_ADDRESS ?? 'astratora@agentmail.to';
    const inboxes = pickList<AgentmailInbox>(await agentmailGet('/inboxes', { limit: 100 }));
    let inboxId = '';
    for (const i of inboxes) {
      const addr = String(i.address ?? i.email ?? '').toLowerCase();
      if (addr && addr === inboxAddr.toLowerCase()) {
        inboxId = String(i.inbox_id ?? i.id ?? '').trim();
        break;
      }
    }
    if (!inboxId && inboxes.length === 1) {
      inboxId = String(inboxes[0].inbox_id ?? inboxes[0].id ?? '').trim();
    }
    if (!inboxId) throw new Error(`Could not find Agentmail inbox id for ${inboxAddr}`);

    const threads = pickList<AgentmailThread>(
      await agentmailGet(`/inboxes/${encodeURIComponent(inboxId)}/threads`, { limit: 50 })
    );

    const rows: any[] = [];
    let maxIso: string | null = sinceIso;
    let maxMsgId: string | null = (stateRow as any)?.cursor_message_id ?? null;

    for (const th of threads) {
      const threadId = String(th.thread_id ?? th.id ?? '').trim();
      if (!threadId) continue;
      const full = await agentmailGet(`/inboxes/${encodeURIComponent(inboxId)}/threads/${encodeURIComponent(threadId)}`);
      const msgs = pickList<AgentmailMessage>(full);
      for (const m of msgs) {
        const iso = msgIso(m);
        if (!iso) continue;
        if (sinceIso && iso <= sinceIso) continue;

        const row = normalizeRow(inboxAddr, inboxId, threadId, m);
        rows.push(row);

        const mid = String(row.message_id);
        if (!maxIso || iso > maxIso || (iso === maxIso && maxMsgId && mid > maxMsgId)) {
          maxIso = iso;
          maxMsgId = mid;
        }
      }
    }

    let upserted = 0;
    if (rows.length) {
      rows.sort((a, b) => Number(a.ts ?? 0) - Number(b.ts ?? 0));
      const B = 100;
      for (let i = 0; i < rows.length; i += B) {
        const batch = rows.slice(i, i + B);
        const { error } = await supabase.from('agentmail_messages').upsert(batch, { onConflict: 'message_id' });
        if (error) throw new Error(`Supabase upsert agentmail_messages failed: ${error.message}`);
        upserted += batch.length;
      }
    }

    if (maxIso) {
      await supabase
        .from('ingest_state')
        .upsert(
          {
            key: 'agentmail',
            cursor_ts: new Date(maxIso).toISOString(),
            cursor_message_id: maxMsgId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'key' }
        );
    }

    return NextResponse.json({
      ok: true,
      inbox: inboxAddr,
      since: sinceIso,
      backfillHours: backfillHours > 0 ? backfillHours : undefined,
      threads: threads.length,
      fetched: rows.length,
      upserted,
      newCursorTs: maxIso,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith('Unauthorized') ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

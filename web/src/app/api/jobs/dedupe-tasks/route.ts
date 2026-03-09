import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/^\s*(?:⛔\s*)?duplicate:\s*/i, '')
    .replace(/\s*\(duplicate\)\s*$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function requireJobSecret(req: Request) {
  // Allow Vercel Cron invocations.
  if (req.headers.get('x-vercel-cron') === '1') return;

  // Allow manual Bearer CRON_SECRET.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization') ?? '';
    if (authHeader === `Bearer ${cronSecret}`) return;
  }

  // Legacy/manual header.
  const configured = process.env.EXTRACT_JOBS_SECRET;
  if (!configured) throw new Error('Server misconfigured: missing EXTRACT_JOBS_SECRET');
  const got = req.headers.get('x-jobs-secret');
  if (!got || got !== configured) throw new Error('Unauthorized: missing/invalid x-jobs-secret');
}

// This janitor is intentionally conservative:
// - Only dedupes tasks within the SAME source_message_id
// - Does NOT hard-delete
// - Marks non-canonical tasks as done + prefixes title so UI stays clean, but is reversible.
export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  try {
    requireJobSecret(req);

    const url = new URL(req.url);
    const limit = Math.min(2000, Math.max(100, Number(url.searchParams.get('limit') ?? '500')));

    const supabase = getSupabaseServerClient();

    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('id,title,status,source_message_id,notes,updated_at,created_at')
      .not('source_message_id', 'is', null)
      .limit(limit);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    type Row = {
      id: string;
      title: string;
      status: string;
      source_message_id: string;
      notes: string | null;
      updated_at?: string;
      created_at?: string;
    };

    const rows = (tasks ?? []) as unknown as Row[];

    // Group by (source_message_id, normalized_title)
    const groups = new Map<string, Row[]>();
    for (const t of rows) {
      const key = `${t.source_message_id}::${normalizeTitle(t.title ?? '')}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }

    let groupsSeen = 0;
    let duplicatesFound = 0;
    let markedDuplicates = 0;

    for (const [, g] of groups.entries()) {
      groupsSeen++;
      if (g.length <= 1) continue;
      duplicatesFound += g.length - 1;

      // Choose canonical: prefer done, then newest updated_at, else newest created_at.
      const sorted = [...g].sort((a, b) => {
        const aDone = a.status === 'done' ? 1 : 0;
        const bDone = b.status === 'done' ? 1 : 0;
        if (aDone !== bDone) return bDone - aDone;
        const au = Date.parse(a.updated_at ?? a.created_at ?? '') || 0;
        const bu = Date.parse(b.updated_at ?? b.created_at ?? '') || 0;
        return bu - au;
      });
      const canonical = sorted[0];
      const dups = sorted.slice(1);

      for (const d of dups) {
        // If it already looks marked, skip.
        const alreadyMarked = /^\s*(?:⛔\s*)?duplicate:/i.test(d.title) || /\(duplicate\)\s*$/i.test(d.title);
        if (alreadyMarked) continue;

        const newTitle = `⛔ Duplicate: ${d.title}`;
        const pointer = `\n\n[dedupe] Marked as duplicate of task ${canonical.id} (same source_message_id).`;
        const newNotes = (d.notes ?? '') + pointer;

        const { error: upErr } = await supabase
          .from('tasks')
          .update({ title: newTitle, status: 'done', notes: newNotes, updated_at: new Date().toISOString() })
          .eq('id', d.id);

        if (upErr) {
          return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
        }
        markedDuplicates++;
      }
    }

    return NextResponse.json({
      ok: true,
      limit,
      groupsSeen,
      duplicatesFound,
      markedDuplicates,
      note: 'Conservative dedupe: marks duplicates within same source_message_id; no deletes.',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith('Unauthorized') ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

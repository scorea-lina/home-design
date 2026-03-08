import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('tasks').select('*').limit(200);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Record<string, unknown>[];

  // Normalize legacy statuses so clients never see triage/doing.
  for (const r of rows) {
    const s = String(r.status ?? '');
    if (s === 'triage' || s === 'doing') r.status = 'todo';
  }

  // best-effort sort by updated_at/created_at
  rows.sort((a, b) => {
    const at = a.updated_at ?? a.created_at;
    const bt = b.updated_at ?? b.created_at;
    const an = at ? +new Date(String(at)) : 0;
    const bn = bt ? +new Date(String(bt)) : 0;
    return bn - an;
  });

  return NextResponse.json({ ok: true, tasks: rows });
}

export async function POST(req: Request) {
  const supabase = getSupabaseServerClient();

  const body = (await req.json().catch(() => ({}))) as { title?: string };
  const title = (body.title ?? '').trim();
  if (!title) {
    return NextResponse.json({ ok: false, error: 'Missing title' }, { status: 400 });
  }

  const { error } = await supabase.from('tasks').insert({ title, status: 'todo' });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ ok: true, results: [] });
  }

  const supabase = getSupabaseServerClient();
  const pattern = `%${q}%`;

  // Search tasks by title + summary (ILIKE, case-insensitive).
  const { data: taskRows, error: taskErr } = await supabase
    .from('tasks')
    .select('id,title,status,summary,source_message_id,created_at,updated_at')
    .neq('status', 'archived')
    .or(`title.ilike.${pattern},summary.ilike.${pattern}`)
    .limit(20);

  if (taskErr) {
    return NextResponse.json({ ok: false, error: taskErr.message }, { status: 500 });
  }

  const rows = (taskRows ?? []) as Record<string, unknown>[];

  // Normalize legacy statuses.
  for (const r of rows) {
    const s = String(r.status ?? '');
    if (s === 'triage' || s === 'doing') r.status = 'todo';
  }

  // Fetch tags for matched tasks.
  const ids = rows.map((r) => String(r.id ?? '')).filter(Boolean);
  const tagsByTaskId: Record<string, { name: string; category: string }[]> = {};
  if (ids.length) {
    const { data: assigns } = await supabase
      .from('tag_assignments')
      .select('target_id, tags(name, category)')
      .eq('target_type', 'task')
      .in('target_id', ids);

    if (assigns) {
      for (const a of assigns as any[]) {
        const tid = String(a.target_id ?? '');
        const t = a.tags;
        if (!tid || !t) continue;
        const tag = { name: String(t.name ?? ''), category: String(t.category ?? '') };
        if (!tag.name) continue;
        (tagsByTaskId[tid] ??= []).push(tag);
      }
    }
  }

  const taskResults = rows.map((r) => ({
    kind: 'task' as const,
    id: String(r.id ?? ''),
    title: String(r.title ?? ''),
    status: String(r.status ?? 'todo'),
    summary: r.summary ? String(r.summary).slice(0, 120) : null,
    source_message_id: r.source_message_id ?? null,
    tags: tagsByTaskId[String(r.id ?? '')] ?? [],
  }));

  // Stretch: also search agentmail_messages by subject.
  const { data: emailRows } = await supabase
    .from('agentmail_messages')
    .select('message_id,subject,from,ts')
    .ilike('subject', pattern)
    .limit(10);

  const emailResults = (emailRows ?? []).map((r: any) => ({
    kind: 'email' as const,
    id: String(r.message_id ?? ''),
    title: String(r.subject ?? '(no subject)'),
    from: String(r.from ?? ''),
    ts: r.ts ? new Date(Number(r.ts) * 1000).toISOString() : null,
  }));

  return NextResponse.json({ ok: true, results: [...taskResults, ...emailResults] });
}

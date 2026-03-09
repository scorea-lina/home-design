import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = getSupabaseServerClient();

  // Explicit column list so we reliably return new task detail fields.
  // Exclude archived tasks — those are served by /api/archive.
  const { data, error } = await supabase
    .from('tasks')
    .select('id,title,status,source_message_id,summary,source_email_date,notes,position,created_at,updated_at')
    .neq('status', 'archived')
    .not('title', 'ilike', '⛔ Duplicate:%')
    .limit(200);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Record<string, unknown>[];

  // Fetch tag assignments for these tasks (Areas + Topics) so the Kanban can render tags.
  const ids = rows.map((r) => String(r.id ?? '')).filter(Boolean);
  const tagsByTaskId: Record<string, { name: string; category: string }[]> = {};
  if (ids.length) {
    const { data: assigns, error: tagErr } = await supabase
      .from('tag_assignments')
      .select('target_id, tags(id,name,category)')
      .eq('target_type', 'task')
      .in('target_id', ids);

    if (!tagErr && assigns) {
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

  for (const r of rows) {
    const tid = String(r.id ?? '');
    (r as any).tags = tagsByTaskId[tid] ?? [];
  }


  // Add source message sent timestamp from agentmail_messages.ts (epoch seconds).
  // This avoids a tasks table migration and automatically backfills for existing tasks.
  const messageIds = Array.from(
    new Set(rows.map((r) => String((r as any).source_message_id ?? '')).filter(Boolean))
  );
  const tsByMessageId: Record<string, number> = {};
  if (messageIds.length) {
    const { data: msgs, error: msgErr } = await supabase
      .from('agentmail_messages')
      .select('message_id, ts')
      .in('message_id', messageIds);
    if (!msgErr && msgs) {
      for (const m of msgs as any[]) {
        const mid = String(m.message_id ?? '');
        const ts = m.ts;
        if (!mid || ts == null) continue;
        const n = Number(ts);
        if (!isNaN(n)) tsByMessageId[mid] = n;
      }
    }
  }
  for (const r of rows) {
    const mid = String((r as any).source_message_id ?? '');
    (r as any).source_message_ts = mid && tsByMessageId[mid] != null ? tsByMessageId[mid] : null;
  }

  // Normalize legacy statuses so clients never see triage/doing.
  for (const r of rows) {
    const s = String(r.status ?? '');
    if (s === 'triage' || s === 'doing') r.status = 'todo';
  }

  // Sort: To Do by position ASC (null last), Done by updated_at/created_at DESC.
  rows.sort((a, b) => {
    const as = String(a.status ?? 'todo');
    const bs = String(b.status ?? 'todo');
    const isTodo = (s: string) => s === 'todo';
    if (isTodo(as) && isTodo(bs)) {
      const ap = a.position != null ? Number(a.position) : Infinity;
      const bp = b.position != null ? Number(b.position) : Infinity;
      return ap - bp;
    }
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

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    notes?: string;
    tags?: string[]; // array of tag IDs
  };
  const title = (body.title ?? '').trim();
  if (!title) {
    return NextResponse.json({ ok: false, error: 'Missing title' }, { status: 400 });
  }

  const notes = (body.notes ?? '').trim() || null;

  const { data: inserted, error } = await supabase
    .from('tasks')
    .insert({ title, status: 'todo', notes })
    .select('id')
    .single();

  if (error || !inserted) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Insert failed' }, { status: 500 });
  }

  // Insert tag assignments if tag IDs were provided.
  const tagIds = (body.tags ?? []).filter(Boolean);
  if (tagIds.length) {
    const rows = tagIds.map((tag_id: string) => ({
      tag_id,
      target_type: 'task',
      target_id: inserted.id,
      confidence: 'manual',
    }));
    // Ignore conflicts (idempotent).
    await supabase.from('tag_assignments').upsert(rows, { onConflict: 'tag_id,target_type,target_id' });
  }

  return NextResponse.json({ ok: true, id: inserted.id });
}
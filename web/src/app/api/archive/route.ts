import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from('tasks')
    .select('id,title,status,source_message_id,summary,source_email_date,notes,archived_at,created_at,updated_at')
    .eq('status', 'archived')
    .order('archived_at', { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Record<string, unknown>[];

  // Fetch tags for archived tasks.
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

  for (const r of rows) {
    (r as any).tags = tagsByTaskId[String(r.id ?? '')] ?? [];
  }

  return NextResponse.json({ ok: true, tasks: rows, total: rows.length });
}

import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const taskId = decodeURIComponent(id);

  const body = (await req.json().catch(() => ({}))) as { status?: string };
  const status = body.status;

  // Canonical statuses are now: todo | done.
  // Back-compat: accept old statuses but map them into todo/done.
  if (!status || !['todo', 'done', 'triage', 'doing'].includes(status)) {
    return NextResponse.json({ ok: false, error: 'Invalid status' }, { status: 400 });
  }

  const normalized = status === 'done' ? 'done' : 'todo';

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from('tasks')
    .update({ status: normalized, updated_at: new Date().toISOString() })
    .eq('id', taskId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

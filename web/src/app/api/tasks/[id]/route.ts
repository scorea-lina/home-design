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

  // Canonical statuses: todo | done | archived.
  // Back-compat: accept legacy statuses but map them into todo/done.
  if (!status || !['todo', 'done', 'archived', 'triage', 'doing'].includes(status)) {
    return NextResponse.json({ ok: false, error: 'Invalid status' }, { status: 400 });
  }

  const normalized = status === 'archived' ? 'archived' : status === 'done' ? 'done' : 'todo';

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from('tasks')
    .update({
      status: normalized,
      updated_at: new Date().toISOString(),
      // Set archived_at when archiving; clear it when restoring.
      archived_at: normalized === 'archived' ? new Date().toISOString() : null,
    })
    .eq('id', taskId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

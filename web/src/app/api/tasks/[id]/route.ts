import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const taskId = decodeURIComponent(id);

  const body = (await req.json().catch(() => ({}))) as {
    status?: string;
    title?: string;
    notes?: string | null;
    position?: number | null;
  };

  const supabase = getSupabaseServerClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Apply title update if provided.
  if (body.title !== undefined) {
    const t = String(body.title ?? '').trim();
    if (!t) return NextResponse.json({ ok: false, error: 'Title cannot be empty' }, { status: 400 });
    patch.title = t;
  }

  // Apply notes update if provided.
  if (body.notes !== undefined) {
    patch.notes = body.notes ? String(body.notes).trim() : null;
  }

  // Apply position update if provided (null = unset).
  if (body.position !== undefined) {
    patch.position = body.position != null ? Number(body.position) : null;
  }

  // Apply status update if provided.
  if (body.status !== undefined) {
    const status = body.status;
    if (!['todo', 'done', 'archived', 'resolved', 'triage', 'doing'].includes(status)) {
      return NextResponse.json({ ok: false, error: 'Invalid status' }, { status: 400 });
    }
    const normalized = status === 'archived' ? 'archived' : status === 'resolved' ? 'resolved' : status === 'done' ? 'done' : 'todo';
    patch.status = normalized;
    patch.archived_at = normalized === 'archived' ? new Date().toISOString() : null;
  }

  const { error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', taskId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

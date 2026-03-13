import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

const BUCKET = 'images';

/** Update an image (title, notes, archive, markup). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabaseServerClient();
    const body = await req.json();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if ('title' in body) updates.title = body.title;
    if ('notes' in body) updates.notes = body.notes;
    if ('markup_json' in body) updates.markup_json = body.markup_json;
    if ('archived_at' in body) updates.archived_at = body.archived_at;

    const { data, error } = await supabase
      .from('images')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(data.storage_path);

    return NextResponse.json({ ok: true, image: { ...data, public_url: urlData?.publicUrl ?? null } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

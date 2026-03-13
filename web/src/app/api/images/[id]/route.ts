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
    const bust = data.updated_at ? `?t=${new Date(data.updated_at).getTime()}` : '';

    return NextResponse.json({ ok: true, image: { ...data, public_url: urlData?.publicUrl ? urlData.publicUrl + bust : null } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

/** Delete a clone (hard delete from DB + Storage). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabaseServerClient();

    // Fetch the image to get storage_path and verify it's a clone.
    const { data: img, error: fetchErr } = await supabase
      .from('images')
      .select('id, storage_path, original_image_id')
      .eq('id', id)
      .single();

    if (fetchErr || !img) {
      return NextResponse.json({ ok: false, error: 'Image not found' }, { status: 404 });
    }

    if (!img.original_image_id) {
      return NextResponse.json({ ok: false, error: 'Cannot delete an original image. Archive it instead.' }, { status: 400 });
    }

    // Delete file from Storage.
    await supabase.storage.from(BUCKET).remove([img.storage_path]);

    // Delete tag assignments.
    await supabase.from('tag_assignments').delete().eq('target_id', id).eq('target_type', 'image');

    // Delete DB record.
    const { error: delErr } = await supabase.from('images').delete().eq('id', id);

    if (delErr) {
      return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

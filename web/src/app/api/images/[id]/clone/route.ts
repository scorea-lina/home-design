import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

const BUCKET = 'images';

/** Clone an image: copies the file in storage and creates a new images row linked to the original. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabaseServerClient();

    // Fetch original image.
    const { data: original, error: fetchErr } = await supabase
      .from('images')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !original) {
      return NextResponse.json({ ok: false, error: 'Image not found' }, { status: 404 });
    }

    // Resolve the true original (if this is already a clone, link to the root original).
    const originalId = original.original_image_id ?? original.id;

    // Copy file in storage.
    const ext = original.storage_path.split('.').pop() || 'png';
    const clonePath = `clones/${originalId}/${crypto.randomUUID()}.${ext}`;

    const { error: copyErr } = await supabase.storage
      .from(BUCKET)
      .copy(original.storage_path, clonePath);

    if (copyErr) {
      return NextResponse.json({ ok: false, error: `Storage copy failed: ${copyErr.message}` }, { status: 500 });
    }

    // Insert clone record.
    const { data: clone, error: insertErr } = await supabase
      .from('images')
      .insert({
        storage_path: clonePath,
        file_name: original.file_name ? `Clone of ${original.file_name}` : null,
        mime_type: original.mime_type,
        file_size_bytes: original.file_size_bytes,
        source_type: original.source_type,
        source_message_id: original.source_message_id,
        original_image_id: originalId,
        title: original.title,
        notes: null,
        markup_json: null,
      })
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(clone.storage_path);

    return NextResponse.json({ ok: true, image: { ...clone, public_url: urlData?.publicUrl ?? null } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

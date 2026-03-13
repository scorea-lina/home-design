import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

const BUCKET = 'images';

/** Create a cropped version of an image: accepts a PNG data URL, uploads it, and creates a clone record. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { dataUrl } = await req.json();

    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      return NextResponse.json({ ok: false, error: 'dataUrl is required' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    // Fetch source image.
    const { data: source, error: fetchErr } = await supabase
      .from('images')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !source) {
      return NextResponse.json({ ok: false, error: 'Image not found' }, { status: 404 });
    }

    // Resolve root original.
    const originalId = source.original_image_id ?? source.id;

    // Convert data URL to buffer.
    const base64 = dataUrl.split(',')[1];
    const buffer = Buffer.from(base64, 'base64');

    // Upload cropped image.
    const cropPath = `clones/${originalId}/${crypto.randomUUID()}.png`;

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(cropPath, buffer, { contentType: 'image/png', upsert: false });

    if (uploadErr) {
      return NextResponse.json({ ok: false, error: `Upload failed: ${uploadErr.message}` }, { status: 500 });
    }

    // Insert image record.
    const { data: crop, error: insertErr } = await supabase
      .from('images')
      .insert({
        storage_path: cropPath,
        file_name: source.file_name ? `Crop of ${source.file_name}` : 'Cropped image',
        mime_type: 'image/png',
        file_size_bytes: buffer.length,
        source_type: source.source_type,
        source_message_id: source.source_message_id,
        original_image_id: originalId,
        title: source.title ? `${source.title} (crop)` : 'Cropped image',
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
      .getPublicUrl(crop.storage_path);
    const bust = crop.updated_at ? `?t=${new Date(crop.updated_at).getTime()}` : '';

    return NextResponse.json({
      ok: true,
      image: { ...crop, public_url: urlData?.publicUrl ? urlData.publicUrl + bust : null },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

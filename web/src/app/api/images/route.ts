import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

const BUCKET = 'images';

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const url = new URL(req.url);
    const archived = url.searchParams.get('archived') === '1';

    let q = supabase
      .from('images')
      .select('id, source_type, source_message_id, storage_path, file_name, mime_type, file_size_bytes, original_image_id, markup_json, title, notes, archived_at, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(500);

    if (archived) {
      q = q.not('archived_at', 'is', null);
    } else {
      q = q.is('archived_at', null);
    }

    const { data, error } = await q;

    if (error) {
      return NextResponse.json({ ok: true, images: [], warning: error.message });
    }

    // Fetch tag assignments for all images.
    const imageIds = (data ?? []).map((img: any) => img.id);
    const tagMap: Record<string, { id: string; name: string; category: string }[]> = {};

    if (imageIds.length > 0) {
      for (let i = 0; i < imageIds.length; i += 100) {
        const batch = imageIds.slice(i, i + 100);
        const { data: assignments } = await supabase
          .from('tag_assignments')
          .select('target_id, tag_id, tags(id, name, category)')
          .eq('target_type', 'image')
          .in('target_id', batch);

        for (const a of assignments ?? []) {
          const tid = String((a as any).target_id);
          if (!tagMap[tid]) tagMap[tid] = [];
          const tag = (a as any).tags;
          if (tag) tagMap[tid].push({ id: tag.id, name: tag.name, category: tag.category });
        }
      }
    }

    // Also resolve tags from source tasks for email-sourced images.
    const emailImages = (data ?? []).filter((img: any) => img.source_message_id);
    const sourceMsgIds = [...new Set(emailImages.map((img: any) => img.source_message_id))];

    if (sourceMsgIds.length > 0) {
      // Find tasks for these messages.
      for (let i = 0; i < sourceMsgIds.length; i += 100) {
        const batch = sourceMsgIds.slice(i, i + 100);
        const { data: tasks } = await supabase
          .from('tasks')
          .select('id, source_message_id')
          .in('source_message_id', batch);

        if (tasks && tasks.length > 0) {
          const taskIds = tasks.map((t: any) => t.id);
          const taskMsgMap: Record<string, string[]> = {};
          for (const t of tasks) {
            if (!taskMsgMap[t.source_message_id]) taskMsgMap[t.source_message_id] = [];
            taskMsgMap[t.source_message_id].push(t.id);
          }

          // Fetch tags for these tasks.
          const { data: taskAssignments } = await supabase
            .from('tag_assignments')
            .select('target_id, tag_id, tags(id, name, category)')
            .eq('target_type', 'task')
            .in('target_id', taskIds);

          const taskTags: Record<string, { id: string; name: string; category: string }[]> = {};
          for (const a of taskAssignments ?? []) {
            const tid = String((a as any).target_id);
            if (!taskTags[tid]) taskTags[tid] = [];
            const tag = (a as any).tags;
            if (tag) taskTags[tid].push({ id: tag.id, name: tag.name, category: tag.category });
          }

          // Merge task tags into image tags (for images that don't have manual tags yet).
          for (const img of emailImages) {
            const imgId = img.id;
            const taskIdsForMsg = taskMsgMap[img.source_message_id] ?? [];
            for (const taskId of taskIdsForMsg) {
              for (const tag of taskTags[taskId] ?? []) {
                if (!tagMap[imgId]) tagMap[imgId] = [];
                if (!tagMap[imgId].some((t: any) => t.id === tag.id)) {
                  tagMap[imgId].push(tag);
                }
              }
            }
          }
        }
      }
    }

    // Generate public URLs for each image.
    const images = (data ?? []).map((img: any) => {
      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(img.storage_path);
      return { ...img, public_url: urlData?.publicUrl ?? null, tags: tagMap[img.id] ?? [] };
    });

    return NextResponse.json({ ok: true, images });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

/** Record an uploaded image (client uploads directly to Supabase Storage, then calls this). */
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await req.json();

    const {
      storage_path,
      file_name,
      mime_type,
      file_size_bytes,
      source_type = 'upload',
      source_message_id = null,
      original_image_id = null,
      title = null,
      notes = null,
      markup_json = null,
    } = body;

    if (!storage_path) {
      return NextResponse.json({ ok: false, error: 'storage_path is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('images')
      .insert({
        storage_path,
        file_name,
        mime_type,
        file_size_bytes,
        source_type,
        source_message_id,
        original_image_id,
        title,
        notes,
        markup_json,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Attach public URL.
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(data.storage_path);

    return NextResponse.json({ ok: true, image: { ...data, public_url: urlData?.publicUrl ?? null } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

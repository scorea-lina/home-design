import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('tags')
    .select('id,name,category')
    .eq('active', true)
    .order('category')
    .order('name');

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, tags: data ?? [] });
}

const VALID_CATEGORIES = ['area', 'topic', 'feature'];

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = String(body.name ?? '').trim();
  const category = String(body.category ?? 'area').trim();

  if (!name) return NextResponse.json({ ok: false, error: 'Name is required' }, { status: 400 });
  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ ok: false, error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  // Check for existing tag with same name + category
  const { data: existing } = await supabase
    .from('tags')
    .select('id,name,category')
    .ilike('name', name)
    .eq('category', category)
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Reactivate if it was deactivated
    await supabase.from('tags').update({ active: true }).eq('id', existing.id);
    return NextResponse.json({ ok: true, tag: existing });
  }

  const { data, error } = await supabase
    .from('tags')
    .insert({ name, category, active: true })
    .select('id,name,category')
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, tag: data });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const id = String(body.id ?? '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'Tag id is required' }, { status: 400 });

  const supabase = getSupabaseServerClient();

  // Remove all assignments for this tag first
  await supabase.from('tag_assignments').delete().eq('tag_id', id);

  // Soft-delete by setting active = false
  const { error } = await supabase.from('tags').update({ active: false }).eq('id', id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

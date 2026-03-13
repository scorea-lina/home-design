import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

/** Add or remove a tag from a link. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const linkId = decodeURIComponent(id);

  const body = (await req.json().catch(() => ({}))) as {
    tagId?: string;
    enabled?: boolean;
  };

  const tagId = String(body.tagId ?? "").trim();
  if (!tagId) {
    return NextResponse.json({ ok: false, error: "Missing tagId" }, { status: 400 });
  }

  const enabled = body.enabled !== false;
  const supabase = getSupabaseServerClient();

  if (enabled) {
    const { error } = await supabase
      .from("tag_assignments")
      .upsert(
        {
          tag_id: tagId,
          target_type: "link",
          target_id: linkId,
          confidence: "manual",
        },
        { onConflict: "tag_id,target_type,target_id" }
      );

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, enabled: true });
  }

  const { error } = await supabase
    .from("tag_assignments")
    .delete()
    .eq("target_type", "link")
    .eq("target_id", linkId)
    .eq("tag_id", tagId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, enabled: false });
}

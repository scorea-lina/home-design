import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();

    const { data, error } = await supabase
      .from("images")
      .select("id, source_message_id, url, mime_type, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    // If migration isn't applied yet, avoid crashing the route.
    if (error) {
      return NextResponse.json({ ok: true, images: [], warning: error.message }, { status: 200 });
    }

    return NextResponse.json({ ok: true, images: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

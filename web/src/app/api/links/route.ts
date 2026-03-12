import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

function isAppleHost(hostname: string) {
  const h = hostname.toLowerCase();
  return h === "apple.com" || h.endsWith(".apple.com");
}

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();

    const { data, error } = await supabase
      .from("links")
      .select("id, source_message_id, url, title, description, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    // If migration isn't applied yet, avoid crashing the route.
    if (error) {
      return NextResponse.json({ ok: true, links: [], warning: error.message }, { status: 200 });
    }

    const links = (data ?? []).filter((l: any) => {
      try {
        const host = new URL(String(l.url ?? "")).hostname;
        return !isAppleHost(host);
      } catch {
        return true;
      }
    });

    return NextResponse.json({ ok: true, links });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

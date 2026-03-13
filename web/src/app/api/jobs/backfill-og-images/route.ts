import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { fetchOgImage } from "@/lib/fetchOgImage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function requireJobSecret(req: Request) {
  if (req.headers.get("x-vercel-cron") === "1") return;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization") ?? "";
    if (authHeader === `Bearer ${cronSecret}`) return;
  }
  const configured = process.env.EXTRACT_JOBS_SECRET;
  if (!configured) throw new Error("Server misconfigured: missing EXTRACT_JOBS_SECRET");
  const got = req.headers.get("x-jobs-secret");
  if (!got || got !== configured) throw new Error("Unauthorized");
}

export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  try {
    requireJobSecret(req);

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);

    const supabase = getSupabaseServerClient();

    // Find links that don't have an og_image_url yet.
    const { data: links, error } = await supabase
      .from("links")
      .select("id, url")
      .is("og_image_url", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    let fetched = 0;
    let found = 0;

    for (const link of links ?? []) {
      fetched++;
      const ogImage = await fetchOgImage(link.url);

      // Update the link — set to the image URL or empty string to mark as "attempted".
      await supabase
        .from("links")
        .update({ og_image_url: ogImage || "" })
        .eq("id", link.id);

      if (ogImage) found++;
    }

    return NextResponse.json({ ok: true, fetched, found });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 401 });
  }
}

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

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

/** Strip tracking params and trailing slashes for comparison. */
function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const skip = new Set([
      "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
      "utm_brand", "clickid", "irgwc", "afsrc", "ad_type", "ad_id",
      "partner_id", "srsltid", "ref", "fbclid", "gclid",
    ]);
    const params = new URLSearchParams();
    u.searchParams.forEach((v, k) => {
      if (!skip.has(k.toLowerCase())) params.set(k, v);
    });
    u.search = params.toString();
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    u.hash = "";
    return u.toString();
  } catch {
    return raw;
  }
}

export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  try {
    requireJobSecret(req);

    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry") === "1";

    const supabase = getSupabaseServerClient();

    const { data: links, error } = await supabase
      .from("links")
      .select("id, url, notes, og_image_url, created_at")
      .order("created_at", { ascending: true })
      .limit(2000);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Group by normalized URL, keep the earliest (first in array since sorted asc).
    const groups = new Map<string, typeof links>();
    for (const link of links ?? []) {
      const norm = normalizeUrl(link.url);
      if (!groups.has(norm)) groups.set(norm, []);
      groups.get(norm)!.push(link);
    }

    const idsToDelete: string[] = [];
    for (const [, group] of groups) {
      if (group.length <= 1) continue;

      // Keep the one with notes or og_image, else the earliest.
      group.sort((a, b) => {
        // Prefer one with notes
        if (a.notes && !b.notes) return -1;
        if (!a.notes && b.notes) return 1;
        // Prefer one with og_image
        if (a.og_image_url && !b.og_image_url) return -1;
        if (!a.og_image_url && b.og_image_url) return 1;
        // Keep earliest
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      // Delete all but the first (best) one.
      for (let i = 1; i < group.length; i++) {
        idsToDelete.push(group[i].id);
      }
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        totalLinks: (links ?? []).length,
        uniqueUrls: groups.size,
        wouldDelete: idsToDelete.length,
      });
    }

    // Delete in batches.
    let deleted = 0;
    for (let i = 0; i < idsToDelete.length; i += 100) {
      const batch = idsToDelete.slice(i, i + 100);
      const { error: delErr } = await supabase
        .from("links")
        .delete()
        .in("id", batch);

      if (delErr) {
        return NextResponse.json({
          ok: false,
          error: delErr.message,
          deletedSoFar: deleted,
        }, { status: 500 });
      }
      deleted += batch.length;
    }

    return NextResponse.json({
      ok: true,
      totalLinks: (links ?? []).length,
      uniqueUrls: groups.size,
      deleted,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 401 });
  }
}

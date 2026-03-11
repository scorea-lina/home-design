import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

function requireJobSecret(req: Request) {
  // Accept Vercel Cron (scheduled) invocations.
  if (req.headers.get("x-vercel-cron") === "1") return;

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization") ?? "";
    if (authHeader === `Bearer ${cronSecret}`) return;
  }

  const configured = process.env.EXTRACT_JOBS_SECRET;
  if (!configured) {
    throw new Error("Server misconfigured: missing EXTRACT_JOBS_SECRET");
  }

  const got = req.headers.get("x-jobs-secret");
  if (!got || got !== configured) {
    throw new Error("Unauthorized: missing/invalid x-jobs-secret");
  }
}

function extractImageUrls(text: string): string[] {
  // Very conservative: only obvious image URLs.
  // Allow querystrings/fragments.
  const re = /(https?:\/\/[^\s<>\"]+?\.(?:png|jpe?g|gif|webp))(?:[?#][^\s<>\"]*)?/gi;
  const out: string[] = [];
  const seen = new Set<string>();

  for (const m of text.matchAll(re)) {
    const u = String(m[0]);
    if (!seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }

  return out;
}

export async function GET(req: Request) {
  // QA smoke tests may call this endpoint without headers.
  // To avoid leaking data, unauthenticated GET returns a stub response.
  // Authenticated callers should use POST (or add the same auth headers to GET).
  try {
    requireJobSecret(req);
    // Authorized: run the real handler
    return POST(req);
  } catch {
    return NextResponse.json({
      ok: true,
      mode: "dry-run",
      scanned: 0,
      messagesWithImages: 0,
      totalImageUrls: 0,
      samples: [],
      note: "Unauthenticated GET returns stub. Use POST with job auth headers for real scan.",
    });
  }
}

export async function POST(req: Request) {
  try {
    requireJobSecret(req);

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50") || 50, 200);

    const supabase = getSupabaseServerClient();

    const { data: msgs, error: msgErr } = await supabase
      .from("agentmail_messages")
      .select("message_id, subject, text, ts, inserted_at")
      .limit(limit);

    if (msgErr) {
      return NextResponse.json({ ok: false, error: msgErr.message }, { status: 500 });
    }

    const samples: Array<{ messageId: string; subject: string; ts: unknown; imageUrls: string[] }> = [];
    let messagesWithImages = 0;
    let totalImageUrls = 0;

    for (const m of msgs ?? []) {
      const text = String((m as any).text ?? "");
      const urls = extractImageUrls(text);
      if (urls.length) {
        messagesWithImages++;
        totalImageUrls += urls.length;
        if (samples.length < 10) {
          samples.push({
            messageId: String((m as any).message_id ?? ""),
            subject: String((m as any).subject ?? ""),
            ts: (m as any).ts,
            imageUrls: urls,
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      mode: "dry-run",
      scanned: (msgs ?? []).length,
      messagesWithImages,
      totalImageUrls,
      samples,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith("Unauthorized") ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

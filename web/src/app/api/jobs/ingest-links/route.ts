import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { fetchOgImage } from "@/lib/fetchOgImage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function requireJobSecret(req: Request) {
  // Accept Vercel Cron (scheduled) invocations.
  if (req.headers.get("x-vercel-cron") === "1") return;

  // Accept CRON_SECRET bearer for manual triggers.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization") ?? "";
    if (authHeader === `Bearer ${cronSecret}`) return;
  }

  // Accept manual x-jobs-secret header (local dev / manual triggers).
  const configured = process.env.EXTRACT_JOBS_SECRET;
  if (!configured) {
    throw new Error("Server misconfigured: missing EXTRACT_JOBS_SECRET");
  }

  const got = req.headers.get("x-jobs-secret");
  if (!got || got !== configured) {
    throw new Error("Unauthorized: missing/invalid x-jobs-secret");
  }
}

function isAppleHost(hostname: string) {
  const h = hostname.toLowerCase();
  return h === "apple.com" || h.endsWith(".apple.com");
}

function extractSenderEmail(fromField: string): string {
  const s = (fromField || "").trim();
  // Handles: Name <email@domain> and plain email@domain
  const m = s.match(/<([^>]+)>/);
  const candidate = (m ? m[1] : s).trim();
  const m2 = candidate.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return (m2 ? m2[0] : "").toLowerCase();
}

function isAllowedSender(email: string): boolean {
  if (!email) return false;
  if (email.endsWith("@paradisahomes.com")) return true;
  return email === "zachkinloch@gmail.com" || email === "veronica.tong@gmail.com";
}

function extractHttpUrls(text: string): string[] {
  const out: string[] = [];
  const re = /(https?:\/\/[^\s<>")\]]+)/g;
  for (const match of text.matchAll(re)) {
    let url = match[1] || "";
    // trim common trailing punctuation
    url = url.replace(/[),.;!?]+$/g, "");
    if (!url) continue;

    try {
      const host = new URL(url).hostname;
      if (isAppleHost(host)) continue;
    } catch {
      // If URL parsing fails, keep it (upsert will fail later if truly invalid).
    }

    out.push(url);
  }
  return Array.from(new Set(out));
}

export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  try {
    requireJobSecret(req);

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 200) || 200, 500);
    const sinceTsRaw = url.searchParams.get("sinceTs");
    const sinceTs = sinceTsRaw ? Number(sinceTsRaw) : null;

    const supabase = getSupabaseServerClient();

    // Pull latest messages (optionally backfill from sinceTs).
    let q = supabase
      .from("agentmail_messages")
      .select("message_id, from, text, inserted_at, ts")
      .order("inserted_at", { ascending: false })
      .limit(limit);

    if (sinceTs != null && Number.isFinite(sinceTs)) {
      q = q.gte("ts", sinceTs);
    }

    const { data: msgs, error: msgErr } = await q;

    if (msgErr) {
      return NextResponse.json({ ok: false, error: msgErr.message }, { status: 500 });
    }

    let scanned = 0;
    let found = 0;
    let upserted = 0;
    let skippedSender = 0;

    for (const m of msgs ?? []) {
      const messageId = String((m as any).message_id ?? "").trim();
      if (!messageId) continue;
      scanned++;

      const fromField = String((m as any).from ?? "");
      const senderEmail = extractSenderEmail(fromField);
      if (!isAllowedSender(senderEmail)) {
        skippedSender++;
        continue;
      }

      const text = String((m as any).text ?? "");
      const urls = extractHttpUrls(text);
      if (urls.length === 0) continue;
      found += urls.length;

      // Fetch OG images in parallel for this batch of URLs.
      const ogResults = await Promise.allSettled(
        urls.map((u) => fetchOgImage(u))
      );

      const rows = urls.map((u, idx) => ({
        source_message_id: messageId,
        url: u,
        title: null,
        description: null,
        og_image_url:
          ogResults[idx].status === "fulfilled"
            ? (ogResults[idx] as PromiseFulfilledResult<string | null>).value || ""
            : "",
      }));

      const { error: upErr } = await supabase
        .from("links")
        .upsert(rows, { onConflict: "source_message_id,url", ignoreDuplicates: true });

      if (upErr) {
        return NextResponse.json({ ok: false, error: upErr.message, messageId }, { status: 500 });
      }

      upserted += rows.length;
    }

    return NextResponse.json({ ok: true, scanned, skippedSender, found, upserted });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 401 });
  }
}

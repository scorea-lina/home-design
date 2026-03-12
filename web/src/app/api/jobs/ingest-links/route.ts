import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

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

function extractHttpUrls(text: string): string[] {
  const out: string[] = [];
  const re = /(https?:\/\/[^\s<>")\]]+)/g;
  for (const match of text.matchAll(re)) {
    let url = match[1] || "";
    // trim common trailing punctuation
    url = url.replace(/[),.;!?]+$/g, "");
    if (!url) continue;
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
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 500);

    const supabase = getSupabaseServerClient();

    const { data: msgs, error: msgErr } = await supabase
      .from("agentmail_messages")
      .select("message_id, text, inserted_at")
      .order("inserted_at", { ascending: false })
      .limit(limit);

    if (msgErr) {
      return NextResponse.json({ ok: false, error: msgErr.message }, { status: 500 });
    }

    let scanned = 0;
    let found = 0;
    let upserted = 0;

    for (const m of msgs ?? []) {
      const messageId = String((m as any).message_id ?? "").trim();
      if (!messageId) continue;
      scanned++;

      const text = String((m as any).text ?? "");
      const urls = extractHttpUrls(text);
      if (urls.length === 0) continue;
      found += urls.length;

      const rows = urls.map((u) => ({
        source_message_id: messageId,
        url: u,
        title: null,
        description: null,
      }));

      const { error: upErr } = await supabase
        .from("links")
        .upsert(rows, { onConflict: "source_message_id,url" });

      if (upErr) {
        return NextResponse.json({ ok: false, error: upErr.message, messageId }, { status: 500 });
      }

      upserted += rows.length;
    }

    return NextResponse.json({ ok: true, scanned, found, upserted });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 401 });
  }
}

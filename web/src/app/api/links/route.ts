import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

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

    // 1) Filter Apple links (safety net)
    let links = (data ?? []).filter((l: any) => {
      try {
        const host = new URL(String(l.url ?? "")).hostname;
        return !isAppleHost(host);
      } catch {
        return true;
      }
    });

    // 2) Filter by sender allowlist (safety net for existing spam rows)
    const messageIds = Array.from(
      new Set(links.map((l: any) => String(l.source_message_id || "").trim()).filter(Boolean))
    );

    if (messageIds.length > 0) {
      const { data: senders, error: senderErr } = await supabase
        .from("agentmail_messages")
        .select("message_id, from")
        .in("message_id", messageIds);

      if (!senderErr) {
        const senderById = new Map<string, string>();
        for (const s of senders ?? []) {
          senderById.set(String((s as any).message_id), String((s as any).from ?? ""));
        }

        links = links.filter((l: any) => {
          const mid = String(l.source_message_id || "").trim();
          const fromField = senderById.get(mid) || "";
          const senderEmail = extractSenderEmail(fromField);
          return isAllowedSender(senderEmail);
        });
      }
    }

    return NextResponse.json({ ok: true, links });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

function isAppleHost(hostname: string) {
  const h = hostname.toLowerCase();
  return h === "apple.com" || h.endsWith(".apple.com");
}

/** Only show links extracted from emails sent by these addresses/domains. */
const ALLOWED_SENDERS = [
  "zachkinloch@gmail.com",
  "veronica.tong@gmail.com",
];
const ALLOWED_SENDER_DOMAINS = ["paradisahomes.com"];

/** Extract bare email from RFC "Name <email>" or plain "email" format. */
function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).toLowerCase().trim();
}

function isAllowedSender(from: string): boolean {
  const addr = extractEmail(from);
  if (ALLOWED_SENDERS.includes(addr)) return true;
  const domain = addr.split("@")[1];
  return ALLOWED_SENDER_DOMAINS.includes(domain);
}

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();

    const { data, error } = await supabase
      .from("links")
      .select("id, source_message_id, url, title, description, created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    // If migration isn't applied yet, avoid crashing the route.
    if (error) {
      return NextResponse.json({ ok: true, links: [], warning: error.message }, { status: 200 });
    }

    const rows = data ?? [];

    // Look up senders for all source messages so we can filter by allowed senders.
    const messageIds = [...new Set(rows.map((l: any) => l.source_message_id))];
    const allowedMessageIds = new Set<string>();

    // Supabase .in() has a limit, so batch in chunks of 100.
    for (let i = 0; i < messageIds.length; i += 100) {
      const batch = messageIds.slice(i, i + 100);
      const { data: msgs } = await supabase
        .from("agentmail_messages")
        .select("message_id, from")
        .in("message_id", batch);

      for (const m of msgs ?? []) {
        if (isAllowedSender(String((m as any).from ?? ""))) {
          allowedMessageIds.add(String((m as any).message_id));
        }
      }
    }

    const links = rows.filter((l: any) => {
      // Must be from an allowed sender.
      if (!allowedMessageIds.has(l.source_message_id)) return false;

      // Filter out Apple links.
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

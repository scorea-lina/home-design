import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

/** Filter out system/account links that aren't project-relevant. */
const BLOCKED_HOSTS = [
  "apple.com", "apple.co",
  "accounts.google.com", "myaccount.google.com",
  "support.apple.com", "account.apple.com", "iforgot.apple.com",
  "apps.apple.com", "setup.icloud.com", "icq.icloud.com",
  "c.apple.com", "surveyfeedback.apple.com", "geni.us",
];

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (BLOCKED_HOSTS.includes(h)) return true;
  // Also block any *.apple.com subdomain
  if (h === "apple.com" || h.endsWith(".apple.com")) return true;
  return false;
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

function extractSenderName(from: string): string {
  const match = from.match(/^(.+?)\s*<[^>]+>/);
  return match ? match[1].trim().replace(/^"|"$/g, "") : from;
}

function isAllowedSender(from: string): boolean {
  const addr = extractEmail(from);
  if (ALLOWED_SENDERS.includes(addr)) return true;
  const domain = addr.split("@")[1];
  return ALLOWED_SENDER_DOMAINS.includes(domain);
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const url = new URL(req.url);
    const archived = url.searchParams.get("archived") === "1";

    let q = supabase
      .from("links")
      .select("id, source_message_id, url, title, description, summary, notes, og_image_url, archived_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    if (archived) {
      q = q.not("archived_at", "is", null);
    } else {
      q = q.is("archived_at", null);
    }

    const { data, error } = await q;

    if (error) {
      return NextResponse.json({ ok: true, links: [], warning: error.message }, { status: 200 });
    }

    const rows = data ?? [];

    // Look up senders for all source messages so we can filter + get sender name.
    const messageIds = [...new Set(rows.map((l: any) => l.source_message_id))];
    const allowedMessageIds = new Set<string>();
    const senderMap: Record<string, { name: string; email: string }> = {};

    for (let i = 0; i < messageIds.length; i += 100) {
      const batch = messageIds.slice(i, i + 100);
      const { data: msgs } = await supabase
        .from("agentmail_messages")
        .select("message_id, from")
        .in("message_id", batch);

      for (const m of msgs ?? []) {
        const fromStr = String((m as any).from ?? "");
        const msgId = String((m as any).message_id);
        if (isAllowedSender(fromStr)) {
          allowedMessageIds.add(msgId);
          senderMap[msgId] = {
            name: extractSenderName(fromStr),
            email: extractEmail(fromStr),
          };
        }
      }
    }

    const filteredRows = rows.filter((l: any) => {
      if (!allowedMessageIds.has(l.source_message_id)) return false;
      try {
        const host = new URL(String(l.url ?? "")).hostname;
        return !isBlockedHost(host);
      } catch {
        return true;
      }
    });

    // Fetch direct tag assignments for these links.
    const linkIds = filteredRows.map((l: any) => l.id);
    const tagMap: Record<string, { id: string; name: string; category: string }[]> = {};

    if (linkIds.length > 0) {
      for (let i = 0; i < linkIds.length; i += 100) {
        const batch = linkIds.slice(i, i + 100);
        const { data: assignments } = await supabase
          .from("tag_assignments")
          .select("target_id, tag_id, tags(id, name, category)")
          .eq("target_type", "link")
          .in("target_id", batch);

        for (const a of assignments ?? []) {
          const tid = String((a as any).target_id);
          if (!tagMap[tid]) tagMap[tid] = [];
          const tag = (a as any).tags;
          if (tag) tagMap[tid].push({ id: tag.id, name: tag.name, category: tag.category });
        }
      }
    }

    // Inherit tags from tasks via source_message_id.
    const sourceMsgIds = [...new Set(filteredRows.map((l: any) => l.source_message_id))];

    if (sourceMsgIds.length > 0) {
      for (let i = 0; i < sourceMsgIds.length; i += 100) {
        const batch = sourceMsgIds.slice(i, i + 100);
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, source_message_id")
          .in("source_message_id", batch);

        if (tasks && tasks.length > 0) {
          const taskIds = tasks.map((t: any) => t.id);
          const taskMsgMap: Record<string, string[]> = {};
          for (const t of tasks) {
            if (!taskMsgMap[t.source_message_id]) taskMsgMap[t.source_message_id] = [];
            taskMsgMap[t.source_message_id].push(t.id);
          }

          const { data: taskAssignments } = await supabase
            .from("tag_assignments")
            .select("target_id, tag_id, tags(id, name, category)")
            .eq("target_type", "task")
            .in("target_id", taskIds);

          const taskTags: Record<string, { id: string; name: string; category: string }[]> = {};
          for (const a of taskAssignments ?? []) {
            const tid = String((a as any).target_id);
            if (!taskTags[tid]) taskTags[tid] = [];
            const tag = (a as any).tags;
            if (tag) taskTags[tid].push({ id: tag.id, name: tag.name, category: tag.category });
          }

          for (const link of filteredRows) {
            const linkId = link.id;
            const taskIdsForMsg = taskMsgMap[link.source_message_id] ?? [];
            for (const taskId of taskIdsForMsg) {
              for (const tag of taskTags[taskId] ?? []) {
                if (!tagMap[linkId]) tagMap[linkId] = [];
                if (!tagMap[linkId].some((t: any) => t.id === tag.id)) {
                  tagMap[linkId].push(tag);
                }
              }
            }
          }
        }
      }
    }

    // Dedupe by normalized URL (strip tracking params, trailing slashes).
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

    const seen = new Set<string>();
    const dedupedRows = filteredRows.filter((l: any) => {
      const norm = normalizeUrl(l.url);
      if (seen.has(norm)) return false;
      seen.add(norm);
      return true;
    });

    // Enrich links with sender info and tags.
    const links = dedupedRows.map((l: any) => {
      const sender = senderMap[l.source_message_id] ?? null;
      let hostname = "";
      try {
        hostname = new URL(String(l.url ?? "")).hostname.replace(/^www\./, "");
      } catch {}

      return {
        ...l,
        sender_name: sender?.name ?? null,
        sender_email: sender?.email ?? null,
        hostname,
        tags: tagMap[l.id] ?? [],
      };
    });

    return NextResponse.json({ ok: true, links });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

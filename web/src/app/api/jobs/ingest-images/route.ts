import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const BUCKET = "images";
const IMAGE_MIME_PREFIXES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg", "image/bmp", "image/tiff"];

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
  if (!got || got !== configured) throw new Error("Unauthorized: missing/invalid x-jobs-secret");
}

function isImageMime(mime: string): boolean {
  const m = mime.toLowerCase();
  return IMAGE_MIME_PREFIXES.some((p) => m.startsWith(p));
}

/** Extract image attachments from the raw AgentMail message JSON. */
function extractAttachments(raw: any): { filename: string; mimeType: string; content: string; encoding: string }[] {
  if (!raw || typeof raw !== "object") return [];

  const results: { filename: string; mimeType: string; content: string; encoding: string }[] = [];

  // AgentMail stores attachments in various shapes — check common patterns.
  const attachmentArrays = [
    raw.attachments,
    raw.files,
    raw.payload?.parts,
  ].filter(Array.isArray);

  for (const arr of attachmentArrays) {
    for (const att of arr) {
      const mime = String(att.content_type ?? att.mimeType ?? att.type ?? att.contentType ?? "").trim();
      if (!isImageMime(mime)) continue;

      const content = att.content ?? att.data ?? att.body?.data ?? "";
      if (!content) continue;

      const filename = att.filename ?? att.name ?? att.fileName ?? `attachment.${mime.split("/")[1] || "png"}`;
      const encoding = att.encoding ?? att.content_transfer_encoding ?? "base64";

      results.push({ filename, mimeType: mime, content, encoding });
    }
  }

  return results;
}

/** Extract inline base64 images from email HTML body. */
function extractInlineImages(raw: any): { filename: string; mimeType: string; content: string }[] {
  const html = String(raw?.html ?? raw?.html_body ?? raw?.body?.html ?? "");
  if (!html) return [];

  const results: { filename: string; mimeType: string; content: string }[] = [];
  const regex = /src=["']data:(image\/[^;]+);base64,([^"']+)["']/g;
  let match;
  let idx = 0;

  while ((match = regex.exec(html)) !== null) {
    const mimeType = match[1];
    const content = match[2];
    const ext = mimeType.split("/")[1] || "png";
    results.push({
      filename: `inline_${idx++}.${ext}`,
      mimeType,
      content,
    });
  }

  return results;
}

export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  try {
    requireJobSecret(req);
    const supabase = getSupabaseServerClient();

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 500);
    const sinceTsRaw = url.searchParams.get("sinceTs");
    const sinceTs = sinceTsRaw ? Number(sinceTsRaw) : null;

    // Fetch messages with raw data.
    let q = supabase
      .from("agentmail_messages")
      .select("message_id, raw, ts")
      .order("ts", { ascending: false })
      .limit(limit);

    if (sinceTs != null && Number.isFinite(sinceTs)) {
      q = q.gte("ts", sinceTs);
    }

    const { data: msgs, error: msgErr } = await q;
    if (msgErr) {
      return NextResponse.json({ ok: false, error: msgErr.message }, { status: 500 });
    }

    // Check which messages already have images extracted.
    const messageIds = (msgs ?? []).map((m: any) => String(m.message_id)).filter(Boolean);

    let existingMsgIds = new Set<string>();
    if (messageIds.length > 0) {
      for (let i = 0; i < messageIds.length; i += 100) {
        const batch = messageIds.slice(i, i + 100);
        const { data: existing } = await supabase
          .from("images")
          .select("source_message_id")
          .in("source_message_id", batch);
        for (const e of existing ?? []) {
          existingMsgIds.add(String(e.source_message_id));
        }
      }
    }

    let scanned = 0;
    let extracted = 0;
    let uploaded = 0;

    for (const m of msgs ?? []) {
      const messageId = String((m as any).message_id ?? "").trim();
      if (!messageId) continue;
      if (existingMsgIds.has(messageId)) continue; // already processed
      scanned++;

      const raw = (m as any).raw;
      if (!raw) continue;

      const attachments = extractAttachments(raw);
      const inlineImages = extractInlineImages(raw);

      const allImages = [
        ...attachments.map((a) => ({ ...a, sourceType: "email_attachment" as const })),
        ...inlineImages.map((i) => ({ ...i, sourceType: "email_inline" as const, encoding: "base64" as const })),
      ];

      if (allImages.length === 0) continue;
      extracted += allImages.length;

      for (const img of allImages) {
        try {
          // Decode base64 content.
          const buffer = Buffer.from(img.content, "base64");
          const ext = img.filename.split(".").pop() || "png";
          const storagePath = `email/${messageId}/${crypto.randomUUID()}.${ext}`;

          // Upload to Supabase Storage.
          const { error: uploadErr } = await supabase.storage
            .from(BUCKET)
            .upload(storagePath, buffer, {
              contentType: img.mimeType,
              upsert: false,
            });

          if (uploadErr) {
            console.error(`Upload failed for ${img.filename}:`, uploadErr.message);
            continue;
          }

          // Register in DB.
          const { error: insertErr } = await supabase.from("images").insert({
            storage_path: storagePath,
            file_name: img.filename,
            mime_type: img.mimeType,
            file_size_bytes: buffer.length,
            source_type: img.sourceType,
            source_message_id: messageId,
          });

          if (insertErr) {
            console.error(`DB insert failed for ${img.filename}:`, insertErr.message);
            continue;
          }

          uploaded++;
        } catch (e: any) {
          console.error(`Failed to process ${img.filename}:`, e?.message);
        }
      }
    }

    return NextResponse.json({ ok: true, scanned, extracted, uploaded });
  } catch (e: any) {
    const status = e?.message?.startsWith("Unauthorized") ? 401 : 500;
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status });
  }
}

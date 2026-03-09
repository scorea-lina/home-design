import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();

    const [ingestRes, msgRes, procRes] = await Promise.all([
      supabase.from('ingest_state').select('key,cursor_ts,updated_at').eq('key', 'agentmail').maybeSingle(),
      supabase
        .from('agentmail_messages')
        .select('ts,inserted_at')
        .order('ts', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('agentmail_message_processing')
        .select('processed_at,extractor_version')
        .order('processed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (ingestRes.error) return NextResponse.json({ ok: false, error: ingestRes.error.message }, { status: 500 });
    if (msgRes.error) return NextResponse.json({ ok: false, error: msgRes.error.message }, { status: 500 });
    if (procRes.error) return NextResponse.json({ ok: false, error: procRes.error.message }, { status: 500 });

    const now = new Date().toISOString();

    return NextResponse.json({
      ok: true,
      now,
      ingest: {
        cursorTs: ingestRes.data?.cursor_ts ?? null,
        updatedAt: (ingestRes.data as unknown as { updated_at?: string } | null)?.updated_at ?? null,
      },
      latestMessage: {
        ts: (msgRes.data as unknown as { ts?: number } | null)?.ts ?? null,
        insertedAt: (msgRes.data as unknown as { inserted_at?: string } | null)?.inserted_at ?? null,
      },
      extractor: {
        lastProcessedAt: (procRes.data as unknown as { processed_at?: string } | null)?.processed_at ?? null,
        version: (procRes.data as unknown as { extractor_version?: string } | null)?.extractor_version ?? null,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

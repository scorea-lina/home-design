import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

type TaskTag = { id: string; name: string; category: string };
type TaskLink = { url: string; title: string | null; description: string | null; og_image_url: string | null };

type BriefTask = {
  id: string;
  title: string;
  status: string;
  notes: string | null;
  summary: string | null;
  source_message_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  tags: TaskTag[];
  links: TaskLink[];
};

type BriefFeatureGroup = {
  feature: string;
  tasks: BriefTask[];
};

type BriefAreaGroup = {
  area: string;
  featureGroups: BriefFeatureGroup[];
};

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();

    // 1. Fetch all non-archived, non-duplicate tasks
    const { data, error } = await supabase
      .from('tasks')
      .select('id,title,status,source_message_id,summary,notes,created_at,updated_at')
      .neq('status', 'archived')
      .not('title', 'ilike', '⛔ Duplicate:%')
      .limit(500);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as Record<string, unknown>[];

    // Normalize legacy statuses
    for (const r of rows) {
      const s = String(r.status ?? '');
      if (s === 'triage' || s === 'doing') r.status = 'todo';
    }

    const ids = rows.map((r) => String(r.id ?? '')).filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, grouped: [], totalTasks: 0, generatedAt: new Date().toISOString() });
    }

    // 2. Fetch tag assignments
    const tagsByTaskId: Record<string, TaskTag[]> = {};
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      const { data: assigns } = await supabase
        .from('tag_assignments')
        .select('target_id, tags(id,name,category)')
        .eq('target_type', 'task')
        .in('target_id', batch);

      for (const a of (assigns ?? []) as any[]) {
        const tid = String(a.target_id ?? '');
        const t = a.tags;
        if (!tid || !t) continue;
        (tagsByTaskId[tid] ??= []).push({ id: t.id, name: t.name, category: t.category });
      }
    }

    // 3. Fetch links for tasks that have a source_message_id
    const messageIds = Array.from(
      new Set(rows.map((r) => String(r.source_message_id ?? '')).filter(Boolean))
    );
    const linksByMessageId: Record<string, TaskLink[]> = {};
    if (messageIds.length) {
      for (let i = 0; i < messageIds.length; i += 100) {
        const batch = messageIds.slice(i, i + 100);
        const { data: links } = await supabase
          .from('links')
          .select('source_message_id, url, title, description, og_image_url')
          .is('archived_at', null)
          .in('source_message_id', batch);

        for (const l of (links ?? []) as any[]) {
          const mid = String(l.source_message_id ?? '');
          if (!mid) continue;
          (linksByMessageId[mid] ??= []).push({
            url: l.url,
            title: l.title ?? null,
            description: l.description ?? null,
            og_image_url: l.og_image_url ?? null,
          });
        }
      }
    }

    // 4. Assemble tasks with tags and links
    const tasks: BriefTask[] = rows.map((r) => {
      const id = String(r.id ?? '');
      const mid = String(r.source_message_id ?? '');
      return {
        id,
        title: String(r.title ?? ''),
        status: String(r.status ?? 'todo'),
        notes: r.notes ? String(r.notes) : null,
        summary: r.summary ? String(r.summary) : null,
        source_message_id: mid || null,
        created_at: r.created_at ? String(r.created_at) : null,
        updated_at: r.updated_at ? String(r.updated_at) : null,
        tags: tagsByTaskId[id] ?? [],
        links: mid ? (linksByMessageId[mid] ?? []) : [],
      };
    });

    // 5. Group by area → feature
    const areaMap = new Map<string, Map<string, BriefTask[]>>();
    const ungroupedFeatureMap = new Map<string, BriefTask[]>();
    let hasUngrouped = false;

    for (const task of tasks) {
      const areas = task.tags.filter((t) => t.category === 'area').map((t) => t.name);
      const features = task.tags.filter((t) => t.category === 'feature').map((t) => t.name);
      const featureKey = features.length > 0 ? features : ['(General)'];

      if (areas.length === 0) {
        hasUngrouped = true;
        for (const f of featureKey) {
          const list = ungroupedFeatureMap.get(f) ?? [];
          list.push(task);
          ungroupedFeatureMap.set(f, list);
        }
      } else {
        for (const area of areas) {
          if (!areaMap.has(area)) areaMap.set(area, new Map());
          const featureMap = areaMap.get(area)!;
          for (const f of featureKey) {
            const list = featureMap.get(f) ?? [];
            list.push(task);
            featureMap.set(f, list);
          }
        }
      }
    }

    // Convert to sorted arrays
    const grouped: BriefAreaGroup[] = [];

    const sortedAreas = Array.from(areaMap.keys()).sort();
    for (const area of sortedAreas) {
      const featureMap = areaMap.get(area)!;
      const featureGroups: BriefFeatureGroup[] = [];
      const sortedFeatures = Array.from(featureMap.keys()).sort((a, b) => {
        if (a === '(General)') return 1;
        if (b === '(General)') return -1;
        return a.localeCompare(b);
      });
      for (const feature of sortedFeatures) {
        featureGroups.push({ feature, tasks: featureMap.get(feature)! });
      }
      grouped.push({ area, featureGroups });
    }

    // Add ungrouped section
    if (hasUngrouped) {
      const featureGroups: BriefFeatureGroup[] = [];
      const sortedFeatures = Array.from(ungroupedFeatureMap.keys()).sort((a, b) => {
        if (a === '(General)') return 1;
        if (b === '(General)') return -1;
        return a.localeCompare(b);
      });
      for (const feature of sortedFeatures) {
        featureGroups.push({ feature, tasks: ungroupedFeatureMap.get(feature)! });
      }
      grouped.push({ area: '(Ungrouped)', featureGroups });
    }

    return NextResponse.json({
      ok: true,
      grouped,
      totalTasks: tasks.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[/api/brief] error:', e);
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

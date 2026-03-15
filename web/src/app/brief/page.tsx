'use client';

import { useEffect, useState } from 'react';

type TaskLink = { url: string; title: string | null; description: string | null; og_image_url: string | null };
type TaskTag = { id: string; name: string; category: string };

type BriefTask = {
  id: string;
  title: string;
  status: string;
  notes: string | null;
  summary: string | null;
  tags: TaskTag[];
  links: TaskLink[];
};

type BriefFeatureGroup = { feature: string; tasks: BriefTask[] };
type BriefAreaGroup = { area: string; featureGroups: BriefFeatureGroup[] };

const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do',
  discussed: 'Discussed',
  done: 'Done',
};

const STATUS_ICONS: Record<string, string> = {
  todo: '\u2610',      // ☐
  discussed: '\u2690',  // ⚐
  done: '\u2611',       // ☑
};

function statusLabel(s: string) {
  return STATUS_LABELS[s] ?? s;
}

function statusIcon(s: string) {
  return STATUS_ICONS[s] ?? '\u2610';
}

function buildPlainText(grouped: BriefAreaGroup[], generatedAt: string): string {
  const lines: string[] = [];
  const date = new Date(generatedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  lines.push(`HOME DESIGN BRIEF — ${date}`);
  lines.push('');

  for (const area of grouped) {
    const areaLabel = area.area === '(Ungrouped)' ? 'Other Items' : area.area;
    lines.push(areaLabel.toUpperCase());
    lines.push('');

    for (const fg of area.featureGroups) {
      if (fg.feature !== '(General)') {
        lines.push(fg.feature);
        lines.push('');
      }

      for (const task of fg.tasks) {
        lines.push(`• ${task.title}`);

        if (task.notes) {
          for (const nl of task.notes.split('\n')) {
            if (nl.trim()) lines.push(`  ${nl}`);
          }
        }

        if (task.links.length > 0) {
          for (const link of task.links) {
            lines.push(`  ${link.title || link.url}`);
            if (link.title) lines.push(`  ${link.url}`);
          }
        }

        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

export default function BriefPage() {
  const [grouped, setGrouped] = useState<BriefAreaGroup[]>([]);
  const [totalTasks, setTotalTasks] = useState(0);
  const [generatedAt, setGeneratedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/brief', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
        setGrouped(json.grouped ?? []);
        setTotalTasks(json.totalTasks ?? 0);
        setGeneratedAt(json.generatedAt ?? new Date().toISOString());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function copyToClipboard() {
    const text = buildPlainText(grouped, generatedAt);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const dateStr = generatedAt
    ? new Date(generatedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  return (
    <div className="brief-page">
      {/* Action bar — hidden when printing */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <a
          href="/"
          className="rounded-lg border border-cream-400 bg-cream-100 px-3 py-2 text-sm text-cream-900 hover:bg-cream-200"
        >
          ← Back to Tracker
        </a>
        <div className="flex items-center gap-2">
          <button
            onClick={copyToClipboard}
            className="rounded-lg border border-cream-400 bg-cream-100 px-4 py-2 text-sm text-cream-900 hover:bg-cream-200"
          >
            {copied ? 'Copied!' : 'Copy as Text'}
          </button>
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-wood-500 px-4 py-2 text-sm font-medium text-white hover:bg-wood-600"
          >
            Print / Save PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-cream-600">Generating brief...</div>
      ) : error ? (
        <div className="rounded-xl border border-terra-400/30 bg-terra-400/10 p-4 text-sm text-terra-600">
          {error}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Header */}
          <header className="border-b-2 border-cream-400 pb-4">
            <h1 className="font-[var(--font-eb-garamond)] text-3xl font-semibold tracking-tight text-cream-950">
              Home Design Brief
            </h1>
            <p className="mt-1 text-sm text-cream-600">
              {dateStr} — {totalTasks} task{totalTasks !== 1 ? 's' : ''}
            </p>
          </header>

          {/* Grouped content */}
          {grouped.map((areaGroup) => (
            <section key={areaGroup.area} className="break-inside-avoid-page">
              {/* Area heading */}
              <div className="mb-4 border-b border-cream-300 pb-2">
                <h2 className="font-[var(--font-eb-garamond)] text-xl font-semibold text-cream-950">
                  {areaGroup.area === '(Ungrouped)' ? 'Other Items' : areaGroup.area}
                </h2>
              </div>

              <div className="space-y-5">
                {areaGroup.featureGroups.map((fg) => (
                  <div key={fg.feature} className="break-inside-avoid">
                    {/* Feature sub-heading */}
                    {fg.feature !== '(General)' ? (
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-cream-700">
                        {fg.feature}
                      </h3>
                    ) : null}

                    <div className="space-y-3">
                      {fg.tasks.map((task) => {
                        const topics = task.tags.filter((t) => t.category === 'topic');
                        return (
                          <div
                            key={task.id}
                            className="rounded-lg border border-cream-300 bg-cream-50/50 p-4 print:border-cream-400 print:bg-white"
                          >
                            {/* Task title + status */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2">
                                <span className="mt-0.5 text-base" aria-hidden>
                                  {statusIcon(task.status)}
                                </span>
                                <span className="text-base font-medium text-cream-950">
                                  {task.title}
                                </span>
                              </div>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                  task.status === 'done'
                                    ? 'bg-sage-200 text-sage-800'
                                    : task.status === 'discussed'
                                    ? 'bg-wood-100 text-wood-700'
                                    : 'bg-cream-200 text-cream-700'
                                }`}
                              >
                                {statusLabel(task.status)}
                              </span>
                            </div>

                            {/* Notes */}
                            {task.notes ? (
                              <div className="mt-2 whitespace-pre-wrap pl-6 text-sm text-cream-800">
                                {task.notes}
                              </div>
                            ) : null}

                            {/* Links */}
                            {task.links.length > 0 ? (
                              <div className="mt-3 pl-6">
                                <div className="mb-1 text-xs font-medium text-cream-600">Links</div>
                                <ul className="space-y-1">
                                  {task.links.map((link, i) => (
                                    <li key={i} className="text-sm">
                                      <a
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-wood-600 underline underline-offset-2 hover:text-wood-700 print:text-cream-950 print:no-underline"
                                      >
                                        {link.title || link.url}
                                      </a>
                                      {/* Show URL below title in print so it's visible on paper */}
                                      {link.title ? (
                                        <span className="hidden text-xs text-cream-500 print:block">
                                          {link.url}
                                        </span>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            {/* Topic tags */}
                            {topics.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-1 pl-6">
                                {topics.map((tag) => (
                                  <span
                                    key={tag.id}
                                    className="rounded-full border border-cream-300 px-2 py-0.5 text-[10px] text-cream-600"
                                  >
                                    {tag.name}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {grouped.length === 0 ? (
            <div className="rounded-xl border border-dashed border-cream-400 p-8 text-center text-sm text-cream-600">
              No tasks to include in the brief. Add tasks to your board first.
            </div>
          ) : null}
        </div>
      )}

      {/* Print-specific styles */}
      <style jsx global>{`
        @media print {
          /* Hide the app shell (sidebar, nav) */
          body > div > div > aside,
          .print\\:hidden {
            display: none !important;
          }
          /* Make the main content full-width */
          body > div > div {
            display: block !important;
            max-width: none !important;
            padding: 0 !important;
          }
          body > div > div > main {
            border: none !important;
            background: white !important;
            box-shadow: none !important;
            padding: 20px !important;
            border-radius: 0 !important;
          }
          /* Clean background */
          body > div > div > div[style] {
            display: none !important;
          }
          body {
            background: white !important;
          }
          .brief-page {
            max-width: 700px;
          }
        }
      `}</style>
    </div>
  );
}

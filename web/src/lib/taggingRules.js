/**
 * Tagging rules engine scaffold (TASK-004).
 *
 * NOTE: This is intentionally NOT wired into extraction yet.
 */

/**
 * @typedef {"from"|"subject"|"body"} RuleField
 * @typedef {{ field: RuleField, includes: string, tag: string, priority: number }} TagRule
 */

/**
 * Compute suggested tag names from email metadata.
 *
 * - Additive: multiple rules can match.
 * - Precedence: higher priority first (but we keep all matches).
 * - Case-insensitive includes match.
 */
export function computeSuggestedTagNames({ from, subject, body }, rules) {
  const hay = {
    from: String(from ?? "").toLowerCase(),
    subject: String(subject ?? "").toLowerCase(),
    body: String(body ?? "").toLowerCase(),
  };

  const matches = [];
  for (const r of rules ?? []) {
    const needle = String(r.includes ?? "").toLowerCase().trim();
    if (!needle) continue;

    const field = r.field;
    if (field !== "from" && field !== "subject" && field !== "body") continue;

    if (hay[field].includes(needle)) {
      matches.push(r);
    }
  }

  matches.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const out = [];
  const seen = new Set();
  for (const r of matches) {
    const tag = String(r.tag ?? "").trim();
    if (!tag) continue;
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }

  return out;
}

/**
 * Placeholder ruleset. Keep empty to ensure no behavior change.
 *
 * @type {TagRule[]}
 */
export const TAG_RULES_V0 = [];

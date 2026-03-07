function stripPrefixes(subject: string) {
  return subject.replace(/^(\s*)(re:|fw:|fwd:)+\s*/gi, '').trim();
}

function looksLikeNewsletter(from: string, subject: string) {
  const hay = `${from} ${subject}`.toLowerCase();
  return (
    hay.includes('unsubscribe') ||
    hay.includes('newsletter') ||
    hay.includes('no-reply') ||
    hay.includes('noreply') ||
    hay.includes('do-not-reply')
  );
}

export type ExtractedTask = {
  title: string;
  notes?: string;
  status: 'open' | 'done';
  skipReason?: string;
};

export function extractTaskFromAgentmailMessage(row: Record<string, unknown>): ExtractedTask {
  const subject = String(row.subject ?? '').trim();
  const from = String(row.from ?? '').trim();
  const text = String(row.text ?? '').trim();

  const cleanSubject = stripPrefixes(subject || '(no subject)');

  if (looksLikeNewsletter(from, cleanSubject)) {
    return { title: cleanSubject, status: 'open', skipReason: 'newsletter-like' };
  }

  // MVP heuristic: title = subject; notes = first ~3 lines of text
  const notes = text
    ? text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join('\n')
    : undefined;

  return {
    title: cleanSubject.slice(0, 120),
    notes,
    status: 'open',
  };
}

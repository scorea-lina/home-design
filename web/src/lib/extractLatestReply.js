/**
 * Extract the newest reply content from an email-like body.
 *
 * Goal: strip quoted history / reply-all chains so extraction only uses the top-most
 * newly-written content.
 */
export function extractLatestReply(rawText) {
  const text = String(rawText ?? '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');

  // 1) Remove leading quote-prefix lines (common in plain-text replies)
  const withoutLeadingQuotes = [];
  let started = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!started) {
      if (trimmed === '') continue;
      if (/^>+\s?/.test(trimmed)) continue;
      started = true;
    }
    withoutLeadingQuotes.push(line);
  }

  const candidate = withoutLeadingQuotes.join('\n');

  // 2) Split on common reply separators.
  const splitters = [
    /\nOn .+ wrote:\n/i,
    /\n-----Original Message-----\n/i,
    /\n_{2,}\n/i,
  ];

  let head = candidate;
  for (const re of splitters) {
    const m = head.match(re);
    if (m && typeof m.index === 'number' && m.index >= 0) {
      head = head.slice(0, m.index);
    }
  }

  // 3) Forwarded header blocks (Outlook/Gmail forwards)
  // Detect a header block start; if found, cut everything from that line onward.
  const headerStart = head.match(/\n(?:From|Sent|To|Subject):\s.+\n/i);
  if (headerStart && typeof headerStart.index === 'number') {
    head = head.slice(0, headerStart.index);
  }

  // 4) Remove trailing quoted lines that start with ">" (common quote blocks)
  const tailLines = head.split('\n');
  while (tailLines.length) {
    const last = tailLines[tailLines.length - 1].trim();
    if (last === '' || /^>+\s?/.test(last)) {
      tailLines.pop();
      continue;
    }
    break;
  }

  return tailLines.join('\n').trim();
}

/**
 * Apply extractLatestReply, with a fallback to the original text when the extracted
 * portion is empty/too short.
 */
export function extractLatestReplyWithFallback(rawText, { minNonWhitespaceChars = 40 } = {}) {
  const original = String(rawText ?? '').trim();
  const extracted = extractLatestReply(original);
  const extractedLen = extracted.replace(/\s+/g, '').length;
  if (!extracted || extractedLen < minNonWhitespaceChars) return original;
  return extracted;
}

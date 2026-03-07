export type OpenAIExtractResult = {
  actionable: boolean;
  title?: string;
  notes?: string;
  areas?: string[];
  topics?: string[];
  confidence?: 'high' | 'low';
};

export async function extractWithOpenAI(input: {
  subject: string;
  from: string;
  to: string;
  text: string;
  allowedAreas: string[];
  allowedTopics: string[];
}): Promise<OpenAIExtractResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  const prompt = `You are extracting actionable tasks for a home design project hub.

Return STRICT JSON ONLY (no markdown) with this schema:
{
  "actionable": boolean,
  "title": string | null,
  "notes": string | null,
  "areas": string[],
  "topics": string[],
  "confidence": "high" | "low"
}

Rules:
- Only set actionable=true if the email contains a concrete next step/ask/decision needed.
- Prefer to skip newsletters/marketing/receipts.
- title: short imperative.
- notes: 1-3 bullets in plain text (use '\n' between bullets), or null.
- areas/topics MUST be chosen ONLY from the allowed lists.
- If none apply, return empty arrays.

Allowed Areas:
${input.allowedAreas.map((x) => `- ${x}`).join('\n')}

Allowed Topics:
${input.allowedTopics.map((x) => `- ${x}`).join('\n')}

Email:
Subject: ${input.subject}
From: ${input.from}
To: ${input.to}
Body:\n${input.text}
`;

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
      input: prompt,
      temperature: 0.2,
      max_output_tokens: 400,
    }),
  });

  const json = (await res.json()) as unknown;
  const j = json as {
    error?: { message?: string };
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };

  if (!res.ok) {
    const msg = j?.error?.message ?? `OpenAI error HTTP ${res.status}`;
    throw new Error(msg);
  }

  const textOut: string =
    j.output_text ??
    j.output?.map((o) => o?.content?.map((c) => c?.text ?? '').join('')).join('') ??
    '';

  let parsed: unknown;
  try {
    parsed = JSON.parse(textOut) as unknown;
  } catch {
    throw new Error(`OpenAI returned non-JSON: ${textOut.slice(0, 200)}`);
  }

  const p = parsed as Partial<{
    actionable: unknown;
    title: unknown;
    notes: unknown;
    areas: unknown;
    topics: unknown;
    confidence: unknown;
  }>;

  const actionable = !!p.actionable;
  const areas = Array.isArray(p.areas) ? p.areas.filter((x): x is string => typeof x === 'string') : [];
  const topics = Array.isArray(p.topics) ? p.topics.filter((x): x is string => typeof x === 'string') : [];

  return {
    actionable,
    title: typeof p.title === 'string' ? p.title : undefined,
    notes: typeof p.notes === 'string' ? p.notes : undefined,
    areas,
    topics,
    confidence: p.confidence === 'high' ? 'high' : 'low',
  };
}

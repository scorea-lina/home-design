export type OpenAITaskItem = {
  title: string;
  notes?: string;
  areas?: string[];
  topics?: string[];
};

export type OpenAIExtractResult = {
  actionable: boolean;
  tasks: OpenAITaskItem[];
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
  // Accept a project-specific alias (seen in some local setups) to avoid reconfig churn.
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.HOMEDESIGN_OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  const prompt = `You are extracting actionable tasks for a home design project hub.

Return STRICT JSON ONLY (no markdown) with this schema:
{
  "actionable": boolean,
  "tasks": [
    {
      "title": string,
      "notes": string | null,
      "areas": string[],
      "topics": string[]
    }
  ],
  "confidence": "high" | "low"
}

Rules:
- Set actionable=false for newsletters, marketing, receipts, automated notifications; return tasks=[].
- If actionable=true, return ONE task object per distinct action item in the email.
  - Example: "Notes on utility closet and shower shelf" → two tasks: one for utility closet, one for shower shelf.
- title: short imperative phrase per task (e.g. "Finalize shower shelf design").
- notes: 1-3 bullets for that specific action item in plain text (use '\\n' between bullets), or null.
- areas/topics MUST be chosen ONLY from the allowed lists below.
- For each task, choose 1-2 Areas and 1-2 Topics even if low confidence (best guess from context).
- Synonyms: "cabinets" → Kitchen, "shower" → Primary Bath or Secondary Bath, "closet" → Storage/Utility, "budget/quote/invoice/pricing" → Budget topic.

Allowed Areas:
${input.allowedAreas.map((x) => `- ${x}`).join('\n')}

Allowed Topics:
${input.allowedTopics.map((x) => `- ${x}`).join('\n')}

Email:
Subject: ${input.subject}
From: ${input.from}
To: ${input.to}
Body:
${input.text}
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
      max_output_tokens: 800,
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
    tasks: unknown;
    confidence: unknown;
  }>;

  const actionable = !!p.actionable;
  const rawTasks = Array.isArray(p.tasks) ? p.tasks : [];

  const tasks: OpenAITaskItem[] = rawTasks.map((t) => {
    const item = t as Partial<{ title: unknown; notes: unknown; areas: unknown; topics: unknown }>;
    return {
      title: typeof item.title === 'string' ? item.title.trim() : '',
      notes: typeof item.notes === 'string' ? item.notes : undefined,
      areas: Array.isArray(item.areas) ? item.areas.filter((x): x is string => typeof x === 'string') : [],
      topics: Array.isArray(item.topics) ? item.topics.filter((x): x is string => typeof x === 'string') : [],
    };
  }).filter((t) => t.title.length > 0);

  return {
    actionable,
    tasks,
    confidence: p.confidence === 'high' ? 'high' : 'low',
  };
}

import { type SessionSummary } from "@/lib/summaryStore";
import { logUsage } from "@/lib/usageDb";

export const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Primary first; fallback is tried on quota/billing failures (e.g. 429
// "prepayment credits depleted") so summaries degrade gracefully.
export const API_KEYS = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_FALLBACK].filter(
  (key): key is string => Boolean(key)
);

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export interface SummaryMeta {
  name?: string;
  command?: string;
  directory?: string;
}

async function callGemini(clean: string, apiKey: string, meta?: SummaryMeta) {
  const metaLines = [
    meta?.name ? `Terminal name: ${meta.name}` : "",
    meta?.command ? `Launch command: ${meta.command}` : "",
    meta?.directory ? `Working directory: ${meta.directory}` : "",
  ].filter(Boolean);
  const userText = metaLines.length > 0 ? `${metaLines.join("\n")}\n---\n${clean}` : clean;

  return fetch(GEMINI_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: "You summarize terminal/tmux logs for a developer dashboard that reminds them what each session is doing. Return strict compact JSON only with keys: summary, current_goal, recent_actions, blockers, important_commands, next_step. The summary MUST name the subject of the work — the project, repo, branch, feature, bug, or task being worked on, inferred from paths, branch names, file names, commands, and output — not just the actions. 'Cleaned up worktree and merged PR' is bad; 'Merged auth-refactor PR in mission-control, cleaned up its worktree' is good. Keep summary under 22 words. current_goal should state the overarching objective of the session. recent_actions, blockers, important_commands must be arrays of strings. Ignore ANSI artifacts, prompts, repeated empty lines, and progress noise unless meaningful.",
          },
        ],
      },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 350,
        responseMimeType: "application/json",
      },
    }),
  });
}

export async function summarizeWithGemini(
  clean: string,
  contentHash: string,
  sessionId: string | null = null,
  meta?: SummaryMeta
): Promise<SessionSummary | null> {
  let response: Response | null = null;
  for (const apiKey of API_KEYS) {
    response = await callGemini(clean, apiKey, meta);
    if (response.ok) break;
    // Try the next key on quota/billing/auth failures only.
    if (![401, 403, 429].includes(response.status)) break;
  }
  if (!response || !response.ok) {
    throw new Error(`Gemini summarizer failed: ${response?.status ?? "no API key configured"}`);
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
    };
  };

  // Exact spend from the API, not an estimate — one log row per call.
  const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens =
    (data.usageMetadata?.candidatesTokenCount ?? 0) + (data.usageMetadata?.thoughtsTokenCount ?? 0);
  if (inputTokens || outputTokens) {
    logUsage(sessionId, GEMINI_MODEL, inputTokens, outputTokens);
  }

  const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!content) return null;

  const parsed = parseJsonObject(content) as
    | {
        summary?: unknown;
        current_goal?: unknown;
        recent_actions?: unknown;
        blockers?: unknown;
        important_commands?: unknown;
        next_step?: unknown;
      }
    | null;

  if (!parsed || typeof parsed.summary !== "string") return null;

  return {
    summary: parsed.summary,
    current_goal: typeof parsed.current_goal === "string" ? parsed.current_goal : "",
    recent_actions: Array.isArray(parsed.recent_actions)
      ? parsed.recent_actions.filter(Boolean).map(String)
      : [],
    blockers: Array.isArray(parsed.blockers) ? parsed.blockers.filter(Boolean).map(String) : [],
    important_commands: Array.isArray(parsed.important_commands)
      ? parsed.important_commands.filter(Boolean).map(String)
      : [],
    next_step: typeof parsed.next_step === "string" ? parsed.next_step : "",
    model: GEMINI_MODEL,
    updatedAt: Date.now(),
    contentHash,
  };
}

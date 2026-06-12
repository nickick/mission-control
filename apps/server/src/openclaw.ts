// Proxy to a local OpenClaw gateway (the dockerized instance, published on
// the host loopback). The gateway token stays server-side; remote clients
// authenticate to this server with the mission-control bearer token and
// never see the OpenClaw token.

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL ?? "http://127.0.0.1:3200";
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN ?? "";
export const DEFAULT_AGENT = process.env.OPENCLAW_DEFAULT_AGENT ?? "openclaw/chief-of-staff";

// The gateway carries conversation memory per session key, passed as a
// header (format: agent:<agentId>:<sessionId>). With it set, clients send
// only the new turn — the agent owns history server-side.
function sessionHeader(sessionKey?: string): Record<string, string> {
  return sessionKey ? { "x-openclaw-session-key": sessionKey } : {};
}

export function openclawConfigured(): boolean {
  return Boolean(GATEWAY_TOKEN);
}

// Non-streaming calls get a total-time cap. Streaming calls pass 0 (no cap):
// an agent that runs tools can legitimately stream for minutes, and a fixed
// timeout would abort it mid-response.
async function gatewayFetch(path: string, init?: RequestInit, timeoutMs = 120_000): Promise<Response> {
  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await fetch(`${GATEWAY_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${GATEWAY_TOKEN}`,
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface OpenclawModel {
  id: string;
}

export async function listAgents(): Promise<string[]> {
  const res = await gatewayFetch("/v1/models");
  if (!res.ok) throw new Error(`gateway ${res.status}`);
  const data = (await res.json()) as { data?: OpenclawModel[] };
  return (data.data ?? [])
    .map((m) => m.id)
    .filter((id) => id.startsWith("openclaw/"));
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Open a streaming completion against the gateway. Returns the raw gateway
// Response so the caller can pipe its SSE body straight through.
export async function chatStream(
  messages: ChatMessage[],
  agent: string,
  sessionKey?: string
): Promise<Response> {
  const model = agent.startsWith("openclaw/") ? agent : `openclaw/${agent}`;
  return gatewayFetch(
    "/v1/chat/completions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sessionHeader(sessionKey) },
      body: JSON.stringify({ model, messages, stream: true }),
    },
    0 // no total-time cap for streaming
  );
}

// The OpenClaw agent backend is occasionally flaky (transient "internal
// error" / empty replies). Retry a couple of times before giving up so a
// blip doesn't surface as a 502 on the phone.
const MAX_ATTEMPTS = 3;

export async function chat(
  messages: ChatMessage[],
  agent: string,
  sessionKey?: string
): Promise<{ content: string; model: string }> {
  const model = agent.startsWith("openclaw/") ? agent : `openclaw/${agent}`;
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await gatewayFetch("/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionHeader(sessionKey) },
        body: JSON.stringify({ model, messages, stream: false }),
      });
      if (!res.ok) {
        lastError = `gateway ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`;
        // 4xx (bad request/auth) won't fix on retry; fail fast.
        if (res.status < 500 && res.status !== 429) break;
      } else {
        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
          model?: string;
        };
        const content = data.choices?.[0]?.message?.content ?? "";
        if (content) return { content, model: data.model ?? model };
        lastError = "gateway returned an empty reply";
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  throw new Error(lastError || "gateway failed");
}

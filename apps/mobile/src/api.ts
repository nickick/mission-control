import type { AppConfig } from "./config";

export interface TmuxSession {
  name: string;
  windows: number;
  attached: boolean;
  createdAt: number;
}

async function request<T>(config: AppConfig, path: string, init?: RequestInit): Promise<T> {
  if (!config.serverUrl) {
    throw new Error("Server URL not configured — open Settings.");
  }
  const res = await fetch(`${config.serverUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${body.slice(0, 200) || res.statusText}`);
  }
  return (await res.json()) as T;
}

export function listSessions(config: AppConfig): Promise<{ sessions: TmuxSession[] }> {
  return request(config, "/tmux/sessions");
}

export function peekSession(
  config: AppConfig,
  session: string,
  lines = 80
): Promise<{ session: string; content: string }> {
  return request(
    config,
    `/tmux/peek?session=${encodeURIComponent(session)}&lines=${lines}`
  );
}

export function sendToSession(
  config: AppConfig,
  session: string,
  text: string,
  enter = true
): Promise<{ ok: boolean }> {
  return request(config, "/tmux/send", {
    method: "POST",
    body: JSON.stringify({ session, text, enter }),
  });
}

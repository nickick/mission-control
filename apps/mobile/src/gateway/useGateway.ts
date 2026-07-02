import { useEffect, useState } from "react";
import * as Crypto from "expo-crypto";
import { GatewayClient, type GatewayStatus, type GatewayEvent } from "./client";
import type { AppConfig } from "../config";

// Singleton gateway client keyed by URL+token so the whole app shares one
// authenticated WebSocket.

let client: GatewayClient | null = null;
let clientKey = "";
let lastStatus: GatewayStatus = { state: "connecting" };
const statusListeners = new Set<(s: GatewayStatus) => void>();
const eventListeners = new Set<(e: GatewayEvent) => void>();

function wsUrlFrom(httpUrl: string): string {
  return httpUrl.replace(/^http/i, "ws").replace(/\/+$/, "") + "/";
}

export function getGateway(config: AppConfig): GatewayClient {
  const key = `${config.gatewayUrl}|${config.token}`;
  if (client && clientKey === key) return client;
  if (client) client.stop();
  clientKey = key;
  client = new GatewayClient({
    url: wsUrlFrom(config.gatewayUrl),
    token: config.token,
    onStatus: (s) => {
      lastStatus = s;
      statusListeners.forEach((l) => l(s));
    },
    onEvent: (e) => eventListeners.forEach((l) => l(e)),
  });
  void client.start();
  return client;
}

export function useGatewayStatus(config: AppConfig): GatewayStatus {
  const [status, setStatus] = useState<GatewayStatus>(lastStatus);
  useEffect(() => {
    getGateway(config); // ensure started
    setStatus(lastStatus);
    statusListeners.add(setStatus);
    return () => {
      statusListeners.delete(setStatus);
    };
  }, [config.gatewayUrl, config.token]);
  return status;
}

export function onGatewayEvent(listener: (e: GatewayEvent) => void): () => void {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

// ── Domain helpers ──────────────────────────────────────────────────────────

export interface GatewaySessionInfo {
  key: string;
  label?: string;
  agentId?: string;
  updatedAt?: number;
}

export interface ChatContentPart {
  type?: string;
  text?: string;
}
export interface ChatMessageObj {
  role?: string;
  content?: ChatContentPart[] | string;
  id?: string;
  seq?: number;
}

export function messageText(message: ChatMessageObj | undefined): string {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .filter((p) => (p.type ?? "text") === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join("");
  }
  return "";
}

export function agentIdOf(agent: string): string {
  return agent.replace(/^openclaw[:/]/, "");
}

export function makeSessionKey(agent: string): string {
  return `agent:${agentIdOf(agent)}:${Crypto.randomUUID()}`;
}

export async function listSessions(c: GatewayClient): Promise<GatewaySessionInfo[]> {
  const res = await c.request<{ sessions?: unknown[]; items?: unknown[] }>("sessions.list", {
    includeGlobal: true,
    includeUnknown: false,
    limit: 100,
  });
  const rows = (res?.sessions ?? res?.items ?? []) as Record<string, unknown>[];
  return rows.map((r) => ({
    key: String(r.key ?? r.sessionKey ?? ""),
    label: typeof r.label === "string" ? r.label : undefined,
    agentId: typeof r.agentId === "string" ? r.agentId : undefined,
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : undefined,
  })).filter((s) => s.key);
}

export async function createSession(c: GatewayClient, key: string, label?: string): Promise<void> {
  await c.request("sessions.create", { key, label });
}

export async function fetchHistory(c: GatewayClient, sessionKey: string): Promise<ChatMessageObj[]> {
  const res = await c.request<{ messages?: ChatMessageObj[]; items?: ChatMessageObj[] }>(
    "chat.history",
    { sessionKey },
  );
  return (res?.messages ?? res?.items ?? []) as ChatMessageObj[];
}

export async function subscribeSessionMessages(c: GatewayClient, sessionKey: string): Promise<void> {
  await c.request("sessions.messages.subscribe", { key: sessionKey });
}

// Broad session-events subscription — required to receive session.tool (live
// tool-call activity) in addition to session.message.
export async function subscribeSessionEvents(c: GatewayClient): Promise<void> {
  await c.request("sessions.subscribe", {});
}

export async function sendChat(c: GatewayClient, sessionKey: string, message: string): Promise<void> {
  await c.request("chat.send", {
    sessionKey,
    message,
    thinking: "",
    idempotencyKey: Crypto.randomUUID(),
    timeoutMs: 30000,
  });
}

export async function abortChat(c: GatewayClient, sessionKey: string, runId: string): Promise<void> {
  await c.request("chat.abort", { sessionKey, runId });
}

import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { logUsage, usageLogIsEmpty, usageTotals } from "@/lib/usageDb";

// Server-side store for terminal session summaries. Summaries persist to a
// JSON file; per-call token usage lives in the SQLite log (usageDb).

const STORE_DIR = path.join(os.homedir(), ".mission-control");
const STORE_FILE = path.join(STORE_DIR, "summary-store.json");

// Automatic summaries at most once an hour per terminal; the "Summarize
// now" button bypasses this gate for on-demand updates.
export const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
export const MIN_CONTENT_CHARS = 500;
const USAGE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 200;

// Gemini 2.5 Flash-Lite pricing, USD per million tokens.
const INPUT_COST_PER_M = 0.1;
const OUTPUT_COST_PER_M = 0.4;

export interface SessionSummary {
  summary: string;
  current_goal: string;
  recent_actions: string[];
  blockers: string[];
  important_commands: string[];
  next_step: string;
  model: string;
  updatedAt: number;
  contentHash: string;
}

export interface UsageWindow {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface UsageStats {
  last24h: UsageWindow;
  lifetime: UsageWindow & { since: number | null };
}

interface LegacyUsageEntry {
  at: number;
  inputTokens: number;
  outputTokens: number;
}

interface StoreData {
  sessions: Record<string, SessionSummary>;
}

interface StoreState {
  data: StoreData;
  loaded: boolean;
  writeQueued: boolean;
}

// Survive Next.js dev-server module reloads with a single shared instance.
// Versioned: bump when the store schema changes so a stale HMR singleton
// (loaded under the old schema) is abandoned and the disk migration runs.
const GLOBAL_KEY = Symbol.for("mission-control.summaryStore.v2");
const globalAny = globalThis as { [GLOBAL_KEY]?: StoreState };

function getState(): StoreState {
  if (!globalAny[GLOBAL_KEY]) {
    globalAny[GLOBAL_KEY] = {
      data: { sessions: {} },
      loaded: false,
      writeQueued: false,
    };
  }
  return globalAny[GLOBAL_KEY];
}

async function ensureLoaded(): Promise<StoreState> {
  const state = getState();
  if (state.loaded) return state;
  state.loaded = true;
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as {
      sessions?: Record<string, SessionSummary>;
      usage?: LegacyUsageEntry[];
    };
    state.data.sessions = parsed.sessions ?? {};
    // One-time migration: move the old JSON usage ledger into SQLite.
    if (Array.isArray(parsed.usage) && parsed.usage.length > 0 && usageLogIsEmpty()) {
      for (const entry of parsed.usage) {
        logUsage(null, "gemini-2.5-flash-lite", entry.inputTokens, entry.outputTokens, entry.at);
      }
      schedulePersist(state); // rewrite the file without the legacy fields
    }
  } catch {
    // Missing or corrupt file — start fresh.
  }
  return state;
}

function pruneSessions(state: StoreState) {
  const entries = Object.entries(state.data.sessions);
  if (entries.length <= MAX_SESSIONS) return;
  entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  state.data.sessions = Object.fromEntries(entries.slice(0, MAX_SESSIONS));
}

function schedulePersist(state: StoreState) {
  if (state.writeQueued) return;
  state.writeQueued = true;
  setTimeout(() => {
    state.writeQueued = false;
    void (async () => {
      try {
        await fs.mkdir(STORE_DIR, { recursive: true });
        await fs.writeFile(STORE_FILE, JSON.stringify(state.data), "utf8");
      } catch {
        // Persistence is best-effort; in-memory state remains authoritative.
      }
    })();
  }, 250);
}

export function hashContent(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return `${text.length}:${hash}`;
}

export async function getCachedSummary(sessionId: string): Promise<SessionSummary | null> {
  const state = await ensureLoaded();
  return state.data.sessions[sessionId] ?? null;
}

// A refresh is due only when the content changed, is substantial enough,
// and the per-session interval has elapsed. In-flight dedup is handled by
// the BullMQ queue (one job per sessionId).
export async function shouldRefresh(sessionId: string, contentHash: string, contentLength: number): Promise<boolean> {
  const state = await ensureLoaded();
  if (contentLength < MIN_CONTENT_CHARS) return false;
  const cached = state.data.sessions[sessionId];
  if (!cached) return true;
  if (cached.contentHash === contentHash) return false;
  return Date.now() - cached.updatedAt >= REFRESH_INTERVAL_MS;
}

export async function setCachedSummary(sessionId: string, summary: SessionSummary) {
  const state = await ensureLoaded();
  state.data.sessions[sessionId] = summary;
  pruneSessions(state);
  schedulePersist(state);
}

function toWindow(calls: number, inputTokens: number, outputTokens: number): UsageWindow {
  const costUsd =
    (inputTokens / 1_000_000) * INPUT_COST_PER_M + (outputTokens / 1_000_000) * OUTPUT_COST_PER_M;
  return { calls, inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, costUsd };
}

export async function getUsageStats(): Promise<UsageStats> {
  await ensureLoaded(); // runs the legacy-ledger migration if needed
  const day = usageTotals(Date.now() - USAGE_WINDOW_MS);
  const all = usageTotals();
  return {
    last24h: toWindow(day.calls, day.inputTokens, day.outputTokens),
    lifetime: { ...toWindow(all.calls, all.inputTokens, all.outputTokens), since: all.since },
  };
}

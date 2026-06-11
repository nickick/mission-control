"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;:?]*[a-zA-Z]/g;
const OSC_REGEX = /\x1b\][0-9;]*\x07/g;
const PLACEHOLDER_SUMMARIES = new Set(["Waiting for activity...", "running...", "idle"]);

interface ModelSummaryResponse {
  summary?: unknown;
  current_goal?: unknown;
  recent_actions?: unknown;
  blockers?: unknown;
  important_commands?: unknown;
  next_step?: unknown;
  updatedAt?: unknown;
  queued?: unknown;
}

// Poll cadence for the local summarize API. Responses are served from the
// server-side cache; actual Gemini refreshes are gated server-side (5-minute
// per-session interval, 5/minute global queue cap), so polling is cheap.
const MODEL_POLL_MS = 30000;
const MODEL_POLL_PENDING_MS = 5000;

function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "").replace(OSC_REGEX, "");
}

// Collapse absolute home paths (local or remote) to ~.
function collapseHome(dir: string): string {
  return dir.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, "~");
}

// Current working directory of the session. Prefer OSC 7 sequences
// (\x1b]7;file://host/path — emitted by most shells on cd, exact), falling
// back to scraping the directory out of the last prompt line.
function extractDirectory(raw: string): string | undefined {
  const osc7 = /\x1b\]7;file:\/\/[^/\x07\x1b]*([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
  let dir: string | undefined;
  for (let m = osc7.exec(raw); m; m = osc7.exec(raw)) {
    if (m[1]) {
      try {
        dir = decodeURIComponent(m[1]);
      } catch {
        dir = m[1];
      }
    }
  }
  if (!dir) dir = parseTerminalContext(raw)?.directory;
  if (!dir) return undefined;
  return collapseHome(dir.trim());
}

interface TerminalContext {
  state: "idle" | "running" | "waiting";
  branch?: string;
  directory?: string;
  command?: string;
  process?: string;
  host?: string;
}

function parseTerminalContext(buffer: string): TerminalContext | null {
  if (buffer.length < 20) return null;

  const text = stripAnsi(buffer);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;

  const lastLine = lines[lines.length - 1].trimEnd();
  const recent = lines.slice(-30).join("\n");

  // ── Detect prompt state ─────────────────────────────────────────────
  // Idle: line ends with $ % # > (common shell prompt endings)
  const idlePromptMatch = /[$%#>](?:\s*)$/.test(lastLine);

  // Waiting: interactive prompts
  const waitingMatch =
    /\?\s*$/.test(lastLine) ||
    /\[.*\]\s*$/.test(lastLine) ||
    /\(y\/N\)\s*$/i.test(lastLine);

  let state: TerminalContext["state"] = "running";
  if (idlePromptMatch) state = "idle";
  else if (waitingMatch) state = "waiting";

  // ── Extract host / directory from prompt ────────────────────────────
  let directory: string | undefined;
  let host: string | undefined;
  let branch: string | undefined;

  // Pattern: user@host:~/path$  or  user@host:/path$
  const fullPrompt = lastLine.match(
    /([\w-]+)@([\w.-]+):([^$%#>]+)\s*[$%#>]/
  );
  if (fullPrompt) {
    host = fullPrompt[2];
    directory = fullPrompt[3].trim();
  } else {
    // Pattern: just ~/path$  or  /path%
    const pathOnly = lastLine.match(/([~/][^\s$%#>]*)\s*[$%#>]/);
    if (pathOnly) {
      directory = pathOnly[1];
    }
  }

  // ── Extract git branch from prompt ──────────────────────────────────
  // Look for (branch) or [branch] BEFORE the prompt char on the same line
  const branchInPrompt = lastLine.match(/\(([\w/.@-]+)\)(?:\s*[$%#>])/);
  if (branchInPrompt) branch = branchInPrompt[1];

  const branchInPrompt2 = lastLine.match(/\[([\w/.@-]+)\](?:\s*[$%#>])/);
  if (!branch && branchInPrompt2) branch = branchInPrompt2[1];

  // Fallback: look for "* main" or "* feature/auth" in recent git branch output
  if (!branch) {
    const gitOut = recent.match(/^\*\s+([\w/.@-]+)$/m);
    if (gitOut) branch = gitOut[1];
  }

  // ── Detect running process ──────────────────────────────────────────
  let process: string | undefined;
  let command: string | undefined;

  // Our own "[running: cmd]" marker
  const runningMarker = recent.match(/\[running:\s*([^\]]+)\]/);
  if (runningMarker) command = runningMarker[1].trim();

  // Detect known processes from recent buffer
  const processPatterns: { pattern: RegExp; name: (m: RegExpMatchArray) => string }[] = [
    { pattern: /npm run\s+(\S+)/i, name: (m) => `npm run ${m[1]}` },
    { pattern: /npm start/i, name: () => "npm start" },
    { pattern: /node\s+(\S+)/i, name: (m) => `node ${m[1]}` },
    { pattern: /python3?\s+(\S+)/i, name: (m) => `python ${m[1]}` },
    { pattern: /docker-compose\s+up/i, name: () => "docker-compose" },
    { pattern: /docker\s+run/i, name: () => "docker" },
    { pattern: /cargo\s+run/i, name: () => "cargo run" },
    { pattern: /go\s+run/i, name: () => "go run" },
    { pattern: /pnpm\s+(dev|start)/i, name: (m) => `pnpm ${m[1]}` },
    { pattern: /yarn\s+(dev|start)/i, name: (m) => `yarn ${m[1]}` },
    { pattern: /vite\b/i, name: () => "vite" },
    { pattern: /next\s+dev/i, name: () => "next dev" },
    { pattern: /tsc\s+--watch/i, name: () => "tsc --watch" },
    { pattern: /jest\s+--watch/i, name: () => "jest --watch" },
    { pattern: /esbuild\s+--watch/i, name: () => "esbuild --watch" },
    { pattern: /ssv\b/i, name: () => "ssh" },
    { pattern: /ssh\b/i, name: () => "ssh" },
    { pattern: /tmux\b/i, name: () => "tmux" },
    { pattern: /claude\b/i, name: () => "claude" },
  ];

  for (const { pattern, name } of processPatterns) {
    const m = recent.match(pattern);
    if (m) {
      process = name(m);
      break;
    }
  }

  if (command && !process) {
    process = command.split(" ")[0];
  }

  return { state, branch, directory, command, process, host };
}

function formatSummary(ctx: TerminalContext | null): string {
  if (!ctx) return "Waiting for activity...";

  const parts: string[] = [];

  if (ctx.state === "waiting") {
    parts.push("? waiting");
  } else if (ctx.state === "running" && ctx.process) {
    parts.push(ctx.process);
  }

  if (ctx.branch) {
    parts.push(ctx.branch);
  }

  // Directory is intentionally omitted — the hook always prefixes the
  // displayed summary with the tracked working directory.

  if (ctx.host) {
    parts.push(`@${ctx.host}`);
  }

  if (parts.length === 0) {
    return ctx.state === "idle" ? "idle" : "running...";
  }

  return parts.join(" • ");
}

function formatTooltip(data: ModelSummaryResponse, fallbackSummary: string): string {
  const lines: string[] = [];
  const summary = typeof data.summary === "string" && data.summary.trim()
    ? data.summary.trim()
    : fallbackSummary;

  lines.push(`Summary: ${summary}`);

  if (typeof data.current_goal === "string" && data.current_goal.trim()) {
    lines.push(`Goal: ${data.current_goal.trim()}`);
  }

  const sections: [string, unknown][] = [
    ["Recent", data.recent_actions],
    ["Blockers", data.blockers],
    ["Commands", data.important_commands],
  ];

  for (const [label, value] of sections) {
    if (!Array.isArray(value) || value.length === 0) continue;
    lines.push(`${label}: ${value.filter(Boolean).map(String).join("; ")}`);
  }

  if (typeof data.next_step === "string" && data.next_step.trim()) {
    lines.push(`Next: ${data.next_step.trim()}`);
  }

  return lines.join("\n");
}

const CWD_POLL_MS = 10000;

export interface SessionSummaryMeta {
  name?: string;
  command?: string;
}

export function useSessionSummary(
  outputBufferRef: React.MutableRefObject<string[]>,
  sessionId: string,
  pidRef?: React.MutableRefObject<number | null>,
  remote?: boolean,
  meta?: SessionSummaryMeta
) {
  const [summary, setSummary] = useState("Waiting for activity...");
  const [tooltip, setTooltip] = useState("Waiting for activity...");
  const [directory, setDirectory] = useState("");
  const [isRefreshingSummary, setIsRefreshingSummary] = useState(false);
  const directoryRef = useRef("");
  const pidCwdActiveRef = useRef(false);
  const summaryRef = useRef(summary);
  const tooltipRef = useRef(tooltip);
  const lastHashRef = useRef("");
  const lastModelRequestAtRef = useRef(0);
  const queuePendingRef = useRef(false);
  const lastAppliedAtRef = useRef(0);

  const updateSummary = (nextSummary: string) => {
    summaryRef.current = nextSummary;
    tooltipRef.current = nextSummary;
    setSummary(nextSummary);
    setTooltip(nextSummary);
  };

  const updateModelSummary = useCallback((data: ModelSummaryResponse) => {
    // Only apply real cached/model summaries (they carry updatedAt), never
    // route placeholders, and never an older summary than what's shown.
    if (typeof data.summary !== "string" || !data.summary.trim()) return;
    if (typeof data.updatedAt !== "number" || data.updatedAt < lastAppliedAtRef.current) return;
    lastAppliedAtRef.current = data.updatedAt;
    const nextSummary = data.summary.trim();
    summaryRef.current = nextSummary;
    setSummary(nextSummary);
    const nextTooltip = formatTooltip(data, nextSummary);
    tooltipRef.current = nextTooltip;
    setTooltip(nextTooltip);
  }, []);

  const metaRef = useRef(meta);
  metaRef.current = meta;

  const postSummarize = useCallback(
    (text: string, urgent: boolean) => {
      setIsRefreshingSummary(true);
      return fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          text,
          urgent,
          meta: { ...metaRef.current, directory: directoryRef.current || undefined },
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: ModelSummaryResponse | null) => {
          if (data) {
            queuePendingRef.current = Boolean(data.queued);
            updateModelSummary(data);
          }
          return data;
        })
        .catch(() => null)
        .finally(() => {
          setIsRefreshingSummary(false);
        });
    },
    [sessionId, updateModelSummary]
  );

  // Restore the cached summary for this terminal on mount.
  useEffect(() => {
    void postSummarize("", false);
  }, [postSummarize]);

  // For local sessions, resolve the shell's true cwd from its pid — prompts
  // that only show the last path component can't provide the full path.
  useEffect(() => {
    if (remote || !pidRef) return;
    let cancelled = false;
    const poll = () => {
      const pid = pidRef.current;
      if (!pid) return;
      void fetch(`/api/cwd?pid=${pid}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { cwd?: string | null } | null) => {
          if (cancelled || !data?.cwd) return;
          pidCwdActiveRef.current = true;
          const dir = collapseHome(data.cwd);
          if (dir !== directoryRef.current) {
            directoryRef.current = dir;
            setDirectory(dir);
          }
        })
        .catch(() => {});
    };
    const startup = setTimeout(poll, 1500);
    const interval = setInterval(poll, CWD_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(startup);
      clearInterval(interval);
    };
  }, [remote, pidRef]);

  const requestSummaryNow = useCallback(() => {
    const clean = stripAnsi(outputBufferRef.current.join("")).slice(-12000);
    lastModelRequestAtRef.current = Date.now();
    queuePendingRef.current = true;
    void postSummarize(clean, true);
  }, [outputBufferRef, postSummarize]);

  useEffect(() => {
    const interval = setInterval(() => {
      const buffer = outputBufferRef.current;
      const text = buffer.join("");

      if (text.length < 20) {
        if (PLACEHOLDER_SUMMARIES.has(summaryRef.current)) {
          updateSummary("Waiting for activity...");
        }
        return;
      }

      const hash = text.length + "|" + text.slice(-300);
      if (hash !== lastHashRef.current) {
        lastHashRef.current = hash;
        // When pid-based cwd resolution works (local shells), it owns the
        // directory — buffer extraction would resurface stale prompts.
        if (!pidCwdActiveRef.current) {
          const dir = extractDirectory(text);
          if (dir && dir !== directoryRef.current) {
            directoryRef.current = dir;
            setDirectory(dir);
          }
        }
        // The local heuristic only fills in until the first model summary
        // (cached or fresh) has been applied; after that the model wins.
        if (lastAppliedAtRef.current === 0) {
          const ctx = parseTerminalContext(text);
          const newSummary = formatSummary(ctx);
          const hasUsefulExistingSummary = !PLACEHOLDER_SUMMARIES.has(summaryRef.current);
          const newSummaryIsPlaceholder = PLACEHOLDER_SUMMARIES.has(newSummary);
          if (!hasUsefulExistingSummary || !newSummaryIsPlaceholder) {
            updateSummary(newSummary);
          }
        }
      }

      const now = Date.now();
      const clean = stripAnsi(text).slice(-12000);
      const pollInterval = queuePendingRef.current ? MODEL_POLL_PENDING_MS : MODEL_POLL_MS;
      if (clean.length < 500 || now - lastModelRequestAtRef.current < pollInterval) return;

      lastModelRequestAtRef.current = now;
      void postSummarize(clean, false);
    }, 3000);

    return () => clearInterval(interval);
  }, [outputBufferRef, postSummarize]);

  let displaySummary =
    (isRefreshingSummary || queuePendingRef.current) && !PLACEHOLDER_SUMMARIES.has(summary)
      ? `${summary} · updating...`
      : summary;
  if (directory && !displaySummary.includes(directory)) {
    displaySummary = `${directory} · ${displaySummary}`;
  }
  const displayTooltip = directory ? `Dir: ${directory}\n${tooltip}` : tooltip;

  return { summary: displaySummary, tooltip: displayTooltip, requestSummaryNow };
}

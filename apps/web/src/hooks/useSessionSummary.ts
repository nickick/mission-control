"use client";

import { useEffect, useRef, useState } from "react";

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;:?]*[a-zA-Z]/g;
const OSC_REGEX = /\x1b\][0-9;]*\x07/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "").replace(OSC_REGEX, "");
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

  if (ctx.directory) {
    // Collapse long internal paths for readability
    let dir = ctx.directory;
    if (dir.startsWith("~/etc/ai/apps/")) dir = dir.replace("~/etc/ai/apps/", "~/.../");
    parts.push(dir);
  }

  if (ctx.host) {
    parts.push(`@${ctx.host}`);
  }

  if (parts.length === 0) {
    return ctx.state === "idle" ? "idle" : "running...";
  }

  return parts.join(" • ");
}

export function useSessionSummary(outputBufferRef: React.MutableRefObject<string[]>) {
  const [summary, setSummary] = useState("Waiting for activity...");
  const lastHashRef = useRef("");

  useEffect(() => {
    const interval = setInterval(() => {
      const buffer = outputBufferRef.current;
      const text = buffer.join("");

      if (text.length < 20) {
        setSummary("Waiting for activity...");
        return;
      }

      const hash = text.length + "|" + text.slice(-300);
      if (hash === lastHashRef.current) return;
      lastHashRef.current = hash;

      const ctx = parseTerminalContext(text);
      const newSummary = formatSummary(ctx);
      setSummary(newSummary);
    }, 3000);

    return () => clearInterval(interval);
  }, [outputBufferRef]);

  return summary;
}

#!/usr/bin/env node
import { execSync } from "node:child_process";

const PORTS = [3000, 3001];

for (const port of PORTS) {
  try {
    const pids = execSync(`lsof -ti:${port}`, { encoding: "utf-8" })
      .trim()
      .split("\n")
      .filter(Boolean);
    for (const pid of pids) {
      try {
        execSync(`kill -9 ${pid}`);
        console.log(`[kill-ports] Killed PID ${pid} on port ${port}`);
      } catch {
        console.error(`[kill-ports] Failed to kill PID ${pid} on port ${port}`);
      }
    }
  } catch {
    // No process on this port — that's fine
  }
}

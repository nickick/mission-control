#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";

const root = resolve(import.meta.dirname, "..");
const files = [".env", ".env.local"];

for (const file of files) {
  const path = resolve(root, file);
  if (existsSync(path)) {
    dotenv.config({ path, override: true, quiet: true });
  }
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: node scripts/with-env.mjs <command> [...args]");
  process.exit(1);
}

const child = spawn(command, args, {
  cwd: root,
  env: process.env,
  shell: false,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage } from "node:http";

// Loopback clients (the desktop app) are trusted as before. Any non-local
// connection — e.g. a phone on the tailnet — must present the bearer token.
// The token comes from MISSION_CONTROL_TOKEN, or is generated once and kept
// at ~/.mission-control/server-token (chmod 600).

const TOKEN_DIR = path.join(os.homedir(), ".mission-control");
export const TOKEN_FILE = path.join(TOKEN_DIR, "server-token");

let cachedToken: string | null = null;

export function getAuthToken(): string {
  if (cachedToken) return cachedToken;
  const fromEnv = process.env.MISSION_CONTROL_TOKEN?.trim();
  if (fromEnv) {
    cachedToken = fromEnv;
    return cachedToken;
  }
  try {
    const existing = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (existing) {
      cachedToken = existing;
      return cachedToken;
    }
  } catch {
    // fall through to generation
  }
  const token = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(TOKEN_DIR, { recursive: true });
  fs.writeFileSync(TOKEN_FILE, `${token}\n`, { mode: 0o600 });
  cachedToken = token;
  return token;
}

function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  return address === "::1" || address.startsWith("127.") || address.startsWith("::ffff:127.");
}

export function isAuthorized(req: IncomingMessage): boolean {
  if (isLoopback(req.socket.remoteAddress)) return true;

  const token = getAuthToken();
  const header = req.headers.authorization;
  let provided = header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
  if (!provided && req.url) {
    // WebSocket clients can't always set headers; allow ?token=.
    try {
      provided = new URL(req.url, "http://localhost").searchParams.get("token") ?? undefined;
    } catch {
      // ignore malformed URLs
    }
  }
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

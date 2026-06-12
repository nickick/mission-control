import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { handleConnection } from "./wsHandler.js";
import { collectStats, collectRemoteStats } from "./stats.js";
import { collectGitRepos } from "./gitRepos.js";
import { getAuthToken, isAuthorized, TOKEN_FILE } from "./auth.js";
import { listTmuxSessions, peekTmuxSession, sendToTmuxSession } from "./tmux.js";
import {
  chat as openclawChat,
  chatStream as openclawChatStream,
  listAgents,
  openclawConfigured,
  DEFAULT_AGENT,
} from "./openclaw.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/pty" });

app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

app.use(express.json());

// Loopback (the desktop app) passes untouched; anything remote — phones on
// the tailnet — must present the bearer token.
app.use((req, res, next) => {
  if (req.method === "OPTIONS" || isAuthorized(req)) {
    next();
    return;
  }
  res.status(401).json({ error: "unauthorized" });
});

app.get("/stats", async (req, res) => {
  const host = req.query.host as string | undefined;
  if (host && host.trim()) {
    const remote = await collectRemoteStats(host.trim());
    if (remote) {
      res.json(remote);
      return;
    }
    // Fall through to local stats if remote fails
  }
  res.json(collectStats());
});

app.get("/repos", async (req, res) => {
  const host = req.query.host as string | undefined;
  const rootsParam = req.query.roots as string | undefined;
  try {
    let roots: string[] | undefined;
    if (rootsParam) {
      const parsed = JSON.parse(rootsParam) as unknown;
      if (Array.isArray(parsed)) {
        roots = parsed.filter((root): root is string => typeof root === "string" && root.trim().length > 0);
      }
    }
    const repos = await collectGitRepos(host, roots);
    res.json({ host: host?.trim() || "local", roots: roots ?? [], repos });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// Chat-bridge endpoints for the mobile client: peek at and type into tmux
// sessions on this host without a full PTY attach.
app.get("/tmux/sessions", async (_req, res) => {
  res.json({ sessions: await listTmuxSessions() });
});

app.get("/tmux/peek", async (req, res) => {
  const session = String(req.query.session ?? "");
  const lines = req.query.lines ? parseInt(String(req.query.lines), 10) : 200;
  try {
    const content = await peekTmuxSession(session, Number.isFinite(lines) ? lines : 200);
    res.json({ session, content });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/tmux/send", async (req, res) => {
  const { session, text, enter } = (req.body ?? {}) as {
    session?: string;
    text?: string;
    enter?: boolean;
  };
  if (!session || typeof text !== "string") {
    res.status(400).json({ error: "session and text are required" });
    return;
  }
  try {
    await sendToTmuxSession(session, text, enter !== false);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// OpenClaw chat: the primary channel for the mobile client. Proxies to the
// local gateway so the gateway token stays server-side.
app.get("/openclaw/agents", async (_req, res) => {
  if (!openclawConfigured()) {
    res.json({ configured: false, agents: [], defaultAgent: DEFAULT_AGENT });
    return;
  }
  try {
    res.json({ configured: true, agents: await listAgents(), defaultAgent: DEFAULT_AGENT });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/openclaw/chat", async (req, res) => {
  if (!openclawConfigured()) {
    res.status(503).json({ error: "OpenClaw gateway not configured on this server" });
    return;
  }
  const { messages, agent, sessionKey } = (req.body ?? {}) as {
    messages?: { role: "system" | "user" | "assistant"; content: string }[];
    agent?: string;
    sessionKey?: string;
  };
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages are required" });
    return;
  }
  try {
    res.json(await openclawChat(messages, agent || DEFAULT_AGENT, sessionKey));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Streaming chat: pipe the gateway's SSE straight through to the client.
app.post("/openclaw/chat/stream", async (req, res) => {
  if (!openclawConfigured()) {
    res.status(503).json({ error: "OpenClaw gateway not configured on this server" });
    return;
  }
  const { messages, agent, sessionKey } = (req.body ?? {}) as {
    messages?: { role: "system" | "user" | "assistant"; content: string }[];
    agent?: string;
    sessionKey?: string;
  };
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages are required" });
    return;
  }

  let gw: Response;
  try {
    gw = await openclawChatStream(messages, agent || DEFAULT_AGENT, sessionKey);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    return;
  }
  if (!gw.ok || !gw.body) {
    const body = await gw.text().catch(() => "");
    res.status(502).json({ error: `gateway ${gw.status}: ${body.slice(0, 300)}` });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const reader = gw.body.getReader();
  req.on("close", () => void reader.cancel().catch(() => {}));
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } catch {
    // client disconnected or gateway stream broke; just end.
  } finally {
    res.end();
  }
});

wss.on("connection", (ws, req) => {
  if (!isAuthorized(req)) {
    console.log(`[server] WS client rejected (unauthorized) from ${req.socket.remoteAddress}`);
    ws.close(4401, "unauthorized");
    return;
  }
  console.log(`[server] WS client connected from ${req.socket.remoteAddress}`);
  handleConnection(ws);
});

server.listen(PORT, () => {
  getAuthToken(); // ensure a token exists for remote clients
  console.log(`[server] PTY WebSocket server running on ws://localhost:${PORT}/pty`);
  console.log(`[server] Stats endpoint at http://localhost:${PORT}/stats`);
  console.log(`[server] Remote stats at http://localhost:${PORT}/stats?host=<ssh-host>`);
  console.log(`[server] Git repos at http://localhost:${PORT}/repos?host=<ssh-host>`);
  console.log(`[server] tmux bridge at /tmux/sessions, /tmux/peek, /tmux/send`);
  console.log(`[server] Remote clients need the bearer token from ${TOKEN_FILE}`);
});

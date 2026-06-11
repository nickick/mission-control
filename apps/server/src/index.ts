import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { handleConnection } from "./wsHandler.js";
import { collectStats, collectRemoteStats } from "./stats.js";
import { collectGitRepos } from "./gitRepos.js";
import { getAuthToken, isAuthorized, TOKEN_FILE } from "./auth.js";
import { listTmuxSessions, peekTmuxSession, sendToTmuxSession } from "./tmux.js";

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

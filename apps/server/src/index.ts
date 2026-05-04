import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { handleConnection } from "./wsHandler.js";
import { collectStats, collectRemoteStats } from "./stats.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/pty" });

app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
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

wss.on("connection", (ws, req) => {
  console.log(`[server] WS client connected from ${req.socket.remoteAddress}`);
  handleConnection(ws);
});

server.listen(PORT, () => {
  console.log(`[server] PTY WebSocket server running on ws://localhost:${PORT}/pty`);
  console.log(`[server] Stats endpoint at http://localhost:${PORT}/stats`);
  console.log(`[server] Remote stats at http://localhost:${PORT}/stats?host=<ssh-host>`);
});

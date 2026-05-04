import * as pty from "node-pty";
import type { WSMessage } from "@mission-control/types";
import type { WebSocket } from "ws";

export interface PTYSession {
  id: string;
  process: pty.IPty;
  socket: WebSocket;
}

const sessions = new Map<string, PTYSession>();

export function spawnSession(
  id: string,
  socket: WebSocket,
  shell: string,
  args?: string[],
  cwd?: string,
  env?: Record<string, string>
): PTYSession {
  killSession(id);

  const ptyProcess = pty.spawn(shell, args ?? [], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: cwd ?? globalThis.process.env.HOME ?? "/",
    env: Object.fromEntries(
      Object.entries({
        ...globalThis.process.env,
        ...(env ?? {}),
      }).filter(([, v]) => v !== undefined)
    ) as { [key: string]: string },
  });

  const session: PTYSession = { id, process: ptyProcess, socket };
  sessions.set(id, session);

  ptyProcess.onData((data) => {
    if (socket.readyState === 1) {
      socket.send(JSON.stringify({ type: "output", data } as WSMessage));
    }
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    if (socket.readyState === 1) {
      socket.send(
        JSON.stringify({ type: "exit", exitCode, signal } as WSMessage)
      );
    }
    sessions.delete(id);
  });

  if (socket.readyState === 1) {
    socket.send(JSON.stringify({ type: "spawned", pid: ptyProcess.pid } as WSMessage));
  }

  return session;
}

export function killSession(id: string): void {
  const session = sessions.get(id);
  if (session) {
    try {
      session.process.kill();
    } catch {
      // ignore
    }
    sessions.delete(id);
  }
}

export function getSession(id: string): PTYSession | undefined {
  return sessions.get(id);
}

export function writeToSession(id: string, data: string): void {
  const session = sessions.get(id);
  if (session) {
    session.process.write(data);
  }
}

export function resizeSession(id: string, cols: number, rows: number): void {
  const session = sessions.get(id);
  if (session) {
    session.process.resize(cols, rows);
  }
}

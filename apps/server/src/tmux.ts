import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Chat-bridge primitives: a chat client doesn't render a terminal, it peeks
// at and types into tmux sessions running on this host.

const SESSION_RE = /^[\w.-]+$/;

function assertSessionName(session: string) {
  if (!SESSION_RE.test(session)) {
    throw new Error("invalid session name");
  }
}

export interface TmuxSession {
  name: string;
  windows: number;
  attached: boolean;
  createdAt: number;
}

export async function listTmuxSessions(): Promise<TmuxSession[]> {
  try {
    const { stdout } = await execFileAsync("tmux", [
      "list-sessions",
      "-F",
      "#{session_name}|#{session_windows}|#{?session_attached,1,0}|#{session_created}",
    ]);
    return stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, windows, attached, created] = line.split("|");
        return {
          name,
          windows: Number(windows),
          attached: attached === "1",
          createdAt: Number(created) * 1000,
        };
      });
  } catch {
    // No tmux server running (or tmux not installed) — nothing to list.
    return [];
  }
}

export async function peekTmuxSession(session: string, lines = 200): Promise<string> {
  assertSessionName(session);
  const scrollback = Math.min(Math.max(Math.trunc(lines), 1), 5000);
  const { stdout } = await execFileAsync(
    "tmux",
    ["capture-pane", "-p", "-t", session, "-S", `-${scrollback}`],
    { maxBuffer: 8 * 1024 * 1024 }
  );
  return stdout.replace(/\s+$/, "");
}

export async function sendToTmuxSession(session: string, text: string, enter: boolean): Promise<void> {
  assertSessionName(session);
  if (text.length > 0) {
    // -l sends the text literally (no key-name interpretation).
    await execFileAsync("tmux", ["send-keys", "-t", session, "-l", text]);
  }
  if (enter) {
    await execFileAsync("tmux", ["send-keys", "-t", session, "Enter"]);
  }
}

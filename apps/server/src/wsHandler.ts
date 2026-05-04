import crypto from "crypto";
import type { WebSocket } from "ws";
import type { WSMessage } from "@mission-control/types";
import {
  spawnSession,
  killSession,
  writeToSession,
  resizeSession,
} from "./ptyManager.js";

export function handleConnection(socket: WebSocket) {
  let currentSessionId: string | null = null;

  socket.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as WSMessage;

      switch (msg.type) {
        case "spawn": {
          currentSessionId = msg.sessionId ?? crypto.randomUUID();
          spawnSession(
            currentSessionId,
            socket,
            msg.shell,
            msg.args,
            msg.cwd,
            msg.env
          );
          break;
        }
        case "input": {
          if (currentSessionId) {
            writeToSession(currentSessionId, msg.data);
          }
          break;
        }
        case "write": {
          if (currentSessionId) {
            writeToSession(currentSessionId, msg.data);
          }
          break;
        }
        case "resize": {
          if (currentSessionId) {
            resizeSession(currentSessionId, msg.cols, msg.rows);
          }
          break;
        }
        case "kill": {
          if (currentSessionId) {
            killSession(currentSessionId);
            currentSessionId = null;
          }
          break;
        }
      }
    } catch (err) {
      socket.send(
        JSON.stringify({
          type: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        } as WSMessage)
      );
    }
  });

  socket.on("close", () => {
    if (currentSessionId) {
      killSession(currentSessionId);
    }
  });
}

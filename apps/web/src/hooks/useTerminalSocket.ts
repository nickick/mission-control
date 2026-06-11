"use client";

import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { WSMessage } from "@mission-control/types";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001/pty";

export interface UseTerminalSocketOptions {
  sessionId: string;
  shell: string;
  command?: string;
  onData?: (data: string) => void;
}

export function useTerminalSocket(
  terminal: Terminal | null,
  options: UseTerminalSocketOptions
) {
  const wsRef = useRef<WebSocket | null>(null);
  const pidRef = useRef<number | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const outputBufferRef = useRef<string[]>([]);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const { command } = options;

  const spawn = useCallback(() => {
    if (!terminal) return;
    cleanupRef.current?.();
    cleanupRef.current = null;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    const inputBuffer: string[] = [];
    let disposed = false;

    ws.onopen = () => {
      terminal.writeln("\r\n[connected to server]");
      const msg: WSMessage = {
        type: "spawn",
        sessionId: optionsRef.current.sessionId,
        shell: optionsRef.current.shell,
      };
      ws.send(JSON.stringify(msg));

      // Flush buffered input
      while (inputBuffer.length > 0) {
        const data = inputBuffer.shift()!;
        ws.send(JSON.stringify({ type: "input", data } as WSMessage));
      }

      // Inject initial command after shell has time to show prompt
      const cmdToInject = optionsRef.current.command;
      if (cmdToInject) {
        setTimeout(() => {
          terminal.writeln(`\r\n[running: ${cmdToInject}]`);
          const writeMsg: WSMessage = {
            type: "write",
            data: cmdToInject + "\r",
          };
          ws.send(JSON.stringify(writeMsg));
        }, 1200);
      }
    };

    ws.onmessage = (event) => {
      if (disposed) return;
      try {
        const msg = JSON.parse(event.data) as WSMessage;
        if (msg.type === "spawned") {
          pidRef.current = msg.pid;
        } else if (msg.type === "output") {
          terminal.write(msg.data);
          optionsRef.current.onData?.(msg.data);
          // Buffer for summarization — keep enough scrollback for the model
          // to infer what the session is actually about.
          outputBufferRef.current.push(msg.data);
          const total = outputBufferRef.current.join("");
          if (total.length > 12000) {
            outputBufferRef.current = [total.slice(-12000)];
          }
        }
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      if (disposed) return;
      terminal.writeln("\r\n[disconnected from server]");
    };

    ws.onerror = () => {
      if (disposed) return;
      terminal.writeln("\r\n[websocket error — check server is running on :3001]");
    };

    // Terminal input -> WS (buffer if not yet open)
    const disposable = terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data } as WSMessage));
      } else {
        inputBuffer.push(data);
      }
    });

    // Fit addon
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    terminal.loadAddon(fitAddon);

    const resize = () => {
      try {
        // Don't fit if the terminal is in a hidden page (display: none).
        // offsetParent is null when the element or an ancestor is hidden.
        if (!terminal.element || terminal.element.offsetParent === null) return;

        // Fit cols to the container width only. Rows stay at the tall fixed
        // viewport so output renders into the DOM and the browser scroll
        // container — not xterm's internal scrollback — owns scrolling.
        const dims = fitAddon.proposeDimensions();
        if (!dims || !Number.isFinite(dims.cols) || dims.cols < 2) return;
        if (terminal.cols !== dims.cols) {
          terminal.resize(dims.cols, terminal.rows);
        }
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "resize",
              cols: dims.cols,
              rows: terminal.rows,
            } as WSMessage)
          );
        }
      } catch {
        // ignore
      }
    };

    // Resize after a tick
    setTimeout(resize, 50);
    window.addEventListener("resize", resize);

    // ResizeObserver catches element size changes including becoming visible
    // after display:none → display:block (page tab switches within the app).
    const resizeObserver = new ResizeObserver(() => {
      resize();
    });
    if (terminal.element) {
      resizeObserver.observe(terminal.element);
    }

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      disposable.dispose();
      window.removeEventListener("resize", resize);
      resizeObserver.disconnect();
      fitAddon.dispose();
      ws.close();
    };

    cleanupRef.current = cleanup;
    return cleanup;
  }, [terminal]);

  useEffect(() => {
    const cleanup = spawn();
    return () => {
      cleanup?.();
      if (cleanupRef.current === cleanup) {
        cleanupRef.current = null;
      }
    };
  }, [spawn]);

  const respawn = useCallback(() => {
    terminal?.clear();
    cleanupRef.current?.();
    cleanupRef.current = null;
    setTimeout(() => {
      spawn();
    }, 100);
  }, [spawn, terminal]);

  const inject = useCallback((data: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "write", data: data + "\r" } as WSMessage));
    }
  }, []);

  return { respawn, inject, outputBuffer: outputBufferRef, pidRef };
}

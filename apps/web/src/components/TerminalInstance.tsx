"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useTerminalSocket } from "@/hooks/useTerminalSocket";
import { useSessionSummary } from "@/hooks/useSessionSummary";

interface TerminalInstanceProps {
  sessionId: string;
  shell: string;
  command?: string;
  name: string;
  focused: boolean;
  onFocus: () => void;
  onRespawnRequest: (respawn: () => void) => void;
  onInjectRequest: (inject: (cmd: string) => void) => void;
}

export default function TerminalInstance({
  sessionId,
  shell,
  command,
  name,
  focused,
  onFocus,
  onRespawnRequest,
  onInjectRequest,
}: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 11,
      fontFamily: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", monospace',
      theme: {
        background: "#1e1e1e",
        foreground: "#cccccc",
        cursor: "#cccccc",
        selectionBackground: "#264f78",
        black: "#0c0c0c",
        red: "#c50f1f",
        green: "#13a10e",
        yellow: "#c19c00",
        blue: "#0037da",
        magenta: "#881798",
        cyan: "#3a96dd",
        white: "#cccccc",
        brightBlack: "#767676",
        brightRed: "#e74856",
        brightGreen: "#16c60c",
        brightYellow: "#f9f1a5",
        brightBlue: "#3b78ff",
        brightMagenta: "#b4009e",
        brightCyan: "#61d6d6",
        brightWhite: "#f2f2f2",
      },
    });

    term.open(container);
    setTerminal(term);

    return () => {
      term.dispose();
      setTerminal(null);
    };
  }, []);

  const { respawn, inject, outputBuffer } = useTerminalSocket(terminal, {
    sessionId,
    shell,
    command,
  });

  const summary = useSessionSummary(outputBuffer);

  useEffect(() => {
    onRespawnRequest(respawn);
  }, [respawn, onRespawnRequest]);

  useEffect(() => {
    onInjectRequest(inject);
  }, [inject, onInjectRequest]);

  useEffect(() => {
    if (focused && terminal) {
      terminal.focus();
    }
  }, [focused, terminal]);

  return (
    <div
      className={`terminal-cell ${focused ? "focused" : ""}`}
      onClick={() => {
        onFocus();
        terminal?.focus();
      }}
    >
      <div className="terminal-header">
        <div className="flex items-center justify-between">
          <span className="name">{name}</span>
          <span>{focused ? "●" : ""}</span>
        </div>
        <div className="summary-text" title={summary}>{summary}</div>
      </div>
      <div ref={containerRef} className="terminal-body" />
    </div>
  );
}

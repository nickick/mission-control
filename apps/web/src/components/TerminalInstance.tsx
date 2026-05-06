"use client";

import React, { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useTerminalSocket } from "@/hooks/useTerminalSocket";
import { useSessionSummary } from "@/hooks/useSessionSummary";

const LARGE_TERMINAL_ROWS = 2000;
const MAX_TERMINAL_HEIGHT = 6500;
const EMPTY_ROW_RUN_CUTOFF = 100;
const FORCE_MAX_HEIGHT_COMMANDS = [/^ssvta\b/];

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

export default React.memo(function TerminalInstance({
  sessionId,
  shell,
  command,
  name,
  focused,
  onFocus,
  onRespawnRequest,
  onInjectRequest,
}: TerminalInstanceProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const terminalMountRef = useRef<HTMLDivElement>(null);
  const scrollToLastContentRef = useRef<() => void>(() => {});
  const [terminal, setTerminal] = useState<Terminal | null>(null);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    const scrollContent = scrollContentRef.current;
    const terminalMount = terminalMountRef.current;
    if (!scrollContainer || !scrollContent || !terminalMount) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 11,
      rows: LARGE_TERMINAL_ROWS,
      fontFamily: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", monospace',
      scrollback: 10000,
      theme: {
        background: "#1e1e1e",
        foreground: "#cccccc",
        cursor: "#cccccc",
        selectionBackground: "#264f78",
        selectionForeground: "#ffffff",
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

    term.open(terminalMount);

    const getLineHeight = () => {
      const renderedRow = terminalMount.querySelector<HTMLElement>(".xterm-rows > div");
      return renderedRow?.getBoundingClientRect().height || (term.options.fontSize ?? 11) * 1.2;
    };

    const getLastContentRowIndex = () => {
      const rows = Array.from(
        terminalMount.querySelectorAll<HTMLElement>(".xterm-rows > div")
      );
      let lastContentRowIndex = -1;
      let emptyRun = 0;

      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const hasText = Boolean(row.textContent?.trim());
        const hasCursor = Boolean(row.querySelector(".xterm-cursor"));

        if (hasText || hasCursor) {
          lastContentRowIndex = index;
          emptyRun = 0;
          continue;
        }

        if (lastContentRowIndex >= 0) {
          emptyRun++;
          if (emptyRun >= EMPTY_ROW_RUN_CUTOFF) break;
        }
      }

      return lastContentRowIndex;
    };

    const getRenderedContentHeight = () => {
      const lastContentRowIndex = getLastContentRowIndex();
      const visibleRows = lastContentRowIndex >= 0 ? lastContentRowIndex + 2 : term.rows;
      return visibleRows * getLineHeight();
    };

    scrollToLastContentRef.current = () => {
      const lastContentRowIndex = getLastContentRowIndex();
      if (lastContentRowIndex < 0) {
        scrollToBottom();
        return;
      }

      scrollContainer.scrollTo({
        top: Math.max(0, (lastContentRowIndex + 1) * getLineHeight() - scrollContainer.clientHeight),
        behavior: "smooth",
      });
    };

    const scrollToBottom = () => {
      scrollContainer.scrollTop = Math.max(
        0,
        scrollContainer.scrollHeight - scrollContainer.clientHeight
      );
    };

    const syncLargeViewportHeight = () => {
      const forceMaxHeight = FORCE_MAX_HEIGHT_COMMANDS.some((pattern) =>
        pattern.test(command?.trim() ?? "")
      );
      const height = forceMaxHeight
        ? MAX_TERMINAL_HEIGHT
        : Math.min(
            MAX_TERMINAL_HEIGHT,
            Math.max(scrollContainer.clientHeight, getRenderedContentHeight())
          );
      terminalMount.style.height = `${height}px`;
      scrollContent.style.height = `${height}px`;
      const xtermScreen = terminalMount.querySelector<HTMLElement>(".xterm-screen");
      const xtermRows = terminalMount.querySelector<HTMLElement>(".xterm-rows");
      if (forceMaxHeight) {
        if (xtermScreen) xtermScreen.style.setProperty("height", `${height}px`, "important");
        if (xtermRows) xtermRows.style.setProperty("height", `${height}px`, "important");
      } else {
        xtermScreen?.style.removeProperty("height");
        xtermRows?.style.removeProperty("height");
      }
      requestAnimationFrame(() => {
        scrollToBottom();
        requestAnimationFrame(scrollToBottom);
      });
    };

    const handleWheelCapture = (event: WheelEvent) => {
      // Let .terminal-body do native scrolling, but keep wheel input out of
      // xterm/tmux so it cannot become alternate-scroll arrow keys.
      event.stopImmediatePropagation();
    };

    const resizeObserver = new ResizeObserver(syncLargeViewportHeight);
    const writeParsedDisposable = term.onWriteParsed(syncLargeViewportHeight);

    resizeObserver.observe(scrollContainer);
    scrollContainer.addEventListener("wheel", handleWheelCapture, {
      capture: true,
      passive: true,
    });
    term.attachCustomWheelEventHandler(() => false);
    requestAnimationFrame(syncLargeViewportHeight);
    setTerminal(term);

    return () => {
      scrollContainer.removeEventListener("wheel", handleWheelCapture, { capture: true });
      resizeObserver.disconnect();
      writeParsedDisposable.dispose();
      term.dispose();
      scrollToLastContentRef.current = () => {};
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
      <div ref={scrollContainerRef} className="terminal-body">
        <div ref={scrollContentRef} className="terminal-scroll-content">
          <div ref={terminalMountRef} className="terminal-mount" />
        </div>
        <button
          type="button"
          className="terminal-scroll-to-content"
          title="Scroll to last terminal output"
          aria-label="Scroll to last terminal output"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            scrollToLastContentRef.current();
          }}
        >
          <Icon icon="mdi:eye" width={15} height={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
});

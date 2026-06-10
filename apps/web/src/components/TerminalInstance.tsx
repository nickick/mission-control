"use client";

import React, { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useTerminalSocket } from "@/hooks/useTerminalSocket";
import { useSessionSummary } from "@/hooks/useSessionSummary";

const LARGE_TERMINAL_ROWS = 2000;
const CONTENT_PADDING_ROWS = 1;
const CONTENT_GAP_CUTOFF_ROWS = 100;
const AUTO_SCROLL_BOTTOM_THRESHOLD = 4;

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

    // Last viewport row that holds content. The cursor row (the prompt /
    // input box) is the anchor; from there, extend downward only while
    // content stays reasonably contiguous. A bottom-anchored row far below
    // the cursor — e.g. a tmux status bar on the last row of the tall PTY —
    // is ignored so the scrollable area ends near the real end of input.
    const getLastContentRow = () => {
      const buffer = term.buffer.active;
      const cursorRow = buffer.baseY + buffer.cursorY;
      let lastRow = cursorRow;
      let blankRun = 0;
      for (let y = cursorRow + 1; y < buffer.length; y++) {
        const line = buffer.getLine(y);
        if (line && line.translateToString(true).trim()) {
          lastRow = y;
          blankRun = 0;
        } else if (++blankRun >= CONTENT_GAP_CUTOFF_ROWS) {
          break;
        }
      }
      return Math.min(term.rows - 1, Math.max(0, lastRow - buffer.viewportY));
    };

    scrollToLastContentRef.current = () => {
      scrollContainer.scrollTo({
        top: Math.max(
          0,
          (getLastContentRow() + 1) * getLineHeight() - scrollContainer.clientHeight
        ),
        behavior: "smooth",
      });
    };

    const scrollToBottom = () => {
      scrollContainer.scrollTop = Math.max(
        0,
        scrollContainer.scrollHeight - scrollContainer.clientHeight
      );
    };

    const syncViewportHeight = () => {
      const distanceFromBottom =
        scrollContainer.scrollHeight - scrollContainer.clientHeight - scrollContainer.scrollTop;
      const shouldPreserveBottom = distanceFromBottom <= AUTO_SCROLL_BOTTOM_THRESHOLD;
      const contentRows = Math.min(term.rows, getLastContentRow() + 1 + CONTENT_PADDING_ROWS);
      const height = Math.max(scrollContainer.clientHeight, contentRows * getLineHeight());
      terminalMount.style.height = `${height}px`;
      scrollContent.style.height = `${height}px`;
      if (shouldPreserveBottom) {
        requestAnimationFrame(() => {
          scrollToBottom();
          requestAnimationFrame(scrollToBottom);
        });
      }
    };

    // Coalesce bursts of writes/resizes into one height sync per frame.
    let syncQueued = false;
    const scheduleSync = () => {
      if (syncQueued) return;
      syncQueued = true;
      requestAnimationFrame(() => {
        syncQueued = false;
        syncViewportHeight();
      });
    };

    const handleWheelCapture = (event: WheelEvent) => {
      // Let .terminal-body do native scrolling, but keep wheel input out of
      // xterm/tmux so it cannot become alternate-scroll arrow keys.
      event.stopImmediatePropagation();
    };

    const resizeObserver = new ResizeObserver(scheduleSync);
    const writeParsedDisposable = term.onWriteParsed(scheduleSync);

    resizeObserver.observe(scrollContainer);
    scrollContainer.addEventListener("wheel", handleWheelCapture, {
      capture: true,
      passive: true,
    });
    term.attachCustomWheelEventHandler(() => false);
    scheduleSync();
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

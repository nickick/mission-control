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
  statsHost?: string;
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
  statsHost,
  focused,
  onFocus,
  onRespawnRequest,
  onInjectRequest,
}: TerminalInstanceProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const terminalMountRef = useRef<HTMLDivElement>(null);
  const scrollToLastContentRef = useRef<() => void>(() => {});
  const scrollToBottomRef = useRef<() => void>(() => {});
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [summaryHovered, setSummaryHovered] = useState(false);

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
    scrollToBottomRef.current = scrollToBottom;

    const syncViewportHeight = () => {
      const distanceFromBottom =
        scrollContainer.scrollHeight - scrollContainer.clientHeight - scrollContainer.scrollTop;
      const shouldPreserveBottom = distanceFromBottom <= AUTO_SCROLL_BOTTOM_THRESHOLD;
      const contentRows = Math.min(term.rows, getLastContentRow() + 1 + CONTENT_PADDING_ROWS);
      const lineHeight = getLineHeight();
      const height = Math.max(scrollContainer.clientHeight, contentRows * lineHeight);
      terminalMount.style.height = `${height}px`;
      scrollContent.style.height = `${height}px`;
      // Highlight the scroll pill only when there is real scrollback —
      // with just a row or two of overflow the pill spans the whole track
      // and a bright border would read as a full-height edge line.
      scrollContainer.classList.toggle(
        "has-scrollback",
        height - scrollContainer.clientHeight > 3 * lineHeight
      );
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
      scrollToBottomRef.current = () => {};
      setTerminal(null);
    };
  }, []);

  // Close the context menu on any outside interaction.
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  const { respawn, inject, outputBuffer, pidRef } = useTerminalSocket(terminal, {
    sessionId,
    shell,
    command,
  });

  // Remote sessions: the local shell pid's cwd is just where ssh was
  // launched, so directory tracking falls back to the terminal buffer.
  const remote = Boolean(statsHost) || /\b(ssh|ssvta|mosh)\b/.test(command ?? "");
  const { summary, tooltip, requestSummaryNow } = useSessionSummary(
    outputBuffer,
    sessionId,
    pidRef,
    remote,
    { name, command }
  );

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
      onContextMenuCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onFocus();
        setContextMenu({
          x: Math.min(event.clientX, window.innerWidth - 200),
          y: Math.min(event.clientY, window.innerHeight - 130),
        });
      }}
    >
      <div className="terminal-header">
        <div className="flex items-center justify-between">
          <span className="name">{name}</span>
          <span>{focused ? "●" : ""}</span>
        </div>
        <div className="flex items-start gap-1">
          <div
            className="summary-hover flex-1 min-w-0"
            onMouseEnter={() => setSummaryHovered(true)}
            onMouseLeave={() => setSummaryHovered(false)}
          >
            <div className="summary-text">{summary}</div>
            {summaryHovered && <div className="summary-tooltip">{tooltip}</div>}
          </div>
          <button
            type="button"
            className="summary-refresh"
            title="Summarize now (jumps the queue)"
            aria-label="Summarize this terminal now"
            onClick={(event) => {
              event.stopPropagation();
              requestSummaryNow();
            }}
          >
            <Icon icon="mdi:creation" width={12} height={12} aria-hidden="true" />
          </button>
        </div>
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
      {contextMenu && (
        <div
          className="terminal-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              scrollToBottomRef.current();
              setContextMenu(null);
            }}
          >
            <Icon icon="mdi:arrow-collapse-down" width={13} height={13} aria-hidden="true" />
            Scroll to bottom
          </button>
          <button
            type="button"
            onClick={() => {
              scrollToLastContentRef.current();
              setContextMenu(null);
            }}
          >
            <Icon icon="mdi:eye" width={13} height={13} aria-hidden="true" />
            Scroll to last output
          </button>
          <button
            type="button"
            onClick={() => {
              requestSummaryNow();
              setContextMenu(null);
            }}
          >
            <Icon icon="mdi:creation" width={13} height={13} aria-hidden="true" />
            Summarize now
          </button>
        </div>
      )}
    </div>
  );
});

"use client";

import { useEffect } from "react";

interface KeyboardShortcutsProps {
  onNextPage: () => void;
  onPrevPage: () => void;
  onFocusUp: () => void;
  onFocusDown: () => void;
  onFocusLeft: () => void;
  onFocusRight: () => void;
  onRespawn: () => void;
  onInject: () => void;
  onNewTab: () => void;
  onNewPage: () => void;
  onRefresh: () => void;
  onSetCommand: () => void;
  modalOpen: boolean;
}

export default function KeyboardShortcuts({
  onNextPage,
  onPrevPage,
  onFocusUp,
  onFocusDown,
  onFocusLeft,
  onFocusRight,
  onRespawn,
  onInject,
  onNewTab,
  onNewPage,
  onRefresh,
  onSetCommand,
  modalOpen,
}: KeyboardShortcutsProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // When modal is open, only handle Escape (in modal component)
      if (modalOpen) return;

      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      // New terminal: Cmd/Ctrl+Shift+T
      if (ctrl && shift && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        onNewTab();
        return;
      }

      // New page tab: Cmd/Ctrl+T
      if (ctrl && !shift && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        onNewPage();
        return;
      }

      // Set command for focused terminal: Cmd/Ctrl+Shift+R
      if (ctrl && shift && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        onSetCommand();
        return;
      }

      // Refresh focused terminal: Cmd/Ctrl+R
      if (ctrl && !shift && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        onRefresh();
        return;
      }

      // Page switching: Cmd+Option+Arrow (macOS) or Ctrl+Shift+Arrow
      if (e.metaKey && e.altKey && !e.shiftKey && !e.ctrlKey) {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          onNextPage();
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onPrevPage();
          return;
        }
      }

      if (ctrl && shift) {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          onNextPage();
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onPrevPage();
          return;
        }
      }

      if (ctrl && !shift) {
        if (e.key >= "1" && e.key <= "9") {
          e.preventDefault();
          const pageIndex = parseInt(e.key, 10) - 1;
          window.dispatchEvent(new CustomEvent("missioncontrol:goto-page", { detail: pageIndex }));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          onFocusUp();
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          onFocusDown();
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onFocusLeft();
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          onFocusRight();
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          onInject();
          return;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNextPage, onPrevPage, onFocusUp, onFocusDown, onFocusLeft, onFocusRight, onRespawn, onInject, onNewTab, onNewPage, onRefresh, onSetCommand, modalOpen]);

  return null;
}

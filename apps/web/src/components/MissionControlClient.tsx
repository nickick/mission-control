"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useConfigStore } from "@/store/useConfigStore";
import type { TerminalConfig, PageConfig } from "@/lib/schemas";
import TerminalGrid from "./TerminalGrid";
import PageTabs from "./PageTabs";
import KeyboardShortcuts from "./KeyboardShortcuts";
import { Button } from "@/components/ui/button";
import CommandModal from "./CommandModal";
import SetCommandModal from "./SetCommandModal";
import RenameTabModal from "./RenameTabModal";
import DeleteTabModal from "./DeleteTabModal";

export default function MissionControlClient() {
  const [mounted, setMounted] = useState(false);
  const [activePage, setActivePage] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [setCommandModalOpen, setSetCommandModalOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameTabIndex, setRenameTabIndex] = useState(0);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTabIndex, setDeleteTabIndex] = useState(0);
  const actionsRef = useRef<Map<string, Map<number, { respawn: () => void; inject: (cmd: string) => void }>>>(new Map());
  const dynamicIdCounter = useRef(0);

  const pages = useConfigStore((s) => s.pages);
  const addTerminal = useConfigStore((s) => s.addTerminal);
  const addPage = useConfigStore((s) => s.addPage);
  const removePage = useConfigStore((s) => s.removePage);
  const reorderPages = useConfigStore((s) => s.reorderPages);
  const setTerminalName = useConfigStore((s) => s.setTerminalName);
  const setTerminalCommand = useConfigStore((s) => s.setTerminalCommand);
  const setTerminalStatsHost = useConfigStore((s) => s.setTerminalStatsHost);
  const setPageName = useConfigStore((s) => s.setPageName);

  const pageConfig = pages[activePage] ?? pages[0];
  const terminals = pageConfig?.terminals ?? [];
  const hasTerminals = terminals.length > 0;

  const handleRegisterActions = useCallback(
    (pageId: string, index: number, actions: { respawn: () => void; inject: (cmd: string) => void }) => {
      if (!actionsRef.current.has(pageId)) {
        actionsRef.current.set(pageId, new Map());
      }
      actionsRef.current.get(pageId)!.set(index, actions);
    },
    []
  );

  const handleFocusLeft = useCallback(() => {
    setFocusedIndex((prev) => {
      const next = prev - 1;
      return next >= 0 ? next : prev;
    });
  }, []);

  const handleFocusRight = useCallback(() => {
    setFocusedIndex((prev) => {
      const next = prev + 1;
      return next < terminals.length ? next : prev;
    });
  }, [terminals.length]);

  const handleNextPage = useCallback(() => {
    setActivePage((p) => {
      const next = p + 1;
      return next < pages.length ? next : p;
    });
    setFocusedIndex(0);
  }, [pages.length]);

  const handlePrevPage = useCallback(() => {
    setActivePage((p) => {
      const next = p - 1;
      return next >= 0 ? next : p;
    });
    setFocusedIndex(0);
  }, []);

  const handleInject = useCallback(() => {
    if (!hasTerminals) return;
    const terminal = terminals[focusedIndex];
    if (terminal?.command) {
      actionsRef.current.get(pageConfig.id)?.get(focusedIndex)?.inject?.(terminal.command);
    }
  }, [focusedIndex, terminals, hasTerminals, pageConfig.id]);

  const handleRefresh = useCallback(() => {
    if (!hasTerminals) return;
    actionsRef.current.get(pageConfig.id)?.get(focusedIndex)?.respawn?.();
  }, [focusedIndex, hasTerminals, pageConfig.id]);

  const handleNewTab = useCallback(() => {
    setModalOpen(true);
  }, []);

  const handleSetCommand = useCallback(() => {
    if (!hasTerminals) return;
    setSetCommandModalOpen(true);
  }, [hasTerminals]);

  const handleRenameTab = useCallback((index: number) => {
    setRenameTabIndex(index);
    setRenameModalOpen(true);
  }, []);

  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      reorderPages(fromIndex, toIndex);
      // Adjust active page index if it shifted
      setActivePage((prev) => {
        if (prev === fromIndex) return toIndex;
        if (fromIndex < prev && prev <= toIndex) return prev - 1;
        if (toIndex <= prev && prev < fromIndex) return prev + 1;
        return prev;
      });
    },
    [reorderPages]
  );

  const handleDeleteTab = useCallback((index: number) => {
    setDeleteTabIndex(index);
    setDeleteModalOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    const page = pages[deleteTabIndex];
    if (page) {
      removePage(page.id);
      actionsRef.current.delete(page.id);
      if (deleteTabIndex === activePage) {
        setActivePage((p) => (p >= pages.length - 1 ? Math.max(0, pages.length - 2) : p));
      } else if (deleteTabIndex < activePage) {
        setActivePage((p) => Math.max(0, p - 1));
      }
      setFocusedIndex(0);
    }
    setDeleteModalOpen(false);
  }, [pages, deleteTabIndex, activePage, removePage]);

  const handleAddPage = useCallback(() => {
    const nextNum = pages.length + 1;
    const newPage: PageConfig = {
      id: `page-${Date.now()}`,
      name: `Tab ${nextNum}`,
      terminals: [],
    };
    addPage(newPage);
    setActivePage(pages.length);
    setFocusedIndex(0);
  }, [pages.length, addPage]);

  const handleRenameSubmit = useCallback(
    (name: string) => {
      const page = pages[renameTabIndex];
      if (page) {
        setPageName(page.id, name);
      }
      setRenameModalOpen(false);
    },
    [pages, renameTabIndex, setPageName]
  );

  const handleModalSubmit = useCallback(
    (command: string, shell: string, statsHost: string) => {
      const pageId = pageConfig.id;
      dynamicIdCounter.current += 1;
      const newTerminal: TerminalConfig = {
        id: `dyn-${pageId}-${Date.now()}-${dynamicIdCounter.current}`,
        name: command.split(" ")[0] || "shell",
        shell,
        command,
        statsHost: statsHost || undefined,
      };
      addTerminal(pageId, newTerminal);
      setModalOpen(false);
      setTimeout(() => {
        setFocusedIndex(terminals.length);
      }, 100);
    },
    [pageConfig.id, terminals.length, addTerminal]
  );

  const handleSetCommandSubmit = useCallback(
    (values: { name: string; command: string; statsHost: string }) => {
      const terminal = terminals[focusedIndex];
      if (terminal) {
        if (values.name && values.name !== terminal.name) {
          setTerminalName(pageConfig.id, terminal.id, values.name);
        }
        setTerminalCommand(pageConfig.id, terminal.id, values.command || undefined);
        setTerminalStatsHost(pageConfig.id, terminal.id, values.statsHost || undefined);
      }
      setSetCommandModalOpen(false);
    },
    [focusedIndex, terminals, pageConfig.id, setTerminalName, setTerminalCommand, setTerminalStatsHost]
  );

  useEffect(() => {
    setMounted(true);
    useConfigStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    const listener = (e: Event) => {
      const idx = (e as CustomEvent).detail;
      if (typeof idx === "number" && idx >= 0 && idx < pages.length) {
        setActivePage(idx);
        setFocusedIndex(0);
      }
    };
    window.addEventListener("missioncontrol:goto-page", listener);
    return () => window.removeEventListener("missioncontrol:goto-page", listener);
  }, [pages.length]);

  if (!mounted) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0c0c0c]">
        <div className="text-[#555] text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0c0c0c]">
      <PageTabs
        pages={pages}
        activeIndex={activePage}
        onChange={(i) => {
          setActivePage(i);
          setFocusedIndex(0);
        }}
        onRename={handleRenameTab}
        onDelete={handleDeleteTab}
        onReorder={handleReorder}
        onAddPage={handleAddPage}
      />
      <div className="flex-1 overflow-hidden relative">
        {pages.map((page, pageIdx) => {
          const isActive = pageIdx === activePage;
          const pageTerminals = page.terminals;
          const hasPageTerminals = pageTerminals.length > 0;
          return (
            <div
              key={page.id}
              className="absolute inset-0"
              style={{ display: isActive ? "block" : "none" }}
            >
              {hasPageTerminals ? (
                <TerminalGrid
                  pageId={page.id}
                  terminals={pageTerminals}
                  focusedIndex={isActive ? focusedIndex : 0}
                  onFocusIndex={isActive ? setFocusedIndex : () => {}}
                  onRegisterActions={handleRegisterActions}
                  onAddTerminal={handleNewTab}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Button
                    onClick={handleNewTab}
                    variant="outline"
                    size="icon-lg"
                    className="h-16 w-16 rounded-full border-2 border-[#444] bg-[#1e1e1e] text-2xl text-[#858585] hover:border-[#4fc1ff] hover:text-[#4fc1ff] hover:bg-[#1e1e1e]"
                    title="Add terminal (Ctrl+Shift+T)"
                  >
                    +
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <KeyboardShortcuts
        onNextPage={handleNextPage}
        onPrevPage={handlePrevPage}
        onFocusUp={() => {}}
        onFocusDown={() => {}}
        onFocusLeft={handleFocusLeft}
        onFocusRight={handleFocusRight}
        onRespawn={handleRefresh}
        onInject={handleInject}
        onNewTab={handleNewTab}
        onNewPage={handleAddPage}
        onRefresh={handleRefresh}
        onSetCommand={handleSetCommand}
        modalOpen={modalOpen || setCommandModalOpen || renameModalOpen || deleteModalOpen}
      />
      <CommandModal
        open={modalOpen}
        onSubmit={handleModalSubmit}
        onClose={() => setModalOpen(false)}
      />
      {hasTerminals && (
        <SetCommandModal
          open={setCommandModalOpen}
          terminalName={terminals[focusedIndex]?.name ?? ""}
          currentCommand={terminals[focusedIndex]?.command ?? ""}
          currentStatsHost={terminals[focusedIndex]?.statsHost ?? ""}
          onSubmit={handleSetCommandSubmit}
          onClose={() => setSetCommandModalOpen(false)}
        />
      )}
      <RenameTabModal
        open={renameModalOpen}
        currentName={pages[renameTabIndex]?.name ?? ""}
        onSubmit={handleRenameSubmit}
        onClose={() => setRenameModalOpen(false)}
      />
      <DeleteTabModal
        open={deleteModalOpen}
        tabName={pages[deleteTabIndex]?.name ?? ""}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteModalOpen(false)}
      />
    </div>
  );
}

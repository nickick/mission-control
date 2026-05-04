"use client";

import { useCallback, useRef } from "react";
import type { TerminalConfig } from "@/lib/schemas";
import TerminalInstance from "./TerminalInstance";
import SystemStatsColumn from "./SystemStatsColumn";
import { Button } from "@/components/ui/button";

interface TerminalGridProps {
  pageId: string;
  terminals: TerminalConfig[];
  focusedIndex: number;
  onFocusIndex: (index: number) => void;
  onRegisterActions: (
    pageId: string,
    index: number,
    actions: { respawn: () => void; inject: (cmd: string) => void }
  ) => void;
  onAddTerminal: () => void;
}

export default function TerminalGrid({
  pageId,
  terminals,
  focusedIndex,
  onFocusIndex,
  onRegisterActions,
  onAddTerminal,
}: TerminalGridProps) {
  const actionsMap = useRef<
    Map<number, { respawn: () => void; inject: (cmd: string) => void }>
  >(new Map());

  const handleRespawnRequest = useCallback(
    (index: number, respawn: () => void) => {
      const existing = actionsMap.current.get(index) ?? { respawn, inject: () => {} };
      existing.respawn = respawn;
      actionsMap.current.set(index, existing);
      onRegisterActions(pageId, index, existing);
    },
    [onRegisterActions]
  );

  const handleInjectRequest = useCallback(
    (index: number, inject: (cmd: string) => void) => {
      const existing = actionsMap.current.get(index) ?? { respawn: () => {}, inject };
      existing.inject = inject;
      actionsMap.current.set(index, existing);
      onRegisterActions(pageId, index, existing);
    },
    [onRegisterActions]
  );

  const cols = 3;
  const rows = Math.max(1, Math.ceil(terminals.length / cols));

  // Build a map of column index → statsHost for the first terminal in that column
  const colStatsHost = (colIdx: number): string | undefined => {
    for (let i = 0; i < terminals.length; i++) {
      if (i % cols === colIdx) return terminals[i]?.statsHost;
    }
    return undefined;
  };

  const hasTerminalInCol = (colIdx: number) =>
    terminals.some((_, i) => i % cols === colIdx);

  return (
    <div className="w-full h-full flex flex-col gap-1 p-1">
      {/* Per-column stats strip */}
      <div
        className="grid gap-1 shrink-0"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {Array.from({ length: cols }).map((_, colIdx) => (
          <div
            key={`stats-${colIdx}`}
            className="bg-[#1e1e1e] rounded px-2 py-0.5"
            style={{ visibility: hasTerminalInCol(colIdx) ? "visible" : "hidden" }}
          >
            <SystemStatsColumn statsHost={colStatsHost(colIdx)} />
          </div>
        ))}
      </div>

      {/* Terminal grid */}
      <div
        className="flex-1 grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {terminals.map((t, i) => (
          <TerminalInstance
            key={t.id}
            sessionId={t.id}
            shell={t.shell}
            command={t.command}
            name={t.name}
            focused={i === focusedIndex}
            onFocus={() => onFocusIndex(i)}
            onRespawnRequest={(respawn) => handleRespawnRequest(i, respawn)}
            onInjectRequest={(inject) => handleInjectRequest(i, inject)}
          />
        ))}
        {Array.from({ length: Math.max(0, cols - terminals.length) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="flex h-full w-full items-center justify-center bg-[#1e1e1e] rounded"
          >
            <Button
              onClick={onAddTerminal}
              variant="outline"
              size="icon-lg"
              className="h-16 w-16 rounded-full border-2 border-[#444] bg-[#1e1e1e] text-2xl text-[#858585] hover:border-[#4fc1ff] hover:text-[#4fc1ff] hover:bg-[#1e1e1e]"
              title="Add terminal (Ctrl+Shift+T)"
            >
              +
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

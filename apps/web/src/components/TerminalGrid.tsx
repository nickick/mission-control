"use client";

import React, { useCallback, useRef } from "react";
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

// Wrapped cell that creates stable callbacks so TerminalInstance can be
// safely memoized without re-rendering every time the parent updates.
const GridCell = React.memo(function GridCell({
  index,
  terminal,
  focused,
  onFocusIndex,
  onRespawnRequest,
  onInjectRequest,
}: {
  index: number;
  terminal: TerminalConfig;
  focused: boolean;
  onFocusIndex: (i: number) => void;
  onRespawnRequest: (i: number, respawn: () => void) => void;
  onInjectRequest: (i: number, inject: (cmd: string) => void) => void;
}) {
  const handleFocus = useCallback(() => onFocusIndex(index), [onFocusIndex, index]);
  const handleRespawn = useCallback(
    (respawn: () => void) => onRespawnRequest(index, respawn),
    [onRespawnRequest, index]
  );
  const handleInject = useCallback(
    (inject: (cmd: string) => void) => onInjectRequest(index, inject),
    [onInjectRequest, index]
  );

  return (
    <TerminalInstance
      sessionId={terminal.id}
      shell={terminal.shell}
      command={terminal.command}
      name={terminal.name}
      statsHost={terminal.statsHost}
      focused={focused}
      onFocus={handleFocus}
      onRespawnRequest={handleRespawn}
      onInjectRequest={handleInject}
    />
  );
});

function TerminalGrid({
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
    [onRegisterActions, pageId]
  );

  const handleInjectRequest = useCallback(
    (index: number, inject: (cmd: string) => void) => {
      const existing = actionsMap.current.get(index) ?? { respawn: () => {}, inject };
      existing.inject = inject;
      actionsMap.current.set(index, existing);
      onRegisterActions(pageId, index, existing);
    },
    [onRegisterActions, pageId]
  );

  const cols = 3;

  const colStatsHost = (colIdx: number): string | undefined => {
    for (let i = 0; i < terminals.length; i++) {
      if (i % cols === colIdx) return terminals[i]?.statsHost;
    }
    return undefined;
  };

  const hasTerminalInCol = (colIdx: number) =>
    terminals.some((_, i) => i % cols === colIdx);

  // Group terminals into columns while preserving original indices
  const columns: { terminal: TerminalConfig; originalIndex: number }[][] =
    Array.from({ length: cols }, () => []);
  terminals.forEach((t, i) => {
    columns[i % cols].push({ terminal: t, originalIndex: i });
  });

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

      {/* Terminal columns */}
      <div className="flex-1 min-h-0 flex gap-1">
        {columns.map((col, colIdx) => (
          <div
            key={`col-${colIdx}`}
            className="flex-1 min-h-0 flex flex-col gap-1 overflow-y-auto"
          >
            {col.map(({ terminal, originalIndex }) => (
              <GridCell
                key={terminal.id}
                index={originalIndex}
                terminal={terminal}
                focused={originalIndex === focusedIndex}
                onFocusIndex={onFocusIndex}
                onRespawnRequest={handleRespawnRequest}
                onInjectRequest={handleInjectRequest}
              />
            ))}
            {col.length === 0 && (
              <div className="flex h-full min-h-[200px] w-full items-center justify-center bg-[#1e1e1e] rounded">
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
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default React.memo(TerminalGrid);

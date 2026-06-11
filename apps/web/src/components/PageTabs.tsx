"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import type { PageConfig } from "@mission-control/types";
import SummaryUsageBadge from "./SummaryUsageBadge";

interface PageTabsProps {
  pages: PageConfig[];
  activeIndex: number;
  onChange: (index: number) => void;
  onRename: (index: number) => void;
  onDelete: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onAddPage: () => void;
  onRefreshAll: () => void;
  onOpenRepos: () => void;
}

export default function PageTabs({
  pages,
  activeIndex,
  onChange,
  onRename,
  onDelete,
  onReorder,
  onAddPage,
  onRefreshAll,
  onOpenRepos,
}: PageTabsProps) {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-[#1e1e1e] border-b border-[#333] shrink-0">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        {pages.map((page, i) => (
          <div
            key={page.id}
            draggable
            onDragStart={(e) => {
              setDraggingIndex(i);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(i));
            }}
            onDragEnd={() => {
              setDraggingIndex(null);
              setDragOverIndex(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (draggingIndex !== null && draggingIndex !== i) {
                setDragOverIndex(i);
              }
            }}
            onDragLeave={() => {
              setDragOverIndex(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = parseInt(e.dataTransfer.getData("text/plain"), 10);
              const to = i;
              setDragOverIndex(null);
              setDraggingIndex(null);
              if (!isNaN(from) && from !== to) {
                onReorder(from, to);
              }
            }}
            className={`group flex items-center gap-1 px-2 py-1 text-xs rounded-t transition-colors cursor-pointer select-none ${
              i === activeIndex
                ? "bg-[#0c0c0c] text-white border-t-2 border-[#4fc1ff]"
                : "bg-[#2d2d2d] text-[#858585] hover:bg-[#3c3c3c]"
            } ${draggingIndex === i ? "opacity-40" : ""} ${
              dragOverIndex === i ? "ring-1 ring-[#4fc1ff] ring-inset" : ""
            }`}
            style={i === activeIndex && page.color ? { borderTopColor: page.color } : undefined}
          >
            <button
              type="button"
              onClick={() => onChange(i)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onRename(i);
              }}
              className="flex items-center gap-1"
            >
              {page.color && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: page.color }}
                />
              )}
              <span className="opacity-50">{i + 1}</span>
              {page.name}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(i);
              }}
              className="ml-1 opacity-0 group-hover:opacity-100 text-[#858585] hover:text-[#e74856] transition-opacity"
              title="Delete tab"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={onAddPage}
          className="px-2 py-1 text-xs rounded-t bg-[#2d2d2d] text-[#858585] hover:bg-[#3c3c3c] hover:text-white transition-colors"
          title="New tab"
        >
          +
        </button>
      </div>
      <SummaryUsageBadge />
      <button
        type="button"
        onClick={onOpenRepos}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#3a3a3a] bg-[#252526] text-[#9cdcfe] transition-colors hover:border-[#4fc1ff] hover:bg-[#2d2d2d] hover:text-white"
        title="Git worktrees"
        aria-label="Open git worktrees panel"
      >
        <Icon icon="mdi:source-branch" width={17} height={17} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onRefreshAll}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#3a3a3a] bg-[#252526] text-[#9cdcfe] transition-colors hover:border-[#4fc1ff] hover:bg-[#2d2d2d] hover:text-white"
        title="Refresh all terminals"
        aria-label="Refresh all terminals"
      >
        <Icon icon="mdi:refresh-circle" width={18} height={18} aria-hidden="true" />
      </button>
    </div>
  );
}

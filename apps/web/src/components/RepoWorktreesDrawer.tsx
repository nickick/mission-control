"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { useConfigStore } from "@/store/useConfigStore";

interface GitWorktree {
  path: string;
  branch?: string;
  head?: string;
  bare: boolean;
}

interface GitBranch {
  name: string;
  current: boolean;
  upstream?: string;
  ahead: number;
  behind: number;
}

interface GitRepoState {
  path: string;
  host?: string;
  currentBranch?: string;
  dirty: boolean;
  ahead: number;
  behind: number;
  worktrees: GitWorktree[];
  branches: GitBranch[];
}

const SOURCES = [
  { value: "", label: "Local" },
  { value: "vps-tailscale", label: "VPS" },
  { value: "rentamac", label: "Rent-a-Mac" },
];

const DEFAULT_ROOTS: Record<string, string[]> = {
  local: ["~/etc/ai/apps"],
  "vps-tailscale": ["~/etc/ai/apps"],
  rentamac: ["~/etc/ai/apps"],
};

function sourceKey(source: string): string {
  return source || "local";
}

function repoName(repoPath: string): string {
  return repoPath.split("/").filter(Boolean).at(-1) ?? repoPath;
}

function branchState(repo: Pick<GitRepoState, "dirty" | "ahead" | "behind">): string {
  const parts: string[] = [];
  if (repo.dirty) parts.push("dirty");
  if (repo.ahead > 0) parts.push(`ahead ${repo.ahead}`);
  if (repo.behind > 0) parts.push(`behind ${repo.behind}`);
  return parts.length ? parts.join(" · ") : "clean";
}

function branchTracking(branch: GitBranch): string {
  const parts: string[] = [];
  if (branch.upstream) parts.push(branch.upstream);
  if (branch.ahead > 0) parts.push(`ahead ${branch.ahead}`);
  if (branch.behind > 0) parts.push(`behind ${branch.behind}`);
  return parts.join(" · ");
}

export default function RepoWorktreesDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [source, setSource] = useState("");
  const [repos, setRepos] = useState<GitRepoState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingRoots, setEditingRoots] = useState(false);
  const requestSeq = useRef(0);
  const repoRoots = useConfigStore((s) => s.repoRoots);
  const setRepoRoots = useConfigStore((s) => s.setRepoRoots);
  const activeSourceKey = sourceKey(source);
  const activeRoots = repoRoots[activeSourceKey] ?? DEFAULT_ROOTS[activeSourceKey] ?? [];
  const [rootsDraft, setRootsDraft] = useState(activeRoots.join("\n"));

  const fetchRepos = async () => {
    const requestId = requestSeq.current + 1;
    requestSeq.current = requestId;
    setLoading(true);
    setError(null);
    setRepos([]);
    try {
      const params = new URLSearchParams();
      if (source) params.set("host", source);
      params.set("roots", JSON.stringify(activeRoots));
      params.set("source", activeSourceKey);
      const res = await fetch(`http://localhost:3001/repos?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (requestSeq.current !== requestId) return;
      if (!res.ok) throw new Error(data?.error ?? "Failed to load repos");
      setRepos(Array.isArray(data.repos) ? data.repos : []);
    } catch (err) {
      if (requestSeq.current !== requestId) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (requestSeq.current === requestId) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (open) {
      void fetchRepos();
    }
    // fetchRepos intentionally stays local so opening/source changes refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeSourceKey, activeRoots.join("\n")]);

  useEffect(() => {
    setRootsDraft(activeRoots.join("\n"));
  }, [activeRoots.join("\n")]);

  const saveRoots = () => {
    const roots = rootsDraft.split("\n").map((root) => root.trim()).filter(Boolean);
    setRepoRoots(activeSourceKey, roots);
    setEditingRoots(false);
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed right-0 top-0 z-50 flex h-screen w-[420px] max-w-[92vw] flex-col border-l border-[#333] bg-[#151515] shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-[#333] bg-[#1e1e1e] px-3 py-2">
          <div>
            <div className="text-sm font-semibold text-white">Git Worktrees</div>
            <div className="text-[11px] text-[#858585]">Branches and working tree state</div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void fetchRepos()}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-[#3a3a3a] bg-[#252526] text-[#9cdcfe] hover:border-[#4fc1ff] hover:text-white"
              title="Refresh repos"
              aria-label="Refresh repos"
            >
              <Icon icon={loading ? "mdi:loading" : "mdi:refresh"} width={16} height={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setEditingRoots((value) => !value)}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-[#3a3a3a] bg-[#252526] text-[#9cdcfe] hover:border-[#4fc1ff] hover:text-white"
              title="Configure repo roots"
              aria-label="Configure repo roots"
            >
              <Icon icon="mdi:cog" width={16} height={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-[#3a3a3a] bg-[#252526] text-[#858585] hover:border-[#e74856] hover:text-white"
              title="Close"
              aria-label="Close git worktrees panel"
            >
              <Icon icon="mdi:close" width={16} height={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex gap-1 border-b border-[#333] bg-[#191919] p-2">
          {SOURCES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setSource(item.value)}
              className={
                "flex-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors " +
                (source === item.value
                  ? "border-[#4fc1ff] bg-[#4fc1ff]/10 text-[#9cdcfe]"
                  : "border-[#333] bg-[#252526] text-[#858585] hover:border-[#555] hover:text-[#cccccc]")
              }
            >
              {item.label}
            </button>
          ))}
        </div>

        {editingRoots ? (
          <div className="border-b border-[#333] bg-[#181818] p-2">
            <div className="mb-1 text-[11px] font-medium text-[#858585]">
              Repo roots for {SOURCES.find((item) => item.value === source)?.label ?? "source"}
            </div>
            <textarea
              value={rootsDraft}
              onChange={(event) => setRootsDraft(event.target.value)}
              className="h-24 w-full resize-none rounded-md border border-[#333] bg-[#101010] px-2 py-1.5 font-mono text-xs text-[#cccccc] outline-none focus:border-[#4fc1ff]"
              placeholder="One root per line, e.g. ~/etc/ai/apps"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-[10px] text-[#686868]">
                Scans git repos under these directories up to depth 4.
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setRootsDraft(activeRoots.join("\n"));
                    setEditingRoots(false);
                  }}
                  className="rounded-md border border-[#333] bg-[#252526] px-2 py-1 text-xs text-[#858585] hover:text-[#cccccc]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveRoots}
                  className="rounded-md border border-[#4fc1ff] bg-[#4fc1ff]/10 px-2 py-1 text-xs text-[#9cdcfe] hover:text-white"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="border-b border-[#333] bg-[#181818] px-3 py-1.5 text-[11px] text-[#686868]">
            Roots: <span className="text-[#858585]">{activeRoots.join(", ")}</span>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {error ? (
            <div className="rounded-md border border-[#e74856]/40 bg-[#e74856]/10 p-3 text-xs text-[#ffb3b8]">
              {error}
            </div>
          ) : null}

          {!error && loading && repos.length === 0 ? (
            <div className="flex h-32 items-center justify-center gap-2 text-xs text-[#858585]">
              <Icon icon="mdi:loading" width={16} height={16} aria-hidden="true" />
              Loading repositories...
            </div>
          ) : null}

          {!error && !loading && repos.length === 0 ? (
            <div className="rounded-md border border-[#333] bg-[#1e1e1e] p-3 text-xs text-[#858585]">
              No git repositories found for this source.
            </div>
          ) : null}

          <div className="space-y-2">
            {repos.map((repo) => (
              <details
                key={`${repo.host ?? "local"}:${repo.path}`}
                className="group rounded-md border border-[#333] bg-[#1e1e1e]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[#cccccc]">{repoName(repo.path)}</div>
                    <div className="truncate text-[11px] text-[#686868]">{repo.path}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-[11px]">
                    <span className="max-w-28 truncate text-[#9cdcfe]">{repo.currentBranch ?? "detached"}</span>
                    <span className={repo.dirty ? "text-[#c19c00]" : "text-[#6a9955]"}>
                      {branchState(repo)}
                    </span>
                    <Icon
                      icon="mdi:chevron-right"
                      width={16}
                      height={16}
                      className="text-[#858585] transition-transform group-open:rotate-90"
                      aria-hidden="true"
                    />
                  </div>
                </summary>

                <div className="border-t border-[#333] px-3 py-2">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#555]">
                    Worktrees
                  </div>
                  <div className="space-y-1">
                    {repo.worktrees.map((worktree) => (
                      <div
                        key={`${worktree.path}:${worktree.branch ?? worktree.head ?? ""}`}
                        className="rounded border border-[#2d2d2d] bg-[#181818] px-2 py-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate text-[#cccccc]">{worktree.branch ?? "detached"}</span>
                          <span className="shrink-0 text-[#686868]">{worktree.head}</span>
                        </div>
                        <div className="truncate text-[11px] text-[#686868]">{worktree.path}</div>
                      </div>
                    ))}
                    {repo.worktrees.length === 0 ? (
                      <div className="text-xs text-[#686868]">No worktrees reported.</div>
                    ) : null}
                  </div>

                  <div className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-wide text-[#555]">
                    Branches
                  </div>
                  <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                    {repo.branches.map((branch) => (
                      <div
                        key={branch.name}
                        className="flex items-center justify-between gap-2 rounded border border-[#2d2d2d] bg-[#181818] px-2 py-1 text-xs"
                      >
                        <span className={branch.current ? "truncate text-[#9cdcfe]" : "truncate text-[#cccccc]"}>
                          {branch.current ? "* " : ""}
                          {branch.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-[#686868]">{branchTracking(branch)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}

import os from "os";
import path from "path";
import { exec, execFile, spawn } from "child_process";

export interface GitWorktree {
  path: string;
  branch?: string;
  head?: string;
  bare: boolean;
}

export interface GitBranch {
  name: string;
  current: boolean;
  upstream?: string;
  ahead: number;
  behind: number;
}

export interface GitRepoState {
  path: string;
  host?: string;
  currentBranch?: string;
  dirty: boolean;
  ahead: number;
  behind: number;
  worktrees: GitWorktree[];
  branches: GitBranch[];
}

function splitRoots(value: string | undefined, fallback: string[]): string[] {
  const roots = value?.split(",").map((root) => root.trim()).filter(Boolean);
  return roots?.length ? roots : fallback;
}

function execPromise(command: string, timeout = 12_000): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, { encoding: "utf-8", timeout, maxBuffer: 1024 * 1024 * 8 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

function execFilePromise(file: string, args: string[], cwd?: string, timeout = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { cwd, encoding: "utf-8", timeout, maxBuffer: 1024 * 1024 * 4 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

function spawnWithInputPromise(
  file: string,
  args: string[],
  input: string,
  timeout = 20_000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`Command timed out: ${file} ${args.join(" ")}`));
    }, timeout);

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `Command exited with code ${code}: ${file} ${args.join(" ")}`));
    });

    child.stdin.end(input);
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

function expandLocalRoot(root: string): string {
  if (root === "~") return os.homedir();
  if (root.startsWith("~/")) return path.join(os.homedir(), root.slice(2));
  return root;
}

async function findLocalRepos(configuredRoots?: string[]): Promise<string[]> {
  const roots = (configuredRoots?.length ? configuredRoots : splitRoots(process.env.MISSION_CONTROL_REPO_ROOTS, [
    path.join(os.homedir(), "etc/ai/apps"),
  ])).map(expandLocalRoot);

  const repoPaths = new Set<string>();
  for (const root of roots) {
    const command = [
      "find",
      shellQuote(root),
      "-maxdepth 4",
      "\\(",
      "-path '*/node_modules'",
      "-o -path '*/.next'",
      "-o -path '*/.turbo'",
      "-o -path '*/dist'",
      "-o -path '*/build'",
      "\\)",
      "-prune",
      "-o",
      "\\(",
      "-name .git",
      "\\(",
      "-type d",
      "-o -type f",
      "\\)",
      "\\)",
      "-print",
    ].join(" ");

    try {
      const output = await execPromise(command);
      for (const gitPath of output.split("\n").map((line) => line.trim()).filter(Boolean)) {
        repoPaths.add(path.dirname(gitPath));
      }
    } catch {
      // Ignore roots that do not exist or cannot be scanned.
    }
  }

  return Array.from(repoPaths).sort();
}

function parseAheadBehind(value: string): { ahead: number; behind: number } {
  const ahead = value.match(/ahead (\d+)/)?.[1];
  const behind = value.match(/behind (\d+)/)?.[1];
  return {
    ahead: ahead ? parseInt(ahead, 10) : 0,
    behind: behind ? parseInt(behind, 10) : 0,
  };
}

async function collectLocalRepo(repoPath: string): Promise<GitRepoState | null> {
  try {
    const [branchOutput, statusOutput, worktreeOutput, branchListOutput] = await Promise.all([
      execFilePromise("git", ["branch", "--show-current"], repoPath).catch(() => ""),
      execFilePromise("git", ["status", "--porcelain=v1", "--branch"], repoPath).catch(() => ""),
      execFilePromise("git", ["worktree", "list", "--porcelain"], repoPath).catch(() => ""),
      execFilePromise(
        "git",
        [
          "branch",
          "--format=%(refname:short)%09%(HEAD)%09%(upstream:short)%09%(upstream:track)",
          "--all",
        ],
        repoPath
      ).catch(() => ""),
    ]);

    const statusLines = statusOutput.split("\n").filter(Boolean);
    const branchState = parseAheadBehind(statusLines[0] ?? "");
    const dirty = statusLines.slice(1).some((line) => line.trim().length > 0);

    return {
      path: repoPath,
      currentBranch: branchOutput.trim() || undefined,
      dirty,
      ahead: branchState.ahead,
      behind: branchState.behind,
      worktrees: parseWorktrees(worktreeOutput),
      branches: parseBranches(branchListOutput),
    };
  } catch {
    return null;
  }
}

function parseWorktrees(output: string): GitWorktree[] {
  const worktrees: GitWorktree[] = [];
  let current: GitWorktree | null = null;

  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current) worktrees.push(current);
      current = { path: line.slice("worktree ".length), bare: false };
    } else if (current && line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length, "HEAD ".length + 8);
    } else if (current && line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    } else if (current && line === "bare") {
      current.bare = true;
    }
  }

  if (current) worktrees.push(current);
  return worktrees;
}

function parseBranches(output: string): GitBranch[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", head = "", upstream = "", track = ""] = line.split("\t");
      const { ahead, behind } = parseAheadBehind(track);
      return {
        name,
        current: head === "*",
        upstream: upstream || undefined,
        ahead,
        behind,
      };
    })
    .sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name));
}

function remoteScannerScript(): string {
  return String.raw`
set -e
if [ "$#" -eq 0 ]; then
  set -- "$HOME/etc/ai/apps"
fi
for root in "$@"; do
  case "$root" in
    "~") root="$HOME" ;;
    "~/"*) root="$HOME/$(printf '%s' "$root" | sed 's#^~/##')" ;;
  esac
  [ -d "$root" ] || continue
  find "$root" -maxdepth 4 \( -path '*/node_modules' -o -path '*/.next' -o -path '*/.turbo' -o -path '*/dist' -o -path '*/build' \) -prune -o \( -name .git \( -type d -o -type f \) \) -print | while IFS= read -r gitpath; do
    repo=$(dirname "$gitpath")
    cd "$repo" || continue
    printf 'REPO\t%s\n' "$repo"
    printf 'HEAD\t%s\n' "$(git branch --show-current 2>/dev/null || true)"
    status=$(git status --porcelain=v1 --branch 2>/dev/null || true)
    first=$(printf '%s\n' "$status" | sed -n '1p')
    dirty=$(printf '%s\n' "$status" | sed '1d' | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')
    printf 'STATUS\t%s\t%s\n' "$dirty" "$first"
    git worktree list --porcelain 2>/dev/null | awk '
      /^worktree /{if(path!=""){printf "WT\t%s\t%s\t%s\t%s\n",path,branch,head,bare}; path=substr($0,10); branch=""; head=""; bare="false"; next}
      /^HEAD /{head=substr($0,6,8); next}
      /^branch /{branch=substr($0,8); sub(/^refs\/heads\//,"",branch); next}
      /^bare$/{bare="true"; next}
      END{if(path!=""){printf "WT\t%s\t%s\t%s\t%s\n",path,branch,head,bare}}
    '
    git branch --format='%(refname:short)%09%(HEAD)%09%(upstream:short)%09%(upstream:track)' --all 2>/dev/null | while IFS="$(printf '\t')" read -r name head upstream track; do
      printf 'BR\t%s\t%s\t%s\t%s\n' "$name" "$head" "$upstream" "$track"
    done
    printf 'END\n'
  done
done
`;
}

function parseRemoteRepos(output: string, host: string): GitRepoState[] {
  const repos: GitRepoState[] = [];
  let current: GitRepoState | null = null;

  for (const line of output.split("\n")) {
    const [kind, ...parts] = line.split("\t");
    if (kind === "REPO") {
      if (current) repos.push(current);
      current = {
        path: parts[0] ?? "",
        host,
        dirty: false,
        ahead: 0,
        behind: 0,
        worktrees: [],
        branches: [],
      };
    } else if (current && kind === "HEAD") {
      current.currentBranch = parts[0] || undefined;
    } else if (current && kind === "STATUS") {
      current.dirty = Number(parts[0] ?? 0) > 0;
      const branchState = parseAheadBehind(parts.slice(1).join(" "));
      current.ahead = branchState.ahead;
      current.behind = branchState.behind;
    } else if (current && kind === "WT") {
      current.worktrees.push({
        path: parts[0] ?? "",
        branch: parts[1] || undefined,
        head: parts[2] || undefined,
        bare: parts[3] === "true",
      });
    } else if (current && kind === "BR") {
      const branchState = parseAheadBehind(parts[3] ?? "");
      current.branches.push({
        name: parts[0] ?? "",
        current: parts[1] === "*",
        upstream: parts[2] || undefined,
        ahead: branchState.ahead,
        behind: branchState.behind,
      });
    } else if (kind === "END" && current) {
      repos.push(current);
      current = null;
    }
  }

  if (current) repos.push(current);
  return repos.sort((a, b) => a.path.localeCompare(b.path));
}

export async function collectGitRepos(host?: string, configuredRoots?: string[]): Promise<GitRepoState[]> {
  if (host?.trim()) {
    const safeHost = host.trim();
    if (!/^[a-zA-Z0-9._-]+$/.test(safeHost)) {
      throw new Error("Invalid SSH host");
    }

    const script = remoteScannerScript();
    const roots = configuredRoots?.length ? configuredRoots : [];
    const output = await spawnWithInputPromise(
      "ssh",
      [
        "-o",
        "ConnectTimeout=5",
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "BatchMode=yes",
        safeHost,
        "bash",
        "-s",
        "--",
        ...roots,
      ],
      script,
      20_000
    );
    return parseRemoteRepos(output, safeHost);
  }

  const repos = await findLocalRepos(configuredRoots);
  const states = await Promise.all(repos.map((repo) => collectLocalRepo(repo)));
  return states.filter((repo): repo is GitRepoState => Boolean(repo));
}

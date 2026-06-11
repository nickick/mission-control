import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Resolve the real working directory of a local PTY shell by pid. Prompt
// scraping can't recover the full path from prompts that only show the last
// path component (default macOS zsh), but the kernel always knows.
export async function GET(req: Request) {
  const pid = Number(new URL(req.url).searchParams.get("pid"));
  if (!Number.isInteger(pid) || pid <= 0) {
    return NextResponse.json({ cwd: null, error: "invalid pid" }, { status: 400 });
  }
  try {
    const { stdout } = await execFileAsync(
      "lsof",
      ["-a", "-p", String(pid), "-d", "cwd", "-Fn"],
      { timeout: 3000 }
    );
    const line = stdout.split("\n").find((l) => l.startsWith("n"));
    return NextResponse.json({ cwd: line ? line.slice(1) : null });
  } catch {
    // Dead pid or lsof unavailable.
    return NextResponse.json({ cwd: null });
  }
}

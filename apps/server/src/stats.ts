import os from "os";
import { execSync, exec } from "child_process";

export interface SystemStats {
  cpuPercent: number;
  memUsed: number;
  memTotal: number;
  memPercent: number;
  diskUsed: number;
  diskTotal: number;
  diskPercent: number;
  uptime: number;
  host?: string;
}

function getDiskStats(): { used: number; total: number; percent: number } {
  try {
    const output = execSync("df -k", { encoding: "utf-8", timeout: 2000 });
    const lines = output.trim().split("\n").slice(1);

    const volumes: { fs: string; total: number; used: number }[] = [];
    for (const line of lines) {
      const parts = line.split(/\s+/).filter(Boolean);
      if (parts.length < 6) continue;
      const fs = parts[0];
      // Skip pseudo filesystems
      if (fs === "devfs" || fs === "map" || fs.startsWith("tmpfs") || fs === "overlay") continue;
      const total = parseInt(parts[1], 10) * 1024;
      const used = parseInt(parts[2], 10) * 1024;
      if (Number.isNaN(total) || Number.isNaN(used) || total <= 0 || used < 0) continue;
      volumes.push({ fs, total, used });
    }

    // Group by physical disk (e.g. /dev/disk3s1 → disk3)
    // On APFS, multiple volumes share one container; total should be counted once per disk
    const diskMap = new Map<string, { total: number; used: number }>();
    for (const vol of volumes) {
      const match = vol.fs.match(/disk(\d+)/);
      const diskKey = match ? `disk${match[1]}` : vol.fs;
      const existing = diskMap.get(diskKey);
      if (existing) {
        existing.total = Math.max(existing.total, vol.total);
        existing.used += vol.used;
      } else {
        diskMap.set(diskKey, { total: vol.total, used: vol.used });
      }
    }

    let totalUsed = 0;
    let totalCapacity = 0;
    for (const disk of diskMap.values()) {
      totalUsed += disk.used;
      totalCapacity += disk.total;
    }

    const percent = totalCapacity > 0 ? Math.round((totalUsed / totalCapacity) * 100) : 0;
    return { used: totalUsed, total: totalCapacity, percent };
  } catch {
    return { used: 0, total: 0, percent: 0 };
  }
}

let lastCpuIdle = 0;
let lastCpuTotal = 0;

function getCpuPercent(): number {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    const times = cpu.times;
    const cpuTotal = times.user + times.nice + times.sys + times.idle + times.irq;
    idle += times.idle;
    total += cpuTotal;
  }

  let percent = 0;
  if (lastCpuTotal > 0) {
    const idleDiff = idle - lastCpuIdle;
    const totalDiff = total - lastCpuTotal;
    percent = totalDiff > 0 ? Math.round(((totalDiff - idleDiff) / totalDiff) * 100) : 0;
  }

  lastCpuIdle = idle;
  lastCpuTotal = total;
  return percent;
}

export function collectStats(): SystemStats {
  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const memUsed = memTotal - memFree;
  const disk = getDiskStats();

  return {
    cpuPercent: getCpuPercent(),
    memUsed,
    memTotal,
    memPercent: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0,
    diskUsed: disk.used,
    diskTotal: disk.total,
    diskPercent: disk.percent,
    uptime: os.uptime(),
  };
}

// ── Remote stats via SSH ────────────────────────────────────────────────────

interface RemoteCpuSample {
  idle: number;
  total: number;
  time: number;
  percent: number;
}

const remoteCpuCache = new Map<string, RemoteCpuSample>();
const remoteStatsFailureCache = new Map<string, number>();
const REMOTE_STATS_FAILURE_LOG_INTERVAL_MS = 60_000;

function parseRemoteCpu(statLine: string, host: string): number {
  // Format: "cpu  12345 0 6789 98765 0 0 0 0 0 0"
  const parts = statLine.trim().split(/\s+/).map(Number).slice(1); // skip "cpu"
  if (parts.some(Number.isNaN)) return 0;

  const idle = parts[3];
  const total = parts.reduce((a, b) => a + b, 0);

  const prev = remoteCpuCache.get(host);
  if (prev) {
    const idleDiff = idle - prev.idle;
    const totalDiff = total - prev.total;
    const timeDiff = Date.now() - prev.time;
    // Only use if enough time has passed (at least 2s between polls)
    if (timeDiff > 2000 && totalDiff > 0) {
      const percent = Math.round(((totalDiff - idleDiff) / totalDiff) * 100);
      remoteCpuCache.set(host, { idle, total, time: Date.now(), percent });
      return Math.min(100, Math.max(0, percent));
    }

    return prev.percent;
  }

  remoteCpuCache.set(host, { idle, total, time: Date.now(), percent: 0 });
  return 0; // First reading — will show 0 until next poll
}

function execPromise(command: string, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = exec(
      command,
      { encoding: "utf-8", timeout },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      }
    );
  });
}

export async function collectRemoteStats(host: string): Promise<SystemStats | null> {
  try {
    // Detect remote OS first
    let isDarwin = false;
    try {
      const unameOutput = await execPromise(
        `ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -o BatchMode=yes ${host} 'uname -s'`,
        5000
      );
      isDarwin = unameOutput.trim() === "Darwin";
    } catch {
      // If uname fails, assume Linux and continue — the second SSH might still work
    }

    let script: string;
    if (isDarwin) {
      // macOS remote — do all parsing on the remote side so we get clean numbers back
      script = `echo "---LOAD---"
sysctl -n vm.loadavg | sed 's/[{}]//g' | awk '{print $1}'
echo "---MEMTOTAL---"
sysctl -n hw.memsize
echo "---MEMUSED---"
ps=$(sysctl -n hw.pagesize 2>/dev/null || getconf PAGESIZE 2>/dev/null || echo 4096)
vm_stat | awk -v ps="$ps" '
/Pages active/{gsub(/[^0-9]/,"",$3); a=$3}
/Pages inactive/{gsub(/[^0-9]/,"",$3); i=$3}
/Pages speculative/{gsub(/[^0-9]/,"",$3); s=$3}
/Pages wired down/{gsub(/[^0-9]/,"",$4); w=$4}
/Pages occupied by compressor/{gsub(/[^0-9]/,"",$5); c=$5}
END{print (a+i+s+w+c)*ps}'
echo "---DISK---"
df -k / | tail -1 | awk '{print $2,$3}'
echo "---CPU---"
top -l 1 -n 0 2>/dev/null | grep "CPU usage" | sed 's/%//g' | awk '{for(i=1;i<=NF;i++){if($i=="user")u=$(i-1); if($i=="sys")s=$(i-1)}} END{print int(u+s)}'
echo "---DONE---"`;
    } else {
      // Linux remote — do simple parsing on remote side; keep raw CPU line for delta
      script = `echo "---LOAD---"
awk '{print $1}' /proc/loadavg
echo "---MEMTOTAL---"
awk '/MemTotal/{print $2}' /proc/meminfo
echo "---MEMUSED---"
awk '/MemTotal/{t=$2} /MemAvailable/{a=$2} END{print t-a}' /proc/meminfo
echo "---DISK---"
df -k / | tail -1 | awk '{print $2,$3}'
echo "---CPU---"
grep '^cpu ' /proc/stat
echo "---DONE---"`;
    }

    const output = await execPromise(
      `ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -o BatchMode=yes ${host} '${script.replace(/'/g, "'\"'\"'")}'`,
      8000
    );

    let load1min = 0;
    let memTotal = 0;
    let memUsed = 0;
    let diskTotal = 0;
    let diskUsed = 0;
    let cpuStatLine = "";

    const lines = output.split("\n");
    let section = "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("---LOAD---")) { section = "load"; continue; }
      if (trimmed.startsWith("---MEMTOTAL---")) { section = "memtotal"; continue; }
      if (trimmed.startsWith("---MEMUSED---")) { section = "memused"; continue; }
      if (trimmed.startsWith("---DISK---")) { section = "disk"; continue; }
      if (trimmed.startsWith("---CPU---")) { section = "cpu"; continue; }
      if (trimmed.startsWith("---DONE---")) break;
      if (!trimmed) continue;

      if (section === "load") {
        load1min = parseFloat(trimmed) || 0;
      } else if (section === "memtotal") {
        memTotal = parseInt(trimmed, 10) || 0;
        if (!isDarwin) memTotal *= 1024; // Linux /proc/meminfo is in KB
      } else if (section === "memused") {
        memUsed = parseInt(trimmed, 10) || 0;
        if (!isDarwin) memUsed *= 1024; // Linux /proc/meminfo is in KB
      } else if (section === "disk") {
        const parts = trimmed.split(/\s+/);
        diskTotal = (parseInt(parts[0] ?? "0", 10) || 0) * 1024;
        diskUsed = (parseInt(parts[1] ?? "0", 10) || 0) * 1024;
      } else if (section === "cpu") {
        cpuStatLine = trimmed;
      }
    }

    const cpuPercent = isDarwin
      ? (parseInt(cpuStatLine, 10) || 0)
      : parseRemoteCpu(cpuStatLine, host);

    const memPercent = memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0;
    const diskPercent = diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0;

    return {
      cpuPercent,
      memUsed,
      memTotal,
      memPercent,
      diskUsed,
      diskTotal,
      diskPercent,
      uptime: 0,
      host,
    };
  } catch (err) {
    const now = Date.now();
    const lastLogged = remoteStatsFailureCache.get(host) ?? 0;
    if (now - lastLogged > REMOTE_STATS_FAILURE_LOG_INTERVAL_MS) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[stats] remote stats unavailable for ${host}: ${message}`);
      remoteStatsFailureCache.set(host, now);
    }
    return null;
  }
}

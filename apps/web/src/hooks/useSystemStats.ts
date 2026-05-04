"use client";

import { useEffect, useState } from "react";

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

export function formatBytes(bytes: number): string {
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(0)} MB`;
}

/**
 * Extract SSH host from explicit `ssh [flags] host ...` commands.
 */
export function extractSshHost(sshCommand: string | undefined): string | undefined {
  if (!sshCommand) return undefined;
  const sshMatch = sshCommand.match(/ssh\s+(?:-[a-zA-Z]+\s+)*([a-zA-Z0-9._-]+)/);
  return sshMatch?.[1];
}

export function useSystemStats(pollMs = 5000, sshHost?: string) {
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchStats = async () => {
      try {
        const url = sshHost
          ? `http://localhost:3001/stats?host=${encodeURIComponent(sshHost)}`
          : "http://localhost:3001/stats";
        const res = await fetch(url);
        if (!mounted) return;
        const data = (await res.json()) as SystemStats;
        if (mounted) setStats(data);
      } catch (err) {
        if (mounted) {
          console.error("[stats] fetch failed:", err);
        }
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, pollMs);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [pollMs, sshHost]);

  return {
    stats,
    formatBytes,
  };
}

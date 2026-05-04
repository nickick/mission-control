"use client";

import { useSystemStats, formatBytes } from "@/hooks/useSystemStats";

export default function SystemStatsBar() {
  const { stats } = useSystemStats(5000);

  const cpuColor = stats && stats.cpuPercent > 80 ? "#e74856" : stats && stats.cpuPercent > 50 ? "#c19c00" : "#4fc1ff";
  const ramColor = stats && stats.memPercent > 85 ? "#e74856" : stats && stats.memPercent > 60 ? "#c19c00" : "#4fc1ff";
  const diskColor = stats && stats.diskPercent > 90 ? "#e74856" : stats && stats.diskPercent > 70 ? "#c19c00" : "#4fc1ff";

  return (
    <div
      className="w-full grid gap-1 px-1 py-0.5 bg-[#1e1e1e] border-b border-[#333] shrink-0"
      style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
    >
      <div className="flex items-center justify-center gap-1.5 text-[10px] text-[#858585]">
        <span className="text-[#555]">CPU</span>
        <span style={{ color: cpuColor }}>
          {stats ? `${stats.cpuPercent}%` : "—"}
        </span>
      </div>
      <div className="flex items-center justify-center gap-1.5 text-[10px] text-[#858585]">
        <span className="text-[#555]">RAM</span>
        <span style={{ color: ramColor }}>
          {stats ? `${formatBytes(stats.memUsed)} / ${formatBytes(stats.memTotal)} (${stats.memPercent}%)` : "—"}
        </span>
      </div>
      <div className="flex items-center justify-center gap-1.5 text-[10px] text-[#858585]">
        <span className="text-[#555]">Disk</span>
        <span style={{ color: diskColor }}>
          {stats ? `${formatBytes(stats.diskUsed)} / ${formatBytes(stats.diskTotal)} (${stats.diskPercent}%)` : "—"}
        </span>
      </div>
    </div>
  );
}

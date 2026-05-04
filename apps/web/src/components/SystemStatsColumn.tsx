"use client";

import { useSystemStats } from "@/hooks/useSystemStats";

interface SystemStatsColumnProps {
  statsHost?: string;
}

export default function SystemStatsColumn({ statsHost }: SystemStatsColumnProps) {
  const { stats } = useSystemStats(5000, statsHost);

  if (!stats) {
    return (
      <div className="flex items-center justify-center gap-2 text-[10px] text-[#555]">
        <span>—</span>
      </div>
    );
  }

  const cpuColor = stats.cpuPercent > 80 ? "#e74856" : stats.cpuPercent > 50 ? "#c19c00" : "#4fc1ff";
  const ramColor = stats.memPercent > 85 ? "#e74856" : stats.memPercent > 60 ? "#c19c00" : "#4fc1ff";
  const diskColor = stats.diskPercent > 90 ? "#e74856" : stats.diskPercent > 70 ? "#c19c00" : "#4fc1ff";

  const hostLabel = stats.host ?? (statsHost ? statsHost : "local");

  return (
    <div className="flex items-center justify-center gap-2 text-[10px] text-[#858585]">
      <span className="text-[#666] uppercase">{hostLabel}</span>
      <span className="text-[#444]">|</span>
      <span style={{ color: cpuColor }}>CPU {stats.cpuPercent}%</span>
      <span className="text-[#444]">|</span>
      <span style={{ color: ramColor }}>RAM {stats.memPercent}%</span>
      <span className="text-[#444]">|</span>
      <span style={{ color: diskColor }}>Disk {stats.diskPercent}%</span>
    </div>
  );
}

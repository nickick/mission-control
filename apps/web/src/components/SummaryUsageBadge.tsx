"use client";

import { useEffect, useState } from "react";

interface UsageWindow {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

interface UsageResponse {
  last24h: UsageWindow;
  lifetime: UsageWindow & { since: number | null };
  queue?: { pending: number; active: number };
}

const POLL_MS = 60000;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

function windowTooltip(label: string, w: UsageWindow): string {
  return `${label}: ${w.inputTokens.toLocaleString()} in / ${w.outputTokens.toLocaleString()} out tok, ${w.calls} calls, ${formatCost(w.costUsd)}`;
}

// Age of the lifetime ledger: how far back the totals reach.
function formatAge(since: number | null): string {
  if (!since) return "all";
  const mins = Math.max(1, Math.round((Date.now() - since) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = mins / 60;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export default function SummaryUsageBadge() {
  const [usage, setUsage] = useState<UsageResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetch("/api/summarize")
        .then((res) => (res.ok ? res.json() : null))
        .then((data: UsageResponse | null) => {
          if (!cancelled && data && data.last24h && data.lifetime) {
            setUsage(data);
          }
        })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!usage) return null;

  const queued = usage.queue ? usage.queue.pending + usage.queue.active : 0;

  return (
    <div
      className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-[#3a3a3a] bg-[#252526] px-2 font-mono text-[11px] text-[#9cdcfe]"
      title={[
        "Gemini summarization spend",
        windowTooltip("Last 24h", usage.last24h),
        windowTooltip(
          usage.lifetime.since
            ? `Lifetime (since ${new Date(usage.lifetime.since).toLocaleString()})`
            : "Lifetime",
          usage.lifetime
        ),
        usage.queue ? `Queue: ${usage.queue.pending} pending, ${usage.queue.active} active` : "",
      ]
        .filter(Boolean)
        .join("\n")}
    >
      <span>
        {formatTokens(usage.last24h.totalTokens)} tok · {formatCost(usage.last24h.costUsd)} · 24h
      </span>
      <span className="text-[#4a4a4a]">|</span>
      <span className="text-[#7aa6c2]">
        {formatTokens(usage.lifetime.totalTokens)} tok · {formatCost(usage.lifetime.costUsd)} ·{" "}
        {formatAge(usage.lifetime.since)}
      </span>
      {queued > 0 && (
        <>
          <span className="text-[#4a4a4a]">|</span>
          <span>{queued} queued</span>
        </>
      )}
    </div>
  );
}

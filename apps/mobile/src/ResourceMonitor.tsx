import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

// Compact CPU / RAM / Disk bar for the VPS, sourced from the mission-control
// server's /stats (same numbers the desktop shows). Config is build-time via
// EXPO_PUBLIC_MC_STATS_* so it adds no Settings UI; hidden if unset.

const STATS_URL = process.env.EXPO_PUBLIC_MC_STATS_URL ?? "";
const STATS_TOKEN = process.env.EXPO_PUBLIC_MC_STATS_TOKEN ?? "";
const POLL_MS = 5000;

interface Stats {
  cpuPercent: number;
  memPercent: number;
  diskPercent: number;
}

function colorFor(pct: number): string {
  if (pct >= 90) return "#e74856";
  if (pct >= 70) return "#f9a825";
  return "#16c60c";
}

function Gauge({ label, pct }: { label: string; pct: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <View style={styles.gauge}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${clamped}%`, backgroundColor: colorFor(clamped) }]} />
      </View>
      <Text style={styles.pct}>{clamped}%</Text>
    </View>
  );
}

export default function ResourceMonitor() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!STATS_URL || !STATS_TOKEN) return;
    let cancelled = false;
    const load = () => {
      fetch(`${STATS_URL}/stats`, { headers: { Authorization: `Bearer ${STATS_TOKEN}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: Stats | null) => {
          if (!cancelled && d && typeof d.cpuPercent === "number") setStats(d);
        })
        .catch(() => {});
    };
    load();
    const iv = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  if (!STATS_URL || !STATS_TOKEN || !stats) return null;

  return (
    <View style={styles.row}>
      <Gauge label="CPU" pct={stats.cpuPercent} />
      <Gauge label="RAM" pct={stats.memPercent} />
      <Gauge label="DISK" pct={stats.diskPercent} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: "#161616",
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  gauge: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  label: { color: "#858585", fontSize: 10, fontWeight: "600", width: 30 },
  track: { flex: 1, height: 5, borderRadius: 3, backgroundColor: "#2a2a2a", overflow: "hidden" },
  fill: { height: 5, borderRadius: 3 },
  pct: { color: "#9aa", fontSize: 10, width: 30, textAlign: "right" },
});

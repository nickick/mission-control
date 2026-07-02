import AsyncStorage from "@react-native-async-storage/async-storage";

// Registry of sessions THIS app created, so the drawer shows only our chats —
// not every gateway session (heartbeats, agent-internal, other clients).

const KEY = "mc.localSessions.v1";

export interface LocalSession {
  key: string; // gateway session key (agent:<agentId>:<uuid>)
  agentId: string;
  label: string;
  createdAt: number;
  updatedAt: number;
}

export async function getLocalSessions(): Promise<LocalSession[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as LocalSession[]) : [];
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function recordLocalSession(key: string, agentId: string, label: string): Promise<void> {
  const list = await getLocalSessions();
  const now = Date.now();
  const existing = list.find((s) => s.key === key);
  let next: LocalSession[];
  if (existing) {
    // Keep the first non-default label; always bump recency.
    const keepLabel = existing.label && existing.label !== "New chat" ? existing.label : label;
    next = list.map((s) => (s.key === key ? { ...s, label: keepLabel, updatedAt: now } : s));
  } else {
    next = [{ key, agentId, label: label || "New chat", createdAt: now, updatedAt: now }, ...list];
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

export async function removeLocalSession(key: string): Promise<void> {
  const list = await getLocalSessions();
  await AsyncStorage.setItem(KEY, JSON.stringify(list.filter((s) => s.key !== key)));
}

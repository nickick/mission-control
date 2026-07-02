import AsyncStorage from "@react-native-async-storage/async-storage";

// Local cache of rendered chat messages per session. The gateway's chat.history
// only persists ~15s after a turn and drops idle sessions from its list, so the
// client keeps its own copy to survive reloads instantly and completely.

export interface StoredMsg {
  id: string;
  seq: number;
  role: "user" | "assistant" | "system" | "tool";
  text: string;
}

const MAX = 400;
const k = (sessionKey: string) => `mc.msgs.${sessionKey}`;

export async function loadMessages(sessionKey: string): Promise<StoredMsg[]> {
  try {
    const raw = await AsyncStorage.getItem(k(sessionKey));
    return raw ? (JSON.parse(raw) as StoredMsg[]) : [];
  } catch {
    return [];
  }
}

export async function saveMessages(sessionKey: string, msgs: StoredMsg[]): Promise<void> {
  try {
    await AsyncStorage.setItem(k(sessionKey), JSON.stringify(msgs.slice(-MAX)));
  } catch {
    // best-effort cache
  }
}

export async function clearMessages(sessionKey: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(k(sessionKey));
  } catch {
    // ignore
  }
}

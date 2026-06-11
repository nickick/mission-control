import * as SecureStore from "expo-secure-store";

// Connection settings live in the iOS Keychain (SecureStore); FaceID gates
// the app, the Keychain protects the token at rest.

export interface AppConfig {
  serverUrl: string; // e.g. http://100.114.107.124:3001 (tailnet address)
  token: string;
  agentSession: string; // tmux session the chat talks to, e.g. molt-0
}

const KEYS: Record<keyof AppConfig, string> = {
  serverUrl: "mc.serverUrl",
  token: "mc.token",
  agentSession: "mc.agentSession",
};

// Defaults prefill the settings screen on first run. The bearer token is
// never committed — put it in apps/mobile/.env (gitignored) as
// EXPO_PUBLIC_MC_TOKEN; Expo inlines EXPO_PUBLIC_* vars at bundle time.
export const DEFAULT_CONFIG: AppConfig = {
  serverUrl: process.env.EXPO_PUBLIC_MC_SERVER_URL ?? "http://100.114.107.124:3001",
  token: process.env.EXPO_PUBLIC_MC_TOKEN ?? "",
  agentSession: process.env.EXPO_PUBLIC_MC_SESSION ?? "claw-0",
};

export async function loadConfig(): Promise<AppConfig> {
  const [serverUrl, token, agentSession] = await Promise.all([
    SecureStore.getItemAsync(KEYS.serverUrl),
    SecureStore.getItemAsync(KEYS.token),
    SecureStore.getItemAsync(KEYS.agentSession),
  ]);
  return {
    serverUrl: serverUrl ?? DEFAULT_CONFIG.serverUrl,
    token: token ?? DEFAULT_CONFIG.token,
    agentSession: agentSession ?? DEFAULT_CONFIG.agentSession,
  };
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.serverUrl, config.serverUrl.trim().replace(/\/+$/, "")),
    SecureStore.setItemAsync(KEYS.token, config.token.trim()),
    SecureStore.setItemAsync(KEYS.agentSession, config.agentSession.trim()),
  ]);
}

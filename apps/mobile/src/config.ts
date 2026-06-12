import * as SecureStore from "expo-secure-store";

// The client talks directly to the OpenClaw gateway over TLS (real ts.net
// cert, so iOS ATS is satisfied). FaceID gates the app; the Keychain
// (SecureStore) protects the gateway token at rest.

export interface AppConfig {
  gatewayUrl: string; // e.g. https://vps-1a5874b1.tailed2d0f.ts.net:8443
  sinkUrl: string; // tool-event SSE, e.g. https://vps-1a5874b1.tailed2d0f.ts.net:9443
  token: string; // GATEWAY_TOKEN
  agent: string; // e.g. openclaw/chief-of-staff
}

const KEYS: Record<keyof AppConfig, string> = {
  gatewayUrl: "mc.gatewayUrl",
  sinkUrl: "mc.sinkUrl",
  token: "mc.token",
  agent: "mc.agent",
};

// Defaults prefill settings on first run. The token is read from gitignored
// apps/mobile/.env (EXPO_PUBLIC_MC_TOKEN); Expo inlines EXPO_PUBLIC_* at build.
export const DEFAULT_CONFIG: AppConfig = {
  gatewayUrl: process.env.EXPO_PUBLIC_MC_GATEWAY_URL ?? "https://vps-1a5874b1.tailed2d0f.ts.net:8443",
  sinkUrl: process.env.EXPO_PUBLIC_MC_SINK_URL ?? "https://vps-1a5874b1.tailed2d0f.ts.net:9443",
  token: process.env.EXPO_PUBLIC_MC_TOKEN ?? "",
  agent: process.env.EXPO_PUBLIC_MC_AGENT ?? "openclaw/chief-of-staff",
};

export async function loadConfig(): Promise<AppConfig> {
  const [gatewayUrl, sinkUrl, token, agent] = await Promise.all([
    SecureStore.getItemAsync(KEYS.gatewayUrl),
    SecureStore.getItemAsync(KEYS.sinkUrl),
    SecureStore.getItemAsync(KEYS.token),
    SecureStore.getItemAsync(KEYS.agent),
  ]);
  return {
    gatewayUrl: gatewayUrl ?? DEFAULT_CONFIG.gatewayUrl,
    sinkUrl: sinkUrl ?? DEFAULT_CONFIG.sinkUrl,
    token: token ?? DEFAULT_CONFIG.token,
    agent: agent ?? DEFAULT_CONFIG.agent,
  };
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.gatewayUrl, config.gatewayUrl.trim().replace(/\/+$/, "")),
    SecureStore.setItemAsync(KEYS.sinkUrl, config.sinkUrl.trim().replace(/\/+$/, "")),
    SecureStore.setItemAsync(KEYS.token, config.token.trim()),
    SecureStore.setItemAsync(KEYS.agent, config.agent.trim()),
  ]);
}

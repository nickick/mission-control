import * as ed from "@noble/ed25519";
import { sha512, sha256 } from "@noble/hashes/sha2.js";
import * as SecureStore from "expo-secure-store";

// @noble/ed25519 v3 needs a SHA-512 implementation wired in (RN has no
// crypto.subtle). The hook lives on `ed.hashes`.
ed.hashes.sha512 = (m: Uint8Array) => sha512(m);
ed.hashes.sha512Async = async (m: Uint8Array) => sha512(m);

// Persistent Ed25519 device identity, matching the gateway's encoding:
// raw key bytes base64url-encoded, deviceId = sha256(publicKey) hex.

const STORAGE_KEY = "mc.deviceIdentity.v1";

export interface DeviceIdentity {
  deviceId: string;
  publicKey: string; // base64url(raw 32 bytes)
  privateKey: string; // base64url(raw 32 bytes)
}

function b64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function b64urlDecode(input: string): Uint8Array {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function loadOrCreateIdentity(): Promise<DeviceIdentity> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DeviceIdentity;
      if (parsed.deviceId && parsed.publicKey && parsed.privateKey) return parsed;
    }
  } catch {
    // regenerate
  }
  const privateKey = ed.utils.randomSecretKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  const identity: DeviceIdentity = {
    deviceId: toHex(sha256(publicKey)),
    publicKey: b64urlEncode(publicKey),
    privateKey: b64urlEncode(privateKey),
  };
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}

export async function signPayload(privateKeyB64url: string, payload: string): Promise<string> {
  const key = b64urlDecode(privateKeyB64url);
  const data = new TextEncoder().encode(payload);
  const sig = await ed.signAsync(data, key);
  return b64urlEncode(sig);
}

// The exact byte string the gateway reconstructs and verifies (v2 contract).
export function buildDeviceAuthPayloadV2(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce: string;
}): string {
  return [
    "v2",
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(","),
    String(params.signedAtMs),
    params.token ?? "",
    params.nonce,
  ].join("|");
}

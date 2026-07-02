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

// Dependency-free base64url (no btoa/atob — not guaranteed in the RN runtime).
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64_LOOKUP: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64[i]] = i;

function b64urlEncode(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  if (i < bytes.length) {
    const rem = bytes.length - i;
    if (rem === 1) {
      const n = bytes[i] << 16;
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    } else {
      const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63];
    }
  }
  return out;
}

function b64urlDecode(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9\-_]/g, "");
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_LOOKUP[clean[i]];
    const c1 = B64_LOOKUP[clean[i + 1]];
    const c2 = clean[i + 2] !== undefined ? B64_LOOKUP[clean[i + 2]] : undefined;
    const c3 = clean[i + 3] !== undefined ? B64_LOOKUP[clean[i + 3]] : undefined;
    out.push((c0 << 2) | (c1 >> 4));
    if (c2 !== undefined) out.push(((c1 & 15) << 4) | (c2 >> 2));
    if (c2 !== undefined && c3 !== undefined) out.push(((c2 & 3) << 6) | c3);
  }
  return new Uint8Array(out);
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

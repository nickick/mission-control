import * as SecureStore from "expo-secure-store";
import { buildDeviceAuthPayloadV2, loadOrCreateIdentity, signPayload, type DeviceIdentity } from "./identity";

// Node-protocol gateway client (protocol 3). Connects over WSS, authenticates
// with an Ed25519 device identity (operator role), and exposes request() RPC
// plus an event stream (session.message / session.tool / sessions.changed).

const PROTOCOL = 3;
const CLIENT_ID = "openclaw-ios";
const CLIENT_MODE = "ui";
const OPERATOR_SCOPES = [
  "operator.admin",
  "operator.read",
  "operator.write",
  "operator.approvals",
  "operator.pairing",
];
const DEVICE_TOKEN_KEY = "mc.deviceToken.v1";
const REQUEST_TIMEOUT_MS = 60_000;

export type GatewayStatus =
  | { state: "connecting" }
  | { state: "pairing"; requestId: string; deviceId: string }
  | { state: "connected" }
  | { state: "error"; message: string };

export interface GatewayEvent {
  event: string;
  payload?: unknown;
}

export interface GatewayClientOptions {
  url: string;
  token: string;
  onStatus?: (status: GatewayStatus) => void;
  onEvent?: (evt: GatewayEvent) => void;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class GatewayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private idCounter = 1;
  private closed = false;
  private connected = false;
  private connectSent = false;
  private identity: DeviceIdentity | null = null;
  private deviceToken: string | null = null;
  private backoffMs = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readyResolvers: Array<() => void> = [];

  constructor(private opts: GatewayClientOptions) {}

  async start() {
    this.closed = false;
    if (!this.identity) this.identity = await loadOrCreateIdentity();
    if (this.deviceToken === null) {
      this.deviceToken = (await SecureStore.getItemAsync(DEVICE_TOKEN_KEY)) ?? "";
    }
    this.connect();
  }

  stop() {
    this.closed = true;
    this.clearReconnect();
    this.ws?.close();
    this.ws = null;
  }

  isConnected() {
    return this.connected;
  }

  /** Resolves once authenticated (or rejects if the client is stopped). */
  whenReady(): Promise<void> {
    if (this.connected) return Promise.resolve();
    return new Promise((resolve) => this.readyResolvers.push(resolve));
  }

  private setStatus(s: GatewayStatus) {
    this.opts.onStatus?.(s);
  }

  private connect() {
    this.connectSent = false;
    this.setStatus({ state: "connecting" });
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.opts.url);
    } catch (err) {
      this.setStatus({ state: "error", message: String(err) });
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onmessage = (ev) => this.handleMessage(String((ev as MessageEvent).data ?? ""));
    ws.onerror = () => {
      /* close will follow */
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.connected = false;
      this.flushPending(new Error("gateway connection closed"));
      if (!this.closed) this.scheduleReconnect();
    };
    // Some gateways send connect.challenge first; if not, send connect on open.
    ws.onopen = () => {
      if (!this.connectSent) void this.sendConnect("");
    };
  }

  private async sendConnect(nonce: string) {
    if (this.connectSent || !this.ws || !this.identity) return;
    this.connectSent = true;
    const signedAtMs = Date.now();
    const payload = buildDeviceAuthPayloadV2({
      deviceId: this.identity.deviceId,
      clientId: CLIENT_ID,
      clientMode: CLIENT_MODE,
      role: "operator",
      scopes: OPERATOR_SCOPES,
      signedAtMs,
      token: this.opts.token,
      nonce,
    });
    const signature = await signPayload(this.identity.privateKey, payload);
    try {
      const hello = (await this.requestRaw("connect", {
        minProtocol: PROTOCOL,
        maxProtocol: PROTOCOL,
        client: { id: CLIENT_ID, version: "1.0.0", platform: "ios", mode: CLIENT_MODE, instanceId: this.identity.deviceId.slice(0, 16) },
        role: "operator",
        scopes: OPERATOR_SCOPES,
        caps: [],
        device: {
          id: this.identity.deviceId,
          publicKey: this.identity.publicKey,
          signature,
          signedAt: signedAtMs,
          nonce,
        },
        auth: { token: this.opts.token, ...(this.deviceToken ? { deviceToken: this.deviceToken } : {}) },
        locale: "en-US",
        userAgent: "mission-control-mobile/1.0",
      })) as { auth?: { deviceToken?: string } };

      if (hello?.auth?.deviceToken) {
        this.deviceToken = hello.auth.deviceToken;
        void SecureStore.setItemAsync(DEVICE_TOKEN_KEY, hello.auth.deviceToken);
      }
      this.connected = true;
      this.backoffMs = 1000;
      this.setStatus({ state: "connected" });
      this.readyResolvers.forEach((r) => r());
      this.readyResolvers = [];
    } catch (err) {
      const e = err as { code?: string; details?: { requestId?: string } };
      if (e?.code === "NOT_PAIRED" || e?.details?.requestId) {
        this.setStatus({
          state: "pairing",
          requestId: e.details?.requestId ?? "",
          deviceId: this.identity.deviceId,
        });
        // Poll until the owner approves the device, then this reconnect succeeds.
        this.scheduleReconnect(5000);
      } else {
        this.setStatus({ state: "error", message: (err as Error)?.message ?? "connect failed" });
        this.scheduleReconnect();
      }
    }
  }

  private requestRaw(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const ws = this.ws;
      if (!ws || ws.readyState !== 1) {
        reject(new Error("gateway not connected"));
        return;
      }
      const id = `c${this.idCounter++}`;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`request timed out: ${method}`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ type: "req", id, method, params }));
    });
  }

  /** Public RPC — waits for auth, then sends. */
  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.connected) await this.whenReady();
    return this.requestRaw(method, params) as Promise<T>;
  }

  private handleMessage(raw: string) {
    let frame: { type?: string; id?: string; ok?: boolean; payload?: unknown; error?: { code?: string; message?: string; details?: unknown }; event?: string };
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    if (frame.type === "event") {
      if (frame.event === "connect.challenge") {
        const nonce = (frame.payload as { nonce?: string } | undefined)?.nonce ?? "";
        if (!this.connectSent) void this.sendConnect(nonce);
        return;
      }
      this.opts.onEvent?.({ event: frame.event ?? "", payload: frame.payload });
      return;
    }
    if (frame.type === "res" && frame.id) {
      const p = this.pending.get(frame.id);
      if (!p) return;
      this.pending.delete(frame.id);
      clearTimeout(p.timer);
      if (frame.ok) {
        p.resolve(frame.payload);
      } else {
        const err = new Error(frame.error?.message ?? "request failed") as Error & {
          code?: string;
          details?: unknown;
        };
        err.code = frame.error?.code;
        err.details = frame.error?.details;
        p.reject(err);
      }
    }
  }

  private flushPending(err: Error) {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  private clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(delayMs?: number) {
    if (this.closed) return;
    this.clearReconnect();
    const delay = delayMs ?? this.backoffMs;
    if (delayMs === undefined) this.backoffMs = Math.min(this.backoffMs * 1.7, 15_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

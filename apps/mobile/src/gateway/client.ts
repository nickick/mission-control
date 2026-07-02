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
  private challengeTimer: ReturnType<typeof setTimeout> | null = null;
  private readyResolvers: Array<() => void> = [];
  private failedAttempts = 0;
  private awaitingPairing = false;

  constructor(private opts: GatewayClientOptions) {}

  async start() {
    this.closed = false;
    try {
      if (!this.identity) this.identity = await loadOrCreateIdentity();
      if (this.deviceToken === null) {
        this.deviceToken = (await SecureStore.getItemAsync(DEVICE_TOKEN_KEY)) ?? "";
      }
    } catch (err) {
      // Crypto/keychain failure — surface it instead of hanging on "connecting".
      this.setStatus({
        state: "error",
        message: `Identity setup failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
    this.connect();
  }

  stop() {
    this.closed = true;
    this.clearReconnect();
    this.clearChallengeTimer();
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
    // While awaiting pairing approval we keep polling silently — don't flip the
    // UI back to "connecting" (that caused a pairing⇄connecting flicker).
    if (!this.awaitingPairing) this.setStatus({ state: "connecting" });
    let ws: WebSocket;
    try {
      // React Native auto-injects an Origin header, which the gateway treats
      // as a browser/Control-UI connection and rejects (its origin allowlist
      // is empty). An empty Origin is accepted as "no origin", so the gateway
      // takes the normal device-auth path. The 3rd options arg is RN-only.
      const RNWebSocket = WebSocket as unknown as new (
        url: string,
        protocols: string[] | undefined,
        options: { headers: Record<string, string> }
      ) => WebSocket;
      ws = new RNWebSocket(this.opts.url, undefined, { headers: { origin: "" } });
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
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      const wasConnected = this.connected;
      this.connected = false;
      this.clearChallengeTimer();
      this.flushPending(new Error("gateway connection closed"));
      if (this.closed) return;
      // A NOT_PAIRED rejection closes the socket; that's expected while we poll
      // for approval, so don't treat it as a reachability failure.
      if (this.awaitingPairing) {
        this.scheduleReconnect(5000);
        return;
      }
      // Surface a real error once the first attempts fail, so the user isn't
      // stuck on a perpetual "connecting" spinner (common cause: phone not on
      // the tailnet so the gateway host is unreachable).
      if (!wasConnected) {
        this.failedAttempts += 1;
        if (this.failedAttempts >= 2) {
          const reason = (ev as CloseEvent)?.reason;
          this.setStatus({
            state: "error",
            message: reason
              ? `Can't reach gateway: ${reason}`
              : "Can't reach the gateway. Is Tailscale on and the gateway URL correct?",
          });
        }
      }
      this.scheduleReconnect();
    };
    // The gateway sends connect.challenge with a nonce; sign against it. Only
    // fall back to a nonce-less connect if no challenge arrives shortly (for
    // gateways that don't challenge).
    ws.onopen = () => {
      this.clearChallengeTimer();
      this.challengeTimer = setTimeout(() => {
        if (!this.connectSent) void this.sendConnect("");
      }, 800);
    };
  }

  private clearChallengeTimer() {
    if (this.challengeTimer) {
      clearTimeout(this.challengeTimer);
      this.challengeTimer = null;
    }
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
      this.failedAttempts = 0;
      this.awaitingPairing = false;
      this.setStatus({ state: "connected" });
      this.readyResolvers.forEach((r) => r());
      this.readyResolvers = [];
    } catch (err) {
      const e = err as { code?: string; details?: { requestId?: string } };
      if (e?.code === "NOT_PAIRED" || e?.details?.requestId) {
        this.awaitingPairing = true;
        this.setStatus({
          state: "pairing",
          requestId: e.details?.requestId ?? "",
          deviceId: this.identity.deviceId,
        });
        // Close now and poll; the onclose handler reconnects every 5s until the
        // owner approves, at which point the reconnect succeeds.
        this.ws?.close();
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
        this.clearChallengeTimer();
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

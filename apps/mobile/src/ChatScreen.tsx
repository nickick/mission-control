import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { AppConfig } from "./config";
import {
  agentIdOf,
  createSession,
  fetchHistory,
  getGateway,
  makeSessionKey,
  messageText,
  onGatewayEvent,
  sendChat,
  subscribeSessionMessages,
  subscribeSessionEvents,
  type ChatMessageObj,
} from "./gateway/useGateway";
import SessionDrawer from "./SessionDrawer";
import TypingDots from "./TypingDots";
import ChatMarkdown from "./ChatMarkdown";
import ResourceMonitor from "./ResourceMonitor";
import { getLocalSessions, recordLocalSession } from "./gateway/localSessions";
import { loadMessages, saveMessages } from "./gateway/localMessages";

interface ChatScreenProps {
  config: AppConfig;
  onOpenSettings: () => void;
}

interface Msg {
  id: string;
  seq: number; // arrival order — assigned once, preserved across updates
  role: "user" | "assistant" | "system" | "tool";
  text: string;
}

let localCounter = 1;

function toolLine(data: {
  phase?: string;
  name?: string;
  args?: { command?: string } | Record<string, unknown>;
  isError?: boolean;
}): string {
  const name = data.name ?? "tool";
  const args = data.args as { command?: string } | undefined;
  const summary = args?.command
    ? `\`${args.command}\``
    : data.args && Object.keys(data.args).length
      ? `\`${JSON.stringify(data.args).slice(0, 60)}\``
      : "";
  const icon = data.phase === "result" ? (data.isError ? "✗" : "✓") : "⚙";
  return `${icon} ${name} ${summary}`.trim();
}

const HELP = [
  "Chat goes to the OpenClaw agent. Commands:",
  "/agent <name> — new chat with a different agent",
  "/new — start a new chat",
  "/help — this message",
].join("\n");

export default function ChatScreen({ config, onOpenSettings }: ChatScreenProps) {
  const client = getGateway(config);
  const [sessionKey, setSessionKey] = useState<string>("");
  const [agent, setAgent] = useState<string>(config.agent);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false); // awaiting first assistant token
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerReload, setDrawerReload] = useState(0);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const sessionKeyRef = useRef(sessionKey);
  sessionKeyRef.current = sessionKey;
  const listRef = useRef<FlatList<Msg>>(null);
  const arrivalRef = useRef(0); // monotonic arrival counter for stable ordering
  const atBottomRef = useRef(true); // within 100px of the bottom?

  // Auto-scroll only when already near the bottom, so reading scrollback isn't
  // interrupted by streaming updates. `force` overrides (e.g. on send).
  const scrollToEnd = useCallback((force = false) => {
    if (!force && !atBottomRef.current) return;
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 40);
  }, []);

  const handleScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const atBottom = contentSize.height - contentOffset.y - layoutMeasurement.height <= 100;
      atBottomRef.current = atBottom;
      setShowScrollDown(!atBottom);
    },
    []
  );

  const jumpToBottom = useCallback(() => {
    atBottomRef.current = true;
    setShowScrollDown(false);
    scrollToEnd(true);
  }, [scrollToEnd]);

  // Keep the latest messages visible when the keyboard opens (it shrinks the
  // viewport). Only when already near the bottom, so scrollback isn't yanked.
  useEffect(() => {
    const evt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const sub = Keyboard.addListener(evt, () => {
      if (atBottomRef.current) scrollToEnd(true);
    });
    return () => sub.remove();
  }, [scrollToEnd]);

  // Upsert by id. Streaming re-emits the same id as content grows; the message
  // keeps its original arrival position so text updates don't reorder the list.
  const upsert = useCallback(
    (id: string, role: Msg["role"], text: string) => {
      setMessages((prev) => {
        const i = prev.findIndex((m) => m.id === id);
        if (i >= 0) {
          const next = prev.slice();
          next[i] = { ...next[i], role, text };
          return next;
        }
        return [...prev, { id, role, text, seq: arrivalRef.current++ }].sort((a, b) => a.seq - b.seq);
      });
      scrollToEnd();
    },
    [scrollToEnd]
  );

  // Load a session and subscribe to its live stream. The local cache is the
  // source of truth for our own chats (complete + instant); the gateway's
  // chat.history only backfills sessions we have no local copy of.
  const openSession = useCallback(
    async (key: string, agentForKey: string) => {
      setSessionKey(key);
      setAgent(agentForKey);
      setMessages([]);
      setDrawerOpen(false);
      try {
        const cached = (await loadMessages(key)) as Msg[];
        if (cached.length) {
          arrivalRef.current = cached.reduce((m, x) => Math.max(m, x.seq), 0) + 1;
          if (sessionKeyRef.current === key) setMessages(cached);
        }

        await client.whenReady();
        // Only consult the gateway when we have nothing cached (e.g. a session
        // started on another device). Otherwise the local cache wins.
        if (!cached.length) {
          const history = await fetchHistory(client, key);
          const mapped: Msg[] = history
            .filter((m: ChatMessageObj) => m.role === "user" || m.role === "assistant")
            .map((m: ChatMessageObj, idx) => ({
              id: String(m.id ?? `h${idx}`),
              seq: idx,
              role: (m.role === "assistant" ? "assistant" : "user") as Msg["role"],
              text: messageText(m).trim(),
            }))
            .filter((m) => m.text);
          arrivalRef.current = mapped.length;
          if (sessionKeyRef.current === key) {
            setMessages(
              mapped.length
                ? mapped
                : [{ id: "sys0", seq: 0, role: "system", text: `New chat with ${agentIdOf(agentForKey)} — say hello` }]
            );
          }
        }
        await subscribeSessionEvents(client); // session.tool (live tool calls)
        await subscribeSessionMessages(client, key);
      } catch (err) {
        upsert("err-" + localCounter++, "system", `⚠️ ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [client, upsert]
  );

  // Start on our most recent chat (from the local registry), else a fresh one.
  useEffect(() => {
    void (async () => {
      const ours = await getLocalSessions();
      if (ours.length > 0) {
        await openSession(ours[0].key, `openclaw/${ours[0].agentId}`);
      } else {
        await openSession(makeSessionKey(config.agent), config.agent);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cache the conversation locally (debounced) so it survives reloads. Only
  // persist real exchanges, never the empty/placeholder state (which would
  // clobber a good cache when switching sessions).
  useEffect(() => {
    if (!sessionKey) return;
    if (!messages.some((m) => m.role === "user" || m.role === "assistant")) return;
    const sk = sessionKey;
    const t = setTimeout(() => void saveMessages(sk, messages), 700);
    return () => clearTimeout(t);
  }, [messages, sessionKey]);

  // Live message + tool events for the active session.
  useEffect(() => {
    return onGatewayEvent((evt) => {
      const payload = evt.payload as
        | {
            sessionKey?: string;
            message?: ChatMessageObj;
            messageId?: string;
            messageSeq?: number;
            data?: { phase?: string; name?: string; toolCallId?: string; args?: Record<string, unknown>; isError?: boolean };
          }
        | undefined;
      if (!payload || payload.sessionKey !== sessionKeyRef.current) return;
      if (evt.event === "session.message" && payload.message) {
        const m = payload.message;
        // Only render assistant text. User turns are shown optimistically on
        // send; toolResult/thinking/tool-call messages are noise (and ANSI tool
        // output renders blank). Tool activity shows via session.tool rows.
        if (m.role !== "assistant") return;
        const text = messageText(m).trim();
        if (!text) return; // skip thinking / tool-call-only assistant messages
        setWaiting(false);
        // message.id is undefined on the wire; key by the stable messageId /
        // messageSeq so streamed re-emissions update one bubble in place.
        const key = `m:${payload.messageId ?? payload.messageSeq ?? `auto${localCounter++}`}`;
        upsert(key, "assistant", text);
      } else if (evt.event === "session.tool" && payload.data?.toolCallId) {
        // Live tool-call activity: one row per toolCallId, updated start→result.
        setWaiting(false);
        upsert(`tool:${payload.data.toolCallId}`, "tool", toolLine(payload.data));
      }
    });
  }, [upsert]);

  const startNew = useCallback(
    (agentForNew: string) => {
      void openSession(makeSessionKey(agentForNew), agentForNew);
    },
    [openSession]
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");

    if (text === "/help") {
      upsert("help-" + localCounter++, "system", HELP);
      return;
    }
    if (text === "/new") {
      startNew(agent);
      return;
    }
    if (text.startsWith("/agent ")) {
      const a = text.slice(7).trim();
      startNew(a.startsWith("openclaw/") ? a : `openclaw/${a}`);
      return;
    }

    setBusy(true);
    setWaiting(true);
    const key = sessionKeyRef.current;
    // Optimistic user bubble; live user echoes are ignored to avoid dupes.
    upsert(`local-${localCounter++}`, "user", text);
    jumpToBottom(); // sending always returns to the bottom + resumes autoscroll
    try {
      await client.whenReady();
      // Create the session on first message (idempotent enough for our use).
      if (messages.length === 0 || messages.every((m) => m.role === "system")) {
        try {
          await createSession(client, key, text.slice(0, 40));
        } catch {
          /* may already exist */
        }
        await subscribeSessionMessages(client, key);
      }
      // Track this chat locally so the drawer shows only our sessions.
      await recordLocalSession(key, agentIdOf(agent), text.slice(0, 40));
      setDrawerReload((n) => n + 1);
      await sendChat(client, key, text);
    } catch (err) {
      setWaiting(false);
      upsert("err-" + localCounter++, "system", `⚠️ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [input, busy, agent, messages, client, upsert, startNew]);

  const agentLabel = agentIdOf(agent);

  const renderItem = useCallback(({ item }: { item: Msg }) => {
    if (item.role === "user") {
      return (
        <View style={styles.userRow}>
          <View style={[styles.bubble, styles.userBubble]}>
            <ChatMarkdown white>{item.text}</ChatMarkdown>
          </View>
        </View>
      );
    }
    if (item.role === "tool") {
      return (
        <View style={styles.toolRow}>
          <Text style={styles.toolText} numberOfLines={2}>
            {item.text}
          </Text>
        </View>
      );
    }
    return (
      <View style={[styles.bubble, item.role === "assistant" ? styles.assistantBubble : styles.systemBubble]}>
        <ChatMarkdown>{item.text}</ChatMarkdown>
      </View>
    );
  }, []);

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setDrawerOpen(true)} hitSlop={10}>
            <Text style={styles.hamburger}>☰</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {agentLabel}
          </Text>
          <TouchableOpacity onPress={onOpenSettings}>
            <Text style={styles.headerAction}>Settings</Text>
          </TouchableOpacity>
        </View>

        <ResourceMonitor />

        <FlatList
          ref={listRef}
          style={styles.list}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.listContent}
          renderItem={renderItem}
          onScroll={handleScroll}
          scrollEventThrottle={100}
          ListFooterComponent={waiting ? <View style={[styles.bubble, styles.assistantBubble]}><TypingDots /></View> : null}
        />
        {showScrollDown && (
          <TouchableOpacity style={styles.scrollDown} onPress={jumpToBottom} hitSlop={8}>
            <Text style={styles.scrollDownIcon}>↓</Text>
          </TouchableOpacity>
        )}

        <View style={styles.composer}>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder={`Message ${agentLabel}`}
              placeholderTextColor="#555"
              autoCapitalize="sentences"
              multiline
              scrollEnabled
            />
            <Pressable
              style={({ pressed }) => [styles.sendButton, { opacity: busy || !input.trim() ? 0.3 : pressed ? 1 : 0.3 }]}
              onPress={() => void handleSend()}
              disabled={busy || !input.trim()}
              hitSlop={6}
            >
              <Text style={styles.sendText}>{busy ? "…" : "↑"}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <SessionDrawer
        visible={drawerOpen}
        activeKey={sessionKey}
        reloadKey={drawerReload}
        onClose={() => setDrawerOpen(false)}
        onSelect={(key, agentId) => void openSession(key, agentId ? `openclaw/${agentId}` : config.agent)}
        onNew={() => startNew(config.agent)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0c0c0c" },
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    backgroundColor: "#1e1e1e",
  },
  scrollDown: {
    position: "absolute",
    right: 16,
    bottom: 92,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#252526",
    borderWidth: 1,
    borderColor: "#3a3a3a",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollDownIcon: { color: "#4fc1ff", fontSize: 20, lineHeight: 22 },
  hamburger: { color: "#cccccc", fontSize: 22 },
  headerTitle: { color: "#ffffff", fontSize: 16, fontWeight: "700", flex: 1 },
  headerAction: { color: "#4fc1ff", fontSize: 14 },
  list: { flex: 1 },
  listContent: { padding: 12, gap: 8 },
  bubble: { borderRadius: 10, padding: 10, maxWidth: "100%" },
  userRow: { flexDirection: "row", justifyContent: "flex-end", alignSelf: "flex-end", maxWidth: "92%" },
  userBubble: { backgroundColor: "#264f78", flexShrink: 1 },
  assistantBubble: { backgroundColor: "#1e1e1e", alignSelf: "flex-start", maxWidth: "92%" },
  systemBubble: { backgroundColor: "#161616", alignSelf: "center" },
  toolRow: { alignSelf: "flex-start", maxWidth: "92%", paddingVertical: 2, paddingHorizontal: 4 },
  toolText: {
    color: "#6e9faf",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  composer: { padding: 10, paddingBottom: 28, backgroundColor: "#0c0c0c" },
  inputWrap: {
    position: "relative",
    backgroundColor: "#1a1a1a",
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#2a2a2a",
    justifyContent: "center",
  },
  input: {
    color: "#cccccc",
    fontSize: 15,
    lineHeight: 20,
    paddingTop: 9,
    paddingBottom: 9,
    paddingLeft: 14,
    paddingRight: 46,
    minHeight: 38,
    maxHeight: 5 * 20 + 18,
  },
  sendButton: {
    position: "absolute",
    right: 6,
    bottom: 5,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#4fc1ff",
    alignItems: "center",
    justifyContent: "center",
  },
  sendText: { color: "#000", fontWeight: "800", fontSize: 16, lineHeight: 18 },
});

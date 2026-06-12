import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
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
  type ChatMessageObj,
} from "./gateway/useGateway";
import SessionDrawer from "./SessionDrawer";
import TypingDots from "./TypingDots";
import ChatMarkdown from "./ChatMarkdown";

interface ChatScreenProps {
  config: AppConfig;
  onOpenSettings: () => void;
}

interface Msg {
  id: string;
  seq: number;
  role: "user" | "assistant" | "system";
  text: string;
}

let localCounter = 1;

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
  const sessionKeyRef = useRef(sessionKey);
  sessionKeyRef.current = sessionKey;
  const listRef = useRef<FlatList<Msg>>(null);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 40);
  }, []);

  // Upsert a message by id (server streaming re-emits the same id as it grows).
  const upsert = useCallback(
    (id: string, role: Msg["role"], text: string, seq: number) => {
      setMessages((prev) => {
        const i = prev.findIndex((m) => m.id === id);
        let next: Msg[];
        if (i >= 0) {
          next = prev.slice();
          next[i] = { ...next[i], role, text, seq };
        } else {
          // Reconcile an optimistic user bubble (same text, local id) with the
          // server echo so it doesn't double up.
          const optimistic =
            role === "user"
              ? prev.findIndex((m) => m.id.startsWith("local-") && m.role === "user" && m.text === text)
              : -1;
          if (optimistic >= 0) {
            next = prev.slice();
            next[optimistic] = { id, role, text, seq };
          } else {
            next = [...prev, { id, role, text, seq }];
          }
        }
        return next.sort((a, b) => a.seq - b.seq);
      });
      scrollToEnd();
    },
    [scrollToEnd]
  );

  // Load a session's history and subscribe to its live message stream.
  const openSession = useCallback(
    async (key: string, agentForKey: string) => {
      setSessionKey(key);
      setAgent(agentForKey);
      setMessages([]);
      setDrawerOpen(false);
      try {
        await client.whenReady();
        const history = await fetchHistory(client, key);
        const mapped: Msg[] = history
          .map((m: ChatMessageObj, idx) => ({
            id: String(m.id ?? `h${idx}`),
            seq: typeof m.seq === "number" ? m.seq : idx,
            role: (m.role === "assistant" ? "assistant" : m.role === "user" ? "user" : "system") as Msg["role"],
            text: messageText(m),
          }))
          .filter((m) => m.text);
        if (sessionKeyRef.current === key) {
          setMessages(
            mapped.length ? mapped : [{ id: "sys0", seq: -1, role: "system", text: `Agent: ${agentIdOf(agentForKey)}` }]
          );
        }
        await subscribeSessionMessages(client, key);
      } catch (err) {
        upsert("err-" + localCounter++, "system", `⚠️ ${err instanceof Error ? err.message : String(err)}`, 1e9);
      }
    },
    [client, upsert]
  );

  // Start on the most recent session if any, else a fresh one.
  useEffect(() => {
    void (async () => {
      try {
        await client.whenReady();
        const { listSessions } = await import("./gateway/useGateway");
        const sessions = await listSessions(client);
        if (sessions.length > 0) {
          const top = sessions[0];
          await openSession(top.key, top.agentId ? `openclaw/${top.agentId}` : config.agent);
        } else {
          await openSession(makeSessionKey(config.agent), config.agent);
        }
      } catch {
        await openSession(makeSessionKey(config.agent), config.agent);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live message + tool events for the active session.
  useEffect(() => {
    return onGatewayEvent((evt) => {
      const payload = evt.payload as
        | { sessionKey?: string; message?: ChatMessageObj; messageId?: string; messageSeq?: number }
        | undefined;
      if (!payload || payload.sessionKey !== sessionKeyRef.current) return;
      if (evt.event === "session.message" && payload.message) {
        const m = payload.message;
        const role = m.role === "assistant" ? "assistant" : m.role === "user" ? "user" : "system";
        if (role === "assistant") setWaiting(false);
        upsert(
          String(m.id ?? payload.messageId ?? `s${payload.messageSeq ?? localCounter++}`),
          role,
          messageText(m),
          typeof payload.messageSeq === "number" ? payload.messageSeq : typeof m.seq === "number" ? m.seq : Date.now()
        );
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
      upsert("help-" + localCounter++, "system", HELP, 1e9);
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
    // Optimistic user bubble; server echo reconciles it.
    upsert(`local-${localCounter++}`, "user", text, Date.now());
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
      await sendChat(client, key, text);
    } catch (err) {
      setWaiting(false);
      upsert("err-" + localCounter++, "system", `⚠️ ${err instanceof Error ? err.message : String(err)}`, 1e9);
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

        <FlatList
          ref={listRef}
          style={styles.list}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.listContent}
          renderItem={renderItem}
          ListFooterComponent={waiting ? <View style={[styles.bubble, styles.assistantBubble]}><TypingDots /></View> : null}
        />

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
        config={config}
        visible={drawerOpen}
        activeKey={sessionKey}
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

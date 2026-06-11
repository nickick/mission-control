import { useCallback, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { listSessions, peekSession, sendToSession } from "./api";
import type { AppConfig } from "./config";

interface Message {
  id: string;
  role: "user" | "terminal" | "system";
  text: string;
}

interface ChatScreenProps {
  config: AppConfig;
  onOpenSettings: () => void;
}

let nextId = 1;
const msg = (role: Message["role"], text: string): Message => ({
  id: String(nextId++),
  role,
  text,
});

// Keep terminal peeks chat-sized: last N non-empty-ish lines.
function tail(content: string, lines = 30): string {
  const all = content.replace(/\s+$/, "").split("\n");
  return all.slice(-lines).join("\n");
}

const HELP = [
  "Commands:",
  "/sessions — list tmux sessions",
  "/peek [session] [lines] — show terminal tail",
  "/use <session> — switch target session",
  "/help — this message",
  "Anything else is typed into the target session.",
].join("\n");

export default function ChatScreen({ config, onOpenSettings }: ChatScreenProps) {
  const [messages, setMessages] = useState<Message[]>([
    msg("system", `Target session: ${config.agentSession || "(none)"} — /help for commands`),
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const targetRef = useRef(config.agentSession);
  const listRef = useRef<FlatList<Message>>(null);

  const append = useCallback((...items: Message[]) => {
    setMessages((prev) => [...prev, ...items]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }, []);

  const doPeek = useCallback(
    async (session: string, lines = 80) => {
      const { content } = await peekSession(config, session, lines);
      append(msg("terminal", `[${session}]\n${tail(content, Math.min(lines, 40))}`));
    },
    [config, append]
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    append(msg("user", text));
    try {
      if (text === "/help") {
        append(msg("system", HELP));
      } else if (text === "/sessions") {
        const { sessions } = await listSessions(config);
        append(
          msg(
            "system",
            sessions.length
              ? sessions
                  .map((s) => `${s.name} — ${s.windows}w, ${s.attached ? "attached" : "detached"}`)
                  .join("\n")
              : "No tmux sessions."
          )
        );
      } else if (text.startsWith("/use ")) {
        targetRef.current = text.slice(5).trim();
        append(msg("system", `Target session: ${targetRef.current}`));
      } else if (text.startsWith("/peek")) {
        const [, session, lines] = text.split(/\s+/);
        await doPeek(session || targetRef.current, lines ? parseInt(lines, 10) : 80);
      } else {
        const session = targetRef.current;
        if (!session) {
          append(msg("system", "No target session — /use <session> first."));
        } else {
          await sendToSession(config, session, text, true);
          // Give the agent a moment, then show the terminal's response tail.
          await new Promise((resolve) => setTimeout(resolve, 2500));
          await doPeek(session, 60);
        }
      }
    } catch (err) {
      append(msg("system", `Error: ${err instanceof Error ? err.message : String(err)}`));
    } finally {
      setBusy(false);
    }
  }, [input, busy, config, append, doPeek]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>AI Mission Control</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => void doPeek(targetRef.current).catch((err) =>
              append(msg("system", `Error: ${err instanceof Error ? err.message : String(err)}`))
            )}
          >
            <Text style={styles.headerAction}>Peek</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onOpenSettings}>
            <Text style={styles.headerAction}>Settings</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        ref={listRef}
        style={styles.list}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.role === "user" && styles.userBubble,
              item.role === "terminal" && styles.terminalBubble,
              item.role === "system" && styles.systemBubble,
            ]}
          >
            <Text
              style={[
                styles.bubbleText,
                item.role === "user" && styles.userText,
                item.role === "terminal" && styles.terminalText,
              ]}
            >
              {item.text}
            </Text>
          </View>
        )}
      />

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={`Message ${targetRef.current || "..."}`}
          placeholderTextColor="#555"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, busy && styles.sendDisabled]}
          onPress={() => void handleSend()}
          disabled={busy}
        >
          <Text style={styles.sendText}>{busy ? "..." : "Send"}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0c0c0c" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    backgroundColor: "#1e1e1e",
  },
  headerTitle: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  headerActions: { flexDirection: "row", gap: 16 },
  headerAction: { color: "#4fc1ff", fontSize: 14 },
  list: { flex: 1 },
  listContent: { padding: 12, gap: 8 },
  bubble: { borderRadius: 10, padding: 10, maxWidth: "100%" },
  userBubble: { backgroundColor: "#264f78", alignSelf: "flex-end", maxWidth: "85%" },
  terminalBubble: { backgroundColor: "#161616", borderWidth: 1, borderColor: "#333" },
  systemBubble: { backgroundColor: "#1e1e1e" },
  bubbleText: { color: "#cccccc", fontSize: 13 },
  userText: { color: "#ffffff" },
  terminalText: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 11,
    color: "#9cdcfe",
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 10,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: "#333",
    backgroundColor: "#1e1e1e",
  },
  input: {
    flex: 1,
    backgroundColor: "#0c0c0c",
    borderColor: "#333",
    borderWidth: 1,
    borderRadius: 10,
    color: "#cccccc",
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    maxHeight: 120,
  },
  sendButton: {
    backgroundColor: "#4fc1ff",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: "#000", fontWeight: "700" },
});

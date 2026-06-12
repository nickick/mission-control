import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, FlatList, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { AppConfig } from "./config";
import { getGateway, listSessions, type GatewaySessionInfo } from "./gateway/useGateway";

interface SessionDrawerProps {
  config: AppConfig;
  visible: boolean;
  activeKey: string;
  onClose: () => void;
  onSelect: (key: string, agentId?: string) => void;
  onNew: () => void;
}

const PANEL_WIDTH = Math.min(Dimensions.get("window").width * 0.78, 320);

export default function SessionDrawer({ config, visible, activeKey, onClose, onSelect, onNew }: SessionDrawerProps) {
  const [sessions, setSessions] = useState<GatewaySessionInfo[]>([]);
  const [rendered, setRendered] = useState(visible);
  const slide = useRef(new Animated.Value(visible ? 0 : -PANEL_WIDTH)).current;
  const fade = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      void (async () => {
        try {
          const c = getGateway(config);
          await c.whenReady();
          setSessions(await listSessions(c));
        } catch {
          setSessions([]);
        }
      })();
      Animated.parallel([
        Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slide, { toValue: -PANEL_WIDTH, duration: 200, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(({ finished }) => finished && setRendered(false));
    }
  }, [visible, config, slide, fade]);

  if (!rendered) return null;

  const labelFor = (s: GatewaySessionInfo) => s.label || s.key.split(":").pop() || s.key;

  return (
    <View style={styles.overlay}>
      <Animated.View style={[styles.scrim, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[styles.panel, { transform: [{ translateX: slide }] }]}>
        <Text style={styles.heading}>Chats</Text>
        <TouchableOpacity style={styles.newButton} onPress={onNew}>
          <Text style={styles.newButtonText}>+ New chat</Text>
        </TouchableOpacity>
        <FlatList
          data={sessions}
          keyExtractor={(s) => s.key}
          style={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No chats yet.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, item.key === activeKey && styles.rowActive]}
              onPress={() => onSelect(item.key, item.agentId)}
            >
              <Text style={styles.rowTitle} numberOfLines={1}>
                {labelFor(item)}
              </Text>
              {item.agentId ? <Text style={styles.rowAgent}>{item.agentId}</Text> : null}
            </TouchableOpacity>
          )}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 50 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: PANEL_WIDTH,
    backgroundColor: "#161616",
    paddingTop: 60,
    paddingHorizontal: 14,
    borderRightWidth: 1,
    borderRightColor: "#333",
  },
  heading: { color: "#ffffff", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  newButton: { backgroundColor: "#4fc1ff", borderRadius: 8, paddingVertical: 10, alignItems: "center", marginBottom: 12 },
  newButtonText: { color: "#000", fontWeight: "700" },
  list: { flex: 1 },
  empty: { color: "#555", fontSize: 13, marginTop: 10 },
  row: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8 },
  rowActive: { backgroundColor: "#1e1e1e" },
  rowTitle: { color: "#cccccc", fontSize: 14 },
  rowAgent: { color: "#6e9faf", fontSize: 11, marginTop: 2 },
});

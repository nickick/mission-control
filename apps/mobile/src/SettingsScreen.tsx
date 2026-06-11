import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { AppConfig } from "./config";

interface SettingsScreenProps {
  config: AppConfig;
  onSave: (config: AppConfig) => void;
  onClose: () => void;
}

export default function SettingsScreen({ config, onSave, onClose }: SettingsScreenProps) {
  const [serverUrl, setServerUrl] = useState(config.serverUrl);
  const [token, setToken] = useState(config.token);
  const [agentSession, setAgentSession] = useState(config.agentSession);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.label}>Server URL (tailnet)</Text>
      <TextInput
        style={styles.input}
        value={serverUrl}
        onChangeText={setServerUrl}
        placeholder="http://100.114.107.124:3001"
        placeholderTextColor="#555"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />

      <Text style={styles.label}>Bearer token</Text>
      <TextInput
        style={styles.input}
        value={token}
        onChangeText={setToken}
        placeholder="contents of ~/.mission-control/server-token"
        placeholderTextColor="#555"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />

      <Text style={styles.label}>Agent tmux session</Text>
      <TextInput
        style={styles.input}
        value={agentSession}
        onChangeText={setAgentSession}
        placeholder="molt-0"
        placeholderTextColor="#555"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.row}>
        <TouchableOpacity style={[styles.button, styles.secondary]} onPress={onClose}>
          <Text style={styles.secondaryText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.button}
          onPress={() => onSave({ serverUrl, token, agentSession })}
        >
          <Text style={styles.buttonText}>Save</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0c0c0c", padding: 20, paddingTop: 70 },
  title: { color: "#ffffff", fontSize: 20, fontWeight: "700", marginBottom: 18 },
  label: { color: "#858585", fontSize: 12, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: "#1e1e1e",
    borderColor: "#333",
    borderWidth: 1,
    borderRadius: 8,
    color: "#cccccc",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  row: { flexDirection: "row", gap: 10, marginTop: 24, justifyContent: "flex-end" },
  button: {
    backgroundColor: "#4fc1ff",
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  buttonText: { color: "#000", fontWeight: "600" },
  secondary: { backgroundColor: "#2d2d2d" },
  secondaryText: { color: "#cccccc", fontWeight: "600" },
});

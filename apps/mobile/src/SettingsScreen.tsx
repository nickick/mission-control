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
  const [gatewayUrl, setGatewayUrl] = useState(config.gatewayUrl);
  const [sinkUrl, setSinkUrl] = useState(config.sinkUrl);
  const [token, setToken] = useState(config.token);
  const [agent, setAgent] = useState(config.agent);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.label}>Gateway URL (chat)</Text>
      <TextInput
        style={styles.input}
        value={gatewayUrl}
        onChangeText={setGatewayUrl}
        placeholder="https://vps-1a5874b1.tailed2d0f.ts.net:8443"
        placeholderTextColor="#555"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />

      <Text style={styles.label}>Sink URL (tool stream)</Text>
      <TextInput
        style={styles.input}
        value={sinkUrl}
        onChangeText={setSinkUrl}
        placeholder="https://vps-1a5874b1.tailed2d0f.ts.net:9443"
        placeholderTextColor="#555"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />

      <Text style={styles.label}>Gateway token</Text>
      <TextInput
        style={styles.input}
        value={token}
        onChangeText={setToken}
        placeholder="GATEWAY_TOKEN"
        placeholderTextColor="#555"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />

      <Text style={styles.label}>OpenClaw agent</Text>
      <TextInput
        style={styles.input}
        value={agent}
        onChangeText={setAgent}
        placeholder="openclaw/chief-of-staff"
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
          onPress={() => onSave({ gatewayUrl, sinkUrl, token, agent })}
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

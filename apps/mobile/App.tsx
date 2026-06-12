import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import FaceIdGate from "./src/FaceIdGate";
import ChatScreen from "./src/ChatScreen";
import SettingsScreen from "./src/SettingsScreen";
import PairingScreen from "./src/PairingScreen";
import { loadConfig, saveConfig, type AppConfig } from "./src/config";
import { useGatewayStatus } from "./src/gateway/useGateway";

function GatewayGatedChat({
  config,
  onOpenSettings,
}: {
  config: AppConfig;
  onOpenSettings: () => void;
}) {
  const status = useGatewayStatus(config);

  if (status.state === "pairing") {
    return <PairingScreen requestId={status.requestId} deviceId={status.deviceId} />;
  }
  if (status.state === "connecting") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#4fc1ff" />
        <Text style={styles.centerText}>Connecting to gateway…</Text>
      </View>
    );
  }
  if (status.state === "error") {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Connection error</Text>
        <Text style={styles.centerText}>{status.message}</Text>
        <Text style={[styles.centerText, styles.link]} onPress={onOpenSettings}>
          Open Settings
        </Text>
      </View>
    );
  }
  return <ChatScreen config={config} onOpenSettings={onOpenSettings} />;
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    void loadConfig().then((loaded) => {
      setConfig(loaded);
      if (!loaded.gatewayUrl || !loaded.token) setShowSettings(true);
    });
  }, []);

  return (
    <FaceIdGate>
      <StatusBar style="light" />
      {config &&
        (showSettings ? (
          <SettingsScreen
            config={config}
            onSave={(next) => {
              void saveConfig(next);
              setConfig(next);
              setShowSettings(false);
            }}
            onClose={() => setShowSettings(false)}
          />
        ) : (
          <GatewayGatedChat
            key={config.gatewayUrl}
            config={config}
            onOpenSettings={() => setShowSettings(true)}
          />
        ))}
    </FaceIdGate>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: "#0c0c0c", alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  centerText: { color: "#858585", fontSize: 14, textAlign: "center" },
  errorText: { color: "#e74856", fontSize: 16, fontWeight: "700" },
  link: { color: "#4fc1ff", marginTop: 12 },
});

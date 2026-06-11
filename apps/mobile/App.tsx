import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import FaceIdGate from "./src/FaceIdGate";
import ChatScreen from "./src/ChatScreen";
import SettingsScreen from "./src/SettingsScreen";
import { loadConfig, saveConfig, type AppConfig } from "./src/config";

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    void loadConfig().then((loaded) => {
      setConfig(loaded);
      if (!loaded.serverUrl || !loaded.token) setShowSettings(true);
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
          <ChatScreen
            // Remount the chat when the server or target session changes.
            key={`${config.serverUrl}|${config.agentSession}`}
            config={config}
            onOpenSettings={() => setShowSettings(true)}
          />
        ))}
    </FaceIdGate>
  );
}

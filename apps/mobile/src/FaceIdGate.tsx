import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";

type GateState = "checking" | "locked" | "unlocked" | "unavailable";

export default function FaceIdGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("checking");

  const authenticate = useCallback(async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !enrolled) {
      // Simulator or no biometrics enrolled — don't brick the app.
      setState("unavailable");
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock AI Mission Control",
      cancelLabel: "Cancel",
    });
    setState(result.success ? "unlocked" : "locked");
  }, []);

  useEffect(() => {
    void authenticate();
  }, [authenticate]);

  if (state === "unlocked" || state === "unavailable") {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AI Mission Control</Text>
      <Text style={styles.subtitle}>
        {state === "checking" ? "Authenticating..." : "Locked"}
      </Text>
      {state === "locked" && (
        <TouchableOpacity style={styles.button} onPress={() => void authenticate()}>
          <Text style={styles.buttonText}>Unlock with Face ID</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0c0c0c",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  title: { color: "#cccccc", fontSize: 22, fontWeight: "700" },
  subtitle: { color: "#858585", fontSize: 14 },
  button: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#4fc1ff",
  },
  buttonText: { color: "#000", fontWeight: "600" },
});

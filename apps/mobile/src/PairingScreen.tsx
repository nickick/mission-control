import { StyleSheet, Text, View } from "react-native";

// Shown on first launch (or after identity reset) while the device waits for
// the gateway owner to approve it. The client auto-reconnects on approval.
export default function PairingScreen({ requestId, deviceId }: { requestId: string; deviceId: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pair this device</Text>
      <Text style={styles.body}>
        This device requested operator access to your OpenClaw gateway. Approve it once, then it
        connects automatically.
      </Text>
      <Text style={styles.label}>On the gateway, run:</Text>
      <View style={styles.codeBox}>
        <Text style={styles.code} selectable>
          {`docker exec moltivate-local-openclaw \\\n  openclaw devices approve ${requestId || "<requestId>"}`}
        </Text>
      </View>
      <Text style={styles.meta}>request {requestId || "(pending)"}</Text>
      <Text style={styles.meta}>device {deviceId.slice(0, 24)}…</Text>
      <Text style={styles.waiting}>Waiting for approval…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0c0c0c", padding: 24, paddingTop: 90, gap: 12 },
  title: { color: "#ffffff", fontSize: 22, fontWeight: "700" },
  body: { color: "#9aa", fontSize: 14, lineHeight: 20 },
  label: { color: "#858585", fontSize: 12, marginTop: 10 },
  codeBox: { backgroundColor: "#161616", borderColor: "#333", borderWidth: 1, borderRadius: 8, padding: 12 },
  code: { color: "#9cdcfe", fontFamily: "Menlo", fontSize: 12 },
  meta: { color: "#555", fontSize: 11, fontFamily: "Menlo" },
  waiting: { color: "#4fc1ff", fontSize: 14, marginTop: 18 },
});

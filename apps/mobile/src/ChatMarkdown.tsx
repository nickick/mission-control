import { Linking, Platform, StyleSheet } from "react-native";
import Markdown from "react-native-markdown-display";

const mono = Platform.OS === "ios" ? "Menlo" : "monospace";

// Dark-theme markdown styles matching the chat. `color` is overridable so the
// same renderer works for assistant (light gray) and user (white) bubbles.
function makeStyles(color: string) {
  return StyleSheet.create({
    body: { color, fontSize: 14, lineHeight: 20 },
    paragraph: { marginTop: 0, marginBottom: 8, color },
    heading1: { color: "#ffffff", fontSize: 19, fontWeight: "700", marginTop: 4, marginBottom: 6 },
    heading2: { color: "#ffffff", fontSize: 17, fontWeight: "700", marginTop: 4, marginBottom: 6 },
    heading3: { color: "#ffffff", fontSize: 15, fontWeight: "700", marginTop: 4, marginBottom: 4 },
    strong: { fontWeight: "700", color },
    em: { fontStyle: "italic" },
    s: { textDecorationLine: "line-through" },
    link: { color: "#4fc1ff", textDecorationLine: "underline" },
    blockquote: {
      backgroundColor: "#161616",
      borderLeftColor: "#4fc1ff",
      borderLeftWidth: 3,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginBottom: 8,
    },
    bullet_list: { marginBottom: 8 },
    ordered_list: { marginBottom: 8 },
    list_item: { color, marginVertical: 2 },
    code_inline: {
      backgroundColor: "#0c0c0c",
      color: "#9cdcfe",
      fontFamily: mono,
      fontSize: 12.5,
      borderRadius: 4,
      paddingHorizontal: 4,
    },
    code_block: {
      backgroundColor: "#0c0c0c",
      color: "#9cdcfe",
      fontFamily: mono,
      fontSize: 12.5,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: "#333",
      padding: 10,
      marginBottom: 8,
    },
    fence: {
      backgroundColor: "#0c0c0c",
      color: "#9cdcfe",
      fontFamily: mono,
      fontSize: 12.5,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: "#333",
      padding: 10,
      marginBottom: 8,
    },
    hr: { backgroundColor: "#333", height: 1, marginVertical: 8 },
    table: { borderColor: "#333", borderWidth: 1, borderRadius: 6, marginBottom: 8 },
    th: { padding: 6, color: "#ffffff", fontWeight: "700" },
    td: { padding: 6, color, borderColor: "#333" },
  });
}

const lightStyles = makeStyles("#cccccc");
const whiteStyles = makeStyles("#ffffff");

export default function ChatMarkdown({ children, white }: { children: string; white?: boolean }) {
  return (
    <Markdown
      style={white ? whiteStyles : lightStyles}
      onLinkPress={(url) => {
        void Linking.openURL(url);
        return false;
      }}
    >
      {children}
    </Markdown>
  );
}

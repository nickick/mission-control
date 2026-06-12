// react-native-markdown-display ships no types; minimal shim for our usage.
declare module "react-native-markdown-display" {
  import type { ComponentType, ReactNode } from "react";
  import type { TextStyle, ViewStyle } from "react-native";

  export interface MarkdownProps {
    style?: Record<string, TextStyle | ViewStyle>;
    children?: ReactNode;
    onLinkPress?: (url: string) => boolean;
    mergeStyle?: boolean;
  }
  const Markdown: ComponentType<MarkdownProps>;
  export default Markdown;
}

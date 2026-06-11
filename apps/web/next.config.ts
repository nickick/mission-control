import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Production builds (standalone app) live in their own dist dir so
  // `next build` never clobbers a running dev or prod server's files.
  distDir: process.env.MISSION_CONTROL_PROD === "1" ? ".next-prod" : ".next",
  // BullMQ ships Lua scripts and native-ish deps that break when bundled.
  serverExternalPackages: ["bullmq"],
  // No floating dev-tools badge over the terminals.
  devIndicators: false,
};

export default nextConfig;

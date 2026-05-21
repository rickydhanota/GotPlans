import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let the iOS Simulator (and other LAN devices) reach Next.js dev resources
  // like /_next/webpack-hmr. Match the host you set in capacitor.config.ts.
  allowedDevOrigins: ["10.0.0.160"],
};

export default nextConfig;

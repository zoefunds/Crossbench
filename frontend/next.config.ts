import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This repo lives below a parent directory that also has a package lock.
  // Pinning the root prevents Turbopack from selecting the wrong workspace.
  turbopack: { root: __dirname },
  webpack(config) {
    // wagmi exports an optional Tempo connector that imports the unrelated
    // React-Native `accounts` package, and an optional Base connector with
    // server-only payment SDK peers. Crossbench enables neither connector.
    config.resolve.alias.accounts = false;
    config.resolve.alias["@base-org/account"] = false;
    return config;
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.MAAT_BUILD_DIR || ".next",
  output: process.env.MAAT_STANDALONE === "1" ? "standalone" : undefined,
  poweredByHeader: false,
  // The VPS uses next start with a complete production dependency installation.
  // Avoid tracing the framework's broad runtime/CLI graph for that deployment mode.
  // Explicit standalone builds still trace executable framework dependencies.
  outputFileTracingExcludes: {
    "*": [
      ...(process.env.MAAT_STANDALONE === "1" ? [] : ["**/node_modules/@agent-native/core/**"]),
      "**/node_modules/@agent-native/core/docs/**",
      "**/node_modules/@agent-native/core/src/**",
      "**/node_modules/@agent-native/core/blueprints/**",
    ],
  },
  images: { unoptimized: true },
  webpack(config) {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /[\\/]node_modules[\\/].*ox[\\/]_esm[\\/]tempo[\\/]/ },
    ];
    return config;
  },
  serverExternalPackages: ["better-sqlite3", "@agent-native/core", "ai", "@ai-sdk/openai"],
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

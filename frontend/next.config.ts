import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  reactStrictMode: true,
  allowedDevOrigins: ["uniprotravel.share.zrok.io"],
  // Keep enough headroom for provider-backed travel planning calls.
  experimental: {
    proxyTimeout: 120_000,
  },
  async rewrites() {
    const backend = process.env.TRAVEL_AI_API_INTERNAL_URL || "http://127.0.0.1:8100";
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/health", destination: `${backend}/health` }
    ];
  }
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: false,
  webpack: {
    treeshake: {
      removeDebugLogging: true
    }
  }
});

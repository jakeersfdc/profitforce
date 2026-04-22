import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Standalone output is required by Dockerfile.web (Cloud Run / self-host).
  // Vercel ignores this safely. Toggle off via NEXT_OUTPUT=default if a
  // platform ever needs the legacy server build.
  output: process.env.NEXT_OUTPUT === "default" ? undefined : "standalone",
  // Pin the tracing root to THIS directory so standalone output lands at
  // .next/standalone/server.js (not nested under a project-name subfolder),
  // matching what Dockerfile.web expects.
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ["pg", "nodemailer", "firebase-admin", "jsonwebtoken"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.yahoo.com" },
      { protocol: "https", hostname: "img.clerk.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
    ];
  },
  async rewrites() {
    const inferenceUrl = process.env.INFERENCE_URL;
    if (!inferenceUrl) return [];
    return [
      {
        source: "/ml/:path*",
        destination: `${inferenceUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;

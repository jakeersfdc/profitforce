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
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://js.stripe.com https://*.sentry.io https://*.googletagmanager.com https://*.google-analytics.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com wss://*.clerk.com https://api.stripe.com https://*.sentry.io https://query1.finance.yahoo.com https://query2.finance.yahoo.com https://*.googleapis.com",
              "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://*.clerk.accounts.dev https://*.clerk.com",
              "worker-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self' https://*.stripe.com",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
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

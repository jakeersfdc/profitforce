import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "standalone", // Enable for Docker/self-hosting only
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

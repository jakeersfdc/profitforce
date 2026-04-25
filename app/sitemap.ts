import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://profitforce.vercel.app";
  const now = new Date();
  const pages = ["", "/pricing", "/sign-in", "/sign-up"];
  return pages.map((p) => ({
    url: `${origin}${p}`,
    lastModified: now,
    changeFrequency: p === "" ? "daily" : "weekly",
    priority: p === "" ? 1 : 0.7,
  }));
}

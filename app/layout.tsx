import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SafeClerkProvider } from "@/components/AuthProvider";
import Sidebar from "@/components/Sidebar";
import { SebiRiskBanner, SebiComplianceFooter } from "@/components/SebiCompliance";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { warnOnceIfMisconfigured } from "@/lib/envCheck";

warnOnceIfMisconfigured();

const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://profitforce.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(APP_ORIGIN),
  title: {
    default: "ProfitForce Signals — AI-driven Indian market signals",
    template: "%s · ProfitForce",
  },
  description:
    "AI-assisted trading signals, watchlists, and analytics for NSE / BSE / MCX. SEBI-registered research advisory.",
  applicationName: "ProfitForce",
  keywords: [
    "NSE signals",
    "trading signals India",
    "AI trading",
    "SEBI research analyst",
    "MCX commodity signals",
    "intraday signals",
  ],
  alternates: { canonical: APP_ORIGIN },
  openGraph: {
    type: "website",
    url: APP_ORIGIN,
    siteName: "ProfitForce",
    title: "ProfitForce Signals — AI-driven Indian market signals",
    description:
      "AI-assisted trading signals, watchlists, and analytics for NSE / BSE / MCX.",
  },
  twitter: {
    card: "summary_large_image",
    title: "ProfitForce Signals",
    description:
      "AI-assisted trading signals, watchlists, and analytics for NSE / BSE / MCX.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#071026" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="min-h-screen bg-[#040915] text-[#e6eef8]">
        <SafeClerkProvider
          publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
        >
          <SebiRiskBanner />
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 min-h-screen overflow-auto flex flex-col">
              <div className="max-w-[1600px] mx-auto w-full flex-1">{children}</div>
              <SebiComplianceFooter />
            </main>
          </div>
        </SafeClerkProvider>
      </body>
    </html>
  );
}

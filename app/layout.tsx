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

export const metadata: Metadata = {
  title: "ProfitForce Signals",
  description: "Trading signals and watchlist — ProfitForce",
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

"use client";

import React, { useState } from "react";
import { useAuth, SafeSignInButton } from "@/components/AuthProvider";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    period: "",
    description: "Get started with basic market signals",
    features: [
      "NIFTY & SENSEX live tracking",
      "Basic buy/sell signals",
      "End-of-day market outlook",
      "5 stock watchlist",
    ],
    limitations: [
      "No option chain analysis",
      "No real-time alerts",
      "No trade tracking",
    ],
    cta: "Current Plan",
    highlight: false,
    priceEnvKey: null,
  },
  {
    id: "pro",
    name: "Pro",
    price: 999,
    period: "/mo",
    description: "Professional trading signals & analysis",
    features: [
      "Everything in Free",
      "Real-time trade calls (CE/PE)",
      "Option chain with strike analysis",
      "Support & Resistance levels",
      "Unlimited watchlist",
      "Trade tracking with P&L",
      "Tomorrow's Outlook with expert bias",
      "Live charts with Entry/SL/Target",
      "Email & push alerts",
    ],
    limitations: [],
    cta: "Subscribe — ₹999/mo",
    highlight: true,
    priceEnvKey: "NEXT_PUBLIC_STRIPE_PRICE_PRO",
  },
  {
    id: "elite",
    name: "Elite",
    price: 2499,
    period: "/mo",
    description: "For serious traders who want every edge",
    features: [
      "Everything in Pro",
      "Priority trade calls",
      "Auto-trade integration (Alpaca)",
      "Multi-timeframe analysis",
      "Backtesting dashboard",
      "Model training insights",
      "Dedicated Telegram channel",
      "1-on-1 expert consultation (monthly)",
    ],
    limitations: [],
    cta: "Subscribe — ₹2,499/mo",
    highlight: false,
    priceEnvKey: "NEXT_PUBLIC_STRIPE_PRICE_ELITE",
  },
];

export default function PricingPage() {
  const { isSignedIn, user } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe(plan: (typeof PLANS)[number]) {
    if (!plan.priceEnvKey) return; // free plan
    setLoading(plan.id);
    setError(null);

    const priceId =
      plan.id === "pro"
        ? process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO
        : plan.id === "elite"
          ? process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE
          : process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;

    if (!priceId) {
      setError(`Price ID not configured for ${plan.name} plan. Contact support.`);
      setLoading(null);
      return;
    }

    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clerk_id: user?.id,
          priceId,
          email: user?.primaryEmailAddress?.emailAddress,
          plan: plan.id,
          success_url: `${window.location.origin}/dashboard?subscription=success&plan=${plan.id}`,
          cancel_url: `${window.location.origin}/pricing?subscription=cancelled`,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Checkout failed");
      if (json.url) {
        window.location.href = json.url;
      } else {
        setError("No checkout URL returned");
      }
    } catch (e: any) {
      setError(String(e.message || e));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#040915] text-white px-4 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          ProfitForce Plans
        </h1>
        <p className="mt-3 text-gray-400 text-lg max-w-xl mx-auto">
          Choose the plan that fits your trading style. Upgrade or downgrade anytime.
        </p>
      </div>

      {/* Plans Grid */}
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`relative rounded-2xl border p-6 flex flex-col ${
              plan.highlight
                ? "border-blue-500 bg-gradient-to-b from-blue-950/40 to-[#0a1628] shadow-lg shadow-blue-500/10"
                : "border-gray-700/50 bg-[#0a1628]"
            }`}
          >
            {plan.highlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-blue-600 text-white text-xs font-bold">
                MOST POPULAR
              </div>
            )}

            <h3 className="text-xl font-bold">{plan.name}</h3>
            <p className="text-gray-400 text-sm mt-1">{plan.description}</p>

            <div className="mt-4 mb-6">
              <span className="text-4xl font-extrabold">
                {plan.price === 0 ? "Free" : `₹${plan.price.toLocaleString("en-IN")}`}
              </span>
              {plan.period && (
                <span className="text-gray-400 text-sm">{plan.period}</span>
              )}
            </div>

            {/* Features */}
            <ul className="space-y-2 flex-1">
              {plan.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-green-400 mt-0.5">✓</span>
                  <span className="text-gray-300">{f}</span>
                </li>
              ))}
              {plan.limitations.map((f, i) => (
                <li key={`l-${i}`} className="flex items-start gap-2 text-sm">
                  <span className="text-red-400 mt-0.5">✗</span>
                  <span className="text-gray-500">{f}</span>
                </li>
              ))}
            </ul>

            {/* CTA Button */}
            <div className="mt-6">
              {plan.id === "free" ? (
                <div className="w-full py-3 rounded-xl bg-gray-700/30 text-gray-400 text-center text-sm font-bold">
                  {isSignedIn ? "Current Plan" : "Sign Up Free"}
                </div>
              ) : !isSignedIn ? (
                <SafeSignInButton mode="modal">
                  <button className={`w-full py-3 rounded-xl text-sm font-bold transition-colors ${
                    plan.highlight
                      ? "bg-blue-600 hover:bg-blue-500 text-white"
                      : "bg-purple-600 hover:bg-purple-500 text-white"
                  }`}>
                    Sign In to Subscribe
                  </button>
                </SafeSignInButton>
              ) : (
                <button
                  onClick={() => handleSubscribe(plan)}
                  disabled={loading === plan.id}
                  className={`w-full py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 ${
                    plan.highlight
                      ? "bg-blue-600 hover:bg-blue-500 text-white"
                      : "bg-purple-600 hover:bg-purple-500 text-white"
                  }`}
                >
                  {loading === plan.id ? "Opening checkout..." : plan.cta}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="max-w-md mx-auto mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      {/* FAQ */}
      <div className="max-w-2xl mx-auto mt-16">
        <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {[
            { q: "Can I cancel anytime?", a: "Yes. Cancel from your profile at any time. You'll keep access until the end of your billing period." },
            { q: "What payment methods do you accept?", a: "All major credit/debit cards (Visa, Mastercard, RuPay) and UPI via Stripe." },
            { q: "Is there a free trial?", a: "The Free plan gives you basic signals indefinitely. Upgrade when you're ready for professional calls." },
            { q: "How do I get auto-trade?", a: "Connect your Alpaca broker in the Elite plan. We'll execute trades based on our signals automatically." },
          ].map((faq, i) => (
            <details key={i} className="group border border-gray-700/50 rounded-xl">
              <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-gray-300 hover:text-white select-none">
                {faq.q}
              </summary>
              <p className="px-4 pb-3 text-sm text-gray-500">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>

      {/* Back to dashboard */}
      <div className="text-center mt-12">
        <a
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          ← Back to Dashboard
        </a>
      </div>
    </div>
  );
}

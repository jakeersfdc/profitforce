/**
 * Production environment validation.
 *
 * Imported from lib/clerkServer.ts (server start-up path) and from
 * /api/health. Logs WARN for missing optional vars, ERROR for missing
 * required ones — but never crashes the build, so previews still work.
 */

type EnvSpec = {
  name: string;
  required: boolean;
  category: "core" | "auth" | "billing" | "compliance" | "ml" | "monitoring" | "mobile" | "broker" | "ops";
  description: string;
};

const SPECS: EnvSpec[] = [
  // Core
  { name: "DATABASE_URL", required: true, category: "core", description: "Postgres connection string (orders/users/subs/ledger)" },
  { name: "NEXT_PUBLIC_APP_ORIGIN", required: true, category: "core", description: "Public origin, e.g. https://profitforce.vercel.app" },

  // Auth
  { name: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", required: true, category: "auth", description: "Clerk pk_live_..." },
  { name: "CLERK_SECRET_KEY", required: true, category: "auth", description: "Clerk sk_live_..." },
  { name: "JWT_SECRET", required: true, category: "auth", description: "Server-signed JWT secret for mobile token exchange" },

  // Billing
  { name: "STRIPE_SECRET", required: true, category: "billing", description: "Stripe sk_live_..." },
  { name: "STRIPE_WEBHOOK_SECRET", required: true, category: "billing", description: "Stripe webhook signing secret (whsec_...)" },
  { name: "NEXT_PUBLIC_STRIPE_PRICE_PRO", required: true, category: "billing", description: "Pro plan Stripe price id" },
  { name: "NEXT_PUBLIC_STRIPE_PRICE_ELITE", required: false, category: "billing", description: "Elite plan price id (optional)" },

  // SEBI compliance (mandatory in India)
  { name: "NEXT_PUBLIC_SEBI_ENTITY_NAME", required: true, category: "compliance", description: "SEBI registered entity name" },
  { name: "NEXT_PUBLIC_SEBI_RA_NUMBER", required: true, category: "compliance", description: "SEBI Research Analyst registration (INH...)" },
  { name: "NEXT_PUBLIC_PRINCIPAL_OFFICER", required: false, category: "compliance", description: "Principal officer name" },
  { name: "NEXT_PUBLIC_COMPLIANCE_OFFICER", required: false, category: "compliance", description: "Compliance officer name" },
  { name: "NEXT_PUBLIC_GRIEVANCE_EMAIL", required: false, category: "compliance", description: "Investor grievance email" },

  // Ops
  { name: "CRON_SECRET", required: true, category: "ops", description: "Bearer token for Vercel cron protection" },
  { name: "ENCRYPTION_KEY", required: true, category: "ops", description: "Base64 32-byte AES-256-GCM key for broker token vault" },
  { name: "ADMIN_USERS", required: false, category: "ops", description: "Comma-separated Clerk user IDs with admin access" },
  { name: "ADMIN_API_KEY", required: false, category: "ops", description: "Header x-admin-key for /api/mcx-anchors and similar" },

  // Broker integrations (optional — only needed for the brokers you want to enable)
  { name: "ZERODHA_API_KEY", required: false, category: "broker", description: "Kite Connect API key" },
  { name: "ZERODHA_API_SECRET", required: false, category: "broker", description: "Kite Connect API secret" },
  { name: "UPSTOX_CLIENT_ID", required: false, category: "broker", description: "Upstox v2 OAuth client id" },
  { name: "UPSTOX_CLIENT_SECRET", required: false, category: "broker", description: "Upstox v2 OAuth client secret" },
  { name: "ANGELONE_API_KEY", required: false, category: "broker", description: "Angel One SmartAPI key" },
  { name: "ANGELONE_API_SECRET", required: false, category: "broker", description: "Angel One SmartAPI secret" },

  // Monitoring
  { name: "NEXT_PUBLIC_SENTRY_DSN", required: false, category: "monitoring", description: "Sentry DSN" },

  // ML / inference
  { name: "INFERENCE_URL", required: false, category: "ml", description: "External ML inference base URL" },
  { name: "INFERENCE_SERVICE_TOKEN", required: false, category: "ml", description: "Bearer token for inference service" },
];

export type EnvCheck = {
  ok: boolean;
  missingRequired: string[];
  missingOptional: string[];
  byCategory: Record<string, { name: string; present: boolean; required: boolean }[]>;
};

export function checkEnv(): EnvCheck {
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  const byCategory: EnvCheck["byCategory"] = {};

  for (const spec of SPECS) {
    const present = !!process.env[spec.name];
    if (!present) {
      if (spec.required) missingRequired.push(spec.name);
      else missingOptional.push(spec.name);
    }
    if (!byCategory[spec.category]) byCategory[spec.category] = [];
    byCategory[spec.category].push({ name: spec.name, present, required: spec.required });
  }

  return {
    ok: missingRequired.length === 0,
    missingRequired,
    missingOptional,
    byCategory,
  };
}

let warned = false;
/** Logs a one-shot warning at server start when required vars are missing. */
export function warnOnceIfMisconfigured(): EnvCheck {
  const result = checkEnv();
  if (warned) return result;
  warned = true;
  if (result.missingRequired.length > 0) {
    console.error("⚠️  [env] Missing REQUIRED env vars (some features will fail):", result.missingRequired.join(", "));
  }
  if (process.env.NODE_ENV === "production" && result.missingOptional.length > 0) {
    console.warn("ℹ️  [env] Missing optional env vars:", result.missingOptional.join(", "));
  }
  return result;
}

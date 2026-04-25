# ProfitForce — Production Runbook (Web + Mobile)

This document is the single source of truth for taking ProfitForce live.
Anything here marked **ACTION** is a manual step you must perform; everything
else is wired in code.

---

## 1. Architecture summary

| Surface | Stack | Hosting |
|---|---|---|
| Web | Next.js 16.2 (App Router), React 19, Tailwind 4 | Vercel (`profitforce.vercel.app`) |
| Mobile | Expo SDK 52, React Native 0.76 | EAS Build / App Store / Play Store |
| DB | Postgres | Managed (Neon / Supabase / RDS) |
| Auth | Clerk | clerk.com |
| Billing | Stripe | stripe.com |
| ML inference | FastAPI (`Dockerfile.ml`) | Optional Cloud Run / k8s |

---

## 2. Web — Vercel environment variables

All required vars are validated at boot via [lib/envCheck.ts](lib/envCheck.ts).
You can verify post-deploy with `GET /api/health?strict=1`.

### 2.1 Required (production)

| Name | Where to get it |
|---|---|
| `DATABASE_URL` | Postgres provider (must include `?sslmode=require`) |
| `NEXT_PUBLIC_APP_ORIGIN` | `https://profitforce.vercel.app` (or your custom domain) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk dashboard → API Keys (live) |
| `CLERK_SECRET_KEY` | Clerk dashboard → API Keys (live) |
| `JWT_SECRET` | Generate: `openssl rand -base64 48` |
| `STRIPE_SECRET` | Stripe dashboard → Developers → API keys (live `sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → Webhooks → endpoint signing secret (`whsec_…`) |
| `NEXT_PUBLIC_STRIPE_PRICE_PRO` | Stripe dashboard → Products → price id (`price_…`) |
| `NEXT_PUBLIC_SEBI_ENTITY_NAME` | Your registered entity name |
| `NEXT_PUBLIC_SEBI_RA_NUMBER` | Your SEBI Research Analyst registration number |
| `CRON_SECRET` | `openssl rand -hex 32` (used by `/api/broker/profitforce/cron`) |

### 2.2 Optional but recommended

| Name | Purpose |
|---|---|
| `INFERENCE_URL` | Rewrites `/ml/*` to your ML service |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Error monitoring |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web push |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Transactional email |

**ACTION:** add the above in Vercel → Settings → Environment Variables → Production.

---

## 3. Web — DB migrations

Migrations now run automatically on every Vercel deploy via the
`vercel-build` script in `package.json`:

```
node scripts/run_migrations.js && next build
```

Migrations live in [migrations/](migrations/) and are idempotent (tracked in
the `migrations` table).

To run manually:

```
DATABASE_URL=postgres://… npm run migrate
```

> Note: there is also a legacy `scripts/migrations/` folder used by some older
> tooling. The canonical folder used by both Vercel build and `npm run
> migrate` is the top-level `migrations/`.

---

## 4. Web — Stripe setup

### 4.1 Webhook endpoint

**ACTION:** in Stripe Dashboard → Developers → Webhooks → Add endpoint:

- Endpoint URL: `https://profitforce.vercel.app/api/stripe/webhook`
- Events to send:
  - `checkout.session.completed`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

The handler in [app/api/stripe/webhook/route.ts](app/api/stripe/webhook/route.ts)
already:

- verifies the signature
- guards against duplicate delivery via the `stripe_events` table (migration
  `0004_stripe_events.sql`)
- updates `users.is_subscriber` and the `subscriptions` table

### 4.2 Products / Prices

**ACTION:** create one Product (e.g. "ProfitForce Pro") with a recurring price,
then put the resulting `price_…` id in `NEXT_PUBLIC_STRIPE_PRICE_PRO`.

---

## 5. Web — Health, SEO, security

| Endpoint / file | Purpose |
|---|---|
| `GET /api/health` | Liveness + DB ping + env summary. Add `?strict=1` for 503-on-degraded for uptime monitors. |
| `app/robots.ts` | Disallows `/api/`, `/admin/`, `/dashboard/`, `/profile/`, `/checkout/`. |
| `app/sitemap.ts` | Public routes for SEO. |
| `next.config.ts` headers | HSTS, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, **CSP** (Clerk + Stripe + Sentry allow-listed). |

**ACTION (DNS / domain):**

1. Add custom domain in Vercel → Domains.
2. Update `NEXT_PUBLIC_APP_ORIGIN` to the custom domain.
3. Update Stripe webhook URL.
4. Update mobile `app.json` → `extra.apiOrigin`.

---

## 6. Web — deploy

```
git add -A
git commit -m "feat(prod): production readiness sweep"
git push origin main
```

Vercel auto-deploys `main`. Verify:

```
curl https://profitforce.vercel.app/api/health?strict=1
```

Should return `200` with `status: "ok"`, `db.ok: true`, `env.ok: true`.

---

## 7. Mobile — prerequisites (one-time accounts)

| Account | Cost | What you need |
|---|---|---|
| Apple Developer Program | USD 99/year | Enrolled team, Apple ID, Team ID, App Store Connect app record |
| Google Play Console | USD 25 one-time | Developer account, service account JSON for EAS Submit |
| Expo / EAS | Free tier OK | Logged in via `eas login` (account: `jakeersfdc`, project `ff047ca0-…`) |

**ACTION:** create both store listings. App identifiers are already set:

- Bundle ID (iOS) / Package (Android): `com.profitforce.signals`
- Display name: `ProfitForce-Signals`

---

## 8. Mobile — configuration

API base URL is now configurable via `app.json` → `extra.apiOrigin`
(read in [mobile-expo/App.tsx](mobile-expo/App.tsx) via
`expo-constants`).

To point a build at a different backend, edit `mobile-expo/app.json`:

```json
"extra": { "apiOrigin": "https://your-domain.com" }
```

Errors are caught by the new
[mobile-expo/components/ErrorBoundary.tsx](mobile-expo/components/ErrorBoundary.tsx)
to avoid white-screen crashes.

---

## 9. Mobile — build & submit

```
cd mobile-expo
npm install
eas login
eas build:configure          # only first time
eas build -p android --profile production
eas build -p ios     --profile production
```

When ready to ship:

**ACTION:** open [mobile-expo/eas.json](mobile-expo/eas.json) and replace the
placeholders in `submit.production`:

- `appleId`, `ascAppId`, `appleTeamId` (iOS)
- Place your Google Play service-account JSON at
  `mobile-expo/google-play-service-account.json` (do **not** commit it; add
  to `.gitignore`).

Then:

```
eas submit -p android --latest
eas submit -p ios     --latest
```

---

## 10. Mobile — required policies

Apple and Google **will reject** the app without:

1. **Privacy Policy URL** — host at `https://profitforce.vercel.app/legal/privacy`.
2. **Terms of Service URL** — host at `https://profitforce.vercel.app/legal/terms`.
3. **Account deletion mechanism** (Apple Guideline 5.1.1(v)) — required if you
   accept logins. Expose at `/profile` "Delete account".
4. **SEBI risk disclosure** is already shown via `SebiRiskBanner` /
   `SebiComplianceFooter` in the web app; surface equivalent text on the
   mobile login screen.

---

## 11. Deep linking (optional but recommended)

The Expo scheme `profitforce://` is registered. To support universal links
(`https://profitforce.vercel.app/auth/transfer?token=…` opening the app):

- iOS: host `https://profitforce.vercel.app/.well-known/apple-app-site-association`
- Android: host `https://profitforce.vercel.app/.well-known/assetlinks.json`

These are **not** generated yet — add them after first store build when you
have the SHA-256 fingerprints from EAS.

---

## 12. Day-2 operations

| Task | How |
|---|---|
| Rotate `JWT_SECRET` / `CRON_SECRET` | Generate new value, update Vercel env, redeploy. Active sessions invalidate. |
| Roll Stripe keys | Update `STRIPE_SECRET` + `STRIPE_WEBHOOK_SECRET`, redeploy, delete old key in Stripe. |
| DB backup | Use your Postgres provider's PITR (Neon/Supabase/RDS all support this). |
| Monitor health | Pingdom/UptimeRobot on `https://profitforce.vercel.app/api/health?strict=1` — 1 min interval. |
| View errors | Sentry project linked via `SENTRY_DSN`. |
| Cron status | `GET /api/broker/profitforce/cron` requires `Authorization: Bearer $CRON_SECRET`. Vercel cron schedule is daily on Hobby (`0 4 * * *`); upgrade to Pro for `*/2 * * * *`. |

---

## 13. Pre-flight checklist

- [ ] All required env vars set in Vercel Production
- [ ] `GET /api/health?strict=1` returns 200
- [ ] Stripe webhook delivers (use Stripe CLI: `stripe trigger checkout.session.completed`)
- [ ] Test checkout end-to-end with Stripe test card `4242 4242 4242 4242`
- [ ] Custom domain DNS verified, HTTPS green
- [ ] SEBI registration number is real (not the placeholder)
- [ ] Privacy + Terms pages reachable
- [ ] Mobile dev build runs against production API
- [ ] EAS production build uploads to TestFlight + Play Internal Testing
- [ ] Account deletion flow works
- [ ] First store review submitted

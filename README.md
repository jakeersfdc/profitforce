# ProfitForce Signals

This repository is a Next.js (app directory) dashboard that fetches market data and computes trading signals.

## Prerequisites
- Node.js (v18+ recommended)
- Git installed locally
- A GitHub account
- A Vercel account (https://vercel.com)

## Quick local start
```bash
npm install
npm run dev
# open http://localhost:3000
```

## Project notes
- Server-only libraries (e.g., `yahoo-finance2`, `technicalindicators`) are used only inside server code (`app/api/*`) to avoid client bundling issues.

## GitHub + Vercel (recommended)
1. Initialize local git and push to GitHub:
```bash
git init
git add -A
git commit -m "chore: init repo"
# create a GitHub repo on github.com then:
git remote add origin git@github.com:YOUR_USER/YOUR_REPO.git
git push -u origin main
```

2. Import the repo into Vercel:
- Go to https://vercel.com/import
- Select your GitHub repo and import
- Vercel will auto-detect Next.js (app dir). Leave build settings to defaults.

3. Environment variables
- In your Vercel Project → Settings → Environment Variables, add any secrets your app needs (development/preview/production):
	- `NEXT_PUBLIC_CLERK_FRONTEND_API` (if using Clerk)
	- `CLERK_API_KEY` (server)
	- Any other API keys you use for market data or services

4. Deploy
- After import and env vars, click Deploy. Vercel will build and publish a URL.

## Vercel CLI (alternative)
```bash
npm i -g vercel
vercel login
vercel # follow interactive prompts
# to add env vars via CLI:
vercel env add NAME production
```

## CI (optional)
A GitHub Actions workflow can be added to run a build on push. Vercel will still handle deployments when connected to GitHub.

## Troubleshooting
- If your Vercel build fails due to missing env vars, add them to Project Settings.
- Keep server-only libraries used only in server code or API routes to prevent Turbopack/webpack client build errors.

## Next Steps I can help with
- Produce the exact `git` and `vercel` commands you should run locally
- Generate a `vercel.json` or GitHub Actions workflow file to include in the repo
- Do a final import-audit to ensure no server-only modules are statically imported by client files

## Subscriber management & database migrations

This project supports subscriber management via a Postgres `users` table. To initialize the schema and run migrations locally, set `DATABASE_URL` and run:

```bash
# from repo root
npm install # ensure dependencies (pg)
node scripts/run_migrations.js
```

Admin endpoints are available under the app API at `/api/admin/subscribers`. Protect admin access by setting the environment variable `ADMIN_USERS` to a comma-separated list of Clerk user IDs allowed to manage subscribers.

Example env vars to set (development):

```
DATABASE_URL=postgresql://user:pass@localhost:5432/ProfitForce
ADMIN_USERS=clerk_user_id_here
```

## Stripe billing

This repo includes minimal Stripe endpoints to create a Checkout Session and handle webhooks. Environment variables:

```
STRIPE_SECRET=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_APP_ORIGIN=https://your-domain.example.com
```

API endpoints (server):
- `POST /api/stripe/create-checkout-session` — body: `{ clerk_id, priceId, email?, success_url?, cancel_url? }` — returns `url` to redirect the user to Stripe Checkout.
- `POST /api/stripe/webhook` — Stripe webhook endpoint to update `users.is_subscriber` on successful checkout.

When a checkout session is created the server now persists `stripe.customer.id` in `users.metadata->'stripe_customer'` so your admin pages can find the Stripe customer. The Stripe webhook also updates `users.is_subscriber` and stores the `stripe_customer` in the user's `metadata`.

Admin UI:
- Visit `/admin/subscribers` in the Next app to view and toggle subscriber status (requires signing in with a Clerk user that is listed in `ADMIN_USERS`).



Tell me which of the above you want me to prepare next (create GH push commands, create `vercel.json`, or list exact env vars).

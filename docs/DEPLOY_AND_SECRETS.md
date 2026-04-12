# Deployment & Secrets Checklist

This file lists required environment variables, recommended GitHub secret names, and sample Cloud Run deploy steps.

Required environment variables (used in code):

- `DATABASE_URL` — Postgres connection string used by migrations and server.
- `CLERK_SECRET_KEY` — Clerk server API key.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk publishable key (frontend).
- `JWT_SECRET` — Secret used to sign mobile exchange JWTs (INFERENCE_JWT_SECRET or JWT_SECRET).
- `STRIPE_SECRET` — Stripe API secret key.
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret (verify webhook requests).
- `NEXT_PUBLIC_STRIPE_PRICE_ID` — Price ID used on the checkout page.
- `ADMIN_USERS` — Comma-separated Clerk user IDs that should have admin access.
- `NEXT_PUBLIC_APP_ORIGIN` — e.g. `https://app.example.com` (used in deep links and redirects).
- `NEXT_PUBLIC_MOBILE_SCHEME` — e.g. `ProfitForce://` (deep-link scheme for Expo mobile app).

Optional / infra secrets:

- `GCLOUD_PROJECT` — Google Cloud project id (if deploying to Cloud Run).
- `GCLOUD_SA_KEY` — JSON service account key (base64 or JSON string) for deployments.
- `DOCKER_USERNAME` / `DOCKER_PASSWORD` — If pushing images to Docker Hub.

Setting GitHub secrets via `gh` (example):

```bash
gh secret set CLERK_SECRET_KEY
gh secret set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
gh secret set DATABASE_URL
gh secret set JWT_SECRET
gh secret set STRIPE_SECRET
gh secret set STRIPE_WEBHOOK_SECRET
gh secret set NEXT_PUBLIC_STRIPE_PRICE_ID
gh secret set ADMIN_USERS
gh secret set NEXT_PUBLIC_APP_ORIGIN
gh secret set NEXT_PUBLIC_MOBILE_SCHEME
gh secret set SENTRY_DSN
gh secret set GCLOUD_PROJECT
gh secret set GCLOUD_SA_KEY
```

Sample Cloud Run deploy (Linux / macOS / WSL):

```bash
# build and push web image to Google Container Registry
gcloud builds submit --tag gcr.io/$GCLOUD_PROJECT/ProfitForce-web:latest

# deploy to Cloud Run
gcloud run deploy ProfitForce-web \
  --image gcr.io/$GCLOUD_PROJECT/ProfitForce-web:latest \
  --region us-central1 \
  --platform managed \
  --set-secrets "DATABASE_URL=${DATABASE_URL}" \
  --allow-unauthenticated
```

Notes:
- Register the mobile redirect URIs and deep-link scheme in your Clerk application settings.
- After deployment, run `node scripts/run_migrations.js` against the production `DATABASE_URL` to create required tables.
- Ensure the ML container has Python dependencies installed; the Dockerfile.ml should install `ml/requirements.txt`.

If you'd like, I can generate a Cloud Run-specific GitHub Actions workflow next.

Automated publish mode
----------------------

To fully automate creation/push/tag and setting repository secrets without interactive prompts, create a file named `.publish_secrets.env` in the repository root with the following format (no quotes):

```
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
DATABASE_URL=postgres://user:pass@host:5432/dbname
JWT_SECRET=supersecret
STRIPE_SECRET=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PRICE_ID=price_...
ADMIN_USERS=clerkUserId1,clerkUserId2
NEXT_PUBLIC_APP_ORIGIN=https://app.example.com
NEXT_PUBLIC_MOBILE_SCHEME=ProfitForce://
SENTRY_DSN=https://...
GCLOUD_PROJECT=your-gcloud-project-id
GCLOUD_SA_KEY='{"type":"service_account",...}'
EXPO_TOKEN=expo-...
```

Then run the publish script in non-interactive mode (default repo is `jakeersfdc/ProfitForce-signals`):

```bash
./scripts/publish_and_release.sh --tag v0.1.0
```

Or PowerShell:

```powershell
.\scripts\publish_and_release.ps1 -Tag 'v0.1.0'
```

If you prefer to skip setting secrets via the script and set them manually in GitHub, pass `--skip-secrets` (bash) or `-SkipSecrets` (PowerShell).

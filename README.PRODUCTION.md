Production deployment guide
==========================

This document explains how to run the project in a production-like environment (Docker Compose) and how to deploy to a container registry/host.

Quick start (local compose)
---------------------------

1. Copy environment template and fill secrets:

   cp .env.example .env

2. Build and start via docker-compose:

   docker compose build
   docker compose up -d

3. Open the web UI at http://localhost:3000

Notes on services
- `web` — Next.js app (production build). Exposes port 3000.
- `ml` — Python inference service (uvicorn) on port 8000. Exposes `/model-info`, `/predict` endpoints.
- `db` — Postgres database for persistence.
- `redis` — Redis for background queues and caching.

CI/CD
------

The repository contains a GitHub Actions workflow `.github/workflows/ci-cd.yml` which:
- runs linters and builds the Next app
- installs Python deps and runs inference tests
- builds and pushes Docker images to `ghcr.io` when pushing to branches

Set `GITHUB_TOKEN` and registry secrets in your repo settings to enable the build-and-push step.

Mobile integration
------------------

- The mobile app should use the same backend API endpoints (base URL = `NEXT_PUBLIC_API_BASE` + server host). Expose HTTPS endpoint in production.
- For real-time alerts use Server-Sent Events endpoint at `/api/alerts/sse` (or `/api/alerts`) — the web dashboard already uses SSE.
- Authenticate mobile clients using tokens (JWT/Clerk). Avoid embedding secrets in the client.

Mobile-specific notes
- API auth: the inference service supports simple bearer tokens via `API_TOKENS` environment variable (comma-separated). Set a token per mobile client and send `Authorization: Bearer <token>` on requests.
- CORS: set `ALLOWED_ORIGINS` in `.env` to your mobile application's allowed origins (or `*` temporarily during testing).
- Ensemble predictions: the inference service exposes `/predict/ensemble` which averages probabilities across models saved as `models/best_*.joblib`. Mobile apps can POST JSON `{ "features": [[...], [...]] }` with `Authorization` header to get averaged probabilities.

Security tip: Use per-client tokens, rotate them regularly, and prefer a managed auth solution (OAuth/JWT via Clerk) for production mobile apps.

Security & Secrets
------------------

- Use a secret manager for production secrets (Vault, AWS Secrets Manager, GCP Secret Manager).
- Do NOT commit `.env` or secret values to git. Use `.env.example` as a template.
- Use HTTPS (TLS) in production; front the services with a reverse proxy/load balancer (Traefik/Caddy/NGINX) and obtain certs from Let's Encrypt.

Scaling
-------

- Run `web` scaled horizontally behind a load balancer.
- Serve inference (`ml`) behind a pooling layer or use an autoscaling group (Cloud Run, ECS, GKE). The repo includes a `deploy-cloudrun.yml` workflow (GitHub Actions) to build and push container images to Google Cloud Run. Set `GCLOUD_PROJECT` and `GCLOUD_SA_KEY` secrets in repository settings before enabling.
- Use a managed Postgres for reliability.

Monitoring & Observability
-------------------------

- Add Sentry DSN (`SENTRY_DSN`) for error reporting.
- Export Prometheus metrics from the inference service and scrape them.
- Use logging aggregation (CloudWatch, Datadog, LogDNA).

Cloud Run deploy notes
- The included workflow `.github/workflows/deploy-cloudrun.yml` builds and deploys two services: `ProfitForce-web` and `ProfitForce-ml` to Cloud Run. Provide a service account key with permissions to Cloud Build and Cloud Run as `GCLOUD_SA_KEY` in GitHub Secrets and set `GCLOUD_PROJECT`.

Kubernetes notes
- Basic Kubernetes manifests are provided under `k8s/` for reference. You should replace `REPLACE_WITH_REGISTRY` with your image registry and configure PVCs/ingress accordingly.

Automated training
------------------

- `scripts/schedule_train.js` implements a cron-based scheduler to POST `/api/train` for configured symbols.
- In production, run the scheduler as a separate service (k8s CronJob or systemd timer) with proper rate limits and resource controls.

Next steps
----------

- Configure a container registry and set CI secrets.
- Deploy images to a container platform (Cloud Run / ECS / GKE) and point the domain to the load balancer.
- Enable background worker and scheduler for training and reconciliation.

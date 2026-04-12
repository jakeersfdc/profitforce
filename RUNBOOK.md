# Production Runbook (starter)

This runbook contains essential instructions for operating the ProfitForce SaaS trading model infrastructure.

1) Quick health checks
  - Frontend: Visit your Vercel deployment URL and sign in.
  - Inference service: GET /health (Cloud Run URL)
  - Metrics: GET /metrics (Prometheus format) on inference service

2) Deploy model (automatic)
  - GitHub Actions `train.yml` runs daily and can upload artifacts to S3.
  - When training completes, the workflow can POST to `/api/model` to register a new model.
  - The inference service supports `/model/swap` to download model from S3 and hot-swap.

3) Manual deploy model
  - Upload model file to S3 bucket `s3://<bucket>/models/<file>`
  - Call inference service:
    POST /model/swap?bucket=<bucket>&key=models/<file>

4) Rollback
  - Use the model registry UI to find the previous model and call `/model/swap` with that key.

5) Alerts & Monitoring
  - Configure Sentry DSN in Vercel and Cloud Run for error tracking.
  - Scrape `/metrics` to Prometheus/Datadog for latency and throughput; alert on increased error rate or model-loaded=false.

6) Secrets
  - Store AWS and GCP credentials in GitHub Secrets and Vercel environment.
  - Keep `MODEL_DEPLOY_SECRET` for `/api/model` webhook.

7) Contact
  - On-call: <your-devops>@example.com

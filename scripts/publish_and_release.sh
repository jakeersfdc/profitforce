#!/usr/bin/env bash
set -euo pipefail

# Helper script to create a GitHub repo (optional), push current repo,
# set essential secrets via `gh`, and create a version tag to trigger release workflow.

usage() {
  cat <<EOF
Usage: $0 [--repo OWNER/REPO] [--tag vX.Y.Z]

Examples:
  # create remote, push main, create v0.1.0 tag and push it
  $0 --repo youruser/ProfitForce-signals --tag v0.1.0

Notes:
  - Requires GitHub CLI `gh` and Docker (if you plan to build images).
  - This script won't upload Docker images to registries automatically.
EOF
}

REPO="jakeersfdc/ProfitForce-signals"
TAG=""
SKIP_SECRETS=0

# Load secrets from .publish_secrets.env if present
if [ -f .publish_secrets.env ]; then
  # shellcheck disable=SC1091
  set -o allexport; source .publish_secrets.env; set +o allexport
  echo "Loaded secrets from .publish_secrets.env"
fi

while [[ $# -gt 0 ]]; do
  case $1 in
    --repo) REPO="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    --skip-secrets) SKIP_SECRETS=1; shift 1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1"; usage; exit 1 ;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not found. Install from https://cli.github.com/" >&2
  exit 1
fi

if [ -n "$REPO" ]; then
  if ! gh repo view "$REPO" >/dev/null 2>&1; then
    echo "Creating GitHub repo $REPO..."
    gh repo create "$REPO" --public --source=. --remote=origin --push
  else
    echo "GitHub repo $REPO already exists; ensuring remote 'origin' is set."
    git remote remove origin 2>/dev/null || true
    git remote add origin "git@github.com:${REPO}.git" || true
  fi
fi

echo "Staging and committing changes..."
git add -A
git commit -m "chore: add admin, billing, mobile transfer, migrations, release workflow" || echo "No changes to commit"

echo "Pushing to origin/main..."
git push -u origin main || git push origin HEAD:main

if [ -n "$TAG" ]; then
  echo "Creating and pushing tag $TAG..."
  git tag "$TAG" -m "Release $TAG" || true
  git push origin "$TAG"
fi

echo "Setting recommended GitHub secrets from environment variables or .publish_secrets.env"

SECRETS=(
  CLERK_SECRET_KEY
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  DATABASE_URL
  JWT_SECRET
  STRIPE_SECRET
  STRIPE_WEBHOOK_SECRET
  NEXT_PUBLIC_STRIPE_PRICE_ID
  ADMIN_USERS
  NEXT_PUBLIC_APP_ORIGIN
  NEXT_PUBLIC_MOBILE_SCHEME
  SENTRY_DSN
)

if [ "$SKIP_SECRETS" -eq 0 ]; then
  for s in "${SECRETS[@]}"; do
    VAL=${!s:-}
    if [ -n "$VAL" ]; then
      echo "Setting secret $s"
      gh secret set "$s" --body "$VAL"
    else
      echo "ERROR: required secret $s is not set in environment or .publish_secrets.env" >&2
      echo "Aborting. Provide all secrets or run with --skip-secrets to skip." >&2
      exit 1
    fi
  done
else
  echo "Skipping secret creation (--skip-secrets). Ensure secrets are set in GitHub repository." 
fi

echo "Done. If you created a tag matching the pattern v*, the release workflow will run." 
echo "Next: configure cloud provider secrets (GCLOUD_PROJECT, GCLOUD_SA_KEY) and run migrations on the deployed DB."

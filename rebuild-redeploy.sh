#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

PROJECT_ID="${PROJECT_ID:-omnidoc-508523}"
REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-omnidoc-ws}"
REPOSITORY="${REPOSITORY:-omnidoc}"
IMAGE_NAME="${IMAGE_NAME:-omnidoc-websocket}"
ENV_FILE="${ENV_FILE:-.env}"
APP_URL_OVERRIDE="${APP_URL:-}"
SKIP_TESTS="${SKIP_TESTS:-0}"
ALLOW_DIRTY="${ALLOW_DIRTY:-0}"

IMAGE_URI=""
PREVIOUS_REVISION=""
DEPLOYED=0

die() {
  echo "ERROR: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

rollback_on_error() {
  local status=$?
  if [[ "$DEPLOYED" == "1" && -n "$PREVIOUS_REVISION" ]]; then
    echo "Deployment verification failed; restoring traffic to $PREVIOUS_REVISION" >&2
    gcloud run services update-traffic "$SERVICE" \
      --project="$PROJECT_ID" \
      --region="$REGION" \
      --to-revisions="$PREVIOUS_REVISION=100" >/dev/null || \
      echo "WARNING: automatic rollback failed; inspect Cloud Run traffic immediately" >&2
  fi
  exit "$status"
}
trap rollback_on_error ERR

require_command gcloud
require_command git
require_command pnpm
require_command curl

if [[ -f "$ENV_FILE" ]]; then
  echo "Loading deployment environment from $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ -n "$APP_URL_OVERRIDE" ]]; then
  APP_URL="$APP_URL_OVERRIDE"
fi
[[ "$APP_URL" == https://* ]] || die "APP_URL must be set to the production HTTPS origin, for example APP_URL=https://app.example.com"

for env_name in DATABASE_URL DIRECT_URL SUPABASE_SERVICE_ROLE_KEY REDIS_URL; do
  [[ -n "${!env_name:-}" ]] || die "$env_name must be set in $ENV_FILE or the shell environment"
done

ACTIVE_ACCOUNT="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
[[ -n "$ACTIVE_ACCOUNT" ]] || die "gcloud has no active authenticated account"

[[ "$(git rev-parse --show-toplevel)" == "$ROOT_DIR" ]] || die "script must run from the repository root"
if [[ "$ALLOW_DIRTY" != "1" ]] && [[ -n "$(git status --porcelain)" ]]; then
  die "working tree is dirty; commit changes first or rerun with ALLOW_DIRTY=1"
fi

git rev-parse --verify HEAD >/dev/null 2>&1 || die "repository has no commit to tag"
COMMIT_SHA="$(git rev-parse --short=12 HEAD)"
BUILD_TAG="${COMMIT_SHA}-$(date -u +%Y%m%d%H%M%S)"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${BUILD_TAG}"

gcloud artifacts repositories describe "$REPOSITORY" \
  --project="$PROJECT_ID" \
  --location="$REGION" >/dev/null

gcloud run services describe "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" >/dev/null

PREVIOUS_REVISION="$(gcloud run services describe "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='value(status.latestReadyRevisionName)')"
[[ -n "$PREVIOUS_REVISION" ]] || die "could not determine the currently serving Cloud Run revision"

if [[ "$SKIP_TESTS" != "1" ]]; then
  pnpm typecheck
  pnpm test
fi

echo "Building $IMAGE_URI with Dockerfile.ws"
gcloud builds submit "$ROOT_DIR" \
  --project="$PROJECT_ID" \
  --config="$ROOT_DIR/cloudbuild.ws.yaml" \
  --substitutions="_IMAGE_URI=${IMAGE_URI}"

echo "Deploying $SERVICE"
gcloud run deploy "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --platform=managed \
  --image="$IMAGE_URI" \
  --allow-unauthenticated \
  --port=8080 \
  --timeout=3600s \
  --concurrency=100 \
  --min-instances=0 \
  --max-instances=1 \
  --session-affinity \
  --no-use-http2 \
  --update-env-vars="APP_URL=${APP_URL},NEXT_PUBLIC_APP_URL=${APP_URL},WS_REDIS_REQUIRED=true,DATABASE_URL=${DATABASE_URL},DIRECT_URL=${DIRECT_URL},SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY},REDIS_URL=${REDIS_URL}"
DEPLOYED=1

SERVICE_URL="$(gcloud run services describe "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='value(status.url)')"
[[ "$SERVICE_URL" == https://* ]] || die "Cloud Run did not return an HTTPS service URL"

HEALTH_URL="${SERVICE_URL}/health"
HEALTH_OK=0
HEALTH_BODY=""
for attempt in $(seq 1 30); do
  HEALTH_BODY="$(curl --fail --silent --show-error --max-time 10 "$HEALTH_URL" || true)"
  if [[ "$HEALTH_BODY" == *'"ok":true'* && "$HEALTH_BODY" == *'"redis":"ready"'* ]]; then
    HEALTH_OK=1
    break
  fi
  echo "Waiting for Redis health ($attempt/30)"
  sleep 5
done
[[ "$HEALTH_OK" == "1" ]] || die "Cloud Run health never reported Redis ready: $HEALTH_BODY"

DEPLOYED_REVISION="$(gcloud run services describe "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='value(status.latestReadyRevisionName)')"
DEPLOYED=0

echo "Deployment verified"
echo "Revision: $DEPLOYED_REVISION"
echo "Image: $IMAGE_URI"
echo "Service: $SERVICE_URL"
echo "WebSocket: ${SERVICE_URL/https:\/\//wss://}"

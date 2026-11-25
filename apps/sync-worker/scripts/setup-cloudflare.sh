#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

BUCKET_NAME="${1:-mkboard-sync}"

echo "==> 1/3 Checking Cloudflare R2 bucket: ${BUCKET_NAME}"
if ! npx wrangler r2 bucket create "${BUCKET_NAME}" 2>/dev/null; then
  echo "    Bucket '${BUCKET_NAME}' already exists or creation skipped."
fi

echo "==> 2/3 Configuring SYNC_TOKEN secret"
if [ -z "${SYNC_TOKEN:-}" ]; then
  SYNC_TOKEN="$(openssl rand -hex 24)"
  echo "    Generated new SYNC_TOKEN (save this for MkBoard Desktop):"
  echo "    ${SYNC_TOKEN}"
fi
printf '%s' "${SYNC_TOKEN}" | npx wrangler secret put SYNC_TOKEN

echo "==> 3/3 Deploying Cloudflare Worker"
npx wrangler deploy

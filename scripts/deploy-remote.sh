#!/usr/bin/env bash
# Build locally, then deploy the Next.js build to an already-authorized Vultr VM.
# Requires MAAT_HOST and explicit deployment authorization. Review before use.
set -euo pipefail

# V2 deployment is gated until capacity and authentication are verified.
if [ "${MAATV2_DEPLOY_READY:-}" != "yes" ]; then
  echo "V2 deployment not ready. Complete DEPLOYMENT.md before enabling." >&2
  exit 1
fi

: "${MAAT_HOST:?Set MAAT_HOST to the authorized SSH target, e.g. maat@203.0.113.10}"
REMOTE_DIR="${REMOTE_DIR:-/opt/maatv2}"
SERVICE_WEB="${SERVICE_WEB:-maatv2-web}"
SERVICE_WORKER="${SERVICE_WORKER:-maatv2-worker}"

# NEXT_PUBLIC_PRIVY_APP_ID is compiled into the browser bundle. Keep this public ID
# available during the local production build; all secrets remain on the VM.
export NEXT_PUBLIC_PRIVY_APP_ID="${NEXT_PUBLIC_PRIVY_APP_ID:-cmw7s2nj6011d0hl53g3sde60}"

echo "==> Installing local dependencies and building production assets"
corepack pnpm install --frozen-lockfile
corepack pnpm build

echo "==> Copying source and .next build to ${MAAT_HOST}:${REMOTE_DIR}"
rsync -az --delete \
  --exclude node_modules \
  --exclude ".next-*" \
  --exclude data \
  --exclude .env.local \
  --exclude .env \
  --exclude .git \
  --exclude test-results \
  --exclude playwright-report \
  ./ "${MAAT_HOST}:${REMOTE_DIR}/"

echo "==> Installing Linux dependencies and applying migrations"
ssh "${MAAT_HOST}" "sudo -u maatv2 bash -lc '
  set -euo pipefail
  cd ${REMOTE_DIR}
  corepack pnpm install --frozen-lockfile
  set -a; . /etc/maatv2/maat.env; set +a
  corepack pnpm exec tsx scripts/backup.ts
  corepack pnpm exec tsx scripts/migrate.ts
'"

echo "==> Restarting services"
ssh "${MAAT_HOST}" "sudo systemctl restart ${SERVICE_WEB} ${SERVICE_WORKER} && sleep 2 && sudo systemctl --no-pager --lines=20 status ${SERVICE_WEB} ${SERVICE_WORKER}"

echo "==> Health check (requires APP_URL in /etc/maatv2/maat.env)"
ssh "${MAAT_HOST}" "set -a; . /etc/maatv2/maat.env; set +a; curl -fsS \"\${APP_URL}/api/health\""

echo "Deployment commands completed. Verify the public workflow manually before marking it complete."

#!/usr/bin/env bash
set -euo pipefail
app=/opt/maat
archive=/tmp/maat-submission-fixes.tgz
stamp=$(date -u +%Y%m%dT%H%M%SZ)
stage=/opt/maat-stage-$stamp
rollback=/opt/maat-rollback-$stamp.tgz
if [ ! -d "$app/.next" ] || [ ! -f "$archive" ]; then echo 'Existing release or update archive missing'; exit 1; fi
mkdir -m 750 "$stage"
tar -xzf "$archive" -C "$stage"
test -f "$stage/.next/BUILD_ID"
test -f "$stage/.next/server/pages-manifest.json"
# Back up SQLite while the current application remains available.
cd "$app"
set -a
. /etc/maat/maat.env
set +a
install -o maat -g maat -m 600 "$stage/scripts/backup.ts" "$app/scripts/backup-submission.ts"
runuser -u maat --preserve-environment -- /usr/bin/node node_modules/tsx/dist/cli.mjs scripts/backup-submission.ts
rm "$app/scripts/backup-submission.ts"
tar --exclude='./node_modules' --exclude='./data' --exclude='./.next/cache' --exclude='./.next-*' --exclude='./.git' --exclude='./.env*' -czf "$rollback" .
chmod 600 "$rollback"
restore() {
  echo 'Release failed; restoring previous code and restarting services.'
  systemctl stop maat-web maat-worker || true
  if [ -d "$app/.next" ]; then mv "$app/.next" "$stage/failed-next"; fi
  tar -xzf "$rollback" -C "$app"
  chown -R maat:maat "$app"
  systemctl start maat-web maat-worker
}
trap restore ERR
systemctl stop maat-web maat-worker
mv "$app/.next" "$app/.next-rollback-$stamp"
cp -a "$stage/." "$app/"
for removed in public/samples/invoices-sample.csv public/samples/payments-sample.csv lib/demo.ts lib/fixture.ts components/DemoButton.tsx components/DemoLinkNote.tsx scripts/seed-demo.ts app/api/demo/start/route.ts app/api/demo/reset/route.ts; do
  rm -f -- "$app/$removed"
done
chown -R maat:maat "$app"
runuser -u maat --preserve-environment -- /usr/bin/node node_modules/tsx/dist/cli.mjs scripts/migrate.ts
runuser -u maat --preserve-environment -- /usr/bin/node node_modules/tsx/dist/cli.mjs scripts/clear-demo-data.ts
systemctl start maat-web maat-worker
for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3000/api/health; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:3000/api/health
systemctl is-active maat-web maat-worker
trap - ERR
printf '\nRelease deployed. Rollback archive: %s\n' "$rollback"

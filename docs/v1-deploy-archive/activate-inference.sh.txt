#!/usr/bin/env bash
set -euo pipefail
cp -p /opt/maat/lib/ai.ts /root/maat-ai-before-inference.ts
python3 /tmp/enable-inference.py
install -o maat -g maat -m 644 /tmp/ai.ts /opt/maat/lib/ai.ts
install -o maat -g maat -m 644 /tmp/FIXES_AND_VERIFICATION.md /opt/maat/FIXES_AND_VERIFICATION.md
install -o maat -g maat -m 644 /tmp/public-smoke.mjs /opt/maat/scripts/public-smoke.mjs
systemctl restart maat-worker maat-web
cd /opt/maat
set -a
source /etc/maat/maat.env
set +a
/usr/bin/node --import tsx scripts/verify-ai.ts
for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3000/api/health; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:3000/api/health
systemctl is-active maat-web maat-worker

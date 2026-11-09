> Current release: the owner requested an account-only app. The public demo, automatic samples and guest demo routes have been removed. Real Vultr inference and production email sign-in are verified. See README.md and FIXES_AND_VERIFICATION.md for current behavior; older demo-related descriptions below are historical.

﻿# Vultr deployment

Target: Ubuntu 24.04 LTS x64, Frankfurt, 1 vCPU / 1 GB RAM / 25 GB SSD, public address
`199.247.1.174`, label `maat hackathon`.

**Current verified state (8 November 2026):** deployed and reachable over HTTPS at
**https://199-247-1-174.sslip.io**. Node.js 22.23.4, pnpm 12.18.0, Caddy 2.11.9, the `maat-web` and
`maat-worker` systemd services, and SQLite at `/opt/maat/data` are running. A Let's Encrypt certificate
was issued. Health, landing, demo creation, workbench, review, and the canonical worker result were
verified over HTTPS.

The `sslip.io` hostname is a free pointer to the VM, not a custom owner domain. If a custom domain is
provided, update `APP_URL`, the Caddy site address, and Privy allowed origins, then restart both
services and retest login.

The production shape is:

```
Internet → Caddy (HTTPS, owner-controlled hostname) → 127.0.0.1:3000 (Next.js)
                                                     ↘ SQLite + private uploads on persistent disk
                                                     ↘ one systemd worker
```

A bare `http://<IP>:3000` is not a finished authentication deployment. Privy email OTP requires an
HTTPS origin configured in the Privy dashboard.

## 1. Prerequisites

- SSH access to the specified VM, confirmed by the owner.
- An owner-controlled DNS record (e.g. `maat.example.com`) pointing at the VM.
- Authorization to deploy to that VM.
- Privy dashboard access to enable **Email** login and add allowed origins.
- Optional: Vultr Serverless Inference access, key, and a currently available model ID.

## 2. Prepare the host (review before running)

Allocate a swap file if the VM has 1 GB RAM; `next build` and dependency installation are memory
hungry. This does not add paid infrastructure.

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Install runtime prerequisites:

```bash
sudo apt update
sudo apt install -y curl ca-certificates build-essential python3 rsync ufw
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
sudo useradd --system --create-home --shell /usr/sbin/nologin maat
sudo mkdir -p /opt/maat /etc/maat /opt/maat/data
sudo chown -R maat:maat /opt/maat
sudo chmod 750 /opt/maat/data
```

Install Caddy from the official repository for Ubuntu 24.04; do not expose port 3000 publicly.

## 3. Copy the application

From the development machine (adjust `MAAT_HOST` and path):

```bash
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude data \
  --exclude .env.local --exclude .git --exclude test-results --exclude playwright-report \
  ./ maat@${MAAT_HOST}:/opt/maat/
```

The deploy script `scripts/deploy-remote.sh` performs the copy, install, build, migration, and
service restart. Review it first; it requires explicit `MAAT_HOST` and sudo authorization.

## 4. Generate production configuration on the host

```bash
sudo install -o root -g maat -m 0640 deploy/maat.env.example /etc/maat/maat.env
openssl rand -hex 32
sudo editor /etc/maat/maat.env
```

Set at least:

```dotenv
NODE_ENV=production
APP_URL=https://maat.example.com
NEXT_PUBLIC_PRIVY_APP_ID=cmw7s2nj6011d0hl53g3sde60
PRIVY_APP_ID=cmw7s2nj6011d0hl53g3sde60
SESSION_SECRET=<output of openssl rand -hex 32>
DATABASE_URL=file:./data/maat.db
UPLOAD_DIR=./data/uploads
AI_BASE_URL=https://api.vultrinference.com/v1
AI_API_KEY=
AI_MODEL=
```

- Do not commit `/etc/maat/maat.env`.
- Do not paste secrets into chat, tickets, or shell history.
- `APP_URL` must match the real HTTPS origin exactly. `Secure` cookies and origin checks derive from it.
- `NEXT_PUBLIC_PRIVY_APP_ID` is compiled at build time. If it changes, rebuild.
- Keep `AI_API_KEY` and `AI_MODEL` blank until access/model availability is verified. The app will
  label explanations rule-based when unconfigured.
- If you enable identity tokens in Privy, the UI can display a verified email; otherwise it shows the
  verified DID.

## 5. Install, build, migrate

This VM has 1 GB RAM. A direct `next build` attempt on the VM was killed by the memory limit, so the
verified deployment builds locally/CI and transfers the `.next` output. The current Windows-built
Next.js artifacts were successfully started on Ubuntu 24.04 after installing Linux dependencies on
the VM. `scripts/deploy-remote.sh` follows this flow.

Before building, make sure the public Privy App ID is available as `NEXT_PUBLIC_PRIVY_APP_ID` (the
script defaults to the supplied public ID). Build assets contain no API secrets:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
```

Then copy source plus `.next` to the VM, install dependencies **on Linux** (never copy Windows
`node_modules` or native `better-sqlite3` binaries), and apply migrations:

```bash
sudo -u maat bash -lc '
  set -euo pipefail
  cd /opt/maat
  corepack pnpm install --frozen-lockfile
  set -a; . /etc/maat/maat.env; set +a
  corepack pnpm exec tsx scripts/migrate.ts
'
```

`NEXT_PUBLIC_PRIVY_APP_ID` is compiled at build time. `APP_URL`, `SESSION_SECRET`, database paths,
and AI secrets are runtime-only values in `/etc/maat/maat.env`.

Verify the build and database:

```bash
sudo -u maat bash -lc 'cd /opt/maat && node_modules/.bin/next --version'
sudo -u maat bash -lc 'cd /opt/maat && set -a; . /etc/maat/maat.env; set +a; corepack pnpm exec tsx scripts/migrate.ts'
```
## 6. Services

```bash
sudo install -m 0644 deploy/maat-web.service /etc/systemd/system/maat-web.service
sudo install -m 0644 deploy/maat-worker.service /etc/systemd/system/maat-worker.service
sudo systemctl daemon-reload
sudo systemctl enable --now maat-web maat-worker
sudo systemctl status maat-web maat-worker --no-pager
```

The web service runs `next start` on `127.0.0.1:3000`. The worker runs
`node node_modules/tsx/dist/cli.mjs worker/main.ts`. Both read `/etc/maat/maat.env` and write only
under `/opt/maat/data`.

## 7. Reverse proxy and TLS

```bash
sudo install -m 0644 deploy/Caddyfile /etc/caddy/Caddyfile
sudo mkdir -p /etc/caddy /var/log/caddy
sudo sh -c 'echo "MAAT_DOMAIN=maat.example.com" > /etc/caddy/maat.env'
# Add EnvironmentFile=/etc/caddy/maat.env to the Caddy systemd unit if required by your packaging.
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy obtains and renews TLS automatically once DNS points at the VM. Verify HTTPS before testing
Privy.

## 8. Privy dashboard

1. Enable **Email** login. Google stays hidden unless enabled and tested.
2. Disable wallet login methods; do not auto-create embedded wallets.
3. Add allowed origins: `http://localhost:3000` for development and the exact production
   `https://…` origin. Do not guess the domain.
4. Optionally enable identity tokens for verified email display.
5. Complete a real sign-in from a mailbox you control. Until this is done, the login integration is
   implemented but not end-to-end verified.

## 9. Firewall and health

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Do not open 3000 or 5432 (none used). Health:

```bash
curl -fsS https://maat.example.com/api/health
# {"status":"ok","database":"ok","time":"…"}
```

Health returns status only, never secrets.

## 10. Acceptance checks on the public origin

- Sign in with a real email OTP; complete business setup; reload and confirm the workspace persists.
- Upload the sample CSVs; watch actual stages; confirm the USD 1,000 partial; verify USD 14,500
  confirmed and the single USD 2,000 unallocated payment.
- Download all three CSVs and print/save the report.
- Undo the partial; verify the reversal event and totals.
- Restart both services; verify the batch and history persist and queued/interrupted jobs recover.
- Try a second account and confirm its workspace cannot see the first account's batch or exports.
- Confirm AI is either working with captured provider/model metadata or plainly labelled unavailable.
- Disable the worker temporarily and confirm uploads show a queued stage rather than a fake timer.

## 11. Backups, restore, rollback

Backup before every schema-changing deployment:

```bash
sudo -u maat bash -lc 'cd /opt/maat && set -a; . /etc/maat/maat.env; set +a; corepack pnpm exec tsx scripts/backup.ts'
sudo tar -C /opt/maat/data/backups -czf /var/backups/maat-$(date -u +%Y%m%dT%H%M%SZ).tgz .
```

Copy backups off the VM. Restore:

```bash
sudo systemctl stop maat-web maat-worker
sudo -u maat cp /path/to/maat.db /opt/maat/data/maat.db
sudo -u maat rsync -a /path/to/uploads/ /opt/maat/data/uploads/
sudo -u maat sqlite3 /opt/maat/data/maat.db 'PRAGMA integrity_check;'
sudo systemctl start maat-web maat-worker
```

Rollback: keep the previous release directory or tarball plus its database backup. Restore the
previous code, `pnpm install --frozen-lockfile`, `pnpm exec next build`, restore the pre-deploy DB if
the schema changed, then restart both units.

## 12. Operational notes

- 1 vCPU / 1 GB: one web process, one worker, no local model, no Kubernetes. Builds ideally happen
  off-VM; add swap if building on the VM.
- SQLite and uploads must live on persistent disk (`/opt/maat/data`), not the release directory.
- Keep `data/` and `.env.local` out of source control.
- Rotate the session secret only with a planned re-login of all users.
- Demo workspaces expire after 24 hours; source files are removed with the workspace on cleanup.
- Never publish the submission or provision paid infrastructure without owner authorization.

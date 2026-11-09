# Ma'at V2 deployment status

Deployed on November 9, 2026 at **https://maatv2.199-247-1-174.sslip.io**. Caddy obtained a Let's Encrypt certificate and proxies to V2 on loopback port 3200. The original V1 route remains at https://199-247-1-174.sslip.io.

## Capacity assessment

Before deployment, the 1 GB VM reported 955 MiB RAM, 389 MiB available, 2.3 GiB swap (81 MiB used), and 13 GiB free disk. V1 web, worker, and Caddy were active.

After V2 web and worker started, the observed idle footprint was about 164 MiB web and 55 MiB worker (peaks 175 MiB and 61 MiB). The latest snapshot reported 291 MiB available, 257 MiB swap used, and 9.5 GiB free disk; both public health checks passed. Memory pressure remains unverified under meaningful traffic, so this shared 1 GB host is a low-traffic deployment, not a load-capacity claim. Consider a 2 GB plan before sustained usage.

Systemd protects the V1 app from unbounded V2 growth with V2-only limits: web `MemoryHigh=288M`, `MemoryMax=320M`, `MemorySwapMax=128M`; worker `MemoryHigh=112M`, `MemoryMax=144M`, `MemorySwapMax=64M`.

## V1/V2 isolation

- V2 runs as `maatv2` from `/opt/maatv2`; its private database and uploads are `/opt/maatv2/data/maatv2.db` and `/opt/maatv2/data/uploads`.
- `/etc/maatv2/maat.env` is owned `root:maatv2`, mode `0640`. It has V2's newly generated session secret and provider configuration; secret values are not in Git.
- `maatv2-web` and `maatv2-worker` are enabled and active. The web listener is `127.0.0.1:3200` only.
- `/etc/caddy/maatv2.caddy` adds the V2 HTTPS site; `/etc/caddy/Caddyfile` imports it. The original V1 site block is preserved in place and backed up at `/etc/caddy/Caddyfile.pre-maatv2`.
- V1's `/opt/maat`, `/etc/maat`, port 3000, database, `maat-web` and `maat-worker` remain unchanged and active.
- Privy's Web & mobile web allowed origin `https://maatv2.199-247-1-174.sslip.io` was checked in the production browser: the Privy app configuration returned HTTP 200 and the email OTP input opened. The owner completed production email OTP sign-in and onboarding; V2 recorded `/api/auth/sync` 200, `/api/onboarding` 200, and `/dashboard` 200. Its isolated database contains one user, one workspace, and no batches.

The V2 production build was made locally. The VPS received the build artifact and installed the frozen dependency tree; no Next.js build ran on the 1 GB server. The full-install `next start` mode is used; standalone packaging remains unverified. See docs/AGENT_NATIVE_INTEGRATION.md.

Historical V1 operations are preserved for reference in `docs/MAAT_V1_DEPLOYMENT.md`.

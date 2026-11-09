# Ma'at V2 deployment status

Not deployed. The existing https://199-247-1-174.sslip.io site, `/opt/maat`, `/etc/maat`, and `maat-web` / `maat-worker` services belong to V1 and must remain unchanged.

## Read-only capacity check, November 9, 2026

The existing VM reports 955 MB total RAM, 393 MB available RAM, 2,399 MB swap (81 MB used), and approximately 13 GB free disk. V1 web and worker were active. This snapshot does not establish safe capacity for an additional Agent-Native runtime under load.

Build locally first. Measure the actual V2 runtime footprint before choosing same-VM hosting or increasing capacity. Do not build a second Next.js application on this 1 GB VM while V1 is serving judges.

## Isolated deployment requirements

- Separate system user `maatv2`, `/opt/maatv2`, `/etc/maatv2/maat.env`, database and uploads.
- Independent `maatv2-web` and `maatv2-worker` services; web port 3200, never port 3000.
- A separate hostname, HTTPS configuration and Privy allowed origin. No hostname is provisioned yet.
- A newly generated production session secret. Never reuse V1's session secret or database.
- Service and reverse-proxy validation, backup, health checks and memory monitoring before public access.

The inherited deployment script now defaults to V2 paths and is gated by `MAATV2_DEPLOY_READY=yes`; do not enable that gate until this checklist is complete. The systemd templates are preparation only, not proof of a working deployment. The embedded Agent-Native runtime uses the existing web service and provider settings; no separate agent server is required. Use Node.js 22.22 or later and install the complete dependency tree with the frozen lockfile before starting Next.js. Default output tracing excludes the framework package because this is a full-install server deployment; standalone packaging remains unverified. See docs/AGENT_NATIVE_INTEGRATION.md.

Historical V1 operations are preserved for reference in `docs/MAAT_V1_DEPLOYMENT.md`.

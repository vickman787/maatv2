# Ma'at V2

Separate development version of [Ma'at](https://github.com/vickman787/maat), prepared for the Builder.io Agent-Native Hackathon.

**Status:** V2 now embeds Agent-Native shared actions and its supported provider engine, with invoice-scoped conversations, persisted proposals and explicit human review. Live-provider verification passed; V2 deployment and a new public Clips demonstration remain pending. The original Ma'at URL is the submitted V1 app.

## Local setup

```sh
pnpm install
pnpm migrate
pnpm dev
```

Open http://localhost:3200. Configure `.env.local` from `.env.example`; the fresh local file has its own generated session secret. Add credentials locally, never in Git. Privy must permit the development origin before email sign-in can be verified.

| Resource | V2 isolation |
| --- | --- |
| Repository | https://github.com/vickman787/maatv2 |
| PC folder | `C:\Projects\MaatV2` |
| Development web port | 3200 |
| Browser acceptance-test port | 3201, with existing-server reuse disabled |
| SQLite file | `data/maatv2.db` |
| Uploads | This checkout's `data/uploads` |
| Session cookie | `maatv2_session`, signed with a fresh local secret |
| Planned VPS paths | `/opt/maatv2`, `/etc/maatv2` |
| Planned VPS services | `maatv2-web`, `maatv2-worker` |

## Baseline verification

On November 9, 2026, all 57 inherited unit/integration tests and TypeScript checking passed in this checkout. Migration initialized the separate local `data/maatv2.db`. These checks validate the isolated foundation, not an Agent-Native integration or V2 production deployment.

## Agent verification

All 68 unit/integration tests pass, including 11 Agent-Native tests. TypeScript, ESLint, the production build, the new desktop/mobile review walkthrough and the original reconciliation walkthrough passed. The installed provider engine and SDK are exercised with simulated streams. Live inference also passed on November 9, 2026 via `pnpm verify:agent`: all three investigation actions succeeded, one proposal was saved, and confirmed totals remained unchanged in isolated fixtures. Run that command again after changing provider configuration. New investigations are disabled while credentials are missing; evidence and manual review remain available.

## Provenance and new work

The original foundation is `vickman787/maat` at commit `10eb8c5`: account-only reconciliation, CSV imports and validation, deterministic matching, evidence review, bounded Vultr explanations, audit reversals and exports. Its code history and MIT license are retained. V1 sample screenshots and verification documents describe that foundation; they do not prove V2 changes work.

The V2 contribution connects a reconciliation agent and human review through genuine Agent-Native actions bound to the selected invoice. It inspects current evidence, searches eligible payments, continues an invoice-scoped conversation and persists structured proposals. Reviewers inspect cited source rows, edit amounts, reject or explicitly confirm. Confirmation revalidates financial state and uses the existing transactional allocation logic. See [the integration and verification notes](docs/AGENT_NATIVE_INTEGRATION.md).

See [the V2 build plan](docs/V2_BUILD_PLAN.md), [deployment separation](DEPLOYMENT.md), and [the inherited V1 README](docs/MAAT_V1_README.md).

## License

[MIT](LICENSE). Original Ma'at copyright and third-party licenses are retained.

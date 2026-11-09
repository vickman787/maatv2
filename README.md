# Ma'at V2

Separate development version of [Ma'at](https://github.com/vickman787/maat), prepared for the Builder.io Agent-Native Hackathon.

**Status:** isolated baseline created in a private repository. Agent-Native integration, V2 deployment, and a new public Clips demonstration are still pending. The original Ma'at URL is the submitted V1 app, not a live V2 preview.

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

## Provenance and new work

The original foundation is `vickman787/maat` at commit `10eb8c5`: account-only reconciliation, CSV imports and validation, deterministic matching, evidence review, bounded Vultr explanations, audit reversals and exports. Its code history and MIT license are retained. V1 sample screenshots and verification documents describe that foundation; they do not prove V2 changes work.

The V2 contribution will connect a reconciliation agent and the human interface through genuine Agent-Native actions and shared application state. Proposed scope: investigate an exception, explain the supplied evidence, and prepare a review proposal for explicit human confirmation. No framework integration is claimed complete yet.

See [the V2 build plan](docs/V2_BUILD_PLAN.md), [deployment separation](DEPLOYMENT.md), and [the inherited V1 README](docs/MAAT_V1_README.md).

## License

[MIT](LICENSE). Original Ma'at copyright and third-party licenses are retained.

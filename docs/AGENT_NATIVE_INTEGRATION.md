# Agent-Native integration in Ma'at V2

V2 keeps the existing Next.js server, Privy sessions, SQLite database and transactional review logic. It embeds the supported `@agent-native/core/agent/engine` AI SDK engine rather than mounting the framework's Nitro/PostgreSQL application server. No second server, authentication system, public MCP endpoint, or database is required by this adapter.

`lib/agent/actions.ts` defines real Agent-Native `defineAction` actions. The browser evidence control and agent both call the same validated `read_invoice` implementation. `list_candidates` searches eligible payments and calculates differences from live balances. `propose_decision` persists structured proposals and has no allocation capability. Action factories bind the authenticated user, workspace, batch and selected invoice on the server; the model cannot choose those identities. Membership and selection are checked again on every call.

`lib/agent/runtime.ts` is the application's bounded conversation host adapter: it uses the framework engine for provider streaming/tool translation, publishes the framework-generated action schemas, executes calls through the action runtime, feeds results back to the model, and persists run status and action outcomes. Limits are six provider steps, twelve tool calls and 90 seconds per run. A 120-second database lease prevents overlapping investigations and recovers interrupted requests. Conversation history is shared within the authorized workspace, scoped to the selected invoice, and the latest six completed exchanges are supplied to follow-up requests. The latest 30 runs and 50 proposals are displayed. Source previews sent to the model are bounded; original cited rows remain available in the review interface.

This is an embedded integration, not the standard AgentSidebar/Nitro scaffold or AgentKit transport. The small application-owned conversation panel uses the existing session-protected Next.js API. The installed engine and OpenAI-compatible provider adapter are exercised by a deterministic streaming-provider contract test, separately from tests of the application's orchestration.

## Human review

Proposal persistence changes no totals. Proposed evidence IDs must refer to the inspected invoice and inspected eligible payments. Confirmation requires an explicit reviewed flag from the authenticated UI, checks a fingerprint of current financial evidence, then uses `performReview` inside the same immediate SQLite transaction as the proposal decision. Changed balances require a new investigation. Amount edits are revalidated; the actual confirmed amount, note, actor and allocation link are retained. Rejection records the reviewer and note without changing allocations. Existing reversal controls remain available with their audit history.

Only `read_invoice`, `list_candidates` and `propose_decision` are exposed to the model. Confirmation and reversal are never tools. CSV contents are treated as untrusted data in the system instructions. The API checks sessions, workspace membership, origin, request size and input shape, and limits new investigations to 30 per user/workspace per hour. Provider diagnostics and keys are not returned to the browser.

## Configuration and verification

Use `.env.local` with V2's database, session secret and port. Set `AI_BASE_URL`, `AI_API_KEY` and a tool-capable `AI_MODEL`. The existing Vultr endpoint can be used if the selected model supports streamed chat completions with tool calls. A model supporting the old JSON explanations does not by itself establish agent compatibility.

Run `pnpm migrate`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, then `pnpm test:e2e`. Browser tests use a separate database on port 3201 and fixture proposals; provider traffic is disabled there. `tests/agent.test.ts` exercises the installed Agent-Native engine and SDK against simulated provider streams as well as access, schema, orchestration, interrupted-run and human-review boundaries.

Live-provider verification passed in isolation. V2 is deployed at `https://maatv2.199-247-1-174.sslip.io`; the production Privy origin, owner email OTP sign-in and onboarding are verified (`/api/auth/sync`, `/api/onboarding` and `/dashboard` returned 200). The 1 GB VPS has service memory caps, but load capacity is unverified. A new Clips recording remains a separate release gate. Do not present simulated provider tests as a live Vultr verification, or inherited V1 screenshots as V2 evidence.

Run `pnpm verify:agent` after setting credentials to exercise real tool orchestration against isolated in-memory fixture records. It checks that a proposal is saved without allocating; it never uses the application database or account records.

The authentication dependency's broad optional Solana peers require a compatible Kit 8 version for current program clients. The workspace override and exact root `@solana/kit` peer prevent a fresh install from combining those clients with Kit 5. This is an authentication build compatibility pin; the agent has no wallet or transaction tools.

## Local verification on November 9, 2026

- 68 unit/integration tests passed, including the installed engine/provider contract test.
- TypeScript and ESLint passed.
- The production-served Agent-Native browser walkthrough passed: source inspection, edited amount confirmation, persistence, duplicate refusal, missing-provider response, workspace/anonymous/origin boundaries, and 390px mobile layout.
- The existing private reconciliation browser walkthrough passed: confirmation, export, undo, refresh and logout.
- Desktop and mobile screenshots are in `docs/screenshots/agent-review-desktop.png` and `docs/screenshots/agent-review-mobile.png`. These use explicitly isolated test fixtures, not live provider results.
- The new SQLite migration was applied to the local V2 database; the application database still has zero users and workspaces. Browser fixtures are confined to the separate E2E database.
- Live provider verification passed with the configured Vultr provider on November 9, 2026 (`pnpm verify:agent`, exit 0): `read_invoice`, `list_candidates` and `propose_decision` all succeeded, one proposal was saved, and confirmed totals remained unchanged. The check used isolated in-memory fixture records and temporary uploads. The initial sandbox connection was blocked; the network-enabled retry passed.
- The complete production build passed, including final dependency tracing, in the documented full-install server mode. Privy emits a warning about its unused optional Farcaster adapter. No V2 production deployment is claimed.

## Production packaging

The planned VPS service runs `next start` after `pnpm install --frozen-lockfile`, with the complete application dependency tree on disk. The default build therefore excludes Agent-Native's broad runtime/CLI graph from output-file tracing. This avoids expensive static analysis of framework filesystem-discovery code without changing module loading at runtime. Do not deploy the default `.next` directory with only the files in its NFT manifests: install production dependencies as the deployment script already does.

Explicit `MAAT_STANDALONE=1` builds retain executable framework tracing, excluding only unused package documentation/scaffolds. Standalone packaging has not been verified by this upgrade. The reviewed VPS deployment path remains the full-install server mode.

The final completed build was also served for the agent browser walkthrough; all assertions passed. The inherited Windows web-server cleanup could hang after the test finished, so the owned test-server process was stopped explicitly. The separate run against an already-started test server completed normally with exit code 0. This cleanup limitation is separate from the application assertions.


A later full verification run on November 9 passed the separate production build, all 68 unit/integration tests, TypeScript, lint, both live AI checks, and all seven Chrome acceptance scenarios. See [the full test report](FULL_TEST_REPORT.md) for coverage and isolation details. The owner also completed real Privy email sign-in and onboarding.

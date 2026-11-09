# Full local verification - November 9, 2026

The owner completed real Privy email sign-in and onboarding. The V2 server recorded successful POST /api/auth/sync, POST /api/onboarding and GET /dashboard responses. No automated OTP entry is claimed.

This verification uses separate fixture records and a test server on port 3201. The owner's application remains on port 3200. The separate production output is .next-e2e, selected through MAAT_BUILD_DIR.

Completed checks:
- Unit/integration suite: 68 tests passed across 11 files.
- TypeScript: passed.
- ESLint: passed.
- Live AI explanation: passed with cited fictional source rows.
- Live Agent-Native investigation: completed; invoice read and candidate search succeeded; an invalid proposal call was rejected and the model corrected it; one valid proposal was saved; confirmed totals stayed unchanged.

Final results:
- Production build: passed, exit 0, using the separate .next-e2e output. The existing optional Privy Farcaster adapter warning remains; email-only sign-in and its modal passed.
- Chrome acceptance suite: all 7 scenarios passed, exit 0, in 2.9 minutes.
- Browser coverage: Privy email modal (no social/wallet choices), guest navigation, reconciliation review/confirmation/export/undo/persistence/logout, real CSV upload/matching, exact row/column validation errors, cross-workspace access refusal, agent evidence/edited proposal confirmation/replay refusal, anonymous and origin boundaries, and responsive layouts from 320px to 1920px.
- The owner completed real email authentication; the automated suite did not request or enter an OTP. Browser application workflows use isolated signed fixture sessions. Browser provider traffic is disabled; real AI is verified separately by the two live checks above.
- Screenshots are in docs/screenshots; they contain fictional fixture records. The HTML browser report is available locally at playwright-report/index.html (ignored by Git).
- The isolated test server was stopped after testing; the signed-in development app on port 3200 was left running.
- No deployment or public submission was performed. Standalone packaging remains unverified.

To build without replacing the running development output, set MAAT_BUILD_DIR=.next-e2e for pnpm build and for the test server/test process. The default output remains .next. Next's generated types for the separate build are included in tsconfig.json.

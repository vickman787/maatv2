# Ma'at V2 - Agent-Native build plan

## Event requirements

Official rules: https://www.builder.io/hackathon/rules
Submission: https://www.builder.io/hackathon/submit
Deadline: November 10, 2026 at 08:59 Africa/Lagos (November 9, 23:59 Pacific).
Required: a functional Agent-Native application, truthful disclosure of existing work and meaningful event development, and a public Clips recording viewable without login. Recording alone does not submit an entry.

## Starting foundation

V1 at `10eb8c5` is already submitted elsewhere. This separate repository preserves that foundation and starts with no copied user records, uploads, dependency directory or provider secrets. V1 code and running services remain unchanged.

## Focused new workflow

1. User opens a reconciliation batch and selects an exception.
2. The agent reads the selected invoice, eligible candidate payments and computed differences through workspace-scoped Agent-Native actions.
3. The agent investigates and produces a structured proposal with source IDs, assumptions and unresolved questions.
4. The UI displays the same proposal and source rows; the user edits, rejects or explicitly confirms it.
5. The existing transactional allocation logic revalidates current balances, ownership and currency. The agent cannot bypass human confirmation or reverse history silently.

## Implementation sequence

- [x] Independent checkout, Git history, local ports, cookie and private local configuration.
- [x] Read-only VPS capacity assessment and isolated deployment templates.
- [x] Create the private `vickman787/maatv2` GitHub remote.
- [x] Install dependencies; 57 tests and TypeScript checks pass. Initialize a fresh V2 database.
- [ ] Choose and validate an Agent-Native server integration compatible with the existing app; a sidebar alone is insufficient.
- [ ] Implement typed shared actions with server-owned identity, runtime input validation and workspace authorization.
- [ ] Add the agent conversation and selected-row context; persist review proposals alongside the existing data.
- [ ] Verify real provider/tool orchestration, access boundaries and explicit confirmation end to end.
- [ ] Test production build, desktop/mobile flow and independent deployment capacity.
- [ ] Record a new public Clips walkthrough and disclose the inherited V1 foundation.
- [ ] Submit and verify receipt.

## Primary framework references

- https://www.agent-native.com/docs/
- https://www.agent-native.com/docs/actions-defining/
- https://www.agent-native.com/docs/drop-in-agent/

Avoid adding a nominal package dependency without real shared actions and a working agent flow. Use the supported runtime rather than treating the original one-shot AI explanation as a completed Agent-Native agent.

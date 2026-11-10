# Production agent verification - November 9, 2026

Origin: https://maatv2.199-247-1-174.sslip.io/

Outcome: the deployed agent investigation, follow-up, explicit review confirmation, persistence and report totals worked with fictional test records. Two presentation issues were observed; this is not a claim that every production feature is defect-free.

## Test records

Batch: PRODUCTION QA — fictional agent verification 2026-11-09
Batch ID: 7de9b540-7248-4a70-8799-5471d01801ad
Invoice: QA-PARTIAL-002, USD 1,500.00
Payment: QA-PAY-002, USD 1,000.00, exact invoice reference
A separate fictional USD 1,500.00 invoice/payment pair provided the automatic exact-match baseline.

The owner signed in through Privy in the Codex browser. Verification used the production UI and live configured inference provider. No application session was forged and no existing batch was modified. This is a production test batch, clearly labelled as fictional; it was retained for inspection. No funds were moved.

## Observed flow

1. CSV upload and matching completed. Exact pair allocated USD 1,500.00 automatically; partial invoice remained at USD 0 allocated / USD 1,500.00 outstanding.
2. The agent called read_invoice and list_candidates. Its first propose_decision call was rejected because evidence did not reference the inspected rows. A corrected propose_decision call succeeded.
3. One pending USD 1,000.00 proposal was saved with source rows, assumptions and questions. The invoice remained USD 0 allocated / USD 1,500.00 outstanding. Confirmation stayed disabled until the review checkbox was checked.
4. A follow-up request re-read invoice evidence and correctly reported the same unchanged balances. It did not create another proposal or allocate anything.
5. The reviewer inspected cited source rows, entered a fictional-QA review note, checked the reviewed flag and clicked Confirm allocation.
6. Proposal status became confirmed. After a full page reload, invoice allocation was USD 1,000.00, outstanding was USD 500.00, and the payment remaining balance was USD 0.00. Proposal status, conversation and review note persisted. Review history linked the proposal ID to the decision.
7. The production batch showed zero unassigned payment rows and USD 500 outstanding. The report showed USD 3,000 invoiced, USD 2,500 imported payments, USD 2,500 confirmed allocations and USD 500 outstanding.

Proposal ID: 01e8cae7-7977-41b7-adab-10bd1060ffbe

## Findings and limits

- The first agent reply contained an incorrect USD 2,500 outstanding figure in its free-text comparison table, despite correct minor-unit values and a correct structured proposal. The follow-up explicitly corrected it to USD 1,500. The application ledger and proposal amount were correct throughout. Treat model prose as advice and review the deterministic evidence.
- After confirmation, the candidate panel correctly showed USD 0 remaining, but its hypothetical preview still said USD 1,000 would remain unallocated. This appears to be stale preview wording; current invoice balances and report totals were correct. This display issue was recorded, not repaired or redeployed during verification.
- Rejection, reversal, exported CSV downloads, load capacity and cross-workspace attacks were not repeated on production in this focused check. Those boundaries have separate local test coverage; do not represent that as production coverage.

## Evidence

- docs/screenshots/production-agent-confirmed.png: persisted invoice allocation and outstanding balance.
- docs/screenshots/production-agent-report.png: production report totals.
- Review URL: https://maatv2.199-247-1-174.sslip.io/batches/7de9b540-7248-4a70-8799-5471d01801ad/review/3198da88-0176-4d31-8f15-a95f4cce062a
- Report URL: https://maatv2.199-247-1-174.sslip.io/batches/7de9b540-7248-4a70-8799-5471d01801ad/report

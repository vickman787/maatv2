import type Database from "better-sqlite3";
import { z } from "zod";
import { AuthError, type AuthContext } from "../auth";
import { nowIso } from "../db";
import { minorToDecimalString } from "../money";
import { performReview } from "../review";
import { evidenceSnapshot, selectedReview, type Selection } from "./actions";

export type AgentRun = { id: string; question: string; response: string | null; status: "running" | "completed" | "failed";
  model: string; events_json: string; created_at: string; expires_at: string };
export type AgentProposal = { id: string; run_id: string; payment_row_id: string | null; amount_minor: number | null;
  rationale: string; evidence_json: string; assumptions_json: string; questions_json: string; snapshot: string;
  status: "pending" | "confirmed" | "rejected"; created_at: string; allocation_id: string | null; decision_note: string | null; decided_amount_minor: number | null };

export function expireRuns(db: Database.Database, workspaceId: string, invoiceId: string) {
  db.prepare(`UPDATE agent_runs SET status = 'failed', response = 'Investigation interrupted. You can send a new message.',
    finished_at = ? WHERE workspace_id = ? AND invoice_row_id = ? AND status = 'running' AND expires_at <= ?`)
    .run(nowIso(), workspaceId, invoiceId, nowIso());
}
export function getInvestigation(db: Database.Database, ctx: AuthContext, selection: Selection) {
  const data = selectedReview(db, ctx, selection);
  expireRuns(db, ctx.workspace!.id, selection.invoiceRowId);
  const scope = [ctx.workspace!.id, selection.batchId, selection.invoiceRowId];
  const runs = db.prepare(`SELECT id, question, response, status, model, events_json, created_at, expires_at FROM agent_runs
    WHERE workspace_id = ? AND batch_id = ? AND invoice_row_id = ? ORDER BY created_at DESC LIMIT 30`).all(...scope) as AgentRun[];
  const proposals = db.prepare(`SELECT * FROM agent_proposals WHERE workspace_id = ? AND batch_id = ? AND invoice_row_id = ?
    ORDER BY created_at DESC LIMIT 50`).all(...scope) as AgentProposal[];
  const cited = new Set(proposals.flatMap((p) => JSON.parse(p.evidence_json) as string[]));
  const evidence = [
    { id: data.invoice.id, label: `Invoice ${data.invoice.invoiceId}`, source: `${data.invoice.sourceFile} · row ${data.invoice.sourceRow}`, values: data.invoice.originalValues },
    ...data.payments.filter((p) => cited.has(p.id)).map((p) => ({ id: p.id, label: `Payment ${p.paymentId}`, source: `${p.sourceFile} · row ${p.sourceRow}`, values: p.originalValues })),
  ];
  return { runs: runs.reverse(), proposals, evidence };
}
export const decisionSchema = z.object({
  proposalId: z.string().min(1).max(120), decision: z.enum(["confirm", "reject"]),
  reviewed: z.literal(true), amount: z.string().min(1).max(40).optional(), note: z.string().max(1000).default(""),
}).strict();
export function decideProposal(db: Database.Database, ctx: AuthContext, selection: Selection, raw: unknown) {
  const input = decisionSchema.parse(raw);
  return db.transaction(() => {
    const data = selectedReview(db, ctx, selection);
    const p = db.prepare(`SELECT * FROM agent_proposals WHERE id = ? AND workspace_id = ? AND batch_id = ? AND invoice_row_id = ?`)
      .get(input.proposalId, ctx.workspace!.id, selection.batchId, selection.invoiceRowId) as AgentProposal | undefined;
    if (!p) throw new AuthError(404, "Proposal not found.");
    if (p.status !== "pending") throw new AuthError(409, "This proposal has already been reviewed.");
    let allocationId: string | null = null;
    if (input.decision === "confirm") {
      const payment = data.payments.find((row) => row.id === p.payment_row_id);
      if (p.snapshot !== evidenceSnapshot(data.invoice, payment))
        throw new AuthError(409, "Balances changed since this proposal. Investigate again before confirming.");
      if (payment && payment.currency !== data.invoice.currency) throw new AuthError(400, "Currency does not match.");
      const result = performReview(db, ctx, ctx.workspace!.id, selection.batchId, selection.invoiceRowId,
        payment ? { action: "manual_allocate", paymentRowId: payment.id,
          amount: input.amount ?? minorToDecimalString(p.amount_minor!, data.invoice.currency),
          note: `Agent proposal ${p.id}. ${input.note}` } : { action: "leave_unresolved", note: `Agent proposal ${p.id}. ${input.note}` });
      allocationId = result.allocationId ?? null;
    }
    db.prepare(`UPDATE agent_proposals SET status = ?, decided_at = ?, decided_by_user_id = ?, allocation_id = ?, decision_note = ?, decided_amount_minor = ? WHERE id = ?`)
      .run(input.decision === "confirm" ? "confirmed" : "rejected", nowIso(), ctx.user!.id, allocationId, input.note, allocationId ? (db.prepare("SELECT amount_minor FROM allocations WHERE id = ?").get(allocationId) as { amount_minor: number }).amount_minor : null, p.id);
    return { message: input.decision === "confirm" ? "Proposal confirmed and decision recorded in review history." : "Proposal rejected. No allocation was made.", allocationId };
  }).immediate();
}

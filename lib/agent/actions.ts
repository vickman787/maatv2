import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { AuthError, type AuthContext } from "../auth";
import { getReviewData } from "../review";
import { newId, nowIso } from "../db";
import type { InvoiceView, PaymentView } from "../batches";

export type Selection = { batchId: string; invoiceRowId: string };
export const invoiceSchema = z.object({}).strict();
export const candidateSchema = z.object({ search: z.string().max(120).default(""), offset: z.number().int().min(0).max(5000).default(0) }).strict();
const proposalSchema = z.object({
  paymentRowId: z.string().min(1).max(120).nullable().describe("Eligible payment row ID, or null for unresolved"),
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().describe("Integer minor currency units; null when unresolved"),
  rationale: z.string().min(1).max(2000),
  evidenceRowIds: z.array(z.string().min(1).max(120)).min(1).max(21),
  assumptions: z.array(z.string().max(400)).max(8),
  unresolvedQuestions: z.array(z.string().max(400)).max(8),
}).strict();

export function assertAgentAccess(db: Database.Database, ctx: AuthContext) {
  if (!ctx.user || !ctx.workspace || !db.prepare("SELECT 1 FROM memberships WHERE user_id = ? AND workspace_id = ?")
    .get(ctx.user.id, ctx.workspace.id)) throw new AuthError(403, "Workspace access is required.");
  return ctx.workspace.id;
}
export function selectedReview(db: Database.Database, ctx: AuthContext, selection: Selection) {
  const data = getReviewData(db, assertAgentAccess(db, ctx), selection.batchId, selection.invoiceRowId);
  if (!data) throw new AuthError(404, "Invoice not found in this workspace and batch.");
  if (data.overview.job && !["completed", "failed"].includes(data.overview.job.status))
    throw new AuthError(409, "Wait for reconciliation to finish before investigating.");
  return data;
}
export function evidenceSnapshot(invoice: InvoiceView, payment?: PaymentView) {
  return createHash("sha256").update(JSON.stringify({
    invoice: [invoice.id, invoice.currency, invoice.amountMinor, invoice.outstandingMinor, invoice.allocations.map((a) => a.id).sort()],
    payment: payment ? [payment.id, payment.currency, payment.amountMinor, payment.remainingMinor, payment.allocatedMinor] : null,
  })).digest("hex");
}

// Keep model context bounded while preserving full original rows in the review UI.
function sourcePreview(values: Record<string, string>) {
  return Object.fromEntries(Object.entries(values).slice(0, 8).map(([key, value]) => [key.slice(0, 120), value.slice(0, 200)]));
}
// Each factory is bound to server-owned identity and selected row, never model-supplied scope.
export function createInvestigationActions(db: Database.Database, ctx: AuthContext, selection: Selection, runId?: string) {
  let inspectedInvoice = false;
  const inspectedPayments = new Set<string>();
  const readInvoice = defineAction({
    description: "Read the selected invoice, original source row, balances, rule suggestions, saved proposals and review history.",
    schema: invoiceSchema, readOnly: true,
    run: async () => {
      const data = selectedReview(db, ctx, selection);
      inspectedInvoice = true;
      const proposals = db.prepare(`SELECT id, payment_row_id, amount_minor, rationale, evidence_json,
        assumptions_json, questions_json, status, decided_amount_minor, decision_note FROM agent_proposals
        WHERE workspace_id = ? AND batch_id = ? AND invoice_row_id = ? ORDER BY created_at DESC LIMIT 5`)
        .all(ctx.workspace!.id, selection.batchId, selection.invoiceRowId);
      return { proposals, invoice: { ...data.invoice, originalValues: sourcePreview(data.invoice.originalValues), sourcePreviewOnly: true, allocations: data.invoice.allocations.slice(0, 20) }, suggestions: data.suggestions.slice(0, 20).map((s) => ({ id: s.id, type: s.type,
        status: s.status, paymentRowId: s.payment_row_id, reason: s.rule_reason })),
        history: data.history.slice(0, 20).map((e) => ({ action: e.action, note: e.note, createdAt: e.created_at })) };
    },
  });
  const listCandidates = defineAction({
    description: "Search eligible unallocated payments in this batch. Returns source rows and differences in minor units. Paginate with offset.",
    schema: candidateSchema, readOnly: true,
    run: async ({ search, offset }) => {
      const { invoice, payments } = selectedReview(db, ctx, selection);
      const eligible = payments.filter((p) => p.currency === invoice.currency && p.remainingMinor > 0 && p.allocatedMinor === 0)
        .filter((p) => `${p.paymentId} ${p.payerName} ${p.reference ?? ""}`.toLowerCase().includes(search.toLowerCase()));
      const rows = eligible.slice(offset, offset + 20);
      rows.forEach((p) => inspectedPayments.add(p.id));
      return { total: eligible.length, nextOffset: offset + rows.length < eligible.length ? offset + rows.length : null,
        candidates: rows.map((p) => ({ ...p, originalValues: sourcePreview(p.originalValues), sourcePreviewOnly: true, differenceMinor: invoice.outstandingMinor - p.remainingMinor })) };
    },
  });
  const propose = defineAction({
    description: "Save a proposal using inspected evidence for human review. NEVER allocates. Null payment and amount recommend leaving unresolved. State assumptions and unanswered questions.",
    schema: proposalSchema,
    run: async (input) => {
      const data = selectedReview(db, ctx, selection);
      if (!runId || !db.prepare("SELECT 1 FROM agent_runs WHERE id = ? AND workspace_id = ? AND batch_id = ? AND invoice_row_id = ? AND status = 'running' AND expires_at > ?")
        .get(runId, ctx.workspace!.id, selection.batchId, selection.invoiceRowId, nowIso()))
        throw new AuthError(409, "An active investigation is required to save a proposal.");
      if (!inspectedInvoice) throw new AuthError(400, "Read the invoice before proposing a decision.");
      const payment = input.paymentRowId ? data.payments.find((p) => p.id === input.paymentRowId) : undefined;
      if (input.paymentRowId && (!payment || !inspectedPayments.has(payment.id) || payment.currency !== data.invoice.currency || payment.allocatedMinor !== 0 || payment.remainingMinor <= 0))
        throw new AuthError(400, "Choose an inspected, eligible payment in this batch.");
      if (payment ? input.amountMinor === null || input.amountMinor > Math.min(payment.remainingMinor, data.invoice.outstandingMinor) : input.amountMinor !== null)
        throw new AuthError(400, "Proposal amount does not fit current balances.");
      const allowed = new Set([data.invoice.id, ...inspectedPayments]);
      if (!input.evidenceRowIds.includes(data.invoice.id) || (payment && !input.evidenceRowIds.includes(payment.id)) || input.evidenceRowIds.some((id) => !allowed.has(id)))
        throw new AuthError(400, "Evidence must reference the selected invoice and inspected payment rows.");
      const id = newId();
      db.prepare(`INSERT INTO agent_proposals (id, run_id, workspace_id, batch_id, invoice_row_id, payment_row_id,
        amount_minor, rationale, evidence_json, assumptions_json, questions_json, snapshot, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, runId, ctx.workspace!.id,
        selection.batchId, selection.invoiceRowId, payment?.id ?? null, input.amountMinor, input.rationale,
        JSON.stringify(input.evidenceRowIds), JSON.stringify(input.assumptions), JSON.stringify(input.unresolvedQuestions),
        evidenceSnapshot(data.invoice, payment), nowIso());
      return { proposalId: id, status: "pending", message: "Proposal saved. No allocation was made." };
    },
  });
  return { read_invoice: readInvoice, list_candidates: listCandidates, propose_decision: propose };
}

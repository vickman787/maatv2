import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Sparkles,
  UserCheck,
  Wand2,
} from "lucide-react";
import { requireWorkspaceContext } from "@/lib/auth";
import { getReviewData } from "@/lib/review";
import { getDb } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { AgentInvestigator } from "@/components/AgentInvestigator";
import { getInvestigation } from "@/lib/agent/store";
import { aiConfig } from "@/lib/config";
import { ReviewForm } from "@/components/ReviewForm";
import { Stepper } from "@/components/Stepper";
import { ReviewFlag, StatusPill } from "@/components/StatusPill";

export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const ACTION_LABEL: Record<string, string> = {
  confirm_partial: "Suggests a partial confirmation",
  keep_unresolved: "Suggests keeping it unresolved",
  review_manually: "Suggests manual review",
};

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string; invoiceId: string }>;
}) {
  const ctx = await requireWorkspaceContext();
  const { id, invoiceId } = await params;
  const db = getDb();
  const data = getReviewData(db, ctx.workspace.id, id, invoiceId);
  if (!data) notFound();
  const { overview, invoice, payments, suggestions, history } = data;
  const batch = overview.batch;
  const suggestion = suggestions.find((row) => row.status === "pending") ?? suggestions[0] ?? null;
  const candidatePayment = suggestion?.payment_row_id
    ? overview.payments.find((payment) => payment.id === suggestion.payment_row_id)
    : invoice.allocations[0]
      ? overview.payments.find((payment) => payment.id === invoice.allocations[0]!.paymentRowId)
      : undefined;

  const evidenceIds = (() => {
    if (!suggestion?.ai_evidence_json) return [];
    try {
      const ids = JSON.parse(suggestion.ai_evidence_json) as string[];
      return ids.map((rowId) => {
        if (rowId === invoice.id) return { id: rowId, label: `Invoice ${invoice.invoiceId}` };
        const payment = overview.payments.find((row) => row.id === rowId);
        return { id: rowId, label: payment ? `Payment ${payment.paymentId}` : "Referenced source row" };
      });
    } catch {
      return [];
    }
  })();

  const confirmAmount = candidatePayment
    ? Math.min(suggestion?.allocation_amount_minor ?? candidatePayment.remainingMinor, candidatePayment.remainingMinor, invoice.outstandingMinor)
    : 0;
  const outstandingAfter = Math.max(0, invoice.outstandingMinor - confirmAmount);

  const eligiblePayments = payments
    .filter((payment) => payment.remainingMinor > 0 && payment.allocatedMinor === 0)
    .map((payment) => ({
      id: payment.id,
      paymentId: payment.paymentId,
      payerName: payment.payerName,
      currency: payment.currency,
      remainingMinor: payment.remainingMinor,
      reference: payment.reference,
      paidAt: payment.paidAt,
      sourceFile: payment.sourceFile,
      sourceRow: payment.sourceRow,
      originalValues: payment.originalValues,
    }));

  return (
    <>
      <div className="breadcrumb">
        <Link href="/dashboard">Workspace</Link>
        <span className="sep">/</span>
        <Link href="/batches">Reconciliations</Link>
        <span className="sep">/</span>
        <Link href={`/batches/${id}`}>{batch.name}</Link>
        <span className="sep">/</span>
        {invoice.invoiceId}
      </div>
      <div className="page-header">
        <div>
          <h1>Review the difference.</h1>
          <p>Inspect the evidence, then choose how to record this payment.</p>
        </div>
        <div className="page-actions">
          <StatusPill status={invoice.status} />
          <Link href={`/batches/${id}`} className="button secondary small-button">
            <ArrowLeft size={14} /> Back to batch
          </Link>
        </div>
      </div>
      <Stepper current={2} />
      <div className="row" style={{ flexWrap: "wrap", marginBottom: "1rem" }}>
        {overview.files.map((file) => <a className="text-link" key={file.id}
          href={`/api/batches/${id}/files/${file.id}`} download>
          Download original {file.originalFilename}
        </a>)}
      </div>

      <AgentInvestigator key={invoice.id} batchId={id} invoiceRowId={invoice.id} invoiceLabel={invoice.invoiceId}
        currency={invoice.currency} initial={{ ...getInvestigation(db, ctx, { batchId: id, invoiceRowId: invoice.id }), configured: aiConfig().configured }}
        />
      <div className="review-grid">
        <div className="stack">
          <section className="panel">
            <div className="section-title">
              <h2>Invoice evidence</h2>
              <span className="source-tag">
                {invoice.sourceFile} · row {invoice.sourceRow}
              </span>
            </div>
            <div className="document-head">
              <div>
                <div className="eyebrow">{invoice.customerName}</div>
                <h2>Invoice {invoice.invoiceId}</h2>
              </div>
              <div className="invoice-total">
                {formatMoney(invoice.amountMinor, invoice.currency)}
                <small>{invoice.currency} · amount due</small>
              </div>
            </div>
            <dl className="facts">
              <dt>Customer</dt>
              <dd>{invoice.customerName}</dd>
              <dt>Invoice reference</dt>
              <dd>{invoice.invoiceId}</dd>
              <dt>Due date</dt>
              <dd>{formatDate(invoice.dueDate)}</dd>
              <dt>Normalized amount</dt>
              <dd>{formatMoney(invoice.amountMinor, invoice.currency)} {invoice.currency}</dd>
              <dt>Confirmed allocated</dt>
              <dd>{formatMoney(invoice.allocatedMinor, invoice.currency)}</dd>
              <dt>Outstanding now</dt>
              <dd className={invoice.outstandingMinor > 0 ? "amber-text" : ""}>
                {formatMoney(invoice.outstandingMinor, invoice.currency)}
              </dd>
            </dl>
            <details style={{ marginTop: "1rem" }}>
              <summary>Original invoice CSV row</summary>
              <dl className="facts">{Object.entries(invoice.originalValues).map(([column, value]) => (
                <div key={column}><dt>{column}</dt><dd style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{value}</dd></div>
              ))}</dl>
            </details>
            <div className="review-flag" style={{ marginTop: "0.6rem" }}>
              <ReviewFlag state={invoice.reviewState} />
            </div>
          </section>

          <section className="panel">
            <div className="section-title">
              <h2>{candidatePayment ? "Candidate payment" : "No candidate payment"}</h2>
              {candidatePayment && (
                <span className="source-tag">
                  {candidatePayment.sourceFile} · row {candidatePayment.sourceRow}
                </span>
              )}
            </div>
            {candidatePayment ? (
              <>
                <dl className="facts">
                  <dt>Payment ID</dt>
                  <dd>{candidatePayment.paymentId}</dd>
                  <dt>Payer</dt>
                  <dd>{candidatePayment.payerName}</dd>
                  <dt>Payment reference</dt>
                  <dd>{candidatePayment.reference ?? "No reference"}</dd>
                  <dt>Amount received</dt>
                  <dd>{formatMoney(candidatePayment.amountMinor, candidatePayment.currency)} {candidatePayment.currency}</dd>
                  <dt>Paid on</dt>
                  <dd>{formatDate(candidatePayment.paidAt)}</dd>
                  <dt>Remaining on payment</dt>
                  <dd>{formatMoney(candidatePayment.remainingMinor, candidatePayment.currency)}</dd>
                </dl>
                <details style={{ marginTop: "1rem" }}>
                  <summary>Original candidate payment CSV row</summary>
                  <dl className="facts">{Object.entries(candidatePayment.originalValues).map(([column, value]) => (
                    <div key={column}><dt>{column}</dt><dd style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{value}</dd></div>
                  ))}</dl>
                </details>
                <div className="difference-line">
                  <span>Outstanding if assigned</span>
                  <strong>{formatMoney(outstandingAfter, invoice.currency)}</strong>
                </div>
                {candidatePayment.amountMinor > confirmAmount && (
                  <p className="field-hint" style={{ marginTop: "0.4rem" }}>
                    {formatMoney(candidatePayment.amountMinor - confirmAmount, candidatePayment.currency)} of this
                    payment would remain unallocated. Overpayments are never spread to another invoice.
                  </p>
                )}
              </>
            ) : (
              <p className="small muted">
                There is no single candidate for this invoice. You can choose any payment with a remaining
                balance, or leave the item unresolved.
              </p>
            )}
          </section>

          {invoice.allocations.length > 0 && (
            <section className="panel">
              <div className="section-title">
                <h2>Confirmed allocations</h2>
                <span className="pill">Human/system record</span>
              </div>
              <ul className="allocation-list">
                {invoice.allocations.map((allocation) => (
                  <li key={allocation.id}>
                    <span>
                      <b>{allocation.paymentId}</b> · {allocation.payerName}
                      <small className="muted" style={{ display: "block" }}>
                        {allocation.ruleReason ?? "Allocation recorded."}
                      </small>
                    </span>
                    <span className="amount">{formatMoney(allocation.amountMinor, invoice.currency)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {suggestion ? (
            <div className={`suggestion-box${suggestion.ai_status === "success" ? "" : " ai-unavailable"}`}>
              <div>
                <div className="eyebrow">
                  {suggestion.ai_status === "success"
                    ? <><Sparkles size={11} style={{ display: "inline", marginRight: 4 }} /> AI suggestion</>
                    : <><Wand2 size={11} style={{ display: "inline", marginRight: 4 }} /> Rule-based evidence</>}
                </div>
                <p>
                  <strong>System rule.</strong> {suggestion.rule_reason}
                </p>
                {suggestion.ai_status === "success" && suggestion.ai_explanation ? (
                  <>
                    <p style={{ marginTop: "0.6rem" }}>{suggestion.ai_explanation}</p>
                    {suggestion.ai_limitations && (
                      <p style={{ marginTop: "0.4rem", fontSize: "0.7rem" }}>
                        Limitations: {suggestion.ai_limitations}
                      </p>
                    )}
                    {suggestion.ai_action && (
                      <p style={{ marginTop: "0.4rem", fontSize: "0.7rem" }}>
                        <b>Suggested next step:</b> {ACTION_LABEL[suggestion.ai_action] ?? suggestion.ai_action}
                      </p>
                    )}
                    {evidenceIds.length > 0 && (
                      <p style={{ marginTop: "0.4rem", fontSize: "0.7rem" }}>
                        <b>Evidence rows:</b> {evidenceIds.map((row) => row.label).join(", ")}
                      </p>
                    )}
                    <div className="ai-meta">
                      <span>Provider: {suggestion.ai_provider}</span>
                      <span>Model: {suggestion.ai_model}</span>
                      <span>Prompt: {suggestion.ai_prompt_version}</span>
                      {suggestion.ai_status === "success" && <span>AI advice only—not an allocation.</span>}
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ marginTop: "0.6rem" }}>
                      AI explanation unavailable; showing rule-based evidence. The provider may be
                      unconfigured or temporarily unreachable.
                    </p>
                    <div className="ai-meta">
                      <span>
                        Provider: {suggestion.ai_status === "unavailable" ? "not configured" : suggestion.ai_provider}
                      </span>
                      {suggestion.ai_model && <span>Model: {suggestion.ai_model}</span>}
                      <span>Rule-based evidence remains available.</span>
                    </div>
                  </>
                )}
                <div className="ai-meta">
                  <span>Suggestion status: {suggestion.status.replace(/_/g, " ")}</span>
                  <span>No suggestion changes financial totals.</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="suggestion-box ai-unavailable">
              <div>
                <div className="eyebrow"><FileText size={11} style={{ display: "inline", marginRight: 4 }} /> System evidence</div>
                <p>No candidate suggestion is stored for this invoice. Choose a payment manually or leave it unresolved.</p>
              </div>
            </div>
          )}

          <section className="panel">
            <div className="section-title">
              <h2>Review history</h2>
              <span className="pill gray">{history.length} events</span>
            </div>
            {history.length === 0 ? (
              <p className="small muted">No decision saved yet.</p>
            ) : (
              <ul className="history-list">
                {history.map((event) => (
                  <li className="history-item" key={event.id}>
                    <b>
                      {event.action === "undo"
                        ? "Reversal recorded"
                        : event.action === "confirm" && event.actor_label === "Ma'at system rule"
                          ? "Automatic rule allocation"
                          : event.action === "confirm"
                            ? "Allocation confirmed"
                          : event.action === "reject"
                            ? "Suggestion rejected"
                            : event.action === "manual_allocate"
                              ? "Payment allocated manually"
                              : "Left unresolved"}
                    </b>
                    <p>
                      {event.actor_label}
                      {event.note ? ` — ${event.note}` : ""}
                    </p>
                    <span className="history-time">
                      {formatDateTime(event.created_at)}
                      {event.reverses_event_id ? " · reverses an earlier event" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="field-hint" style={{ marginTop: "0.6rem" }}>
              System evidence, AI suggestions, and human decisions are labelled separately. Nothing is
              erased when a decision is reversed.
            </p>
          </section>
        </div>

        <ReviewForm
          batchId={id}
          invoiceRowId={invoice.id}
          invoiceId={invoice.invoiceId}
          currency={invoice.currency}
          outstandingMinor={invoice.outstandingMinor}
          suggestion={
            suggestion
              ? {
                  id: suggestion.id,
                  type: suggestion.type,
                  status: suggestion.status,
                  paymentRowId: suggestion.payment_row_id,
                  allocationAmountMinor: suggestion.allocation_amount_minor,
                  ruleReason: suggestion.rule_reason,
                }
              : null
          }
          payments={eligiblePayments}
          allocations={invoice.allocations.map((allocation) => ({
            id: allocation.id,
            paymentId: allocation.paymentId,
            amountMinor: allocation.amountMinor,
            source: allocation.source,
            createdAt: allocation.createdAt,
          }))}
        />
      </div>

      <div className="row" style={{ marginTop: "1.4rem", color: "var(--muted)", fontSize: "0.72rem" }}>
        <UserCheck size={15} aria-hidden="true" />
        <span>Confirming a match is an accounting classification, not a bank transfer.</span>
        <span className="spacer" />
        <Link href={`/batches/${id}?filter=${invoice.status}`} className="text-link">
          Back to {invoice.status} invoices <ArrowRight size={12} />
        </Link>
      </div>
    </>
  );
}

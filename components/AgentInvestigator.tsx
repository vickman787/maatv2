"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, LoaderCircle, Send, Sparkles } from "lucide-react";
import { formatMoney, minorToDecimalString } from "@/lib/money";
import type { AgentProposal, AgentRun } from "@/lib/agent/store";

type Evidence = { id: string; label: string; source: string; values: Record<string, string> };
type State = { runs: AgentRun[]; proposals: AgentProposal[]; configured: boolean; evidence: Evidence[] };
type Props = { batchId: string; invoiceRowId: string; invoiceLabel: string; currency: string;
  initial: State };
function strings(raw: string): string[] { try { return JSON.parse(raw) as string[]; } catch { return []; } }

export function AgentInvestigator({ batchId, invoiceRowId, invoiceLabel, currency, initial }: Props) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const evidence = state.evidence;
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const endpoint = `/api/batches/${batchId}/agent`;
  const running = state.runs.some((run) => run.status === "running");
  useEffect(() => {
    if (!running && !busy) return;
    const controller = new AbortController();
    const interval = setInterval(() => {
      fetch(`${endpoint}?invoiceRowId=${encodeURIComponent(invoiceRowId)}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => { if (response.ok) setState(await response.json() as State); }).catch(() => {});
    }, 2500);
    return () => { clearInterval(interval); controller.abort(); };
  }, [running, busy, endpoint, invoiceRowId]);

  async function call(action: string, input: unknown) {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceRowId, action, input }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not complete this action.");
    return data;
  }
  async function refresh() {
    const response = await fetch(`${endpoint}?invoiceRowId=${encodeURIComponent(invoiceRowId)}`, { cache: "no-store" });
    if (response.ok) setState(await response.json() as State);
  }
  async function send(text: string) {
    if (busy || running) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await call("message", text);
      setState((s) => ({ ...s, ...data })); setQuestion("");
    } catch (e) { setError(e instanceof Error ? e.message : "Investigation failed."); }
    finally { setBusy(false); await refresh(); }
  }
  async function decide(proposalId: string, decision: "confirm" | "reject", amount: string | undefined, note: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await call("decide", { proposalId, decision, reviewed: true, amount, note });
      setState((s) => ({ ...s, ...data })); setNotice(data.message); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the decision."); }
    finally { setBusy(false); }
  }
  return (
    <section className="panel agent-investigator" aria-labelledby="investigator-title">
      <div className="section-title">
        <h2 id="investigator-title"><Bot size={18} aria-hidden="true" /> Investigate with Ma’at</h2>
        <span className="pill">{invoiceLabel} · selected invoice</span>
      </div>
      <p className="small muted">Ask about the difference, compare source rows, and review the agent’s proposals here. Confirming a proposal records your decision.</p>
      <div className="agent-workspace">
        <div className="stack">
          <div className="agent-conversation" aria-label="Investigation conversation" aria-live="polite" aria-busy={busy || running}>
            {state.runs.length === 0 && <div className="agent-empty"><Sparkles size={22} /><p>Start with the evidence.</p><span>Ma’at can inspect this invoice and eligible payments, explain differences, and prepare a proposal.</span></div>}
            {state.runs.map((run) => <div className="agent-turn" key={run.id}>
              <div className="agent-message user"><b>You</b><p>{run.question}</p></div>
              <div className="agent-message assistant"><b>Ma’at <span className="muted">· {run.model}</span></b>
                <p>{run.response ?? "Inspecting the evidence…"}</p>
                {run.status === "running" && <span className="small muted"><LoaderCircle className="spin" size={13} /> Investigation running</span>}
                <ToolEvents raw={run.events_json} />
                {run.status === "failed" && <span className="pill gray">Incomplete investigation</span>}
              </div>
            </div>)}
            {busy && !running && <p className="small muted" role="status"><LoaderCircle className="spin" size={14} /> Working…</p>}
          </div>
          {!state.configured && <p className="notice">AI investigation is unavailable until a tool-capable model is configured. Source evidence and manual review remain available.</p>}
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button type="button" className="button secondary small-button" disabled={!state.configured || busy || running}
              onClick={() => void send("Investigate this exception, compare eligible payments, and save an evidence-backed proposal for my review.")}>Investigate this exception</button>
            <button type="button" className="button secondary small-button" disabled={busy || running}
              onClick={async () => { try { const data = await call("read_invoice", {}); setNotice(`Current invoice evidence: ${data.invoice.invoiceId} has ${formatMoney(data.invoice.outstandingMinor, currency)} outstanding. Source: ${data.invoice.sourceFile}, row ${data.invoice.sourceRow}.`); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Could not load evidence."); } }}>Refresh invoice evidence</button>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); if (question.trim()) void send(question); }} className="agent-composer">
            <label htmlFor="agent-question">Continue the investigation</label>
            <textarea id="agent-question" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={2000}
              rows={3} placeholder="Why is this payment different? What evidence supports a partial match?" disabled={!state.configured || busy || running} />
            <button className="button small-button" type="submit" disabled={!state.configured || busy || running || !question.trim()}><Send size={14} /> Send</button>
          </form>
        </div>
        <div className="stack agent-proposals" aria-label="Agent proposals">
          <h3>Proposals for your review</h3>
          {state.proposals.length === 0 && <p className="small muted">The agent’s proposals will appear here with their evidence and unresolved questions.</p>}
          {state.proposals.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} currency={currency}
            evidence={evidence} disabled={busy || running} decide={decide} />)}
        </div>
      </div>
      {error && <p className="error-message" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
    </section>
  );
}
function ToolEvents({ raw }: { raw: string }) {
  let events: Array<{ tool: string; ok: boolean; message: string }> = [];
  try { events = JSON.parse(raw); } catch { return null; }
  if (!events.length) return null;
  return <details className="agent-tools"><summary>{events.length} shared action calls</summary><ol>{events.map((e, i) => <li key={i}>
    <code>{e.tool}</code> · {e.ok ? "Completed" : e.message}</li>)}</ol></details>;
}
function ProposalCard({ proposal: p, currency, evidence, disabled, decide }: {
  proposal: AgentProposal; currency: string; evidence: Evidence[]; disabled: boolean;
  decide: (id: string, decision: "confirm" | "reject", amount: string | undefined, note: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState(p.amount_minor ? minorToDecimalString(p.amount_minor, currency) : "");
  const [note, setNote] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const assumptions = strings(p.assumptions_json);
  const questions = strings(p.questions_json);
  const payment = evidence.find((row) => row.id === p.payment_row_id);
  return <article className="agent-proposal">
    <div className="section-title"><strong>{p.payment_row_id ? `Proposed ${formatMoney(p.amount_minor!, currency)}` : "Keep unresolved"}</strong><span className="pill gray">{p.status}</span></div>
    {payment && <p className="small"><b>{payment.label}</b> · {payment.source}</p>}
    <p>{p.rationale}</p>
    {p.decided_amount_minor !== null && p.decided_amount_minor !== undefined && <p><b>Confirmed amount: {formatMoney(p.decided_amount_minor, currency)}</b></p>}
    {p.decision_note && <p className="small">Review note: {p.decision_note}</p>}
    {assumptions.length > 0 && <div className="small"><b>Assumptions</b><ul>{assumptions.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
    {questions.length > 0 && <div className="small"><b>Unresolved questions</b><ul>{questions.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
    <details><summary>Inspect cited source rows</summary>{strings(p.evidence_json).map((id) => {
      const row = evidence.find((e) => e.id === id);
      return <div className="agent-evidence" key={id}><b>{row?.label ?? "Source row"}</b><p className="small muted">{row?.source ?? id}</p>
        {row && <dl className="facts">{Object.entries(row.values).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}</div>;
    })}</details>
    {p.status === "pending" && <div className="stack" style={{ marginTop: "0.8rem" }}>
      {p.payment_row_id && <label>Allocation amount ({currency})<input aria-label="Proposal allocation amount" value={amount} onChange={(e) => { setAmount(e.target.value); setReviewed(false); }} inputMode="decimal" disabled={disabled} /></label>}
      <label>Review note (optional)<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} disabled={disabled} /></label>
      <label className="agent-review-check"><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} disabled={disabled} />I reviewed the source rows, amount, and assumptions.</label>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className="button small-button" disabled={disabled || !reviewed || Boolean(p.payment_row_id && !amount)}
          onClick={() => void decide(p.id, "confirm", p.payment_row_id ? amount : undefined, note)}>Confirm {p.payment_row_id ? "allocation" : "unresolved decision"}</button>
        <button className="button secondary small-button" disabled={disabled || !reviewed} onClick={() => void decide(p.id, "reject", undefined, note)}>Reject proposal</button>
      </div>
    </div>}
  </article>;
}

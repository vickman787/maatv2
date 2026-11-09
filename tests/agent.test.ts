import { afterEach, describe, expect, it } from "vitest";
import type { AgentEngine, EngineEvent, EngineStreamOptions } from "@agent-native/core/agent/engine";
import { createInvestigationActions } from "../lib/agent/actions";
import { decideProposal, getInvestigation } from "../lib/agent/store";
import { investigate } from "../lib/agent/runtime";
import { getBatchOverview } from "../lib/batches";
import { newId, nowIso } from "../lib/db";
import { processQueuedJob } from "../lib/jobs";
import { performReview } from "../lib/review";
import { contextFor, createAccount, importFixture, makeDb } from "./helpers";

const databases: ReturnType<typeof makeDb>[] = [];
afterEach(() => { databases.splice(0).forEach((db) => db.close()); });
async function setup() {
  const db = makeDb(); databases.push(db);
  const account = createAccount(db);
  const ctx = contextFor(db, account.userId, account.workspaceId);
  const imported = importFixture(db, account.workspaceId);
  await processQueuedJob(db, imported.jobId);
  const overview = getBatchOverview(db, account.workspaceId, imported.batchId)!;
  const invoice = overview.invoices.find((row) => row.invoiceId === "INV-010")!;
  const payment = overview.payments.find((row) => row.paymentId === "P010")!;
  const selection = { batchId: imported.batchId, invoiceRowId: invoice.id };
  const input = { paymentRowId: payment.id, amountMinor: 100000, rationale: "The invoice reference matches; payment is short by 50000 minor units.",
    evidenceRowIds: [invoice.id, payment.id], assumptions: ["Reference identifies the intended invoice."], unresolvedQuestions: ["When will the remaining balance arrive?"] };
  return { db, account, ctx, imported, invoice, payment, selection, input };
}
function startRun(s: Awaited<ReturnType<typeof setup>>) {
  const id = newId();
  s.db.prepare(`INSERT INTO agent_runs (id, workspace_id, batch_id, invoice_row_id, user_id, question, status, model, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, 'Investigate', 'running', 'test', ?, ?)`).run(id, s.account.workspaceId, s.imported.batchId,
      s.invoice.id, s.account.userId, nowIso(), new Date(Date.now() + 120000).toISOString());
  return id;
}
async function proposal(s: Awaited<ReturnType<typeof setup>>) {
  const actions = createInvestigationActions(s.db, s.ctx, s.selection, startRun(s));
  await actions.read_invoice.run({});
  await actions.list_candidates.run({});
  return actions.propose_decision.run(s.input);
}
function engine(stream: (opts: EngineStreamOptions) => AsyncIterable<EngineEvent>): AgentEngine {
  return { name: "test-engine", label: "Test engine", defaultModel: "fixture-model", supportedModels: [],
    capabilities: { thinking: false, promptCaching: false, vision: false, computerUse: false, parallelToolCalls: true }, stream };
}

describe("Agent-Native investigation and human review", () => {
  it("shares validated evidence actions, computes current differences and refuses forged scope", async () => {
    const s = await setup();
    const actions = createInvestigationActions(s.db, s.ctx, s.selection);
    expect((await actions.read_invoice.run({})).invoice.id).toBe(s.invoice.id);
    const candidates = await actions.list_candidates.run({ search: "P010" });
    expect(candidates.candidates).toHaveLength(1);
    expect(candidates.candidates[0].differenceMinor).toBe(50000);
    await expect(actions.read_invoice.run({ workspaceId: "forged" } as never)).rejects.toThrow();
    const other = createAccount(s.db, "Other workspace");
    const outsider = contextFor(s.db, other.userId, other.workspaceId);
    await expect(createInvestigationActions(s.db, outsider, s.selection).read_invoice.run({})).rejects.toThrow("not found");
    s.db.prepare("DELETE FROM memberships WHERE user_id = ?").run(s.account.userId);
    await expect(actions.list_candidates.run({})).rejects.toThrow("Workspace access");
  });
  it("requires inspected evidence and rejects fabricated payment/evidence IDs and excessive amounts", async () => {
    const s = await setup();
    const actions = createInvestigationActions(s.db, s.ctx, s.selection, startRun(s));
    await expect(actions.propose_decision.run(s.input)).rejects.toThrow("Read the invoice");
    await actions.read_invoice.run({});
    await expect(actions.propose_decision.run(s.input)).rejects.toThrow("inspected");
    await actions.list_candidates.run({});
    await expect(actions.propose_decision.run({ ...s.input, evidenceRowIds: [s.invoice.id, s.payment.id, "fake"] })).rejects.toThrow("Evidence");
    await expect(actions.propose_decision.run({ ...s.input, amountMinor: 100001 })).rejects.toThrow("balances");
    await expect(actions.propose_decision.run({ ...s.input, paymentRowId: "other-batch" })).rejects.toThrow("eligible");
    await expect(actions.propose_decision.run({ ...s.input, amountMinor: 1.1 })).rejects.toThrow();
  });
  it("persists proposals without allocating, then accepts a human-edited amount once", async () => {
    const s = await setup();
    const before = getBatchOverview(s.db, s.account.workspaceId, s.imported.batchId)!.summary.confirmed_minor;
    const saved = await proposal(s);
    expect(getInvestigation(s.db, s.ctx, s.selection).proposals[0].id).toBe(saved.proposalId);
    const shared = await createInvestigationActions(s.db, s.ctx, s.selection).read_invoice.run({});
    expect(shared.proposals).toEqual([expect.objectContaining({ id: saved.proposalId, status: "pending" })]);
    expect(getBatchOverview(s.db, s.account.workspaceId, s.imported.batchId)!.summary.confirmed_minor).toBe(before);
    expect(() => decideProposal(s.db, s.ctx, s.selection, { proposalId: saved.proposalId, decision: "confirm", reviewed: false })).toThrow();
    const decision = { proposalId: saved.proposalId, decision: "confirm", reviewed: true, amount: "900.00", note: "Checked remittance." };
    const result = decideProposal(s.db, s.ctx, s.selection, decision);
    expect(result.allocationId).toBeTruthy();
    expect(getBatchOverview(s.db, s.account.workspaceId, s.imported.batchId)!.summary.confirmed_minor).toBe(before + 90000);
    expect(() => decideProposal(s.db, s.ctx, s.selection, decision)).toThrow("already been reviewed");
    const event = s.db.prepare("SELECT * FROM review_events WHERE allocation_id = ?").get(result.allocationId) as { note: string; actor_user_id: string };
    expect(event.note).toContain(saved.proposalId);
    expect(event.actor_user_id).toBe(s.account.userId);
  });
  it("rejects without changing balances and scopes proposal decisions to the selected invoice", async () => {
    const s = await setup(); const saved = await proposal(s);
    const other = createAccount(s.db);
    expect(() => decideProposal(s.db, contextFor(s.db, other.userId, other.workspaceId), s.selection,
      { proposalId: saved.proposalId, decision: "confirm", reviewed: true })).toThrow("not found");
    const before = s.db.prepare("SELECT COUNT(*) n FROM allocations").get();
    decideProposal(s.db, s.ctx, s.selection, { proposalId: saved.proposalId, decision: "reject", reviewed: true });
    expect(s.db.prepare("SELECT COUNT(*) n FROM allocations").get()).toEqual(before);
    expect(getInvestigation(s.db, s.ctx, s.selection).proposals[0].status).toBe("rejected");
  });
  it("refuses stale proposals after a concurrent review and keeps them pending", async () => {
    const s = await setup(); const saved = await proposal(s);
    performReview(s.db, s.ctx, s.account.workspaceId, s.imported.batchId, s.invoice.id,
      { action: "manual_allocate", paymentRowId: s.payment.id, amount: "500.00" });
    expect(() => decideProposal(s.db, s.ctx, s.selection, { proposalId: saved.proposalId, decision: "confirm", reviewed: true })).toThrow("Balances changed");
    expect(getInvestigation(s.db, s.ctx, s.selection).proposals[0].status).toBe("pending");
  });
  it("rolls back failed confirmation when the edited amount exceeds balances", async () => {
    const s = await setup(); const saved = await proposal(s);
    expect(() => decideProposal(s.db, s.ctx, s.selection,
      { proposalId: saved.proposalId, decision: "confirm", reviewed: true, amount: "2000.00" })).toThrow("exceeds");
    expect(getInvestigation(s.db, s.ctx, s.selection).proposals[0].status).toBe("pending");
  });
  it("records a human-confirmed unresolved proposal without an allocation", async () => {
    const s = await setup();
    const actions = createInvestigationActions(s.db, s.ctx, s.selection, startRun(s));
    await actions.read_invoice.run({});
    const saved = await actions.propose_decision.run({ ...s.input, paymentRowId: null, amountMinor: null, evidenceRowIds: [s.invoice.id] });
    const before = s.db.prepare("SELECT COUNT(*) n FROM allocations").get();
    decideProposal(s.db, s.ctx, s.selection, { proposalId: saved.proposalId, decision: "confirm", reviewed: true });
    expect(s.db.prepare("SELECT COUNT(*) n FROM allocations").get()).toEqual(before);
    expect(s.db.prepare("SELECT action FROM review_events WHERE invoice_row_id = ? ORDER BY rowid DESC LIMIT 1").get(s.invoice.id)).toEqual({ action: "leave_unresolved" });
  });
  it("orchestrates read, search and proposal tools across provider steps and carries follow-up history", async () => {
    const s = await setup(); let step = 0;
    const fake = engine(async function* (opts) {
      expect(opts.tools.map((t) => t.name)).toEqual(["read_invoice", "list_candidates", "propose_decision"]);
      expect(opts.tools[0].inputSchema.type).toBe("object");
      const sequence = [{ name: "read_invoice", input: {} }, { name: "list_candidates", input: {} }, { name: "propose_decision", input: s.input }];
      if (step < sequence.length) { yield { type: "tool-call", id: `t${step}`, ...sequence[step++] }; yield { type: "stop", reason: "tool_use" }; }
      else { yield { type: "text-delta", text: "Proposal saved for your review. No money allocated." }; yield { type: "stop", reason: "end_turn" }; }
    });
    const result = await investigate(s.db, s.ctx, s.selection, "Investigate this exception", fake);
    expect(result.runs[0].status).toBe("completed"); expect(result.proposals).toHaveLength(1);
    expect(JSON.parse(result.runs[0].events_json)).toHaveLength(3);
    await investigate(s.db, s.ctx, s.selection, "What assumptions did you make?", engine(async function* (opts) {
      expect(opts.messages[0].content).toEqual([{ type: "text", text: "Investigate this exception" }]);
      yield { type: "text-delta", text: "The earlier proposal assumes the reference identifies the invoice." }; yield { type: "stop", reason: "end_turn" };
    }));
    expect(getInvestigation(s.db, s.ctx, s.selection).runs).toHaveLength(2);
  });
  it("does not expose a confirmation tool and rejects attempts to invoke one", async () => {
    const s = await setup(); let step = 0;
    await investigate(s.db, s.ctx, s.selection, "Approve it", engine(async function* (opts) {
      if (!step++) { yield { type: "tool-call", id: "bad", name: "confirm_allocation", input: {} }; yield { type: "stop", reason: "tool_use" }; }
      else { expect(JSON.stringify(opts.messages)).toContain("not available"); yield { type: "text-delta", text: "Please confirm in the review controls." }; yield { type: "stop", reason: "end_turn" }; }
    }));
    expect(getInvestigation(s.db, s.ctx, s.selection).proposals).toHaveLength(0);
    expect(getBatchOverview(s.db, s.account.workspaceId, s.imported.batchId)!.summary.confirmed_minor).toBe(1350000);
  });
  it("persists provider failures, caps runaway tool loops and recovers expired run locks", async () => {
    const s = await setup();
    await expect(investigate(s.db, s.ctx, s.selection, "Investigate", engine(async function* () {
      yield { type: "stop", reason: "error", error: "secret provider diagnostics" };
    }))).rejects.toThrow("provider could not");
    expect(getInvestigation(s.db, s.ctx, s.selection).runs[0].response).not.toContain("secret");
    await expect(investigate(s.db, s.ctx, s.selection, "Loop", engine(async function* () {
      yield { type: "tool-call", id: "repeat", name: "read_invoice", input: {} }; yield { type: "stop", reason: "tool_use" };
    }))).rejects.toThrow("step limit");
    const id = startRun(s);
    await expect(investigate(s.db, s.ctx, s.selection, "Busy", engine(async function* () {}))).rejects.toThrow("already running");
    s.db.prepare("UPDATE agent_runs SET expires_at = '2000-01-01' WHERE id = ?").run(id);
    expect(getInvestigation(s.db, s.ctx, s.selection).runs.find((r) => r.id === id)?.status).toBe("failed");
  });

  it("runs the installed Agent-Native engine and provider adapter through a complete tool exchange", async () => {
    const s = await setup();
    const { createAISDKEngine } = await import("@agent-native/core/agent/engine");
    let requestCount = 0;
    const requests: Array<{ messages: Array<{ role: string }>; tools?: unknown[] }> = [];
    const provider = createAISDKEngine("openai", { model: "test-model", baseUrl: "https://provider.example.test/v1",
      apiKey: "test-only", allowEnvFallback: false, skipCredentialFailureTracking: true,
      requestFetch: async (_url: unknown, init: RequestInit) => {
        requests.push(JSON.parse(String(init.body)));
        const sequence = [{ name: "read_invoice", input: {} }, { name: "list_candidates", input: {} }, { name: "propose_decision", input: s.input }];
        const call = sequence[requestCount++];
        const delta = call ? { role: "assistant", tool_calls: [{ index: 0, id: `call-${requestCount}`, type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.input) } }] } : { role: "assistant", content: "A proposal is saved for human review." };
        const chunk = { id: "fixture-completion", object: "chat.completion.chunk", created: 1, model: "test-model",
          choices: [{ index: 0, delta, finish_reason: call ? "tool_calls" : "stop" }] };
        return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream" } });
      },
    });
    const result = await investigate(s.db, s.ctx, s.selection, "Inspect and propose", provider);
    expect(requestCount).toBe(4);
    expect(requests[0].tools).toHaveLength(3);
    expect(requests[1].messages.some((m) => m.role === "tool")).toBe(true);
    expect(result.proposals).toHaveLength(1);
    expect(result.runs[0].status).toBe("completed");
  }, 60000);

});

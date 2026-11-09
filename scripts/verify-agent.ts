import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { aiConfig } from "../lib/config";
import { openDatabase } from "../lib/db";
import { getBatchOverview } from "../lib/batches";
import { processQueuedJob } from "../lib/jobs";
import { investigate } from "../lib/agent/runtime";
import { contextFor, createAccount, importFixture } from "../tests/helpers";

async function main() {
  if (!aiConfig().configured) throw new Error("Set AI_BASE_URL, AI_API_KEY and a tool-capable AI_MODEL in .env.local before live agent verification.");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "maat-agent-check-"));
  const previousUploads = process.env.UPLOAD_DIR;
  process.env.UPLOAD_DIR = path.join(tempRoot, "uploads");
  const db = openDatabase(":memory:");
  try {
    const account = createAccount(db, "Isolated live agent verification");
    const imported = importFixture(db, account.workspaceId);
    // Reconciliation is deterministic here; this command verifies the agent provider only.
    const key = process.env.AI_API_KEY;
    process.env.AI_API_KEY = "";
    try { await processQueuedJob(db, imported.jobId); }
    finally { if (key === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = key; }
    const invoice = getBatchOverview(db, account.workspaceId, imported.batchId)!.invoices.find((i) => i.invoiceId === "INV-010")!;
    const result = await investigate(db, contextFor(db, account.userId, account.workspaceId),
      { batchId: imported.batchId, invoiceRowId: invoice.id },
      "Inspect this invoice and eligible payments, then save a proposal for human review. Do not allocate anything.");
    const run = result.runs.find((r) => r.id === result.runId)!;
    if (!result.proposals.length || run.status !== "completed") throw new Error("The live provider did not complete a proposal. Check tool-call support for AI_MODEL.");
    const totals = getBatchOverview(db, account.workspaceId, imported.batchId)!.summary;
    if (totals.confirmed_minor !== 1350000) throw new Error("Proposal unexpectedly changed confirmed totals.");
    console.log(JSON.stringify({ provider: "live configured provider", status: run.status, proposals: result.proposals.length,
      tools: (JSON.parse(run.events_json) as Array<{ tool: string; ok: boolean }>).map((e) => ({ tool: e.tool, ok: e.ok })),
      confirmedTotalsUnchanged: true }, null, 2));
  } finally {
    db.close();
    if (previousUploads === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = previousUploads;
    const resolved = path.resolve(tempRoot);
    if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("maat-agent-check-"))
      fs.rmSync(resolved, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Live agent verification failed."); process.exitCode = 1; });

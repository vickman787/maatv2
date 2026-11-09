import { expect, test } from "@playwright/test";
import { request as requestFactory } from "@playwright/test";
import fs from "node:fs";
import { openDatabase, newId, nowIso } from "../../lib/db";
import { createInvestigationActions } from "../../lib/agent/actions";
import { processQueuedJob } from "../../lib/jobs";
import { getBatchOverview } from "../../lib/batches";
import { contextFor, importFixture } from "../helpers";
import { createAccount, addSessionCookie } from "./helpers";

test("investigation evidence, proposal review, persistence, access boundaries and mobile layout", async ({ page, context }) => {
  const db = openDatabase();
  const account = createAccount(db, `Agent review QA ${Date.now()}`);
  const ctx = contextFor(db, account.userId, account.workspaceId);
  const imported = importFixture(db, account.workspaceId);
  await processQueuedJob(db, imported.jobId);
  const overview = getBatchOverview(db, account.workspaceId, imported.batchId)!;
  const invoice = overview.invoices.find((r) => r.invoiceId === "INV-010")!;
  const payment = overview.payments.find((r) => r.paymentId === "P010")!;
  const runId = newId();
  db.prepare(`INSERT INTO agent_runs (id, workspace_id, batch_id, invoice_row_id, user_id, question, response, status, model, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, 'Investigate this exception', NULL, 'running', 'test fixture', ?, ?)`)
    .run(runId, account.workspaceId, imported.batchId, invoice.id, account.userId, nowIso(), new Date(Date.now() + 120000).toISOString());
  const actions = createInvestigationActions(db, ctx, { batchId: imported.batchId, invoiceRowId: invoice.id }, runId);
  await actions.read_invoice.run({}); await actions.list_candidates.run({});
  const saved = await actions.propose_decision.run({ paymentRowId: payment.id, amountMinor: 100000,
    rationale: "The reference matches INV-010, with a 500.00 outstanding difference.",
    evidenceRowIds: [invoice.id, payment.id], assumptions: ["The reference is accurate."], unresolvedQuestions: ["When is the balance due?"] });
  db.prepare("UPDATE agent_runs SET status = 'completed', response = 'Proposal saved for human review.', finished_at = ? WHERE id = ?").run(nowIso(), runId);
  await addSessionCookie(context, account.token);
  const api = `/api/batches/${imported.batchId}/agent`;
  const url = `/batches/${imported.batchId}/review/${invoice.id}`;
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Investigate with Ma’at" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Investigate this exception", exact: true })).toBeDisabled();
  expect((await page.request.post(api, { data: { invoiceRowId: invoice.id, action: "message", input: "Investigate" } })).status()).toBe(503);
  const card = page.locator(".agent-proposal");
  await expect(card.getByText("Proposed $1,000.00")).toBeVisible();
  await expect(card.getByRole("button", { name: "Confirm allocation", exact: true })).toBeDisabled();
  await card.getByText("Inspect cited source rows", { exact: true }).click();
  await expect(card.getByText("Payment P010", { exact: true }).last()).toBeVisible();
  await expect(card.getByText("The reference is accurate.")).toBeVisible();
  await page.getByRole("button", { name: "Refresh invoice evidence" }).click();
  await expect(page.getByRole("status")).toContainText("invoice evidence");
  fs.mkdirSync("docs/screenshots", { recursive: true });
  await page.screenshot({ path: "docs/screenshots/agent-review-desktop.png", fullPage: true });
  await card.getByLabel("Proposal allocation amount").fill("900.00");
  await card.getByLabel("I reviewed the source rows, amount, and assumptions.").check();
  await card.getByRole("button", { name: "Confirm allocation", exact: true }).click();
  await expect(card.getByText("confirmed", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Proposal confirmed");
  expect(getBatchOverview(db, account.workspaceId, imported.batchId)!.summary.confirmed_minor).toBe(1440000);
  await page.reload();
  await expect(page.locator(".agent-proposal").getByText("confirmed", { exact: true })).toBeVisible();
  const replay = await page.request.post(api, { data: { invoiceRowId: invoice.id, action: "decide",
    input: { proposalId: saved.proposalId, decision: "confirm", reviewed: true } } });
  expect(replay.status()).toBe(409);
  const foreign = createAccount(db, "Other QA workspace");
  const foreignContext = await requestFactory.newContext({ baseURL: "http://localhost:3201", extraHTTPHeaders: { Cookie: `maatv2_session=${foreign.token}` } });
  expect((await foreignContext.get(`${api}?invoiceRowId=${invoice.id}`)).status()).toBe(404);
  await foreignContext.dispose();
  const anonymous = await requestFactory.newContext({ baseURL: "http://localhost:3201" });
  expect((await anonymous.get(`${api}?invoiceRowId=${invoice.id}`)).status()).toBe(401);
  await anonymous.dispose();
  expect((await page.request.post(api, { headers: { origin: "https://untrusted.example" }, data: { invoiceRowId: invoice.id, action: "message", input: "Approve" } })).status()).toBe(403);
  expect((await page.request.post(api, { data: { invoiceRowId: invoice.id, action: "read_invoice", input: { workspaceId: foreign.workspaceId } } })).status()).toBe(400);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Investigate with Ma’at" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "docs/screenshots/agent-review-mobile.png", fullPage: true });
  db.close();
});

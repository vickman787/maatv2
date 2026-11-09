import { expect, test } from "@playwright/test";
import { request as playwrightRequest } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { openDatabase } from "../../lib/db";
import { createAccount, addSessionCookie } from "./helpers";
import { importFixture } from "../helpers";
import { processQueuedJob } from "../../lib/jobs";
import { invoicesCsv, paymentsCsv } from "../fixtures/canonical";

async function prepareWorkspace(context: import("@playwright/test").BrowserContext) {
  const db = openDatabase();
  try {
    const account = createAccount(db, `Layout QA ${Date.now()}`);
    const imported = importFixture(db, account.workspaceId);
    await processQueuedJob(db, imported.jobId);
    await addSessionCookie(context, account.token);
  } finally { db.close(); }
}

test.describe.configure({ mode: "serial" });

test("login screen loads the Privy email modal without social or wallet options", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await page.getByRole("button", { name: /Continue with email/i }).click();
  await expect(page.getByText(/Use a one-time code sent to your email/i)).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Continue with Google/i)).toHaveCount(0);
  await expect(page.getByText(/Connect a wallet/i)).toHaveCount(0);
  await page.screenshot({ path: "docs/screenshots/00-login-1440.png", fullPage: true });
});

test("Guest sign-in, workflow explanation and signed-in homepage actions", async ({ page }) => {
  await page.goto("/");
  await page.locator(".landing-nav").getByRole("link", { name: "Sign in" }).click();
  await page.waitForURL(/\/login\?next=/);
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();

  await page.goto("/");
  await page.locator(".hero-actions").getByRole("link", { name: "How it works" }).click();
  await page.waitForURL("**/#workflow");
  await expect(page.getByRole("heading", { name: "From two CSVs to a defensible close." })).toBeInViewport();
  expect((await page.request.post("/api/demo/start")).status()).toBe(404);
});


test("private workspace walkthrough: review, confirm, export, undo, refresh, logout", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Know what's paid");
  await prepareWorkspace(context);
  await page.goto("/");
  await expect(page.locator(".landing-nav").getByRole("link", { name: /Open dashboard/ })).toBeVisible();
  await page.locator(".landing-nav").getByRole("link", { name: /Open dashboard/ }).click();

  await expect(page.getByRole("heading", { name: "Everything in balance." })).toBeVisible();
  await expect(page.getByText("$18,000").first()).toBeVisible();
  await expect(page.getByText("$16,500").first()).toBeVisible();
  await expect(page.getByText("9 / 12")).toBeVisible();
  await expect(page.getByText("2 payment rows totaling $3,000.00 remain unallocated.")).toBeVisible({ timeout: 30000 });

  await page.getByRole("link", { name: /Review exceptions/ }).click();
  await page.waitForURL(/\/batches\/[0-9a-f-]{36}$/);
  const batchUrl = page.url();
  const batchId = batchUrl.split("/").pop()!;

  await expect(page.getByText("9 exact matches")).toBeVisible({ timeout: 60000 });
  await expect(page.getByText("2 unassigned payment rows")).toBeVisible();
  await expect(page.getByText("$3,000")).toBeVisible();

  await page.getByRole("tab", { name: /Partial/ }).click();
  await page.waitForURL("**?filter=partial");
  await page.getByRole("row").filter({ hasText: "INV-010" }).getByRole("link", { name: /Review/ }).click();
  await page.waitForURL(/\/review\//);
  const reviewUrl = page.url();
  await expect(page.getByText("Invoice INV-010")).toBeVisible();
  await expect(page.getByText("AI explanation unavailable; showing rule-based evidence.")).toBeVisible();
  await expect(page.getByText("Outstanding if assigned")).toBeVisible();

  await page.locator('input[type="checkbox"]').check();
  await page.getByRole("button", { name: /Save confirmed allocation/ }).click();
  await expect(page.getByRole("status")).toContainText(/Allocation confirmed/i);
  await expect(page.getByText("$1,000.00").first()).toBeVisible();

  await page.goto(batchUrl);
  await expect(page.getByText("1 unassigned payment rows")).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("$2,000")).toBeVisible();
  await expect(page.getByText("$3,500")).toBeVisible();

  await page.getByRole("link", { name: /Export report/ }).click();
  await page.waitForURL(/\/report$/);
  await expect(page.getByText("$14,500").first()).toBeVisible();
  await expect(page.getByText("Payments not allocated")).toBeVisible();
  await expect(page.getByText(/INV-012/).first()).toBeVisible();
  await expect(page.getByText(/remain unallocated \(P011\)/)).toBeVisible();

  const exportResponse = await page.request.get(`/api/batches/${batchId}/export/invoices`);
  expect(exportResponse.status()).toBe(200);
  const csv = await exportResponse.text();
  expect(csv).toContain("invoice_id,customer_name");
  expect(csv).toContain("INV-010");
  expect(csv).toContain("1000.00,500.00");
  expect(csv.startsWith("'=")).toBe(false);

  const unallocatedResponse = await page.request.get(`/api/batches/${batchId}/export/unallocated`);
  const unallocatedCsv = await unallocatedResponse.text();
  expect(unallocatedCsv).toContain("P011");
  expect(unallocatedCsv).not.toContain("P010,");

  await page.goto(reviewUrl);
  await page.getByRole("button", { name: /^Undo$/ }).click();
  await page.getByRole("button", { name: /Confirm undo/ }).click();
  await expect(page.getByRole("status")).toContainText(/undone/i);
  await expect(page.getByText("Reversal recorded")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Review the difference." })).toBeVisible();
  await expect(page.getByText("Reversal recorded")).toBeVisible();

  await page.goto(batchUrl);
  await expect(page.getByText("2 unassigned payment rows")).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("$3,000")).toBeVisible();

  await page.goto("/dashboard");
  await page.getByLabel("Open profile menu").click();
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.waitForURL("http://localhost:3201/login");
  await context.clearCookies();
});

test("real CSV upload validates, matches, persists, and rejects cross-workspace access", async ({ page, context }) => {
  const db = openDatabase();
  const account = createAccount(db, `E2E Studio ${Date.now()}`);
  const other = createAccount(db, `Other E2E Studio ${Date.now()}`);
  db.close();

  await context.addCookies([
    {
      name: "maatv2_session",
      value: account.token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.goto("/batches/new");
  await page.getByLabel("Batch name").fill(`E2E batch ${Date.now()}`);
  await page.locator("#invoices-file").setInputFiles({name:"invoices-sample.csv",mimeType:"text/csv",buffer:Buffer.from(invoicesCsv())});
  await page.locator("#payments-file").setInputFiles({name:"payments-sample.csv",mimeType:"text/csv",buffer:Buffer.from(paymentsCsv())});
  await expect(page.getByText("invoices-sample.csv").first()).toBeVisible();
  await expect(page.getByText("payments-sample.csv").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Validate & match/ })).toBeEnabled();
  await page.getByRole("button", { name: /Validate & match/ }).click();
  await page.waitForURL(/\/batches\/[0-9a-f-]{36}$/, { timeout: 60000 });
  const batchId = page.url().split("/").pop()!;

  await expect(page.getByText("9 exact matches")).toBeVisible({ timeout: 90000 });
  await expect(page.getByText("3 pending review")).toBeVisible();
  await expect(page.getByText("2 unassigned payment rows")).toBeVisible();

  await page.reload();
  await expect(page.getByText("9 exact matches")).toBeVisible();
  await expect(page.getByText("INV-001").first()).toBeVisible();

  const otherContext = await playwrightRequest.newContext({
    baseURL: "http://localhost:3201",
    extraHTTPHeaders: { Cookie: `maatv2_session=${other.token}` },
  });
  const crossExport = await otherContext.get(`/api/batches/${batchId}/export/invoices`);
  expect([403, 404]).toContain(crossExport.status());
  const crossReview = await otherContext.post(`/api/batches/${batchId}/review`, {
    data: { action: "leave_unresolved", invoiceRowId: "any" },
  });
  expect([403, 404]).toContain(crossReview.status());
  for (const kind of ["invoices", "unallocated", "decisions"]) {
    expect([403,404]).toContain((await otherContext.get(`/api/batches/${batchId}/export/${kind}`)).status());
  }
  expect([403,404]).toContain((await otherContext.get(`/api/batches/${batchId}/status`)).status());
  for (const action of ["retry", "rerun"]) {
    expect([403,404]).toContain((await otherContext.post(`/api/batches/${batchId}/${action}`)).status());
  }
  expect([403,404]).toContain((await otherContext.delete(`/api/batches/${batchId}`)).status());
  const sourceDb = openDatabase();
  const sourceFile = sourceDb.prepare("SELECT id FROM source_files WHERE batch_id = ? LIMIT 1").get(batchId) as { id: string };
  sourceDb.close();
  expect([403,404]).toContain((await otherContext.get(`/api/batches/${batchId}/files/${sourceFile.id}`)).status());
  await otherContext.dispose();

  const ownContext = await playwrightRequest.newContext({
    baseURL: "http://localhost:3201",
    extraHTTPHeaders: { Cookie: `maatv2_session=${account.token}` },
  });
  const ownExport = await ownContext.get(`/api/batches/${batchId}/export/invoices`);
  expect(ownExport.status()).toBe(200);
  await ownContext.dispose();
});

test("upload validation shows exact row and column errors", async ({ page, context }) => {
  const db = openDatabase();
  const account = createAccount(db, `Validation Studio ${Date.now()}`);
  db.close();
  await context.addCookies([
    {
      name: "maatv2_session",
      value: account.token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/batches/new");
  await page.getByLabel("Batch name").fill("Invalid batch");
  await page.locator("#invoices-file").setInputFiles({
    name: "invoices-bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "invoice_id,customer_name,amount,currency,due_date\r\nINV-1,Acme,1500.00,USD,2026-11-05\r\nINV-1,Beta,1500.00,USD,2026-11-06\r\n",
    ),
  });
  await page.locator("#payments-file").setInputFiles({
    name: "payments-good.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "payment_id,payer_name,amount,currency,reference,paid_at\r\nP1,Acme,1500.00,USD,INV-1,2026-11-05\r\n",
    ),
  });
  await page.getByRole("button", { name: /Validate & match/ }).click();
  const summary = page.locator(".validation-summary");
  await expect(summary).toContainText("Duplicate invoice ID");
  await expect(summary).toContainText("row 2");
  await expect(summary).toContainText("invoice_id");
});

test("responsive layouts do not overflow and capture screenshots", async ({ page, context }) => {
  fs.mkdirSync(path.join(process.cwd(), "docs", "screenshots"), { recursive: true });
  for (const width of [1920, 1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    if (width >= 1024) {
      const actions = await page.locator(".hero-actions").boundingBox();
      expect(actions!.y + actions!.height).toBeLessThan(900);
    }
    await page.screenshot({ path: `docs/screenshots/01-landing-${width}.png`, fullPage: true });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".landing-nav").getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.locator(".hero-actions").getByRole("link", { name: "How it works" })).toBeVisible();
  await prepareWorkspace(context);
  await page.goto("/dashboard");
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(mobileOverflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "docs/screenshots/02-dashboard-390.png", fullPage: true });

  await page.getByRole("button", { name: "Open navigation" }).click();
  const drawer = page.getByRole("complementary", { name: "Mobile navigation" });
  await expect(drawer.getByRole("link", { name: "Settings" })).toBeVisible();
  await drawer.getByRole("button", { name: "Close navigation" }).click();
  await expect(drawer).toHaveCount(0);

  await page.goto("/batches");
  const mobileOverflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(mobileOverflow2).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "docs/screenshots/03-batches-390.png", fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard");
  await page.screenshot({ path: "docs/screenshots/04-dashboard-1440.png", fullPage: true });
  const batchLink = page.getByRole("link", { name: /Review exceptions/ });
  await batchLink.click();
  await page.waitForURL(/\/batches\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "November client payments" })).toBeVisible();
  await expect(page.getByText("9 exact matches")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/05-workbench-1440.png", fullPage: true });
  await page.getByRole("tab", { name: /Partial/ }).click();
  await page.getByRole("link", { name: /Review/ }).first().click();
  await page.waitForURL(/\/review\//);
  await page.screenshot({ path: "docs/screenshots/06-review-1440.png", fullPage: true });
  const reviewUrl = page.url();
  const batchBase = reviewUrl.replace(/\/review\/.*$/, "");
  await page.goto(`${batchBase}/report`);
  await page.screenshot({ path: "docs/screenshots/07-report-1440.png", fullPage: true });
  for (const width of [1920, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, url] of [
      ["dashboard", "/dashboard"],
      ["review", reviewUrl],
      ["report", `${batchBase}/report`],
    ]) {
      await page.goto(url);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${name} at ${width}px`).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `docs/screenshots/layout-${name}-${width}.png`, fullPage: true });
    }
  }
});








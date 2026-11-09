import { defineConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
} catch {
  // Tests can run with an explicit environment.
}

process.env.DATABASE_URL = "file:./data/e2e.db";
process.env.UPLOAD_DIR = "./data/e2e-uploads";
process.env.APP_URL = "http://localhost:3201";
process.env.AI_API_KEY = ""; // Browser regression fixtures use deterministic evidence; live AI is verified separately.

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 20000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3201",
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://localhost:3201/api/health",
    reuseExistingServer: false,
    timeout: 180000,
    env: {
      ...process.env,
      DATABASE_URL: "file:./data/e2e.db",
      UPLOAD_DIR: "./data/e2e-uploads",
      APP_URL: "http://localhost:3201",
    },
  },
});

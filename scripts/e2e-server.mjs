import { spawn } from "node:child_process";
import path from "node:path";

const nextBin = path.resolve("node_modules", "next", "dist", "bin", "next");
const tsxBin = path.resolve("node_modules", "tsx", "dist", "cli.mjs");

const children = [
  spawn(process.execPath, [nextBin, "start", "-p", "3201"], { stdio: "inherit" }),
  spawn(process.execPath, [tsxBin, "worker/main.ts"], { stdio: "inherit" }),
];

function shutdown() {
  for (const child of children) {
    child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(0), 500);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
for (const child of children) {
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[e2e-server] child exited with ${code}`);
    }
  });
}

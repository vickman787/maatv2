import crypto from "node:crypto";
import type Database from "better-sqlite3";
import { signSession } from "../../lib/session-token";

export function createAccount(db: Database.Database, name: string): { userId: string; workspaceId: string; token: string } {
  const userId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const now = new Date().toISOString();
  const suffix = crypto.randomUUID();
  db.prepare(
    "INSERT INTO users (id, privy_did, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(userId, `did:privy:e2e-${suffix}`, `e2e-${suffix}@example.com`, "E2E Owner", now, now);
  db.prepare(
    "INSERT INTO workspaces (id, name, owner_user_id, is_demo, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
  ).run(workspaceId, name, userId, now, now);
  db.prepare(
    "INSERT INTO memberships (id, workspace_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)",
  ).run(crypto.randomUUID(), workspaceId, userId, now);
  return {
    userId,
    workspaceId,
    token: signSession({ kind: "user", userId, workspaceId }),
  };
}

export async function addSessionCookie(
  context: import("@playwright/test").BrowserContext,
  token: string,
): Promise<void> {
  await context.addCookies([
    {
      name: "maatv2_session",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

import crypto from "node:crypto";
import type { Session } from "./types";
import { appUrl, env } from "./config";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEMO_TTL_SECONDS = 24 * 60 * 60;

function sessionSecret(): string {
  const secret = env("SESSION_SECRET");
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Generate one with `openssl rand -hex 32` and set it in the server environment.",
    );
  }
  return secret;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export type SignableSession =
  | { kind: "user"; userId: string; workspaceId: string | null; privyAccessToken?: string }
  | { kind: "demo"; workspaceId: string; demoSessionId: string };

export function signSession(payload: SignableSession, ttlSeconds?: number): string {
  const exp =
    Math.floor(Date.now() / 1000) +
    (ttlSeconds ?? (payload.kind === "demo" ? DEMO_TTL_SECONDS : SESSION_TTL_SECONDS));
  const body = b64url(JSON.stringify({ ...payload, exp, authVersion: payload.kind === "user" ? 2 : undefined }));
  const sig = crypto.createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): Session | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Session;
    if (!payload || typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (payload.kind === "user") {
      if (!payload.userId || !("authVersion" in payload) || payload.authVersion !== 2) return null;
      return payload;
    }
    if (payload.kind === "demo") {
      if (!payload.workspaceId || !payload.demoSessionId) return null;
      return payload;
    }
    return null;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "maatv2_session";

export function sessionCookieOptions(maxAgeSeconds?: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: appUrl().startsWith("https://"),
    path: "/",
    maxAge: maxAgeSeconds ?? SESSION_TTL_SECONDS,
  };
}

export function sessionExpirySeconds(session: Session): number {
  return Math.max(1, session.exp - Math.floor(Date.now() / 1000));
}




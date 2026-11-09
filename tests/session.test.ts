import { describe, expect, it } from "vitest";
import { signSession, verifySessionToken, SESSION_COOKIE } from "../lib/session-token";

describe("signed sessions", () => {
  it("round-trips a user session", () => {
    const token = signSession({ kind: "user", userId: "u1", workspaceId: "w1" }, 60);
    const parsed = verifySessionToken(token);
    expect(parsed).toMatchObject({ kind: "user", userId: "u1", workspaceId: "w1" });
    expect(SESSION_COOKIE).toBe("maatv2_session");
  });

  it("round-trips a demo session", () => {
    const token = signSession({ kind: "demo", workspaceId: "w2", demoSessionId: "d1" }, 60);
    expect(verifySessionToken(token)).toMatchObject({ kind: "demo", workspaceId: "w2", demoSessionId: "d1" });
  });

  it("rejects tampered and expired tokens", () => {
    const token = signSession({ kind: "user", userId: "u1", workspaceId: "w1" }, 60);
    expect(verifySessionToken(`${token}x`)).toBeNull();
    const expired = signSession({ kind: "user", userId: "u1", workspaceId: "w1" }, -10);
    expect(verifySessionToken(expired)).toBeNull();
    expect(verifySessionToken(undefined)).toBeNull();
  });
});

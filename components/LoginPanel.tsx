"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { ArrowRight, LoaderCircle, Mail, ShieldCheck } from "lucide-react";

export function LoginPanel({ nextPath = "/dashboard" }: { nextPath?: string }) {
  const router = useRouter();
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();
  const { identityToken } = useIdentityToken();
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [verifiedPath, setVerifiedPath] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const resettingRef = useRef(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const syncingRef = useRef(false);
  const syncController = useRef<AbortController | null>(null);
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  useEffect(() => {
    if (!ready || !authenticated || syncingRef.current || resettingRef.current) return;
    let cancelled = false;
    const controller = new AbortController();
    syncController.current = controller;
    async function sync() {
      syncingRef.current = true;
      setSyncing(true);
      setError(null);
      try {
        const token = await getAccessToken();
        if (cancelled || controller.signal.aborted) return;
        const response = await fetch("/api/auth/sync", {
          method: "POST",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
          headers: {
            Authorization: `Bearer ${token ?? ""}`,
            ...(identityToken ? { "privy-id-token": identityToken } : {}),
          },
        });
        const body = (await response.json()) as {
          error?: string;
          needsOnboarding?: boolean;
        };
        if (cancelled || controller.signal.aborted) return;
        if (!response.ok) {
          if (!cancelled) setError(body.error ?? "Sign-in could not be verified. Try again.");
          syncingRef.current = false;
          setSyncing(false);
          return;
        }
        const destination = body.needsOnboarding
          ? `/onboarding?next=${encodeURIComponent(nextPath)}`
          : nextPath;
        setVerifiedPath(destination);
        setSyncing(false);
        router.replace(destination);
      } catch {
        if (!cancelled && !controller.signal.aborted) {
          setError("The sign-in service could not be reached. Check your connection and retry.");
          syncingRef.current = false;
          setSyncing(false);
        }
      }
    }
    void sync();
    return () => {
      cancelled = true;
      controller.abort();
      syncingRef.current = false;
    };
  }, [ready, authenticated, getAccessToken, identityToken, router, retryNonce, nextPath]);

  async function restartSignIn() {
    resettingRef.current = true;
    syncController.current?.abort();
    setSyncing(false);
    setVerifiedPath(null);
    setResetting(true);
    setError(null);
    try {
      await logout();
      const response = await fetch("/api/auth/logout", { method: "POST", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("Session reset failed");
      window.location.reload();
    } catch {
      resettingRef.current = false;
      setResetting(false);
      setError("Could not reset sign-in. Check your connection and try again.");
    }
  }

  return (
    <div className="auth-card">
      <div className="eyebrow">Secure workspace</div>
      <h1>{nextPath === "/batches/new" ? "Start a reconciliation." : "Welcome back."}</h1>
      <p>
        {nextPath === "/batches/new"
          ? "Continue with email. If this is your first visit, name your workspace and we’ll take you straight to your source-file upload."
          : "Sign in with a six-digit one-time code. There is no password to remember, reset, or leak."}
      </p>

      {!appId && (
        <div className="auth-error" role="alert">
          Privy is not configured. Set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> before using sign-in.
        </div>
      )}

      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}

      {verifiedPath ? (
        <>
          <div className="form-note" role="status">Sign-in verified. Opening your workspace…</div>
          <Link href={verifiedPath} className="button wide" style={{ marginTop: "0.75rem" }}>
            Continue to workspace <ArrowRight size={15} />
          </Link>
        </>
      ) : syncing ? (
        <div className="form-note" role="status">
          <LoaderCircle size={16} className="spin" /> Verifying your Privy session with the server…
        </div>
      ) : authenticated ? (
        <button
          type="button"
          className="button wide"
          onClick={() => {
            syncingRef.current = false;
            setError(null);
            setRetryNonce((value) => value + 1);
          }}
          disabled={!ready || resetting}
        >
          Retry verification <ArrowRight size={15} />
        </button>
      ) : (
        <button type="button" className="button wide" onClick={() => login()} disabled={!ready || !appId}>
          <Mail size={15} /> {ready ? "Continue with email" : "Preparing sign-in…"}
        </button>
      )}

      {authenticated && (
        <button
          type="button"
          className="button secondary wide"
          style={{ marginTop: "0.75rem" }}
          onClick={() => void restartSignIn()}
          disabled={resetting}
        >
          <Mail size={15} /> {resetting ? "Resetting sign-in…" : "Sign in again / request a new code"}
        </button>
      )}

      <div className="auth-states">
        <div className="row" style={{ gap: "0.4rem", alignItems: "flex-start" }}>
          <ShieldCheck size={14} aria-hidden="true" />
          <span>The code expires. If it does not arrive, request a resend from the sign-in window.</span>
        </div>
        <div style={{ marginTop: "0.7rem" }}>
          Wrong or expired codes are rejected by Privy; no account is created until verification succeeds.
        </div>
      </div>

      <p className="small muted" style={{ marginTop: "1rem" }}>
        Signing in? After verification you&apos;ll name your business once. Ma&apos;at creates a private
        workspace; repeated sign-ins never create duplicates.
      </p>
    </div>
  );
}

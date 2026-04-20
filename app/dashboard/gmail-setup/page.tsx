"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { CheckCircle2, Copy, ExternalLink, KeyRound, RefreshCw, ShieldAlert } from "lucide-react";

interface GmailOAuthStartResponse {
  authUrl?: string;
  instructions?: string;
  error?: string;
}

interface GmailOAuthExchangeResponse {
  success?: boolean;
  message?: string;
  refresh_token?: string;
  access_token?: string;
  expiry_date?: number;
  error?: string;
}

export default function GmailSetupPage() {
  const [loading, setLoading] = useState(true);
  const [authUrl, setAuthUrl] = useState("");
  const [startError, setStartError] = useState("");
  const [instructions, setInstructions] = useState("");
  const [code, setCode] = useState("");
  const [exchangeLoading, setExchangeLoading] = useState(false);
  const [exchangeError, setExchangeError] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [expiryDate, setExpiryDate] = useState<number | null>(null);
  const [copyFeedback, setCopyFeedback] = useState("");

  useEffect(() => {
    let active = true;

    const loadAuthUrl = async () => {
      setLoading(true);
      setStartError("");

      try {
        const res = await fetch("/api/gmail-oauth");
        const data = await res.json() as GmailOAuthStartResponse;

        if (!active) return;

        if (!res.ok) {
          setStartError(data.error || "Failed to load Gmail OAuth setup");
          setAuthUrl("");
          setInstructions("");
          return;
        }

        setAuthUrl(data.authUrl || "");
        setInstructions(data.instructions || "");
      } catch (error) {
        if (!active) return;
        setStartError(error instanceof Error ? error.message : "Failed to load Gmail OAuth setup");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadAuthUrl();

    return () => {
      active = false;
    };
  }, []);

  const exchangeCode = async () => {
    if (!code.trim()) {
      setExchangeError("Paste the code you got back from Google first.");
      return;
    }

    setExchangeLoading(true);
    setExchangeError("");
    setRefreshToken("");
    setAccessToken("");
    setExpiryDate(null);
    setCopyFeedback("");

    try {
      const res = await fetch(`/api/gmail-oauth?code=${encodeURIComponent(code.trim())}`);
      const data = await res.json() as GmailOAuthExchangeResponse;

      if (!res.ok || !data.success) {
        setExchangeError(data.error || "Token exchange failed");
        return;
      }

      setRefreshToken(data.refresh_token || "");
      setAccessToken(data.access_token || "");
      setExpiryDate(data.expiry_date || null);
    } catch (error) {
      setExchangeError(error instanceof Error ? error.message : "Token exchange failed");
    } finally {
      setExchangeLoading(false);
    }
  };

  const copyRefreshToken = async () => {
    if (!refreshToken) return;

    try {
      await navigator.clipboard.writeText(refreshToken);
      setCopyFeedback("Refresh token copied.");
      window.setTimeout(() => setCopyFeedback(""), 2500);
    } catch {
      setCopyFeedback("Copy failed. Select the token manually.");
      window.setTimeout(() => setCopyFeedback(""), 2500);
    }
  };

  return (
    <div>
      <PageHeader
        title="Gmail Setup"
        description="Reconnect Gmail draft access and generate a fresh refresh token for annual return emails."
      />

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="space-y-5">
          <section className="rounded-[28px] border border-base bg-card p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-brand-300">
                  <KeyRound className="h-3.5 w-3.5" />
                  Gmail OAuth Recovery
                </div>
                <h2 className="text-xl font-semibold text-default">Reconnect Gmail compose access</h2>
                <p className="mt-2 max-w-2xl text-sm text-muted">
                  Use this page when Gmail draft creation says the OAuth token expired or was never configured.
                </p>
              </div>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn-secondary"
              >
                <RefreshCw className="h-4 w-4" />
                Reload Status
              </button>
            </div>

            {startError ? (
              <div className="mt-5 rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 h-5 w-5 text-rose-400" />
                  <div>
                    <p className="text-sm font-semibold text-default">Setup cannot start yet</p>
                    <p className="mt-1 text-sm text-muted">{startError}</p>
                    <p className="mt-2 text-xs text-faint">
                      Make sure `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, and `GMAIL_USER` are set, then reload this page.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <div className="rounded-2xl border border-base bg-surface/40 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">Step 1</div>
                    <div className="mt-2 text-sm font-semibold text-default">Open Google consent</div>
                    <p className="mt-1 text-sm text-muted">
                      Start the Gmail authorisation flow in a new tab and approve access with the Gmail account used for drafts.
                    </p>
                    <button
                      type="button"
                      onClick={() => window.open(authUrl, "_blank", "noopener,noreferrer")}
                      className="btn-primary mt-4 w-full"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open Google Authorisation
                    </button>
                  </div>

                  <div className="rounded-2xl border border-base bg-surface/40 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">Step 2</div>
                    <div className="mt-2 text-sm font-semibold text-default">Paste the returned code</div>
                    <p className="mt-1 text-sm text-muted">
                      After Google redirects you, copy the `code` value from the URL and paste it here.
                    </p>
                    <textarea
                      className="input-field mt-4 min-h-[110px] resize-none"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder="Paste the code from Google's redirect URL"
                    />
                    <button
                      type="button"
                      onClick={exchangeCode}
                      disabled={exchangeLoading}
                      className="btn-secondary mt-3 w-full"
                    >
                      <RefreshCw className={`h-4 w-4 ${exchangeLoading ? "animate-spin" : ""}`} />
                      {exchangeLoading ? "Exchanging..." : "Exchange Code"}
                    </button>
                  </div>

                  <div className="rounded-2xl border border-base bg-surface/40 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">Step 3</div>
                    <div className="mt-2 text-sm font-semibold text-default">Update the refresh token</div>
                    <p className="mt-1 text-sm text-muted">
                      Put the new token into `GMAIL_OAUTH_REFRESH_TOKEN`, then restart the app.
                    </p>
                    <div className="mt-4 rounded-xl border border-dashed border-base bg-card px-3 py-3 text-xs text-muted">
                      {instructions || "Open the Google authorisation link, approve access, then exchange the returned code here."}
                    </div>
                  </div>
                </div>

                {exchangeError && (
                  <div className="mt-5 rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-4">
                    <p className="text-sm font-semibold text-default">Token exchange failed</p>
                    <p className="mt-1 text-sm text-muted">{exchangeError}</p>
                  </div>
                )}

                {refreshToken && (
                  <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Token Ready
                        </div>
                        <p className="mt-3 text-sm font-semibold text-default">New refresh token generated</p>
                        <p className="mt-1 text-sm text-muted">
                          Replace `GMAIL_OAUTH_REFRESH_TOKEN` with this value and restart the Next.js app before retrying draft creation.
                        </p>
                        {expiryDate && (
                          <p className="mt-2 text-xs text-faint">
                            Access token expiry: {new Date(expiryDate).toLocaleString("en-IN")}
                          </p>
                        )}
                      </div>
                      <button type="button" onClick={copyRefreshToken} className="btn-secondary">
                        <Copy className="h-4 w-4" />
                        Copy Refresh Token
                      </button>
                    </div>

                    <textarea
                      readOnly
                      value={refreshToken}
                      className="input-field mt-4 min-h-[120px] resize-none font-mono text-xs"
                    />

                    {accessToken && (
                      <details className="mt-4 rounded-xl border border-base bg-card px-4 py-3">
                        <summary className="cursor-pointer text-sm font-medium text-default">Show access token details</summary>
                        <textarea
                          readOnly
                          value={accessToken}
                          className="input-field mt-3 min-h-[100px] resize-none font-mono text-xs"
                        />
                      </details>
                    )}

                    {copyFeedback && <p className="mt-3 text-xs text-muted">{copyFeedback}</p>}
                  </div>
                )}
              </>
            )}
          </section>

          <section className="rounded-[28px] border border-base bg-card p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-default">Why tokens usually expire here</h2>
            <div className="mt-3 space-y-2 text-sm text-muted">
              <p>1. The app was authorised with a Google OAuth consent screen still in testing mode.</p>
              <p>2. The Gmail account revoked access, changed its password, or the refresh token stopped being used long enough to be invalidated.</p>
              <p>3. A new refresh token replaced an older one and the older token is what this app still has in env.</p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

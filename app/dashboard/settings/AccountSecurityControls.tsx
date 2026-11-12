"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";

type Account = { email: string; loginId?: string; otpEmail?: string; emailVerified: boolean; twoFactorEnabled: boolean; isAdmin: boolean; recoveryEmail?: string; recentRecovery?: boolean };
type Action = "email" | "password" | "recovery_email" | "twofactor_on" | "twofactor_off" | "factor_email" | "recovery_codes";
const labels: Record<Action, string> = { email: "Change Email", password: "Change Password", recovery_email: "Change recovery Gmail", twofactor_on: "Enable two-factor authentication", twofactor_off: "Disable two-factor authentication", factor_email: "Recover email access", recovery_codes: "Replace recovery codes" };
const inputStyle = "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-default focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30";
const buttonStyle = "rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[#007AFF] hover:bg-[var(--color-hover)] disabled:opacity-40";

export default function AccountSecurityControls({ onChanged }: { onChanged: () => void }) {
  const { update } = useSession();
  const [account, setAccount] = useState<Account | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [challenge, setChallenge] = useState<{ challengeId: string; dual: boolean; recovery?: boolean } | null>(null);
  const [code, setCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [loadError, setLoadError] = useState("");

  async function load() {
    try {
      const response = await fetch("/api/settings/account-security", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load account security");
      setAccount(body); setLoadError("");
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Unable to load account security"); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const listener = () => start("password");
    window.addEventListener("account-security-password", listener);
    return () => window.removeEventListener("account-security-password", listener);
  }, []);
  useEffect(() => {
    if (!retryAt) return;
    const tick = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick(); const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  function start(next: Action) {
    setAction(next); setChallenge(null); setCode(""); setNewCode(""); setPassword(""); setEmail(""); setRecoveryCode("");
  }
  async function requestCode() {
    if (!action) return;
    setBusy(true);
    try {
      const response = await fetch("/api/settings/account-security", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, email, password, recoveryCode }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to send code");
      setChallenge(body); setPassword(""); setCode(""); setNewCode(""); setRetryAt(Date.now() + 60_000);
      toast.success("Verification code sent. Valid for 5 minutes.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to send code"); }
    finally { setBusy(false); }
  }
  async function verify() {
    if (!challenge) return;
    setBusy(true);
    try {
      const response = await fetch("/api/settings/account-security", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verify: true, challengeId: challenge.challengeId, code, newCode }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Verification failed");
      setCodes(body.recoveryCodes || []); setAction(null); setChallenge(null); setCode(""); setNewCode(""); setRecoveryCode("");
      toast.success("Account security updated. Other sessions have been signed out.");
      await load(); await update(); onChanged();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Verification failed"); }
    finally { setBusy(false); }
  }

  if (!account) return <div className="rounded-2xl border border-[var(--color-border)] bg-card p-4 text-sm text-muted">{loadError || "Loading account security…"}{loadError && <button className={`${buttonStyle} ml-2`} onClick={() => void load()}>Retry</button>}</div>;
  const needsEmail = action === "email" || action === "recovery_email" || action === "factor_email" || action === "twofactor_on" && !account.isAdmin && !account.email;
  return <div className="space-y-5">
    <section className="space-y-1.5" aria-label={account.isAdmin ? "Admin Account" : "My Account Security"}>
      <p className="px-1 text-[11px] font-medium uppercase tracking-wider text-faint">{account.isAdmin ? "Admin Account / Login Details" : "My Account Security"}</p>
      <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-card">
        <div className="space-y-3 p-4">
          <p className="break-all text-sm text-default">{account.isAdmin ? `Login ID: ${account.loginId || account.email || "Unknown"}` : account.email || "No email added"}</p>
          {account.isAdmin && <><p className="break-all text-xs text-muted">Recovery / security Gmail: {account.recoveryEmail || "Not configured — connect Gmail or configure AUTH_SECURITY_EMAIL"}</p><div className="flex flex-wrap gap-2"><button className={buttonStyle} onClick={() => start("email")}>Change Email</button><button className={buttonStyle} onClick={() => start("password")}>Change Password</button><button className={buttonStyle} onClick={() => start("recovery_email")}>Change recovery Gmail</button></div></>}
        </div>
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-4">
            <div><p className="text-[15px] font-medium text-default">Two-Factor Authentication</p><p className="mt-1 text-xs text-muted">{account.isAdmin ? `Verification codes go to your security Gmail${account.recoveryEmail ? `: ${account.recoveryEmail}` : ""}. Your login ID does not need a mailbox.` : "Email verification for your account at each website login, including Google."}</p></div>
            <button type="button" role="switch" aria-label="Two-Factor Authentication" aria-checked={account.twoFactorEnabled} disabled={busy || codes.length > 0} onClick={() => start(account.twoFactorEnabled ? "twofactor_off" : "twofactor_on")} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${account.twoFactorEnabled ? "bg-[#007AFF] text-white" : "bg-[var(--color-hover)] text-muted"}`}>{account.twoFactorEnabled ? "ON" : "OFF"}</button>
          </div>
          {account.twoFactorEnabled && <div className="flex flex-wrap gap-2"><button className={buttonStyle} onClick={() => start("recovery_codes")}>Replace recovery codes</button>{!account.isAdmin && <button className={buttonStyle} onClick={() => start("factor_email")}>Recover email access</button>}</div>}
          <p className="text-xs text-faint">Changes take effect only after verification. Keep recovery codes somewhere safe for lost email access.</p>
        </div>
        {action && <form className="space-y-3 p-4" onSubmit={event => { event.preventDefault(); void (challenge ? verify() : requestCode()); }}>
          <h3 className="text-sm font-semibold text-default">{labels[action]}</h3>
          {!challenge ? <>
            {needsEmail && <label className="block space-y-1 text-xs text-muted"><span>{action === "twofactor_on" ? "Your email" : "New email address"}</span><input className={inputStyle} type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>}
            {action === "password" && <label className="block space-y-1 text-xs text-muted"><span>New password (at least 12 characters)</span><input className={inputStyle} type="password" autoComplete="new-password" minLength={12} required value={password} onChange={event => setPassword(event.target.value)} /></label>}
            {action === "factor_email" && <label className="block space-y-1 text-xs text-muted"><span>{account.recentRecovery ? "Recovery code (optional within 5 minutes of recovery login)" : "One saved recovery code (used when requested)"}</span><input className={inputStyle} autoComplete="off" required={!account.recentRecovery} value={recoveryCode} onChange={event => setRecoveryCode(event.target.value)} /></label>}
            <p className="text-xs text-muted">{action === "factor_email" ? "Verify the replacement mailbox using a saved recovery code. This does not change your Google identity." : account.isAdmin ? ["email", "recovery_email"].includes(action) ? "We will verify your security Gmail and the new email address." : "We will send one verification code to your security Gmail, not your website login ID." : "We will send a verification code to your account email."}</p>
          </> : <>
            <p className="text-xs text-muted">Codes expire in 5 minutes. You have at most 5 attempts.</p>
            {!challenge.recovery && <label className="block space-y-1 text-xs text-muted"><span>{challenge.dual ? "Code sent to your existing security email" : account.isAdmin ? `Code sent to your security Gmail${account.recoveryEmail ? `: ${account.recoveryEmail}` : ""}` : "Email verification code"}</span><input className={inputStyle} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value)} /></label>}
            {(challenge.dual || challenge.recovery) && <label className="block space-y-1 text-xs text-muted"><span>{["twofactor_on", "twofactor_off", "recovery_codes"].includes(action) ? "Code sent to your account email" : "Code sent to your new email"}</span><input className={inputStyle} inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" maxLength={6} required value={challenge.dual ? newCode : code} onChange={event => challenge.dual ? setNewCode(event.target.value) : setCode(event.target.value)} /></label>}
          </>}
          <div className="flex flex-wrap gap-2"><button className="rounded-xl bg-[#007AFF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={busy || !challenge && seconds > 0}>{busy ? "Please wait…" : challenge ? "Verify & save" : seconds > 0 ? `Wait ${seconds}s` : "Send verification code"}</button>
            {challenge && action !== "password" && action !== "factor_email" && <button className={buttonStyle} type="button" disabled={busy || seconds > 0} onClick={() => void requestCode()}>{seconds > 0 ? `Resend in ${seconds}s` : "Resend code"}</button>}
            <button className={buttonStyle} disabled={busy} type="button" onClick={() => { setAction(null); setChallenge(null); setPassword(""); setRecoveryCode(""); }}>Cancel</button></div>
          {challenge && action === "password" && <p className="text-xs text-faint">To request a replacement code, cancel and re-enter the new password after the cooldown.</p>}
        </form>}
      </div>
    </section>
    {codes.length > 0 && <section className="space-y-3 rounded-2xl border border-amber-300 bg-card p-4" aria-label="Recovery codes"><h3 className="text-sm font-semibold text-default">Save your recovery codes</h3><p className="text-xs text-muted">Each code works once after your password or Google login. These codes are shown only once. Replacing codes invalidates the previous set.</p><div className="grid grid-cols-1 gap-1 font-mono text-sm text-default sm:grid-cols-2">{codes.map(value => <code key={value}>{value}</code>)}</div><div className="flex flex-wrap gap-2"><button className={buttonStyle} onClick={() => { void navigator.clipboard.writeText(codes.join("\n")).then(() => toast.success("Recovery codes copied")).catch(() => toast.error("Select and copy the codes manually")); }}>Copy codes</button><button className={buttonStyle} onClick={() => setCodes([])}>I have saved these codes</button></div></section>}
  </div>;
}

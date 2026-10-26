"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Check, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { GlassButton } from "@/components/ui/liquid-glass";
import type { ApprovalView } from "@/lib/email-delivery-security";

export function EmailSecurityProcessing({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="email-security-processing" role="status">
      <span className="email-security-dyes" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>{children}</span>
    </div>
  );
}
export function SecurityCodeInput({
  label,
  value,
  onChange,
  pin = false,
  disabled = false,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  pin?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const focused = useRef(false);
  const [caret, setCaret] = useState(0);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!autoFocus || disabled || (focused.current && document.activeElement !== document.body)) return;
    const frame = requestAnimationFrame(() => {
      if (!input.current?.isConnected || input.current.disabled) return;
      input.current.focus({ preventScroll: true });
      focused.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocus, disabled]);
  useEffect(() => {
    if (!value || disabled || !pin) setVisible(false);
  }, [value, disabled, pin]);
  return (
    <div
      className="email-security-code-label"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setVisible(false);
      }}
    >
      <div className="email-security-code-heading">
        <label htmlFor={id}>{label}</label>
        {pin && (
          <button
            type="button"
            className="email-security-pin-visibility"
            aria-label={`${visible ? "Hide" : "Show"} ${label}`}
            aria-controls={id}
            aria-pressed={visible}
            disabled={disabled}
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? (
              <EyeOff size={15} aria-hidden="true" />
            ) : (
              <Eye size={15} aria-hidden="true" />
            )}
            {visible ? "Hide" : "Show"}
          </button>
        )}
      </div>
      <span className="email-security-code-control">
        <input
          id={id}
          ref={input}
          aria-label={label}
          type={pin && !visible ? "password" : "text"}
          inputMode="numeric"
          autoComplete={pin ? "off" : "one-time-code"}
          pattern="[0-9]{6}"
          maxLength={6}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.value.replace(/\D/g, "").slice(0, 6));
            setCaret(event.target.selectionStart || 0);
          }}
          onSelect={(event) =>
            setCaret(event.currentTarget.selectionStart || 0)
          }
          onPaste={(event) => {
            event.preventDefault();
            onChange(
              event.clipboardData
                .getData("text")
                .replace(/\D/g, "")
                .slice(0, 6),
            );
            setCaret(6);
          }}
        />
        <span aria-hidden="true" className="email-security-code-cells">
          {Array.from({ length: 6 }, (_, index) => (
            <span
              key={index}
              data-caret={index === Math.min(5, caret) || undefined}
            >
              {value[index] ? (pin && !visible ? "•" : value[index]) : ""}
            </span>
          ))}
        </span>
      </span>
    </div>
  );
}
export function useSecurityClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  return now;
}
export function VerificationChallenge({
  challenge,
  busy,
  onVerify,
  onResend,
  error,
  processingAction,
  focusInput = false,
}: {
  challenge: ApprovalView;
  busy: boolean;
  onVerify: (values: { otp?: string; pin?: string }) => Promise<void>;
  onResend: () => Promise<void>;
  error?: string;
  processingAction?: "verify" | "resend";
  focusInput?: boolean;
}) {
  const [value, setValue] = useState("");
  const now = useSecurityClock();
  const previousExpiry = useRef(challenge.otpExpiresAt);
  const [resent, setResent] = useState(false);
  const next = challenge.methodsRequired.find(
    (method) => !challenge.methodsVerified.includes(method),
  );
  const otp = next === "emailOtp";
  const expires = Math.max(
    0,
    Math.ceil(
      (Date.parse(
        otp
          ? challenge.otpExpiresAt || challenge.expiresAt
          : challenge.expiresAt,
      ) -
        now) /
        1000,
    ),
  );
  const resend = Math.max(
    0,
    Math.ceil(
      (Date.parse(challenge.resendAvailableAt || "1970-01-01") - now) / 1000,
    ),
  );
  useEffect(() => {
    setValue("");
    if (previousExpiry.current !== challenge.otpExpiresAt) setResent(true);
    previousExpiry.current = challenge.otpExpiresAt;
  }, [next, challenge.otpExpiresAt]);
  if (!next)
    return (
      <p className="email-security-verified" role="status">
        <Check size={17} /> Identity verified
      </p>
    );
  return (
    <form
      className="email-security-verification"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.length === 6 && expires > 0 && !busy)
          void onVerify(otp ? { otp: value } : { pin: value }).finally(() =>
            setValue(""),
          );
      }}
    >
      <div className="email-security-method-heading">
        <ShieldCheck size={18} />
        <h4>{otp ? "Email verification" : "Send PIN"}</h4>
      </div>
      {otp && (
        <p role="status">
          We sent a six-digit code to{" "}
          <strong>{challenge.approvalEmailMasked}</strong>.
        </p>
      )}
      {otp && resent && <p role="status">New code sent</p>}
      {!otp && focusInput && challenge.methodsVerified.includes("emailOtp") && <p className="email-security-verified" role="status"><Check size={14} /> Email verified. Enter your Send PIN to complete authorization.</p>}
      <SecurityCodeInput
        label={otp ? "Verification code" : "Send PIN"}
        value={value}
        onChange={setValue}
        pin={!otp}
        disabled={busy}
        autoFocus={focusInput}
      />
      {error && <p className="email-security-error email-authorization-local-error" role="alert">{error}</p>}
      <p className="email-security-countdown" aria-live="off">
        {expires
          ? `${otp ? "Code" : "Authorization"} expires in ${Math.floor(expires / 60)}:${String(expires % 60).padStart(2, "0")}`
          : "Verification expired. Request a new approval."}
      </p>
      <div className="email-security-actions">
        <GlassButton
          disabled={busy || value.length !== 6 || !expires}
          type="submit"
          data-verifying={busy && processingAction === "verify" || undefined}
        >
          {busy && processingAction === "verify" ? <><span className="email-security-dyes" aria-hidden="true"><i /><i /><i /></span><span>Verifying {otp ? "code" : "PIN"}…</span></> : "Verify"}
        </GlassButton>
        {otp && (
          <GlassButton
            disabled={busy || resend > 0 || !expires}
            onClick={() => {
              setValue("");
              void onResend();
            }}
            data-verifying={busy && processingAction === "resend" || undefined}
          >
            {busy && processingAction === "resend" ? <><span className="email-security-dyes" aria-hidden="true"><i /><i /><i /></span><span>Sending code…</span></> : resend ? `Resend in ${resend}s` : "Resend code"}
          </GlassButton>
        )}
      </div>
    </form>
  );
}

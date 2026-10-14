"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { LoaderCircle, MailCheck, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import TrackerModal from "@/components/client-trackers/TrackerModal";
import LiquidGlassDropdown from "@/components/ui/LiquidGlassDropdown";
import { GlassButton } from "@/components/ui/liquid-glass";
import {
  EmailSecurityProcessing,
  SecurityCodeInput,
  useSecurityClock,
  VerificationChallenge,
} from "@/components/client-trackers/EmailSecurityControls";
import {
  EMAIL_DELIVERY_SECURITY_DEFAULTS,
  requiredDeliveryMethods,
  type ApprovalView,
  type DeliveryPolicy,
  type DeliverySecurityView,
} from "@/lib/email-delivery-security";
import {
  securityFetch,
  SecurityRequestError,
} from "@/lib/email-delivery-security-client";
import { EmailDeliverySettingsProvider, useEmailDeliverySettings, useOptionalEmailDeliverySettings } from "./EmailDeliverySettingsContext";
import { EmailDeliverySaveBar, EmailDeliverySaveStatus } from "./EmailDeliverySaveState";
type Activity = {
  _id: string;
  event: string;
  userEmail: string;
  createdAt: string;
  messageCount?: number;
  approvalMethod?: string;
  result?: string;
};
type Action = "policy" | "email" | "pin" | "remove-pin";
function SettingGroup({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="email-delivery-settings-group">
      <h3>{title}</h3>
      <div className="email-delivery-settings-card">{children}</div>
    </section>
  );
}
function SettingRow({
  title,
  description,
  children,
  modified = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  modified?: boolean;
}) {
  return (
    <div className="email-delivery-settings-row" data-modified={modified || undefined}>
      <div>
        <h4>{title}{modified && <span className="email-delivery-modified-dot" title="Unsaved change" aria-label="Unsaved change" />}</h4>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${checked ? "bg-[#34C759]" : "bg-[var(--color-border)]"}`}
    >
      <span
        className={`mt-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`}
      />
    </button>
  );
}
export default function EmailDeliveryPanel() {
  const context = useOptionalEmailDeliverySettings();
  return context ? <EmailDeliveryPanelContent /> : <EmailDeliverySettingsProvider><EmailDeliveryPanelContent /></EmailDeliverySettingsProvider>;
}
function EmailDeliveryPanelContent() {
  const state = useEmailDeliverySettings();
  const { settings, policy, load, loadingError: error, update } = state;
  const [action, setAction] = useState<Action | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const { registerPanel } = state;
  useEffect(() => registerPanel(panelId, { element: () => root.current, openSave: () => setAction("policy") }), [panelId, registerPanel]);
  const [events, setEvents] = useState<Activity[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [expanded, setExpanded] = useState(false),
    [activityError, setActivityError] = useState("");
  const activity = useCallback(async (before?: string) => {
    try {
      const result = await securityFetch<{
        events: Activity[];
        nextCursor: string | null;
      }>(
        `/api/settings/email-delivery-security/activity?limit=20${before ? `&before=${encodeURIComponent(before)}` : ""}`,
      );
      setEvents((current) =>
        before ? [...current, ...result.events] : result.events,
      );
      setCursor(result.nextCursor);
      setActivityError("");
    } catch (error) {
      setActivityError(
        error instanceof Error
          ? error.message
          : "Unable to load security activity.",
      );
    }
  }, []);
  useEffect(() => {
    void load();
    void activity();
  }, [load, activity]);
  if (!settings || !policy)
    return (
      <div className="email-delivery-settings">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <GlassButton onClick={() => void load()}>Try again</GlassButton>
          </>
        ) : (
          <EmailSecurityProcessing>
            Loading email delivery settings…
          </EmailSecurityProcessing>
        )}
      </div>
    );
  const normalControlsDisabled = state.saving || state.reviewing;
  const modified = (key: keyof DeliveryPolicy) => state.changedKeys.includes(key);
  const requirements = new Set([
    ...requiredDeliveryMethods(
      policy,
      "send",
      policy.requireEmailOtpForLargeBatch ? policy.largeBatchThreshold : 1,
    ),
    ...requiredDeliveryMethods(policy, "draft", 1),
  ]);
  const needsEmail =
      requirements.has("emailOtp") && !settings.approvalEmailVerified,
    needsPin = requirements.has("sendPin") && !settings.sendPinConfigured;
  return (
    <div ref={root} className={`email-delivery-settings ${state.changedKeys.length || state.saveError || state.justSaved ? "has-save-bar" : ""}`}>
      <header className="email-delivery-settings-header">
        <div><h2>Email & Delivery</h2>
        <p>Organization-wide protection for client emails and Gmail drafts.</p></div>
        <EmailDeliverySaveStatus />
      </header>
      <SettingGroup id="section-delivery-security" title="Delivery security">
        <SettingRow
          title={needsEmail || needsPin ? "Action required" : "Protected"}
          description="Send activity is always audited."
        >
          <ShieldCheck size={22} />
        </SettingRow>
        {needsEmail && (
          <SettingRow
            title="Approval email required"
            description="OTP-protected delivery stays locked until the approval email is verified."
          >
            <GlassButton onClick={() => setAction("email")}>
              Set up approval email
            </GlassButton>
          </SettingRow>
        )}
        {needsPin && (
          <SettingRow
            title="Send PIN required"
            description="PIN-protected delivery stays locked until a six-digit Send PIN is configured."
          >
            <GlassButton onClick={() => setAction("pin")}>
              Set up PIN
            </GlassButton>
          </SettingRow>
        )}
      </SettingGroup>
      <SettingGroup id="section-gmail" title="Gmail connection">
        <SettingRow
          title="Gmail account"
          description="Client email delivery uses the Gmail account configured for the application."
        >
          <Link
            className="text-sm text-brand-600"
            href="/dashboard/gmail-setup"
          >
            Open Gmail setup ↗
          </Link>
        </SettingRow>
      </SettingGroup>
      <SettingGroup
        id="section-delivery-protection"
        title="Delivery protection"
      >
        <SettingRow
          title="Create Gmail drafts"
          modified={modified("draftProtection")}
          description="Confirmation-only drafts never send messages."
        >
          <LiquidGlassDropdown
            portal
            className="email-delivery-policy-dropdown"
            label="Draft protection"
            value={policy.draftProtection}
            disabled={normalControlsDisabled}
            onChange={(value) =>
              update(
                "draftProtection",
                value as DeliveryPolicy["draftProtection"],
              )
            }
            options={[
              { value: "confirmation", label: "Confirmation only" },
              { value: "sendPin", label: "Send PIN" },
              { value: "emailOtp", label: "Email OTP" },
            ]}
          />
        </SettingRow>
        <SettingRow
          title="Direct email sending"
          modified={modified("directSendProtection")}
          description="Email OTP is recommended for identity verification."
        >
          <LiquidGlassDropdown
            portal
            className="email-delivery-policy-dropdown"
            label="Direct send protection"
            value={policy.directSendProtection}
            disabled={normalControlsDisabled}
            onChange={(value) =>
              update(
                "directSendProtection",
                value as DeliveryPolicy["directSendProtection"],
              )
            }
            options={[
              { value: "emailOtp", label: "Email OTP · Recommended" },
              { value: "sendPin", label: "Send PIN" },
              { value: "emailOtpAndPin", label: "Email OTP + Send PIN" },
            ]}
          />
        </SettingRow>
        <SettingRow
          title="Hold to Send"
          modified={modified("holdToSend")}
          description="Require a deliberate press-and-hold after authorization before emails are sent."
        >
          <Toggle
            label="Hold to Send"
            checked={policy.holdToSend}
            disabled={normalControlsDisabled}
            onChange={() => update("holdToSend", !policy.holdToSend)}
          />
        </SettingRow>
        <SettingRow
          title="Restrict duplicate email addresses"
          modified={modified("restrictDuplicateRecipients")}
          description="Block the same address across multiple clients in one batch. Turn off to let shared contacts receive each client's email."
        >
          <Toggle
            label="Restrict duplicate email addresses"
            checked={policy.restrictDuplicateRecipients}
            disabled={normalControlsDisabled}
            onChange={() =>
              update(
                "restrictDuplicateRecipients",
                !policy.restrictDuplicateRecipients,
              )
            }
          />
        </SettingRow>
      </SettingGroup>
      <SettingGroup id="section-approval-email" title="Approval email">
        <SettingRow
          title={settings.approvalEmailMasked || "Not configured"}
          description={
            settings.approvalEmailVerified
              ? "Verified · Delivery verification codes are sent to this address."
              : "Verify the trusted destination before protected email delivery."
          }
        >
          <GlassButton onClick={() => setAction("email")}>
            {settings.approvalEmailVerified
              ? "Change approval email"
              : "Set up approval email"}
          </GlassButton>
        </SettingRow>
      </SettingGroup>
      <SettingGroup id="section-send-pin" title="Send PIN">
        <SettingRow
          title={settings.sendPinConfigured ? "Configured" : "Not configured"}
          description="A dedicated six-digit delivery PIN, separate from your login password."
        >
          <GlassButton onClick={() => setAction("pin")}>
            {settings.sendPinConfigured ? "Change PIN" : "Set up Send PIN"}
          </GlassButton>
        </SettingRow>
        {settings.sendPinConfigured && (
          <SettingRow
            title="Remove Send PIN"
            description="Verification is required to remove an existing PIN."
          >
            <GlassButton onClick={() => setAction("remove-pin")}>
              Remove PIN
            </GlassButton>
          </SettingRow>
        )}
      </SettingGroup>
      <SettingGroup id="section-otp-security" title="OTP security">
        <SettingRow title="Code validity" description="2–10 minutes" modified={modified("otpExpiryMinutes")}>
          <input
            aria-label="OTP validity minutes"
            type="number"
            min={2}
            max={10}
            value={policy.otpExpiryMinutes}
            disabled={normalControlsDisabled}
            onChange={(event) =>
              update("otpExpiryMinutes", Number(event.target.value))
            }
          />
        </SettingRow>
        <SettingRow title="Resend cooldown" description="30–120 seconds" modified={modified("otpResendCooldownSeconds")}>
          <input
            aria-label="OTP resend cooldown seconds"
            type="number"
            min={30}
            max={120}
            value={policy.otpResendCooldownSeconds}
            disabled={normalControlsDisabled}
            onChange={(event) =>
              update("otpResendCooldownSeconds", Number(event.target.value))
            }
          />
        </SettingRow>
        <SettingRow
          title="Maximum attempts"
          modified={modified("otpMaxAttempts")}
          description="3–10 attempts per approval"
        >
          <input
            aria-label="OTP maximum attempts"
            type="number"
            min={3}
            max={10}
            value={policy.otpMaxAttempts}
            disabled={normalControlsDisabled}
            onChange={(event) =>
              update("otpMaxAttempts", Number(event.target.value))
            }
          />
        </SettingRow>
      </SettingGroup>
      <SettingGroup id="section-bulk-send" title="Bulk-send safety">
        <SettingRow
          title="Extra protection from"
          modified={modified("largeBatchThreshold")}
          description="Number of client emails in the exact delivery batch"
        >
          <input
            aria-label="Large batch threshold"
            type="number"
            min={1}
            max={1000}
            value={policy.largeBatchThreshold}
            disabled={normalControlsDisabled}
            onChange={(event) =>
              update("largeBatchThreshold", Number(event.target.value))
            }
          />
        </SettingRow>
        <SettingRow
          title="Require fresh Email OTP"
          modified={modified("requireEmailOtpForLargeBatch")}
          description="Large direct-send batches require Email OTP even when Send PIN is the ordinary policy."
        >
          <Toggle
            label="Require Email OTP for large batches"
            checked={policy.requireEmailOtpForLargeBatch}
            disabled={normalControlsDisabled}
            onChange={() =>
              update(
                "requireEmailOtpForLargeBatch",
                !policy.requireEmailOtpForLargeBatch,
              )
            }
          />
        </SettingRow>
      </SettingGroup>
      <SettingGroup id="section-delivery-activity" title="Security activity">
        <SettingRow
          title="Delivery and security history"
          description="Authorizations, settings changes, and delivery outcomes are always logged."
        >
          <GlassButton
            onClick={() => {
              setExpanded(true);
              void activity();
            }}
          >
            View delivery activity
          </GlassButton>
        </SettingRow>
        {activityError && (
          <p className="px-4 py-3 text-sm" role="alert">
            {activityError}
          </p>
        )}
        {(expanded ? events : events.slice(0, 5)).map((event) => (
          <div key={event._id} className="email-delivery-settings-activity">
            <strong>
              {event.event.replaceAll("_", " ")}
              {event.messageCount ? ` · ${event.messageCount} emails` : ""}
            </strong>
            <p>
              {new Date(event.createdAt).toLocaleString()} · {event.userEmail}
              {event.approvalMethod ? ` · ${event.approvalMethod}` : ""}
            </p>
          </div>
        ))}
        {!events.length && !activityError && (
          <p className="px-4 py-3 text-sm text-muted">
            No delivery security activity yet.
          </p>
        )}
        {expanded && cursor && (
          <div className="p-4">
            <GlassButton onClick={() => void activity(cursor)}>
              Load more
            </GlassButton>
          </div>
        )}
      </SettingGroup>
      <EmailDeliverySaveBar />
      {action && (
        <SecuritySettingsAction
          key={`${action}-${settings.version}`}
          action={action}
          settings={settings}
          policy={policy}
          onClose={() => { setAction(null); if (action === "policy") state.cancelReview(); }}
          onPolicySaveStart={state.saveStarted}
          onPolicySaveError={state.saveFailed}
          policySaveError={state.saveError}
          onPolicyRetry={() => {
            setAction(null);
            state.cancelReview(true);
            requestAnimationFrame(() => { void state.requestSave(); });
          }}
          onSaved={(result) => {
            state.acceptSaved(result, action === "policy");
            setAction(null);
            toast.success("Email delivery security updated.");
            void activity();
          }}
        />
      )}
    </div>
  );
}
function SecuritySettingsAction({
  action,
  settings,
  policy,
  onClose,
  onSaved,
  onPolicySaveStart,
  onPolicySaveError,
  policySaveError,
  onPolicyRetry,
}: {
  action: Action;
  settings: DeliverySecurityView;
  policy: DeliveryPolicy;
  onClose: () => void;
  onSaved: (settings: DeliverySecurityView) => void;
  onPolicySaveStart: () => void;
  onPolicySaveError: (message: string) => void;
  policySaveError: string;
  onPolicyRetry: () => void;
}) {
  const [proof, setProof] = useState<ApprovalView | null>(null),
    [emailChallenge, setEmailChallenge] = useState<ApprovalView | null>(null);
  const [email, setEmail] = useState(settings.suggestedApprovalEmail || ""),
    [pin, setPin] = useState(""),
    [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState("");
  const lock = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const purpose =
    action === "email"
      ? "approval-email-change"
      : action === "policy"
        ? "settings-update"
        : "send-pin-update";
  const needsProof =
    settings.approvalEmailVerified || settings.sendPinConfigured;
  const now = useSecurityClock();
  const proofExpired = Boolean(proof && Date.parse(proof.expiresAt) <= now);
  const emailExpired = Boolean(
    emailChallenge && Date.parse(emailChallenge.expiresAt) <= now,
  );
  const ready = !needsProof || (proof?.status === "verified" && !proofExpired);
  const reset = () => {
    setProof(null);
    setEmailChallenge(null);
    setPin("");
    setConfirm("");
  };
  const base = "/api/settings/email-delivery-security";
  const run = async (label: string, execute: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    setError("");
    try {
      await execute();
    } catch (error) {
      if (mounted.current) {
        setError(
          error instanceof Error
            ? error.message
            : "Unable to update delivery security.",
        );
        if (
          error instanceof SecurityRequestError &&
          [
            "APPROVAL_EXPIRED",
            "APPROVAL_LOCKED",
            "APPROVAL_UNAVAILABLE",
            "APPROVAL_CHANGED",
          ].includes(error.code || "")
        )
          reset();
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(null);
    }
  };
  const save = () =>
    run("Saving security settings…", async () => {
      let result: DeliverySecurityView;
      if (action === "policy") {
        onPolicySaveStart();
        try {
          result = await securityFetch(
            base,
            { policy, version: settings.version, approvalId: proof?.approvalId },
            "PATCH",
          );
        } catch (error) {
          onPolicySaveError(error instanceof Error ? error.message : "Couldn't save settings. Your changes are still here.");
          throw error;
        }
      }
      else
        result = await securityFetch(
          `${base}/send-pin`,
          action === "remove-pin"
            ? { action: "remove", approvalId: proof?.approvalId }
            : {
                action: "save",
                pin,
                confirmPin: confirm,
                approvalId: proof?.approvalId,
              },
        );
      setPin("");
      setConfirm("");
      if (mounted.current) onSaved(result);
    });
  return (
    <TrackerModal
      open
      title={
        action === "email"
          ? settings.approvalEmailVerified
            ? "Change approval email"
            : "Set up approval email"
          : action === "policy"
            ? "Save delivery protection"
            : action === "remove-pin"
              ? "Remove Send PIN"
              : "Set up Send PIN"
      }
      icon={MailCheck}
      size="md"
      className="email-security-modal"
      onClose={() => {
        if (!busy?.startsWith("Saving")) onClose();
      }}
    >
      <div className="email-security-content">
        <p>
          {action === "email" && needsProof
            ? "First verify this change using the current trusted approval email or Send PIN. Then verify the new address."
            : "Confirm this organization-wide delivery security change."}
        </p>
        {action === "policy" && (
          <dl className="email-security-summary">
            {Object.keys(EMAIL_DELIVERY_SECURITY_DEFAULTS)
              .filter(
                (key) =>
                  policy[key as keyof DeliveryPolicy] !==
                  settings[key as keyof DeliveryPolicy],
              )
              .map((key) => (
                <div key={key}>
                  <dt>{key.replace(/([A-Z])/g, " $1")}</dt>
                  <dd>{String(policy[key as keyof DeliveryPolicy])}</dd>
                </div>
              ))}
          </dl>
        )}
        {error && (
          <p className="email-security-error" role="alert">
            {error}
          </p>
        )}
        {busy && (action === "policy" && busy.startsWith("Saving")
          ? <div className="email-delivery-policy-saving" role="status"><LoaderCircle size={16} className="email-delivery-save-spinner" aria-hidden="true" />Saving settings…</div>
          : <EmailSecurityProcessing>{busy}</EmailSecurityProcessing>)}
        {(proofExpired || emailExpired) && !busy && (
          <GlassButton onClick={reset}>Request new approval</GlassButton>
        )}
        {!ready && !proof && (
          <div className="email-security-form">
            <p>
              {settings.approvalEmailVerified
                ? `Verification will be sent to ${settings.approvalEmailMasked}.`
                : "Enter your current Send PIN to authorize this change."}
            </p>
            <GlassButton
              disabled={Boolean(busy)}
              onClick={() =>
                void run("Preparing authorization…", async () => {
                  const result = await securityFetch<ApprovalView>(
                    `${base}/authorize`,
                    { action: "request", purpose },
                  );
                  if (mounted.current) setProof(result);
                })
              }
            >
              {settings.approvalEmailVerified
                ? "Send verification code"
                : "Verify this change"}
            </GlassButton>
          </div>
        )}
        {proof && !ready && (
          <VerificationChallenge
            challenge={proof}
            busy={Boolean(busy)}
            onVerify={(values) =>
              run("Verifying…", async () => {
                const result = await securityFetch<ApprovalView>(
                  `${base}/authorize`,
                  {
                    action: "verify",
                    purpose,
                    approvalId: proof.approvalId,
                    ...values,
                  },
                );
                if (mounted.current) setProof(result);
              })
            }
            onResend={() =>
              run("Sending verification code…", async () => {
                const result = await securityFetch<ApprovalView>(
                  `${base}/authorize`,
                  { action: "resend", purpose, approvalId: proof.approvalId },
                );
                if (mounted.current) setProof(result);
              })
            }
          />
        )}
        {ready && action === "email" && !emailChallenge && (
          <form
            className="email-security-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run("Sending verification code…", async () => {
                const result = await securityFetch<ApprovalView>(
                  `${base}/approval-email`,
                  { action: "request", email, approvalId: proof?.approvalId },
                );
                if (mounted.current) setEmailChallenge(result);
              });
            }}
          >
            <label>
              New approval email
              <input
                type="email"
                required
                autoComplete="email"
                aria-label="New approval email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={Boolean(busy)}
              />
            </label>
            <GlassButton
              type="submit"
              disabled={Boolean(busy) || !email.trim()}
            >
              Verify new approval email
            </GlassButton>
          </form>
        )}
        {emailChallenge && (
          <VerificationChallenge
            challenge={emailChallenge}
            busy={Boolean(busy)}
            onVerify={(values) =>
              run("Verifying…", async () => {
                const result = await securityFetch<{
                  settings: DeliverySecurityView;
                }>(`${base}/approval-email`, {
                  action: "verify",
                  approvalId: emailChallenge.approvalId,
                  otp: values.otp,
                });
                if (mounted.current) onSaved(result.settings);
              })
            }
            onResend={() =>
              run("Sending verification code…", async () => {
                const result = await securityFetch<ApprovalView>(
                  `${base}/approval-email`,
                  { action: "resend", approvalId: emailChallenge.approvalId },
                );
                if (mounted.current) setEmailChallenge(result);
              })
            }
          />
        )}
        {ready && action === "pin" && (
          <form
            className="email-security-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <SecurityCodeInput
              label="New Send PIN"
              value={pin}
              onChange={setPin}
              pin
              disabled={Boolean(busy)}
            />
            <SecurityCodeInput
              label="Confirm Send PIN"
              value={confirm}
              onChange={setConfirm}
              pin
              disabled={Boolean(busy)}
            />
            {pin.length === 6 && confirm.length === 6 && pin !== confirm && (
              <p role="status">The PINs must match.</p>
            )}
            <GlassButton
              type="submit"
              disabled={Boolean(busy) || pin.length !== 6 || confirm !== pin}
            >
              Save Send PIN
            </GlassButton>
          </form>
        )}
        {ready && action === "remove-pin" && (
          <p>
            Delivery policies that require a PIN will stay locked until another
            Send PIN is configured.
          </p>
        )}
        {ready && (action === "policy" || action === "remove-pin") && (
          <GlassButton disabled={Boolean(busy)} onClick={() => action === "policy" && policySaveError ? onPolicyRetry() : void save()}>
            {action === "policy"
              ? busy?.startsWith("Saving") ? "Saving…" : policySaveError ? "Try again" : "Save changes"
              : "Remove Send PIN"}
          </GlassButton>
        )}
        <GlassButton
          onClick={onClose}
          disabled={Boolean(busy?.startsWith("Saving"))}
        >
          Cancel
        </GlassButton>
      </div>
    </TrackerModal>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import TrackerModal from "@/components/client-trackers/TrackerModal";
import { GlassButton } from "@/components/ui/liquid-glass";
import {
  requiredDeliveryMethods,
  type ApprovalView,
  type DeliveryBatch,
  type DeliverySecurityView,
} from "@/lib/email-delivery-security";
import {
  securityFetch,
  SecurityRequestError,
} from "@/lib/email-delivery-security-client";
import {
  EmailSecurityProcessing,
  useSecurityClock,
  VerificationChallenge,
} from "./EmailSecurityControls";
import HoldToSendButton from "./HoldToSendButton";
import { useAuthorizationReducedMotion } from "./useAuthorizationReducedMotion";
type Props = {
  trackerId: string;
  batch: DeliveryBatch;
  workflowName: string;
  resuming?: boolean;
  onClose: () => void;
  onCommit: (batch: DeliveryBatch, approvalId?: string) => Promise<void | { completed: number; dismiss: () => void }>;
};
export default function EmailDeliveryAuthorizationModal({
  trackerId,
  batch,
  workflowName,
  resuming,
  onClose,
  onCommit,
}: Props) {
  const [policy, setPolicy] = useState<DeliverySecurityView | null>(null),
    [challenge, setChallenge] = useState<ApprovalView | null>(null);
  const [busy, setBusy] = useState<string | null>("Preparing authorization…"),
    [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [deliveryPhase, setDeliveryPhase] = useState<"ready" | "sending" | "success">("ready");
  const [sentCount, setSentCount] = useState(batch.messages.length);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestLock = useRef(false),
    mounted = useRef(true);
  const now = useSecurityClock();
  const reducedMotion = useAuthorizationReducedMotion();
  const base = `/api/client-trackers/${trackerId}/email/approval`;
  useEffect(() => {
    mounted.current = true;
    securityFetch<DeliverySecurityView>("/api/settings/email-delivery-security")
      .then((result) => {
        if (mounted.current) setPolicy(result);
      })
      .catch((error) => {
        if (mounted.current) setError(error.message);
      })
      .finally(() => {
        if (mounted.current) setBusy(null);
      });
    return () => {
      mounted.current = false;
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);
  const run = async (label: string, action: () => Promise<void>) => {
    if (requestLock.current) return;
    requestLock.current = true;
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (error) {
      if (mounted.current) {
        setError(
          error instanceof Error
            ? error.message
            : "Unable to authorize delivery.",
        );
        if (
          error instanceof SecurityRequestError &&
          [
            "DELIVERY_APPROVAL_INVALID",
            "POLICY_CHANGED",
            "BATCH_CHANGED",
            "APPROVAL_LOCKED",
            "APPROVAL_EXPIRED",
          ].includes(error.code || "")
        )
          setChallenge(null);
      }
    } finally {
      requestLock.current = false;
      if (mounted.current) setBusy(null);
    }
  };
  const request = () =>
    run(methods.includes("emailOtp") && !resuming ? "Sending verification code…" : "Checking authorization…", async () => {
      const result = await securityFetch<ApprovalView>(
        `${base}/request`,
        batch,
      );
      if (mounted.current) setChallenge(result);
    });
  const commit = () => {
    if (requestLock.current || deliveryPhase !== "ready") return;
    let succeeded = false;
    setDeliveryPhase("sending");
    void run(
      batch.mode === "send"
        ? `Sending ${batch.messages.length} ${batch.messages.length === 1 ? "email" : "emails"}…`
        : `Creating ${batch.messages.length} Gmail ${batch.messages.length === 1 ? "draft" : "drafts"}…`,
      async () => {
        const feedback = await onCommit(batch, challenge?.approvalId);
        succeeded = true;
        if (mounted.current) {
          setSentCount(feedback?.completed ?? batch.messages.length);
          setDeliveryPhase("success");
          // Only the presentation lingers; the real request has already completed.
          dismissTimer.current = setTimeout(() => (feedback?.dismiss || onClose)(), 700);
        }
      },
    ).finally(() => {
      if (mounted.current && !succeeded) {
        setDeliveryPhase("ready");
        setAttempt((current) => current + 1);
      }
    });
  };
  const methods =
    challenge?.methodsRequired ||
    (policy
      ? requiredDeliveryMethods(policy, batch.mode, batch.messages.length)
      : []);
  const confirmedDraft =
    policy &&
    batch.mode === "draft" &&
    policy.draftProtection === "confirmation";
  const verified = challenge?.status === "verified";
  const expired = challenge ? Date.parse(challenge.expiresAt) <= now : false;
  const delivering = deliveryPhase !== "ready";
  const count = batch.messages.length;
  const attachmentCount = new Set(batch.messages.flatMap(message => message.attachments.map(item => item.documentId))).size;
  const verificationBusy = busy && !delivering;
  return (
    <TrackerModal
      open
      onClose={() => {
        if (!delivering) onClose();
      }}
      title={
        batch.mode === "send"
          ? "Authorize email delivery"
          : "Create Gmail drafts"
      }
      subtitle="Review this exact delivery before continuing"
      icon={ShieldCheck}
      size="md"
      className="email-security-modal email-authorization-modal"
      footer={
        <div className="email-security-footer">
          <GlassButton onClick={onClose} disabled={delivering}>
            Cancel
          </GlassButton>
        </div>
      }
    >
      <div className="email-security-content">
        <p className="email-security-intro">
          {count} personalised client {count === 1 ? "email" : "emails"}{" "}
          {batch.mode === "send"
            ? `${count === 1 ? "is" : "are"} ready to be sent.`
            : "will be created in Gmail Drafts."}
        </p>
        <dl className="email-security-summary">
          <div>
            <dt>Workflow</dt>
            <dd>{workflowName}</dd>
          </div>
          <div>
            <dt>Email type</dt>
            <dd>{batch.kind === "initial" ? "Initial email" : "Reminder"}</dd>
          </div>
          <div>
            <dt>Recipients</dt>
            <dd>{count} {count === 1 ? "client" : "clients"}</dd>
          </div>
          <div>
            <dt>Attachments</dt>
            <dd>
              {attachmentCount} {attachmentCount === 1 ? "file" : "files"}
            </dd>
          </div>
        </dl>
        {error && (
          <div className="email-security-error" role="alert">
            {error}
            <Link href="/dashboard/settings?tab=email-delivery">
              Open Email & Delivery settings
            </Link>
          </div>
        )}
        {!busy && !policy && (
          <GlassButton
            onClick={() =>
              void run("Preparing authorization…", async () => {
                const result = await securityFetch<DeliverySecurityView>(
                  "/api/settings/email-delivery-security",
                );
                if (mounted.current) setPolicy(result);
              })
            }
          >
            Try again
          </GlassButton>
        )}
        <AnimatePresence mode="wait" initial={false}>
          {verificationBusy ? (
            <motion.div key="verifying" className="email-authorization-processing"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: .97, filter: "blur(2px)" }} transition={{ duration: reducedMotion ? .12 : .26 }}>
              <EmailSecurityProcessing>{busy}</EmailSecurityProcessing>
            </motion.div>
          ) : verified ? (
            <motion.div key="verified" initial={{ opacity: 0, y: reducedMotion ? 0 : 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .24 }}>
              <p className="email-security-verified" role="status"><Check size={17} />Identity verified</p>
              {challenge?.resumed && <p className="email-security-note">This campaign is already authorized. Only pending recipients will be processed.</p>}
            </motion.div>
          ) : null}
        </AnimatePresence>
        {!busy && policy && !challenge && !confirmedDraft && (
          <div className="email-security-request">
            <p>
              Approval required:{" "}
              {methods
                .map((method) =>
                  method === "emailOtp" ? "Email OTP" : "Send PIN",
                )
                .join(" + ")}
            </p>
            {methods.includes("emailOtp") && (
              <p>
                Verification codes are sent to{" "}
                <strong>
                  {policy.approvalEmailMasked || "your verified approval email"}
                </strong>
                .
              </p>
            )}
            {policy.requireEmailOtpForLargeBatch &&
              batch.mode === "send" &&
              batch.messages.length >= policy.largeBatchThreshold && (
                <p>
                  Additional verification required: batches of{" "}
                  {policy.largeBatchThreshold} or more require fresh Email OTP.
                </p>
              )}
            <p className="email-security-note">
              This authorization applies only to this exact delivery.
            </p>
            <GlassButton onClick={() => void request()}>
              {resuming
                ? "Resume authorized campaign"
                : methods.includes("emailOtp")
                  ? "Send verification code"
                  : "Prepare authorization"}
            </GlassButton>
          </div>
        )}
        {challenge && !verified && (
          <VerificationChallenge
            challenge={challenge}
            busy={Boolean(busy)}
            onVerify={(values) =>
              run("Verifying identity…", async () => {
                const result = await securityFetch<ApprovalView>(
                  `${base}/verify`,
                  { ...values, approvalId: challenge.approvalId, batch },
                );
                if (mounted.current) setChallenge(result);
              })
            }
            onResend={() =>
              run("Sending verification code…", async () => {
                const result = await securityFetch<ApprovalView>(
                  `${base}/resend`,
                  { approvalId: challenge.approvalId, batch },
                );
                if (mounted.current) setChallenge(result);
              })
            }
          />
        )}
        {expired && (
          <p role="status">
            Verification expired. Please verify this delivery again.
          </p>
        )}
        {(confirmedDraft || verified) && (
          <div className="email-security-commit">
            <p>
              {batch.mode === "draft"
                ? "Nothing will be sent."
                : `${count} ${count === 1 ? "email" : "emails"} will be sent immediately. This action cannot be undone.`}
            </p>
            {batch.mode === "send" && challenge?.holdToSend ? (
              <HoldToSendButton
                resetKey={attempt}
                count={batch.messages.length}
                disabled={Boolean(busy) || expired}
                phase={deliveryPhase}
                sentCount={sentCount}
                onCommit={commit}
              />
            ) : (
              <GlassButton
                disabled={Boolean(busy) || delivering || expired}
                onClick={() => void commit()}
              >
                {deliveryPhase === "sending" ? busy : batch.mode === "draft"
                  ? `Create ${count} ${count === 1 ? "draft" : "drafts"}`
                  : deliveryPhase === "success" ? count === 1 ? "Email sent" : `${sentCount} emails sent`
                  : `Send ${count} ${count === 1 ? "email" : "emails"}`}
              </GlassButton>
            )}
          </div>
        )}
        {expired && !busy && (
          <GlassButton
            onClick={() => {
              setChallenge(null);
              void request();
            }}
          >
            Request new approval
          </GlassButton>
        )}
      </div>
    </TrackerModal>
  );
}

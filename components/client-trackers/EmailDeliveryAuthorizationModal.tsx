"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import TrackerModal from "@/components/client-trackers/TrackerModal";
import { GlassButton } from "@/components/ui/liquid-glass";
import { requiredDeliveryMethods, type ApprovalView, type DeliveryBatch, type DeliverySecurityView } from "@/lib/email-delivery-security";
import type { DeliveryJobAcceptance } from "@/lib/email-delivery-jobs";
import { securityFetch, SecurityRequestError } from "@/lib/email-delivery-security-client";
import { EmailSecurityProcessing, useSecurityClock, VerificationChallenge } from "./EmailSecurityControls";
import HoldToSendButton from "./HoldToSendButton";
import { useAuthorizationReducedMotion } from "./useAuthorizationReducedMotion";
import EmailMotionRegion, { emailMotion } from "./EmailMotionRegion";

type Props = {
  trackerId: string; batch: DeliveryBatch; workflowName: string; resuming?: boolean;
  onClose: () => void;
  onCommit: (batch: DeliveryBatch, approvalId?: string) => Promise<DeliveryJobAcceptance>;
  onAccepted: (result: DeliveryJobAcceptance) => void;
  onHandoffComplete: () => void;
};
export default function EmailDeliveryAuthorizationModal({ trackerId, batch, workflowName, resuming, onClose, onCommit, onAccepted, onHandoffComplete }: Props) {
  const [policy, setPolicy] = useState<DeliverySecurityView | null>(null);
  const [challenge, setChallenge] = useState<ApprovalView | null>(null);
  const [busy, setBusy] = useState<string | null>("Checking authorization…"), [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<"ready" | "committing" | "accepted">("ready");
  const lock = useRef(false), mounted = useRef(true), handoffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const now = useSecurityClock(), reduced = useAuthorizationReducedMotion();
  const base = "/api/client-trackers/" + trackerId + "/email/approval";
  useEffect(() => {
    mounted.current = true;
    securityFetch<DeliverySecurityView>("/api/settings/email-delivery-security")
      .then(result => { if (mounted.current) setPolicy(result); })
      .catch(failure => { if (mounted.current) setError(failure.message); })
      .finally(() => { if (mounted.current) setBusy(null); });
    return () => { mounted.current = false; if (handoffTimer.current) clearTimeout(handoffTimer.current); };
  }, []);
  const run = async (label: string, action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(label); setError("");
    try { await action(); }
    catch (failure) {
      if (mounted.current) {
        setError(failure instanceof Error ? failure.message : "Unable to authorize this delivery.");
        if (failure instanceof SecurityRequestError && ["DELIVERY_APPROVAL_INVALID", "POLICY_CHANGED", "BATCH_CHANGED", "APPROVAL_LOCKED", "APPROVAL_EXPIRED"].includes(failure.code || "")) setChallenge(null);
      }
    } finally { lock.current = false; if (mounted.current) setBusy(null); }
  };
  const methods = challenge?.methodsRequired || (policy ? requiredDeliveryMethods(policy, batch.mode, batch.messages.length) : []);
  const request = () => run(methods.includes("emailOtp") && !resuming ? "Sending verification code…" : "Checking authorization…", async () => {
    const result = await securityFetch<ApprovalView>(base + "/request", batch);
    if (mounted.current) setChallenge(result);
  });
  const commit = () => {
    if (lock.current || phase !== "ready") return;
    let accepted = false;
    setPhase("committing");
    void run(batch.mode === "draft" ? "Starting draft creation…" : "Starting delivery…", async () => {
      const result = await onCommit(batch, challenge?.approvalId);
      if (!result || !["accepted", "already_accepted"].includes(result.outcome) || result.campaignId !== batch.campaignId || result.job?.executionMode !== "browser")
        throw new Error("The server has not confirmed campaign acceptance. Try this same campaign again.");
      accepted = true;
      if (mounted.current) {
        setPhase("accepted");
        // Browser coordination starts immediately; only sheet cleanup waits for motion.
        handoffTimer.current = setTimeout(onHandoffComplete, reduced ? 0 : emailMotion.handoff * 1000);
        onAccepted(result);
      }
    }).finally(() => { if (mounted.current && !accepted) { setPhase("ready"); setAttempt(value => value + 1); } });
  };
  const confirmedDraft = Boolean(policy && batch.mode === "draft" && policy.draftProtection === "confirmation");
  const verified = challenge?.status === "verified";
  const expired = challenge ? Date.parse(challenge.expiresAt) <= now : false;
  const delivering = phase !== "ready";
  const count = batch.messages.length;
  const noun = count === 1 ? "email" : "emails";
  const { attachments, recipients, uniqueRecipients } = useMemo(() => ({
    attachments: new Set(batch.messages.flatMap(message => message.attachments.map(item => item.documentId))).size,
    recipients: batch.messages.reduce((total, message) => total + new Set([...message.to, ...message.cc].map(email => email.trim().toLowerCase())).size, 0),
    uniqueRecipients: new Set(batch.messages.flatMap(message => [...message.to, ...message.cc]).map(email => email.trim().toLowerCase())).size,
  }), [batch]);
  const next = challenge?.methodsRequired.find(method => !challenge.methodsVerified.includes(method));
  const stage = !policy ? "policy" : challenge && !verified ? next || "verify" : confirmedDraft || verified ? "commit" : "request";
  const transitions = { duration: reduced ? 0 : emailMotion.content, ease: emailMotion.ease };
  return <TrackerModal open={phase !== "accepted"} onClose={() => { if (!delivering) onClose(); }}
    title={batch.mode === "draft" ? "Create Gmail drafts" : "Authorize email delivery"}
    subtitle="Review this exact delivery before continuing" icon={ShieldCheck} size="md"
    className={"email-security-modal email-authorization-modal" + (phase === "accepted" ? " is-handing-off" : "")}
    footer={<div className="email-security-footer"><GlassButton onClick={onClose} disabled={delivering}>Cancel</GlassButton></div>}>
    <div className="email-security-content">
      <p className="email-security-intro">{count} personalised client {noun} {batch.mode === "draft" ? "will be created in Gmail Drafts." : (count === 1 ? "is" : "are") + " ready to be sent."}</p>
      <dl className="email-security-summary">
        <div><dt>Workflow</dt><dd>{workflowName}</dd></div>
        <div><dt>Email type</dt><dd>{batch.kind === "initial" ? "Initial email" : "Reminder"}</dd></div>
        <div><dt>Client emails</dt><dd>{count}</dd></div>
        <div><dt>To / CC addresses</dt><dd>{recipients}{recipients !== uniqueRecipients ? " (" + uniqueRecipients + " unique)" : ""}</dd></div>
        <div><dt>Attachments</dt><dd>{attachments} {attachments === 1 ? "file" : "files"}</dd></div>
      </dl>
      <EmailMotionRegion busy={Boolean(busy)}>
          <motion.div key={stage} initial={{ opacity: reduced ? 1 : .35, y: reduced ? 0 : 5 }}
            animate={{ opacity: 1, y: 0 }} transition={transitions}>
            {error && stage !== "emailOtp" && stage !== "sendPin" && <div className="email-security-error" role="alert">{error}
              {stage === "policy" && <GlassButton onClick={() => void run("Checking authorization…", async () => setPolicy(await securityFetch<DeliverySecurityView>("/api/settings/email-delivery-security")))}>Try again</GlassButton>}
              {stage === "request" && <Link href="/dashboard/settings?tab=email-delivery">Open Email & Delivery settings</Link>}
            </div>}
            {stage === "policy" && busy && <EmailSecurityProcessing>{busy}</EmailSecurityProcessing>}
            {stage === "request" && <div className="email-security-request">
              <h4>Approve this delivery</h4>
              <p>{methods.length ? "Approval required: " + methods.map(method => method === "emailOtp" ? "Email OTP" : "Send PIN").join(" + ") : "Confirm this exact delivery before continuing."}</p>
              {methods.includes("emailOtp") && <p>The approval code will be sent to <strong>{policy?.approvalEmailMasked || "your verified approval email"}</strong>.</p>}
              {policy?.requireEmailOtpForLargeBatch && batch.mode === "send" && count >= policy.largeBatchThreshold && <p>Additional verification required: batches of {policy.largeBatchThreshold} or more require fresh Email OTP.</p>}
              <p className="email-security-note">This authorization applies only to this exact delivery.</p>
              <div className="email-authorization-action-surface">
                <GlassButton disabled={Boolean(busy)} data-verifying={Boolean(busy) || undefined} onClick={() => void request()}>
                  {busy ? <><span className="email-security-dyes" aria-hidden="true"><i /><i /><i /></span><span role="status">{busy}</span></>
                    : resuming ? "Resume authorized campaign" : methods.includes("emailOtp") ? "Send verification code" : "Prepare authorization"}
                </GlassButton>
              </div>
            </div>}
            {(stage === "emailOtp" || stage === "sendPin") && challenge && <VerificationChallenge challenge={challenge} busy={Boolean(busy)} focusInput
              error={error} processingAction={busy?.startsWith("Verifying") ? "verify" : busy?.startsWith("Sending") ? "resend" : undefined}
              onVerify={values => run(next === "sendPin" ? "Verifying PIN…" : "Verifying code…", async () => {
                const result = await securityFetch<ApprovalView>(base + "/verify", { ...values, approvalId: challenge.approvalId, batch });
                if (mounted.current) setChallenge(result);
              })}
              onResend={() => run("Sending verification code…", async () => {
                const result = await securityFetch<ApprovalView>(base + "/resend", { approvalId: challenge.approvalId, batch });
                if (mounted.current) setChallenge(result);
              })} />}
            {stage === "commit" && <div className="email-security-commit">
              {verified && !expired && <p className="email-security-verified" role="status"><Check size={17} /> Identity verified</p>}
              {challenge?.resumed && <p className="email-security-note">This campaign is already authorized. Only pending recipients will be processed.</p>}
              {expired ? <p role="status">Verification expired. Please verify this delivery again.</p> : <>
                <p>{batch.mode === "draft" ? "Nothing will be sent. Keep this website open while drafts are created." : count + " " + noun + " will be sent in short batches. Keep this website open; you can continue working in the dashboard."}</p>
                {batch.mode === "send" && challenge?.holdToSend ? <HoldToSendButton count={count} resetKey={attempt}
                  disabled={Boolean(busy) || delivering} phase={phase} onCommit={commit} />
                  : <GlassButton disabled={Boolean(busy) || delivering} data-verifying={phase === "committing" || undefined} onClick={commit}>
                    {phase === "committing" ? <><span className="email-security-dyes" aria-hidden="true"><i /><i /><i /></span><span>{busy}</span></>
                      : phase === "accepted" ? batch.mode === "draft" ? "Draft creation started" : "Delivery started"
                      : batch.mode === "draft" ? "Create " + count + " " + (count === 1 ? "draft" : "drafts") : "Send " + count + " " + noun}
                  </GlassButton>}
              </>}
            </div>}
            {expired && !busy && <GlassButton onClick={() => { setChallenge(null); void request(); }}>Request new approval</GlassButton>}
          </motion.div>
      </EmailMotionRegion>
    </div>
  </TrackerModal>;
}


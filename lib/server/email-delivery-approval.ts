import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Session } from "next-auth";
import { connectDB } from "@/lib/mongoose";
import { getRequestIp } from "@/lib/authUsers";
import { getAdminEmail } from "@/lib/adminAuth";
import Settings, {
  type SecuritySettings,
} from "@/models/EmailDeliverySecuritySettings";
import Approval, {
  type DeliveryApproval,
} from "@/models/EmailDeliveryApproval";
import Audit from "@/models/EmailDeliverySecurityAudit";
import Gate from "@/models/EmailDeliverySecurityGate";
import Campaign from "@/models/TrackerEmailCampaign";
import ClientTracker from "@/models/ClientTracker";
import {
  EMAIL_DELIVERY_SECURITY_DEFAULTS,
  deliveryPolicySchema,
  maskApprovalEmail,
  requiredDeliveryMethods,
  type ApprovalMethod,
  type ApprovalView,
  type DeliveryBatch,
} from "@/lib/email-delivery-security";
import {
  DeliverySecurityError,
  generateDeliveryOtp,
  hashDeliveryOtp,
  matchesDeliveryOtp,
  matchesSendPin,
  securitySecret,
} from "./email-delivery-crypto";
import {
  trackerEmailBatchHash,
  validateDeliveryRecipients,
} from "./tracker-email-batch";
import { deliverThroughGmail } from "./gmail-delivery";
import { renderVerificationEmail } from "@/lib/email-verification-template";
import { validateTrackerAttachmentBatch } from "./tracker-attachment-snapshot";
import type { TrackerEmailWorkflow } from "@/lib/clientTrackers";

export type SecurityContext = {
  owner: string;
  userId?: string;
  userEmail: string;
  ip: string;
  userAgent: string;
  session: Session;
};
export type AuthorizedCampaign = {
  _id: unknown;
  campaignId: string;
  trackerId: string;
  workflowId: string;
  mailKind: string;
  mode: string;
  createdBy?: string;
  authorizedBy?: string;
  batchHash?: string;
  approvalId?: string;
  authorizedAt?: Date;
  status: string;
  total: number;
  completed: number;
  failed: number;
  items: Array<
    DeliveryBatch["messages"][number] & {
      status?:
        | "pending"
        | "delivering"
        | "uncertain"
        | "sent"
        | "draft"
        | "failed";
    }
  >;
};
export function securityContext(
  session: Session,
  headers: Headers,
): SecurityContext {
  const userId = (session.user as typeof session.user & { id?: string })?.id;
  const userEmail = session.user?.email?.trim().toLowerCase();
  if (!userEmail)
    throw new DeliverySecurityError(
      "An authenticated account email is required.",
    );
  return {
    owner: userId ? `user:${userId}:${userEmail}` : `email:${userEmail}`,
    userId,
    userEmail,
    ip: getRequestIp(headers).slice(0, 100),
    userAgent: (headers.get("user-agent") || "").slice(0, 500),
    session,
  };
}
let indexReady: Promise<unknown> | undefined;
export async function securityDatabase() {
  await connectDB();
  // Unique/TTL indexes are prerequisites, including in a newly created database.
  indexReady ??= Promise.all(
    [Settings, Approval, Audit, Gate, Campaign].map(async (model) => {
      await model.init();
      // Explicit creation also covers deployments with Mongoose autoIndex disabled.
      await model.createIndexes();
    }),
  ).catch((error) => {
    indexReady = undefined;
    throw error;
  });
  await indexReady;
}
export async function loadSecuritySettings(): Promise<SecuritySettings> {
  await securityDatabase();
  try {
    await Settings.updateOne(
      { key: "global" },
      { $setOnInsert: { key: "global" } },
      { upsert: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  const settings = (await Settings.findOne({ key: "global" })
    .select("+approvalEmail +sendPinHash")
    .lean()) as unknown as SecuritySettings;
  // Lean reads of existing documents do not apply defaults for newly added fields.
  return { ...EMAIL_DELIVERY_SECURITY_DEFAULTS, ...settings };
}
export function publicSecuritySettings(settings: SecuritySettings) {
  return {
    ...deliveryPolicySchema.parse(
      Object.fromEntries(
        Object.keys(EMAIL_DELIVERY_SECURITY_DEFAULTS).map((key) => [
          key,
          settings[key as keyof SecuritySettings],
        ]),
      ),
    ),
    version: settings.version,
    approvalEmailMasked: maskApprovalEmail(settings.approvalEmail),
    approvalEmailVerified: Boolean(
      settings.approvalEmail && settings.approvalEmailVerifiedAt,
    ),
    sendPinConfigured: Boolean(settings.sendPinHash),
    auditEnabled: true as const,
    ...(!settings.approvalEmail
      ? { suggestedApprovalEmail: getAdminEmail() }
      : {}),
  };
}
export type SafeAuditData = {
  trackerId?: string;
  workflowId?: string;
  campaignId?: string;
  approvalId?: string;
  mode?: string;
  mailKind?: string;
  messageCount?: number;
  approvalMethod?: string;
  result?: string;
  details?: Record<string, unknown>;
};
/** Callers pass explicit safe metadata only; never a request body or model document. */
export async function securityAudit(
  context: SecurityContext,
  event: string,
  data: SafeAuditData = {},
) {
  await Audit.create({
    event,
    userId: context.userId,
    userEmail: context.userEmail,
    ip: context.ip,
    userAgent: context.userAgent,
    ...data,
  });
}
export function approvalAuditData(approval: DeliveryApproval): SafeAuditData {
  return {
    approvalId: approval.approvalId,
    trackerId: approval.trackerId,
    workflowId: approval.workflowId,
    campaignId: approval.campaignId,
    mode: approval.mode,
    mailKind: approval.mailKind,
    messageCount: approval.messageCount,
    approvalMethod: approval.method,
  };
}
async function ensureGate(key: string) {
  try {
    await Gate.updateOne(
      { key },
      { $setOnInsert: { key, events: [] } },
      { upsert: true },
    );
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
}
/** MongoDB's conditional single-document update reserves each rolling-window slot atomically. */
export async function securityRateLimit(
  key: string,
  maximum: number,
  seconds: number,
) {
  await ensureGate(key);
  const now = new Date(),
    since = new Date(now.getTime() - seconds * 1000);
  const recent = {
    $filter: {
      input: "$events",
      as: "event",
      cond: { $gt: ["$$event", since] },
    },
  };
  const reserved = await Gate.findOneAndUpdate(
    { key, $expr: { $lt: [{ $size: recent }, maximum] } },
    [
      {
        $set: {
          events: { $concatArrays: [recent, [now]] },
          cleanupAt: new Date(
            now.getTime() + Math.max(seconds * 2000, 86_400_000),
          ),
        },
      },
    ],
    { new: true },
  );
  if (!reserved)
    throw new DeliverySecurityError(
      "Too many attempts. Please wait before trying again.",
      429,
      "RATE_LIMITED",
    );
}
export function assertProtectionConfigured(
  settings: SecuritySettings,
  methods: ApprovalMethod[],
) {
  if (methods.includes("emailOtp")) {
    if (!settings.approvalEmail || !settings.approvalEmailVerifiedAt)
      throw new DeliverySecurityError(
        "Email delivery is locked until an approval email is configured and verified in Settings → Email & Delivery.",
        409,
        "APPROVAL_EMAIL_REQUIRED",
      );
    securitySecret("EMAIL_DELIVERY_OTP_SECRET");
  }
  if (methods.includes("sendPin")) {
    if (!settings.sendPinHash)
      throw new DeliverySecurityError(
        "Configure a Send PIN in Settings → Email & Delivery before using protected delivery.",
        409,
        "SEND_PIN_REQUIRED",
      );
    securitySecret("EMAIL_SEND_PIN_PEPPER");
  }
}
export function publicApproval(
  approval: DeliveryApproval,
  settings: SecuritySettings,
): ApprovalView {
  return {
    approvalId: approval.approvalId,
    methodsRequired: approval.methodsRequired,
    methodsVerified: [
      ...(approval.otpVerifiedAt ? ["emailOtp" as const] : []),
      ...(approval.pinVerifiedAt ? ["sendPin" as const] : []),
    ],
    approvalEmailMasked: maskApprovalEmail(
      approval.pendingEmail || settings.approvalEmail,
    ),
    expiresAt: approval.expiresAt.toISOString(),
    otpExpiresAt: approval.otpExpiresAt?.toISOString() || null,
    resendAvailableAt: approval.otpSentAt
      ? new Date(
          approval.otpSentAt.getTime() +
            settings.otpResendCooldownSeconds * 1000,
        ).toISOString()
      : null,
    status: approval.status,
    messageCount: approval.messageCount,
    holdToSend: approval.holdToSend,
    ...(approval.mode === "send" &&
    settings.requireEmailOtpForLargeBatch &&
    approval.messageCount >= settings.largeBatchThreshold
      ? { largeBatchThreshold: settings.largeBatchThreshold }
      : {}),
  };
}
export async function sendApprovalOtp(
  context: SecurityContext,
  approval: DeliveryApproval,
  settings: SecuritySettings,
  resend = false,
) {
  securitySecret("EMAIL_DELIVERY_OTP_SECRET");
  const destination =
    approval.pendingEmail ||
    (settings.approvalEmailVerifiedAt && settings.approvalEmail);
  if (!destination)
    throw new DeliverySecurityError(
      "Verify an approval email in Settings first.",
      409,
      "APPROVAL_EMAIL_REQUIRED",
    );
  await securityRateLimit(
    `otp-cooldown:${context.owner}:${createHash("sha256").update(destination).digest("hex")}`,
    1,
    settings.otpResendCooldownSeconds,
  );
  await securityRateLimit(`otp-hour:${context.owner}`, 10, 3600);
  await securityRateLimit("otp-hour:organization", 100, 3600);
  const now = new Date(),
    expiresAt = new Date(now.getTime() + settings.otpExpiryMinutes * 60_000);
  let code = generateDeliveryOtp();
  // Even the rare repeated random value must not keep the preceding OTP usable.
  while (
    resend &&
    hashDeliveryOtp(approval.approvalId, code) === approval.otpHash
  )
    code = generateDeliveryOtp();
  const updated = (await Approval.findOneAndUpdate(
    {
      approvalId: approval.approvalId,
      owner: context.owner,
      status: "pending",
      policyVersion: settings.version,
      otpVerifiedAt: null,
      ...(resend
        ? {
            otpSentAt: {
              $lte: new Date(
                now.getTime() - settings.otpResendCooldownSeconds * 1000,
              ),
            },
            otpHash: approval.otpHash,
          }
        : { otpSentAt: null }),
    },
    {
      $set: {
        otpHash: hashDeliveryOtp(approval.approvalId, code),
        otpSentAt: now,
        otpExpiresAt: expiresAt,
        expiresAt,
      },
      $inc: { otpResendCount: resend ? 1 : 0 },
    },
    { new: true },
  )
    .select("+pendingEmail +otpHash")
    .lean()) as unknown as DeliveryApproval | null;
  if (!updated)
    throw new DeliverySecurityError(
      "This verification request changed or the resend cooldown has not elapsed.",
      429,
      "RESEND_UNAVAILABLE",
    );
  try {
    const email = renderVerificationEmail({
      verificationCode: code,
      expiryMinutes: settings.otpExpiryMinutes,
      purpose: approval.purpose,
      messageCount: approval.messageCount,
      mode: approval.mode === "draft" ? "draft" : "send",
    });
    await deliverThroughGmail({
      to: [destination],
      cc: [],
      mode: "send",
      ...email,
      appendDefaultSignature: false,
    });
  } catch {
    await Approval.updateOne(
      {
        approvalId: approval.approvalId,
        status: "pending",
        otpHash: updated.otpHash,
      },
      { $set: { status: "cancelled" }, $unset: { otpHash: 1 } },
    );
    await securityAudit(context, "otp_delivery_failed", {
      ...approvalAuditData(approval),
      result: "failed",
    });
    throw new DeliverySecurityError(
      "Unable to send the verification code. Check Gmail setup and try again after the cooldown.",
      503,
      "OTP_DELIVERY_FAILED",
    );
  }
  await securityAudit(
    context,
    resend ? "otp_resent" : "otp_sent",
    approvalAuditData(updated),
  );
  return updated;
}
export async function createApproval(
  context: SecurityContext,
  settings: SecuritySettings,
  input: Partial<DeliveryApproval> & {
    purpose: string;
    methodsRequired: ApprovalMethod[];
  },
) {
  const now = new Date();
  await securityRateLimit(`approval-requests:${context.owner}`, 30, 600);
  await Approval.updateMany(
    {
      owner: context.owner,
      purpose: input.purpose,
      campaignId: input.campaignId || null,
      status: { $in: ["pending", "verified"] },
    },
    { $set: { status: "cancelled" }, $unset: { otpHash: 1 } },
  );
  let approval = await Approval.create({
    approvalId: randomUUID(),
    owner: context.owner,
    createdByUserId: context.userId,
    createdByEmail: context.userEmail,
    policyVersion: settings.version,
    messageCount: 0,
    holdToSend: false,
    expiresAt: new Date(now.getTime() + settings.otpExpiryMinutes * 60_000),
    cleanupAt: new Date(now.getTime() + 7 * 86_400_000),
    status: input.methodsRequired.length ? "pending" : "verified",
    ...(!input.methodsRequired.length ? { verifiedAt: now } : {}),
    ...input,
    method: input.methodsRequired.join("+") || "confirmation",
  });
  approval = approval.toObject();
  await securityAudit(
    context,
    "approval_requested",
    approvalAuditData(approval),
  );
  if (input.methodsRequired.includes("emailOtp"))
    approval = await sendApprovalOtp(context, approval, settings);
  return publicApproval(approval, settings);
}
export async function readOwnedApproval(
  context: SecurityContext,
  id: string,
  purpose: string,
  settings: SecuritySettings,
): Promise<DeliveryApproval> {
  const approval = (await Approval.findOne({
    approvalId: id,
    owner: context.owner,
    purpose,
  })
    .select("+otpHash +pendingEmail")
    .lean()) as unknown as DeliveryApproval | null;
  if (!approval)
    throw new DeliverySecurityError(
      "This approval is unavailable.",
      403,
      "APPROVAL_UNAVAILABLE",
    );
  if (approval.status === "locked")
    throw new DeliverySecurityError(
      "Too many attempts. This approval is locked. Request a new approval.",
      423,
      "APPROVAL_LOCKED",
      0,
    );
  if (!["pending", "verified"].includes(approval.status))
    throw new DeliverySecurityError(
      "This approval is no longer available. Verify this action again.",
      409,
      "APPROVAL_UNAVAILABLE",
    );
  if (approval.expiresAt <= new Date()) {
    await Approval.updateOne(
      { approvalId: id, status: { $in: ["pending", "verified"] } },
      { $set: { status: "expired" }, $unset: { otpHash: 1 } },
    );
    await securityAudit(
      context,
      "approval_expired",
      approvalAuditData(approval),
    );
    throw new DeliverySecurityError(
      "Verification expired. Please verify this action again.",
      410,
      "APPROVAL_EXPIRED",
    );
  }
  if (approval.policyVersion !== settings.version)
    throw new DeliverySecurityError(
      "Delivery security changed. Please authorize this action again.",
      409,
      "POLICY_CHANGED",
    );
  return approval;
}
export async function verifyApproval(
  context: SecurityContext,
  approval: DeliveryApproval,
  settings: SecuritySettings,
  values: { otp?: string; pin?: string },
) {
  for (const method of ["emailOtp", "sendPin"] as const) {
    const value = method === "emailOtp" ? values.otp : values.pin;
    if (value === undefined) continue;
    if (!approval.methodsRequired.includes(method))
      throw new DeliverySecurityError(
        "This verification method is not required.",
        400,
      );
    const field = method === "emailOtp" ? "otpVerifiedAt" : "pinVerifiedAt",
      attempts = method === "emailOtp" ? "otpAttempts" : "pinAttempts";
    if (approval[field]) continue;
    if (
      method === "emailOtp" &&
      (!approval.otpExpiresAt || approval.otpExpiresAt <= new Date())
    )
      throw new DeliverySecurityError(
        "Code expired. Request a new verification code.",
        410,
        "OTP_EXPIRED",
      );
    if (method === "sendPin")
      await securityRateLimit(`pin-attempts:${context.owner}`, 10, 900);
    const current = (await Approval.findOneAndUpdate(
      {
        approvalId: approval.approvalId,
        owner: context.owner,
        status: "pending",
        policyVersion: settings.version,
        expiresAt: { $gt: new Date() },
        [field]: null,
        [attempts]: { $lt: settings.otpMaxAttempts },
        ...(method === "emailOtp"
          ? { otpHash: approval.otpHash, otpExpiresAt: { $gt: new Date() } }
          : {}),
      },
      { $inc: { [attempts]: 1 } },
      { new: true },
    )
      .select("+otpHash +pendingEmail")
      .lean()) as unknown as DeliveryApproval | null;
    if (!current)
      throw new DeliverySecurityError(
        "This verification changed, expired, or exhausted its attempts. Request a new approval.",
        409,
        "APPROVAL_CHANGED",
      );
    const valid =
      method === "emailOtp"
        ? matchesDeliveryOtp(approval.approvalId, value, current.otpHash)
        : Boolean(
            settings.sendPinHash &&
              (await matchesSendPin(value, settings.sendPinHash)),
          );
    if (!valid) {
      const remaining = Math.max(
        0,
        settings.otpMaxAttempts - current[attempts],
      );
      if (!remaining) {
        await Approval.updateOne(
          {
            approvalId: approval.approvalId,
            status: "pending",
            [attempts]: { $gte: settings.otpMaxAttempts },
          },
          { $set: { status: "locked" }, $unset: { otpHash: 1 } },
        );
        await securityAudit(
          context,
          "approval_locked",
          approvalAuditData(approval),
        );
      }
      await securityAudit(
        context,
        method === "emailOtp" ? "otp_verify_failed" : "pin_verify_failed",
        { ...approvalAuditData(approval), result: "failed" },
      );
      throw new DeliverySecurityError(
        `Incorrect ${method === "emailOtp" ? "code" : "Send PIN"}. ${remaining} attempts remaining.`,
        remaining ? 400 : 423,
        remaining ? "INCORRECT_CODE" : "APPROVAL_LOCKED",
        remaining,
      );
    }
    const saved = (await Approval.findOneAndUpdate(
      {
        approvalId: approval.approvalId,
        owner: context.owner,
        status: "pending",
        policyVersion: settings.version,
        expiresAt: { $gt: new Date() },
        ...(method === "emailOtp"
          ? { otpHash: current.otpHash, otpExpiresAt: { $gt: new Date() } }
          : {}),
      },
      { $set: { [field]: new Date() } },
      { new: true },
    )
      .select("+otpHash +pendingEmail")
      .lean()) as unknown as DeliveryApproval | null;
    if (!saved)
      throw new DeliverySecurityError(
        "This verification changed. Please verify again.",
        409,
        "APPROVAL_CHANGED",
      );
    approval = saved;
    await securityAudit(
      context,
      method === "emailOtp" ? "otp_verified" : "pin_verified",
      { ...approvalAuditData(approval), result: "verified" },
    );
  }
  const completed = (await Approval.findOneAndUpdate(
    {
      approvalId: approval.approvalId,
      owner: context.owner,
      status: "pending",
      policyVersion: settings.version,
      expiresAt: { $gt: new Date() },
      ...(approval.methodsRequired.includes("emailOtp")
        ? { otpVerifiedAt: { $ne: null } }
        : {}),
      ...(approval.methodsRequired.includes("sendPin")
        ? { pinVerifiedAt: { $ne: null } }
        : {}),
    },
    {
      $set: { status: "verified", verifiedAt: new Date() },
      $unset: { otpHash: 1 },
    },
    { new: true },
  )
    .select("+pendingEmail")
    .lean()) as unknown as DeliveryApproval | null;
  if (completed) {
    approval = completed;
    await securityAudit(context, "approval_completed", {
      ...approvalAuditData(approval),
      result: "verified",
    });
  }
  return publicApproval(approval, settings);
}
export async function consumeSettingsApproval(
  context: SecurityContext,
  id: string | undefined,
  purpose: string,
  settings: SecuritySettings,
) {
  if (!id)
    throw new DeliverySecurityError(
      "Verify this settings change first.",
      403,
      "SETTINGS_APPROVAL_REQUIRED",
    );
  await readOwnedApproval(context, id, purpose, settings);
  const consumed = (await Approval.findOneAndUpdate(
    {
      approvalId: id,
      owner: context.owner,
      purpose,
      status: "verified",
      consumedAt: null,
      policyVersion: settings.version,
      expiresAt: { $gt: new Date() },
    },
    {
      $set: { status: "consumed", consumedAt: new Date() },
      $unset: { otpHash: 1 },
    },
    { new: true },
  )
    .select("+pendingEmail")
    .lean()) as unknown as DeliveryApproval | null;
  if (!consumed)
    throw new DeliverySecurityError(
      "This approval expired or has already been used.",
      409,
      "APPROVAL_UNAVAILABLE",
    );
  return consumed;
}
export function managementMethods(
  settings: SecuritySettings,
): ApprovalMethod[] {
  return settings.approvalEmailVerifiedAt && settings.approvalEmail
    ? ["emailOtp"]
    : settings.sendPinHash
      ? ["sendPin"]
      : [];
}
export async function assertTrackerAvailable(
  trackerId: string,
  batch: DeliveryBatch,
) {
  const tracker = await ClientTracker.findById(trackerId)
    .select("name status financialYear emailEnabled emailWorkflows")
    .lean<{
      name: string;
      status: string;
      emailEnabled?: boolean;
      financialYear?: string;
      emailWorkflows?: TrackerEmailWorkflow[];
    } | null>();
  const workflow = tracker?.emailWorkflows?.find(
    (item: { id: string }) => item.id === batch.workflowId,
  );
  if (
    !tracker ||
    tracker.status !== "active" ||
    !tracker.emailEnabled ||
    !workflow
  )
    throw new DeliverySecurityError(
      "This tracker email workflow is unavailable.",
      409,
    );
  return {
    trackerName: String(tracker.name),
    workflowName: String(workflow.name),
    workflow,
    financialYear: tracker.financialYear,
  };
}
export function assertCampaignMatches(
  campaign: {
    trackerId: string;
    workflowId: string;
    mailKind: string;
    mode: string;
    createdBy?: string;
    authorizedBy?: string;
    batchHash?: string;
    items: DeliveryBatch["messages"];
  },
  context: SecurityContext,
  trackerId: string,
  batch: DeliveryBatch,
) {
  const ownerMatches = campaign.authorizedBy
    ? campaign.authorizedBy === context.owner
    : Boolean(
        campaign.createdBy &&
          campaign.createdBy.toLowerCase() === context.userEmail,
      );
  const storedHash =
    campaign.batchHash ||
    trackerEmailBatchHash(trackerId, { ...batch, messages: campaign.items });
  if (
    !ownerMatches ||
    campaign.trackerId !== trackerId ||
    campaign.workflowId !== batch.workflowId ||
    campaign.mailKind !== batch.kind ||
    campaign.mode !== batch.mode ||
    storedHash !== trackerEmailBatchHash(trackerId, batch)
  )
    throw new DeliverySecurityError(
      "This campaign belongs to a different user or delivery batch. Authorize a new campaign.",
      409,
      "CAMPAIGN_MISMATCH",
    );
}
export async function requestDeliveryApproval(
  context: SecurityContext,
  trackerId: string,
  batch: DeliveryBatch,
  settings: SecuritySettings,
) {
  validateDeliveryRecipients(batch, false);
  const available = await assertTrackerAvailable(trackerId, batch);
  const existing = await Campaign.findOne({
    campaignId: batch.campaignId,
  }).lean<AuthorizedCampaign | null>();
  if (existing) {
    assertCampaignMatches(existing, context, trackerId, batch);
    if (existing.authorizedAt && existing.batchHash && existing.approvalId)
      return {
        approvalId: existing.approvalId,
        methodsRequired: [],
        methodsVerified: [],
        approvalEmailMasked: null,
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        otpExpiresAt: null,
        resendAvailableAt: null,
        status: "verified",
        messageCount: batch.messages.length,
        holdToSend: batch.mode === "send" && settings.holdToSend,
        resumed: true,
      } satisfies ApprovalView;
  }
  validateDeliveryRecipients(batch, settings.restrictDuplicateRecipients);
  await validateTrackerAttachmentBatch({ trackerId, batch, workflow: available.workflow, financialYear: available.financialYear });
  const methodsRequired = requiredDeliveryMethods(
    settings,
    batch.mode,
    batch.messages.length,
  );
  assertProtectionConfigured(settings, methodsRequired);
  return createApproval(
    context,
    settings,
    {
      purpose: "delivery",
      trackerId,
      workflowId: batch.workflowId,
      campaignId: batch.campaignId,
      mailKind: batch.kind,
      mode: batch.mode,
      batchHash: trackerEmailBatchHash(trackerId, batch),
      methodsRequired,
      messageCount: batch.messages.length,
      holdToSend: batch.mode === "send" && settings.holdToSend,
    },
  );
}
export async function authorizeCampaign(
  context: SecurityContext,
  trackerId: string,
  batch: DeliveryBatch,
  settings: SecuritySettings,
): Promise<AuthorizedCampaign> {
  validateDeliveryRecipients(batch, false);
  const existing = await Campaign.findOne({
    campaignId: batch.campaignId,
  }).lean<AuthorizedCampaign | null>();
  if (existing) {
    assertCampaignMatches(existing, context, trackerId, batch);
    if (existing.authorizedAt && existing.batchHash && existing.approvalId)
      return existing;
  }
  validateDeliveryRecipients(batch, settings.restrictDuplicateRecipients);
  const available = await assertTrackerAvailable(trackerId, batch);
  await validateTrackerAttachmentBatch({ trackerId, batch, workflow: available.workflow, financialYear: available.financialYear });
  const methods = requiredDeliveryMethods(
    settings,
    batch.mode,
    batch.messages.length,
  );
  assertProtectionConfigured(settings, methods);
  const hash = trackerEmailBatchHash(trackerId, batch);
  let approvalId = batch.approvalId;
  if (methods.length) {
    if (!approvalId)
      throw new DeliverySecurityError(
        "Authorize this exact delivery using the required Email OTP or Send PIN first.",
        403,
        "DELIVERY_APPROVAL_REQUIRED",
      );
    const approval = await Approval.findOneAndUpdate(
      {
        approvalId,
        purpose: "delivery",
        owner: context.owner,
        trackerId,
        workflowId: batch.workflowId,
        campaignId: batch.campaignId,
        mode: batch.mode,
        mailKind: batch.kind,
        batchHash: hash,
        policyVersion: settings.version,
        status: "verified",
        consumedAt: null,
        expiresAt: { $gt: new Date() },
        ...(methods.includes("emailOtp")
          ? { otpVerifiedAt: { $ne: null } }
          : {}),
        ...(methods.includes("sendPin")
          ? { pinVerifiedAt: { $ne: null } }
          : {}),
      },
      { $set: { status: "consumed", consumedAt: new Date() } },
      { new: true },
    ).lean();
    if (!approval) {
      // Recover only the same consumed operation after a crash between consumption and campaign binding.
      const consumed = await Approval.findOne({
        approvalId,
        purpose: "delivery",
        owner: context.owner,
        trackerId,
        workflowId: batch.workflowId,
        campaignId: batch.campaignId,
        mode: batch.mode,
        mailKind: batch.kind,
        batchHash: hash,
        policyVersion: settings.version,
        status: "consumed",
        consumedAt: { $ne: null },
      }).lean();
      if (!consumed)
        throw new DeliverySecurityError(
          "Approval is expired, already used, or no longer matches this delivery. Verify the updated batch again.",
          403,
          "DELIVERY_APPROVAL_INVALID",
        );
    }
  } else {
    if (batch.approvalId)
      throw new DeliverySecurityError(
        "This approval does not apply to confirmation-only drafts. Confirm a fresh draft operation.",
        403,
        "DELIVERY_APPROVAL_INVALID",
      );
    if (batch.mode !== "draft" || batch.confirmed !== true)
      throw new DeliverySecurityError(
        "Confirm Gmail draft creation. Nothing will be sent.",
        400,
        "DRAFT_CONFIRMATION_REQUIRED",
      );
    approvalId = randomUUID();
    await securityAudit(context, "draft_confirmation", {
      trackerId,
      workflowId: batch.workflowId,
      campaignId: batch.campaignId,
      mode: batch.mode,
      mailKind: batch.kind,
      messageCount: batch.messages.length,
      approvalMethod: "confirmation",
    });
  }
  const metadata = {
    batchHash: hash,
    approvalId,
    authorizedBy: context.owner,
    authorizedAt: new Date(),
  };
  let campaign: AuthorizedCampaign | null = null;
  if (existing)
    campaign = await Campaign.findOneAndUpdate(
      { campaignId: batch.campaignId, authorizedAt: null },
      { $set: metadata },
      { new: true },
    ).lean<AuthorizedCampaign | null>();
  else {
    try {
      campaign = (
        await Campaign.create({
          campaignId: batch.campaignId,
          trackerId,
          workflowId: batch.workflowId,
          mailKind: batch.kind,
          mode: batch.mode,
          total: batch.messages.length,
          items: batch.messages.map((message) => ({
            ...message,
            status: "pending",
          })),
          createdBy: context.userEmail,
          ...metadata,
        })
      ).toObject() as unknown as AuthorizedCampaign;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }
  campaign ??= await Campaign.findOne({
    campaignId: batch.campaignId,
  }).lean<AuthorizedCampaign | null>();
  if (!campaign)
    throw new DeliverySecurityError(
      "Unable to bind this campaign authorization.",
      503,
    );
  assertCampaignMatches(campaign, context, trackerId, batch);
  await securityAudit(context, "delivery_authorized", {
    trackerId,
    campaignId: batch.campaignId,
    workflowId: batch.workflowId,
    approvalId,
    mode: batch.mode,
    mailKind: batch.kind,
    messageCount: batch.messages.length,
    approvalMethod: methods.join("+") || "confirmation",
  });
  return campaign;
}
export async function acquireDeliveryLease() {
  const key = "client-delivery",
    token = randomUUID();
  await ensureGate(key);
  const reserved = await Gate.findOneAndUpdate(
    { key, $or: [{ token: null }, { leaseUntil: { $lte: new Date() } }] },
    { $set: { token, leaseUntil: new Date(Date.now() + 120_000) } },
    { new: true },
  );
  if (!reserved)
    throw new DeliverySecurityError(
      "Another client email delivery is processing. Retry this same campaign shortly.",
      409,
      "DELIVERY_BUSY",
    );
  return {
    token,
    renew: async () => {
      const result = await Gate.updateOne(
        { key, token, leaseUntil: { $gt: new Date() } },
        { $set: { leaseUntil: new Date(Date.now() + 120_000) } },
      );
      if (!result.matchedCount)
        throw new DeliverySecurityError(
          "Delivery lease ended. Retry this same campaign to resume pending recipients.",
          409,
          "DELIVERY_LEASE_ENDED",
        );
    },
    release: () =>
      Gate.updateOne({ key, token }, { $unset: { token: 1, leaseUntil: 1 } }),
  };
}

import { z } from "zod";

export const EMAIL_DELIVERY_SECURITY_DEFAULTS = {
  draftProtection: "confirmation" as const,
  directSendProtection: "emailOtp" as const,
  holdToSend: true,
  restrictDuplicateRecipients: true,
  otpExpiryMinutes: 5,
  otpResendCooldownSeconds: 45,
  otpMaxAttempts: 5,
  largeBatchThreshold: 50,
  requireEmailOtpForLargeBatch: true,
};
export const deliveryPolicySchema = z
  .object({
    draftProtection: z.enum(["confirmation", "sendPin", "emailOtp"]),
    directSendProtection: z.enum(["emailOtp", "sendPin", "emailOtpAndPin"]),
    holdToSend: z.boolean(),
    restrictDuplicateRecipients: z.boolean().default(true),
    otpExpiryMinutes: z.number().int().min(2).max(10),
    otpResendCooldownSeconds: z.number().int().min(30).max(120),
    otpMaxAttempts: z.number().int().min(3).max(10),
    largeBatchThreshold: z.number().int().min(1).max(1000),
    requireEmailOtpForLargeBatch: z.boolean(),
  })
  .strict();
export type DeliveryPolicy = z.infer<typeof deliveryPolicySchema>;
export type ApprovalMethod = "emailOtp" | "sendPin";
export type DeliverySecurityView = DeliveryPolicy & {
  version: number;
  approvalEmailMasked: string | null;
  approvalEmailVerified: boolean;
  sendPinConfigured: boolean;
  suggestedApprovalEmail?: string;
  auditEnabled: true;
};
export type ApprovalView = {
  approvalId: string;
  methodsRequired: ApprovalMethod[];
  methodsVerified: ApprovalMethod[];
  approvalEmailMasked: string | null;
  expiresAt: string;
  otpExpiresAt: string | null;
  resendAvailableAt: string | null;
  status: string;
  messageCount: number;
  holdToSend: boolean;
  resumed?: boolean;
  largeBatchThreshold?: number;
};
export function maskApprovalEmail(email?: string | null) {
  if (!email) return null;
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}${"•".repeat(Math.min(9, Math.max(4, local.length - 1)))}@${domain}`;
}
export function requiredDeliveryMethods(
  policy: DeliveryPolicy,
  mode: "draft" | "send",
  count: number,
): ApprovalMethod[] {
  const protection =
    mode === "draft" ? policy.draftProtection : policy.directSendProtection;
  const methods: ApprovalMethod[] = [];
  if (protection === "emailOtp" || protection === "emailOtpAndPin")
    methods.push("emailOtp");
  if (protection === "sendPin" || protection === "emailOtpAndPin")
    methods.push("sendPin");
  if (
    mode === "send" &&
    policy.requireEmailOtpForLargeBatch &&
    count >= policy.largeBatchThreshold &&
    !methods.includes("emailOtp")
  )
    methods.unshift("emailOtp");
  return methods;
}

const address = z.string().trim().toLowerCase().email().max(254);
export const trackerDeliverySchema = z.object({
  campaignId: z.string().min(10).max(100),
  workflowId: z.string().min(1).max(80),
  kind: z.enum(["initial", "reminder"]),
  mode: z.enum(["draft", "send"]),
  messages: z
    .array(
      z.object({
        entryId: z.string().min(1).max(100),
        clientId: z.string().min(1).max(100),
        companyName: z.string().min(1).max(400),
        to: z.array(address).min(1).max(100),
        cc: z.array(address).max(100).default([]),
        subject: z.string().min(1).max(200),
        html: z.string().min(1).max(1_000_000),
        attachments: z
          .array(z.object({ documentId: z.string().min(1).max(100) }))
          .max(4)
          .default([]),
      }),
    )
    .min(1)
    .max(1000),
  resume: z.boolean().optional(),
  confirmed: z.literal(true).optional(),
  approvalId: z.string().uuid().optional(),
});
export type DeliveryBatch = z.infer<typeof trackerDeliverySchema>;

/** Also used for UI invalidation; only the server's SHA-256 is authoritative. */
export function canonicalDeliveryBatch(
  trackerId: string,
  batch: DeliveryBatch,
) {
  const normalize = (values: string[]) =>
    values.map((value) => value.trim().toLowerCase()).sort();
  return JSON.stringify({
    trackerId,
    campaignId: batch.campaignId,
    workflowId: batch.workflowId,
    kind: batch.kind,
    mode: batch.mode,
    messages: batch.messages
      .map((message) => ({
        entryId: message.entryId,
        clientId: message.clientId,
        companyName: message.companyName,
        to: normalize(message.to),
        cc: normalize(message.cc || []),
        subject: message.subject,
        html: message.html,
        attachments: (message.attachments || [])
          .map((item) => item.documentId)
          .sort(),
      }))
      .sort((a, b) =>
        a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0,
      ),
  });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import Settings, {
  type SecuritySettings,
} from "@/models/EmailDeliverySecuritySettings";
import {
  consumeSettingsApproval,
  createApproval,
  loadSecuritySettings,
  managementMethods,
  publicApproval,
  publicSecuritySettings,
  readOwnedApproval,
  securityAudit,
  sendApprovalOtp,
  verifyApproval,
} from "@/lib/server/email-delivery-approval";
import {
  DeliverySecurityError,
  securitySecret,
} from "@/lib/server/email-delivery-crypto";
import {
  securityRequestBody,
  withDeliverySecurity,
} from "@/lib/server/email-delivery-security-api";
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("request"),
      email: z.string().trim().toLowerCase().email().max(254),
      approvalId: z.string().uuid().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("verify"),
      approvalId: z.string().uuid(),
      otp: z.string().regex(/^\d{6}$/),
    })
    .strict(),
  z
    .object({ action: z.literal("resend"), approvalId: z.string().uuid() })
    .strict(),
]);
export const POST = withDeliverySecurity(async (request, context) => {
  const input = schema.parse(await securityRequestBody(request)),
    settings = await loadSecuritySettings();
  if (input.action === "request") {
    if (
      settings.approvalEmailVerifiedAt &&
      input.email === settings.approvalEmail
    )
      throw new DeliverySecurityError(
        "This approval email is already verified. Enter a different address to change it.",
        400,
      );
    securitySecret("EMAIL_DELIVERY_OTP_SECRET");
    if (managementMethods(settings).length)
      await consumeSettingsApproval(
        context,
        input.approvalId,
        "approval-email-change",
        settings,
      );
    await securityAudit(
      context,
      settings.approvalEmail
        ? "approval_email_change_started"
        : "approval_email_setup_started",
    );
    return NextResponse.json(
      await createApproval(
        context,
        settings,
        {
          purpose: "approval-email-verify",
          methodsRequired: ["emailOtp"],
          pendingEmail: input.email,
        },
      ),
    );
  }
  const approval = await readOwnedApproval(
    context,
    input.approvalId,
    "approval-email-verify",
    settings,
  );
  if (input.action === "resend")
    return NextResponse.json(
      publicApproval(
        await sendApprovalOtp(
          context,
          approval,
          settings,
          true,
        ),
        settings,
      ),
    );
  const result = await verifyApproval(context, approval, settings, {
    otp: input.otp,
  });
  if (result.status !== "verified")
    throw new DeliverySecurityError(
      "Verify the new approval email first.",
      403,
    );
  const consumed = await consumeSettingsApproval(
    context,
    input.approvalId,
    "approval-email-verify",
    settings,
  );
  if (!consumed.pendingEmail)
    throw new DeliverySecurityError(
      "This approval email verification is unavailable.",
      409,
    );
  const updated = await Settings.findOneAndUpdate(
    { key: "global", version: settings.version },
    {
      $set: {
        approvalEmail: consumed.pendingEmail,
        approvalEmailVerifiedAt: new Date(),
        updatedBy: context.userEmail,
      },
      $inc: { version: 1 },
    },
    { new: true },
  )
    .select("+approvalEmail +sendPinHash")
    .lean<SecuritySettings | null>();
  if (!updated)
    throw new DeliverySecurityError(
      "Settings changed. Verify the approval email again.",
      409,
      "POLICY_CHANGED",
    );
  await securityAudit(
    context,
    settings.approvalEmail
      ? "approval_email_changed"
      : "approval_email_verified",
    { approvalId: consumed.approvalId, result: "verified" },
  );
  return NextResponse.json({ settings: publicSecuritySettings(updated) });
});

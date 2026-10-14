import { NextResponse } from "next/server";
import { z } from "zod";
import Settings, {
  type SecuritySettings,
} from "@/models/EmailDeliverySecuritySettings";
import {
  consumeSettingsApproval,
  loadSecuritySettings,
  managementMethods,
  publicSecuritySettings,
  securityAudit,
} from "@/lib/server/email-delivery-approval";
import {
  DeliverySecurityError,
  hashSendPin,
} from "@/lib/server/email-delivery-crypto";
import {
  securityRequestBody,
  withDeliverySecurity,
} from "@/lib/server/email-delivery-security-api";
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("save"),
      pin: z.string().regex(/^\d{6}$/),
      confirmPin: z.string().regex(/^\d{6}$/),
      approvalId: z.string().uuid().optional(),
    })
    .strict(),
  z
    .object({ action: z.literal("remove"), approvalId: z.string().uuid() })
    .strict(),
]);
export const POST = withDeliverySecurity(async (request, context) => {
  const input = schema.parse(await securityRequestBody(request)),
    settings = await loadSecuritySettings();
  if (input.action === "save" && input.pin !== input.confirmPin)
    throw new DeliverySecurityError("The six-digit PINs must match.", 400);
  const hash =
    input.action === "save" ? await hashSendPin(input.pin) : undefined;
  if (managementMethods(settings).length || input.action === "remove")
    await consumeSettingsApproval(
      context,
      input.approvalId,
      "send-pin-update",
      settings,
    );
  const updated = await Settings.findOneAndUpdate(
    { key: "global", version: settings.version },
    {
      $set: {
        ...(hash ? { sendPinHash: hash } : {}),
        updatedBy: context.userEmail,
      },
      $inc: { version: 1 },
      ...(!hash ? { $unset: { sendPinHash: 1 } } : {}),
    },
    { new: true },
  )
    .select("+approvalEmail +sendPinHash")
    .lean<SecuritySettings | null>();
  if (!updated)
    throw new DeliverySecurityError(
      "Settings changed. Verify the PIN change again.",
      409,
      "POLICY_CHANGED",
    );
  await securityAudit(
    context,
    input.action === "remove"
      ? "send_pin_removed"
      : settings.sendPinHash
        ? "send_pin_changed"
        : "send_pin_created",
    { result: "saved", approvalId: input.approvalId },
  );
  return NextResponse.json(publicSecuritySettings(updated));
});

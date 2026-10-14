import { NextResponse } from "next/server";
import { z } from "zod";
import Settings, {
  type SecuritySettings,
} from "@/models/EmailDeliverySecuritySettings";
import { deliveryPolicySchema } from "@/lib/email-delivery-security";
import {
  loadSecuritySettings,
  publicSecuritySettings,
  managementMethods,
  consumeSettingsApproval,
  securityAudit,
} from "@/lib/server/email-delivery-approval";
import { DeliverySecurityError } from "@/lib/server/email-delivery-crypto";
import {
  securityRequestBody,
  withDeliverySecurity,
} from "@/lib/server/email-delivery-security-api";
export const GET = withDeliverySecurity(async () =>
  NextResponse.json(publicSecuritySettings(await loadSecuritySettings())),
);
export const PATCH = withDeliverySecurity(async (request, context) => {
  const input = z
    .object({
      policy: deliveryPolicySchema,
      version: z.number().int().min(0),
      approvalId: z.string().uuid().optional(),
    })
    .strict()
    .parse(await securityRequestBody(request));
  const settings = await loadSecuritySettings();
  if (settings.version !== input.version)
    throw new DeliverySecurityError(
      "Settings changed. Reload them before saving.",
      409,
      "POLICY_CHANGED",
    );
  if (managementMethods(settings).length)
    await consumeSettingsApproval(
      context,
      input.approvalId,
      "settings-update",
      settings,
    );
  const before = publicSecuritySettings(settings);
  await securityAudit(context, "settings_update_requested", {
    details: { proposed: input.policy, version: settings.version },
  });
  const updated = await Settings.findOneAndUpdate(
    { key: "global", version: input.version },
    {
      $set: { ...input.policy, updatedBy: context.userEmail },
      $inc: { version: 1 },
    },
    { new: true, runValidators: true },
  )
    .select("+approvalEmail +sendPinHash")
    .lean<SecuritySettings | null>();
  if (!updated)
    throw new DeliverySecurityError(
      "Settings changed. Verify the change again.",
      409,
      "POLICY_CHANGED",
    );
  const after = publicSecuritySettings(updated);
  await securityAudit(context, "settings_updated", {
    result: "saved",
    details: {
      before: deliveryPolicySchema.parse(
        Object.fromEntries(
          Object.keys(input.policy).map((key) => [
            key,
            before[key as keyof typeof before],
          ]),
        ),
      ),
      after: input.policy,
    },
  });
  return NextResponse.json(after);
});

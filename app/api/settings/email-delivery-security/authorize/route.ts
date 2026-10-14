import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertProtectionConfigured,
  createApproval,
  loadSecuritySettings,
  managementMethods,
  publicApproval,
  readOwnedApproval,
  sendApprovalOtp,
  verifyApproval,
} from "@/lib/server/email-delivery-approval";
import {
  securityRequestBody,
  verificationFields,
  withDeliverySecurity,
} from "@/lib/server/email-delivery-security-api";
const purpose = z.enum([
  "settings-update",
  "send-pin-update",
  "approval-email-change",
]);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), purpose }).strict(),
  z
    .object({ action: z.literal("verify"), purpose, ...verificationFields })
    .strict(),
  z
    .object({
      action: z.literal("resend"),
      purpose,
      approvalId: z.string().uuid(),
    })
    .strict(),
]);
export const POST = withDeliverySecurity(async (request, context) => {
  const input = schema.parse(await securityRequestBody(request)),
    settings = await loadSecuritySettings();
  if (input.action === "request") {
    const methodsRequired = managementMethods(settings);
    assertProtectionConfigured(settings, methodsRequired);
    return NextResponse.json(
      await createApproval(
        context,
        settings,
        { purpose: input.purpose, methodsRequired },
      ),
    );
  }
  const approval = await readOwnedApproval(
    context,
    input.approvalId,
    input.purpose,
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
  return NextResponse.json(
    await verifyApproval(context, approval, settings, input),
  );
});

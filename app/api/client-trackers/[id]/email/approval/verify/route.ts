import { NextResponse } from "next/server";
import { z } from "zod";
import { trackerDeliverySchema } from "@/lib/email-delivery-security";
import {
  loadSecuritySettings,
  readOwnedApproval,
  verifyApproval,
} from "@/lib/server/email-delivery-approval";
import { DeliverySecurityError } from "@/lib/server/email-delivery-crypto";
import { trackerEmailBatchHash } from "@/lib/server/tracker-email-batch";
import {
  securityRequestBody,
  verificationFields,
  withDeliverySecurity,
} from "@/lib/server/email-delivery-security-api";
const schema = z
  .object({ ...verificationFields, batch: trackerDeliverySchema })
  .strict();
export const POST = withDeliverySecurity(
  async (request, context, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params,
      input = schema.parse(await securityRequestBody(request)),
      settings = await loadSecuritySettings();
    const approval = await readOwnedApproval(
      context,
      input.approvalId,
      "delivery",
      settings,
    );
    if (
      approval.trackerId !== id ||
      approval.batchHash !== trackerEmailBatchHash(id, input.batch)
    )
      throw new DeliverySecurityError(
        "Approval no longer matches this delivery. Authorize the updated batch again.",
        409,
        "BATCH_CHANGED",
      );
    return NextResponse.json(
      await verifyApproval(context, approval, settings, input),
    );
  },
);

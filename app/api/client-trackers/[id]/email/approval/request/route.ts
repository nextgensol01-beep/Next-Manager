import { NextResponse } from "next/server";
import { trackerDeliverySchema } from "@/lib/email-delivery-security";
import {
  loadSecuritySettings,
  requestDeliveryApproval,
} from "@/lib/server/email-delivery-approval";
import {
  securityRequestBody,
  withDeliverySecurity,
} from "@/lib/server/email-delivery-security-api";
export const POST = withDeliverySecurity(
  async (request, context, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const batch = trackerDeliverySchema.parse(
      await securityRequestBody(request),
    );
    return NextResponse.json(
      await requestDeliveryApproval(
        context,
        id,
        batch,
        await loadSecuritySettings(),
      ),
    );
  },
);

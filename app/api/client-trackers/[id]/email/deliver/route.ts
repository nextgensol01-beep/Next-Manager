import { NextResponse } from "next/server";
import { trackerDeliverySchema } from "@/lib/email-delivery-security";
import { acceptDeliveryJob } from "@/lib/server/email-delivery-jobs";
import { securityRequestBody, withDeliverySecurity } from "@/lib/server/email-delivery-security-api";
export const runtime = "nodejs";
export const POST = withDeliverySecurity(async (request, context, { params }: { params: Promise<{ id: string }> }) => {
  const batch = trackerDeliverySchema.parse(await securityRequestBody(request));
  const { id } = await params;
  const accepted = await acceptDeliveryJob(context, id, batch);
  return NextResponse.json(accepted, { status: accepted.outcome === "accepted" ? 202 : 200 });
});

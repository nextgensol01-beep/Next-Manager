import { NextResponse } from "next/server";
import { withDeliverySecurity } from "@/lib/server/email-delivery-security-api";
import { findOwnedJob, deliveryJobView } from "@/lib/server/email-delivery-jobs";
export const dynamic = "force-dynamic";
export const GET = withDeliverySecurity(async (_request, context, { params }: { params: Promise<{ campaignId: string }> }) => {
  const { campaignId } = await params;
  return NextResponse.json({ job: await deliveryJobView(await findOwnedJob(context, campaignId)) }, { headers: { "Cache-Control": "no-store" } });
});

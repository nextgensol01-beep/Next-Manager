import { NextResponse } from "next/server";
import { z } from "zod";
import { securityRequestBody, withDeliverySecurity } from "@/lib/server/email-delivery-security-api";
import { claimDeliveryCoordinator } from "@/lib/server/email-delivery-controller";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = withDeliverySecurity(async (request, context, { params }: { params: Promise<{ campaignId: string }> }) => {
  z.object({ confirmed: z.literal(true) }).strict().parse(await securityRequestBody(request));
  const { campaignId } = await params;
  return NextResponse.json(await claimDeliveryCoordinator(context, campaignId), { headers: { "Cache-Control": "no-store" } });
});


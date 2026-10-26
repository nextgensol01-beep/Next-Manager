import { NextResponse } from "next/server";
import { z } from "zod";
import { securityRequestBody, withDeliverySecurity } from "@/lib/server/email-delivery-security-api";
import { processBrowserDeliveryBatch } from "@/lib/server/email-delivery-controller";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = withDeliverySecurity(async (request, context, { params }: { params: Promise<{ campaignId: string }> }) => {
  const { coordinatorToken } = z.object({ coordinatorToken: z.string().min(32).max(100) }).strict().parse(await securityRequestBody(request));
  const { campaignId } = await params;
  return NextResponse.json(await processBrowserDeliveryBatch(context, campaignId, coordinatorToken), { headers: { "Cache-Control": "no-store" } });
});

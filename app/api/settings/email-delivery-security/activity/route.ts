import { NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import Audit from "@/models/EmailDeliverySecurityAudit";
import { withDeliverySecurity } from "@/lib/server/email-delivery-security-api";
export const GET = withDeliverySecurity(async (request) => {
  const query = z
    .object({
      limit: z.coerce.number().int().min(1).max(50).default(20),
      before: z
        .string()
        .regex(/^[a-f\d]{24}$/i)
        .optional(),
    })
    .parse(Object.fromEntries(new URL(request.url).searchParams));
  const rows = await Audit.find(
    query.before
      ? { _id: { $lt: new mongoose.Types.ObjectId(query.before) } }
      : {},
  )
    .sort({ _id: -1 })
    .limit(query.limit + 1)
    .select(
      "event userEmail trackerId workflowId campaignId approvalId mode mailKind messageCount approvalMethod result details createdAt",
    )
    .lean();
  const hasMore = rows.length > query.limit;
  if (hasMore) rows.pop();
  return NextResponse.json({
    events: rows,
    nextCursor: hasMore ? String(rows.at(-1)?._id) : null,
  });
});

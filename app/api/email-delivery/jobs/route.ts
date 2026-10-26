import { NextResponse } from "next/server";
import Campaign from "@/models/TrackerEmailCampaign";
import { withDeliverySecurity } from "@/lib/server/email-delivery-security-api";
import { ownedJobs, publicDeliveryJob, readDeliveryRuntime, JOB_SUMMARY_FIELDS, type JobRecord } from "@/lib/server/email-delivery-jobs";
import { DeliverySecurityError } from "@/lib/server/email-delivery-crypto";
export const dynamic = "force-dynamic";
export const GET = withDeliverySecurity(async (request, context) => {
  const search = request.nextUrl.searchParams;
  const limit = Math.min(50, Math.max(1, Math.floor(Number(search.get("limit"))) || 20));
  const before = search.get("before");
  const trackerId = search.get("trackerId");
  const active = search.get("active") === "1";
  let cursorFilter = {};
  if (before) {
    try {
      if (before.length > 512) throw new Error();
      const cursor = JSON.parse(Buffer.from(before, "base64url").toString("utf8")) as { date?: string; campaignId?: string };
      if (!cursor.date || !Number.isFinite(Date.parse(cursor.date)) || typeof cursor.campaignId !== "string" || cursor.campaignId.length > 100) throw new Error();
      const date = new Date(cursor.date);
      cursorFilter = { $and: [{ $or: [{ createdAt: { $lt: date } }, { createdAt: date, campaignId: { $lt: cursor.campaignId } }] }] };
    } catch { throw new DeliverySecurityError("Invalid delivery history cursor.", 400); }
  }
  const rows = await Campaign.find({ ...ownedJobs(context),
    ...(trackerId ? { trackerId } : {}),
    ...cursorFilter,
    ...(active ? { jobVersion: { $in: [1, 2] }, status: { $in: ["queued", "processing", "recovering", "interrupted", "paused_daily_limit", "paused_requires_attention"] } } : {}),
  }).select(JOB_SUMMARY_FIELDS).sort({ createdAt: -1, campaignId: -1 }).limit(limit + 1).lean<JobRecord[]>();
  const last = rows[limit - 1];
  const nextCursor = rows.length > limit && last?.createdAt ? Buffer.from(JSON.stringify({ date: last.createdAt.toISOString(), campaignId: last.campaignId })).toString("base64url") : null;
  const runtime = await readDeliveryRuntime();
  return NextResponse.json({ jobs: rows.slice(0, limit).map(job => publicDeliveryJob(job, runtime)), nextCursor }, { headers: { "Cache-Control": "no-store" } });
});

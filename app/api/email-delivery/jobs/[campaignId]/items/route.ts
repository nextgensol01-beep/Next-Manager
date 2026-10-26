import { NextResponse } from "next/server";
import { withDeliverySecurity } from "@/lib/server/email-delivery-security-api";
import { findOwnedJob, deliveryJobView, publicJobItem } from "@/lib/server/email-delivery-jobs";
export const dynamic = "force-dynamic";
export const GET = withDeliverySecurity(async (request, context, { params }: { params: Promise<{ campaignId: string }> }) => {
  const { campaignId } = await params;
  const job = await findOwnedJob(context, campaignId, true);
  const query = request.nextUrl.searchParams;
  const search = (query.get("search") || "").slice(0, 200).trim().toLowerCase();
  const status = query.get("status") || "all";
  const offset = Math.max(0, Math.min(job.items.length, Math.floor(Number(query.get("offset"))) || 0));
  const limit = Math.max(1, Math.min(50, Math.floor(Number(query.get("limit"))) || 25));
  const items = job.items.map(publicJobItem).filter(item =>
    (status === "all" || status === item.status) && (!search || [item.companyName, item.clientId, ...item.to, ...item.cc].some(value => value.toLowerCase().includes(search))));
  return NextResponse.json({ job: await deliveryJobView(job), items: items.slice(offset, offset + limit), matching: items.length,
    nextOffset: offset + limit < items.length ? offset + limit : null }, { headers: { "Cache-Control": "no-store" } });
});

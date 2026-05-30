import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { errorResponse, requireSession } from "@/lib/route-utils";
import Quotation from "@/models/Quotation";
import QuotationRevision from "@/models/QuotationRevision";
import { expireStaleQuotations } from "@/lib/quotationWorkflow";

export async function GET(req: NextRequest) {
  const guard = await requireSession();
  if (guard.response) return guard.response;

  try {
    await connectDB();
    await expireStaleQuotations();
    const financialYear = new URL(req.url).searchParams.get("financialYear") || undefined;
    const match: Record<string, unknown> = {};
    if (financialYear) match.financialYear = financialYear;

    const quotations = await Quotation.find(match).lean();
    const ids = quotations.map((quotation) => String(quotation._id));
    const revisions = await QuotationRevision.find({ quotationId: { $in: ids } }).lean();
    const revisionByQuotation = new Map<string, typeof revisions[number]>();
    for (const revision of revisions.sort((a, b) => b.revisionNumber - a.revisionNumber)) {
      if (!revisionByQuotation.has(revision.quotationId)) revisionByQuotation.set(revision.quotationId, revision);
    }

    const rows = quotations.map((quotation) => ({
      quotation,
      revision: revisionByQuotation.get(String(quotation._id)),
    }));
    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
    const valueOf = (status?: string) => sum(rows
      .filter(({ quotation }) => !status || quotation.status === status)
      .map(({ revision }) => revision?.grandTotal || 0));
    const statusCount = (status: string) => rows.filter(({ quotation }) => quotation.status === status).length;
    const now = new Date();
    const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const statusDistribution = Array.from(new Set(quotations.map((quotation) => quotation.status))).map((status) => ({
      name: status,
      value: statusCount(status),
      amount: valueOf(status),
    }));

    const monthlyMap = new Map<string, { month: string; count: number; value: number; accepted: number }>();
    const clientMap = new Map<string, { name: string; value: number; count: number }>();
    const categoryMap = new Map<string, { name: string; value: number; quantity: number }>();

    for (const { quotation, revision } of rows) {
      const date = quotation.createdAt ? new Date(quotation.createdAt) : new Date();
      const month = `${date.getFullYear()}-${date.getMonth() + 1}`;
      const value = revision?.grandTotal || 0;
      const monthly = monthlyMap.get(month) || { month, count: 0, value: 0, accepted: 0 };
      monthly.count += 1;
      monthly.value += value;
      if (quotation.status === "Accepted") monthly.accepted += value;
      monthlyMap.set(month, monthly);

      const client = clientMap.get(quotation.clientName) || { name: quotation.clientName, value: 0, count: 0 };
      client.value += value;
      client.count += 1;
      clientMap.set(quotation.clientName, client);

      for (const item of revision?.items || []) {
        const category = categoryMap.get(item.category) || { name: item.category, value: 0, quantity: 0 };
        category.value += item.totalAmount || 0;
        category.quantity += item.quantity || 0;
        categoryMap.set(item.category, category);
      }
    }

    const acceptedQuotations = statusCount("Accepted");
    return NextResponse.json({
      totals: {
        totalQuotations: rows.length,
        sentQuotations: statusCount("Sent"),
        viewedQuotations: 0,
        acceptedQuotations,
        rejectedQuotations: statusCount("Rejected"),
        expiredQuotations: statusCount("Expired"),
        pendingQuotations: rows.filter(({ quotation }) => ["Finalized", "Sent"].includes(quotation.status)).length,
        conversionRate: rows.length ? Math.round((acceptedQuotations / rows.length) * 100) : 0,
        totalQuotedValue: sum(rows.map(({ revision }) => revision?.grandTotal || 0)),
        acceptedRevenue: valueOf("Accepted"),
        lostRevenue: valueOf("Rejected") + valueOf("Expired"),
        draftCreatedQuotations: 0,
        expiringSoonQuotations: rows.filter(({ quotation }) => (
          quotation.validTill &&
          quotation.validTill >= now &&
          quotation.validTill <= soon &&
          !["Accepted", "Rejected", "Expired"].includes(quotation.status)
        )).length,
      },
      statusDistribution,
      monthlyTrend: Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
      topClients: Array.from(clientMap.values()).sort((a, b) => b.value - a.value).slice(0, 8),
      topCategories: Array.from(categoryMap.values()).sort((a, b) => b.value - a.value).slice(0, 8),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

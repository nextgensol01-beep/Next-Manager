import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Invoice from "@/models/Invoice";
import Client from "@/models/Client";
import { buildInvoiceCoverageSummary } from "@/lib/invoiceCoverage";

type FlatRecord = Record<string, unknown>;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const fy = String(searchParams.get("fy") || "").trim();
    const search = String(searchParams.get("search") || "").trim();

    const query: Record<string, unknown> = {};
    if (fy) query.financialYear = fy;

    if (search) {
      const matchingClients = await Client.find({
        $or: [
          { clientId: { $regex: search, $options: "i" } },
          { companyName: { $regex: search, $options: "i" } },
        ],
      }).select("clientId").lean() as Array<{ clientId?: string }>;
      const matchingClientIds = matchingClients.map((client) => client.clientId).filter(Boolean);
      query.clientId = { $in: matchingClientIds };
    }

    const invoices = await Invoice.find(query).sort({ fromDate: 1 }).lean() as FlatRecord[];
    const clientIds = Array.from(new Set(invoices.map((invoice) => String(invoice.clientId || "")).filter(Boolean)));
    const clients = await Client.find({ clientId: { $in: clientIds } }).select("clientId companyName").lean() as Array<{
      clientId?: string;
      companyName?: string;
    }>;
    const nameMap = new Map(clients.map((client) => [String(client.clientId || ""), String(client.companyName || "")]));

    const grouped = new Map<string, FlatRecord[]>();
    invoices.forEach((invoice) => {
      const clientId = String(invoice.clientId || "");
      if (!clientId) return;
      const existing = grouped.get(clientId) || [];
      existing.push(invoice);
      grouped.set(clientId, existing);
    });

    const summaries = Array.from(grouped.entries())
      .map(([clientId, entries]) => ({
        clientId,
        companyName: nameMap.get(clientId) || clientId,
        invoiceCount: entries.length,
        coverage: buildInvoiceCoverageSummary(entries, fy),
      }))
      .sort((a, b) => a.companyName.localeCompare(b.companyName));

    return NextResponse.json(summaries);
  } catch (error) {
    console.error("GET /api/invoices/coverage:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

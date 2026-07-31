import { performance } from "node:perf_hooks";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import { getClientWithContacts } from "@/lib/server/client-contact-service";
import { GET as getFinancialYears } from "@/app/api/financial-year/route";
import { GET as getDocuments } from "@/app/api/documents/route";
import { GET as getBillings } from "@/app/api/billing/route";
import { GET as getPayments } from "@/app/api/payments/route";
import { GET as getInvoices } from "@/app/api/invoices/route";
import { GET as getUploadRecords } from "@/app/api/upload-records/route";
import { GET as getAnnualReturns } from "@/app/api/annual-return/route";

type SectionName =
  | "financialYears"
  | "documents"
  | "billings"
  | "payments"
  | "invoices"
  | "uploadRecords"
  | "annualReturns";

type SectionResult = {
  name: SectionName;
  data: unknown[];
  duration: number;
  failed: boolean;
};

const sectionLabels: Record<SectionName, string> = {
  financialYears: "financial years",
  documents: "documents",
  billings: "billing",
  payments: "payments",
  invoices: "invoice tracking",
  uploadRecords: "uploaded records",
  annualReturns: "annual returns",
};

async function readSection(
  name: SectionName,
  handler: (request: NextRequest) => Promise<Response>,
  requestUrl: string
): Promise<SectionResult> {
  const startedAt = performance.now();

  try {
    const response = await handler(new NextRequest(requestUrl));
    if (!response.ok) {
      throw new Error(`${sectionLabels[name]} returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    return {
      name,
      data: Array.isArray(payload) ? payload : [],
      duration: performance.now() - startedAt,
      failed: false,
    };
  } catch (error) {
    console.error(`GET client workspace ${name}:`, error);
    return {
      name,
      data: [],
      duration: performance.now() - startedAt,
      failed: true,
    };
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const requestStartedAt = performance.now();
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();
    const { clientId } = await params;
    const clientStartedAt = performance.now();
    const clientPromise = getClientWithContacts(clientId).then((client) => ({
      client,
      duration: performance.now() - clientStartedAt,
    }));
    const baseUrl = new URL(request.url);
    const sectionUrl = (pathname: string) => {
      const url = new URL(pathname, baseUrl.origin);
      url.searchParams.set("clientId", clientId);
      return url.toString();
    };

    const [clientResult, ...sections] = await Promise.all([
      clientPromise,
      readSection("financialYears", getFinancialYears, sectionUrl("/api/financial-year")),
      readSection("documents", getDocuments, sectionUrl("/api/documents")),
      readSection("billings", getBillings, sectionUrl("/api/billing")),
      readSection("payments", getPayments, sectionUrl("/api/payments")),
      readSection("invoices", getInvoices, sectionUrl("/api/invoices")),
      readSection("uploadRecords", getUploadRecords, sectionUrl("/api/upload-records")),
      readSection("annualReturns", getAnnualReturns, sectionUrl("/api/annual-return")),
    ]);

    if (!clientResult.client) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const dataBySection = Object.fromEntries(
      sections.map((section) => [section.name, section.data])
    );
    const failedSections = sections
      .filter((section) => section.failed)
      .map((section) => sectionLabels[section.name]);
    const totalDuration = performance.now() - requestStartedAt;
    const serverTiming = [
      `total;dur=${totalDuration.toFixed(1)}`,
      `client;dur=${clientResult.duration.toFixed(1)}`,
      ...sections.map((section) => `${section.name};dur=${section.duration.toFixed(1)}`),
    ].join(", ");

    return NextResponse.json(
      {
        client: clientResult.client,
        financialYears: dataBySection.financialYears || [],
        documents: dataBySection.documents || [],
        billings: dataBySection.billings || [],
        payments: dataBySection.payments || [],
        invoices: dataBySection.invoices || [],
        uploadRecords: dataBySection.uploadRecords || [],
        annualReturns: dataBySection.annualReturns || [],
        failedSections,
        fetchedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Server-Timing": serverTiming,
        },
      }
    );
  } catch (error) {
    console.error("GET /api/clients/[clientId]/workspace:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

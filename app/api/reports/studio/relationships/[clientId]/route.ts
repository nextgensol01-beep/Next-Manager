import { NextRequest, NextResponse } from "next/server";
import Client from "@/models/Client";
import FinancialYear from "@/models/FinancialYear";
import Quotation from "@/models/Quotation";
import QuotationRevision from "@/models/QuotationRevision";
import Billing from "@/models/Billing";
import Payment from "@/models/Payment";
import AnnualReturn from "@/models/AnnualReturn";
import Invoice from "@/models/Invoice";
import UploadRecord from "@/models/UploadRecord";
import CreditTransaction from "@/models/CreditTransaction";
import DocumentModel from "@/models/Document";
import ClientWorkItem from "@/models/ClientWorkItem";
import ActivityEvent from "@/models/ActivityEvent";
import ClientContact from "@/models/ClientContact";
import Person from "@/models/Person";
import { connectDB } from "@/lib/mongoose";
import { errorResponse, requireSession } from "@/lib/route-utils";
import { buildInvoiceCoverageSummary } from "@/lib/invoiceCoverage";

type FlatRecord = Record<string, unknown>;

export async function GET(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const guard = await requireSession();
  if (guard.response) return guard.response;
  try {
    await connectDB();
    const { clientId: encodedClientId } = await params;
    const clientId = decodeURIComponent(encodedClientId);
    const financialYear = request.nextUrl.searchParams.get("fy") || "";
    if (!clientId || !financialYear) return NextResponse.json({ error: "Client and financial year are required" }, { status: 400 });

    const [client, financialYearRecord, quotations, billing, payments, annualReturn, invoices, uploads, inboundTransactions, outboundTransactions, documents, tasks, activities, contacts] = await Promise.all([
      Client.findOne({ clientId }).select("clientId companyName category state gstNumber registrationNumber").lean() as Promise<FlatRecord | null>,
      FinancialYear.findOne({ clientId, financialYear }).lean() as Promise<FlatRecord | null>,
      Quotation.find({ clientId, financialYear }).select("quotationNumber status currentRevisionNumber createdAt sentAt acceptedAt").sort({ createdAt: -1 }).lean() as Promise<FlatRecord[]>,
      Billing.findOne({ clientId, financialYear }).lean() as Promise<FlatRecord | null>,
      Payment.find({ clientId, financialYear }).select("amountPaid paymentType paymentDate paymentMode referenceNumber").sort({ paymentDate: -1 }).lean() as Promise<FlatRecord[]>,
      AnnualReturn.findOne({ clientId, financialYear }).lean() as Promise<FlatRecord | null>,
      Invoice.find({ clientId, financialYear }).lean() as Promise<FlatRecord[]>,
      UploadRecord.find({ clientId, financialYear }).lean() as Promise<FlatRecord[]>,
      CreditTransaction.find({ toClientId: clientId, financialYear }).lean() as Promise<FlatRecord[]>,
      CreditTransaction.find({ fromClientId: clientId, financialYear }).lean() as Promise<FlatRecord[]>,
      DocumentModel.find({ clientId }).select("documentName category documentKind financialYear uploadedDate").sort({ uploadedDate: -1 }).limit(12).lean() as Promise<FlatRecord[]>,
      ClientWorkItem.find({ clientId, $or: [{ financialYear }, { financialYear: "" }, { financialYear: { $exists: false } }] }).select("kind title status priority dueAt").sort({ dueAt: 1 }).limit(12).lean() as Promise<FlatRecord[]>,
      ActivityEvent.find({ clientId, $or: [{ financialYear }, { financialYear: "" }, { financialYear: { $exists: false } }] }).select("label category occurredAt").sort({ occurredAt: -1 }).limit(12).lean() as Promise<FlatRecord[]>,
      ClientContact.find({ clientId }).select("personId designation isPrimaryContact").lean() as Promise<FlatRecord[]>,
    ]);
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const quotationIds = quotations.map((quotation) => String(quotation._id || "")).filter(Boolean);
    const revisions = quotationIds.length > 0 ? await QuotationRevision.find({ quotationId: { $in: quotationIds } }).select("quotationId revisionNumber grandTotal").lean() as FlatRecord[] : [];
    const revisionValues = new Map(revisions.map((revision) => [`${String(revision.quotationId)}:${Number(revision.revisionNumber) || 0}`, Number(revision.grandTotal) || 0]));
    const personIds = contacts.map((contact) => String(contact.personId || "")).filter(Boolean);
    const people = personIds.length > 0 ? await Person.find({ _id: { $in: personIds } }).select("name phoneNumbers emails").lean() as FlatRecord[] : [];
    const peopleMap = new Map(people.map((person) => [String(person._id), person]));

    return NextResponse.json({
      client,
      financialYear,
      financialYearRecord,
      quotations: quotations.map((quotation) => ({
        ...quotation,
        grandTotal: revisionValues.get(`${String(quotation._id)}:${Number(quotation.currentRevisionNumber) || 0}`) || 0,
      })),
      billing,
      payments,
      annualReturn,
      invoiceCoverage: buildInvoiceCoverageSummary(invoices, financialYear),
      invoiceCount: invoices.length,
      uploads: { count: uploads.length, quantity: uploads.reduce((sum, upload) => sum + [1, 2, 3, 4].reduce((categorySum, categoryId) => categorySum + (Number(upload[`cat${categoryId}`]) || 0), 0), 0) },
      transactions: { inboundCount: inboundTransactions.length, outboundCount: outboundTransactions.length },
      documents,
      tasks,
      activities,
      contacts: contacts.map((contact) => ({ ...contact, person: peopleMap.get(String(contact.personId)) || null })),
    });
  } catch (error) {
    return errorResponse(error, "Unable to load relationships");
  }
}


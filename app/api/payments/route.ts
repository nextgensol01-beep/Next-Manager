import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import { syncBillingTotalPaid } from "@/lib/billing-utils";
import Payment from "@/models/Payment";
import Client from "@/models/Client";
import Billing from "@/models/Billing";
import { recordActivityEvent } from "@/lib/server/activity-events";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");
    const fy = searchParams.get("fy");
    const type = searchParams.get("type");

    const query: Record<string, unknown> = {};
    if (clientId) query.clientId = clientId;
    if (type === "billing" || type === "advance") query.paymentType = type;
    if (fy) {
      if (type === "billing") query.financialYear = fy;
      else if (type !== "advance") query.$or = [{ financialYear: fy }, { paymentType: "advance" }];
      // Advances are client-level balances and remain available across FYs.
    }

    const payments = await Payment.find(query).sort({ paymentDate: -1 });
    return NextResponse.json(payments);
  } catch (error) {
    console.error("GET /api/payments:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const body = await req.json();

    const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    const financialYear = typeof body.financialYear === "string" ? body.financialYear.trim() : "";
    const paymentMode = typeof body.paymentMode === "string" ? body.paymentMode.trim() : "";
    const referenceNumber = typeof body.referenceNumber === "string" ? body.referenceNumber.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const amountPaid = Number(body.amountPaid);
    const paymentDate = new Date(body.paymentDate);
    const requestedType = body.paymentType === "advance" || body.paymentType === "billing"
      ? body.paymentType
      : null;

    if (!clientId || !financialYear) {
      return NextResponse.json({ error: "clientId and financialYear are required" }, { status: 400 });
    }

    if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
      return NextResponse.json({ error: "amountPaid must be a positive number" }, { status: 400 });
    }

    if (Number.isNaN(paymentDate.getTime())) {
      return NextResponse.json({ error: "paymentDate is invalid" }, { status: 400 });
    }

    if (!paymentMode) {
      return NextResponse.json({ error: "paymentMode is required" }, { status: 400 });
    }

    const requestedBillingId = typeof body.billingId === "string" ? body.billingId.trim() : "";
    const [client, billing] = await Promise.all([
      Client.findOne({ clientId }).select("clientId").lean() as Promise<{ clientId?: string } | null>,
      (requestedBillingId
        ? Billing.findOne({ _id: requestedBillingId, clientId }).select("_id totalAmount financialYear").lean()
        : Billing.findOne({ clientId, financialYear }).select("_id totalAmount financialYear").lean()) as Promise<{ _id?: unknown; totalAmount?: number; financialYear?: string } | null>,
    ]);

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const paymentType = requestedType ?? (billing ? "billing" : "advance");
    const billingId = paymentType === "billing" && billing ? String(billing._id) : "";
    const billingFinancialYear = paymentType === "billing" && billing?.financialYear
      ? String(billing.financialYear)
      : financialYear;

    if (paymentType === "billing" && !billing) {
      return NextResponse.json({
        error: "No billing record exists for this client and financial year. Record this as an advance payment instead.",
      }, { status: 400 });
    }

    if (paymentType === "billing" && billing) {
      const existingBillingPayments = await Payment.find({
        clientId,
        paymentType: { $ne: "advance" },
        $or: [
          { billingId },
          { billingId: { $in: ["", null] }, financialYear: billingFinancialYear },
          { billingId: { $exists: false }, financialYear: billingFinancialYear },
        ],
      })
        .select("amountPaid")
        .lean() as Array<{ amountPaid?: number }>;

      const alreadyAllocated = existingBillingPayments.reduce(
        (sum, payment) => sum + (Number(payment.amountPaid) || 0),
        0
      );
      const remaining = Math.max(0, (Number(billing.totalAmount) || 0) - alreadyAllocated);

      if (amountPaid - remaining > 0.005) {
        return NextResponse.json({
          error: `Payment exceeds the remaining billed amount of ₹${remaining.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}. If this money is for future work, record it as an advance payment.`,
        }, { status: 400 });
      }
    }

    const payment = await Payment.create({
      clientId,
      billingId,
      financialYear: billingFinancialYear,
      amountPaid,
      paymentType,
      paymentDate,
      paymentMode,
      referenceNumber,
      notes,
      source: "direct",
    });

    // Keep denormalized totalPaid on Billing in sync
    if (paymentType !== "advance") {
      await syncBillingTotalPaid(
        Billing.collection,
        Payment.collection,
        clientId,
        billingFinancialYear
      );
    }

    await recordActivityEvent({
      clientId,
      category: "financial",
      type: paymentType === "advance" ? "advance_payment_received" : "payment_received",
      label: paymentType === "advance" ? "Advance Payment Received" : "Payment Received",
      detail: `INR ${amountPaid.toLocaleString("en-IN")} via ${paymentMode}${referenceNumber ? ` · Ref: ${referenceNumber}` : ""}`,
      color: "emerald",
      badge: "Recorded",
      financialYear: billingFinancialYear,
      entityId: String(payment._id),
      entityType: "payment",
      relatedEntityIds: [String(payment._id)],
    }, session);

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error("POST /api/payments:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

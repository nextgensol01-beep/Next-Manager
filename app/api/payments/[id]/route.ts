import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Payment from "@/models/Payment";
import Client from "@/models/Client";
import Billing from "@/models/Billing";
import DeletedRecord from "@/models/DeletedRecord";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();

    const body = await req.json();
    const { id } = await params;
    const existingPayment = await Payment.findById(id);
    if (!existingPayment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const clientId = typeof body.clientId === "string" && body.clientId.trim()
      ? body.clientId.trim()
      : existingPayment.clientId;
    const financialYear = typeof body.financialYear === "string" && body.financialYear.trim()
      ? body.financialYear.trim()
      : existingPayment.financialYear;
    const paymentMode = typeof body.paymentMode === "string" ? body.paymentMode.trim() : "";
    const referenceNumber = typeof body.referenceNumber === "string" ? body.referenceNumber.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const amountPaid = Number(body.amountPaid);
    const paymentDate = new Date(body.paymentDate);
    const paymentType = body.paymentType === "advance" || body.paymentType === "billing"
      ? body.paymentType
      : existingPayment.paymentType;

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

    const [client, billing] = await Promise.all([
      Client.findOne({ clientId }).select("clientId").lean() as Promise<{ clientId?: string } | null>,
      Billing.findOne({ clientId, financialYear }).select("totalAmount").lean() as Promise<{ totalAmount?: number } | null>,
    ]);

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    if (paymentType === "billing" && !billing) {
      return NextResponse.json({
        error: "No billing record exists for this client and financial year. Record this as an advance payment instead.",
      }, { status: 400 });
    }

    if (paymentType === "billing" && billing) {
      const existingBillingPayments = await Payment.find({
        _id: { $ne: id },
        clientId,
        financialYear,
        paymentType: { $ne: "advance" },
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

    const updatedPayment = await Payment.findByIdAndUpdate(
      id,
      {
        clientId,
        financialYear,
        amountPaid,
        paymentType,
        paymentDate,
        paymentMode,
        referenceNumber,
        notes,
      },
      { new: true }
    );

    return NextResponse.json(updatedPayment);
  } catch (error) {
    console.error("PUT /api/payments/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { id } = await params;
    const payment = await Payment.findById(id);
    if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await DeletedRecord.create({
      recordType: "payment",
      recordId: id,
      label: `Payment — ${payment.clientId}`,
      subLabel: `FY ${payment.financialYear} · ₹${payment.amountPaid?.toLocaleString("en-IN") || 0}`,
      data: payment.toObject(),
    });
    await Payment.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/payments/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Payment from "@/models/Payment";
import Billing from "@/models/Billing";
import DeletedRecord from "@/models/DeletedRecord";

/**
 * POST /api/payments/apply-advance
 *
 * Atomically converts advance payment(s) into a billing payment.
 *
 * Body:
 *   clientId       – the client
 *   financialYear  – FY of the billing record to credit
 *   amountToApply  – how much of the advance to apply (≤ advance balance and ≤ pending amount)
 *   applyDate      – ISO date string for the new billing payment record
 *   notes          – optional note to attach to the generated billing payment
 *
 * What this does:
 *   1. Validates the billing record exists and has a pending balance.
 *   2. Sums all advance payments for this client/FY to get the available balance.
 *   3. Validates amountToApply ≤ advance balance and ≤ pending billing amount.
 *   4. Creates a new "billing" payment for amountToApply.
 *   5. Consumes advance payment records oldest-first:
 *      - If an advance record is fully consumed, it is deleted (archived to DeletedRecord).
 *      - If it is partially consumed, its amountPaid is reduced by the consumed portion.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();
    const body = await req.json();

    const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    const financialYear = typeof body.financialYear === "string" ? body.financialYear.trim() : "";
    const amountToApply = Number(body.amountToApply);
    const applyDate = body.applyDate ? new Date(String(body.applyDate)) : new Date();
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";

    // ── Validate inputs ──────────────────────────────────────────────────────
    if (!clientId || !financialYear) {
      return NextResponse.json({ error: "clientId and financialYear are required" }, { status: 400 });
    }
    if (!Number.isFinite(amountToApply) || amountToApply <= 0) {
      return NextResponse.json({ error: "amountToApply must be a positive number" }, { status: 400 });
    }
    if (Number.isNaN(applyDate.getTime())) {
      return NextResponse.json({ error: "applyDate is invalid" }, { status: 400 });
    }

    // ── Load billing record ──────────────────────────────────────────────────
    const billing = await Billing.findOne({ clientId, financialYear })
      .select("totalAmount")
      .lean() as { totalAmount?: number } | null;

    if (!billing) {
      return NextResponse.json(
        { error: "No billing record found for this client and financial year." },
        { status: 404 }
      );
    }

    // ── Compute current pending amount ───────────────────────────────────────
    const existingBillingPayments = await Payment.find({
      clientId,
      financialYear,
      paymentType: { $ne: "advance" },
    }).select("amountPaid").lean() as Array<{ amountPaid?: number }>;

    const alreadyPaid = existingBillingPayments.reduce(
      (sum, p) => sum + (Number(p.amountPaid) || 0),
      0
    );
    const pendingAmount = Math.max(0, (Number(billing.totalAmount) || 0) - alreadyPaid);

    if (pendingAmount <= 0) {
      return NextResponse.json(
        { error: "This billing record is already fully paid." },
        { status: 400 }
      );
    }

    // ── Load advance payments for this client/FY, oldest first ──────────────
    const advancePayments = await Payment.find({
      clientId,
      financialYear,
      paymentType: "advance",
    })
      .sort({ paymentDate: 1, createdAt: 1 })
      .lean() as Array<{ _id: unknown; amountPaid?: number; paymentMode?: string; [key: string]: unknown }>;

    const advanceBalance = advancePayments.reduce(
      (sum, p) => sum + (Number(p.amountPaid) || 0),
      0
    );

    if (advanceBalance <= 0) {
      return NextResponse.json(
        { error: "No advance balance available for this client and financial year." },
        { status: 400 }
      );
    }

    // ── Validate amount ──────────────────────────────────────────────────────
    if (amountToApply - advanceBalance > 0.005) {
      return NextResponse.json(
        {
          error: `Amount exceeds available advance balance of ₹${advanceBalance.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}.`,
        },
        { status: 400 }
      );
    }

    if (amountToApply - pendingAmount > 0.005) {
      return NextResponse.json(
        {
          error: `Amount exceeds remaining billing balance of ₹${pendingAmount.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}.`,
        },
        { status: 400 }
      );
    }

    // ── Create the new billing payment ───────────────────────────────────────
    const newBillingPayment = await Payment.create({
      clientId,
      financialYear,
      amountPaid: amountToApply,
      paymentType: "billing",
      paymentDate: applyDate,
      paymentMode: "Advance Applied",
      referenceNumber: "",
      notes: notes || "Applied from advance",
      source: "advance_application",
    });

    // ── Consume advance records oldest-first ─────────────────────────────────
    let remaining = amountToApply;

    for (const adv of advancePayments) {
      if (remaining <= 0.005) break;

      const advAmount = Number(adv.amountPaid) || 0;

      if (advAmount - remaining <= 0.005) {
        // Fully consume this advance record — archive then delete
        await DeletedRecord.create({
          recordType: "payment",
          recordId: String(adv._id),
          label: `Advance → Billing (applied) — ${clientId}`,
          subLabel: `FY ${financialYear} · ₹${advAmount.toLocaleString("en-IN")}`,
          data: adv,
        });
        await Payment.findByIdAndDelete(adv._id);
        remaining -= advAmount;
      } else {
        // Partially consume — reduce the advance record's amount
        await Payment.findByIdAndUpdate(adv._id, {
          $inc: { amountPaid: -remaining },
        });
        remaining = 0;
      }
    }

    return NextResponse.json({ success: true, payment: newBillingPayment }, { status: 201 });
  } catch (error) {
    console.error("POST /api/payments/apply-advance:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Billing from "@/models/Billing";
import Payment from "@/models/Payment";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");
    const fy = searchParams.get("fy");

    const query: Record<string, string> = {};
    if (clientId) query.clientId = clientId;
    if (fy) query.financialYear = fy;

    const billings = await Billing.find(query).sort({ createdAt: -1 });

    const enriched = await Promise.all(
      billings.map(async (billing) => {
        const b = billing.toObject();
        const payments = await Payment.find({
          clientId: b.clientId,
          financialYear: b.financialYear,
          paymentType: { $ne: "advance" },
        });
        const totalPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);
        const pendingAmount = Math.max(0, b.totalAmount - totalPaid);
        const paymentPercentage = b.totalAmount ? Math.min(100, (totalPaid / b.totalAmount) * 100) : 0;
        let paymentStatus = "Unpaid";
        if (pendingAmount <= 0) paymentStatus = "Paid";
        else if (totalPaid > 0) paymentStatus = "Partial";
        return { ...b, totalPaid, pendingAmount, paymentPercentage, paymentStatus };
      })
    );

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("GET /api/billing:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const body = await req.json();
    body.totalAmount =
      (body.govtCharges || 0) +
      (body.consultancyCharges || 0) +
      (body.targetCharges || 0) +
      (body.otherCharges || 0);

    const existing = await Billing.findOne({
      clientId: body.clientId,
      financialYear: body.financialYear,
    });

    if (existing) {
      const updated = await Billing.findOneAndUpdate(
        { clientId: body.clientId, financialYear: body.financialYear },
        body,
        { new: true }
      );
      return NextResponse.json(updated);
    }

    const billing = await Billing.create(body);
    return NextResponse.json(billing, { status: 201 });
  } catch (error) {
    console.error("POST /api/billing:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

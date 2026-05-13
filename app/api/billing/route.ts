import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Billing, { type IBillingTargetBreakdownRow } from "@/models/Billing";
import Payment from "@/models/Payment";

const CATEGORY_LABELS: Record<string, string> = {
  "1": "Category I",
  "2": "Category II",
  "3": "Category III",
  "4": "Category IV",
};

function normalizeTargetBreakdown(value: unknown): IBillingTargetBreakdownRow[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      const source = entry && typeof entry === "object" ? entry as Partial<IBillingTargetBreakdownRow> : {};
      const categoryId = String(source.categoryId || "");
      const type: IBillingTargetBreakdownRow["type"] = String(source.type).toUpperCase() === "EOL" ? "EOL" : "RECYCLING";
      const quantity = Number(source.quantity || 0);
      const rate = Number(source.rate || 0);
      const gstPercent = Number(source.gstPercent || 0);
      const taxableAmount = quantity * rate;
      const gstAmount = taxableAmount * (gstPercent / 100);
      const totalAmount = taxableAmount + gstAmount;
      const rateSource: IBillingTargetBreakdownRow["rateSource"] = source.rateSource === "transaction" ? "transaction" : "manual";

      return {
        categoryId,
        categoryLabel: String(source.categoryLabel || CATEGORY_LABELS[categoryId] || `Category ${categoryId}`),
        type,
        quantity,
        rate,
        taxableAmount,
        gstPercent,
        gstAmount,
        totalAmount,
        rateSource,
      };
    })
    .filter((entry) => entry.categoryId && entry.quantity > 0 && entry.totalAmount > 0);
}

function normalizeBillingBody(body: Record<string, unknown>) {
  const govtCharges = Number(body.govtCharges || 0);
  const consultancyCharges = Number(body.consultancyCharges || 0);
  const targetCharges = Number(body.targetCharges || 0);
  const otherCharges = Number(body.otherCharges || 0);

  return {
    clientId: String(body.clientId || ""),
    financialYear: String(body.financialYear || ""),
    govtCharges,
    consultancyCharges,
    targetCharges,
    otherCharges,
    totalAmount: govtCharges + consultancyCharges + targetCharges + otherCharges,
    targetBreakdown: normalizeTargetBreakdown(body.targetBreakdown),
    notes: typeof body.notes === "string" ? body.notes : "",
    dueDate: body.dueDate ? new Date(String(body.dueDate)) : null,
  };
}

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

    const billings = await Billing.collection.find(query).sort({ createdAt: -1 }).toArray();

    const enriched = await Promise.all(
      billings.map(async (billing) => {
        const b = billing as unknown as {
          _id: unknown;
          clientId: string;
          financialYear: string;
          totalAmount: number;
        };
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
        const bWithDate = b as typeof b & { dueDate?: Date | null };
        const dueDate = bWithDate.dueDate ? new Date(bWithDate.dueDate) : null;
        const now = new Date();
        const daysOverdue =
          dueDate && pendingAmount > 0
            ? Math.floor((now.getTime() - dueDate.getTime()) / 86_400_000)
            : 0;
        return { ...b, totalPaid, pendingAmount, paymentPercentage, paymentStatus, dueDate: bWithDate.dueDate ?? null, daysOverdue: Math.max(0, daysOverdue) };
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
    const body = normalizeBillingBody(await req.json());

    const existing = await Billing.collection.findOne({
      clientId: body.clientId,
      financialYear: body.financialYear,
    });

    const now = new Date();

    if (existing) {
      const updated = await Billing.collection.findOneAndUpdate(
        { clientId: body.clientId, financialYear: body.financialYear },
        { $set: { ...body, updatedAt: now } },
        { returnDocument: "after" }
      );
      return NextResponse.json(updated);
    }

    const insertedBilling = {
      ...body,
      createdAt: now,
      updatedAt: now,
    };
    const billing = await Billing.collection.insertOne(insertedBilling);
    return NextResponse.json({ ...insertedBilling, _id: billing.insertedId }, { status: 201 });
  } catch (error) {
    console.error("POST /api/billing:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

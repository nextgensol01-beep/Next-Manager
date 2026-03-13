import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import CreditTransaction from "@/models/CreditTransaction";
import FinancialYear from "@/models/FinancialYear";
import Payment from "@/models/Payment";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) return NextResponse.json([]);

  const [txFrom, txTo, fyRecords, payments] = await Promise.all([
    CreditTransaction.find({ fromClientId: clientId }).sort({ date: -1 }).limit(10).lean(),
    CreditTransaction.find({ toClientId: clientId }).sort({ date: -1 }).limit(10).lean(),
    FinancialYear.find({ clientId }).sort({ createdAt: -1 }).limit(5).lean(),
    Payment.find({ clientId }).sort({ paymentDate: -1 }).limit(10).lean(),
  ]);

  const activities: { type: string; label: string; detail: string; date: string; color: string }[] = [];

  txFrom.forEach((tx) => {
    const qty = (tx.cat1||0)+(tx.cat2||0)+(tx.cat3||0)+(tx.cat4||0) || tx.quantity || 0;
    activities.push({
      type: "credit_sold",
      label: "Credits Sold",
      detail: `${qty.toLocaleString()} units — FY ${tx.financialYear}`,
      date: tx.date?.toString() || tx.createdAt?.toString() || "",
      color: "teal",
    });
  });

  txTo.forEach((tx) => {
    const qty = (tx.cat1||0)+(tx.cat2||0)+(tx.cat3||0)+(tx.cat4||0) || tx.quantity || 0;
    activities.push({
      type: "target_achieved",
      label: "Target Achieved",
      detail: `${qty.toLocaleString()} units — FY ${tx.financialYear}`,
      date: tx.date?.toString() || tx.createdAt?.toString() || "",
      color: "blue",
    });
  });

  fyRecords.forEach((fy) => {
    const totalTarget = (fy.targetCat1||0)+(fy.targetCat2||0)+(fy.targetCat3||0)+(fy.targetCat4||0) || fy.targetAmount || 0;
    const totalCredits = (fy.creditsCat1||0)+(fy.creditsCat2||0)+(fy.creditsCat3||0)+(fy.creditsCat4||0) || fy.availableCredits || 0;
    if (totalTarget > 0) activities.push({ type: "target_set", label: "Target Set", detail: `${totalTarget.toLocaleString()} units — FY ${fy.financialYear}`, date: fy.createdAt?.toString() || "", color: "amber" });
    if (totalCredits > 0) activities.push({ type: "credits_set", label: "Credits Allocated", detail: `${totalCredits.toLocaleString()} units — FY ${fy.financialYear}`, date: fy.createdAt?.toString() || "", color: "brand" });
  });

  payments.forEach((p) => {
    activities.push({
      type: "payment",
      label: "Payment Received",
      detail: `₹${Number(p.amountPaid).toLocaleString("en-IN")} via ${p.paymentMode || "—"}`,
      date: p.paymentDate?.toString() || p.createdAt?.toString() || "",
      color: "emerald",
    });
  });

  activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return NextResponse.json(activities.slice(0, 15));
}

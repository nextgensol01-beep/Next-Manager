import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Client from "@/models/Client";
import FinancialYear from "@/models/FinancialYear";
import CreditTransaction from "@/models/CreditTransaction";
import Billing from "@/models/Billing";
import Payment from "@/models/Payment";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
  await connectDB();
  const { searchParams } = new URL(req.url);

  // Use same dynamic FY logic as the frontend
  const today = new Date();
  const fyStart = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  const defaultFY = `${fyStart}-${String(fyStart + 1).slice(2)}`;
  const fy = searchParams.get("fy") || defaultFY;

  // Build the full FY list dynamically (same as generateFinancialYears in utils.ts)
  const currentFYStart = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  const fyList: string[] = [];
  for (let y = 2022; y <= currentFYStart + 1; y++) {
    fyList.push(`${y}-${String(y + 1).slice(2)}`);
  }

  const [totalClients, fyRecords, billings, payments] = await Promise.all([
    Client.countDocuments(),
    FinancialYear.find({ financialYear: fy }).lean() as Promise<Record<string, unknown>[]>,
    Billing.find({ financialYear: fy }).lean() as Promise<Record<string, unknown>[]>,
    Payment.find({ financialYear: fy }).lean() as Promise<Record<string, unknown>[]>,
  ]);

  // PWP: sum credits generated using canonical fields with legacy fallback
  const pwpClients = await Client.find({ category: "PWP" }).select("clientId").lean();
  const pwpIds = new Set(pwpClients.map((c) => c.clientId));
  const totalCreditsAvailable = fyRecords
    .filter((r) => pwpIds.has(r.clientId as string))
    .reduce((sum, r) => {
      const c1 = Number(r.cat1Generated ?? r.creditsCat1 ?? 0);
      const c2 = Number(r.cat2Generated ?? r.creditsCat2 ?? 0);
      const c3 = Number(r.cat3Generated ?? r.creditsCat3 ?? 0);
      const c4 = Number(r.cat4Generated ?? r.creditsCat4 ?? 0);
      return sum + c1 + c2 + c3 + c4;
    }, 0);

  // PIBO: sum targets using canonical fields with legacy fallback
  const piboClients = await Client.find({
    category: { $in: ["Producer", "Importer", "Brand Owner"] },
  }).select("clientId").lean();
  const piboIds = new Set(piboClients.map((c) => c.clientId));
  const totalTargets = fyRecords
    .filter((r) => piboIds.has(r.clientId as string))
    .reduce((sum, r) => {
      const t1 = Number(r.cat1Target ?? r.targetCat1 ?? 0);
      const t2 = Number(r.cat2Target ?? r.targetCat2 ?? 0);
      const t3 = Number(r.cat3Target ?? r.targetCat3 ?? 0);
      const t4 = Number(r.cat4Target ?? r.targetCat4 ?? 0);
      return sum + t1 + t2 + t3 + t4;
    }, 0);

  // Credits sold (from PWP) and achieved (to PIBO) — sum cat qty properly
  const txAgg = await CreditTransaction.aggregate([
    { $match: { financialYear: fy } },
    {
      $group: {
        _id: "$fromClientId",
        total: {
          $sum: {
            $add: [
              { $cond: [{ $gt: ["$cat1Qty", 0] }, "$cat1Qty", { $ifNull: ["$cat1", 0] }] },
              { $cond: [{ $gt: ["$cat2Qty", 0] }, "$cat2Qty", { $ifNull: ["$cat2", 0] }] },
              { $cond: [{ $gt: ["$cat3Qty", 0] }, "$cat3Qty", { $ifNull: ["$cat3", 0] }] },
              { $cond: [{ $gt: ["$cat4Qty", 0] }, "$cat4Qty", { $ifNull: ["$cat4", 0] }] },
            ],
          },
        },
      },
    },
  ]);
  const totalCreditsSold = txAgg.reduce(
    (sum, agg) => sum + (agg._id && pwpIds.has(agg._id) ? agg.total : 0),
    0
  );

  // Achieved by PIBO (incoming transactions)
  const achAgg = await CreditTransaction.aggregate([
    { $match: { financialYear: fy } },
    {
      $group: {
        _id: "$toClientId",
        total: {
          $sum: {
            $add: [
              { $cond: [{ $gt: ["$cat1Qty", 0] }, "$cat1Qty", { $ifNull: ["$cat1", 0] }] },
              { $cond: [{ $gt: ["$cat2Qty", 0] }, "$cat2Qty", { $ifNull: ["$cat2", 0] }] },
              { $cond: [{ $gt: ["$cat3Qty", 0] }, "$cat3Qty", { $ifNull: ["$cat3", 0] }] },
              { $cond: [{ $gt: ["$cat4Qty", 0] }, "$cat4Qty", { $ifNull: ["$cat4", 0] }] },
            ],
          },
        },
      },
    },
  ]);
  const totalAchieved = achAgg.reduce(
    (sum, agg) => sum + (agg._id && piboIds.has(agg._id) ? agg.total : 0),
    0
  );

  const totalRevenue = billings.reduce((s, b) => s + (Number(b.totalAmount) || 0), 0);
  const totalPaid = payments.reduce(
    (sum, payment) => sum + (payment.paymentType === "advance" ? 0 : (Number(payment.amountPaid) || 0)),
    0
  );
  const totalPending = Math.max(0, totalRevenue - totalPaid);

  // Year-wise growth data — dynamic FY list
  const growthData = await Promise.all(
    fyList.map(async (year) => {
      const [b, p] = await Promise.all([
        Billing.find({ financialYear: year }).lean() as Promise<Record<string,unknown>[]>,
        Payment.find({ financialYear: year }).lean() as Promise<Record<string,unknown>[]>,
      ]);
      const revenue   = b.reduce((s, x) => s + (Number(x.totalAmount) || 0), 0);
      const collected = p.reduce(
        (sum, payment) => sum + (payment.paymentType === "advance" ? 0 : (Number(payment.amountPaid) || 0)),
        0
      );
      return { year, revenue, collected };
    })
  );

  return NextResponse.json({
    totalClients,
    totalCreditsAvailable,
    totalCreditsSold,
    totalTargets,
    totalAchieved,
    totalRevenue,
    totalPaid,
    totalPending,
    growthData,
  });
  } catch (error) {
    console.error("GET /api/dashboard:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

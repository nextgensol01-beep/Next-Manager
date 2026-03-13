import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import FinancialYear from "@/models/FinancialYear";
import CreditTransaction from "@/models/CreditTransaction";

// Helper: resolve value from canonical or legacy field
const g = (r: Record<string, unknown>, canonical: string, legacy: string) =>
  Number(r[canonical] ?? r[legacy] ?? 0);

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const fy = searchParams.get("fy");

  const query: Record<string, string> = {};
  if (clientId) query.clientId = clientId;
  if (fy) query.financialYear = fy;

  const records = await FinancialYear.find(query).sort({ financialYear: -1 }).lean() as Record<string, unknown>[];
  if (records.length === 0) return NextResponse.json([]);

  const clientIds = [...new Set(records.map((r) => r.clientId as string))];
  const fys = [...new Set(records.map((r) => r.financialYear as string))];

  // Single aggregation — sums cat quantities for sold (from) and achieved (to)
  const txAgg = await CreditTransaction.aggregate([
    {
      $match: {
        financialYear: { $in: fys },
        $or: [{ fromClientId: { $in: clientIds } }, { toClientId: { $in: clientIds } }],
      },
    },
    {
      $group: {
        _id: { fy: "$financialYear", from: "$fromClientId", to: "$toClientId" },
        // Use canonical cat1Qty if > 0, otherwise fall back to legacy cat1
        q1: { $sum: { $cond: [{ $gt: ["$cat1Qty", 0] }, "$cat1Qty", "$cat1"] } },
        q2: { $sum: { $cond: [{ $gt: ["$cat2Qty", 0] }, "$cat2Qty", "$cat2"] } },
        q3: { $sum: { $cond: [{ $gt: ["$cat3Qty", 0] }, "$cat3Qty", "$cat3"] } },
        q4: { $sum: { $cond: [{ $gt: ["$cat4Qty", 0] }, "$cat4Qty", "$cat4"] } },
      },
    },
  ]);

  // Build maps keyed "clientId|fy"
  type CatTotals = { c1: number; c2: number; c3: number; c4: number };
  const soldMap: Record<string, CatTotals> = {};
  const achMap:  Record<string, CatTotals> = {};

  for (const tx of txAgg) {
    const { fy: tFy, from, to } = tx._id;
    if (from && clientIds.includes(from)) {
      const k = `${from}|${tFy}`;
      if (!soldMap[k]) soldMap[k] = { c1: 0, c2: 0, c3: 0, c4: 0 };
      soldMap[k].c1 += tx.q1; soldMap[k].c2 += tx.q2;
      soldMap[k].c3 += tx.q3; soldMap[k].c4 += tx.q4;
    }
    if (to && clientIds.includes(to)) {
      const k = `${to}|${tFy}`;
      if (!achMap[k]) achMap[k] = { c1: 0, c2: 0, c3: 0, c4: 0 };
      achMap[k].c1 += tx.q1; achMap[k].c2 += tx.q2;
      achMap[k].c3 += tx.q3; achMap[k].c4 += tx.q4;
    }
  }

  const enriched = records.map((r) => {
    const k = `${r.clientId}|${r.financialYear}`;
    const sold = soldMap[k] ?? { c1: 0, c2: 0, c3: 0, c4: 0 };
    const ach  = achMap[k]  ?? { c1: 0, c2: 0, c3: 0, c4: 0 };

    // Resolve generated/target — new canonical names, then legacy
    const gen1 = g(r, "cat1Generated", "creditsCat1");
    const gen2 = g(r, "cat2Generated", "creditsCat2");
    const gen3 = g(r, "cat3Generated", "creditsCat3");
    const gen4 = g(r, "cat4Generated", "creditsCat4");
    const tgt1 = g(r, "cat1Target", "targetCat1");
    const tgt2 = g(r, "cat2Target", "targetCat2");
    const tgt3 = g(r, "cat3Target", "targetCat3");
    const tgt4 = g(r, "cat4Target", "targetCat4");

    const totalGenerated = gen1 + gen2 + gen3 + gen4;
    const totalSold      = sold.c1 + sold.c2 + sold.c3 + sold.c4;
    const totalTarget    = tgt1 + tgt2 + tgt3 + tgt4;
    const totalAchieved  = ach.c1 + ach.c2 + ach.c3 + ach.c4;

    return {
      ...r,
      // Expose canonical names in response
      cat1Generated: gen1, cat2Generated: gen2, cat3Generated: gen3, cat4Generated: gen4,
      cat1Target: tgt1,    cat2Target: tgt2,    cat3Target: tgt3,    cat4Target: tgt4,
      // Sold (PWP)
      soldCat1: sold.c1, soldCat2: sold.c2, soldCat3: sold.c3, soldCat4: sold.c4,
      remainingCat1: gen1 - sold.c1, remainingCat2: gen2 - sold.c2,
      remainingCat3: gen3 - sold.c3, remainingCat4: gen4 - sold.c4,
      // Achieved (PIBO)
      achievedCat1: ach.c1, achievedCat2: ach.c2, achievedCat3: ach.c3, achievedCat4: ach.c4,
      remainingTargetCat1: tgt1 - ach.c1, remainingTargetCat2: tgt2 - ach.c2,
      remainingTargetCat3: tgt3 - ach.c3, remainingTargetCat4: tgt4 - ach.c4,
      // Totals
      totalGenerated, totalSold, totalRemaining: totalGenerated - totalSold,
      totalTarget, totalAchieved, totalRemainingTarget: totalTarget - totalAchieved,
      // Legacy compat aliases
      totalCredits: totalGenerated, totalUsed: totalSold,
      remainingCredits: totalGenerated - totalSold,
      totalAchieved, remainingTarget: totalTarget - totalAchieved,
      availableCredits: totalGenerated || Number(r.availableCredits ?? 0),
      targetAmount: totalTarget || Number(r.targetAmount ?? 0),
    };
  });

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const body = await req.json();

  // Normalise: accept both canonical and legacy field names from the form
  const normalised = {
    clientId: body.clientId,
    financialYear: body.financialYear,
    cat1Generated: body.cat1Generated ?? body.creditsCat1 ?? 0,
    cat2Generated: body.cat2Generated ?? body.creditsCat2 ?? 0,
    cat3Generated: body.cat3Generated ?? body.creditsCat3 ?? 0,
    cat4Generated: body.cat4Generated ?? body.creditsCat4 ?? 0,
    cat1Target: body.cat1Target ?? body.targetCat1 ?? 0,
    cat2Target: body.cat2Target ?? body.targetCat2 ?? 0,
    cat3Target: body.cat3Target ?? body.targetCat3 ?? 0,
    cat4Target: body.cat4Target ?? body.targetCat4 ?? 0,
  };

  const record = await FinancialYear.findOneAndUpdate(
    { clientId: normalised.clientId, financialYear: normalised.financialYear },
    normalised,
    { upsert: true, new: true }
  );
  return NextResponse.json(record, { status: 201 });
}

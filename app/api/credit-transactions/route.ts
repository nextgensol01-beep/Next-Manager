import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import CreditTransaction from "@/models/CreditTransaction";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const query: Record<string, string> = {};
    const fy = searchParams.get("fy"); if (fy) query.financialYear = fy;
    const from = searchParams.get("fromClientId"); if (from) query.fromClientId = from;
    const to = searchParams.get("toClientId"); if (to) query.toClientId = to;
    const creditType = searchParams.get("creditType"); if (creditType) query.creditType = creditType;
    const transactions = await CreditTransaction.find(query).sort({ date: -1 });
    return NextResponse.json(transactions);
  } catch (error) {
    console.error("GET /api/credit-transactions:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const body = await req.json();

    const c1 = Number(body.cat1Qty ?? body.cat1 ?? 0);
    const c2 = Number(body.cat2Qty ?? body.cat2 ?? 0);
    const c3 = Number(body.cat3Qty ?? body.cat3 ?? 0);
    const c4 = Number(body.cat4Qty ?? body.cat4 ?? 0);
    const r1 = Number(body.rateCat1 ?? 0);
    const r2 = Number(body.rateCat2 ?? 0);
    const r3 = Number(body.rateCat3 ?? 0);
    const r4 = Number(body.rateCat4 ?? 0);

    const totalAmount = c1*r1 + c2*r2 + c3*r3 + c4*r4;

    const tx = await CreditTransaction.create({
      financialYear: body.financialYear,
      fromClientId:  body.fromClientId ?? null,
      toClientId:    body.toClientId ?? null,
      creditType:    body.creditType ?? "Recycling",
      date:          body.date,
      notes:         body.notes ?? "",
      cat1Qty: c1, cat2Qty: c2, cat3Qty: c3, cat4Qty: c4,
      cat1: c1,    cat2: c2,    cat3: c3,    cat4: c4,
      rateCat1: r1, rateCat2: r2, rateCat3: r3, rateCat4: r4,
      totalAmount,
      quantity: c1 + c2 + c3 + c4,
    });
    return NextResponse.json(tx, { status: 201 });
  } catch (error) {
    console.error("POST /api/credit-transactions:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

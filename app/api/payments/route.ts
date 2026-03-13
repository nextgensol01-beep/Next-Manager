import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Payment from "@/models/Payment";

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

  const payments = await Payment.find(query).sort({ paymentDate: -1 });
  return NextResponse.json(payments);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const body = await req.json();
  const payment = await Payment.create(body);
  return NextResponse.json(payment, { status: 201 });
}

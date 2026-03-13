import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Invoice from "@/models/Invoice";

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
  const invoices = await Invoice.find(query).sort({ fromDate: -1 });
  return NextResponse.json(invoices);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const body = await req.json();
  const invoice = await Invoice.create(body);
  return NextResponse.json(invoice, { status: 201 });
}

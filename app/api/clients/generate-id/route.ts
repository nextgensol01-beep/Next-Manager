import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Client from "@/models/Client";

const PREFIX: Record<string, string> = {
  "PWP": "PWP",
  "Producer": "PRD",
  "Importer": "IMP",
  "Brand Owner": "BRD",
  "SIMP": "SMP",
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") || "PWP";
  const prefix = PREFIX[category] || "CLI";

  // Find the highest existing number for this prefix
  const existing = await Client.find({ clientId: { $regex: `^${prefix}-` } })
    .select("clientId")
    .lean();

  let max = 0;
  for (const c of existing) {
    const num = parseInt((c.clientId as string).split("-")[1] || "0", 10);
    if (!isNaN(num) && num > max) max = num;
  }

  const nextId = `${prefix}-${String(max + 1).padStart(3, "0")}`;
  return NextResponse.json({ clientId: nextId });
}

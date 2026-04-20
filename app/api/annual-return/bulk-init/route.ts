import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import AnnualReturn from "@/models/AnnualReturn";
import Client from "@/models/Client";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { financialYear } = await req.json();
    if (!financialYear) return NextResponse.json({ error: "financialYear required" }, { status: 400 });

    const [clients, existing] = await Promise.all([
      Client.find().select("clientId").lean(),
      AnnualReturn.find({ financialYear }).select("clientId").lean(),
    ]);

    const existingIds = new Set(existing.map((r) => r.clientId));
    const toCreate = clients
      .filter((c) => !existingIds.has(c.clientId))
      .map((c) => ({ clientId: c.clientId, financialYear, status: "Pending" }));

    if (toCreate.length > 0) {
      await AnnualReturn.insertMany(toCreate, { ordered: false });
    }

    return NextResponse.json({
      created: toCreate.length,
      message: `${toCreate.length} records initialised for FY ${financialYear}`,
    });
  } catch (error) {
    console.error("POST /api/annual-return/bulk-init:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Client from "@/models/Client";
import { syncAnnualReturnStatus } from "@/lib/server/annual-return-status-service";

const RECONCILIATION_CONCURRENCY = 8;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();
    const body = await req.json() as { financialYear?: unknown };
    const financialYear = String(body.financialYear || "").trim();
    if (!/^\d{4}-\d{2}$/.test(financialYear)) {
      return NextResponse.json({ error: "A valid financialYear is required" }, { status: 400 });
    }

    const clients = await Client.find().select("clientId").lean() as Array<{ clientId?: string }>;
    let changed = 0;
    let processed = 0;

    // A bounded worker pool avoids opening hundreds of simultaneous database
    // queries when an FY with many clients is reconciled.
    let nextIndex = 0;
    const workers = Array.from(
      { length: Math.min(RECONCILIATION_CONCURRENCY, clients.length) },
      async () => {
        while (nextIndex < clients.length) {
          const client = clients[nextIndex++];
          if (!client?.clientId) continue;
          const result = await syncAnnualReturnStatus(client.clientId, financialYear);
          processed += 1;
          if (result.changed) changed += 1;
        }
      },
    );
    await Promise.all(workers);

    return NextResponse.json({ financialYear, processed, changed });
  } catch (error) {
    console.error("POST /api/annual-return/reconcile:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


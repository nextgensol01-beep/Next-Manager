/**
 * ONE-TIME index fix: drops the stale contactId_1_clientId_1 index
 * from the clientcontacts collection, which was created by an older
 * version of the ClientContact schema that used contactId instead of personId.
 *
 * Call once: GET /api/fix-indexes
 * Safe to call multiple times.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import mongoose from "mongoose";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const db = mongoose.connection.db;
  if (!db) return NextResponse.json({ error: "DB not connected" }, { status: 500 });

  const collection = db.collection("clientcontacts");
  const results: Record<string, string> = {};

  // List of stale indexes to drop
  const staleIndexes = [
    "contactId_1_clientId_1",  // old unique index using contactId
    "contactId_1",             // old single-field index
  ];

  for (const indexName of staleIndexes) {
    try {
      await collection.dropIndex(indexName);
      results[indexName] = "dropped";
    } catch (e: unknown) {
      // Index doesn't exist — that's fine
      const msg = e instanceof Error ? e.message : String(e);
      results[indexName] = msg.includes("index not found") || msg.includes("IndexNotFound")
        ? "already gone"
        : `error: ${msg}`;
    }
  }

  // Recreate the correct indexes to be sure
  try {
    await collection.createIndex({ clientId: 1, personId: 1 }, { unique: true, name: "clientId_1_personId_1" });
    results["clientId_1_personId_1"] = "ensured";
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results["clientId_1_personId_1"] = `already exists or error: ${msg}`;
  }

  return NextResponse.json({ success: true, results });
}

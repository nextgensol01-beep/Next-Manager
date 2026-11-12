/**
 * ONE-TIME index fix: drops the stale contactId_1_clientId_1 index
 * from the clientcontacts collection, which was created by an older
 * version of the ClientContact schema that used contactId instead of personId.
 *
 * Administrator maintenance: POST /api/fix-indexes
 * Safe to call multiple times.
 */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { withAdminMaintenance } from "@/lib/server/maintenance-api";
import mongoose from "mongoose";

export const POST = withAdminMaintenance(async () => {
  await connectDB();

  const db = mongoose.connection.db;
  if (!db) throw new Error("DB not connected");

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
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== 27) throw error;
      results[indexName] = "already gone";
    }
  }

  // Recreate the correct indexes to be sure
  await collection.createIndex({ clientId: 1, personId: 1 }, { unique: true, name: "clientId_1_personId_1" });
  results["clientId_1_personId_1"] = "ensured";

  return NextResponse.json({ success: true, results });
});

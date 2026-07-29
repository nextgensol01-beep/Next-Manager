import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminSession } from "@/lib/authUsers";
import { connectDB } from "@/lib/mongoose";
import { migrateDriveLink } from "@/lib/server/google-drive-documents";
import Client from "@/models/Client";
import Document from "@/models/Document";
import { ensureDocumentOriginActivity, recordActivityEvent } from "@/lib/server/activity-events";

export const runtime = "nodejs";
export const maxDuration = 300;

function inferCategory(name: string) {
  if (/(invoice|sale|purchase)/i.test(name)) return "invoices";
  if (/(certificate|certification|approval|registration)/i.test(name)) return "certificates";
  if (/(annual|return|cpcb|compliance|epr|portal)/i.test(name)) return "compliance";
  if (/(bill|billing|payment|receipt|quotation|quote|financial|ledger)/i.test(name)) return "financial";
  return "other";
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await isAdminSession(session)) return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  try {
    await connectDB();
    const { id } = await params;
    const legacy = await Document.findById(id);
    if (!legacy) return NextResponse.json({ error: "Document not found." }, { status: 404 });
    if (legacy.storageType === "google-drive" && legacy.driveFileId) {
      return NextResponse.json({ documents: [legacy] });
    }
    await ensureDocumentOriginActivity(legacy, session);
    const client = await Client.findOne({ clientId: legacy.clientId }).lean() as { companyName?: string } | null;
    if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

    const migrated = await migrateDriveLink({
      link: legacy.driveLink,
      clientId: legacy.clientId,
      clientName: client.companyName || legacy.clientId,
    });
    if (!migrated.length) {
      return NextResponse.json({ error: "The linked folder contains no files." }, { status: 400 });
    }

    const [first, ...remaining] = migrated;
    const shared = {
      clientId: legacy.clientId,
      category: legacy.category || inferCategory(legacy.documentName),
      storageType: "google-drive",
      originalDriveLink: legacy.driveLink,
      source: "migration",
      migrationStatus: "migrated",
      uploadedDate: new Date(),
    };
    Object.assign(legacy, shared, first);
    await legacy.save();
    const created = remaining.length ? await Document.insertMany(remaining.map((file) => ({ ...shared, ...file }))) : [];
    const allMigrated = [legacy, ...created];
    await recordActivityEvent({
      clientId: legacy.clientId,
      category: "documents",
      type: "document_migrated",
      label: migrated.length === 1 ? "Document Migrated" : "Document Folder Migrated",
      detail: migrated.length === 1
        ? `${legacy.documentName} copied into managed Drive storage`
        : `${legacy.documentName} · ${migrated.length} files copied into managed Drive storage`,
      color: "teal",
      badge: "Migrated",
      badgeColor: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
      entityId: String(legacy._id),
      entityType: "document",
      relatedEntityIds: allMigrated.map((document) => String(document._id)),
    }, session);
    return NextResponse.json({ documents: [legacy, ...created] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Migration failed.";
    console.error("POST /api/documents/[id]/migrate:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

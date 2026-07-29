import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminSession } from "@/lib/authUsers";
import { connectDB } from "@/lib/mongoose";
import Document from "@/models/Document";
import { recordActivityEvent } from "@/lib/server/activity-events";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");
    const docs = await Document.find(clientId ? { clientId } : {}).sort({ uploadedDate: -1 });
    return NextResponse.json(docs);
  } catch (error) {
    console.error("GET /api/documents:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await isAdminSession(session)) return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  try {
    await connectDB();
    const body = await req.json();
    const documentName = typeof body.documentName === "string" ? body.documentName.trim() : "";
    const driveLink = typeof body.driveLink === "string" ? body.driveLink.trim() : "";
    if (!documentName || !driveLink || !body.clientId) {
      return NextResponse.json({ error: "clientId, documentName and driveLink are required" }, { status: 400 });
    }
    const allowedCategories = new Set(["compliance", "financial", "invoices", "certificates", "other"]);
    const doc = await Document.create({
      ...body,
      documentName,
      driveLink,
      category: allowedCategories.has(body.category) ? body.category : "other",
      storageType: "legacy-link",
      source: "manual-link",
      migrationStatus: "legacy",
    });
    await recordActivityEvent({
      clientId: doc.clientId,
      category: "documents",
      type: "document_linked",
      label: "Document Linked",
      detail: `${doc.documentName} · ${String(doc.category || "other").replace(/^./, (letter) => letter.toUpperCase())}`,
      color: "blue",
      badge: "Link",
      badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
      entityId: String(doc._id),
      entityType: "document",
      relatedEntityIds: [String(doc._id)],
    }, session);
    return NextResponse.json(doc, { status: 201 });
  } catch (error) {
    console.error("POST /api/documents:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

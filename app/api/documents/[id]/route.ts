import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminSession } from "@/lib/authUsers";
import { connectDB } from "@/lib/mongoose";
import Document from "@/models/Document";
import DeletedRecord from "@/models/DeletedRecord";
import { ensureDocumentOriginActivity, recordActivityEvent } from "@/lib/server/activity-events";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await isAdminSession(session)) return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  try {
    await connectDB();

    const body = await req.json();
    const { id } = await params;
    const documentName = typeof body.documentName === "string" ? body.documentName.trim() : "";
    const driveLink = typeof body.driveLink === "string" ? body.driveLink.trim() : "";
    const allowedCategories = new Set(["compliance", "financial", "invoices", "certificates", "other"]);
    const category = allowedCategories.has(body.category) ? body.category : "other";
    const uploadedDate = body.uploadedDate ? new Date(body.uploadedDate) : null;

    if (!documentName) {
      return NextResponse.json({ error: "documentName is required" }, { status: 400 });
    }

    if (!driveLink) {
      return NextResponse.json({ error: "driveLink is required" }, { status: 400 });
    }

    if (uploadedDate && Number.isNaN(uploadedDate.getTime())) {
      return NextResponse.json({ error: "uploadedDate is invalid" }, { status: 400 });
    }

    const previousDocument = await Document.findById(id);
    if (!previousDocument) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const documentKind = body.documentKind === "epr-certificate"
      ? "epr-certificate"
      : body.documentKind === "target-screenshot"
        ? "target-screenshot"
        : "general";
    const financialYear = typeof body.financialYear === "string" ? body.financialYear.trim() : "";
    if (documentKind === "target-screenshot") {
      if (!financialYear) {
        return NextResponse.json({ error: "Financial year is required for a target screenshot." }, { status: 400 });
      }
      if (previousDocument.mimeType && !previousDocument.mimeType.startsWith("image/")) {
        return NextResponse.json({ error: "Only an image can be marked as a target screenshot." }, { status: 415 });
      }
      const existingScreenshot = await Document.exists({
        _id: { $ne: previousDocument._id },
        clientId: previousDocument.clientId,
        documentKind: "target-screenshot",
        financialYear,
      });
      if (existingScreenshot) {
        return NextResponse.json({ error: `A target screenshot already exists for FY ${financialYear}.` }, { status: 409 });
      }
    }
    const documentUpdate = {
      $set: {
        documentName,
        driveLink,
        category,
        documentKind,
        ...(documentKind === "target-screenshot" ? { financialYear } : {}),
        ...(uploadedDate ? { uploadedDate } : {}),
      },
      ...(documentKind === "target-screenshot" ? {} : { $unset: { financialYear: 1 } }),
    };
    const updatedDocument = await Document.findByIdAndUpdate(
      id,
      documentUpdate,
      { new: true }
    );

    if (!updatedDocument) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const changes = [
      previousDocument.documentName !== documentName ? `renamed from ${previousDocument.documentName}` : "",
      previousDocument.category !== category ? `category changed from ${previousDocument.category || "Other"} to ${category}` : "",
      previousDocument.documentKind !== documentKind ? `purpose changed to ${documentKind.replace(/-/g, " ")}` : "",
      documentKind === "target-screenshot" && previousDocument.financialYear !== financialYear ? `financial year changed to ${financialYear}` : "",
      previousDocument.driveLink !== driveLink ? "Drive link updated" : "",
    ].filter(Boolean);
    await recordActivityEvent({
      clientId: updatedDocument.clientId,
      category: "documents",
      type: "document_updated",
      label: "Document Updated",
      detail: `${updatedDocument.documentName}${changes.length ? ` · ${changes.join(" · ")}` : ""}`,
      color: "violet",
      badge: "Updated",
      badgeColor: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
      entityId: String(updatedDocument._id),
      entityType: "document",
      relatedEntityIds: [String(updatedDocument._id)],
      financialYear: updatedDocument.financialYear || undefined,
    }, session);
    return NextResponse.json(updatedDocument);
  } catch (error) {
    console.error("PUT /api/documents/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await isAdminSession(session)) return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  try {
    await connectDB();
    const { id } = await params;
    const doc = await Document.findById(id);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await ensureDocumentOriginActivity(doc, session);
    const deletedRecord = await DeletedRecord.create({
      recordType: "document",
      recordId: id,
      label: `Document - ${doc.documentName}`,
      subLabel: `Client ${doc.clientId}`,
      data: doc.toObject(),
    });
    await Document.findByIdAndDelete(id);
    await recordActivityEvent({
      clientId: doc.clientId,
      category: "documents",
      type: "document_deleted",
      label: "Document Moved to Recycle Bin",
      detail: doc.documentName,
      color: "rose",
      badge: "Deleted",
      badgeColor: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
      entityId: String(deletedRecord._id),
      entityType: "trash",
      recordType: "document",
      actionSearch: doc.documentName,
      relatedEntityIds: [String(doc._id), String(deletedRecord._id)],
    }, session);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/documents/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

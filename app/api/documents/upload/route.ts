import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminSession } from "@/lib/authUsers";
import { connectDB } from "@/lib/mongoose";
import { uploadClientDocument } from "@/lib/server/google-drive-documents";
import Client from "@/models/Client";
import Document from "@/models/Document";
import { recordActivityEvent } from "@/lib/server/activity-events";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const CATEGORIES = new Set(["compliance", "financial", "invoices", "certificates", "other"]);
const BLOCKED_EXTENSIONS = /\.(exe|msi|bat|cmd|com|scr|ps1|sh)$/i;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await isAdminSession(session)) return NextResponse.json({ error: "Administrator access required" }, { status: 403 });

  try {
    const form = await req.formData();
    const file = form.get("file");
    const clientId = String(form.get("clientId") || "").trim();
    const category = String(form.get("category") || "other");
    const rawPath = String(form.get("relativePath") || "");

    if (!(file instanceof File) || !clientId) {
      return NextResponse.json({ error: "A file and clientId are required." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `${file.name} exceeds the 25 MB limit.` }, { status: 413 });
    }
    if (BLOCKED_EXTENSIONS.test(file.name)) {
      return NextResponse.json({ error: "This file type is not allowed." }, { status: 415 });
    }

    await connectDB();
    const client = await Client.findOne({ clientId }).lean() as { companyName?: string } | null;
    if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

    const relativePath = rawPath
      .replace(/\\/g, "/")
      .split("/")
      .filter((part) => part && part !== "." && part !== "..")
      .join("/") || file.name;
    const bytes = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadClientDocument({
      clientId,
      clientName: client.companyName || clientId,
      fileName: file.name,
      mimeType: file.type,
      bytes,
      relativePath,
    });

    const document = await Document.create({
      clientId,
      documentName: file.name,
      category: CATEGORIES.has(category) ? category : "other",
      storageType: "google-drive",
      driveFileId: uploaded.driveFileId,
      driveLink: uploaded.driveLink,
      driveRelativePath: relativePath,
      mimeType: uploaded.mimeType,
      fileSize: uploaded.fileSize,
      source: "website-upload",
      uploadedDate: new Date(),
    });
    await recordActivityEvent({
      clientId,
      category: "documents",
      type: "document_uploaded",
      label: "Document Uploaded",
      detail: `${file.name} · ${String(document.category).replace(/^./, (letter) => letter.toUpperCase())}${relativePath !== file.name ? ` · ${relativePath}` : ""}`,
      color: "emerald",
      badge: "Upload",
      badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
      entityId: String(document._id),
      entityType: "document",
      relatedEntityIds: [String(document._id)],
    }, session);
    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    console.error("POST /api/documents/upload:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

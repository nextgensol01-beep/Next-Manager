import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import { downloadDriveFile } from "@/lib/server/google-drive-documents";
import Document from "@/models/Document";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();
    const { id } = await params;
    const document = await Document.findById(id).lean() as {
      driveFileId?: string;
      mimeType?: string;
      documentKind?: string;
    } | null;

    if (!document || document.documentKind !== "target-screenshot") {
      return NextResponse.json({ error: "Target screenshot not found." }, { status: 404 });
    }
    if (!document.driveFileId || !document.mimeType?.startsWith("image/")) {
      return NextResponse.json({ error: "Preview is unavailable for this document." }, { status: 415 });
    }

    const bytes = await downloadDriveFile(document.driveFileId);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": document.mimeType,
        "Cache-Control": "private, no-store, max-age=0",
        "Pragma": "no-cache",
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    console.error("GET /api/documents/[id]/preview:", error);
    return NextResponse.json({ error: "Preview could not be loaded." }, { status: 500 });
  }
}

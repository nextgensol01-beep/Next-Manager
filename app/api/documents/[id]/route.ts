import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Document from "@/models/Document";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();

    const body = await req.json();
    const { id } = await params;
    const documentName = typeof body.documentName === "string" ? body.documentName.trim() : "";
    const driveLink = typeof body.driveLink === "string" ? body.driveLink.trim() : "";
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

    const updatedDocument = await Document.findByIdAndUpdate(
      id,
      {
        documentName,
        driveLink,
        ...(uploadedDate ? { uploadedDate } : {}),
      },
      { new: true }
    );

    if (!updatedDocument) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updatedDocument);
  } catch (error) {
    console.error("PUT /api/documents/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { id } = await params;
    await Document.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/documents/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

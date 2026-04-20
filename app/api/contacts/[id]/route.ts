import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import {
  deleteContactDirectoryEntry,
  getContactDirectoryEntry,
  updatePersonProfile,
} from "@/lib/server/client-contact-service";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { id } = await params;
  const contact = await getContactDirectoryEntry(id);

  if (!contact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(contact);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();
    const { id } = await params;
    const body = await req.json();
    const person = await updatePersonProfile(id, {
      name: body.name,
      phoneNumbers: Array.isArray(body.phoneNumbers)
        ? body.phoneNumbers
        : typeof body.mobile === "string"
          ? [body.mobile]
          : [],
      emails: Array.isArray(body.emails)
        ? body.emails
        : typeof body.email === "string"
          ? [body.email]
          : [],
    });

    if (!person) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const contact = await getContactDirectoryEntry(id);
    return NextResponse.json(contact);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to update contact";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { id } = await params;
  const deleted = await deleteContactDirectoryEntry(id);

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Contact from "@/models/Contact";
import Client from "@/models/Client";
import DeletedRecord from "@/models/DeletedRecord";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const contact = await Contact.findById(id);
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const companies = await Client.find({
    $or: [{ contactId: id }, { contactIds: id }],
  }).select("clientId companyName category state");
  return NextResponse.json({ ...contact.toObject(), companies });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const body = await req.json();
  const { id } = await params;
  const contact = await Contact.findByIdAndUpdate(id, body, { new: true });
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(contact);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const contact = await Contact.findById(id);
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await DeletedRecord.create({
    recordType: "contact",
    recordId: id,
    label: contact.name,
    subLabel: contact.mobile || contact.email || "",
    data: contact.toObject(),
  });
  await Client.updateMany(
    { $or: [{ contactId: id }, { contactIds: id }] },
    { $set: { contactId: null }, $pull: { contactIds: id } }
  );
  await Contact.findByIdAndDelete(id);
  return NextResponse.json({ success: true });
}

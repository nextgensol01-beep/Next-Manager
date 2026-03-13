import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Client from "@/models/Client";
import Contact from "@/models/Contact";
import DeletedRecord from "@/models/DeletedRecord";

export async function GET(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const { clientId } = await params;
  const client = await Client.findOne({ clientId: clientId });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const c = client.toObject();
  const ids = [...(c.contactIds || []), ...(c.contactId ? [c.contactId] : [])].filter(Boolean);
  const unique = [...new Set(ids)];
  const contacts = unique.length > 0 ? await Contact.find({ _id: { $in: unique } }).lean() : [];
  return NextResponse.json({ ...c, contacts });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const body = await req.json();
  const { clientId } = await params;
  const client = await Client.findOneAndUpdate({ clientId: clientId }, body, { new: true });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(client);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const { clientId } = await params;
  const client = await Client.findOne({ clientId: clientId });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await DeletedRecord.create({
    recordType: "client",
    recordId: client.clientId,
    label: `${client.companyName} (${client.clientId})`,
    subLabel: client.category,
    data: client.toObject(),
  });
  await Client.findOneAndDelete({ clientId: clientId });
  return NextResponse.json({ success: true });
}

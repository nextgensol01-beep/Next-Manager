import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Client from "@/models/Client";
import Contact from "@/models/Contact";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const state = searchParams.get("state");
  const search = searchParams.get("search");

  const query: Record<string, unknown> = {};
  if (category && category !== "all") query.category = category;
  if (state && state !== "all") query.state = state;

  if (search) {
    const matchingContacts = await Contact.find({
      $or: [{ name: { $regex: search, $options: "i" } }, { mobile: { $regex: search, $options: "i" } }],
    }).select("_id");
    const contactIds = matchingContacts.map((c) => c._id.toString());
    query.$or = [
      { clientId: { $regex: search, $options: "i" } },
      { companyName: { $regex: search, $options: "i" } },
      { contactPerson: { $regex: search, $options: "i" } },
      ...(contactIds.length > 0 ? [{ contactIds: { $in: contactIds } }, { contactId: { $in: contactIds } }] : []),
    ];
  }

  const clients = await Client.find(query).sort({ createdAt: -1 });

  const enriched = await Promise.all(
    clients.map(async (client) => {
      const c = client.toObject();
      const ids = [...(c.contactIds || []), ...(c.contactId ? [c.contactId] : [])].filter(Boolean);
      const unique = [...new Set(ids)];
      if (unique.length > 0) {
        const contacts = await Contact.find({ _id: { $in: unique } }).lean();
        return { ...c, contacts };
      }
      return { ...c, contacts: [] };
    })
  );

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const body = await req.json();
  const existing = await Client.findOne({ clientId: body.clientId });
  if (existing) return NextResponse.json({ error: "Client ID already exists" }, { status: 400 });
  const client = await Client.create(body);
  return NextResponse.json(client, { status: 201 });
}

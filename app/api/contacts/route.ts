import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Contact from "@/models/Contact";
import Client from "@/models/Client";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search");
  const withCompanies = searchParams.get("withCompanies") === "true";

  const query: Record<string, unknown> = {};
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { mobile: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const contacts = await Contact.find(query).sort({ name: 1 });

  if (withCompanies) {
    const enriched = await Promise.all(
      contacts.map(async (c) => {
        const id = c._id.toString();
        // Search both old contactId field and new contactIds array
        const companies = await Client.find({
          $or: [{ contactId: id }, { contactIds: id }],
        }).select("clientId companyName category state");
        return { ...c.toObject(), companies };
      })
    );
    return NextResponse.json(enriched);
  }

  return NextResponse.json(contacts);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const body = await req.json();
  const contact = await Contact.create(body);
  return NextResponse.json(contact, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import AnnualReturn from "@/models/AnnualReturn";
import Client from "@/models/Client";
import { getClientContactsMap } from "@/lib/server/client-contact-service";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const fy     = searchParams.get("fy");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const query: Record<string, unknown> = {};
    if (fy)     query.financialYear = fy;
    if (status && status !== "all") query.status = status;

    if (search) {
      const clients = await Client.find({ companyName: { $regex: search, $options: "i" } }).select("clientId");
      query.clientId = { $in: clients.map((c) => c.clientId) };
    }

    const records = await AnnualReturn.find(query).sort({ updatedAt: -1 });

    const clientIds = [...new Set(records.map((r) => r.clientId))];

    const [clientDocs, contactsMap] = await Promise.all([
      Client.find({ clientId: { $in: clientIds } }).select("clientId companyName category state").lean(),
      getClientContactsMap(clientIds),
    ]);

    const clientMap = new Map(clientDocs.map((c) => [c.clientId, c]));

    const enriched = records.map((r) => {
      const client = clientMap.get(r.clientId);
      const linkedContacts = contactsMap.get(r.clientId) || [];

      const contacts: Array<{
        name: string;
        selectedEmails: string[];
        suggestedEmails: string[];
      }> = [];
      for (const contact of linkedContacts) {
        const selectedEmails = Array.from(new Set(contact.emails.filter(Boolean)));
        const suggestedEmails = Array.from(
          new Set((contact.allEmails || []).filter((email) => email && !selectedEmails.includes(email)))
        );
        contacts.push({ name: contact.name, selectedEmails, suggestedEmails });
      }

      return {
        ...r.toObject(),
        client: client
          ? {
              companyName: client.companyName,
              category:    client.category,
              state:       client.state,
              contacts,
            }
          : null,
      };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("GET /api/annual-return:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const body = await req.json();

    const record = await AnnualReturn.findOneAndUpdate(
      { clientId: body.clientId, financialYear: body.financialYear },
      { $set: body },
      { new: true, upsert: true }
    );

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error("POST /api/annual-return:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

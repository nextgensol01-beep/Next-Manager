import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import AnnualReturn from "@/models/AnnualReturn";
import Client from "@/models/Client";
import { getClientContactsMap } from "@/lib/server/client-contact-service";
import { syncAnnualReturnStatus } from "@/lib/server/annual-return-status-service";
import { recordActivityEvent } from "@/lib/server/activity-events";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const fy     = searchParams.get("fy");
    const clientId = searchParams.get("clientId");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    // Client profiles self-heal legacy stale statuses when their FY is opened.
    if (clientId && fy) {
      await syncAnnualReturnStatus(clientId, fy);
    }

    const query: Record<string, unknown> = {};
    if (fy)     query.financialYear = fy;
    if (clientId) query.clientId = clientId;
    if (status === "Not Started") query.status = { $in: ["Not Started", "Pending"] };
    else if (status && status !== "all") query.status = status;

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
    const previous = await AnnualReturn.findOne({ clientId: body.clientId, financialYear: body.financialYear }).lean() as { status?: string } | null;

    let record = await AnnualReturn.findOneAndUpdate(
      { clientId: body.clientId, financialYear: body.financialYear },
      { $set: body },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    await syncAnnualReturnStatus(record.clientId, record.financialYear);
    record = await AnnualReturn.findById(record._id);

    await recordActivityEvent({
      clientId: record.clientId,
      category: "compliance",
      type: previous ? "annual_return_updated" : "annual_return_created",
      label: previous ? "Annual Return Updated" : "Annual Return Started",
      detail: previous?.status && previous.status !== record.status
        ? `Status changed from ${previous.status} to ${record.status}`
        : `Status set to ${record.status}`,
      color: record.status === "Filed" || record.status === "Verified" ? "emerald" : "amber",
      badge: record.status,
      financialYear: record.financialYear,
      entityId: String(record._id),
      entityType: "annual-return",
      relatedEntityIds: [String(record._id)],
    }, session);

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error("POST /api/annual-return:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

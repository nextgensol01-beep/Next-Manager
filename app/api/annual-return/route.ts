import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import AnnualReturn from "@/models/AnnualReturn";
import Client from "@/models/Client";
import Contact from "@/models/Contact";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  // Enrich with full client info including email and resolved contacts
  const enriched = await Promise.all(
    records.map(async (r) => {
      const client = await Client.findOne({ clientId: r.clientId })
        .select("companyName category state email contactIds contactId");

      let contacts: { name: string; email: string }[] = [];
      if (client) {
        // Resolve contactIds array (new multi-contact system)
        const ids = [
          ...(client.contactIds || []),
          ...(client.contactId ? [client.contactId] : []),
        ].filter(Boolean);

        if (ids.length > 0) {
          const contactDocs = await Contact.find({ _id: { $in: ids } })
            .select("name email");
          contacts = contactDocs
            .filter((c) => c.email)
            .map((c) => ({ name: c.name, email: c.email as string }));
        }
      }

      return {
        ...r.toObject(),
        client: client
          ? {
              companyName: client.companyName,
              category:    client.category,
              state:       client.state,
              email:       client.email || "",
              contacts,
            }
          : null,
      };
    })
  );

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const body = await req.json();

  // Upsert: update if exists, create otherwise
  const record = await AnnualReturn.findOneAndUpdate(
    { clientId: body.clientId, financialYear: body.financialYear },
    { $set: body },
    { new: true, upsert: true }
  );

  return NextResponse.json(record, { status: 201 });
}

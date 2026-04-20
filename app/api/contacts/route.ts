import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import {
  createPersonProfile,
  listContactDirectory,
} from "@/lib/server/client-contact-service";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search");
  const withCompanies = searchParams.get("withCompanies") === "true";

  const contacts = await listContactDirectory({ search, withCompanies });
  return NextResponse.json(contacts);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();
    const body = await req.json();
    const { person, merged } = await createPersonProfile({
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

    const payload = {
      _id: person._id,
      name: person.name,
      phoneNumbers: person.phoneNumbers,
      emails: person.emails,
      mobile: person.phoneNumbers[0] || "",
      email: person.emails[0] || "",
      createdAt: person.createdAt,
      companies: [],
    };

    return NextResponse.json(merged ? { ...payload, merged: true } : payload, { status: merged ? 200 : 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to save contact";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

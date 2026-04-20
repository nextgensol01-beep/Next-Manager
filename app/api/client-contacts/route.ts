import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import {
  listCompanyContacts,
  upsertCompanyContactLink,
} from "@/lib/server/client-contact-service";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId") || "";
  const personId = searchParams.get("personId") || undefined;

  if (!clientId) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }

  const contacts = await listCompanyContacts(clientId, personId);
  return NextResponse.json(personId ? contacts[0] || null : contacts);
}

async function saveCompanyContact(req: NextRequest, status: 200 | 201) {
  await connectDB();
  const body = await req.json();
  const linkedContact = await upsertCompanyContactLink(body.clientId || "", body);
  return NextResponse.json(linkedContact, { status });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return await saveCompanyContact(req, 201);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return await saveCompanyContact(req, 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

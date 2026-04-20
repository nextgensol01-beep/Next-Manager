import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import {
  deleteClientRecord,
  getClientWithContacts,
  updateClientRecord,
} from "@/lib/server/client-contact-service";

export async function GET(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const { clientId } = await params;
  const client = await getClientWithContacts(clientId);

  if (!client) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(client);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();
    const { clientId } = await params;
    const body = await req.json();
    const client = await updateClientRecord(clientId, body);

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json(client);
  } catch (error: unknown) {
    console.error("PUT /api/clients/[clientId] error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("cannot be changed") || message.includes("required") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const { clientId } = await params;
  const client = await deleteClientRecord(clientId);

  if (!client) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

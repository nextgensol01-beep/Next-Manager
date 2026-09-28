import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import { clientCredentialAccess } from "@/lib/server/client-credentials";
import {
  deleteClientRecord,
  getClientWithContacts,
  updateClientRecord,
} from "@/lib/server/client-contact-service";
import { recordActivityEvent } from "@/lib/server/activity-events";

export async function GET(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const { clientId } = await params;
  const client = await getClientWithContacts(clientId);

  if (!client) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const access = await clientCredentialAccess(session);
  return NextResponse.json(access.read(client));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();
    const { clientId } = await params;
    const body = await req.json();
    const access = await clientCredentialAccess(session);
    const client = await updateClientRecord(clientId, access.write(body), access.admin ? new Set() : access.protectedKeys);

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    await recordActivityEvent({
      clientId,
      category: "system",
      type: "client_updated",
      label: "Client Profile Updated",
      detail: "Company, contact or portal details were updated",
      color: "violet",
      badge: "Updated",
      entityId: String(client._id || clientId),
      entityType: "client",
      relatedEntityIds: [String(client._id || clientId)],
    }, session).catch((error) => {
      // The client transaction already committed. An audit failure must not
      // tell the user their save failed and encourage a duplicate retry.
      console.error("Unable to record client update activity:", error);
    });

    return NextResponse.json(access.read(client));
  } catch (error: unknown) {
    console.error("PUT /api/clients/[clientId] error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Admin access required") ? 403 : /cannot be changed|required|missing|needs at least one|linked only once/.test(message) ? 400 : 500;
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

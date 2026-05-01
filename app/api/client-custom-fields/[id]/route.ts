import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import ClientCustomField from "@/models/ClientCustomField";
import { isClientCustomFieldIcon, isClientCustomFieldProfilePosition, isClientCustomFieldType } from "@/lib/clientCustomFields";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();
    const { id } = await params;
    const body = await req.json();
    const update: Record<string, unknown> = {};

    if (typeof body.label === "string") {
      const label = body.label.trim();
      if (!label) return NextResponse.json({ error: "Field label is required" }, { status: 400 });
      update.label = label;
    }
    if (isClientCustomFieldType(body.type)) update.type = body.type;
    if ("searchable" in body) update.searchable = Boolean(body.searchable);
    if ("required" in body) update.required = Boolean(body.required);
    if ("active" in body) update.active = Boolean(body.active);
    if ("showInProfile" in body) update.showInProfile = Boolean(body.showInProfile);
    if (isClientCustomFieldProfilePosition(body.profilePosition)) update.profilePosition = body.profilePosition;
    if (isClientCustomFieldIcon(body.icon)) update.icon = body.icon;
    if ("order" in body && String(body.order).trim() !== "" && Number.isFinite(Number(body.order))) update.order = Number(body.order);

    const field = await ClientCustomField.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true });
    if (!field) {
      return NextResponse.json({ error: "Field not found" }, { status: 404 });
    }

    return NextResponse.json(field);
  } catch (error) {
    console.error("PUT /api/client-custom-fields/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { id } = await params;
  const field = await ClientCustomField.findByIdAndUpdate(id, { $set: { active: false } }, { new: true });

  if (!field) {
    return NextResponse.json({ error: "Field not found" }, { status: 404 });
  }

  return NextResponse.json(field);
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import ClientCustomField from "@/models/ClientCustomField";
import ClientCustomFieldGroup from "@/models/ClientCustomFieldGroup";
import {
  isClientCustomFieldFormSection,
  isClientCustomFieldFormTab,
  isClientCustomFieldIcon,
  isClientCustomFieldProfileCluster,
} from "@/lib/clientCustomFields";

const cleanCategories = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
  : [];

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { id } = await params;
    const body = await req.json();
    const update: Record<string, unknown> = {};
    if (typeof body.label === "string" && body.label.trim()) update.label = body.label.trim();
    if (typeof body.description === "string") update.description = body.description.trim();
    if (isClientCustomFieldIcon(body.icon)) update.icon = body.icon;
    if ("active" in body) update.active = Boolean(body.active);
    if ("applicableCategories" in body) update.applicableCategories = cleanCategories(body.applicableCategories);
    if (isClientCustomFieldFormTab(body.formTab)) update.formTab = body.formTab;
    if (isClientCustomFieldFormSection(body.formSection)) update.formSection = body.formSection;
    if (body.profileDisplay === "subsection" || body.profileDisplay === "card") update.profileDisplay = body.profileDisplay;
    if (isClientCustomFieldProfileCluster(body.profileCluster)) update.profileCluster = body.profileCluster;
    if ("collapsible" in body) update.collapsible = Boolean(body.collapsible);
    if ("defaultExpanded" in body) update.defaultExpanded = Boolean(body.defaultExpanded);
    if (String(body.order ?? "").trim() !== "" && Number.isFinite(Number(body.order))) update.order = Number(body.order);
    const group = await ClientCustomFieldGroup.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true });
    if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
    return NextResponse.json(group);
  } catch (error) {
    console.error("PUT /api/client-custom-field-groups/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const permanent = new URL(req.url).searchParams.get("permanent") === "1";
  if (!permanent) {
    const group = await ClientCustomFieldGroup.findByIdAndUpdate(id, { $set: { active: false } }, { new: true });
    return group ? NextResponse.json(group) : NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  const group = await ClientCustomFieldGroup.findById(id).lean() as { _id: unknown } | null;
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  await ClientCustomField.updateMany({ groupId: String(group._id) }, { $set: { groupId: "" } });
  await ClientCustomFieldGroup.findByIdAndDelete(id);
  return NextResponse.json({ deleted: true });
}

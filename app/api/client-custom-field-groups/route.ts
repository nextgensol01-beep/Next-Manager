import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import ClientCustomFieldGroup from "@/models/ClientCustomFieldGroup";
import {
  customFieldKeyFromLabel,
  isClientCustomFieldFormTab,
  isClientCustomFieldFormSection,
  isClientCustomFieldIcon,
  isClientCustomFieldProfileCluster,
} from "@/lib/clientCustomFields";

const cleanKey = (value: string) => value.trim().replace(/[^a-zA-Z0-9]/g, "");
const cleanCategories = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
  : [];

async function nextOrder() {
  const latest = await ClientCustomFieldGroup.findOne().sort({ order: -1 }).select("order").lean() as { order?: number } | null;
  return (Number(latest?.order) || 0) + 10;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const includeInactive = new URL(req.url).searchParams.get("includeInactive") === "1";
  const groups = await ClientCustomFieldGroup.find(includeInactive ? {} : { active: true })
    .sort({ order: 1, label: 1 })
    .lean();
  return NextResponse.json(groups);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const body = await req.json();
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const key = cleanKey(typeof body.key === "string" ? body.key : "") || customFieldKeyFromLabel(label);
    if (!label || !key) return NextResponse.json({ error: "Group name and key are required" }, { status: 400 });
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)) {
      return NextResponse.json({ error: "Group key must start with a letter and use only letters and numbers" }, { status: 400 });
    }
    if (await ClientCustomFieldGroup.exists({ key })) {
      return NextResponse.json({ error: `A group with key "${key}" already exists` }, { status: 400 });
    }
    const group = await ClientCustomFieldGroup.create({
      key,
      label,
      description: typeof body.description === "string" ? body.description.trim() : "",
      icon: isClientCustomFieldIcon(body.icon) ? body.icon : "fileText",
      showIcon: body.showIcon !== false,
      active: body.active !== false,
      applicableCategories: cleanCategories(body.applicableCategories),
      formTab: isClientCustomFieldFormTab(body.formTab) ? body.formTab : "basic",
      formSection: isClientCustomFieldFormSection(body.formSection)
        ? body.formSection
        : body.formTab === "portal" ? "portalCredentials" : "company",
      profileDisplay: body.profileDisplay === "card" ? "card" : "subsection",
      profileCluster: isClientCustomFieldProfileCluster(body.profileCluster) ? body.profileCluster : "additional",
      collapsible: body.collapsible !== false,
      defaultExpanded: Boolean(body.defaultExpanded),
      order: String(body.order ?? "").trim() !== "" && Number.isFinite(Number(body.order))
        ? Number(body.order)
        : await nextOrder(),
    });
    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    console.error("POST /api/client-custom-field-groups:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import ClientCustomField from "@/models/ClientCustomField";
import {
  customFieldKeyFromLabel,
  isClientCustomFieldIcon,
  isClientCustomFieldProfilePosition,
  isClientCustomFieldType,
  type ClientCustomFieldIcon,
  type ClientCustomFieldProfilePosition,
  type ClientCustomFieldType,
} from "@/lib/clientCustomFields";

function cleanKey(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9]/g, "");
}

async function nextOrder() {
  const latest = await ClientCustomField.findOne().sort({ order: -1 }).select("order").lean() as { order?: number } | null;
  return (Number(latest?.order) || 0) + 10;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("includeInactive") === "1";
  const query = includeInactive ? {} : { active: true };
  const fields = await ClientCustomField.find(query).sort({ order: 1, label: 1 }).lean();

  return NextResponse.json(fields);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();
    const body = await req.json();
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const explicitKey = typeof body.key === "string" ? cleanKey(body.key) : "";
    const key = explicitKey || customFieldKeyFromLabel(label);
    const type: ClientCustomFieldType = isClientCustomFieldType(body.type) ? body.type : "text";
    const profilePosition: ClientCustomFieldProfilePosition = isClientCustomFieldProfilePosition(body.profilePosition)
      ? body.profilePosition
      : "beforeContact";
    const icon: ClientCustomFieldIcon = isClientCustomFieldIcon(body.icon) ? body.icon : "fileText";

    if (!label) {
      return NextResponse.json({ error: "Field label is required" }, { status: 400 });
    }
    if (!key) {
      return NextResponse.json({ error: "Field key is required" }, { status: 400 });
    }
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)) {
      return NextResponse.json({ error: "Field key must start with a letter and use only letters and numbers" }, { status: 400 });
    }

    const duplicate = await ClientCustomField.findOne({ key }).lean();
    if (duplicate) {
      return NextResponse.json({ error: `A field with key "${key}" already exists` }, { status: 400 });
    }

    const field = await ClientCustomField.create({
      key,
      label,
      type,
      searchable: Boolean(body.searchable),
      required: Boolean(body.required),
      active: body.active !== false,
      showInProfile: body.showInProfile !== false,
      profilePosition,
      icon,
      order: typeof body.order !== "undefined" && String(body.order).trim() !== "" && Number.isFinite(Number(body.order))
        ? Number(body.order)
        : await nextOrder(),
    });

    return NextResponse.json(field, { status: 201 });
  } catch (error) {
    console.error("POST /api/client-custom-fields:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

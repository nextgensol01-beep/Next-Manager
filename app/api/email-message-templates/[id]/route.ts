import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import EmailMessageTemplate from "@/models/EmailMessageTemplate";

const emailMessageTemplatePatchSchema = z.object({
  name: z.string().trim().min(1, "Template name is required").max(80),
  bodyHtml: z.string().trim().min(1, "Message body is required").max(8000),
  bodyText: z.string().trim().min(1, "Message body is required").max(4000),
});

function serializeTemplate(template: Record<string, unknown>) {
  return {
    _id: String(template._id || ""),
    name: String(template.name || ""),
    bodyHtml: String(template.bodyHtml || ""),
    bodyText: String(template.bodyText || ""),
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

function getId(id: string) {
  return mongoose.Types.ObjectId.isValid(id) ? id : "";
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: rawId } = await params;
  const id = getId(rawId);
  if (!id) return NextResponse.json({ error: "Invalid template id" }, { status: 400 });

  const parsedBody = emailMessageTemplatePatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.issues.map(issue => issue.message).join("; ") }, { status: 400 });
  }

  await connectDB();
  const template = await EmailMessageTemplate.findByIdAndUpdate(id, parsedBody.data, { new: true }).lean();
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  return NextResponse.json({ template: serializeTemplate(template as Record<string, unknown>) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: rawId } = await params;
  const id = getId(rawId);
  if (!id) return NextResponse.json({ error: "Invalid template id" }, { status: 400 });

  await connectDB();
  const template = await EmailMessageTemplate.findByIdAndDelete(id).lean();
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}

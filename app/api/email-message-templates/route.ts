import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import EmailMessageTemplate from "@/models/EmailMessageTemplate";

const MAX_EMAIL_MESSAGE_TEMPLATES = 10;

const emailMessageTemplateSchema = z.object({
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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const templates = await EmailMessageTemplate.find({})
    .sort({ updatedAt: -1 })
    .limit(MAX_EMAIL_MESSAGE_TEMPLATES)
    .lean();

  return NextResponse.json({
    templates: templates.map(template => serializeTemplate(template as Record<string, unknown>)),
    limit: MAX_EMAIL_MESSAGE_TEMPLATES,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsedBody = emailMessageTemplateSchema.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.issues.map(issue => issue.message).join("; ") }, { status: 400 });
  }

  await connectDB();
  const count = await EmailMessageTemplate.countDocuments({});
  if (count >= MAX_EMAIL_MESSAGE_TEMPLATES) {
    return NextResponse.json({ error: `You can save up to ${MAX_EMAIL_MESSAGE_TEMPLATES} message templates.` }, { status: 409 });
  }

  const template = await EmailMessageTemplate.create(parsedBody.data);
  return NextResponse.json({ template: serializeTemplate(template.toObject()) }, { status: 201 });
}

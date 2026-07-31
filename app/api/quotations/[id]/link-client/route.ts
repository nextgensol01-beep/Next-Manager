import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Client from "@/models/Client";
import Quotation from "@/models/Quotation";
import { mongoObjectIdSchema, validationErrorMessage } from "@/lib/quotationValidation";

const linkClientSchema = z.object({
  clientId: z.string().trim().min(1, "Client is required"),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { id } = await params;
  const parsedId = mongoObjectIdSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: validationErrorMessage(parsedId.error) }, { status: 400 });

  const parsedBody = linkClientSchema.safeParse(await req.json());
  if (!parsedBody.success) return NextResponse.json({ error: validationErrorMessage(parsedBody.error) }, { status: 400 });

  const quotation = await Quotation.findById(id);
  if (!quotation) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
  if (quotation.status !== "Accepted") {
    return NextResponse.json({ error: "Client linking from this action is only available for accepted quotations" }, { status: 409 });
  }
  if (quotation.clientId) {
    return NextResponse.json({ error: "This quotation is already linked to a saved client" }, { status: 409 });
  }

  const clientResult = await Client.findOne({ clientId: parsedBody.data.clientId }).lean();
  if (!clientResult) return NextResponse.json({ error: "Selected client is not saved in the database" }, { status: 404 });
  const client = clientResult as unknown as { clientId: string; companyName: string };

  quotation.clientId = client.clientId;
  quotation.activities.push({
    timestamp: new Date(),
    action: "Client linked",
    detail: `Linked to ${client.companyName} (${client.clientId})`,
  });
  await quotation.save();

  return NextResponse.json({
    clientId: client.clientId,
    companyName: client.companyName,
  });
}

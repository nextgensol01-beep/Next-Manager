import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Quotation from "@/models/Quotation";
import { mongoObjectIdSchema, quotationStatusPatchSchema, validationErrorMessage } from "@/lib/quotationValidation";
import { QuotationWorkflowError, applyQuotationStatusChange } from "@/lib/quotationWorkflow";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { id } = await params;
  const parsedId = mongoObjectIdSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: validationErrorMessage(parsedId.error) }, { status: 400 });

  const parsedBody = quotationStatusPatchSchema.safeParse(await req.json());
  if (!parsedBody.success) {
    return NextResponse.json({ error: validationErrorMessage(parsedBody.error) }, { status: 400 });
  }
  const { status, reason } = parsedBody.data;

  const quotation = await Quotation.findById(id);
  if (!quotation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    applyQuotationStatusChange(quotation, status, reason);
  } catch (error) {
    if (error instanceof QuotationWorkflowError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    throw error;
  }
  await quotation.save();
  return NextResponse.json(quotation);
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { securityRequestBody, withDeliverySecurity } from "@/lib/server/email-delivery-security-api";
import { resolveTrackerDraft, syncTrackerDrafts } from "@/lib/server/tracker-email-draft-sync";

export const maxDuration = 60;

const scope = { workflowId: z.string().min(1).max(200), kind: z.enum(["initial", "reminder"]) };
const target = { campaignId: z.string().min(1).max(200), clientId: z.string().min(1).max(200) };
const requestBody = z.discriminatedUnion("action", [
  z.object({ ...scope, action: z.literal("sync") }).strict(),
  z.object({ ...scope, ...target, action: z.literal("discarded") }).strict(),
  z.object({ ...scope, ...target, action: z.literal("sent"), sentAt: z.iso.datetime().optional(), messageId: z.string().min(1).max(200).optional() }).strict(),
]);

export const POST = withDeliverySecurity(async (request, context, { params }: { params: Promise<{ id: string }> }) => {
  const input = requestBody.parse(await securityRequestBody(request));
  const { id } = await params;
  const scope = { trackerId: id, workflowId: input.workflowId, mailKind: input.kind };
  if (input.action === "sync") return NextResponse.json(await syncTrackerDrafts(scope, context));
  const { action, campaignId, clientId } = input;
  const confirmation = action === "sent" ? { messageId: input.messageId, sentAt: input.sentAt ? new Date(input.sentAt) : undefined } : {};
  await resolveTrackerDraft(scope, { action, campaignId, clientId, ...confirmation }, context);
  return NextResponse.json({ success: true });
});

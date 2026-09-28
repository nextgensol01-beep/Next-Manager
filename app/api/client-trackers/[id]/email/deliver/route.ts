import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { isAdminSession } from "@/lib/authUsers";
import { connectDB } from "@/lib/mongoose";
import ClientTracker from "@/models/ClientTracker";
import ClientTrackerEntry from "@/models/ClientTrackerEntry";
import Document from "@/models/Document";
import EmailLog from "@/models/EmailLog";
import TrackerEmailCampaign from "@/models/TrackerEmailCampaign";
import ClientWorkItem from "@/models/ClientWorkItem";
import { deliverThroughGmail } from "@/lib/server/gmail-delivery";
import { materializeTrackerEmailAttachments } from "@/lib/server/tracker-email-attachments";
import {
  resolveTrackerEmailAttachmentDocuments,
  type ManagedTrackerEmailDocument,
} from "@/lib/server/tracker-email-attachments";
import { resolveTrackerLinkedValues } from "@/lib/server/tracker-linked-data";
import { resolveTrackerComputedValues } from "@/lib/server/tracker-computed-values";
import {
  evaluateTrackerConditionGroup,
  legacyWorkflowCondition,
} from "@/lib/server/tracker-conditions";
import { TRACKER_EMAIL_SAFETY } from "@/lib/tracker-email-safety";
import { recordActivityEvent } from "@/lib/server/activity-events";
import type {
  TrackerEmailWorkflow,
  TrackerField,
  TrackerValues,
} from "@/lib/clientTrackers";

const schema = z.object({
  campaignId: z.string().min(10).max(100),
  workflowId: z.string().min(1).max(80),
  kind: z.enum(["initial", "reminder"]),
  mode: z.enum(["draft", "send"]),
  messages: z
    .array(
      z.object({
        entryId: z.string().min(1),
        clientId: z.string().min(1),
        companyName: z.string().min(1),
        to: z.array(z.string().email()).min(1),
        cc: z.array(z.string().email()).default([]),
        subject: z.string().min(1).max(200),
        html: z.string().min(1),
        attachments: z
          .array(z.object({ documentId: z.string().min(1) }))
          .max(4)
          .default([]),
      }),
    )
    .min(1)
    .max(1000),
  resume: z.boolean().optional(),
  confirmed: z.literal(true).optional(),
});

const pause = () =>
  new Promise<void>((resolve) =>
    setTimeout(resolve, TRACKER_EMAIL_SAFETY.delayBetweenDeliveriesMs),
  );

/**
 * Stores each recipient before delivery. If the page closes, the completed/failed
 * status remains available from the email history instead of becoming ambiguous.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdminSession(session)))
    return NextResponse.json(
      { error: "Administrator access required to deliver tracker emails." },
      { status: 403 },
    );
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues.map((issue) => issue.message).join("; ") },
      { status: 400 },
    );
  if (parsed.data.mode === "send" && parsed.data.confirmed !== true)
    return NextResponse.json(
      { error: "Confirm this campaign before sending client emails." },
      { status: 400 },
    );
  const clientIds = new Set<string>();
  const recipientEmails = new Set<string>();
  for (const message of parsed.data.messages) {
    if (clientIds.has(message.clientId))
      return NextResponse.json(
        { error: "A client appears more than once in this campaign." },
        { status: 400 },
      );
    clientIds.add(message.clientId);
    const recipients = [...message.to, ...message.cc].map((email) =>
      email.trim().toLowerCase(),
    );
    if (new Set(recipients).size !== recipients.length)
      return NextResponse.json(
        {
          error: `Duplicate recipient address for ${message.companyName}. Remove it from To or CC.`,
        },
        { status: 400 },
      );
    if (recipients.some((email) => recipientEmails.has(email)))
      return NextResponse.json(
        {
          error:
            "The same email address appears for more than one client in this campaign. Send those clients separately to prevent duplicate notices.",
        },
        { status: 400 },
      );
    recipients.forEach((email) => recipientEmails.add(email));
  }
  const { id } = await params;
  await connectDB();
  const tracker = (await ClientTracker.findById(id)
    .select("name financialYear status fields emailEnabled emailWorkflows")
    .lean()) as {
    name: string;
    financialYear?: string;
    status: string;
    fields: TrackerField[];
    emailEnabled?: boolean;
    emailWorkflows?: TrackerEmailWorkflow[];
  } | null;
  if (
    !tracker ||
    tracker.status !== "active" ||
    !tracker.emailEnabled ||
    !tracker.emailWorkflows?.some(
      (workflow) => workflow.id === parsed.data.workflowId,
    )
  )
    return NextResponse.json(
      { error: "This tracker email workflow is unavailable." },
      { status: 409 },
    );
  const workflow = tracker.emailWorkflows.find(
    (item) => item.id === parsed.data.workflowId,
  );
  const campaignClientIds = [...clientIds];
  const existingSentLogs = await EmailLog.find({
    trackerId: id,
    workflowId: parsed.data.workflowId,
    clientId: { $in: campaignClientIds },
    status: "sent",
    mailKind: { $in: ["initial", "reminder"] },
  })
    .select("clientId mailKind sentAt communicationStatus")
    .lean();
  const initialSentClientIds = new Set(
    existingSentLogs
      .filter((log) => log.mailKind === "initial")
      .map((log) => log.clientId),
  );
  const repliedClientIds = new Set(
    existingSentLogs
      .filter((log) => log.communicationStatus === "replied")
      .map((log) => log.clientId),
  );
  const sharedDocumentIds = (workflow?.attachments || [])
    .filter(
      (attachment) =>
        attachment.source === "shared" && Boolean(attachment.documentId),
    )
    .map((attachment) => attachment.documentId!);
  const reminderCooldownSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentlySentClientIds = new Set(
    existingSentLogs
      .filter(
        (log) =>
          log.sentAt instanceof Date && log.sentAt >= reminderCooldownSince,
      )
      .map((log) => log.clientId),
  );
  type CampaignMessage = {
    entryId: string;
    clientId: string;
    companyName: string;
    to: string[];
    cc: string[];
    subject: string;
    html: string;
    attachments?: Array<{ documentId: string }>;
    status?: "pending" | "draft" | "sent" | "failed";
  };
  const existing = (await TrackerEmailCampaign.findOne({
    campaignId: parsed.data.campaignId,
  }).lean()) as {
    _id: string;
    campaignId: string;
    status: string;
    completed: number;
    failed: number;
    total: number;
    items: CampaignMessage[];
  } | null;
  if (existing && !parsed.data.resume)
    return NextResponse.json({
      campaignId: existing.campaignId,
      status: existing.status,
      completed: existing.completed,
      failed: existing.failed,
      total: existing.total,
      alreadyProcessed: true,
    });
  if (
    existing &&
    existing.status !== "processing" &&
    existing.status !== "paused_daily_limit"
  )
    return NextResponse.json({
      campaignId: existing.campaignId,
      status: existing.status,
      completed: existing.completed,
      failed: existing.failed,
      total: existing.total,
      alreadyProcessed: true,
    });
  const campaign =
    existing ||
    (await TrackerEmailCampaign.create({
      campaignId: parsed.data.campaignId,
      trackerId: id,
      workflowId: parsed.data.workflowId,
      mailKind: parsed.data.kind,
      mode: parsed.data.mode,
      total: parsed.data.messages.length,
      items: parsed.data.messages.map((message) => ({
        ...message,
        status: "pending",
      })),
      createdBy: session.user?.email || undefined,
    }));
  const campaignMessages: CampaignMessage[] = existing
    ? existing.items
    : parsed.data.messages;
  let completed = existing?.completed || 0;
  let failed = existing?.failed || 0;
  let dailyRemaining = TRACKER_EMAIL_SAFETY.maxSendsPer24Hours;
  if (parsed.data.mode === "send") {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    dailyRemaining -= await EmailLog.countDocuments({
      type: "tracker",
      status: "sent",
      sentAt: { $gte: since },
    });
  }
  let pausedForDailyLimit = false;
  for (let index = 0; index < campaignMessages.length; index += 1) {
    const message = campaignMessages[index];
    if (message.status && message.status !== "pending") continue;
    if (parsed.data.mode === "send" && dailyRemaining <= 0) {
      pausedForDailyLimit = true;
      break;
    }
    try {
      const entry = await ClientTrackerEntry.findOne({
        _id: message.entryId,
        trackerId: id,
        clientId: message.clientId,
        inScope: { $ne: false },
      }).lean();
      if (!entry)
        throw new Error("This client is no longer available in the tracker.");
      const [linkedValues, documents] = await Promise.all([
        resolveTrackerLinkedValues(
          tracker.fields,
          [message.clientId],
          tracker.financialYear,
        ),
        workflow?.attachments?.length
          ? Document.find({
              storageType: "google-drive",
              driveFileId: { $exists: true, $ne: "" },
              mimeType: { $exists: true, $ne: "" },
              $or: [
                { clientId: message.clientId },
                ...(sharedDocumentIds.length
                  ? [{ _id: { $in: sharedDocumentIds } }]
                  : []),
              ],
            })
              .sort({ uploadedDate: -1 })
              .lean()
          : Promise.resolve([]),
      ]);
      const values = resolveTrackerComputedValues(tracker.fields, {
        ...(entry.values as TrackerValues),
        ...(linkedValues.get(message.clientId) || {}),
      });
      const eligibility =
        workflow?.conditionGroup ||
        (workflow
          ? legacyWorkflowCondition(workflow.mainFieldKey, workflow.mainValue)
          : undefined);
      if (!eligibility || !evaluateTrackerConditionGroup(eligibility, values))
        throw new Error(
          "This client no longer matches the workflow conditions. Prepare the campaign again to refresh it.",
        );
      if (
        parsed.data.kind === "initial" &&
        initialSentClientIds.has(message.clientId)
      )
        throw new Error(
          "An initial email was already sent to this client. Prepare a reminder campaign instead.",
        );
      if (
        parsed.data.kind === "reminder" &&
        !initialSentClientIds.has(message.clientId)
      )
        throw new Error(
          "An initial email has not been sent to this client yet.",
        );
      if (
        parsed.data.kind === "reminder" &&
        repliedClientIds.has(message.clientId)
      )
        throw new Error(
          "This client has replied to the workflow email and should not receive a reminder.",
        );
      if (
        parsed.data.kind === "reminder" &&
        recentlySentClientIds.has(message.clientId)
      )
        throw new Error(
          "This client received a workflow email in the last seven days.",
        );
      const allowedAttachments = workflow
        ? resolveTrackerEmailAttachmentDocuments({
            workflow,
            documents: documents as unknown as ManagedTrackerEmailDocument[],
            clientId: message.clientId,
            values,
            financialYear: tracker.financialYear,
          })
        : [];
      const attachments = await materializeTrackerEmailAttachments({
        clientId: message.clientId,
        attachments: message.attachments || [],
        allowedDocumentIds: allowedAttachments.map((item) => item.documentId),
      });
      const delivery = await deliverThroughGmail({
        to: message.to,
        cc: message.cc.filter((email) => !message.to.includes(email)),
        subject: message.subject,
        html: message.html,
        signatureGap: workflow?.signatureGap ?? 2,
        attachments,
        mode: parsed.data.mode,
      });
      completed += 1;
      message.status = parsed.data.mode === "send" ? "sent" : "draft";
      if (parsed.data.mode === "send") dailyRemaining -= 1;
      const emailLog = await EmailLog.create({
        type: "tracker",
        to: message.to,
        cc: message.cc,
        subject: message.subject,
        renderedHtml: message.html,
        renderedBody: message.html
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
        clientId: message.clientId,
        clientName: message.companyName,
        financialYear: tracker.financialYear || "",
        status: parsed.data.mode === "send" ? "sent" : "draft",
        trackerId: id,
        workflowId: parsed.data.workflowId,
        mailKind: parsed.data.kind,
        campaignId: parsed.data.campaignId,
        gmailMessageId: delivery.draftId,
        gmailThreadId: delivery.threadId,
        attachments: (message.attachments || []).map((item, index) => ({
          documentId: item.documentId,
          filename: attachments[index]?.filename || "Attachment",
          mimeType: attachments[index]?.mimeType || "application/octet-stream",
          fileSize: Math.round(
            (attachments[index]?.contentBase64.length || 0) * 0.75,
          ),
        })),
        notes: `Campaign ${parsed.data.campaignId}. ${parsed.data.mode === "send" ? "Message" : "Draft"} ID: ${delivery.draftId}`,
      });
      await Promise.all([
        recordActivityEvent(
          {
            clientId: message.clientId,
            category: "communications",
            type:
              parsed.data.mode === "send"
                ? "tracker_email_sent"
                : "tracker_email_drafted",
            label:
              parsed.data.mode === "send"
                ? "Tracker email sent"
                : "Tracker email draft created",
            detail: `${workflow?.name || "Workflow"} · ${message.subject}`,
            color: parsed.data.mode === "send" ? "emerald" : "blue",
            badge: parsed.data.kind === "reminder" ? "Reminder" : "Email",
            financialYear: tracker.financialYear,
            entityId: id,
            entityType: "client_tracker",
            relatedEntityIds: [String(emailLog._id)],
          },
          session,
        ),
        TrackerEmailCampaign.updateOne(
          { _id: campaign._id },
          {
            $set: {
              [`items.${index}.status`]:
                parsed.data.mode === "send" ? "sent" : "draft",
              [`items.${index}.deliveryId`]: delivery.draftId,
            },
            $inc: { completed: 1 },
          },
        ),
        ...(parsed.data.mode === "send" &&
        parsed.data.kind === "initial" &&
        workflow?.followUp?.enabled
          ? [
              ClientWorkItem.create({
                clientId: message.clientId,
                financialYear: tracker.financialYear || "",
                kind: "follow_up",
                title: `Follow up: ${tracker.name}`,
                details: `No-reply follow-up for ${message.subject}`,
                priority: "normal",
                ownerEmail: workflow.followUp.ownerEmail,
                dueAt: new Date(
                  Date.now() +
                    workflow.followUp.daysAfter * 24 * 60 * 60 * 1000,
                ),
                createdBy: session.user?.email || undefined,
                trackerId: id,
                campaignId: parsed.data.campaignId,
                emailLogId: String(emailLog._id),
              }),
            ]
          : []),
      ]);
    } catch (error) {
      failed += 1;
      message.status = "failed";
      const messageText =
        error instanceof Error ? error.message : "Delivery failed";
      await Promise.all([
        TrackerEmailCampaign.updateOne(
          { _id: campaign._id },
          {
            $set: {
              [`items.${index}.status`]: "failed",
              [`items.${index}.error`]: messageText,
            },
            $inc: { failed: 1 },
          },
        ),
        EmailLog.create({
          type: "tracker",
          to: message.to,
          subject: message.subject,
          clientId: message.clientId,
          clientName: message.companyName,
          financialYear: tracker.financialYear || "",
          status: "failed",
          trackerId: id,
          workflowId: parsed.data.workflowId,
          mailKind: parsed.data.kind,
          notes: `Campaign ${parsed.data.campaignId}. ${messageText}`,
        }),
      ]);
    }
    if (index < campaignMessages.length - 1) await pause();
  }
  const pending = campaignMessages.filter(
    (message) => !message.status || message.status === "pending",
  ).length;
  const status =
    pausedForDailyLimit && pending
      ? "paused_daily_limit"
      : failed
        ? "completed_with_errors"
        : "completed";
  await TrackerEmailCampaign.updateOne(
    { _id: campaign._id },
    { $set: { status } },
  );
  return NextResponse.json({
    campaignId: parsed.data.campaignId,
    status,
    completed,
    failed,
    pending,
    total: campaignMessages.length,
    safety: TRACKER_EMAIL_SAFETY,
  });
}

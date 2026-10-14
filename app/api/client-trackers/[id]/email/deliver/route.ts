import { NextResponse } from "next/server";
import { trackerDeliverySchema } from "@/lib/email-delivery-security";
import {
  acquireDeliveryLease,
  authorizeCampaign,
  loadSecuritySettings,
  securityAudit,
  type AuthorizedCampaign,
} from "@/lib/server/email-delivery-approval";
import { DeliverySecurityError } from "@/lib/server/email-delivery-crypto";
import {
  securityRequestBody,
  withDeliverySecurity,
} from "@/lib/server/email-delivery-security-api";
import ClientTracker from "@/models/ClientTracker";
import ClientTrackerEntry from "@/models/ClientTrackerEntry";
import Document from "@/models/Document";
import EmailLog from "@/models/EmailLog";
import TrackerEmailCampaign from "@/models/TrackerEmailCampaign";
import ClientWorkItem from "@/models/ClientWorkItem";
import {
  deliverThroughGmail,
  GmailDeliveryError,
} from "@/lib/server/gmail-delivery";
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

const pause = () =>
  new Promise<void>((resolve) =>
    setTimeout(resolve, TRACKER_EMAIL_SAFETY.delayBetweenDeliveriesMs),
  );

/**
 * Stores each recipient before delivery. If the page closes, the completed/failed
 * status remains available from the email history instead of becoming ambiguous.
 */
export const POST = withDeliverySecurity(async function POST(
  req,
  context,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = context.session;
  const parsed = trackerDeliverySchema.safeParse(
    await securityRequestBody(req),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues.map((issue) => issue.message).join("; ") },
      { status: 400 },
    );
  const clientIds = new Set(
    parsed.data.messages.map((message) => message.clientId),
  );
  const { id } = await params;
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
  const settings = await loadSecuritySettings();
  let campaign = await authorizeCampaign(context, id, parsed.data, settings);
  const audit = {
    trackerId: id,
    workflowId: parsed.data.workflowId,
    campaignId: parsed.data.campaignId,
    approvalId: campaign.approvalId,
    mode: parsed.data.mode,
    mailKind: parsed.data.kind,
    messageCount: campaign.total,
  };
  const lease = await acquireDeliveryLease();
  try {
    // A competing request may have completed before this request acquired the lease.
    const latestCampaign = await TrackerEmailCampaign.findOne({
      campaignId: parsed.data.campaignId,
    }).lean<AuthorizedCampaign | null>();
    if (!latestCampaign)
      throw new DeliverySecurityError("This campaign is unavailable.", 409);
    campaign = latestCampaign;
    await securityAudit(context, "delivery_started", audit);
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
    const reminderCooldownSince = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    );
    const recentlySentClientIds = new Set(
      existingSentLogs
        .filter(
          (log) =>
            log.sentAt instanceof Date && log.sentAt >= reminderCooldownSince,
        )
        .map((log) => log.clientId),
    );
    // The durable Gmail result is authoritative even if EmailLog persistence failed.
    const sentCampaigns = await TrackerEmailCampaign.find({
      trackerId: id,
      workflowId: parsed.data.workflowId,
      mode: "send",
      "items.status": "sent",
    })
      .select("mailKind items")
      .lean<
        Array<{
          mailKind: string;
          items: Array<{ clientId: string; status: string; claimedAt?: Date }>;
        }>
      >();
    for (const previous of sentCampaigns)
      for (const item of previous.items) {
        if (item.status !== "sent") continue;
        if (previous.mailKind === "initial")
          initialSentClientIds.add(item.clientId);
        if (item.claimedAt && item.claimedAt >= reminderCooldownSince)
          recentlySentClientIds.add(item.clientId);
      }
    type CampaignMessage = {
      entryId: string;
      clientId: string;
      companyName: string;
      to: string[];
      cc: string[];
      subject: string;
      html: string;
      attachments?: Array<{ documentId: string }>;
      deliveryId?: string;
      deliveryThreadId?: string;
      historyRecordedAt?: Date;
      status?:
        | "pending"
        | "delivering"
        | "uncertain"
        | "draft"
        | "sent"
        | "failed";
    };
    // Persisted items, never newly supplied messages, are the resume snapshot.
    const campaignMessages: CampaignMessage[] = campaign.items;
    // Recover acknowledged Gmail deliveries without invoking Gmail again.
    for (let index = 0; index < campaignMessages.length; index += 1) {
      const message = campaignMessages[index];
      if (
        !["sent", "draft"].includes(message.status || "") ||
        message.historyRecordedAt ||
        !message.deliveryId
      )
        continue;
      await lease.renew();
      const existingLog = await EmailLog.findOne({
        trackerId: id,
        campaignId: campaign.campaignId,
        clientId: message.clientId,
        status: message.status,
      });
      if (!existingLog) {
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
          status: message.status,
          trackerId: id,
          workflowId: campaign.workflowId,
          mailKind: campaign.mailKind,
          campaignId: campaign.campaignId,
          gmailMessageId: message.deliveryId,
          gmailThreadId: message.deliveryThreadId,
          attachments: (message.attachments || []).map((item) => ({
            documentId: item.documentId,
            filename: "Attachment",
          })),
          notes: `Recovered campaign ${campaign.campaignId}. Gmail delivery ID: ${message.deliveryId}`,
        });
        await recordActivityEvent(
          {
            clientId: message.clientId,
            category: "communications",
            type:
              message.status === "sent"
                ? "tracker_email_sent"
                : "tracker_email_drafted",
            label:
              message.status === "sent"
                ? "Tracker email sent"
                : "Tracker email draft created",
            detail: `${workflow?.name || "Workflow"} · ${message.subject}`,
            financialYear: tracker.financialYear,
            entityId: id,
            entityType: "client_tracker",
            relatedEntityIds: [String(emailLog._id)],
          },
          session,
        );
      }
      const log =
        existingLog ||
        (await EmailLog.findOne({
          trackerId: id,
          campaignId: campaign.campaignId,
          clientId: message.clientId,
          status: message.status,
        }));
      if (
        message.status === "sent" &&
        campaign.mailKind === "initial" &&
        workflow?.followUp?.enabled &&
        log &&
        !(await ClientWorkItem.exists({ emailLogId: String(log._id) }))
      ) {
        await ClientWorkItem.create({
          clientId: message.clientId,
          financialYear: tracker.financialYear || "",
          kind: "follow_up",
          title: `Follow up: ${tracker.name}`,
          details: `No-reply follow-up for ${message.subject}`,
          priority: "normal",
          ownerEmail: workflow.followUp.ownerEmail,
          dueAt: new Date(
            Date.now() + workflow.followUp.daysAfter * 86_400_000,
          ),
          createdBy: context.userEmail,
          trackerId: id,
          campaignId: campaign.campaignId,
          emailLogId: String(log._id),
        });
      }
      await TrackerEmailCampaign.updateOne(
        { _id: campaign._id },
        { $set: { [`items.${index}.historyRecordedAt`]: new Date() } },
      );
    }
    if (["completed", "completed_with_errors"].includes(campaign.status))
      return NextResponse.json({
        campaignId: campaign.campaignId,
        status: campaign.status,
        completed: campaign.completed,
        failed: campaign.failed,
        total: campaign.total,
        alreadyProcessed: true,
      });
    let completed = campaign.completed || 0;
    let failed = campaign.failed || 0;
    let dailyRemaining = TRACKER_EMAIL_SAFETY.maxSendsPer24Hours;
    if (parsed.data.mode === "send") {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      dailyRemaining -= await EmailLog.countDocuments({
        type: "tracker",
        status: "sent",
        sentAt: { $gte: since },
      });
      const uncertain = await TrackerEmailCampaign.aggregate([
        { $match: { mode: "send" } },
        { $unwind: "$items" },
        {
          $match: {
            $or: [
              { "items.status": { $in: ["delivering", "uncertain"] } },
              { "items.status": "sent", "items.historyRecordedAt": null },
            ],
            "items.claimedAt": { $gte: since },
          },
        },
        { $count: "count" },
      ]);
      dailyRemaining -= uncertain[0]?.count || 0;
    }
    let pausedForDailyLimit = false;
    for (let index = 0; index < campaignMessages.length; index += 1) {
      await lease.renew();
      const message = campaignMessages[index];
      if (message.status && message.status !== "pending") continue;
      if (parsed.data.mode === "send" && dailyRemaining <= 0) {
        pausedForDailyLimit = true;
        break;
      }
      let gmailAccepted = false;
      let claimedByRequest = false;
      try {
        if (
          parsed.data.mode === "send" &&
          (await TrackerEmailCampaign.exists({
            trackerId: id,
            workflowId: parsed.data.workflowId,
            mode: "send",
            items: {
              $elemMatch: {
                clientId: message.clientId,
                status: { $in: ["delivering", "uncertain"] },
              },
            },
          }))
        )
          throw new Error(
            "A previous delivery to this client has an uncertain result. Review Gmail before preparing another delivery.",
          );
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
        await lease.renew();
        const claimed = await TrackerEmailCampaign.updateOne(
          { _id: campaign._id, [`items.${index}.status`]: "pending" },
          {
            $set: {
              [`items.${index}.status`]: "delivering",
              [`items.${index}.claimedAt`]: new Date(),
              [`items.${index}.deliveryClaimToken`]: lease.token,
            },
          },
        );
        if (!claimed.modifiedCount) continue;
        claimedByRequest = true;
        message.status = "delivering";
        const delivery = await deliverThroughGmail({
          to: message.to,
          cc: message.cc.filter((email) => !message.to.includes(email)),
          subject: message.subject,
          html: message.html,
          signatureGap: workflow?.signatureGap ?? 2,
          attachments,
          mode: parsed.data.mode,
        });
        gmailAccepted = true;
        // Save Gmail's acknowledged result before any optional bookkeeping.
        const acknowledged = await TrackerEmailCampaign.updateOne(
          {
            _id: campaign._id,
            [`items.${index}.status`]: "delivering",
            [`items.${index}.deliveryClaimToken`]: lease.token,
          },
          {
            $set: {
              [`items.${index}.status`]:
                parsed.data.mode === "send" ? "sent" : "draft",
              [`items.${index}.deliveryId`]: delivery.draftId,
              [`items.${index}.deliveryThreadId`]: delivery.threadId,
            },
            $inc: { completed: 1 },
          },
        );
        if (!acknowledged.modifiedCount)
          throw new Error(
            "Gmail accepted this delivery but its campaign result could not be saved.",
          );
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
            mimeType:
              attachments[index]?.mimeType || "application/octet-stream",
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
        await TrackerEmailCampaign.updateOne(
          { _id: campaign._id },
          { $set: { [`items.${index}.historyRecordedAt`]: new Date() } },
        );
      } catch (error) {
        if (
          error instanceof DeliverySecurityError &&
          error.code === "DELIVERY_LEASE_ENDED"
        )
          throw error;
        if (message.status === "sent" || message.status === "draft") {
          await securityAudit(context, "delivery_bookkeeping_failed", {
            ...audit,
            result: "requires_review",
          });
          throw new DeliverySecurityError(
            "Gmail completed delivery but history could not be fully recorded. Retry this same campaign; delivered recipients will not be resent.",
            503,
            "DELIVERY_BOOKKEEPING_FAILED",
          );
        }
        if (!claimedByRequest) await lease.renew();
        const uncertain =
          gmailAccepted ||
          (error instanceof GmailDeliveryError && error.mayHaveDelivered);
        message.status = uncertain ? "uncertain" : "failed";
        const messageText =
          error instanceof Error ? error.message : "Delivery failed";
        const recorded = await TrackerEmailCampaign.updateOne(
          {
            _id: campaign._id,
            [`items.${index}.status`]: claimedByRequest
              ? "delivering"
              : "pending",
            ...(claimedByRequest
              ? { [`items.${index}.deliveryClaimToken`]: lease.token }
              : {}),
          },
          {
            $set: {
              [`items.${index}.status`]: message.status,
              [`items.${index}.error`]: messageText,
            },
            $inc: { failed: 1 },
          },
        );
        if (!recorded.modifiedCount)
          throw new DeliverySecurityError(
            "This item changed while processing. Retry this same campaign to read its result.",
            409,
            "DELIVERY_ITEM_CHANGED",
          );
        failed += 1;
        await securityAudit(context, "delivery_item_failed", {
          ...audit,
          result: uncertain ? "requires_review" : "failed",
          details: { itemIndex: index },
        });
        await EmailLog.create({
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
          campaignId: parsed.data.campaignId,
          notes: `Campaign ${parsed.data.campaignId}. ${uncertain ? "Delivery status uncertain; review Gmail before attempting this recipient again. " : ""}${messageText}`,
        });
      }
      if (index < campaignMessages.length - 1) await pause();
    }
    await lease.renew();
    const finalCampaign = await TrackerEmailCampaign.findOne({
      campaignId: campaign.campaignId,
    }).lean<AuthorizedCampaign | null>();
    if (!finalCampaign)
      throw new DeliverySecurityError(
        "Unable to read the campaign outcome. Retry this same campaign.",
        503,
      );
    completed = finalCampaign.completed;
    failed = finalCampaign.failed;
    const uncertain = finalCampaign.items.filter(
      (message) =>
        message.status === "delivering" || message.status === "uncertain",
    ).length;
    const pending = finalCampaign.items.filter(
      (message) => !message.status || message.status === "pending",
    ).length;
    const status =
      pausedForDailyLimit && pending
        ? "paused_daily_limit"
        : pending
          ? "processing"
          : failed || uncertain
            ? "completed_with_errors"
            : "completed";
    await TrackerEmailCampaign.updateOne(
      { _id: campaign._id },
      { $set: { status } },
    );
    await securityAudit(
      context,
      failed || uncertain
        ? "delivery_completed_with_errors"
        : "delivery_completed",
      {
        ...audit,
        result: status,
        details: { completed, failed, pending, uncertain },
      },
    );
    return NextResponse.json({
      campaignId: parsed.data.campaignId,
      status,
      completed,
      failed,
      pending,
      uncertain,
      total: campaignMessages.length,
      safety: TRACKER_EMAIL_SAFETY,
    });
  } finally {
    await lease.release();
  }
});

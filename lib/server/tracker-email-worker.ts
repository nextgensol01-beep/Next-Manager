import { randomUUID } from "node:crypto";
import { trackedDrafts, trackerDraftBlock } from "@/lib/server/tracker-email-drafts";
import {
  acquireDeliveryLease,
  securityDatabase,
  type SecurityContext,
  securityAudit,
  type AuthorizedCampaign,
} from "@/lib/server/email-delivery-approval";
import { DeliverySecurityError } from "@/lib/server/email-delivery-crypto";
import ClientTracker from "@/models/ClientTracker";
import ClientTrackerEntry from "@/models/ClientTrackerEntry";
import Client from "@/models/Client";
import { createTrackerEmailContext, emailCommunicationStatus, evaluateEmailConditionGroup } from "@/lib/tracker-email-context";
import EmailLog from "@/models/EmailLog";
import TrackerEmailCampaign from "@/models/TrackerEmailCampaign";
import ClientWorkItem from "@/models/ClientWorkItem";
import {
  deliverThroughGmail,
  GmailDeliveryError,
} from "@/lib/server/gmail-delivery";
import { materializeTrackerEmailAttachments } from "@/lib/server/tracker-email-attachments";
import { readTrackerAttachmentSnapshot } from "@/lib/server/tracker-attachment-snapshot";
import { resolveTrackerLinkedValues } from "@/lib/server/tracker-linked-data";
import { resolveTrackerComputedValues } from "@/lib/server/tracker-computed-values";
import {
  legacyWorkflowCondition,
} from "@/lib/server/tracker-conditions";
import { TRACKER_EMAIL_SAFETY } from "@/lib/tracker-email-safety";
import { recordActivityEvent } from "@/lib/server/activity-events";
import type {
  TrackerValues,
} from "@/lib/clientTrackers";

import { isAdminSession } from "@/lib/authUsers";
import { deliveryCounts } from "@/lib/email-delivery-jobs";
import type { DeliverySnapshot } from "@/models/TrackerEmailCampaign";
import { deliveryMemory, deliveryMemoryPressure } from "./email-delivery-memory";
const WORKER_SUMMARY_FIELDS = "campaignId trackerId workflowId mailKind mode status total completed failed approvalId authorizedAt batchHash startedAt items.clientId items.status items.deliveryId items.historyRecordedAt";
const pause = () => new Promise<void>(resolve => setTimeout(resolve, TRACKER_EMAIL_SAFETY.delayBetweenDeliveriesMs));
type WorkerCampaign = AuthorizedCampaign & { snapshot: DeliverySnapshot; startedAt?: Date; mode: "draft" | "send"; mailKind: "initial" | "reminder" };
/** Shared engine. The authenticated adapter supplies a fenced coordinator check. */
export async function processDeliveryJob(campaignId: string, execution: { assertOwnership: () => Promise<void> }) {
  await securityDatabase();
  const stored = await TrackerEmailCampaign.findOne({ campaignId, jobVersion: { $in: [1, 2] } }).select(WORKER_SUMMARY_FIELDS + " +snapshot").lean<WorkerCampaign | null>();
  if (!stored?.snapshot || !stored.authorizedAt || !stored.batchHash) return { state: "unavailable" as const, campaignId };
  if (stored.status === "paused_requires_attention") return { state: "attention" as const, campaignId };
  const actor = stored.snapshot.actor;
  const session = { user: { id: actor.userId, email: actor.userEmail }, expires: new Date(Date.now() + 60_000).toISOString() };
  const context: SecurityContext = { ...actor, ip: "", userAgent: "browser-batch-delivery", session };
  const id = stored.trackerId;
  const tracker = { name: stored.snapshot.trackerName, financialYear: stored.snapshot.financialYear, fields: stored.snapshot.fields };
  const workflow = stored.snapshot.workflow;
  const parsed = { data: { campaignId, workflowId: stored.workflowId, kind: stored.mailKind, mode: stored.mode } };
  let campaign: AuthorizedCampaign = stored;
  const audit = {
    trackerId: id,
    workflowId: parsed.data.workflowId,
    campaignId: parsed.data.campaignId,
    approvalId: campaign.approvalId,
    mode: parsed.data.mode,
    mailKind: parsed.data.kind,
    messageCount: campaign.total,
  };
  let lease: Awaited<ReturnType<typeof acquireDeliveryLease>>;
  try { lease = await acquireDeliveryLease(); }
  catch (error) {
    if (error instanceof DeliverySecurityError && error.code === "DELIVERY_BUSY") return { state: "busy" as const, campaignId };
    throw error;
  }
  const boundedNumber = (value: string | undefined, fallback: number, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(Number(value)) || fallback));
  const deadline = Date.now() + boundedNumber(process.env.EMAIL_DELIVERY_BATCH_BUDGET_MS, 15_000, 5000, 20_000);
  const batchSize = boundedNumber(process.env.EMAIL_DELIVERY_BATCH_SIZE, 1, 1, 5);
  let handled = 0;
  let attachmentBytes = 0;
  try {
    await execution.assertOwnership();
    // A competing request may have completed before this request acquired the lease.
    const latestCampaign = await TrackerEmailCampaign.findOne({
      campaignId: parsed.data.campaignId,
    }).select(WORKER_SUMMARY_FIELDS).lean<AuthorizedCampaign | null>();
    if (!latestCampaign)
      throw new DeliverySecurityError("This campaign is unavailable.", 409);
    campaign = latestCampaign;
    if (!(await isAdminSession(session)) || !(await ClientTracker.exists({ _id: id, status: "active", emailEnabled: true }))) {
      await TrackerEmailCampaign.updateOne({ _id: campaign._id }, { $set: { status: "paused_requires_attention", jobError: "The authorizing account or tracker is no longer available. Review before resuming." } });
      return { state: "attention" as const, campaignId };
    }
    const terminal = ["completed", "completed_with_errors"].includes(campaign.status);
    await TrackerEmailCampaign.updateOne({ _id: campaign._id }, { $set: { status: terminal ? campaign.status : "processing", lastWorkerToken: lease.token, startedAt: stored.startedAt || new Date(), lastProgressAt: new Date(), jobError: null } });
    // Fence abandoned Gmail calls as uncertain. Never restore them to pending.
    for (let i = 0; i < campaign.items.length; i++) {
      if (campaign.items[i].status !== "delivering") continue;
      await lease.renew();
      await TrackerEmailCampaign.updateOne({ _id: campaign._id, ["items." + i + ".status"]: "delivering" },
        { $set: { ["items." + i + ".status"]: "uncertain", ["items." + i + ".error"]: "Worker interrupted during Gmail delivery. Review Gmail before retrying.", ["items." + i + ".processedAt"]: new Date() } });
      campaign.items[i].status = "uncertain";
    }
    await securityAudit(context, "delivery_started", audit);
    const campaignClientIds = [...new Set(campaign.items.filter(item => !item.status || item.status === "pending").slice(0, batchSize).map(item => item.clientId))];
    const draftBlocks = new Map((await trackedDrafts({ trackerId: id, workflowId: parsed.data.workflowId, mailKind: parsed.data.kind }, { clientIds: campaignClientIds })).map(draft => [draft.clientId, trackerDraftBlock(draft).reason]));
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
    // No historical bodies, recipients or item arrays are returned to this process.
    for (const clientId of campaignClientIds) {
      const scope = { trackerId: id, workflowId: parsed.data.workflowId, mode: "send" };
      if (await TrackerEmailCampaign.exists({ ...scope, mailKind: "initial",
        items: { $elemMatch: { clientId, status: "sent" } } })) initialSentClientIds.add(clientId);
      if (await TrackerEmailCampaign.exists({ ...scope,
        items: { $elemMatch: { clientId, status: "sent", claimedAt: { $gte: reminderCooldownSince } } } })) recentlySentClientIds.add(clientId);
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
      attachmentSnapshot?: string;
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
    const readMessage = async (index: number) => {
      const row = await TrackerEmailCampaign.findOne({ _id: campaign._id })
        .select({ items: { $slice: [index, 1] } }).lean<{ items: CampaignMessage[] } | null>();
      if (!row?.items[0]) throw new DeliverySecurityError("This campaign item is unavailable.", 409);
      return row.items[0];
    };
    // Persisted items, never newly supplied messages, are the resume snapshot.
    const campaignMessages: CampaignMessage[] = campaign.items;
    // Recover acknowledged Gmail deliveries without invoking Gmail again.
    for (let index = 0; index < campaignMessages.length; index += 1) {
      let message = campaignMessages[index];
      if (
        !["sent", "draft"].includes(message.status || "") ||
        message.historyRecordedAt ||
        !message.deliveryId
      )
        continue;
      if (Date.now() >= deadline) return { state: "processing" as const, campaignId };
      await lease.renew();
      message = await readMessage(index);
      const existingLog = await EmailLog.findOne({
        trackerId: id,
        campaignId: campaign.campaignId,
        clientId: message.clientId,
        status: message.status === "draft" ? { $in: ["draft", "sent"] } : message.status,
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
          attachments: message.attachmentSnapshot ? readTrackerAttachmentSnapshot(message.attachmentSnapshot).picks.map(({ documentId, filename, mimeType, fileSize, category, financialYear, required }) => ({ documentId, filename, mimeType, fileSize, category, financialYear, required }))
            : (message.attachments || []).map(item => ({ documentId: item.documentId, filename: "Attachment" })),
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
    if (["completed", "completed_with_errors"].includes(campaign.status)) return { state: "done" as const, campaignId };
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
      let message = campaignMessages[index];
      if (message.status && message.status !== "pending") continue;
      if (handled >= batchSize || Date.now() >= deadline - 2000) break;
      // Always allow one message, so elevated baseline RSS cannot strand pending work.
      if (handled && (attachmentBytes >= 8 * 1024 * 1024 || deliveryMemoryPressure())) break;
      handled++;
      if (parsed.data.mode === "send" && dailyRemaining <= 0) {
        pausedForDailyLimit = true;
        break;
      }
      message = await readMessage(index);
      let materialized: Awaited<ReturnType<typeof materializeTrackerEmailAttachments>> = [];
      let gmailAccepted = false;
      let claimedByRequest = false;
      const draftBlock = draftBlocks.get(message.clientId);
      try {
        if (draftBlock) throw new Error(draftBlock);
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
        const linkedValues = await resolveTrackerLinkedValues(tracker.fields, [message.clientId], tracker.financialYear);
        const values = resolveTrackerComputedValues(tracker.fields, {
          ...(entry.values as TrackerValues),
          ...(linkedValues.get(message.clientId) || {}),
        });
        const eligibility =
          workflow?.conditionGroup ||
          (workflow
            ? legacyWorkflowCondition(workflow.mainFieldKey, workflow.mainValue)
            : undefined);
        // This is the existing live safety gate only. Never re-render or replace
        // the already-authorized subject/body/recipients from the snapshot.
        const needsClient = eligibility?.conditions.some(condition => ["client.category", "client.state"].includes(condition.fieldKey));
        const liveClient = needsClient ? await Client.findOne({ clientId: message.clientId }).select("clientId category state").lean<{ clientId: string; category?: string; state?: string } | null>() : { clientId: message.clientId, category: undefined, state: undefined };
        const needsCommunication = eligibility?.conditions.some(condition => condition.fieldKey === "client.communicationStatus");
        const latestLogs = needsCommunication ? await EmailLog.find({ trackerId: id, clientId: message.clientId }).select("status mailKind communicationStatus").sort({ sentAt: -1, _id: -1 }).limit(1).lean() : [];
        const conditionContext = liveClient ? createTrackerEmailContext({ entry: { clientId: message.clientId, _id: message.entryId },
          client: { clientId: liveClient.clientId, category: liveClient.category, state: liveClient.state }, values, fields: tracker.fields,
          financialYear: tracker.financialYear, trackerName: tracker.name, workflowName: workflow?.name || "",
          communicationStatus: emailCommunicationStatus(latestLogs[0] ? { status: latestLogs[0].status, mailKind: latestLogs[0].mailKind, communicationStatus: latestLogs[0].communicationStatus } : undefined) }) : null;
        if (!eligibility || !conditionContext || !evaluateEmailConditionGroup(eligibility, conditionContext))
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
        const attachments = materialized = await materializeTrackerEmailAttachments({
          clientId: message.clientId,
          attachments: message.attachments || [],
          trackerId: id, entryId: message.entryId, kind: parsed.data.kind, workflow, values, financialYear: tracker.financialYear,
          attachmentSnapshot: message.attachmentSnapshot,
          signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())),
        });
        attachmentBytes += attachments.reduce((total, item) => total + item.fileSize, 0);
        await lease.renew();
        await execution.assertOwnership();
        if (Date.now() >= deadline - 2000) break;
        const draftMessageId = parsed.data.mode === "draft" ? `${randomUUID()}@tracker-mail.nextgensolutions.com` : undefined;
        const claimed = await TrackerEmailCampaign.updateOne(
          { _id: campaign._id, [`items.${index}.status`]: "pending" },
          {
            $set: {
              [`items.${index}.status`]: "delivering",
              [`items.${index}.claimedAt`]: new Date(),
              [`items.${index}.deliveryClaimToken`]: lease.token,
              ...(draftMessageId ? { [`items.${index}.draftMessageId`]: draftMessageId } : {}),
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
          ...(draftMessageId ? { messageId: draftMessageId } : {}),
          signal: AbortSignal.timeout(Math.max(1000, Math.min(15_000, deadline - Date.now()))),
        });
        gmailAccepted = true;
        // History needs metadata only; drop file bytes before any database bookkeeping.
        for (const attachment of attachments) { attachment.content = undefined; attachment.contentBase64 = undefined; }
        deliveryMemory("message.bytes.released");
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
              [`items.${index}.processedAt`]: new Date(),
              lastProgressAt: new Date(),
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
        if (message.status === "draft") draftBlocks.set(message.clientId, "Draft pending · Send the existing draft in Gmail");
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
            fileSize: attachments[index]?.fileSize ?? 0,
            category: attachments[index]?.category, financialYear: attachments[index]?.financialYear, required: attachments[index]?.required,
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
          ["DELIVERY_LEASE_ENDED", "COORDINATOR_LOST"].includes(error.code)
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
        // A preflight read exhausting this request's budget has not called Gmail.
        // Leave it pending for the next known-safe batch instead of inventing a failure.
        if (!claimedByRequest && Date.now() >= deadline - 2000) break;
        if (!claimedByRequest) await lease.renew();
        const uncertain =
          gmailAccepted ||
          (error instanceof GmailDeliveryError && error.mayHaveDelivered);
        message.status = uncertain ? "uncertain" : "failed";
        if (uncertain && parsed.data.mode === "draft") draftBlocks.set(message.clientId, "Needs review · Check Gmail before preparing another email");
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
              [`items.${index}.processedAt`]: new Date(),
              lastProgressAt: new Date(),
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
        if (draftBlock) continue;
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
      } finally {
        for (const attachment of materialized) { attachment.content = undefined; attachment.contentBase64 = undefined; }
        materialized.length = 0;
        campaignMessages[index] = { ...campaignMessages[index], status: message.status };
        message.html = "";
      }
      if (index < campaignMessages.length - 1) await pause();
    }
    await lease.renew();
    const finalCampaign = await TrackerEmailCampaign.findOne({
      campaignId: campaign.campaignId,
    }).select("campaignId items.status").lean<AuthorizedCampaign | null>();
    if (!finalCampaign)
      throw new DeliverySecurityError(
        "Unable to read the campaign outcome. Retry this same campaign.",
        503,
      );
    const actual = deliveryCounts(finalCampaign.items);
    completed = actual.sent + actual.drafts;
    failed = actual.failed + actual.uncertain;
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
      { _id: campaign._id, lastWorkerToken: lease.token },
      { $set: { status, completed, failed, lastProgressAt: new Date(), nextAttemptAt: pausedForDailyLimit ? new Date(Date.now() + 15 * 60_000) : new Date(),
        ...(!pending && !actual.delivering ? { completedAt: new Date() } : {}) } },
    );
    await securityAudit(
      context,
      pending ? "delivery_progress" : failed || uncertain
        ? "delivery_completed_with_errors"
        : "delivery_completed",
      {
        ...audit,
        result: status,
        details: { completed, failed, pending, uncertain },
      },
    );
    return { state: pausedForDailyLimit ? "paused" as const : pending ? "processing" as const : "done" as const, campaignId };
  } finally {
    if (handled) await pause();
    await lease.release();
    deliveryMemory("worker.complete");
  }
}

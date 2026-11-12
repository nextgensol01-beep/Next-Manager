import "server-only";
import EmailLog from "@/models/EmailLog";
import ClientWorkItem from "@/models/ClientWorkItem";
import TrackerEmailCampaign from "@/models/TrackerEmailCampaign";
import { readJsonResponse } from "@/lib/http-response";
import { acquireDeliveryLease, securityAudit, type SecurityContext } from "./email-delivery-approval";
import { recordActivityEvent } from "@/lib/server/activity-events";
import { DeliverySecurityError } from "./email-delivery-crypto";
import { gmailMailboxToken } from "./gmail-delivery";
import { trackedDrafts, type DraftSuggestion, type TrackedDraft, type TrackerDraftScope } from "./tracker-email-drafts";

const SYNC_LIMIT = 16;
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
type GmailMessage = { id?: string; threadId?: string; internalDate?: string; labelIds?: string[]; payload?: { headers?: Array<{ name: string; value: string }> } };
type DraftCheck = { state: "pending" | "review" | "sent"; match?: DraftSuggestion };

function mailboxRead(token: string, signal: AbortSignal) {
  return async (path: string) => {
    const response = await fetch(`${GMAIL}/${path}`, { headers: { Authorization: `Bearer ${token}` }, signal, cache: "no-store" });
    if (response.status === 404) return null;
    if (!response.ok) throw new DeliverySecurityError("Unable to read Gmail drafts and sent mail. Check the Gmail connection and read permission.", 502, "GMAIL_DRAFT_READ_FAILED");
    return readJsonResponse(response);
  };
}

async function connectMailbox() {
  const signal = AbortSignal.timeout(25_000);
  try { return mailboxRead(await gmailMailboxToken(signal), signal); }
  catch { throw new DeliverySecurityError("Unable to connect to Gmail. Check the Gmail connection and read permission.", 502, "GMAIL_DRAFT_READ_FAILED"); }
}

function addressKey(addresses: string[]) {
  return [...new Set(addresses.flatMap(value => value.toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+/g) || []))].sort().join(",");
}

async function checkDraft(draft: TrackedDraft, read: ReturnType<typeof mailboxRead>): Promise<DraftCheck> {
  if (draft.deliveryId && await read(`drafts/${encodeURIComponent(draft.deliveryId)}?format=minimal&fields=id`)) return { state: "pending" };
  if (!draft.deliveryId && draft.draftMessageId) {
    const params = new URLSearchParams({ q: `rfc822msgid:${draft.draftMessageId}`, labelIds: "DRAFT", maxResults: "1", fields: "messages(id)" });
    const open = await read(`messages?${params}`) as { messages?: Array<{ id: string }> } | null;
    if (open?.messages?.length) return { state: "pending" };
  }
  const to = addressKey(draft.to), cc = addressKey(draft.cc);
  const metadata = "format=metadata&metadataHeaders=Message-ID&metadataHeaders=Subject&metadataHeaders=To&metadataHeaders=Cc&fields=id,threadId,internalDate,labelIds,payload(headers)";
  const search = async (query: string) => {
    const params = new URLSearchParams({ q: query, labelIds: "SENT", maxResults: "5", fields: "messages(id),nextPageToken" });
    const page = await read(`messages?${params}`) as { messages?: Array<{ id: string }>; nextPageToken?: string } | null;
    if (!page || page.nextPageToken) return [];
    const matches: Array<DraftSuggestion & { sameRecipients: boolean; sameSubject: boolean; rfcId: string }> = [];
    for (const result of page.messages || []) {
      const message = await read(`messages/${encodeURIComponent(result.id)}?${metadata}`) as GmailMessage | null;
      const sentAt = new Date(Number(message?.internalDate));
      if (!message?.id || !message.threadId || !message.labelIds?.includes("SENT") || !Number.isFinite(sentAt.getTime()) || sentAt < draft.createdAt) continue;
      const headers = new Map(message.payload?.headers?.map(header => [header.name.toLowerCase(), header.value]));
      matches.push({ messageId: message.id, threadId: message.threadId, sentAt,
        sameRecipients: Boolean(to) && addressKey([headers.get("to") || ""]) === to && addressKey([headers.get("cc") || ""]) === cc,
        sameSubject: headers.get("subject") === draft.subject,
        rfcId: (headers.get("message-id") || "").trim().replace(/^<|>$/g, ""),
      });
    }
    return matches;
  };
  if (draft.draftMessageId) {
    const exact = (await search(`rfc822msgid:${draft.draftMessageId}`)).filter(match => match.rfcId === draft.draftMessageId);
    if (exact.length === 1) return { state: exact[0].sameRecipients ? "sent" : "review", match: exact[0] };
    if (exact.length > 1) return { state: "review" };
  }
  // Older drafts and drafts whose headers Gmail rewrote only get a suggestion.
  const recipient = draft.to[0];
  const subject = draft.subject.replace(/["\\]/g, " ").slice(0, 240);
  if (!recipient || !subject.trim()) return { state: "review" };
  const candidates = (await search(`after:${Math.floor(draft.createdAt.getTime() / 1000)} to:${recipient} subject:"${subject}"`))
    .filter(match => match.sameRecipients && match.sameSubject);
  return { state: "review", match: candidates.length === 1 ? candidates[0] : undefined };
}

function draftFilter(scope: TrackerDraftScope, draft: TrackedDraft) {
  return { ...scope, mode: "draft", campaignId: draft.campaignId, items: { $elemMatch: {
    clientId: draft.clientId, status: draft.status, draftResolution: { $nin: ["sent", "discarded"] },
  } } };
}

async function saveSent(scope: TrackerDraftScope, draft: TrackedDraft, sentAt: Date, match: DraftSuggestion | undefined, context: SecurityContext) {
  const key = { trackerId: scope.trackerId, campaignId: draft.campaignId, clientId: draft.clientId, type: "tracker" };
  const existing = await EmailLog.findOne(key).select("status sentAt").lean<{ _id: unknown; status: string; sentAt: Date } | null>();
  if (match && await EmailLog.exists({ status: "sent", gmailMessageId: match.messageId, ...(existing ? { _id: { $ne: existing._id } } : {}) })) {
    throw new DeliverySecurityError("That Gmail message is already linked to another delivery. Review this draft in Gmail.", 409, "GMAIL_MESSAGE_ALREADY_LINKED");
  }
  // Write sent history first. If saving the draft resolution fails, a retry can
  // finish it and the still-blocked draft remains safe from duplicate sends.
  const log = existing?.status === "sent" ? existing : await EmailLog.findOneAndUpdate(key, {
    $set: { status: "sent", communicationStatus: "sent", sentAt, deliverySource: match ? "gmail-draft" : "manual-confirmation",
      gmailMessageId: match?.messageId || "", gmailThreadId: match?.threadId || "" },
    $setOnInsert: { ...key, workflowId: scope.workflowId, mailKind: scope.mailKind, to: draft.to, cc: draft.cc,
      subject: draft.subject, clientName: draft.companyName, financialYear: draft.financialYear || "" },
  }, { new: true, upsert: true });
  if (!log) throw new Error("Unable to record the Gmail delivery.");
  if (scope.mailKind === "initial" && draft.followUp?.enabled) {
    const emailLogId = String(log._id);
    await ClientWorkItem.updateOne({ emailLogId, kind: "follow_up" }, { $setOnInsert: {
      clientId: draft.clientId, financialYear: draft.financialYear || "", kind: "follow_up", status: "open", priority: "normal",
      title: `Follow up: ${draft.trackerName || "Client email"}`, details: `No-reply follow-up for ${draft.subject}`,
      ownerEmail: draft.followUp.ownerEmail, dueAt: new Date(log.sentAt.getTime() + draft.followUp.daysAfter * 86_400_000),
      createdBy: context.userEmail, trackerId: scope.trackerId, campaignId: draft.campaignId, emailLogId,
    } }, { upsert: true });
  }
  const updated = await TrackerEmailCampaign.updateOne(draftFilter(scope, draft), { $set: {
    "items.$.draftResolution": "sent", "items.$.historyRecordedAt": new Date(),
  }, $unset: { "items.$.draftSuggestion": 1 } });
  if (updated.modifiedCount) await recordActivityEvent({
    clientId: draft.clientId, category: "communications", type: "tracker_email_sent", label: "Tracker email sent via Gmail",
    detail: draft.subject, color: "emerald", badge: scope.mailKind === "reminder" ? "Reminder" : "Email",
    financialYear: draft.financialYear, entityId: scope.trackerId, entityType: "client_tracker",
    relatedEntityIds: [String(log._id)], occurredAt: log.sentAt,
  }, context.session);
}

export async function syncTrackerDrafts(scope: TrackerDraftScope, context: SecurityContext) {
  const records = await trackedDrafts(scope, { limit: SYNC_LIMIT + 1 });
  const drafts = records.slice(0, SYNC_LIMIT);
  const summary = { checked: 0, sent: 0, pending: 0, review: 0, failed: 0, batchFull: records.length > SYNC_LIMIT };
  if (!drafts.length) return summary;
  const read = await connectMailbox();
  const checked: Array<{ draft: TrackedDraft; result: DraftCheck }> = [];
  for (let start = 0; start < drafts.length; start += 4) {
    const batch = drafts.slice(start, start + 4);
    const results = await Promise.allSettled(batch.map(draft => checkDraft(draft, read)));
    results.forEach((result, index) => {
      if (result.status === "fulfilled") checked.push({ draft: batch[index], result: result.value });
      else summary.failed++;
    });
  }
  if (!checked.length) throw new DeliverySecurityError("Could not check Gmail. Existing drafts are still excluded from delivery.", 502, "GMAIL_DRAFT_READ_FAILED");
  const lease = await acquireDeliveryLease();
  try {
    for (const { draft, result } of checked) {
      await lease.renew();
      if (result.state === "sent" && result.match) {
        if (!await TrackerEmailCampaign.exists(draftFilter(scope, draft))) continue;
        try {
          await saveSent(scope, draft, result.match.sentAt, result.match, context);
          summary.sent++; summary.checked++;
          continue;
        } catch (error) {
          if (!(error instanceof DeliverySecurityError) || error.code !== "GMAIL_MESSAGE_ALREADY_LINKED") throw error;
          result.state = "review";
          result.match = undefined;
        }
      }
      const updated = await TrackerEmailCampaign.updateOne(draftFilter(scope, draft), {
        $set: { "items.$.draftCheckedAt": new Date(), ...(result.state === "review" ? { "items.$.draftResolution": "review" } : {}),
          ...(result.match ? { "items.$.draftSuggestion": { messageId: result.match.messageId, threadId: result.match.threadId, sentAt: result.match.sentAt } } : {}) },
        $unset: { ...(result.state === "pending" ? { "items.$.draftResolution": 1 } : {}), ...(!result.match ? { "items.$.draftSuggestion": 1 } : {}) },
      });
      if (!updated.matchedCount) continue;
      summary[result.state === "pending" ? "pending" : "review"]++;
      summary.checked++;
    }
    return summary;
  } finally { await lease.release(); }
}

export async function resolveTrackerDraft(scope: TrackerDraftScope, input: { campaignId: string; clientId: string; action: "sent" | "discarded"; sentAt?: Date; messageId?: string }, context: SecurityContext) {
  const [draft] = await trackedDrafts(scope, { campaignId: input.campaignId, clientIds: [input.clientId] });
  if (!draft || draft.draftResolution !== "review") throw new DeliverySecurityError("Sync this draft from Gmail before resolving it.", 409, "GMAIL_DRAFT_NOT_IN_REVIEW");
  const check = await checkDraft(draft, await connectMailbox());
  if (check.state === "pending") throw new DeliverySecurityError("The draft is still in Gmail. Send or discard it there first.", 409, "GMAIL_DRAFT_EXISTS");
  const lease = await acquireDeliveryLease();
  try {
    if (!await TrackerEmailCampaign.exists(draftFilter(scope, draft))) throw new DeliverySecurityError("The draft changed. Refresh the campaign preview.", 409);
    if (input.action === "discarded") {
      if (check.state === "sent" || await EmailLog.exists({ trackerId: scope.trackerId, campaignId: draft.campaignId, clientId: draft.clientId, status: "sent" })) {
        throw new DeliverySecurityError("This draft has a confirmed send. Sync from Gmail to update the campaign.", 409);
      }
      await TrackerEmailCampaign.updateOne(draftFilter(scope, draft), { $set: { "items.$.draftResolution": "discarded" }, $unset: { "items.$.draftSuggestion": 1 } });
    } else {
      const match = check.match && (check.state === "sent" || check.match.messageId === input.messageId) ? check.match : undefined;
      const sentAt = match?.sentAt ?? input.sentAt;
      if (!sentAt || sentAt < draft.createdAt || sentAt > new Date()) throw new DeliverySecurityError("Choose the actual send time, between draft creation and now.", 400);
      await saveSent(scope, draft, sentAt, match, context);
    }
    await securityAudit(context, `tracker_gmail_draft_${input.action}`, { trackerId: scope.trackerId, workflowId: scope.workflowId, campaignId: draft.campaignId, result: input.action });
  } finally { await lease.release(); }
}

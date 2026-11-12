import "server-only";
import TrackerEmailCampaign from "@/models/TrackerEmailCampaign";

export type TrackerDraftScope = { trackerId: string; workflowId: string; mailKind: "initial" | "reminder" };
export type DraftSuggestion = { messageId: string; threadId: string; sentAt: Date };
export type TrackedDraft = {
  campaignId: string;
  clientId: string;
  companyName: string;
  status: "draft" | "delivering" | "uncertain";
  draftResolution?: "review" | "sent" | "discarded";
  draftCheckedAt?: Date;
  draftSuggestion?: DraftSuggestion;
  deliveryId?: string;
  draftMessageId?: string;
  to: string[];
  cc: string[];
  subject: string;
  createdAt: Date;
  financialYear?: string;
  trackerName?: string;
  followUp?: { enabled?: boolean; daysAfter: number; ownerEmail?: string };
};

// Use the durable Gmail acknowledgement even when writing EmailLog failed.
export async function trackedDrafts(scope: TrackerDraftScope, options: { clientIds?: string[]; limit?: number; campaignId?: string } = {}) {
  if (options.clientIds?.length === 0) return [];
  const statuses = ["draft", "delivering", "uncertain"];
  const resolved = ["sent", "discarded"];
  return TrackerEmailCampaign.aggregate<TrackedDraft>([
    { $match: { ...scope, mode: "draft", ...(options.campaignId ? { campaignId: options.campaignId } : {}), items: { $elemMatch: {
      status: { $in: statuses }, draftResolution: { $nin: resolved },
      ...(options.clientIds ? { clientId: { $in: options.clientIds } } : {}),
    } } } },
    { $unwind: "$items" },
    { $match: { "items.status": { $in: statuses }, "items.draftResolution": { $nin: resolved },
      ...(options.clientIds ? { "items.clientId": { $in: options.clientIds } } : {}),
      // A live attempt can still get acknowledged. Only sync an abandoned one.
      ...(options.limit ? { $or: [{ "items.status": { $ne: "delivering" } }, { "items.claimedAt": { $lte: new Date(Date.now() - 120_000) } }] } : {}),
    } },
    { $project: {
      _id: 0, campaignId: 1, clientId: "$items.clientId", companyName: "$items.companyName",
      status: "$items.status", draftResolution: "$items.draftResolution", draftSuggestion: "$items.draftSuggestion",
      deliveryId: "$items.deliveryId", draftCheckedAt: "$items.draftCheckedAt",
      createdAt: { $ifNull: ["$items.claimedAt", { $ifNull: ["$items.processedAt", "$createdAt"] }] },
      ...(options.limit || options.campaignId ? {
        to: "$items.to", cc: "$items.cc", subject: "$items.subject", draftMessageId: "$items.draftMessageId",
        trackerName: 1, financialYear: "$snapshot.financialYear", followUp: "$snapshot.workflow.followUp",
      } : {}),
    } },
    ...(options.limit ? [{ $sort: { draftCheckedAt: 1, createdAt: 1, campaignId: 1, clientId: 1 } as const }, { $limit: options.limit }] : []),
  ]);
}

export function trackerDraftBlock(draft: TrackedDraft) {
  const needsReview = draft.draftResolution === "review" || (draft.status === "uncertain" && !draft.draftCheckedAt);
  return {
    reasonCode: needsReview ? "gmail_draft_review" : "gmail_draft_pending",
    reason: needsReview ? "Needs review · Check Gmail before preparing another email" : "Draft pending · Send the existing draft in Gmail",
  };
}

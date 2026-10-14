"use client";
import { readJsonResponse } from "@/lib/http-response";
import {
  initialRecipientDraft,
  parseEmailList,
  recipientIssue,
  type EmailPreview,
  type RecipientDraft,
} from "@/lib/tracker-email-delivery-review";
import type { DeliveryBatch } from "@/lib/email-delivery-security";
export class SecurityRequestError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export async function securityFetch<T>(
  url: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const result = await readJsonResponse(response);
  if (!response.ok)
    throw new SecurityRequestError(
      result.error || "Unable to complete this operation.",
      result.code,
    );
  return result as T;
}
export function validateRecipientDrafts(
  preview: EmailPreview,
  drafts: Record<string, RecipientDraft>,
) {
  for (const message of preview.messages) {
    const issue = recipientIssue(
      drafts[message.entryId] || initialRecipientDraft(message),
    );
    if (issue) throw new Error(`${message.companyName}: ${issue}`);
  }
}
/** One builder supplies the approval request and the immutable delivery snapshot. */
export function buildDeliveryMessages(
  preview: EmailPreview,
  drafts: Record<string, RecipientDraft>,
): DeliveryBatch["messages"] {
  const normalize = (values: string[]) => [
    ...new Set(
      values.map((value) => value.trim().toLowerCase()).filter(Boolean),
    ),
  ];
  return preview.messages.map((message) => {
    const draft = drafts[message.entryId] || initialRecipientDraft(message);
    const to = normalize([...draft.to, ...parseEmailList(draft.additionalTo)]);
    const cc = normalize([
      ...draft.cc,
      ...parseEmailList(draft.additionalCc),
    ]).filter((email) => !to.includes(email));
    return {
      entryId: message.entryId,
      clientId: message.clientId,
      companyName: message.companyName,
      to,
      cc,
      subject: message.subject,
      html: message.html,
      attachments: message.attachments.map(({ documentId }) => ({
        documentId,
      })),
    };
  });
}

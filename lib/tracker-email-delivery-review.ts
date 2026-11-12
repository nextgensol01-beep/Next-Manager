export type EmailRecipient = { email: string; name: string; designation: string; isPrimary: boolean };
export type CampaignDraftReview = {
  campaignId: string;
  state: "pending" | "review";
  canResolve?: boolean;
  url?: string;
  suggestion?: { messageId: string; url: string; sentAt: string };
};
export type EmailPreview = {
  workflow: { id: string; name: string; signatureGap?: number };
  scenarioSummary?: Array<{ id: string; name: string; matched: number; selected: number; eligible: number }>;
  clientMatches?: Array<{ clientId: string; companyName: string; category?: string; sendRuleMatched: boolean; eligible: boolean; skippedReason?: string;
    selection: { matchingMode: string; matchedScenarioIds: string[]; selectedScenarioIds: string[]; ignoredScenarioIds: string[]; scenarios: Array<{ id: string; name: string; matched: boolean; selected: boolean; excluded: boolean }> } }>;
  messages: Array<{
    entryId: string; clientId: string; companyName: string; category?: string; to: string;
    suggestedTo?: string[]; recipients: EmailRecipient[];
    subject: string; body: string; html: string; points: string[];
    statements?: string[]; combinationMessage?: string;
    attachments: Array<{ documentId: string; filename: string; mimeType: string; fileSize: number; category?: string; financialYear?: string; required?: boolean }>;
    attachmentWarnings?: Array<{ ruleId: string; code: string; message: string; required: boolean }>;
    attachmentSnapshot?: string;
  }>;
  skipped: Array<{ clientId: string; companyName: string; reason: string; reasonCode?: string; gmailDraft?: CampaignDraftReview }>;
};
export type AdditionalEmailRecipient = { id: string; email: string; kind: "to" | "cc" };
export const MAX_ADDITIONAL_RECIPIENTS = 5;
export type RecipientDraft = { to: string[]; cc: string[]; additionalTo: string; additionalCc: string; additionalRecipients?: AdditionalEmailRecipient[] };
export type EmailPreparationPhase = "replies" | "recipients" | "gmail-drafts" | null;

export function initialRecipientDraft(message: EmailPreview["messages"][number]): RecipientDraft {
  return { to: message.suggestedTo?.length ? message.suggestedTo : [message.to], cc: [], additionalTo: "", additionalCc: "" };
}

// Existing delivery parsing and validation, shared with the review surface.
export function parseEmailList(value: string) {
  return Array.from(new Set(value.split(/[,;\n]/).map(email => email.trim().toLowerCase()).filter(Boolean)));
}
/** Keep row identity in the client draft; delivery continues to consume the existing address lists. */
export function getAdditionalRecipients(draft: RecipientDraft): AdditionalEmailRecipient[] {
  if (draft.additionalRecipients) return draft.additionalRecipients;
  return [
    ...parseEmailList(draft.additionalTo).map((email, index) => ({ id: `legacy-to-${index}`, email, kind: "to" as const })),
    ...parseEmailList(draft.additionalCc).map((email, index) => ({ id: `legacy-cc-${index}`, email, kind: "cc" as const })),
  ];
}
export function updateAdditionalRecipients(draft: RecipientDraft, rows: AdditionalEmailRecipient[]): RecipientDraft {
  return {
    ...draft, additionalRecipients: rows,
    additionalTo: rows.filter(row => row.kind === "to").map(row => row.email.trim()).filter(Boolean).join(", "),
    additionalCc: rows.filter(row => row.kind === "cc").map(row => row.email.trim()).filter(Boolean).join(", "),
  };
}
export function recipientIssue(draft: RecipientDraft): string | null {
  const additional = getAdditionalRecipients(draft);
  if (additional.length > MAX_ADDITIONAL_RECIPIENTS) return `Add up to ${MAX_ADDITIONAL_RECIPIENTS} additional recipients per client.`;
  if (additional.some(row => row.email.trim() && !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(row.email.trim()))) return "Enter one valid email address per additional recipient.";
  const to = [...draft.to, ...parseEmailList(draft.additionalTo)];
  const cc = [...draft.cc, ...parseEmailList(draft.additionalCc)];
  if (!to.length) return "Choose at least one To recipient.";
  if ([...to, ...cc].some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return "Enter valid To and CC addresses.";
  return null;
}
export function recipientCount(draft: RecipientDraft) {
  return new Set([...draft.to, ...draft.cc, ...parseEmailList(draft.additionalTo), ...parseEmailList(draft.additionalCc)].map(email => email.trim().toLowerCase())).size;
}

/** The same Gmail signature insertion used by the existing expanded preview. */
export function previewWithGmailSignature(html: string, signature: string | null, signatureGap = 2) {
  if (!signature) return html;
  const gap = "<br>".repeat(Math.max(0, Math.min(6, signatureGap)));
  return html.replace(/<\/body>\s*<\/html>\s*$/i, `${gap}${signature}</body></html>`);
}

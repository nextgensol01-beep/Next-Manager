import type {
  TrackerEmailAttachment,
  TrackerEmailWorkflow,
  TrackerValues,
} from "@/lib/clientTrackers";
import {
  documentFinancialYearMatches,
  normalizeDocumentFinancialYear,
} from "@/lib/document-financial-year";
import { evaluateTrackerConditionGroup } from "./tracker-conditions";

export const TRACKER_ATTACHMENT_LIMITS = {
  count: 4,
  file: 8 * 1024 * 1024,
  total: 18 * 1024 * 1024,
};
export type ManagedTrackerEmailDocument = {
  _id: unknown;
  clientId: string;
  documentName: string;
  category?: string;
  documentKind?: string;
  financialYear?: string;
  storageType?: string;
  driveFileId?: string;
  mimeType?: string;
  fileSize?: number;
  uploadedDate?: Date | string;
  updatedAt?: Date | string;
};
export type TrackerEmailAttachmentPreview = {
  documentId: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  category?: string;
  financialYear?: string;
  required?: boolean;
  ruleIds?: string[];
};
export type AttachmentIssue = {
  ruleId: string;
  required: boolean;
  code: string;
  message: string;
};
export type AttachmentInput = {
  workflow: TrackerEmailWorkflow;
  documents: ManagedTrackerEmailDocument[];
  clientId: string;
  values: TrackerValues;
  financialYear?: string;
};
export function activeAttachmentRules(
  input: Omit<AttachmentInput, "documents">,
) {
  return (input.workflow.attachments || []).filter(
    (rule) =>
      !rule.conditionGroup ||
      evaluateTrackerConditionGroup(rule.conditionGroup, input.values),
  );
}
export function attachmentExpectedYear(
  rule: TrackerEmailAttachment,
  trackerYear?: string,
) {
  return rule.financialYear === "any"
    ? undefined
    : normalizeDocumentFinancialYear(
        !rule.financialYear || rule.financialYear === "tracker"
          ? trackerYear
          : rule.financialYear,
      );
}
export function attachmentRuleMatches(
  rule: TrackerEmailAttachment,
  doc: ManagedTrackerEmailDocument,
  clientId: string,
  trackerYear?: string,
) {
  if (doc.storageType !== "google-drive" || !doc.driveFileId || !doc.mimeType)
    return false;
  if (rule.source === "shared") return String(doc._id) === rule.documentId;
  let year: string | undefined;
  try {
    year = attachmentExpectedYear(rule, trackerYear);
  } catch {
    return false;
  }
  return (
    doc.clientId === clientId &&
    (!rule.category || doc.category === rule.category) &&
    (!rule.documentKind ||
      (doc.documentKind || "general") === rule.documentKind) &&
    (rule.financialYear === "any" ||
      documentFinancialYearMatches(doc.financialYear, year))
  );
}
export function attachmentIssue(
  rule: TrackerEmailAttachment,
  code: string,
  detail: string,
  trackerYear?: string,
): AttachmentIssue {
  let year: string | undefined;
  try {
    year = attachmentExpectedYear(rule, trackerYear);
  } catch {
    /* Invalid metadata has its own issue. */
  }
  const label = rule.category
    ? rule.category[0].toUpperCase() + rule.category.slice(1)
    : rule.documentKind === "epr-certificate"
      ? "EPR certificate"
      : rule.source === "shared"
        ? "Selected shared document"
        : "Client document";
  return {
    ruleId: rule.id,
    required: rule.required === true,
    code,
    message: `${rule.required === true ? "Required" : "Optional"} attachment ${detail}: ${label}${year && rule.source !== "shared" ? ` (FY ${year})` : ""}`,
  };
}
const timestamp = (value?: Date | string) => {
  const at = value ? +new Date(value) : 0;
  return Number.isFinite(at) ? at : 0;
};
/** FY and authoritative ownership are filtered before newest-valid selection.
 * Uploaded date is authoritative; descending document ID breaks timestamp ties. */
export function resolveTrackerAttachmentSelection(input: AttachmentInput) {
  const attachments: TrackerEmailAttachmentPreview[] = [],
    issues: AttachmentIssue[] = [];
  const rules = activeAttachmentRules(input);
  const documents = [...input.documents].sort(
    (a, b) =>
      timestamp(b.uploadedDate) - timestamp(a.uploadedDate) ||
      String(b._id).localeCompare(String(a._id)),
  );
  let total = 0;
  // Optional files cannot consume space needed by a required rule.
  for (const rule of [...rules].sort(
    (a, b) => Number(b.required === true) - Number(a.required === true),
  )) {
    if (rule.source !== "shared" && rule.financialYear !== "any") {
      try {
        if (!attachmentExpectedYear(rule, input.financialYear)) {
          issues.push(
            attachmentIssue(
              rule,
              "missing_financial_year",
              "cannot be matched because the tracker has no financial year",
              input.financialYear,
            ),
          );
          continue;
        }
      } catch {
        issues.push(
          attachmentIssue(
            rule,
            "invalid_financial_year",
            "has invalid financial-year metadata",
            input.financialYear,
          ),
        );
        continue;
      }
    }
    const matches = documents.filter((doc) =>
      attachmentRuleMatches(rule, doc, input.clientId, input.financialYear),
    );
    if (!matches.length) {
      const unknownYear =
        rule.source !== "shared" &&
        rule.financialYear !== "any" &&
        documents.some(
          (doc) =>
            doc.clientId === input.clientId &&
            !doc.financialYear &&
            (!rule.category || doc.category === rule.category) &&
            (!rule.documentKind ||
              (doc.documentKind || "general") === rule.documentKind),
        );
      issues.push(
        attachmentIssue(
          rule,
          unknownYear ? "missing_document_financial_year" : "missing_document",
          unknownYear
            ? "missing; matching documents have no financial-year metadata"
            : "missing",
          input.financialYear,
        ),
      );
      continue;
    }
    const document = matches.find((doc) => {
      const size = Number(doc.fileSize || 0),
        existing = attachments.some(
          (item) => item.documentId === String(doc._id),
        );
      return (
        size > 0 &&
        size <= TRACKER_ATTACHMENT_LIMITS.file &&
        (existing ||
          (attachments.length < TRACKER_ATTACHMENT_LIMITS.count &&
            total + size <= TRACKER_ATTACHMENT_LIMITS.total))
      );
    });
    if (!document) {
      issues.push(
        attachmentIssue(
          rule,
          "attachment_size_limit",
          "cannot be included within the email attachment size/count limits",
          input.financialYear,
        ),
      );
      continue;
    }
    const existing = attachments.find(
      (item) => item.documentId === String(document._id),
    );
    if (existing) {
      existing.required ||= rule.required === true;
      existing.ruleIds!.push(rule.id);
      continue;
    }
    const fileSize = Number(document.fileSize);
    attachments.push({
      documentId: String(document._id),
      filename: document.documentName,
      mimeType: document.mimeType!,
      fileSize,
      category: document.category,
      financialYear: document.financialYear,
      required: rule.required === true,
      ruleIds: [rule.id],
    });
    total += fileSize;
  }
  return { attachments, issues, rules };
}

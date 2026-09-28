import Document from "@/models/Document";
import type { TrackerEmailWorkflow, TrackerValues } from "@/lib/clientTrackers";
import type { GmailAttachment } from "@/lib/server/gmail-delivery";
import { downloadDriveFile } from "@/lib/server/google-drive-documents";
import { evaluateTrackerConditionGroup } from "@/lib/server/tracker-conditions";

const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 18 * 1024 * 1024;

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
  uploadedDate?: Date;
};

export type TrackerEmailAttachmentPreview = {
  documentId: string;
  filename: string;
  mimeType: string;
  fileSize: number;
};

/** Selects only managed Drive files. Shared rules use their exact document; client rules use the newest match. */
export function resolveTrackerEmailAttachmentDocuments(input: {
  workflow: TrackerEmailWorkflow;
  documents: ManagedTrackerEmailDocument[];
  clientId: string;
  values: TrackerValues;
  financialYear?: string;
}) {
  const selected: TrackerEmailAttachmentPreview[] = [];
  let totalBytes = 0;
  for (const rule of input.workflow.attachments || []) {
    if (selected.length >= MAX_ATTACHMENTS) break;
    if (
      rule.conditionGroup &&
      !evaluateTrackerConditionGroup(rule.conditionGroup, input.values)
    )
      continue;
    const isManaged = (item: ManagedTrackerEmailDocument) =>
      item.storageType === "google-drive" &&
      Boolean(item.driveFileId) &&
      Boolean(item.mimeType);
    const document =
      rule.source === "shared"
        ? input.documents.find(
            (item) => String(item._id) === rule.documentId && isManaged(item),
          )
        : input.documents.find(
            (item) =>
              item.clientId === input.clientId &&
              isManaged(item) &&
              (!rule.category || item.category === rule.category) &&
              (!rule.documentKind || item.documentKind === rule.documentKind) &&
              (rule.financialYear === "any" ||
                item.financialYear === input.financialYear),
          );
    if (!document) continue;
    const fileSize = Number(document.fileSize || 0);
    if (
      fileSize <= 0 ||
      fileSize > MAX_ATTACHMENT_BYTES ||
      totalBytes + fileSize > MAX_TOTAL_BYTES
    )
      continue;
    const documentId = String(document._id);
    if (selected.some((item) => item.documentId === documentId)) continue;
    selected.push({
      documentId,
      filename: document.documentName,
      mimeType: document.mimeType!,
      fileSize,
    });
    totalBytes += fileSize;
  }
  return selected;
}

/** Re-resolves ids at delivery time so the browser can never supply file contents or Drive identifiers. */
export async function materializeTrackerEmailAttachments(input: {
  clientId: string;
  attachments: Array<{ documentId: string }>;
  allowedDocumentIds?: string[];
}) {
  if (!input.attachments.length) return [] as GmailAttachment[];
  if (input.attachments.length > MAX_ATTACHMENTS)
    throw new Error(
      "No more than four documents can be attached to one email.",
    );
  const requestedIds = [
    ...new Set(input.attachments.map((item) => item.documentId)),
  ];
  if (requestedIds.length !== input.attachments.length)
    throw new Error("A document was selected more than once.");
  if (
    input.allowedDocumentIds &&
    requestedIds.some((id) => !input.allowedDocumentIds!.includes(id))
  )
    throw new Error(
      "A selected document no longer matches this workflow's attachment rules.",
    );
  const documents = (await Document.find({
    _id: { $in: requestedIds },
    storageType: "google-drive",
  }).lean()) as unknown as ManagedTrackerEmailDocument[];
  if (documents.length !== requestedIds.length)
    throw new Error(
      "One or more selected documents are no longer available as managed Drive files.",
    );
  const byId = new Map(documents.map((item) => [String(item._id), item]));
  let totalBytes = 0;
  const output: GmailAttachment[] = [];
  for (const id of requestedIds) {
    const document = byId.get(id);
    const fileSize = Number(document?.fileSize || 0);
    if (
      !document?.driveFileId ||
      !document.mimeType ||
      fileSize <= 0 ||
      fileSize > MAX_ATTACHMENT_BYTES ||
      totalBytes + fileSize > MAX_TOTAL_BYTES
    )
      throw new Error(
        "A selected document exceeds the attachment size limit or is incomplete.",
      );
    const bytes = await downloadDriveFile(document.driveFileId);
    if (
      !bytes.length ||
      bytes.length > MAX_ATTACHMENT_BYTES ||
      totalBytes + bytes.length > MAX_TOTAL_BYTES
    )
      throw new Error(`Unable to safely attach ${document.documentName}.`);
    output.push({
      filename: document.documentName,
      mimeType: document.mimeType,
      contentBase64: bytes.toString("base64"),
    });
    totalBytes += bytes.length;
  }
  return output;
}

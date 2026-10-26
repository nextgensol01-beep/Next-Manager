import type { TrackerEmailWorkflow } from "@/lib/clientTrackers";

export const ATTACHMENT_DOCUMENT_FIELDS = "_id clientId documentName category documentKind financialYear storageType driveFileId mimeType fileSize uploadedDate updatedAt";

/** A pinned ID alone never grants permission to read another client's document. */
export function pinnedAttachmentQuery(clientId: string, ids: string[], workflow?: TrackerEmailWorkflow, allowedDocumentIds: string[] = []) {
  const shared = (workflow?.attachments || [])
    .filter(rule => rule.source === "shared" && rule.documentId && ids.includes(rule.documentId))
    .map(rule => rule.documentId!);
  const authorizedShared = [...new Set([...shared, ...allowedDocumentIds.filter(id => ids.includes(id))])];
  return { _id: { $in: ids }, storageType: "google-drive", $or: [
    { clientId }, ...(authorizedShared.length ? [{ _id: { $in: authorizedShared } }] : []),
  ] };
}

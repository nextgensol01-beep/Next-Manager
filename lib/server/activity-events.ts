import type { Session } from "next-auth";
import ActivityEvent from "@/models/ActivityEvent";

export type ActivityEventInput = {
  clientId: string;
  category: "compliance" | "financial" | "communications" | "documents" | "system";
  type: string;
  label: string;
  detail: string;
  color?: string;
  badge?: string;
  badgeColor?: string;
  financialYear?: string;
  entityId?: string;
  entityType?: string;
  recordType?: string;
  actionSearch?: string;
  relatedEntityIds?: string[];
  occurredAt?: Date;
};

export async function recordActivityEvent(input: ActivityEventInput, session?: Session | null) {
  try {
    return await ActivityEvent.create({
      ...input,
      color: input.color || "blue",
      relatedEntityIds: input.relatedEntityIds || (input.entityId ? [input.entityId] : []),
      actorEmail: session?.user?.email || undefined,
      occurredAt: input.occurredAt || new Date(),
    });
  } catch (error) {
    // The business operation has already succeeded. Report audit persistence
    // failure without turning a successful upload/edit into a duplicate retry.
    console.error("Unable to record activity event:", error);
    return null;
  }
}

export async function ensureDocumentOriginActivity(document: {
  _id: unknown;
  clientId: string;
  documentName: string;
  category?: string;
  source?: string;
  driveRelativePath?: string;
  uploadedDate?: Date;
  createdAt?: Date;
}, session?: Session | null) {
  const documentId = String(document._id);
  const existing = await ActivityEvent.exists({
    clientId: document.clientId,
    type: { $in: ["document_uploaded", "document_linked"] },
    relatedEntityIds: documentId,
  });
  if (existing) return;
  const uploaded = document.source === "website-upload";
  await recordActivityEvent({
    clientId: document.clientId,
    category: "documents",
    type: uploaded ? "document_uploaded" : "document_linked",
    label: uploaded ? "Document Uploaded" : "Document Linked",
    detail: `${document.documentName} · ${String(document.category || "other").replace(/^./, (letter) => letter.toUpperCase())}${document.driveRelativePath && document.driveRelativePath !== document.documentName ? ` · ${document.driveRelativePath}` : ""}`,
    color: uploaded ? "emerald" : "blue",
    badge: uploaded ? "Upload" : "Link",
    badgeColor: uploaded
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
      : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    entityId: documentId,
    entityType: "document",
    relatedEntityIds: [documentId],
    occurredAt: document.uploadedDate || document.createdAt || new Date(),
  }, session);
}

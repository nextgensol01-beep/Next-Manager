import "server-only";
import { createHash } from "node:crypto";
import {
  canonicalDeliveryBatch,
  type DeliveryBatch,
} from "@/lib/email-delivery-security";
import { DeliverySecurityError } from "./email-delivery-crypto";
export function trackerEmailBatchHash(trackerId: string, batch: DeliveryBatch) {
  return createHash("sha256")
    .update(canonicalDeliveryBatch(trackerId, batch))
    .digest("hex");
}
export function validateDeliveryRecipients(
  batch: DeliveryBatch,
  restrictDuplicateRecipients = true,
) {
  const clients = new Set<string>(),
    entries = new Set<string>(),
    recipients = new Set<string>();
  for (const message of batch.messages) {
    if (clients.has(message.clientId) || entries.has(message.entryId))
      throw new DeliverySecurityError(
        "A client appears more than once in this campaign.",
        400,
      );
    clients.add(message.clientId);
    entries.add(message.entryId);
    const emails = [...message.to, ...message.cc].map((email) =>
      email.trim().toLowerCase(),
    );
    if (new Set(emails).size !== emails.length)
      throw new DeliverySecurityError(
        `Duplicate recipient address for ${message.companyName}. Remove it from To or CC.`,
        400,
      );
    if (
      restrictDuplicateRecipients &&
      emails.some((email) => recipients.has(email))
    )
      throw new DeliverySecurityError(
        "The same email address appears for more than one client in this campaign. Use different addresses or turn off Restrict duplicate email addresses in Settings → Email & Delivery.",
        400,
      );
    emails.forEach((email) => recipients.add(email));
  }
}

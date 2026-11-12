import type { EmailPreview } from "./tracker-email-delivery-review";

const labels: Record<string, string> = {
  conditions_not_matched: "Eligibility conditions",
  initial_already_sent: "Initial email already sent",
  sent_via_gmail: "Sent via Gmail",
  gmail_draft_pending: "Draft pending",
  gmail_draft_review: "Draft needs review",
  initial_required: "Initial email required",
  replied: "Client replied",
  recently_sent: "7-day cooldown",
  no_recipient: "No matching contact email",
  combination_skipped: "Combination excludes delivery",
  combination_not_matched: "No matching combination",
  empty_content: "Empty email content",
  missing_variables: "Missing variables",
  unsupported_variable: "Unsupported variable",
  invalid_column_variable: "Removed variable column",
  invalid_variable_context: "Variable unavailable in this fragment",
  missing_client_context: "Client record unavailable",
  required_attachment_unavailable: "Required attachment unavailable",
};
type SkippedClient = EmailPreview["skipped"][number];
// Legacy/unknown reasons remain distinct by their complete original text.
export const skipReasonKey = (client: SkippedClient) => client.reasonCode || "legacy:" + client.reason;
export function skipReasonGroups(clients: SkippedClient[]) {
  const groups = new Map<string, { key: string; label: string; count: number }>();
  for (const client of clients) {
    const key = skipReasonKey(client);
    const group = groups.get(key) || { key, label: labels[key] || client.reason, count: 0 };
    group.count++;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

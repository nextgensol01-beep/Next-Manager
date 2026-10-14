import type { TrackerEmailWorkflow, TrackerField } from "../../lib/clientTrackers";
import { cases as combinationCases } from "./rule-combinations-data";

export const fields: TrackerField[] = [
  { key: "mail", label: "Mail to be sent", type: "toggle" },
  { key: "purchase", label: "Purchase upload", type: "toggle" },
  { key: "sale", label: "Sale upload", type: "toggle" },
  { key: "note", label: "Client note", type: "text" },
  { key: "amount", label: "Amount", type: "number" },
  ...[1, 2, 3, 4, 5, 6].map(index => ({ key: `field${index}`, label: `Upload ${index}`, type: "toggle" as const })),
];
export const ready: TrackerEmailWorkflow = {
  ...combinationCases.all, id: "review", name: "Annual return update", points: [],
  subject: "EPR portal update · {{client.companyName}} · {{tracker.financialYear}}",
  body: "<p>Dear {{client.companyName}},</p><p>This is your EPR compliance update for {{tracker.financialYear}}.</p><p>{{combinationMessage}}</p><p>Regards,</p>",
  recipientStrategy: "selected", signatureGap: 0,
  followUp: { enabled: true, daysAfter: 3, ownerEmail: "owner@example.com" },
  attachments: [{ id: "file", source: "client_latest", category: "certificates", documentKind: "general", financialYear: "tracker" }],
};
const group = ready.conditionGroup!;
export const cases: Record<string, TrackerEmailWorkflow> = {
  ready, incomplete: { ...ready, subject: "", body: "<p><br></p>" },
  name: { ...ready, name: "  " },
  audience: { ...ready, conditionGroup: { mode: "ALL", conditions: [] } },
  removed: { ...ready, conditionGroup: { mode: "ALL", conditions: [{ fieldKey: "removed", operator: "equals", value: "Yes" }] } },
  incompatible: { ...ready, conditionGroup: { mode: "ALL", conditions: [{ fieldKey: "mail", operator: "contains", value: "Yes" }] } },
  noValue: { ...ready, conditionGroup: { mode: "ALL", conditions: [{ fieldKey: "mail", operator: "equals", value: "" }] } },
  pointColumn: { ...ready, points: [{ id: "point", fieldKey: "removed", value: "Yes", statement: "Message" }] },
  pointValue: { ...ready, points: [{ id: "point", fieldKey: "mail", value: "", statement: "Message" }] },
  pointText: { ...ready, points: [{ id: "point", fieldKey: "mail", value: "Yes", statement: "<p>&nbsp;</p>" }] },
  ruleConditions: { ...ready, contentRules: [{ id: "invalid", type: "combination", conditionGroup: { mode: "ALL", conditions: [] }, content: "Message" }] },
  ruleText: { ...ready, contentRules: [{ id: "invalid", type: "combination", conditionGroup: group, content: "" }] },
  skip: { ...ready, contentRules: [{ id: "skip", type: "combination", conditionGroup: group, action: "skip", content: "" }] },
  inactive: { ...ready, contentRules: [...ready.contentRules!, { id: "inactive", type: "statement", conditionGroup: group, content: "" }] },
  attachment: { ...ready, attachments: [{ id: "file", source: "client_latest", conditionGroup: { mode: "ALL", conditions: [] } }] },
  noRules: { ...ready, contentMode: "points", contentRules: [], attachments: [], followUp: undefined },
  partialCoverage: { ...combinationCases.base, id: "review" },
  limited: { ...combinationCases.many, id: "review" },
  points: { ...ready, contentMode: "points", contentRules: [{ id: "point", type: "point", conditionGroup: group, content: "Documents needed" }] },
  statements: { ...ready, contentMode: "statements", contentRules: [{ id: "statement", type: "statement", conditionGroup: group, content: "Please share the remaining documents." }] },
  legacy: { ...ready, conditionGroup: undefined, contentMode: "points", contentRules: [], points: [{ id: "point", fieldKey: "mail", value: "Yes", statement: "Legacy message" }] },
  optional: { ...ready, recipientStrategy: undefined, signatureGap: undefined, attachments: [], reminderSubject: "", reminderBody: "", followUp: { enabled: false, daysAfter: 3 } },
  multiple: { ...ready, name: "", subject: "", body: "", conditionGroup: { mode: "ALL", conditions: [] }, contentRules: [{ id: "invalid", type: "point", conditionGroup: group, content: "" }], attachments: [{ id: "file", source: "client_latest", conditionGroup: { mode: "ALL", conditions: [] } }] },
};

import type { TrackerEmailWorkflow, TrackerField } from "../../lib/clientTrackers";

export const fields: TrackerField[] = [
  { key: "purchase", label: "Purchase upload", type: "toggle" },
  { key: "sale", label: "Sale upload", type: "toggle" },
  { key: "mail", label: "Mail to be sent", type: "toggle" },
  ...[1, 2, 3, 4, 5, 6].map(index => ({ key: `field${index}`, label: `Upload ${index}`, type: "toggle" as const })),
];
export const baseWorkflow: TrackerEmailWorkflow = {
  id: "synthetic-workflow", name: "Upload update", contentMode: "combinations", mainFieldKey: "mail", mainValue: "Yes", points: [],
  conditionGroup: { mode: "ALL", conditions: [{ fieldKey: "mail", operator: "equals", value: "Yes" }] },
  subject: "EPR portal update · {{client.companyName}} · {{tracker.financialYear}}",
  body: "<p>Dear {{client.companyName}},</p><p>This is your EPR compliance update for {{tracker.financialYear}}.</p>{{combinationMessage}}<p>Regards,</p>",
  contentRules: [
    { id: "both", type: "combination", order: 0, conditionGroup: { mode: "ALL", conditions: [{ fieldKey: "purchase", operator: "equals", value: "Yes" }, { fieldKey: "sale", operator: "equals", value: "Yes" }] }, content: "<p><strong>Both uploads are complete.</strong> We can prepare the annual return.</p>" },
    { id: "one", type: "combination", order: 1, conditionGroup: { mode: "ANY", conditions: [{ fieldKey: "purchase", operator: "equals", value: "Yes" }, { fieldKey: "sale", operator: "equals", value: "Yes" }] }, content: "<p>One upload is complete. Please provide the remaining documents.</p>" },
  ],
};
const always = { mode: "ANY" as const, conditions: [{ fieldKey: "mail", operator: "is_empty" as const }, { fieldKey: "mail", operator: "is_not_empty" as const }] };
export const cases: Record<string, TrackerEmailWorkflow> = {
  base: baseWorkflow,
  reversed: { ...baseWorkflow, contentRules: baseWorkflow.contentRules!.map(rule => ({ ...rule, order: rule.order === 0 ? 1 : 0 })) },
  skip: { ...baseWorkflow, contentRules: baseWorkflow.contentRules!.map(rule => rule.id === "one" ? { ...rule, action: "skip" } : rule) },
  none: { ...baseWorkflow, conditionGroup: { mode: "ALL", conditions: [] } },
  all: { ...baseWorkflow, conditionGroup: always, points: [{ id: "legacy", fieldKey: "mail", value: "Yes", statement: "An optional legacy point" }], contentRules: [{ id: "always", type: "combination", order: 0, conditionGroup: always, content: "<p>Every shown combination is covered.</p>" }] },
  many: { ...baseWorkflow, conditionGroup: always, contentRules: [{ id: "many", type: "combination", order: 0, conditionGroup: { mode: "ANY", conditions: [1, 2, 3, 4, 5, 6].map(index => ({ fieldKey: `field${index}`, operator: "equals", value: "Yes" })) }, content: `<p>Upload summary for {{client.companyName}}.</p>${Array.from({ length: 16 }, (_, index) => `<p>Document ${index + 1}: review the supporting records before preparing the annual return.</p>`).join("")}` }] },
  legacy: { ...baseWorkflow, contentMode: undefined, conditionGroup: undefined, contentRules: [{ id: "point", type: "point", conditionGroup: baseWorkflow.conditionGroup!, content: "<strong>Point {{column.mail}}</strong>" }, { id: "statement", type: "statement", conditionGroup: baseWorkflow.conditionGroup!, content: "<em>Statement {{client.state}}</em>" }] },
  points: { ...baseWorkflow, contentMode: "points", contentRules: [...baseWorkflow.contentRules!, { id: "point", type: "point", conditionGroup: baseWorkflow.conditionGroup!, content: "<strong>Point {{client.companyName}}</strong>" }] },
  statements: { ...baseWorkflow, contentMode: "statements", contentRules: [...baseWorkflow.contentRules!, { id: "statement", type: "statement", conditionGroup: baseWorkflow.conditionGroup!, content: "<em>Statement {{tracker.financialYear}}</em>" }] },
  unsaved: { ...baseWorkflow, subject: "Unsaved subject · {{client.category}}", contentRules: baseWorkflow.contentRules!.map(rule => rule.id === "one" ? { ...rule, content: "<p>Unsaved scenario message.</p>" } : rule) },
};

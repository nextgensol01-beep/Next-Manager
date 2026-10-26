import type { TrackerConditionGroup, TrackerEmailContentRule, TrackerEmailWorkflow, TrackerField } from "./clientTrackers";
import { emailConditionFields, emailConditionGroupIssue, emailConditionIssue, emailConditionOperators } from "./tracker-email-context";

export function emailOperatorsForField(field?: TrackerField) {
  return emailConditionOperators(field);
}
export function hasRichTextContent(value: string | undefined) {
  return Boolean(value?.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").trim());
}

export type WorkflowReviewSection = "about" | "audience" | "messages" | "template" | "delivery";
export type EmailWorkflowIssue = { section: WorkflowReviewSection; message: string; style?: NonNullable<TrackerEmailWorkflow["contentMode"]>; ruleId?: string; conditionIndex?: number };
export type ScenarioDraftIssue = { status: "Incomplete" | "Invalid"; message: string; conditionIndex?: number };
export function emailScenarioIssues(rule: TrackerEmailContentRule, fields: TrackerField[]): ScenarioDraftIssue[] {
  const registry = emailConditionFields(fields), issues: ScenarioDraftIssue[] = [];
  if (!rule.conditionGroup?.conditions.length) issues.push({ status: "Incomplete", message: "Add at least one matching condition." });
  for (const [index, condition] of (rule.conditionGroup?.conditions || []).entries()) {
    const field = registry.find(item => item.key === condition.fieldKey);
    const missing = !condition.fieldKey || !["is_empty", "is_not_empty"].includes(condition.operator) && (condition.value == null || String(condition.value).trim() === "" || Array.isArray(condition.value) && !condition.value.length);
    const issue = !condition.fieldKey ? "Choose a field." : emailConditionIssue(condition, registry);
    if (issue) issues.push({ status: missing && (!condition.fieldKey || field) ? "Incomplete" : "Invalid", message: `Condition ${index + 1}: ${issue}`, conditionIndex: index });
  }
  if (!issues.length) { const issue = emailConditionGroupIssue(rule.conditionGroup, registry); if (issue) issues.push({ status: "Invalid", message: issue }); }
  if (rule.action !== "skip" && !hasRichTextContent(rule.content)) issues.push({ status: "Incomplete", message: "Add message text for this sending rule." });
  return issues;
}

/** The existing save checks, in their original order. Save consumes the first
 * issue; Review can inspect all issues without introducing new requirements. */
function* workflowIssues(workflow: TrackerEmailWorkflow, fields: TrackerField[], index: number): Generator<EmailWorkflowIssue> {
  const registry = emailConditionFields(fields);
  const fieldByKey = new Map(registry.map(field => [field.key, field]));
  const validateConditions = (conditions: TrackerConditionGroup | undefined, location: string) => {
    if (!conditions?.conditions.length) return `${location} needs at least one condition.`;
    for (const condition of conditions.conditions) {
      const field = fieldByKey.get(condition.fieldKey);
      if (!field) return `${location} references a removed tracker column.`;
      if (!emailOperatorsForField(field).some(operator => operator.value === condition.operator)) return `${location} uses an incompatible operator for ${field.label}.`;
      if (!["is_empty", "is_not_empty"].includes(condition.operator) && String(condition.value ?? "").trim() === "") return `${location} needs a value for ${field.label}.`;
    }
    const issue = emailConditionGroupIssue(conditions, registry);
    return issue ? `${location}: ${issue}` : null;
  };
  const name = workflow.name.trim() || `Workflow ${index + 1}`;
  if (workflow.combinationMatchingMode !== undefined && !["first", "combine"].includes(workflow.combinationMatchingMode))
    yield { section: "messages", style: "combinations", message: `${name} uses an unsupported matching mode.` };
  if (!workflow.name.trim()) yield { section: "about", message: `Workflow ${index + 1} needs a name.` };
  if (!workflow.subject.trim()) yield { section: "template", message: `${name} needs an email subject.` };
  if (!hasRichTextContent(workflow.body)) yield { section: "template", message: `${name} needs an email body.` };
  const workflowConditions = validateConditions(workflow.conditionGroup || {
    mode: "ALL", conditions: [{ fieldKey: workflow.mainFieldKey, operator: "equals", value: workflow.mainValue }],
  }, `${name} eligibility`);
  if (workflowConditions) yield { section: "audience", message: workflowConditions };
  for (const point of workflow.points) {
    const style = point.format === "statement" ? "statements" : "points";
    if (!fieldByKey.has(point.fieldKey)) yield { section: "messages", style, message: `${name} has a message for a removed tracker column.` };
    if (!point.value.trim()) yield { section: "messages", style, message: `${name} needs a matching value for each message.` };
    if (!hasRichTextContent(point.statement)) yield { section: "messages", style, message: `${name} needs text for each matching message.` };
  }
  for (const rule of workflow.contentRules || []) {
    const style = rule.type === "combination" ? "combinations" : rule.type === "statement" ? "statements" : "points";
    const sameType = (workflow.contentRules || []).filter(item => item.type === rule.type).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const label = `${rule.type === "combination" ? "Scenario" : rule.type === "statement" ? "Statement" : "Point"} ${sameType.findIndex(item => item.id === rule.id) + 1}${rule.name ? ` — ${rule.name}` : ""}`;
    for (const issue of emailScenarioIssues(rule, fields)) yield { section: "messages", style, ruleId: rule.id, conditionIndex: issue.conditionIndex, message: `${name}: ${label} needs attention. ${issue.message}` };
  }
  for (const attachment of workflow.attachments || []) {
    const attachmentConditions = validateConditions(attachment.conditionGroup, `${name} attachment rule`);
    if (attachment.conditionGroup && attachmentConditions) yield { section: "delivery", message: attachmentConditions };
  }
}
export function emailWorkflowValidationIssues(workflow: TrackerEmailWorkflow, fields: TrackerField[], index = 0) {
  return [...workflowIssues(workflow, fields, index)];
}
export function validateEmailWorkflowDrafts(workflows: TrackerEmailWorkflow[], fields: TrackerField[]) {
  for (const [index, workflow] of workflows.entries()) {
    const issue = workflowIssues(workflow, fields, index).next().value;
    if (issue) return issue.message;
  }
  return null;
}

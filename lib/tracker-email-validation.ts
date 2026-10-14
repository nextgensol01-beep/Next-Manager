import type { TrackerConditionGroup, TrackerEmailWorkflow, TrackerField, TrackerRuleOperator } from "./clientTrackers";

const operators: { value: TrackerRuleOperator; label: string }[] = [
  { value: "equals", label: "equals" }, { value: "not_equals", label: "does not equal" },
  { value: "is_empty", label: "is empty" }, { value: "is_not_empty", label: "is not empty" },
  { value: "contains", label: "contains" }, { value: "not_contains", label: "does not contain" },
  { value: "greater_than", label: "greater than" }, { value: "greater_than_or_equal", label: "at least" },
  { value: "less_than", label: "less than" }, { value: "less_than_or_equal", label: "at most" },
];
export function emailOperatorsForField(field?: TrackerField) {
  const equality = ["equals", "not_equals", "is_empty", "is_not_empty"];
  const text = [...equality, "contains", "not_contains"];
  const numeric = [...equality, "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal"];
  const allowed = field?.type === "number" || field?.type === "date" ? numeric
    : ["text", "longText", "tags", "multiSelect"].includes(field?.type || "") ? text : equality;
  return operators.filter(operator => allowed.includes(operator.value));
}
export function hasRichTextContent(value: string | undefined) {
  return Boolean(value?.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").trim());
}

export type WorkflowReviewSection = "about" | "audience" | "messages" | "template" | "delivery";
export type EmailWorkflowIssue = { section: WorkflowReviewSection; message: string; style?: NonNullable<TrackerEmailWorkflow["contentMode"]> };

/** The existing save checks, in their original order. Save consumes the first
 * issue; Review can inspect all issues without introducing new requirements. */
function* workflowIssues(workflow: TrackerEmailWorkflow, fields: TrackerField[], index: number): Generator<EmailWorkflowIssue> {
  const fieldByKey = new Map(fields.map(field => [field.key, field]));
  const validateConditions = (conditions: TrackerConditionGroup | undefined, location: string) => {
    if (!conditions?.conditions.length) return `${location} needs at least one condition.`;
    for (const condition of conditions.conditions) {
      const field = fieldByKey.get(condition.fieldKey);
      if (!field) return `${location} references a removed tracker column.`;
      if (!emailOperatorsForField(field).some(operator => operator.value === condition.operator))
        return `${location} uses an incompatible operator for ${field.label}.`;
      if (!["is_empty", "is_not_empty"].includes(condition.operator) && String(condition.value ?? "").trim() === "")
        return `${location} needs a value for ${field.label}.`;
    }
    return null;
  };
  const name = workflow.name.trim() || `Workflow ${index + 1}`;
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
    const ruleConditions = validateConditions(rule.conditionGroup, `${name} conditional content`);
    if (ruleConditions) yield { section: "messages", style, message: ruleConditions };
    if (rule.action !== "skip" && !hasRichTextContent(rule.content))
      yield { section: "messages", style, message: `${name} has conditional content without message text.` };
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

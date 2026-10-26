import type { TrackerEmailWorkflow, TrackerEmailPoint, TrackerField } from "@/lib/clientTrackers";
import { legacyWorkflowCondition } from "@/lib/server/tracker-conditions";
import { activeEmailRules, createTrackerEmailContext, emailConditionFields, emailValueText, evaluateEmailCondition, evaluateEmailConditionGroup } from "./tracker-email-context";
import { renderTrackerEmail, selectEmailContent } from "./tracker-email-renderer";
export type EmailCombinationPreview = {
  id: string;
  conditions: string[];
  points: TrackerEmailPoint[];
  eligible: boolean;
  subject: string;
  body: string;
  /** Presentation metadata only; matching and generated content remain unchanged. */
  values: Record<string, string>;
  inputs: { key: string; label: string; value: string }[];
  scenarioId?: string;
  sendRuleMatched: boolean;
  selection?: ReturnType<typeof selectEmailContent>["selection"];
  issues?: string[];
  conditionResults?: Record<string, boolean>;
};

export function buildEmailCombinationPreviews(
  workflow: TrackerEmailWorkflow,
  fields: TrackerField[],
) {
  const fieldLabels = new Map(emailConditionFields(fields).map((field) => [field.key, field.label]));
  const eligibility =
    workflow.conditionGroup ||
    legacyWorkflowCondition(workflow.mainFieldKey, workflow.mainValue);
  const contentRules = activeEmailRules(workflow);
  const choicesByField = new Map<string, string[]>();
  [
    ...workflow.points.map((point) => ({
      fieldKey: point.fieldKey,
      value: point.value,
    })),
    ...eligibility.conditions.map((condition) => ({
      fieldKey: condition.fieldKey,
      value: condition.value ?? "",
    })),
    ...contentRules.flatMap((rule) =>
      rule.conditionGroup.conditions.map((condition) => ({
        fieldKey: condition.fieldKey,
        value: condition.value ?? "",
      })),
    ),
  ]
    .filter((item) => item.value !== undefined && item.value !== null && item.value !== "")
    .forEach((item) => {
      const values = choicesByField.get(item.fieldKey) || [];
      for (const value of Array.isArray(item.value) ? item.value : [item.value]) if (!values.includes(emailValueText(value))) values.push(emailValueText(value));
      choicesByField.set(item.fieldKey, values);
    });
  const groups = [...choicesByField.entries()];
  const possibleCount = groups.reduce(
    (count, [, values]) => count * (values.length + 1),
    1,
  );
  const maxPreviews = 32;
  let valueSets: Array<Record<string, string>> = [{}];
  groups.forEach(([fieldKey, values]) => {
    const next: Array<Record<string, string>> = [];
    valueSets.forEach((current) =>
      ["", ...values].forEach((value) => {
        if (next.length < maxPreviews)
          next.push({ ...current, [fieldKey]: value });
      }),
    );
    valueSets = next;
  });
  const previews: EmailCombinationPreview[] = valueSets.map((values, index) => {
    const context = createTrackerEmailContext({ entry: { clientId: "preview" }, client: { clientId: "preview", companyName: "{{client.companyName}}", category: Object.hasOwn(values, "client.category") ? values["client.category"] : "{{client.category}}", state: Object.hasOwn(values, "client.state") ? values["client.state"] : "{{client.state}}", gstNumber: "{{client.gstNumber}}" }, values, fields, financialYear: "{{tracker.financialYear}}", trackerName: "{{tracker.name}}", workflowName: workflow.name, communicationStatus: values["client.communicationStatus"] });
    const chosen = selectEmailContent(workflow, context);
    const rendered = renderTrackerEmail(workflow, context);
    const allPoints = [...chosen.points, ...chosen.contentPoints.map(rule => ({ id: rule.id, fieldKey: "", value: "", statement: rule.content || "", format: "point" as const }))];
    const conditions = groups.flatMap(([fieldKey]) => [
      `${fieldLabels.get(fieldKey) || fieldKey}: ${values[fieldKey] || "—"}`,
    ]);
    return {
      id: `${index}-${conditions.join("-") || "none"}`,
      conditions,
      points: allPoints,
      values,
      inputs: groups.map(([key]) => ({ key, label: fieldLabels.get(key) || key, value: values[key] || "" })),
      scenarioId: chosen.selected[0]?.id,
      selection: chosen.selection,
      conditionResults: Object.fromEntries([eligibility, ...contentRules.map(rule => rule.conditionGroup)].flatMap(group => group.conditions.map(condition => [JSON.stringify(condition), evaluateEmailCondition(condition, context)]))),
      issues: rendered.variableIssues.map(issue => issue.message),
      sendRuleMatched: evaluateEmailConditionGroup(eligibility, context),
      eligible: evaluateEmailConditionGroup(eligibility, context) && !chosen.skipReason && !rendered.variableIssues.length,
      subject: rendered.subject,
      body: rendered.richBody,
    };
  });
  return {
    previews,
    possibleCount,
    limited: possibleCount > maxPreviews,
    mode: eligibility.mode,
  };
}



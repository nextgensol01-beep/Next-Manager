import type { TrackerEmailWorkflow, TrackerEmailPoint, TrackerField } from "@/lib/clientTrackers";
import { evaluateTrackerConditionGroup, legacyWorkflowCondition } from "@/lib/server/tracker-conditions";
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
};

function previewPointMarkup(points: TrackerEmailPoint[]) {
  return points
    .map((point) =>
      point.format === "statement" ? point.statement : `• ${point.statement}`,
    )
    .join("\n");
}

function previewTemplate(
  template: string,
  points: TrackerEmailPoint[],
  statements: string[],
  combinationMessage: string,
  appendPoints: boolean,
) {
  const pointMarkup = previewPointMarkup(points);
  const statementMarkup = statements.join("\n\n");
  const includesPointsPlaceholder = template.includes("{{points}}");
  const includesStatementsPlaceholder = template.includes("{{statements}}");
  const includesCombinationPlaceholder = template.includes(
    "{{combinationMessage}}",
  );
  const replaced = template
    .replace(/{{points}}/g, pointMarkup)
    .replace(/{{statements}}/g, statementMarkup)
    .replace(/{{combinationMessage}}/g, combinationMessage);
  if (!appendPoints) return replaced;
  const additions = [
    !includesCombinationPlaceholder && combinationMessage,
    !includesStatementsPlaceholder && statementMarkup,
    !includesPointsPlaceholder && pointMarkup,
  ].filter(Boolean);
  return additions.length ? `${replaced.trim()}\n\n${additions.join("\n\n")}` : replaced;
}

export function buildEmailCombinationPreviews(
  workflow: TrackerEmailWorkflow,
  fields: TrackerField[],
) {
  const fieldLabels = new Map(fields.map((field) => [field.key, field.label]));
  const eligibility =
    workflow.conditionGroup ||
    legacyWorkflowCondition(workflow.mainFieldKey, workflow.mainValue);
  const allContentRules = [...(workflow.contentRules || [])].sort(
    (left, right) => (left.order || 0) - (right.order || 0),
  );
  // Match delivery: inactive style drafts stay stored without appearing in previews.
  // Legacy workflows without a canonical mode retain their mixed-rule behaviour.
  const contentRules = workflow.contentMode
    ? allContentRules.filter(rule => rule.type === (workflow.contentMode === "combinations" ? "combination" : workflow.contentMode === "statements" ? "statement" : "point"))
    : allContentRules;
  const choicesByField = new Map<string, string[]>();
  [
    ...workflow.points.map((point) => ({
      fieldKey: point.fieldKey,
      value: point.value,
    })),
    ...eligibility.conditions.map((condition) => ({
      fieldKey: condition.fieldKey,
      value: String(condition.value ?? ""),
    })),
    ...contentRules.flatMap((rule) =>
      rule.conditionGroup.conditions.map((condition) => ({
        fieldKey: condition.fieldKey,
        value: String(condition.value ?? ""),
      })),
    ),
  ]
    .filter((item) => item.value)
    .forEach((item) => {
      const values = choicesByField.get(item.fieldKey) || [];
      if (!values.includes(item.value)) values.push(item.value);
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
    const points = workflow.points.filter(
      (point) => values[point.fieldKey] === point.value,
    );
    const combination = contentRules.find(
      (rule) =>
        rule.type === "combination" &&
        evaluateTrackerConditionGroup(rule.conditionGroup, values),
    );
    const scenariosRequired = contentRules.some(
      (rule) => rule.type === "combination",
    );
    const contentPoints = contentRules
      .filter(
        (rule) =>
          rule.type === "point" &&
          evaluateTrackerConditionGroup(rule.conditionGroup, values),
      )
      .map((rule) => ({
        id: rule.id,
        fieldKey: "",
        value: "",
        statement: rule.content || "",
        format: "point" as const,
      }));
    const statements = contentRules
      .filter(
        (rule) =>
          rule.type === "statement" &&
          evaluateTrackerConditionGroup(rule.conditionGroup, values),
      )
      .map((rule) => rule.content || "")
      .filter(Boolean);
    const allPoints = [...points, ...contentPoints];
    const conditions = groups.flatMap(([fieldKey]) => [
      `${fieldLabels.get(fieldKey) || fieldKey}: ${values[fieldKey] || "—"}`,
    ]);
    return {
      id: `${index}-${conditions.join("-") || "none"}`,
      conditions,
      points: allPoints,
      values,
      inputs: groups.map(([key]) => ({ key, label: fieldLabels.get(key) || key, value: values[key] || "" })),
      scenarioId: combination?.id,
      sendRuleMatched: evaluateTrackerConditionGroup(eligibility, values),
      eligible:
        evaluateTrackerConditionGroup(eligibility, values) &&
        (!scenariosRequired ||
          Boolean(combination && combination.action !== "skip")),
      subject: previewTemplate(
        workflow.subject,
        allPoints,
        statements,
        combination?.content || "",
        false,
      ),
      body: previewTemplate(
        workflow.body,
        allPoints,
        statements,
        combination?.content || "",
        true,
      ),
    };
  });
  return {
    previews,
    possibleCount,
    limited: possibleCount > maxPreviews,
    mode: eligibility.mode,
  };
}



import type { TrackerEmailWorkflow } from "./clientTrackers";
import { activeEmailRules, evaluateEmailConditionGroup, type TrackerEmailContext } from "./tracker-email-context";
import { renderTrackerEmail } from "./tracker-email-renderer";
import { legacyWorkflowCondition } from "./server/tracker-conditions";

export type ScenarioClientResult = {
  entryId: string; clientId: string; companyName: string; category?: string;
  decision: "send" | "excluded" | "no_match" | "outside_rule" | "invalid";
  reason: string; sendRuleMatched: boolean; matchedRuleIds: string[]; selectedRuleIds: string[];
  selection: ReturnType<typeof renderTrackerEmail>["selection"];
  issues: string[]; message?: { subject: string; body: string; html: string };
};
export type ScenarioAnalysis = {
  evaluatedAt: string; total: number; evaluated: number; complete: boolean; limit: number;
  counts: { matched: number; noMatch: number; overlapping: number; excluded: number; send: number; invalid: number; outsideRule: number };
  scenarios: { id: string; name: string; priority: number; action: string; matched: number; selected: number; overlapping: number }[];
  clients: ScenarioClientResult[];
};
export function scenarioLabel(rule: { name?: string }, index: number) {
  return `Scenario ${index + 1}${rule.name?.trim() ? ` — ${rule.name.trim()}` : ""}`;
}
/** Selection and rendering both delegate to the same engine used by preparation. */
export function analyzeScenarioClient(workflow: TrackerEmailWorkflow, context: TrackerEmailContext, detail = false): ScenarioClientResult {
  const rendered = renderTrackerEmail(workflow, context);
  const sendRuleMatched = evaluateEmailConditionGroup(workflow.conditionGroup || legacyWorkflowCondition(workflow.mainFieldKey, workflow.mainValue), context);
  const selection = rendered.selection;
  const matchedRuleIds = [...selection.matchedScenarioIds, ...selection.matchedStatementIds, ...selection.matchedPointIds];
  const selectedRuleIds = [...selection.selectedScenarioIds, ...selection.matchedStatementIds, ...selection.matchedPointIds];
  const excluded = selection.scenarios.filter(rule => rule.selected && rule.excluded);
  const decision = !sendRuleMatched ? "outside_rule" : excluded.length ? "excluded" : rendered.skipReason ? "no_match" : "send";
  const names = selection.scenarios.filter(rule => rule.selected).map(rule => rule.name).join(", ");
  const reason = !sendRuleMatched ? "Workflow eligibility conditions are not met." : excluded.length ? `Excluded by ${excluded.map(rule => rule.name).join(", ")}. ${selection.matchingMode === "combine" ? "A selected Exclude rule blocks sending in Combine mode." : "The highest-priority matching scenario is an Exclude rule."}`
    : rendered.skipReason || (selection.matchingMode === "combine" && names ? `Combine mode selects ${names}.` : names ? `${names} has the highest priority among matching scenarios.${selection.ignoredScenarioIds.length ? " Other matches are bypassed." : ""}` : "The shared email and matching message fragments are selected.");
  return { entryId: context.entryId, clientId: context.clientId, companyName: context.client.companyName || context.clientId, category: context.client.category,
    decision, reason, sendRuleMatched, matchedRuleIds, selectedRuleIds, selection, issues: rendered.variableIssues.map(issue => issue.message),
    ...(detail ? { message: { subject: rendered.subject, body: rendered.body, html: rendered.html } } : {}) };
}
export function summarizeScenarioAnalysis(workflow: TrackerEmailWorkflow, clients: ScenarioClientResult[], total: number, limit: number): ScenarioAnalysis {
  return { evaluatedAt: new Date().toISOString(), total, evaluated: clients.length, complete: clients.length === total, limit,
    counts: { matched: clients.filter(row => row.matchedRuleIds.length).length, noMatch: clients.filter(row => !row.matchedRuleIds.length && row.decision !== "invalid").length,
      overlapping: clients.filter(row => row.selection.matchedScenarioIds.length > 1).length, excluded: clients.filter(row => row.decision === "excluded").length,
      send: clients.filter(row => row.decision === "send").length, invalid: clients.filter(row => row.decision === "invalid" || row.issues.length).length, outsideRule: clients.filter(row => row.decision === "outside_rule").length },
    scenarios: activeEmailRules(workflow).map((rule) => { const index = activeEmailRules(workflow).filter(item => item.type === rule.type).findIndex(item => item.id === rule.id); return ({ id: rule.id, name: rule.type === "combination" ? scenarioLabel(rule, index) : `${rule.type === "statement" ? "Statement" : "Point"} ${index + 1}${rule.name ? ` — ${rule.name}` : ""}`,
      priority: index + 1, action: rule.action || "include", matched: clients.filter(row => row.matchedRuleIds.includes(rule.id)).length,
      selected: clients.filter(row => row.sendRuleMatched && row.selectedRuleIds.includes(rule.id)).length,
      overlapping: clients.filter(row => row.matchedRuleIds.includes(rule.id) && row.selection.matchedScenarioIds.length > 1).length }); }), clients };
}

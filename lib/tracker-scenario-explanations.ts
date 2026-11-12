import type { TrackerConditionGroup, TrackerEmailWorkflow, TrackerField } from "./clientTrackers";
import type { ScenarioAnalysis, ScenarioClientResult } from "./tracker-scenario-analysis";

export const scenarioDecisionLabels = {
  send: "Message chosen by send rules",
  excluded: "Not selected · Exclude rule applied",
  no_match: "Not selected · No scenario applies",
  outside_rule: "Not selected · Overall send conditions not met",
  invalid: "Decision unavailable · Missing client information",
};
export type ScenarioResultFilter = "all" | "send" | "not_selected" | "review" | "overlap" | "excluded" | "no_match" | "outside_rule" | "invalid" | "unresolved" | "matched" | "no_rule_match";
export type ScenarioRuleView = "matched" | "used" | "outside" | "bypassed" | "blocked" | "overlap";
export function clientNeedsReview(row: ScenarioClientResult) {
  return row.selection.matchedScenarioIds.length > 1 || row.decision === "invalid" || row.decision === "no_match" || row.issues.length > 0;
}
/** These group existing decisions; no conditions are evaluated here. */
export function scenarioOutcomeTotals(result: ScenarioAnalysis) {
  const selected = result.clients.filter(row => row.decision === "send").length;
  const unresolved = result.clients.filter(row => row.decision === "invalid").length;
  return { checked: result.clients.length, selected, notSelected: result.clients.length - selected - unresolved,
    unresolved, review: result.clients.filter(clientNeedsReview).length };
}
export function matchesScenarioResultFilter(row: ScenarioClientResult, filter: ScenarioResultFilter) {
  switch (filter) {
    case "all": return true;
    case "not_selected": return row.decision !== "send" && row.decision !== "invalid";
    case "review": return clientNeedsReview(row);
    case "overlap": return row.selection.matchedScenarioIds.length > 1;
    case "invalid": return row.decision === "invalid" || row.issues.length > 0;
    case "unresolved": return row.decision === "invalid";
    case "matched": return row.matchedRuleIds.length > 0;
    case "no_rule_match": return !row.matchedRuleIds.length && row.decision !== "invalid";
    default: return row.decision === filter;
  }
}
export function matchesScenarioRuleView(row: ScenarioClientResult, ruleId: string, view: ScenarioRuleView) {
  if (!ruleId) return true;
  if (!row.matchedRuleIds.includes(ruleId)) return false;
  switch (view) {
    case "used": return row.sendRuleMatched && row.selectedRuleIds.includes(ruleId) && (row.decision === "send" || row.decision === "excluded" && row.selection.scenarios.some(rule => rule.id === ruleId && rule.selected && rule.excluded));
    case "outside": return !row.sendRuleMatched;
    case "bypassed": return row.sendRuleMatched && row.selection.ignoredScenarioIds.includes(ruleId);
    case "blocked": return row.sendRuleMatched && row.selectedRuleIds.includes(ruleId) && row.decision !== "send" && !row.selection.scenarios.some(rule => rule.id === ruleId && rule.selected && rule.excluded);
    case "overlap": return row.selection.matchedScenarioIds.length > 1;
    default: return true;
  }
}
export function scenarioRuleBreakdown(result: ScenarioAnalysis, id: string) {
  const rows = result.clients.filter(row => row.matchedRuleIds.includes(id));
  return { matched: rows.length, used: rows.filter(row => matchesScenarioRuleView(row, id, "used")).length,
    outside: rows.filter(row => matchesScenarioRuleView(row, id, "outside")).length,
    bypassed: rows.filter(row => matchesScenarioRuleView(row, id, "bypassed")).length,
    blocked: rows.filter(row => matchesScenarioRuleView(row, id, "blocked")).length,
    overlapping: rows.filter(row => matchesScenarioRuleView(row, id, "overlap")).length };
}
export function scenarioTestSummary(result: ScenarioAnalysis) {
  const totals = scenarioOutcomeTotals(result);
  const clients = totals.checked === 1 ? "client" : "clients";
  if (!totals.checked) return result.total ? "No clients could be checked in this run. Test again to get results." : "There are no clients currently included in this tracker to check.";
  if (totals.unresolved === totals.checked) return `The test could not make a reliable decision for any of the ${totals.checked} checked clients because their linked client records are unavailable. Check that information, then test again.`;
  const main = totals.selected === totals.checked ? `Your rules chose a sending message for ${totals.checked === 1 ? "the" : "all"} ${totals.checked} checked ${clients}.`
    : totals.selected ? `Your rules chose a sending message for ${totals.selected} of ${totals.checked} checked ${clients}. ${totals.notSelected} were not selected.`
    : `No sending message was chosen for the ${totals.checked} checked ${clients}. ${totals.notSelected} ${totals.notSelected === 1 ? "was" : "were"} not selected.`;
  const unresolved = totals.unresolved ? ` A decision could not be made for ${totals.unresolved} ${totals.unresolved === 1 ? "client because its record is" : "clients because their records are"} unavailable.` : "";
  const overlap = result.counts.overlapping ? ` ${result.counts.overlapping} ${result.counts.overlapping === 1 ? "client matches" : "clients match"} multiple scenarios; check which message takes priority.` : "";
  const missing = result.counts.invalid ? " Some client or message information needs attention before email preparation." : "";
  return main + unresolved + overlap + missing;
}
const operatorWords: Record<string, string> = { equals: "is", not_equals: "is not", is_any_of: "is any of", contains_any: "contains any of", contains_all: "contains all of", contains: "contains", not_contains: "does not contain", greater_than: "is greater than", greater_than_or_equal: "is at least", less_than: "is less than", less_than_or_equal: "is at most", before: "is before", after: "is after", on: "is on", is_empty: "is empty", is_not_empty: "is not empty" };
export function plainScenarioConditions(group: TrackerConditionGroup | undefined, fields: TrackerField[]) {
  if (!group?.conditions.length) return "No conditions are configured.";
  const builtIns: Record<string, string> = { "client.category": "Client Category", "client.state": "State", "client.communicationStatus": "Communication Status" };
  const parts = group.conditions.map(condition => {
    const name = builtIns[condition.fieldKey] || fields.find(field => field.key === condition.fieldKey)?.label || `Unavailable field (${condition.fieldKey || "not chosen"})`;
    const value = Array.isArray(condition.value) ? condition.value.join(", ") : condition.value === true ? "Yes" : condition.value === false ? "No" : String(condition.value ?? "not selected");
    return `${name} ${operatorWords[condition.operator] || condition.operator}${["is_empty", "is_not_empty"].includes(condition.operator) ? "" : ` ${value}`}`;
  });
  return `Clients where ${parts.join(group.mode === "ANY" ? " or " : " and ")}.`;
}
export function explainScenarioClient(row: ScenarioClientResult, scenarios: ScenarioAnalysis["scenarios"]) {
  const names = new Map(scenarios.map(rule => [rule.id, rule.name]));
  for (const rule of row.selection.scenarios) names.set(rule.id, rule.name);
  const label = (id: string) => names.get(id) || "Retained matching message";
  const matches = row.matchedRuleIds.map(label);
  const chosen = row.sendRuleMatched ? row.selectedRuleIds.map(label) : [];
  const chosenScenarios = row.selection.scenarios.filter(rule => rule.selected).map(rule => rule.name);
  const otherFragments = row.selectedRuleIds.filter(id => !row.selection.selectedScenarioIds.includes(id));
  const ignored = row.selection.ignoredScenarioIds.map(label);
  const exclusions = row.selection.scenarios.filter(rule => rule.selected && rule.excluded).map(rule => rule.name);
  const result = row.decision === "send" ? "A sending message was chosen for this client."
    : row.decision === "outside_rule" ? "No sending message was chosen because the workflow’s overall sending conditions were not met."
    : row.decision === "excluded" ? "This client was not selected because an Exclude scenario applied."
    : row.decision === "no_match" ? "This client met the overall sending conditions, but no scenario applied. No scenario message was chosen."
    : "A decision could not be made because the linked client record is unavailable.";
  const why = row.decision === "invalid" ? "Restore or check the linked client information, then test again."
    : matches.length ? `This client matched ${matches.join(" and ")}.` : row.decision === "send" ? "The overall sending conditions were met. The workflow uses its shared email template and any retained matching content." : "None of the scenario conditions matched this client.";
  const selection = !row.sendRuleMatched ? "The overall sending conditions are checked first. Matching scenario conditions alone do not select a client or apply an Exclude action."
    : row.decision === "excluded" ? `${exclusions.join(" and ")} ${exclusions.length === 1 ? "excludes" : "exclude"} this client.${row.selection.matchingMode === "combine" ? " This workflow combines matching scenarios; a selected Exclude rule stops sending even when a Send scenario also matches." : " It comes first among this client’s matching scenarios."}`
    : chosen.length && chosenScenarios.length ? (row.selection.matchingMode === "combine" ? `The workflow combines all matching scenarios: ${chosenScenarios.join(" and ")}.` : `${chosenScenarios.join(" and ")} was chosen because it comes first among this client’s matching scenarios.`) + (otherFragments.length ? " Other matching message fragments are included independently of scenario priority." : "")
    : row.decision === "send" ? "The shared email and any matching message fragments were chosen. No combination scenario is required for this result." : "There is no selected scenario message.";
  const others = !row.sendRuleMatched && matches.length ? "These scenario matches did not determine the final result because the overall sending conditions were not met."
    : ignored.length ? `${ignored.join(" and ")} also matched, but ${ignored.length === 1 ? "its message was" : "their messages were"} not chosen. First-match mode uses the earlier scenario. Change scenario order or conditions in the editor if you expected a different message.`
    : row.selection.matchingMode === "combine" && matches.length > 1 ? "Every matching scenario was included in the rule decision. An applied Exclude scenario prevents any sending message from being used." : "No additional scenario was bypassed by priority.";
  return { result, why, selection, others };
}
export function scenarioNextStep(result: ScenarioAnalysis) {
  if (!result.complete) return "This run checked only part of the tracker. Test again before drawing conclusions about clients that were not checked.";
  if (!result.evaluated) return "Include clients in this tracker, then test your rules again.";
  if (result.counts.invalid) return "Check the missing client or message information before preparing emails.";
  if (result.counts.overlapping) return "Review clients matching multiple scenarios to confirm that the intended message takes priority. Adjust scenario order or conditions in the editor, then test again.";
  if (result.clients.some(row => row.decision === "no_match" || row.decision === "outside_rule")) return "Review the scenario and overall sending conditions if you expected more clients to receive a message.";
  return "If these choices are what you intended, close this test and save the workflow. Saving does not send emails. Full email checks happen in Email Clients.";
}
export function workflowSendConditions(workflow: TrackerEmailWorkflow) {
  return workflow.conditionGroup || { mode: "ALL" as const, conditions: [{ fieldKey: workflow.mainFieldKey, operator: "equals" as const, value: workflow.mainValue }] };
}

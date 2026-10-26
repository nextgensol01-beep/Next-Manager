import { TRACKER_EMAIL_CONTENT_RULE_LIMIT, type TrackerEmailContentRule, type TrackerEmailWorkflow } from "./clientTrackers";

export type WorkflowDraftChange = Partial<TrackerEmailWorkflow> | ((current: TrackerEmailWorkflow) => Partial<TrackerEmailWorkflow>);
export const orderedDraftRules = (rules: TrackerEmailContentRule[], type: TrackerEmailContentRule["type"]) => rules.filter(rule => rule.type === type).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const normalize = (rules: TrackerEmailContentRule[], ordered: TrackerEmailContentRule[]) => {
  const positions = new Map(ordered.map((rule, index) => [rule.id, index]));
  return rules.map(rule => positions.has(rule.id) ? { ...rule, order: positions.get(rule.id)! } : rule);
};
export function addDraftRule(workflow: TrackerEmailWorkflow, rule: TrackerEmailContentRule): Partial<TrackerEmailWorkflow> {
  const rules = workflow.contentRules || [];
  if (rules.length >= TRACKER_EMAIL_CONTENT_RULE_LIMIT || rules.some(item => item.id === rule.id)) return {};
  const ordered = orderedDraftRules(rules, rule.type);
  return { contentRules: [...normalize(rules, ordered), { ...rule, order: ordered.length }] };
}
export type DraftRuleChange = Partial<TrackerEmailContentRule> | ((current: TrackerEmailContentRule) => Partial<TrackerEmailContentRule>);
export type ConditionGroupChange = Partial<import("./clientTrackers").TrackerConditionGroup> | ((current: import("./clientTrackers").TrackerConditionGroup) => Partial<import("./clientTrackers").TrackerConditionGroup>);
export function updateDraftRule(workflow: TrackerEmailWorkflow, id: string, patch: DraftRuleChange): Partial<TrackerEmailWorkflow> {
  return { contentRules: (workflow.contentRules || []).map(rule => rule.id === id ? { ...rule, ...(typeof patch === "function" ? patch(rule) : patch), id: rule.id } : rule) };
}
export type RemovedDraftRule = {
  rule: TrackerEmailContentRule; index: number; arrayIndex: number; beforeId?: string; afterId?: string;
  originalOrders: Array<{ id: string; order?: number }>;
};
export function snapshotDraftRule(rules: TrackerEmailContentRule[], id: string): RemovedDraftRule | null {
  const rule = rules.find(item => item.id === id); if (!rule) return null;
  const ordered = orderedDraftRules(rules, rule.type), index = ordered.findIndex(item => item.id === id);
  return { rule: structuredClone(rule), index, arrayIndex: rules.findIndex(item => item.id === id), beforeId: ordered[index - 1]?.id, afterId: ordered[index + 1]?.id,
    originalOrders: ordered.map(item => ({ id: item.id, ...(item.order === undefined ? {} : { order: item.order }) })) };
}
export function removeDraftRule(workflow: TrackerEmailWorkflow, id: string, expected?: TrackerEmailContentRule): Partial<TrackerEmailWorkflow> {
  const rules = workflow.contentRules || [], rule = rules.find(item => item.id === id);
  if (!rule || expected && JSON.stringify(rule) !== JSON.stringify(expected)) return {};
  const remaining = rules.filter(item => item.id !== id);
  return { contentRules: normalize(remaining, orderedDraftRules(remaining, rule.type)) };
}
export function moveDraftRule(workflow: TrackerEmailWorkflow, id: string, direction: -1 | 1): Partial<TrackerEmailWorkflow> {
  const rules = workflow.contentRules || [], rule = rules.find(item => item.id === id); if (!rule) return {};
  const ordered = orderedDraftRules(rules, rule.type), index = ordered.findIndex(item => item.id === id), target = index + direction;
  if (target < 0 || target >= ordered.length) return {};
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return { contentRules: normalize(rules, ordered) };
}
export function restoreDraftRule(workflow: TrackerEmailWorkflow, snapshot: RemovedDraftRule): Partial<TrackerEmailWorkflow> {
  const rules = workflow.contentRules || [];
  if (rules.length >= TRACKER_EMAIL_CONTENT_RULE_LIMIT || rules.some(rule => rule.id === snapshot.rule.id)) return {};
  const ordered = orderedDraftRules(rules, snapshot.rule.type), restored = structuredClone(snapshot.rule);
  const expectedIds = snapshot.originalOrders.filter(item => item.id !== restored.id).map(item => item.id);
  const unchangedOrder = ordered.map(item => item.id).join("\0") === expectedIds.join("\0");
  const next = ordered.findIndex(item => item.id === snapshot.afterId), previous = ordered.findIndex(item => item.id === snapshot.beforeId);
  ordered.splice(next >= 0 ? next : previous >= 0 ? previous + 1 : Math.min(snapshot.index, ordered.length), 0, restored);
  const all = [...rules]; all.splice(Math.min(snapshot.arrayIndex, all.length), 0, restored);
  if (!unchangedOrder) return { contentRules: normalize(all, ordered) };
  const originals = new Map(snapshot.originalOrders.map(item => [item.id, item.order]));
  return { contentRules: all.map(rule => {
    if (!originals.has(rule.id)) return rule;
    const result = { ...rule }; const order = originals.get(rule.id);
    if (order === undefined) delete result.order; else result.order = order;
    return result;
  }) };
}

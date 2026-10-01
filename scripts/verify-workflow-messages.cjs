const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const context = { exports: {} };
  vm.runInNewContext(compiled, context, { filename: relativePath });
  return context.exports;
}
const { cleanTrackerEmailWorkflows } = load("lib/server/tracker-email-workflows.ts");
const { evaluateTrackerConditionGroup } = load("lib/server/tracker-conditions.ts");
const fields = [{ key: "upload", label: "Purchase upload", type: "toggle" }];
const group = { mode: "ALL", conditions: [{ fieldKey: "upload", operator: "equals", value: "Yes" }] };
const contentRules = [
  { id: "point", type: "point", order: 0, content: "<strong>Point {{client.companyName}}</strong>", conditionGroup: group },
  { id: "statement", type: "statement", order: 1, content: "<em>Statement {{tracker.financialYear}}</em>", conditionGroup: group },
  { id: "scenario-a", type: "combination", order: 1, content: "<p>Scenario A</p>", conditionGroup: group },
  { id: "scenario-b", type: "combination", order: 0, content: "<ul><li>Scenario B</li></ul>", conditionGroup: group },
];
const base = { id: "workflow", name: "Messages regression", mainFieldKey: "upload", mainValue: "Yes", subject: "Hello", body: "{{points}}", points: [], contentRules };
for (const contentMode of ["points", "statements", "combinations"]) {
  const saved = cleanTrackerEmailWorkflows(JSON.parse(JSON.stringify([{ ...base, contentMode }])), fields);
  assert(saved, `Save accepts ${contentMode}`);
  const reopened = cleanTrackerEmailWorkflows(JSON.parse(JSON.stringify(saved)), fields)[0];
  assert.equal(reopened.contentMode, contentMode);
  assert.equal(reopened.contentRules.length, 4, "Inactive modes remain stored");
  for (const rule of contentRules) {
    const actual = reopened.contentRules.find(item => item.id === rule.id);
    assert.equal(actual.order, rule.order, `Preserve priority zero for ${rule.id}`);
    assert.equal(actual.content, rule.content, "Preserve formatting and variable tokens");
  }
  const scenarios = reopened.contentRules.filter(rule => rule.type === "combination").sort((a, b) => a.order - b.order);
  assert.deepEqual(Array.from(scenarios, rule => rule.id), ["scenario-b", "scenario-a"]);
}
assert.equal(evaluateTrackerConditionGroup(group, { upload: true }), true);
assert.equal(evaluateTrackerConditionGroup(group, { upload: false }), false);
const conditions = [...group.conditions, { fieldKey: "upload", operator: "equals", value: "No" }];
assert.equal(evaluateTrackerConditionGroup({ mode: "ALL", conditions }, { upload: true }), false);
assert.equal(evaluateTrackerConditionGroup({ mode: "ANY", conditions }, { upload: true }), true);
console.log("Messages regression checks passed: mode retention, save/load, formatted variables, scenario priority zero, flat All/Any.");

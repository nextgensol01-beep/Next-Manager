const assert = require("node:assert/strict");
const load = require("./search-test-loader.cjs")();

const {
  buildReportStudioCustomFields,
  createAcceptedTargetStudioConfig,
  reportStudioCustomFieldKey,
  validateReportStudioConfig,
} = load("lib/report-studio.ts");

const customFields = buildReportStudioCustomFields([
  { key: "accountManager", label: "Account Manager", type: "text", active: true, applicableCategories: ["Producer"] },
  { key: "annualCapacity", label: "Annual Capacity", type: "number", active: true },
  { key: "renewalDate", label: "Renewal Date", type: "date", active: true },
  { key: "priorityClient", label: "Priority Client", type: "checkbox", active: true },
  { key: "portalPassword", label: "Portal Password", type: "password", active: true },
  { key: "disabledField", label: "Disabled", type: "text", active: false },
  { key: "legalName", label: "Legal Name", type: "text", active: true },
]);

assert.deepEqual(customFields.map((field) => field.id), [
  "client.custom.accountManager",
  "client.custom.annualCapacity",
  "client.custom.renewalDate",
  "client.custom.priorityClient",
]);
assert.equal(customFields[0].role, "dimension");
assert.deepEqual(customFields[0].applicableCategories, ["Producer"]);
assert.equal(customFields[1].role, "metric");
assert.equal(customFields[1].type, "number");
assert.equal(customFields[2].type, "date");
assert.equal(customFields[3].type, "boolean");
assert.equal(reportStudioCustomFieldKey(customFields[0].id), "accountManager");

const base = createAcceptedTargetStudioConfig("2025-26", false);
const validated = validateReportStudioConfig({
  ...base,
  columns: ["client.companyName", "client.custom.accountManager", "client.custom.annualCapacity"],
  metrics: ["client.custom.annualCapacity"],
  groupBy: ["client.custom.accountManager"],
  sort: [{ field: "client.custom.annualCapacity", direction: "desc" }],
  filters: {
    id: "root",
    kind: "group",
    logic: "and",
    children: [{
      id: "custom-filter",
      kind: "condition",
      field: "client.custom.accountManager",
      operator: "contains",
      value: "Ravi",
    }],
  },
}, customFields);

assert.equal(validated.columns[1], "client.custom.accountManager");
assert.equal(validateReportStudioConfig({
  ...base,
  analysis: { ...base.analysis, field: "client.custom.annualCapacity", transform: "range" },
}, customFields).analysis.transform, "range");
assert.equal(validateReportStudioConfig({
  ...base,
  analysis: { ...base.analysis, field: "client.custom.renewalDate", transform: "timePeriod" },
}, customFields).analysis.transform, "timePeriod");
assert.throws(() => validateReportStudioConfig({
  ...base,
  analysis: { ...base.analysis, field: "client.custom.accountManager", transform: "range" },
}, customFields), /Range analysis requires a numeric field/);
assert.throws(() => validateReportStudioConfig({
  ...base,
  columns: ["client.custom.portalPassword"],
}, customFields), /Field is not available/);

console.log("Report Studio custom-field checks passed.");

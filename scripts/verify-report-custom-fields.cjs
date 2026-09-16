const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const filename = path.resolve(__dirname, "../lib/report-studio.ts");
const source = fs.readFileSync(filename, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
  fileName: filename,
}).outputText;

const originalLoad = Module._load;
Module._load = function loadReportStudioDependency(request, parent, isMain) {
  if (request === "@/lib/quotationRules") return { QUOTATION_STATUSES: ["Draft", "Accepted"] };
  if (request === "@/lib/annualReturnStatus") return { ANNUAL_RETURN_STATUSES: ["In Progress", "Verified"] };
  return originalLoad.call(this, request, parent, isMain);
};

const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(output, filename);
Module._load = originalLoad;

const {
  buildReportStudioCustomFields,
  createAcceptedTargetStudioConfig,
  reportStudioCustomFieldKey,
  validateReportStudioConfig,
} = loaded.exports;

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

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

function loadTypeScriptModule(relativePath) {
  const filename = path.resolve(__dirname, "..", relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(output, filename);
  return loaded.exports;
}

const {
  annualReturnPrerequisitesComplete,
  annualReturnWorkflowProgressPercent,
} = loadTypeScriptModule("lib/annualReturnStatus.ts");

const progress = (overrides = {}) => annualReturnWorkflowProgressPercent({
  status: "In Progress",
  clientCategory: "Importer",
  invoiceCoveragePercent: 50,
  hasUpload: true,
  uploadRecordCount: 1,
  hasBilling: true,
  hasAcceptedQuotation: false,
  hasSentQuotation: true,
  linkedQuotationCount: 1,
  ...overrides,
});

assert.ok(Math.abs(progress() - 56) < 0.000001, "Partial workflow records should produce partial AR progress");
assert.equal(progress({ status: "Not Required This FY" }), null, "Not Required records must be excluded");
assert.equal(progress({ status: "Not recorded" }), null, "Missing AR records must be excluded");
assert.equal(progress({
  status: "Filed",
  clientCategory: "PWP",
  invoiceCoveragePercent: 100,
  uploadRecordCount: 1,
  hasAcceptedQuotation: false,
  hasSentQuotation: false,
  linkedQuotationCount: 0,
}), 100, "A completed PWP workflow should reach 100%");
assert.equal(progress({
  status: "In Progress",
  clientCategory: "Producer",
  invoiceCoveragePercent: 0,
  hasUpload: false,
  uploadRecordCount: 0,
  hasBilling: false,
  hasAcceptedQuotation: false,
  hasSentQuotation: false,
  linkedQuotationCount: 0,
}), 12.5, "In Progress status should contribute without becoming a binary 0%");

assert.equal(annualReturnPrerequisitesComplete({
  clientCategory: "Importer",
  invoiceCoveragePercent: 100,
  hasUpload: true,
  hasBilling: true,
  hasAcceptedQuotation: false,
}), false, "Importers require an accepted quotation before AR is ready");
assert.equal(annualReturnPrerequisitesComplete({
  clientCategory: "Producer",
  invoiceCoveragePercent: 100,
  hasUpload: true,
  hasBilling: true,
  hasAcceptedQuotation: false,
}), true, "Producers do not require an accepted quotation before AR is ready");

console.log("Report metric checks passed.");

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
  CUSTOM_CLIENT_EXPORT_FIELDS,
  CUSTOM_EXPORT_PRESETS,
  isSafeCustomExportField,
} = loadTypeScriptModule("lib/reports.ts");

assert.equal(isSafeCustomExportField("companyName"), true);
assert.equal(isSafeCustomExportField("otpMobileNumber"), true, "A phone number used for OTP delivery is not itself a secret");
assert.equal(isSafeCustomExportField("cpcbPassword"), false);
assert.equal(isSafeCustomExportField("apiToken"), false);
assert.equal(isSafeCustomExportField("portal credential"), false);

const fieldIds = new Set(CUSTOM_CLIENT_EXPORT_FIELDS.map((field) => field.id));
for (const field of CUSTOM_CLIENT_EXPORT_FIELDS) {
  assert.equal(isSafeCustomExportField(field.id), true, `Sensitive export field exposed: ${field.id}`);
}
for (const preset of CUSTOM_EXPORT_PRESETS) {
  for (const fieldId of preset.config.fields) {
    assert.equal(fieldIds.has(fieldId), true, `Preset ${preset.id} references unknown field ${fieldId}`);
    assert.equal(isSafeCustomExportField(fieldId), true, `Preset ${preset.id} exposes sensitive field ${fieldId}`);
  }
}

console.log("Report export security checks passed.");

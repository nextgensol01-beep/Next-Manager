const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const sources = {
  purchaseInvoices: ['coverageStatus', 'monthsCovered', 'requiredMonths', 'missingMonths', 'yesNo', 'count', 'status', 'latestDate'],
  saleInvoices: ['coverageStatus', 'monthsCovered', 'requiredMonths', 'missingMonths', 'yesNo', 'count', 'status', 'latestDate'],
  annualReturn: ['yesNo', 'status', 'latestDate'],
  purchaseUploads: ['uploadStatus', 'yesNo', 'quantity', 'invoiceCount', 'cat1', 'cat2', 'cat3', 'cat4', 'count'],
  saleUploads: ['uploadStatus', 'yesNo', 'quantity', 'invoiceCount', 'cat1', 'cat2', 'cat3', 'cat4', 'count'],
  uploadedData: ['yesNo', 'quantity', 'invoiceCount', 'count'],
};
const fields = Object.entries(sources).flatMap(([source, displays]) => displays.map(display => ({ key: `${source}_${display}`, label: display, type: 'text', dataLink: { source, display } })));
const rows = {
  Invoice: [
    { clientId: 'A', financialYear: '2025-26', invoiceType: 'purchase', status: 'Received', fromDate: '2025-04-01', toDate: '2025-06-30', createdAt: '2025-07-01', updatedAt: '2025-07-01' },
    { clientId: 'A', financialYear: '2025-26', invoiceType: 'purchase', status: 'Partial / Issue', fromDate: '2025-05-01', toDate: '2025-05-31', createdAt: '2025-06-01', updatedAt: '2025-08-01' },
    { clientId: 'A', financialYear: '2025-26', invoiceType: 'sale', status: 'Nil / No Invoice', fromDate: '2025-04-01', toDate: '2026-03-31', createdAt: '2026-04-01' },
    { clientId: 'B', financialYear: '2025-26', invoiceType: 'sale', fromDate: '2025-04-01', toDate: '2025-04-30', createdAt: '2025-05-01' },
    { clientId: 'A', financialYear: '2024-25', invoiceType: 'purchase', status: 'Received', fromDate: '2024-04-01', toDate: '2025-03-31', updatedAt: '2025-04-01' },
  ],
  AnnualReturn: [
    { clientId: 'A', financialYear: '2025-26', status: 'Filed', filingDate: '2026-08-01', updatedAt: '2026-08-01' },
    { clientId: 'A', financialYear: '2025-26', status: 'Verified', filingDate: '2026-08-02', updatedAt: '2026-08-02' },
    { clientId: 'B', financialYear: '2024-25', status: 'Pending', filingDate: 'invalid', updatedAt: '2025-01-01' },
  ],
  UploadRecord: [
    { clientId: 'A', financialYear: '2025-26', uploadType: 'purchase', cat1: 0.1, cat2: 2, cat3: 3, cat4: 4, invoiceCount: 2 },
    { clientId: 'A', financialYear: '2025-26', uploadType: 'purchase', cat1: 0.2, cat2: '5', cat3: '', cat4: 0, invoiceCount: '3' },
    { clientId: 'A', financialYear: '2025-26', uploadType: 'sale', cat1: 9, cat2: 1, invoiceCount: 4 },
    { clientId: 'B', financialYear: '2024-25', uploadType: 'sale', cat1: 7, invoiceCount: 1 },
  ],
};
const stubs = Object.fromEntries(Object.entries(rows).map(([model, records]) => [`@/models/${model}`, {
  find(query) {
    let selected;
    let result = records.filter(row => query.clientId.$in.includes(row.clientId) && (!query.financialYear || row.financialYear === query.financialYear));
    return {
      select(keys) { selected = keys.split(' '); return this; },
      sort(order) { result = [...result].sort((a, b) => { for (const [key, direction] of Object.entries(order)) {
        const difference = String(a[key] || '').localeCompare(String(b[key] || '')); if (difference) return difference * direction;
      } return 0; }); return this; },
      lean() { return Promise.resolve(result.map(row => selected ? Object.fromEntries(selected.filter(key => key in row).map(key => [key, row[key]])) : structuredClone(row))); },
    };
  },
}]));
const loaded = new Map();
function load(relative) {
  const filename = path.join(root, relative);
  if (loaded.has(filename)) return loaded.get(filename).exports;
  const module = new Module(filename); module.filename = filename;
  module.paths = Module._nodeModulePaths(path.dirname(filename)); loaded.set(filename, module);
  const originalRequire = module.require.bind(module);
  module.require = name => name in stubs ? stubs[name] : name.startsWith('@/') ? load(`${name.slice(2)}.ts`) : originalRequire(name);
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
  return module.exports;
}
async function main() {
  const { resolveTrackerLinkedValues } = load('lib/server/tracker-linked-data.ts');
  const actual = {};
  for (const financialYear of ['2025-26', '2024-25', undefined]) {
    actual[financialYear || 'all'] = Object.fromEntries(await resolveTrackerLinkedValues(fields, ['A', 'B', 'Empty'], financialYear));
  }
  const baseline = path.join(__dirname, 'fixtures/tracker-linked-baseline.json');
  assert.deepEqual(actual, JSON.parse(fs.readFileSync(baseline, 'utf8')));
  assert.equal(actual['2025-26'].A.purchaseInvoices_monthsCovered, 'Apr, Jun', 'Updated status must override older overlapping month coverage');
  assert.equal(actual['2025-26'].A.annualReturn_status, 'Verified');
  assert.equal(actual.all.A.purchaseInvoices_coverageStatus, 'Unknown');
  assert.equal(actual['2025-26'].Empty.purchaseUploads_quantity, 0);
  assert.equal(actual['2025-26'].B.saleInvoices_yesNo, false, 'Preserve the legacy yes/no semantics separately from missing-status coverage');
  assert.deepEqual(Object.fromEntries(await resolveTrackerLinkedValues([], ['A'], '2025-26')), {});
  rows.UploadRecord[0].cat1 = 12;
  const fresh = await resolveTrackerLinkedValues(fields, ['A'], '2025-26');
  assert.equal(fresh.get('A').purchaseUploads_cat1, 12.2, 'No persisted cache of live calculations');
  console.log('PASS: every live column display matches baseline across financial-year scopes, overlapping status updates, missing data, upload totals, and fresh source changes');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

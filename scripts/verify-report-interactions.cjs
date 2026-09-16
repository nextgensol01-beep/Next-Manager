const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../lib/report-studio-view.ts');
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { rankReportRows, chartRowAt, targetProgress, reportConfigKey, withoutFilter } = loaded.exports;

// Alphabetical source order differs from ranked chart order. A clicked point
// must still open the client the user can see, including a point beyond index 0.
const rows = [4, 90, 23].map((amount, index) => ({ id: String(index), values: { amount }, clientIds: [String(index)] }));
const ranked = rankReportRows(rows, 'amount');
assert.equal(chartRowAt(rows, ranked, 0).id, '1');
assert.equal(chartRowAt(rows, ranked, '1').id, '2');
for (const invalid of [null, undefined, '', -1, 3, 0.5, 'invalid']) assert.equal(chartRowAt(rows, ranked, invalid), undefined);
assert.deepEqual(rows.map((row) => row.id), ['0', '1', '2'], 'Ranking must not reorder the shared report rows');
assert.equal(targetProgress(0, 0), null);
assert.equal(targetProgress(undefined, 50), null);
assert.equal(targetProgress(100, undefined), null);
assert.equal(targetProgress(100, 125), 125, 'Overachievement is a real value, even if its visual track is capped');
const config = { financialYear: '2025-26', columns: ['client', 'amount'], filters: { logic: 'and', children: [] } };
assert.equal(reportConfigKey(config), reportConfigKey({ ...config, search: '' }));
assert.equal(reportConfigKey(config), reportConfigKey({ filters: config.filters, columns: config.columns, financialYear: config.financialYear }));
assert.notEqual(reportConfigKey(config), reportConfigKey({ ...config, search: 'A client' }));
assert.notEqual(reportConfigKey(config), reportConfigKey({ ...config, financialYear: '2026-27' }));
const filter = { id: 'root', kind: 'group', logic: 'and', children: [{ id: 'any', kind: 'group', logic: 'or', children: [{ id: 'one', kind: 'condition' }, { id: 'two', kind: 'condition' }] }, { id: 'three', kind: 'condition' }] };
assert.equal(withoutFilter(filter, 'one').children[0].logic, 'or');
assert.equal(withoutFilter(filter, 'one').children[0].children[0].id, 'two');
assert.equal(withoutFilter(withoutFilter(filter, 'one'), 'two').children[0].id, 'three');
assert.equal(filter.children[0].children.length, 2, 'Removing a chip must not mutate the applied report snapshot');
console.log('Report interaction regression checks passed.');

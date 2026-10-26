/* Deterministic production calculation tests. No database/network or writes. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), cache = new Map();
function load(file) {
  const filename = path.join(root, file); if (cache.has(filename)) return cache.get(filename).exports;
  const module = new Module(filename); module.filename = filename; module.paths = Module._nodeModulePaths(path.dirname(filename)); cache.set(filename, module);
  const original = module.require.bind(module);
  module.require = name => name.startsWith('@/') ? load(name.slice(2) + '.ts') : original(name);
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  return module.exports;
}
const { calculateTargetCoverage: calculate, sumQuantities, coveragePercentageText: percent, targetTrackingProvenance } = load('lib/financial-year-coverage.ts');
const { financialYearSavedSnapshot } = load('lib/financial-year-form.ts');
const entry = (categoryId, type, value) => ({ categoryId, type, value });
const make = (rT, eT, rA, eA) => ({ clientId: 'TEST', financialYear: '2025-26',
  targets: [entry('2', 'RECYCLING', rT), entry('2', 'EOL', eT)], achievedByType: [entry('2', 'RECYCLING', rA), entry('2', 'EOL', eA)] });
const checks = [];
function test(name, run) { run(); checks.push(name); console.log('PASS: ' + name); }
test('A: exact Bansal example caps each type, preserves 200 MT, shows 60.5% and 17 MT pending', () => {
  const source = make(17, 26, 0, 200), original = structuredClone(source), result = calculate(source);
  assert.equal(result.target, 43); assert.equal(result.covered, 26); assert.equal(result.pending, 17); assert.equal(result.recorded, 200); assert.equal(result.excess, 174);
  assert.equal(percent(result.percentage), '60.5%'); assert.equal(result.status, 'Partially achieved');
  assert.equal(result.buckets.find(b => b.categoryId === '2' && b.type === 'RECYCLING').pending, 17);
  assert.equal(result.buckets.find(b => b.categoryId === '2' && b.type === 'EOL').percentage, 100);
  assert.deepEqual(source, original);
});
for (const [name, values, expected, pending, status] of [
  ['B exact', [20, 10, 20, 10], 100, 0, 'Fully achieved'], ['C partial', [20, 10, 10, 5], 50, 15, 'Partially achieved'],
  ['D both excess', [20, 10, 30, 15], 100, 0, 'Fully achieved'], ['E shortfall plus excess', [20, 10, 5, 100], 50, 15, 'Partially achieved'],
  ['not started', [20, 10, 0, 0], 0, 30, 'Not started'],
]) test(name, () => { const r = calculate(make(...values)); assert.equal(r.percentage, expected); assert.equal(r.pending, pending); assert.equal(r.status, status); });
test('F: explicit zero target is No target with no percentage; zero-target recorded quantity is retained', () => {
  const zero = calculate(make(0, 0, 0, 0)), recorded = calculate(make(0, 0, 50, 0));
  assert.equal(zero.status, 'No target'); assert.equal(zero.percentage, null); assert.equal(zero.covered, 0);
  assert.equal(recorded.status, 'No target'); assert.equal(recorded.recorded, 50); assert.equal(recorded.covered, 0); assert.equal(recorded.percentage, null);
});
test('G: category and type caps prevent cross-category masking for CAT-I–IV', () => {
  for (const id of ['1','2','3','4']) {
    const source = { clientId: 'TEST', financialYear: '2024-25', targets: [entry(id,'RECYCLING',10),entry(id,'EOL',10)], achievedByType: [entry(id,'RECYCLING',0),entry(id,'EOL',100)] };
    assert.equal(calculate(source).percentage, 50);
  }
  const source = { clientId: 'TEST', financialYear: '2024-25', targets: [entry('1','RECYCLING',10),entry('2','EOL',20),entry('3','RECYCLING',30)], achievedByType: [entry('1','RECYCLING',100),entry('2','EOL',0),entry('3','RECYCLING',15)] };
  const r = calculate(source); assert.equal(r.covered,25); assert.equal(r.target,60); assert.equal(r.pending,35); assert.equal(r.recorded,115);
});
test('H: legacy category achievement remains unallocated and never duplicated or proportionally split', () => {
  const source = { ...make(17,26,0,0), achievedByType: [], achievedCat2:50 };
  const r = calculate(source); assert.equal(r.status,'Needs verification'); assert.equal(r.percentage,null); assert.equal(r.covered,null); assert.equal(r.recorded,50);
  assert(r.categories.find(c=>c.categoryId==='2').buckets.every(b=>b.recorded===null));
  const legacy = {clientId:'TEST',financialYear:'2023-24',cat1Target:0,cat2Target:43,cat3Target:0,cat4Target:0,achievedByType:[]};
  const l = calculate(legacy); assert.equal(l.target,43); assert.equal(l.percentage,null); assert.equal(l.categories[1].target,43);
});
test('Missing targets remain different from confirmed zero, including API compatibility provenance', () => {
  const missing = { clientId:'TEST',financialYear:'2025-26',achievedByType:[] };
  assert.equal(calculate(missing).target,null); assert.equal(calculate(missing).status,'Needs verification');
  const legacy = { clientId:'TEST',financialYear:'2025-26',cat2Target:43 };
  const metadata = targetTrackingProvenance(legacy);
  const adapted = { ...legacy,cat1Target:0,cat3Target:0,cat4Target:0,targets:[entry('2','RECYCLING',43)],targetTracking:metadata,achievedByType:[] };
  assert.equal(calculate(adapted).target,null); assert.equal(calculate(adapted).percentage,null);
});
test('Invalid negatives, nonnumeric values, unsupported categories/types and duplicate buckets cannot certify completion', () => {
  for (const bad of [entry('2','EOL',-1),entry('2','EOL',NaN),entry('2','EOL',Infinity),entry('2','EOL','200'),entry('5','EOL',100),entry('2','UNKNOWN',100),null]) {
    const source=make(17,26,0,200);source.targets.push(bad);const r=calculate(source);assert.equal(r.percentage,null);assert.equal(r.status,'Needs verification');
  }
  for(const field of ['targets','achievedByType']) {const source=make(17,26,0,200);source[field].push({...source[field][1]});assert.equal(calculate(source).percentage,null);}
  const ledgerInvalid=make(17,26,17,26);ledgerInvalid.targetTracking={source:'typed',issues:[],usageIssues:['Invalid ledger']};assert.equal(calculate(ledgerInvalid).percentage,null);
});
test('Client/FY boundaries reject mismatches; historical/current years never carry credits implicitly', () => {
  const source=make(17,26,0,200);for(const scope of [{clientId:'OTHER',financialYear:'2025-26'},{clientId:'TEST',financialYear:'2024-25'}])assert.equal(calculate(source,scope).percentage,null);
  for(const fy of ['2023-24','2024-25','2025-26','2026-27']) assert.equal(calculate({...source,financialYear:fy},{clientId:'TEST',financialYear:fy}).pending,17);
});
test('Decimal quantities aggregate before display; tiny pending requirements never round to a completed status', () => {
  assert.equal(sumQuantities([.1,.2]),.3);assert.equal(sumQuantities([17.125,25.375]),42.5);assert.equal(sumQuantities([1e-8,2e-8]),3e-8);
  const r=calculate(make(17.125,25.375,8.5625,12.6875));assert.equal(r.target,42.5);assert.equal(r.covered,21.25);assert.equal(r.percentage,50);
  const tiny=calculate(make(1,0,.999999999,0));assert.equal(tiny.status,'Partially achieved');assert(tiny.pending>0);assert.equal(percent(tiny.percentage),'99.9%');
});
test('Save fallback reconciles edited targets and preserved ledger data without mutating either record', () => {
  const previous={...make(17,26,0,200),_id:'FY',cat2Target:43,achievedCat2:200,totalAchieved:200,targetTracking:{source:'typed',issues:[]}};
  const original=structuredClone(previous),stored={clientId:'TEST',financialYear:'2025-26',_id:'FY',targets:[entry('2','RECYCLING',20),entry('2','EOL',30)]};
  const saved=financialYearSavedSnapshot(stored,previous),r=calculate(saved);assert.equal(r.target,50);assert.equal(r.covered,30);assert.equal(r.pending,20);assert.equal(r.recorded,200);assert.deepEqual(previous,original);
});
test('I: PWP stored generation/sold data is preserved by snapshot; no PIBO target coverage is inferred from generated credits', () => {
  const previous={clientId:'PWP',financialYear:'2025-26',generated:[entry('2','EOL',200)],soldByType:[entry('2','EOL',50)],totalSold:50,soldCat2:50};
  const before=structuredClone(previous),stored={...previous,generated:[entry('2','EOL',210)]};const saved=financialYearSavedSnapshot(stored,previous);
  assert.equal(saved.totalGenerated,210);assert.equal(saved.totalSold,50);assert.equal(saved.totalRemaining,160);assert.deepEqual(saved.soldByType,previous.soldByType);assert.deepEqual(previous,before);
});
const outputArg=process.argv.indexOf('--output');if(outputArg>=0)fs.writeFileSync(path.resolve(process.argv[outputArg+1]),JSON.stringify({passed:true,checks},null,2));
console.log(`Passed ${checks.length} target coverage groups.`);

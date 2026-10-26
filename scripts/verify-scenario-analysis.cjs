// Actual read-only route, selection, renderer and draft validation; no live services.
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const createLoader = require('./search-test-loader.cjs');
const load = createLoader();
const { analyzeScenarioClient, summarizeScenarioAnalysis } = load('lib/tracker-scenario-analysis.ts');
const { createTrackerEmailContext } = load('lib/tracker-email-context.ts');
const { renderTrackerEmail } = load('lib/tracker-email-renderer.ts');
const { cleanTrackerEmailWorkflows } = load('lib/server/tracker-email-workflows.ts');
const { emailScenarioIssues, validateEmailWorkflowDrafts } = load('lib/tracker-email-validation.ts');
const { changeEmailConditionField } = load('lib/tracker-email-condition-draft.ts');
const { updateDraftRule, moveDraftRule, removeDraftRule, restoreDraftRule, snapshotDraftRule } = load('lib/tracker-email-draft-rules.ts');
const { buildEmailCombinationPreviews } = load('lib/tracker-email-combinations.ts');
const fields = [{ key: 'ready', label: 'Upload', type: 'toggle', dataLink: { source: 'annualReturn', display: 'yesNo' } }, { key: 'stage', label: 'Stage', type: 'status', options: ['Pending', 'Done'] }, { key: 'amount', label: 'Amount', type: 'number' }, { key: 'cost', label: 'Cost', type: 'number' }, { key: 'remaining', label: 'Remaining', type: 'number', computed: { kind: 'difference', primaryFieldKey: 'amount', secondaryFieldKey: 'cost' } }];
const group = (...conditions) => ({ mode: 'ALL', conditions });
const yes = { fieldKey: 'ready', operator: 'equals', value: 'Yes' };
const category = value => ({ fieldKey: 'client.category', operator: 'equals', value });
const rule = (id, conditionGroup, order, action = 'include') => ({ id, name: id + ' name', type: 'combination', order, action, content: '<p><strong>Draft {{client.companyName}}</strong> {{client.clientId}} FY {{tracker.financialYear}} {{column.remaining}}</p>', conditionGroup });
const base = { id: 'workflow', name: 'Real clients', mainFieldKey: 'ready', mainValue: 'Yes', conditionGroup: group(yes), subject: 'Draft {{client.companyName}}', body: '{{combinationMessage}}', points: [], contentMode: 'combinations', contentRules: [rule('general', group(yes), 0), rule('brand', group(category('Brand Owner')), 1), rule('exclude', group(category('Importer')), 2, 'skip')] };
const categories = ['Producer', 'Importer', 'Brand Owner', 'PWP'];
const context = (cat = 'Brand Owner', options = {}) => createTrackerEmailContext({ entry: { _id: 'entry', clientId: 'A' }, client: { clientId: 'A', companyName: 'Example & Sons', category: cat, state: 'Delhi' }, fields, values: { ready: true, remaining: 7 }, financialYear: '2025-26', trackerName: 'Fixture', workflowName: base.name, ...options });
for (const cat of categories) {
  const draft = { ...base, contentRules: [rule('one', group(category(cat), yes), 0)] };
  const row = analyzeScenarioClient(draft, context(cat), true); assert.equal(row.decision, 'send'); assert.deepEqual(row.selection.selectedScenarioIds, ['one']); assert(row.message.body.includes('Example & Sons')); assert(row.message.body.includes('2025-26')); assert.deepEqual(row.issues, []);
}
assert.equal(analyzeScenarioClient(base, context()).selection.selectedScenarioIds[0], 'general');
assert.deepEqual(analyzeScenarioClient(base, context()).selection.ignoredScenarioIds, ['brand']);
let combined = analyzeScenarioClient({ ...base, combinationMatchingMode: 'combine' }, context('Importer'));
assert.equal(combined.decision, 'excluded'); assert(combined.reason.includes('Exclude rule blocks')); assert.deepEqual(combined.selection.selectedScenarioIds, ['general', 'exclude']);
assert.equal(analyzeScenarioClient(base, context('Importer')).decision, 'send', 'A later exclusion is bypassed in legacy First mode');
let reordered = { ...base, ...moveDraftRule(base, 'brand', -1) };
assert.deepEqual(analyzeScenarioClient(reordered, context()).selection.selectedScenarioIds, ['brand']);
assert(reordered.contentRules.find(r => r.id === 'general').content.includes('<strong>'));
const named = { ...base, ...updateDraftRule(base, 'brand', { name: 'Brand Owner Migration' }) };
const snapshot = snapshotDraftRule(named.contentRules, 'brand');
const undone = { ...named, ...restoreDraftRule({ ...named, ...removeDraftRule(named, 'brand') }, snapshot) };
assert.equal(undone.contentRules.find(r => r.id === 'brand').name, 'Brand Owner Migration');
assert.equal(cleanTrackerEmailWorkflows([undone], fields)[0].contentRules.find(r => r.id === 'brand').name, 'Brand Owner Migration');
assert.equal(analyzeScenarioClient({ ...base, contentRules: [rule('none', group(category('SIMP')), 0)] }, context()).decision, 'no_match');
assert.equal(analyzeScenarioClient(base, context('Brand Owner', { values: { ready: false } })).decision, 'outside_rule');
assert.equal(analyzeScenarioClient({ ...base, contentRules: [rule('any', { mode: 'ANY', conditions: [category('PWP'), yes] }, 0)] }, context()).decision, 'send');
const unresolved = analyzeScenarioClient(base, context('Brand Owner', { client: { clientId: 'A', category: 'Brand Owner' } }));
assert.equal(unresolved.decision, 'send'); assert(unresolved.issues.length); assert.equal(summarizeScenarioAnalysis(base, [unresolved], 1, 2000).counts.invalid, 1);
for (const type of ['point', 'statement']) {
  const draft = { ...base, contentMode: type === 'point' ? 'points' : 'statements', contentRules: [0, 1].map(i => ({ ...rule('part' + i, group(yes), i), type })) };
  const row = analyzeScenarioClient(draft, context(), true); assert.equal(row.selectedRuleIds.length, 2); assert.equal(row.selection.selectedScenarioIds.length, 0);
}
assert.equal(emailScenarioIssues(rule('incomplete', group({ ...yes, fieldKey: '' }), 0), fields)[0].status, 'Incomplete');
assert.equal(emailScenarioIssues(rule('invalid', group({ ...yes, fieldKey: 'deleted' }), 0), fields)[0].status, 'Invalid');
assert(emailScenarioIssues({ ...base.contentRules[0], content: '' }, fields).some(issue => issue.status === 'Incomplete'));
assert.equal(emailScenarioIssues({ ...base.contentRules[0], action: 'skip', content: '' }, fields).length, 0);
assert.equal(validateEmailWorkflowDrafts([{ ...base, contentRules: [rule('future', group(category('SIMP')), 0)] }], fields), null, 'Zero matches is valid');
assert.equal(changeEmailConditionField(yes, { key: 'client.category', label: 'Category', type: 'select', options: categories }).value, '');
assert.equal(changeEmailConditionField({ fieldKey: 'old', operator: 'equals', value: 'Done' }, fields[1]).value, 'Done');
assert.equal(emailScenarioIssues(rule('rename', group({ fieldKey: 'stage', operator: 'equals', value: 'Done' }), 0), fields.map(field => ({ ...field, label: 'Renamed' }))).length, 0);
const synthetic = buildEmailCombinationPreviews({ ...base, contentRules: Array.from({ length: 17 }, (_, i) => rule('synthetic' + i, group({ fieldKey: 'stage', operator: 'equals', value: 'Value' + i }), i)) }, fields);
assert(synthetic.limited); assert.equal(synthetic.previews.length, 32);

let session = { user: { role: 'admin' } }, archived = false, size = 222;
const objectId = i => (i + 1).toString(16).padStart(24, '0');
const entries = () => Array.from({ length: size }, (_, i) => ({ _id: objectId(i), clientId: 'CLIENT' + i, values: { ready: false, stage: 'Done', amount: 10, cost: 3 } }));
const projection = [], batchSizes = [];
const chain = data => ({ select(value) { projection.push(value); return this; }, sort() { return this; }, limit(value) { this.bound = value; return this; }, lean: async function () { return (typeof data === 'function' ? data() : data).slice?.(0, this.bound) || data; } });
const getRows = query => entries().filter(row => !query._id || row._id === query._id);
const mocks = {
  'next-auth': { getServerSession: async () => session }, '@/lib/auth': { authOptions: {} }, '@/lib/authUsers': { isAdminSession: async () => session?.user.role === 'admin' }, '@/lib/mongoose': { connectDB: async () => {} },
  '@/models/ClientTracker': { findById: () => chain({ name: 'Fixture', status: archived ? 'archived' : 'active', fields, financialYear: '2025-26', emailWorkflows: [{ ...base, body: 'OLD SAVED BODY' }] }) },
  '@/models/ClientTrackerEntry': { countDocuments: async query => { assert.deepEqual(query.inScope, { $ne: false }); return getRows(query).length; }, find: query => { assert.equal(query.trackerId, 'tracker'); assert.deepEqual(query.inScope, { $ne: false }); return chain(() => getRows(query)); } },
  '@/models/Client': { find: query => chain(query.clientId.$in.map(id => ({ clientId: id, companyName: id + ' & Company', category: categories[Number(id.slice(6)) % 4], state: 'Delhi' }))) },
  '@/models/EmailLog': { aggregate: async pipeline => pipeline[0].$match.clientId.$in.map(id => ({ _id: id, status: 'sent', communicationStatus: 'replied' })) },
  '@/lib/server/tracker-linked-data': { resolveTrackerLinkedValues: async (_fields, ids, year) => { assert.equal(year, '2025-26'); batchSizes.push(ids.length); return new Map(ids.map(id => [id, { ready: true }])); } },
};
const route = createLoader(mocks)('app/api/client-trackers/[id]/email/scenario-preview/route.ts');
async function request(workflow = base, extra = {}) {
  const response = await route.POST(new NextRequest('http://fixture.invalid/preview', { method: 'POST', body: JSON.stringify({ workflow, ...extra }), headers: { 'Content-Type': 'application/json' } }), { params: Promise.resolve({ id: 'tracker' }) });
  return { status: response.status, data: await response.json() };
}
async function main() {
  let result = await request(); assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.total, 222); assert.equal(result.data.evaluated, 222); assert(result.data.complete); assert.equal(result.data.counts.matched, 222); assert.equal(result.data.counts.overlapping, 111); assert.equal(result.data.clients[221].clientId, 'CLIENT221'); assert(result.data.clients.every(row => !row.message));
  for (const scenario of result.data.scenarios) assert.equal(scenario.matched, result.data.clients.filter(row => row.matchedRuleIds.includes(scenario.id)).length);
  const detail = await request(base, { entryId: objectId(2) }); assert.equal(detail.status, 200); assert(detail.data.clients[0].message.body.includes('Draft CLIENT2 & Company')); assert(detail.data.clients[0].message.body.includes('7')); assert(!detail.data.clients[0].message.body.includes('OLD SAVED BODY'));
  const expected = renderTrackerEmail(base, createTrackerEmailContext({ entry: { _id: objectId(2), clientId: 'CLIENT2' }, client: { clientId: 'CLIENT2', companyName: 'CLIENT2 & Company', category: 'Brand Owner', state: 'Delhi' }, values: { ready: true, stage: 'Done', amount: 10, cost: 3, remaining: 7 }, fields, financialYear: '2025-26', trackerName: 'Fixture', workflowName: base.name }));
  assert.deepEqual(detail.data.clients[0].selection, expected.selection); assert.equal(detail.data.clients[0].message.html, expected.html, 'Preview and preparation renderer produce the same message');
  result = await request({ ...base, combinationMatchingMode: 'combine' }); assert.equal(result.data.counts.excluded, 56); assert.equal(result.data.counts.send, 166);
  result = await request({ ...base, contentRules: [rule('status', group({ fieldKey: 'client.communicationStatus', operator: 'equals', value: 'Replied' }), 0)] }); assert.equal(result.data.counts.send, 222);
  size = 2101; result = await request(); assert.equal(result.data.evaluated, 2000); assert.equal(result.data.total, 2101); assert.equal(result.data.complete, false); assert(batchSizes.every(count => count <= 250));
  const originalNow = Date.now, firstBatch = batchSizes.length;
  try {
    Date.now = () => originalNow() + (batchSizes.length > firstBatch ? 46001 : 0);
    result = await request(); assert.equal(result.data.evaluated, 250); assert.equal(result.data.complete, false, 'The time budget returns explicitly partial coverage after a bounded batch');
  } finally { Date.now = originalNow; }
  assert.equal((await request(base, { entryId: objectId(9999) })).status, 404);
  assert.equal((await request({ ...base, contentRules: [rule('bad', group({ ...yes, fieldKey: 'deleted' }), 0)] })).status, 400);
  archived = true; assert.equal((await request()).status, 409); archived = false;
  session = null; assert.equal((await request()).status, 401); session = { user: { role: 'user' } }; assert.equal((await request()).status, 403);
  assert(projection.every(value => !/emails|contacts|documents|attachments/.test(value)));
  console.log('PASS: real-client draft analysis, 222-client full scope beyond table page, 2000-client/time bounds, per-rule totals, categories, ALL/ANY, legacy first/combine/exclusion, priority/names/Undo, typed condition drafts/validation, computed/linked/status values, isolated rendering parity, and read-only authorization. No Gmail, writes or attachments.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

// Actual PATCH handler with a hydrated Mongoose tracker; no database or transport.
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const createLoader = require('./search-test-loader.cjs');
const load = createLoader();
const Tracker = load('models/ClientTracker.ts').default;
const { validateEmailWorkflowDrafts } = load('lib/tracker-email-validation.ts');
const { cleanTrackerEmailWorkflows } = load('lib/server/tracker-email-workflows.ts');
const { emailConditionFields, createTrackerEmailContext } = load('lib/tracker-email-context.ts');
const { renderTrackerEmail } = load('lib/tracker-email-renderer.ts');
const fields = [
  { key: 'mail', label: 'Mail to be sent', type: 'toggle' },
  { key: 'stage', label: 'Stage', type: 'select', options: ['Pending', 'Done'] },
  { key: 'amount', label: 'Amount', type: 'number' },
];
const group = (...conditions) => ({ mode: 'ALL', conditions });
const yes = { fieldKey: 'mail', operator: 'equals', value: 'Yes' };
const workflow = {
  id: 'workflow', name: 'Save regression', mainFieldKey: 'mail', mainValue: 'Yes',
  subject: 'Hello {{client.companyName}}', body: '<p>{{combinationMessage}}</p>', points: [], contentMode: 'combinations',
  conditionGroup: group(yes),
  contentRules: [{ id: 'brand', type: 'combination', action: 'include', order: 0,
    conditionGroup: group(yes, { fieldKey: 'client.category', operator: 'equals', value: 'Brand Owner' }, { fieldKey: 'stage', operator: 'equals', value: 'Done' }),
    content: '<p><strong>{{client.companyName}}</strong> FY {{tracker.financialYear}}</p>' }],
  attachments: [{ id: 'attachment', source: 'client_latest', category: 'certificates', financialYear: 'tracker', conditionGroup: group(yes) }],
};
const tracker = Tracker.hydrate({ _id: '507f1f77bcf86cd799439011', name: 'Save fixture', status: 'active', financialYear: '2025-26', fields, clientMembershipMode: 'snapshot', clientScope: 'all', emailWorkflows: [] });
let session = { user: { email: 'fixture@example.invalid', role: 'admin' } }, writes = 0;
const route = createLoader({
  'next-auth': { getServerSession: async () => session }, '@/lib/auth': { authOptions: {} },
  '@/lib/authUsers': { isAdminSession: async () => session?.user?.role === 'admin' },
  '@/lib/mongoose': { connectDB: async () => {} },
  '@/models/ClientTracker': {
    findById: async () => tracker,
    findByIdAndUpdate: async (_id, update) => { writes++; tracker.set(update.$set); return tracker; },
  },
  '@/lib/server/activity-events': { recordActivityEvent: async () => {} },
})('app/api/client-trackers/[id]/route.ts');
async function save(workflows) {
  const response = await route.PATCH(new NextRequest('http://fixture.invalid/api/client-trackers/' + tracker.id, {
    method: 'PATCH', body: JSON.stringify({ emailEnabled: true, emailWorkflows: workflows }),
    headers: { 'Content-Type': 'application/json' },
  }), { params: Promise.resolve({ id: tracker.id }) });
  return { status: response.status, result: await response.json() };
}
async function main() {
  assert.equal(validateEmailWorkflowDrafts([workflow], fields), null, 'The browser accepts the configured workflow');
  let saved = await save([workflow]);
  assert.equal(saved.status, 200, 'The actual save route must also accept hydrated tracker columns: ' + JSON.stringify(saved.result));
  assert.deepEqual(emailConditionFields(tracker.fields), emailConditionFields(tracker.toObject({ minimize: false }).fields), 'Hydrated and plain columns produce the same registry, without database internals');
  assert.equal(validateEmailWorkflowDrafts([workflow], tracker.fields), null);
  const expected = cleanTrackerEmailWorkflows([workflow], fields);
  assert.deepEqual(saved.result.emailWorkflows, JSON.parse(JSON.stringify(expected)));
  assert.deepEqual(cleanTrackerEmailWorkflows(saved.result.emailWorkflows, tracker.fields), expected, 'Save/reopen/save is stable');
  const context = createTrackerEmailContext({ entry: { clientId: 'BO' }, client: { clientId: 'BO', companyName: 'Brand & Sons', category: 'Brand Owner' }, fields: tracker.fields, values: { mail: true, stage: 'Done' }, financialYear: '2025-26', trackerName: tracker.name, workflowName: workflow.name });
  const rendered = renderTrackerEmail(saved.result.emailWorkflows[0], context);
  assert.deepEqual(rendered.selection.selectedScenarioIds, ['brand']); assert.deepEqual(rendered.unresolvedVariables, []); assert(rendered.body.includes('Brand & Sons')); assert(rendered.body.includes('2025-26'));
  for (const style of ['points', 'statements', 'combinations']) {
    const legacy = { ...workflow, id: 'legacy', conditionGroup: undefined, contentMode: style, contentRules: [], points: [{ id: 'old', fieldKey: 'mail', value: 'Yes', statement: '<strong>Preserved legacy message</strong>' }] };
    saved = await save([legacy]); assert.equal(saved.status, 200, style); assert.equal(saved.result.emailWorkflows[0].combinationMatchingMode, undefined); assert.equal(saved.result.emailWorkflows[0].points.length, 1);
  }
  const writesBeforeInvalid = writes;
  for (const condition of [{ fieldKey: 'removed', operator: 'equals', value: 'Yes' }, { fieldKey: 'stage', operator: 'equals', value: 'Deleted option' }, { fieldKey: 'amount', operator: 'contains', value: '10' }]) {
    const invalid = { ...workflow, contentRules: [{ ...workflow.contentRules[0], conditionGroup: group(condition) }] };
    assert.equal((await save([invalid])).status, 400);
  }
  assert.equal(writes, writesBeforeInvalid, 'Rejected conditions cannot mutate the tracker');
  session = null; assert.equal((await save([workflow])).status, 401);
  session = { user: { role: 'user' } }; assert.equal((await save([workflow])).status, 403);
  console.log('PASS: actual workflow PATCH with hydrated tracker columns, shared registry parity, save/reopen, legacy styles, Brand Owner matching/variables, rejected invalid conditions and authorization. No database or emails.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

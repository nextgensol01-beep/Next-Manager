/* Shared engine and actual preparation route. All data and transports are fixtures. */
const assert = require('node:assert/strict');
const createLoader = require('./search-test-loader.cjs');
const { NextRequest } = require('next/server');
const load = createLoader();
const engine = load('lib/tracker-email-context.ts');
const { renderTrackerEmail, emailEditorVariables } = load('lib/tracker-email-renderer.ts');
const { cleanTrackerEmailWorkflows } = load('lib/server/tracker-email-workflows.ts');
const { buildEmailCombinationPreviews } = load('lib/tracker-email-combinations.ts');
const { canonicalDeliveryBatch, trackerDeliverySchema } = load('lib/email-delivery-security.ts');
const copy = value => structuredClone(value);
const fields = [
  { key: 'mail', label: 'Mail to be sent', type: 'toggle' },
  { key: 'sale', label: 'Sale Upload', type: 'toggle' },
  { key: 'stage', label: 'Migration Status', type: 'status', options: ['Pending', 'Done'] },
  { key: 'note', label: 'Note', type: 'text' }, { key: 'amount', label: 'Amount', type: 'number' },
  { key: 'due', label: 'Due date', type: 'date' },
  { key: 'tags', label: 'Required documents', type: 'multiSelect', options: ['Purchase', 'Sale', 'Certificate'] },
  { key: 'hyphen_key-1', label: 'Extra', type: 'text' },
];
const yes = { fieldKey: 'mail', operator: 'equals', value: 'Yes' };
const group = (...conditions) => ({ mode: 'ALL', conditions });
const scenario = (id, conditions, content = 'Dear {{client.companyName}}, {{client.clientId}} {{client.category}} FY {{tracker.financialYear}} {{column.hyphen_key-1}}', order = 0) => ({ id, type: 'combination', action: 'include', order, conditionGroup: group(...conditions), content });
const base = { id: 'workflow', name: 'Migration', mainFieldKey: 'mail', mainValue: 'Yes', conditionGroup: group(yes), subject: 'Hello {{client.companyName}} · {{tracker.financialYear}}', body: '<p>{{combinationMessage}}</p>', points: [], contentMode: 'combinations',
  reminderSubject: 'Reminder {{client.companyName}} {{client.clientId}}', reminderBody: '<strong>{{combinationMessage}}</strong> {{financialYear}}' };
const values = { mail: true, sale: false, stage: 'Done', note: 'Awaiting DOCUMENTS', amount: 10, due: '2026-10-22', tags: ['Purchase', 'Certificate'], 'hyphen_key-1': 'EXTRA' };
const context = (category = 'Brand Owner', overrides = {}) => engine.createTrackerEmailContext({ entry: { clientId: 'BO', _id: 'entry-BO' }, client: { clientId: 'BO', companyName: 'Shared & Sons', category, state: 'Delhi', gstNumber: 'GST' }, values, fields, financialYear: '2025-26', trackerName: 'Migration tracker', workflowName: 'Migration', ...overrides });
let checks = 0;
function check(condition, expected, ctx = context()) { assert.equal(engine.evaluateEmailCondition(condition, ctx), expected, JSON.stringify(condition)); checks++; }
for (const category of ['Producer', 'Importer', 'Brand Owner', 'PWP']) check({ fieldKey: 'client.category', operator: 'equals', value: category }, true, context(category));
check({ fieldKey: 'client.category', operator: 'is_any_of', value: ['Producer', 'Importer'] }, true, context('Importer'));
check({ fieldKey: 'client.category', operator: 'not_equals', value: 'Producer' }, true);
check({ fieldKey: 'client.state', operator: 'is_any_of', value: ['Delhi', 'Goa'] }, true);
check({ fieldKey: 'client.communicationStatus', operator: 'equals', value: 'Replied' }, true, context('Brand Owner', { communicationStatus: 'Replied' }));
check(yes, true); check({ fieldKey: 'sale', operator: 'equals', value: 'No' }, true);
check({ fieldKey: 'stage', operator: 'equals', value: 'Done' }, true);
check({ fieldKey: 'note', operator: 'contains', value: 'documents' }, true);
check({ fieldKey: 'note', operator: 'equals', value: 'awaiting DOCUMENTS' }, false);
for (const [operator, value, expected] of [['greater_than', 2, true], ['less_than', 2, false], ['greater_than_or_equal', 10, true], ['less_than_or_equal', 10, true], ['equals', '10.0', true]]) check({ fieldKey: 'amount', operator, value }, expected);
for (const [operator, value] of [['before', '2026-10-23'], ['after', '2026-10-21'], ['on', '2026-10-22']]) check({ fieldKey: 'due', operator, value }, true);
check({ fieldKey: 'tags', operator: 'contains_any', value: ['Sale', 'Purchase'] }, true);
check({ fieldKey: 'tags', operator: 'contains_all', value: ['Purchase', 'Certificate'] }, true);
check({ fieldKey: 'tags', operator: 'not_contains', value: 'Sale' }, true);
for (const value of [null, '', undefined]) {
  check({ fieldKey: 'amount', operator: 'equals', value: 0 }, false, context('Brand Owner', { values: { ...values, amount: value } }));
  check({ fieldKey: 'amount', operator: 'is_empty' }, true, context('Brand Owner', { values: { ...values, amount: value } }));
}
check({ fieldKey: 'amount', operator: 'equals', value: 0 }, true, context('Brand Owner', { values: { ...values, amount: 0 } }));
check({ fieldKey: 'amount', operator: 'not_equals', value: 0 }, false, context('Brand Owner', { values: { ...values, amount: 'invalid' } }));
check({ fieldKey: 'due', operator: 'not_equals', value: '2026-10-22' }, false, context('Brand Owner', { values: { ...values, due: 'invalid' } }));
assert(engine.evaluateEmailConditionGroup(group(yes, { fieldKey: 'client.category', operator: 'equals', value: 'Brand Owner' }), context()));
assert(engine.evaluateEmailConditionGroup({ mode: 'ANY', conditions: [{ fieldKey: 'client.category', operator: 'equals', value: 'Producer' }, { fieldKey: 'client.category', operator: 'equals', value: 'Importer' }] }, context('Producer')));
const registry = engine.emailConditionFields(fields);
for (const bad of [{ fieldKey: 'removed', operator: 'equals', value: 'Yes' }, { fieldKey: 'amount', operator: 'equals', value: '2x' }, { fieldKey: 'due', operator: 'on', value: '2026-02-30' }, { fieldKey: 'mail', operator: 'contains', value: 'Yes' }, { fieldKey: 'client.category', operator: 'is_any_of', value: { $ne: '' } }, { fieldKey: 'client.category', operator: 'equals', value: 'PIBO' }]) assert(engine.emailConditionIssue(bad, registry));
const renamed = fields.map(field => field.key === 'sale' ? { ...field, label: 'Sales Data Uploaded' } : field);
check({ fieldKey: 'sale', operator: 'equals', value: 'No', fieldType: 'toggle' }, true, context('Brand Owner', { fields: renamed }));
assert(engine.emailConditionIssue({ fieldKey: 'sale', operator: 'equals', value: 'No', fieldType: 'toggle' }, engine.emailConditionFields(fields.map(field => field.key === 'sale' ? { ...field, type: 'date' } : field))));
assert(engine.emailConditionFields([...fields, { key: 'new', label: 'New field', type: 'currency' }]).some(field => field.key === 'new'));
assert.throws(() => context('Brand Owner', { client: { clientId: 'OTHER', companyName: 'Wrong client' } }), /identity/);
const originalValues = copy(values), isolated = context('Brand Owner', { values: originalValues }); originalValues.tags.push('Sale'); assert(!isolated.values.tags.includes('Sale'));

const rules = [scenario('brand', [yes, { fieldKey: 'client.category', operator: 'equals', value: 'Brand Owner' }]), scenario('others', [yes, { fieldKey: 'client.category', operator: 'is_any_of', value: ['Producer', 'Importer'] }], 'Purchase and sale instructions for {{client.companyName}}'), scenario('pwp', [yes, { fieldKey: 'client.category', operator: 'equals', value: 'PWP' }], 'PWP {{client.clientId}}')];
const workflow = { ...base, contentRules: rules };
const brand = renderTrackerEmail(workflow, context());
assert(brand.body.includes('Dear Shared & Sons, BO Brand Owner FY 2025-26 EXTRA')); assert(!brand.body.includes('sale instructions')); assert.deepEqual(brand.unresolvedVariables, []);
assert(brand.html.includes('Shared &amp; Sons')); assert(!brand.html.includes('&amp;amp;'));
const link = renderTrackerEmail({ ...base, contentRules: [scenario('linked', [yes], '<a href="https://example.invalid/{{client.clientId}}?name={{client.companyName}}">Hello {{client.companyName}}</a>')] }, context());
assert(link.html.includes('https://example.invalid/BO?name=Shared%20%26%20Sons')); assert(link.body.includes('Hello Shared & Sons'));
assert.equal(renderTrackerEmail({ ...base, body: '<a href="https://example.invalid/{{points}}">Link</a>', contentRules: [scenario('test', [yes])] }, context()).variableIssues[0].code, 'invalid_variable_context');
const reminder = renderTrackerEmail(workflow, context(), 'reminder'); assert(reminder.subject.includes('Reminder Shared & Sons BO')); assert(reminder.body.includes('2025-26')); assert.deepEqual(reminder.unresolvedVariables, []);
const repeated = renderTrackerEmail({ ...workflow, subject: '{{client.companyName}} {{client.companyName}}' }, context()); assert.equal(repeated.subject, 'Shared & Sons Shared & Sons');
const literal = 'Literal {{unknown.value}} $& <img src=x onerror=alert(1)> & "sons"';
const literalResult = renderTrackerEmail(workflow, context('Brand Owner', { client: { clientId: 'BO', companyName: literal, category: 'Brand Owner' } }));
assert(literalResult.body.includes(literal)); assert(!literalResult.html.includes('<img')); assert.deepEqual(literalResult.unresolvedVariables, []);
for (const [token, code] of [['{{unknown.value}}', 'unsupported_variable'], ['{{column.deleted}}', 'invalid_column_variable'], ['{{points}}', 'invalid_variable_context']]) assert.equal(renderTrackerEmail({ ...base, contentRules: [scenario('test', [yes], token)] }, context()).variableIssues[0].code, code);
assert.equal(renderTrackerEmail(workflow, context('Brand Owner', { client: { clientId: 'BO', category: 'Brand Owner' } })).variableIssues[0].code, 'missing_variables');
const zero = renderTrackerEmail({ ...base, contentRules: [scenario('test', [yes], '{{column.amount}} {{column.sale}}')] }, context('Brand Owner', { values: { ...values, amount: 0 } })); assert(zero.body.includes('0 No')); assert.deepEqual(zero.unresolvedVariables, []);
for (const type of ['statement', 'point']) {
  const w = { ...base, contentMode: type === 'statement' ? 'statements' : 'points', combinationMatchingMode: 'first', body: '{{statements}} {{points}}', contentRules: [{ ...scenario('one', [yes], 'One {{client.companyName}}'), type }, { ...scenario('two', [yes], 'Two {{client.clientId}}'), type }] };
  const rendered = renderTrackerEmail(w, context()); assert(rendered.body.includes('One Shared & Sons')); assert(rendered.body.includes('Two BO')); assert.deepEqual(rendered.unresolvedVariables, []);
}
const overlap = { ...base, contentRules: [scenario('low', [yes], 'Low {{client.companyName}}', 1), scenario('high', [yes], 'High {{client.clientId}}', 0)] };
for (const mode of [undefined, 'first']) { const result = renderTrackerEmail({ ...overlap, combinationMatchingMode: mode }, context()); assert.deepEqual(result.selection.selectedScenarioIds, ['high']); assert.deepEqual(result.selection.ignoredScenarioIds, ['low']); }
const combined = renderTrackerEmail({ ...overlap, combinationMatchingMode: 'combine' }, context()); assert.deepEqual(combined.selection.selectedScenarioIds, ['high', 'low']); assert(combined.body.indexOf('High BO') < combined.body.indexOf('Low Shared'));
assert(renderTrackerEmail(workflow, context('SIMP')).skipReason.includes('No combination'));
assert(renderTrackerEmail({ ...overlap, combinationMatchingMode: 'combine', contentRules: [...overlap.contentRules, { ...scenario('skip', [yes]), action: 'skip' }] }, context()).skipReason.includes('not to send'));
const oldSaved = cleanTrackerEmailWorkflows([copy(overlap)], fields); assert(oldSaved); assert.equal(oldSaved[0].combinationMatchingMode, undefined); assert.deepEqual(renderTrackerEmail(oldSaved[0], context()).selection.selectedScenarioIds, ['high']);
const combinedSaved = cleanTrackerEmailWorkflows([{ ...copy(overlap), combinationMatchingMode: 'combine' }], fields); assert.equal(combinedSaved[0].combinationMatchingMode, 'combine');
assert.equal(cleanTrackerEmailWorkflows([{ ...base, combinationMatchingMode: 'random' }], fields), null);
const mixed = { ...overlap, points: [{ id: 'old-point', fieldKey: 'mail', value: 'Yes', statement: 'Preserved legacy {{client.clientId}}' }] };
const migrated = { ...mixed, points: [], contentRules: [...mixed.contentRules, { id: 'legacy-point-old-point', type: 'point', legacyPoint: true, order: 2, content: mixed.points[0].statement, conditionGroup: group(yes) }] };
assert.equal(renderTrackerEmail(mixed, context()).body, renderTrackerEmail(cleanTrackerEmailWorkflows([migrated], fields)[0], context()).body, 'Opening/saving a Combination cannot drop legacy appended messages');
const oldStatement = { ...mixed, body: 'Points: {{points}} Statements: {{statements}} {{combinationMessage}}', points: [{ id: 'old-statement', format: 'statement', fieldKey: 'mail', value: 'Yes', statement: 'Legacy full {{client.companyName}}' }] };
const savedStatement = { ...oldStatement, points: [], contentRules: [...oldStatement.contentRules, { id: 'legacy-point-old-statement', type: 'statement', legacyPoint: true, order: 2, content: oldStatement.points[0].statement, conditionGroup: group(yes) }] };
assert.equal(renderTrackerEmail(oldStatement, context()).body, renderTrackerEmail(cleanTrackerEmailWorkflows([savedStatement], fields)[0], context()).body, 'Legacy statement placement and bullet formatting survive editor migration');
assert.equal(cleanTrackerEmailWorkflows([{ ...base, contentRules: [scenario('bad', [{ fieldKey: 'other-tracker-column', operator: 'equals', value: 'Yes' }])] }], fields), null);
const previews = buildEmailCombinationPreviews(workflow, fields); const preview = previews.previews.find(row => row.values.mail === 'Yes' && row.values['client.category'] === 'Brand Owner'); assert(preview); assert.deepEqual(preview.selection.selectedScenarioIds, brand.selection.selectedScenarioIds); assert(preview.body.includes('Brand Owner'));
assert(emailEditorVariables(fields, true).some(variable => variable.token === '{{client.companyName}}')); assert(!emailEditorVariables(fields, true).some(variable => variable.token === '{{points}}'));
const preparedBatch = trackerDeliverySchema.parse({ campaignId: 'fixture-campaign', workflowId: workflow.id, kind: 'initial', mode: 'send', messages: [{ entryId: 'entry-BO', clientId: 'BO', companyName: 'Shared & Sons', to: ['fixture@example.invalid'], cc: [], subject: brand.subject, html: brand.html, attachments: [] }] });
const snapshot = canonicalDeliveryBatch('tracker', preparedBatch); const mutated = copy(workflow); mutated.contentRules[0].content = 'Changed'; renderTrackerEmail(mutated, context('Producer')); assert.equal(canonicalDeliveryBatch('tracker', preparedBatch), snapshot);

async function preparationRoute() {
  let currentWorkflow = copy(workflow), history = [], currentValues = copy(values);
  const clients = ['Brand Owner', 'Producer', 'Importer', 'PWP'].map((category, index) => ({ clientId: 'CLIENT' + index, companyName: 'Same company', category, state: 'Delhi' }));
  const entries = clients.map((client, index) => ({ _id: 'entry-' + index, clientId: client.clientId, values: currentValues }));
  const chain = data => ({ select() { return this; }, sort() { return this; }, lean: async () => copy(data) });
  const mocks = {
    'next-auth': { getServerSession: async () => ({ user: { role: 'admin', email: 'fixture@example.invalid' } }) }, '@/lib/auth': { authOptions: {} }, '@/lib/authUsers': { isAdminSession: async () => true }, '@/lib/mongoose': { connectDB: async () => {} },
    '@/models/ClientTracker': { findById: () => chain({ _id: 'tracker', name: 'Migration tracker', fields, financialYear: '2025-26', status: 'active', emailEnabled: true, emailWorkflows: [currentWorkflow] }) },
    '@/models/ClientTrackerEntry': { find: () => chain(entries.map(entry => ({ ...entry, values: currentValues }))) }, '@/models/Client': { find: () => chain(clients) },
    '@/models/ClientContact': { find: () => chain(clients.map((client, index) => ({ clientId: client.clientId, personId: 'person-' + index, selectedEmails: [`fixture${index}@example.invalid`] }))) },
    '@/models/Person': { find: () => chain(clients.map((_, index) => ({ _id: 'person-' + index, emails: [`fixture${index}@example.invalid`] }))) },
    '@/models/EmailLog': { find: query => chain(history.filter(row => (!query.mailKind || (typeof query.mailKind === 'object' ? query.mailKind.$in.includes(row.mailKind) : row.mailKind === query.mailKind)) && (!query.sentAt || new Date(row.sentAt) >= query.sentAt.$gte) && (!query.status || row.status === query.status) && (!query.communicationStatus || row.communicationStatus === query.communicationStatus))) },
    'server-only': {}, '@/models/TrackerEmailCampaign': { aggregate: async () => [] },
    '@/models/Document': {}, '@/lib/server/tracker-linked-data': { resolveTrackerLinkedValues: async () => new Map() }, '@/lib/server/tracker-computed-values': { resolveTrackerComputedValues: (_fields, values) => values },
    '@/lib/server/tracker-attachment-snapshot': { createAttachmentMetadataReader: () => null, prepareTrackerAttachmentSelection: async () => ({ attachments: [], issues: [] }) },
  };
  const route = createLoader(mocks)('app/api/client-trackers/[id]/email/route.ts');
  const prepare = async (kind = 'initial') => { const response = await route.POST(new NextRequest('http://localhost/api/fixture', { method: 'POST', body: JSON.stringify({ workflowId: currentWorkflow.id, kind }) }), { params: Promise.resolve({ id: 'tracker' }) }); return { status: response.status, body: await response.json() }; };
  let result = await prepare(); assert.equal(result.status, 200); assert.equal(result.body.messages.length, 4);
  for (const message of result.body.messages) {
    assert(message.body.includes(message.clientId) || message.clientId === 'CLIENT1' || message.clientId === 'CLIENT2');
    assert(!message.body.includes('{{')); assert.equal(message.category, clients.find(client => client.clientId === message.clientId).category);
  }
  const owner = result.body.messages.find(message => message.clientId === 'CLIENT0'); assert(owner.body.includes('Brand Owner')); assert(!owner.body.includes('sale instructions'));
  assert.equal(result.body.scenarioSummary.find(row => row.id === 'others').matched, 2);
  const frozen = JSON.stringify(result.body.messages); clients[0].companyName = 'Updated client'; currentValues = { ...currentValues, sale: true }; currentWorkflow.contentRules[0].content = 'Changed {{client.companyName}}'; assert.equal(JSON.stringify(result.body.messages), frozen);
  result = await prepare(); assert(result.body.messages.find(message => message.clientId === 'CLIENT0').body.includes('Updated client'));
  currentWorkflow.contentRules[0].content = 'Dear {{client.companyName}} {{unknown.value}}'; result = await prepare(); assert(result.body.skipped.some(row => row.clientId === 'CLIENT0' && row.reasonCode === 'unsupported_variable'));
  currentWorkflow = copy(workflow); clients[0].companyName = ''; result = await prepare(); assert(result.body.skipped.some(row => row.clientId === 'CLIENT0' && row.reasonCode === 'missing_variables'));
  clients[0].companyName = 'Same company'; currentWorkflow.conditionGroup = group({ fieldKey: 'client.communicationStatus', operator: 'equals', value: 'Replied' }); history = [{ clientId: 'CLIENT0', status: 'sent', mailKind: 'initial', communicationStatus: 'replied' }]; result = await prepare(); assert.equal(result.body.messages.length, 0); assert(result.body.clientMatches.find(row => row.clientId === 'CLIENT0').sendRuleMatched); // Matched, but prior initial send remains a blocker.
  currentWorkflow = copy(workflow); history = [{ clientId: 'CLIENT0', status: 'sent', mailKind: 'initial', sentAt: new Date() }]; result = await prepare('reminder'); assert.equal(result.body.messages.length, 0); assert(result.body.skipped.some(row => row.reasonCode === 'recently_sent'));
  history[0].sentAt = new Date(Date.now() - 8 * 86400000); result = await prepare('reminder'); assert.equal(result.body.messages.length, 1); assert(result.body.messages[0].subject.includes('Reminder Same company CLIENT0')); assert(!result.body.messages[0].body.includes('{{'));
  history[0].communicationStatus = 'replied'; result = await prepare('reminder'); assert(result.body.skipped.some(row => row.reasonCode === 'replied'));
  currentWorkflow.contentRules[0].conditionGroup.conditions[0].fieldKey = 'deleted'; result = await prepare(); assert.equal(result.status, 409); assert.equal(result.body.code, 'invalid_workflow_configuration');
}
async function approvedSnapshot() {
  const f = require('./verify-email-delivery-security.cjs');
  process.env.EMAIL_SEND_PIN_PEPPER = 'isolated-snapshot-pin-pepper-not-a-real-secret';
  process.env.EMAIL_DELIVERY_OTP_SECRET = 'isolated-snapshot-otp-key-not-a-real-secret';
  await f.call('settings', undefined, 'GET'); f.Settings.rows[0].approvalEmail = 'approval@example.invalid'; f.Settings.rows[0].approvalEmailVerifiedAt = new Date();
  const input = f.batch('send', 'snapshot-client'), client = { clientId: 'snapshot-client', companyName: 'Original company', category: 'Brand Owner' };
  const frozenFields = [{ key: 'ready', label: 'Ready', type: 'select', options: ['Yes'] }, { key: 'sale', label: 'Sale Upload', type: 'toggle' }];
  const w = { ...base, id: 'WF1', conditionGroup: group({ fieldKey: 'ready', operator: 'equals', value: 'Yes' }), mainFieldKey: 'ready', mainValue: 'Yes', contentRules: [scenario('owner', [{ fieldKey: 'client.category', operator: 'equals', value: 'Brand Owner' }, { fieldKey: 'sale', operator: 'equals', value: 'No' }], 'Reviewed for {{client.companyName}} {{client.category}} {{tracker.financialYear}}')] };
  const ctx = engine.createTrackerEmailContext({ entry: { clientId: client.clientId, _id: client.clientId }, client, fields: frozenFields, values: { ready: 'Yes', sale: false }, financialYear: '2025-26', trackerName: 'Snapshot', workflowName: w.name });
  const rendered = renderTrackerEmail(w, ctx); input.messages[0].companyName = client.companyName; input.messages[0].subject = rendered.subject; input.messages[0].html = rendered.html;
  f.Tracker.rows.push({ _id: f.trackerId, name: 'Snapshot', status: 'active', emailEnabled: true, fields: frozenFields, financialYear: '2025-26', emailWorkflows: [w] }); f.eligible(input); f.Entry.rows[0].values.sale = false;
  const approvalId = await f.approve(input), accepted = await f.call('deliver', { ...input, approvalId, confirmed: true }, 'POST', { acceptOnly: true }); assert.equal(accepted.status, 202);
  const campaign = f.Campaign.rows.find(row => row.campaignId === input.campaignId), authorized = JSON.stringify(campaign.snapshot);
  client.category = 'Importer'; client.companyName = 'Changed company'; f.Entry.rows[0].values.sale = true; w.contentRules[0].content = 'Changed template'; f.Tracker.rows[0].financialYear = '2026-27';
  assert.equal(JSON.stringify(campaign.snapshot), authorized, 'Authorized workflow/fields/FY remain frozen');
  const controller = f.load('lib/server/email-delivery-controller.ts'), actor = f.service.securityContext({ user: { id: 'ADMIN1', email: 'admin@example.com' } }, new Headers());
  const claim = await controller.claimDeliveryCoordinator(actor, input.campaignId); await controller.processBrowserDeliveryBatch(actor, input.campaignId, claim.coordinatorToken);
  assert.equal(f.delivered.length, 1); assert.equal(f.delivered[0].html, rendered.html); assert.equal(f.delivered[0].subject, rendered.subject); assert.deepEqual(f.delivered[0].to, input.messages[0].to);
  assert(f.delivered[0].html.includes('Brand Owner')); assert(!f.delivered[0].html.includes('Changed template'));
}
preparationRoute().then(approvedSnapshot).then(() => console.log(`PASS: ${checks} typed-condition cases plus category/ID isolation, safe fragment variables, legacy modes, first/combine priority, actual preparation, and approved worker snapshot freezing; no live services.`)).catch(error => { console.error(error); process.exitCode = 1; });

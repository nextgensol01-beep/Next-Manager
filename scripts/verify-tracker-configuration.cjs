const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const { pipeline } = require('./search-fixture-pipeline.cjs');

let session = { user: { email: 'test@example.com', role: 'admin' } };
let failDatabase = false;
let failSession = false;
let tracker;
let entries;
let writes;
let clientRows;
let overviewReads = 0;
const copy = value => structuredClone(value);
const chain = value => ({ select() { return this; }, sort() { return this; }, skip(count) { value = value.slice(count); return this; }, limit(count) { value = value.slice(0, count); return this; }, lean() { return Promise.resolve(copy(value)); } });
const matches = (entry, query) => Object.entries(query).every(([key, wanted]) => {
  if (key === '$or') return wanted.some(condition => matches(entry, condition));
  if (key === '$and') return wanted.every(condition => matches(entry, condition));
  const actual = key.split('.').reduce((value, part) => value?.[part], entry);
  if (wanted instanceof RegExp) return wanted.test(String(actual ?? ''));
  if (wanted && typeof wanted === 'object') {
    if ('$ne' in wanted) return actual !== wanted.$ne;
    if ('$nin' in wanted) return !wanted.$nin.includes(actual);
    if ('$in' in wanted) return Array.isArray(actual) ? actual.some(value => wanted.$in.includes(value)) : wanted.$in.includes(actual);
  }
  return actual === wanted;
});
function apply(entry, update, insert = false) {
  for (const [key, value] of Object.entries({ ...(insert ? update.$setOnInsert : {}), ...update.$set })) {
    if (key.startsWith('values.')) entry.values[key.slice(7)] = copy(value);
    else entry[key] = copy(value);
  }
  for (const key of Object.keys(update.$unset || {})) {
    if (key.startsWith('values.')) delete entry.values[key.slice(7)];
    else delete entry[key];
  }
  for (const [key, change] of Object.entries(update.$pull || {})) entry[key] = (entry[key] || []).filter(value => !change.$in.includes(value));
  for (const [key, change] of Object.entries(update.$addToSet || {})) entry[key] = [...new Set([...(entry[key] || []), ...change.$each])];
}
const stubs = {
  'next-auth': { getServerSession: async () => { if (failSession) throw Error('Session unavailable'); return session; } },
  '@/lib/auth': { authOptions: {} },
  '@/lib/authUsers': { isAdminSession: async user => user?.user?.role === 'admin' },
  '@/lib/mongoose': { connectDB: async () => { if (failDatabase) throw Error('Database unavailable'); } },
  '@/models/Client': { collection: { name: 'clients' }, find: query => chain(clientRows.filter(client => matches(client, query))),
    aggregate: stages => Promise.resolve(pipeline(copy(clientRows), JSON.parse(JSON.stringify(stages)), { clienttrackerentries: copy(entries) })) },
  '@/models/ClientCustomField': { find: () => chain([]) },
  '@/lib/server/client-credentials': { clientCredentialAccess: async () => ({ protectedKeys: new Set(), searchableKeys: [] }) },
  '@/models/ClientTracker': {
    findById: async () => ({ ...copy(tracker), toObject: () => copy(tracker) }),
    findByIdAndUpdate: async (id, update) => { writes++; apply(tracker, update); return copy(tracker); },
    updateOne: async (query, update) => { if (query.$or && tracker.clientSyncCheckedAt) return { modifiedCount: 0 }; writes++; apply(tracker, update); return { modifiedCount: 1 }; },
  },
  '@/models/ClientTrackerEntry': {
    find: query => chain(entries.filter(entry => matches(entry, query))),
    countDocuments: async query => entries.filter(entry => matches(entry, query)).length,
    aggregate: async stages => {
      if (stages.some(stage => stage.$group)) { overviewReads++; return []; }
      // Overview totals now share a facet with the grouped field counts.
      // Keep this model double's empty-count response and evaluate its total.
      const facetIndex = stages.findIndex(stage => stage.$facet?.counts?.some(part => part.$group));
      if (facetIndex !== -1) {
        overviewReads++;
        const database = { clients: clientRows, clientcontacts: [], people: [], persons: [] };
        const input = pipeline(copy(entries), stages.slice(0, facetIndex), database);
        return [{ counts: [], total: pipeline(input, stages[facetIndex].$facet.total, database) }];
      }
      return pipeline(copy(entries), stages, { clients: clientRows, clientcontacts: [], people: [], persons: [] });
    },
    updateMany: async (query, update) => { writes++; entries.filter(entry => matches(entry, query)).forEach(entry => apply(entry, update)); },
    bulkWrite: async operations => {
      writes++;
      let upsertedCount = 0;
      for (const { updateOne: operation } of operations) {
        const updatePaths = Object.values(operation.update).flatMap(update => Object.keys(update));
        assert.equal(new Set(updatePaths).size, updatePaths.length, 'Mongo update operators must not target the same path');
        let entry = entries.find(entry => matches(entry, operation.filter));
        const insert = !entry;
        if (insert) { entry = { ...operation.filter, values: {} }; entries.push(entry); upsertedCount++; }
        apply(entry, operation.update, insert);
      }
      return { upsertedCount };
    },
  },
  '@/lib/server/tracker-linked-data': { resolveTrackerLinkedValues: async () => new Map() },
  '@/lib/server/tracker-computed-values': { resolveTrackerComputedValues: (fields, values) => values },
  '@/lib/server/tracker-membership': { syncCategoryTrackerMembership: async () => false,
    proposedTrackerAudience: (current, body) => load('lib/server/tracker-membership.ts').proposedTrackerAudience(current, body), confirmTrackerSync: async () => [], applyTrackerSync: async () => 0 },
  '@/lib/server/excel-report-style': { finaliseReadableReportSheet() {} },
  '@/models/EmailLog': {},
  '@/lib/server/activity-events': { recordActivityEvent: async () => null },
};
// Use the same resolver as the other route suites, including relative TS imports.
const load = require('./search-test-loader.cjs')(stubs);
const first = { key: 'note', label: 'Note', type: 'text' };
const second = { key: 'ready', label: 'Ready', type: 'toggle' };
function reset() {
  tracker = { _id: '0123456789abcdef01234567', name: 'Tracker', status: 'active', fields: [first], clientIds: ['A', 'B'] };
  entries = ['A', 'B'].map(clientId => ({ trackerId: tracker._id, clientId, inScope: true, values: { note: `Saved ${clientId}` } }));
  writes = 0;
  clientRows = ['A', 'B', 'C'].map(clientId => ({ clientId, companyName: `Client ${clientId}`, category: 'PWP' }));
  failDatabase = failSession = false;
  session = { user: { email: 'test@example.com', role: 'admin' } };
}

async function main() {
  const { readJsonResponse } = load('lib/http-response.ts');
  assert.deepEqual(await readJsonResponse(Response.json({ saved: true })), { saved: true });
  assert.deepEqual(await readJsonResponse(Response.json([1, 2])), [1, 2]);
  assert.deepEqual(await readJsonResponse(Response.json({ error: 'Keep a column' }, { status: 400 })), { error: 'Keep a column' });
  for (const [body, status, expected] of [
    ['', 200, /empty or invalid/], ['', 500, /HTTP 500/], ['<html>Failure</html>', 502, /HTTP 502/],
    ['{"truncated":', 200, /empty or invalid/], ['null', 200, /empty or invalid/],
    ['', 401, /sign in/], ['', 403, /permission/],
  ]) await assert.rejects(readJsonResponse(new Response(body, { status })), error => {
    assert.match(error.message, expected);
    assert.doesNotMatch(error.message, /Unexpected end|Unexpected token|Failed to execute/);
    return true;
  });
  await assert.rejects(readJsonResponse(new Response(null, { status: 204 })), /empty or invalid/);
  const interrupted = new Response(new ReadableStream({ start(controller) { controller.error(Error('Disconnected')); } }));
  await assert.rejects(readJsonResponse(interrupted), /interrupted/);
  const aborted = new DOMException('Aborted', 'AbortError');
  await assert.rejects(readJsonResponse({ text: async () => { throw aborted; } }), error => error === aborted);
  console.log('PASS: valid JSON, preserved API errors, empty/HTML/truncated/null responses, auth failures, interrupted and aborted streams');

  const { withTrackerApiErrors } = load('lib/server/tracker-api-errors.ts');
  const quietError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    const binary = new Response('spreadsheet', { headers: { 'Content-Type': 'application/octet-stream' } });
    assert.equal(await withTrackerApiErrors(async () => binary)(), binary);
    let response = await withTrackerApiErrors(async () => { throw Error('internal details'); })();
    assert.equal(response.status, 500);
    assert.doesNotMatch((await response.json()).error, /internal details/);

    const { PATCH } = load('app/api/client-trackers/[id]/route.ts');
    const patch = async body => PATCH(new Request('http://localhost/api/client-trackers/test', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body),
    }), { params: Promise.resolve({ id: tracker._id }) });
    reset();
    response = await patch({ fields: [first, second], includeStatus: false, clientIds: ['A', 'B', 'C'] });
    assert.equal(response.status, 200, JSON.stringify(await response.json()));
    assert.deepEqual(tracker.clientIds, ['A', 'B', 'C']);
    assert.equal(entries.find(entry => entry.clientId === 'A').values.note, 'Saved A');
    assert.equal(entries.find(entry => entry.clientId === 'A').values.ready, false);
    assert.equal(entries.find(entry => entry.clientId === 'C').inScope, true);
    console.log('PASS: configure adds columns and clients without conflicting Mongo update paths or losing marks');

    reset();
    response = await patch({ clientIds: ['A'] });
    assert.equal(response.status, 200);
    assert.equal(entries.find(entry => entry.clientId === 'B').inScope, false);
    response = await patch({ clientIds: ['A', 'B'] });
    assert.equal(response.status, 200);
    assert.equal(entries.find(entry => entry.clientId === 'B').inScope, true);
    assert.equal(entries.find(entry => entry.clientId === 'B').values.note, 'Saved B');
    assert.equal(entries.find(entry => entry.clientId === 'B').removedAt, undefined);
    console.log('PASS: removing and restoring a participant preserves their saved marks');

    const colorLib = load('lib/tracker-option-colors.ts');
    const createLib = load('lib/tracker-create.ts');
    const configurationLib = load('lib/tracker-configuration.ts');
    const legacy = { key: 'choice', label: 'Choice', type: 'select', options: ['First', 'Second', 'Third'] };
    const draftChoice = createLib.draftField(legacy);
    assert.equal(colorLib.trackerOptionColor(legacy, 'Second'), 'blue');
    assert.equal(colorLib.trackerOptionColor(draftChoice, 'Second'), 'blue');
    assert.equal(configurationLib.configurationFieldSignature(legacy), configurationLib.configurationFieldSignature(draftChoice), 'Materializing legacy colors must not mark an opening draft as modified');
    const removedFirst = { ...draftChoice, ...colorLib.trackerOptionEdit(draftChoice, ['Second', 'Third']) };
    assert.equal(removedFirst.optionColors.Second, 'blue', 'Removing an earlier option cannot shift a remaining color');
    const renamed = { ...removedFirst, ...colorLib.trackerOptionEdit(removedFirst, ['Second', 'Renamed'], 1) };
    assert.equal(renamed.optionColors.Renamed, 'violet');
    assert(!('Third' in renamed.optionColors));
    const blank = { ...renamed, ...colorLib.trackerOptionEdit(renamed, ['Second', 'Renamed', '']) };
    blank.optionColors[''] = 'rose';
    assert.equal(colorLib.trackerOptionEdit(blank, ['Second', 'Renamed', 'New'], 2).optionColors.New, 'rose', 'A color picked before naming an option survives typing');
    assert.equal(legacy.optionColors, undefined, 'Editing a draft cannot mutate the persisted definition');
    const { cleanTrackerFields } = load('lib/server/tracker-fields.ts');
    const computedChoice = cleanTrackerFields([{ key: 'ready', label: 'Ready', type: 'toggle' }, {
      key: 'combined', label: 'Combined', type: 'select', options: ['Old ready', 'Old pending'],
      optionColors: { Ready: 'emerald', Pending: 'rose' },
      computed: { kind: 'combinedStatus', conditionGroup: { mode: 'ALL', conditions: [{ fieldKey: 'ready', operator: 'equals', value: 'Yes' }] }, matchedLabel: 'Ready', fallbackLabel: 'Pending' },
    }], false).find(field => field.key === 'combined');
    assert.deepEqual(computedChoice.optionColors, { Ready: 'emerald', Pending: 'rose' }, 'Computed colors must be keyed to the effective output labels');
    for (const type of ['select', 'multiSelect', 'tags']) {
      reset();
      tracker.fields = [first, { ...legacy, type }];
      for (const entry of entries) entry.values.choice = type === 'select' ? 'Second' : ['Second', 'Third'];
      const savedValues = entries.map(entry => copy(entry.values));
      const colored = { ...legacy, type, optionColors: { First: 'amber', Second: 'emerald', Third: 'rose', Removed: 'violet' } };
      response = await patch({ fields: [first, colored], includeStatus: false });
      assert.equal(response.status, 200);
      assert.deepEqual(tracker.fields.find(field => field.key === 'choice').optionColors, { First: 'amber', Second: 'emerald', Third: 'rose' });
      assert.deepEqual(entries.map(entry => entry.values), savedValues, 'Color-only configuration must preserve every saved value');
      const reopened = createLib.draftField(tracker.fields.find(field => field.key === 'choice'));
      for (const option of legacy.options) assert.equal(colorLib.trackerOptionColor(reopened, option), colored.optionColors[option]);
    }
    console.log('PASS: shared legacy defaults, stable rename/removal colors, blank-row colors, effective computed labels and real PATCH color persistence without changing marks');

    for (const invalid of [
      { fields: [second], includeStatus: false, clientIds: [] },
      { fields: [second], includeStatus: false, emailWorkflows: [{}] },
      { fields: [second], includeStatus: false, savedViews: [null] },
      { fields: [second], includeStatus: false, clientCategories: ['invalid'], clientMembershipMode: 'categorySync' },
      { fields: [{ key: 'upload', label: 'Upload', type: 'number', dataLink: { source: 'purchaseUploads', display: 'count' } }], includeStatus: false },
    ]) {
      reset();
      const before = copy(entries);
      response = await patch(invalid);
      assert.equal(response.status, 400, JSON.stringify(await response.json()));
      assert.equal(writes, 0, 'Rejected configuration must not write marks or membership');
      assert.deepEqual(entries, before);
    }
    console.log('PASS: invalid client scope, workflows, views, categories, and financial year leave saved marks unchanged');

    reset();
    for (const body of ['', '{', 'null', '[]']) {
      response = await patch(body);
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /JSON/);
    }
    session = null;
    assert.equal((await patch({ name: 'Changed' })).status, 401);
    session = { user: { role: 'user' } };
    assert.equal((await patch({ name: 'Changed' })).status, 403);
    reset();
    failDatabase = true;
    response = await patch({ name: 'Changed' });
    assert.equal(response.status, 500);
    assert.match((await response.json()).error, /tracker request/);
    assert.equal(writes, 0);
    failDatabase = false;
    failSession = true;
    response = await patch({ name: 'Changed' });
    assert.equal(response.status, 500);
    assert.equal(response.headers.get('content-type'), 'application/json');
    console.log('PASS: malformed request, authentication, authorization, and server failures return JSON errors');
  } finally { console.error = quietError; }

  // Exercise the actual Configure event handlers with a filtered page of entries.
  const page = ts.createSourceFile('page.tsx', fs.readFileSync(path.join(root, 'app/dashboard/client-trackers/[id]/page.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const handlers = {};
  function findHandlers(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ['openConfiguration', 'saveConfiguration'].includes(node.name.text))
      handlers[node.name.text] = node.initializer.getText(page);
    ts.forEachChild(node, findHandlers);
  }
  findHandlers(page);
  function handler(name, context) {
    const code = ts.transpileModule(`const handler = ${handlers[name]};`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return new Function(...Object.keys(context), `${code}\nreturn handler;`)(...Object.values(context));
  }
  reset();
  tracker.clientIds.push('C');
  tracker.entries = [entries[0]];
  let participants;
  const noop = () => {};
  handler('openConfiguration', {
    tracker, toast: { error: message => { throw Error(message); } },
    draftField: load('lib/tracker-create.ts').draftField,
    configurationSnapshot: load('lib/tracker-configuration.ts').configurationSnapshot,
    configurationSyncDraft: load('lib/tracker-configuration.ts').configurationSyncDraft, setSyncDraft: noop,
    setConfigurationBaseline: noop, setConfigurationSession: noop, setConfigurationError: noop,
    setConfigurationSaved: noop, setConfigurationCompact: noop, setConfigurationNestedDialog: noop, setConfigurationDiscardOpen: noop,
    setFieldDraft: noop, setColumnDraft: noop, setBasicDraft: noop, setConfigurationOpen: noop,
    setParticipantDraft: value => { participants = value; },
  })();
  assert.deepEqual(participants, ['A', 'B', 'C']);
  assert.notEqual(participants, tracker.clientIds, 'Draft edits must not change the loaded tracker');
  let confirmation;
  await handler('saveConfiguration', {
    tracker, fieldDraft: [first], basicDraft: {}, participantDraft: ['A', 'B'],
    syncDraft: { clientScope: 'selected', clientMembershipMode: 'snapshot', clientCategories: [] }, configurationBaseline: {},
    configurationSaving: { current: false }, setConfigurationError: noop,
    configurationNeedsFinancialYear: load('lib/tracker-configuration.ts').configurationNeedsFinancialYear,
    toast: { error: message => { throw Error(message); } },
    setConfirmation: value => { confirmation = value; },
    setSavingConfiguration: () => { throw Error('Hidden participant removal needs confirmation before saving'); },
  })();
  assert.equal(confirmation, 'configuration');
  console.log('PASS: Configure loads all participants from a filtered page and confirms off-page client removals');

  reset();
  tracker.fields = [first, second, { key: 'amount', label: 'Amount', type: 'number' }];
  tracker.clientIds = Array.from({ length: 130 }, (_, index) => `C${index}`);
  clientRows = tracker.clientIds.map((clientId, index) => ({ clientId, companyName: index === 128 ? 'Needle [Ltd]' : `Company ${index}`, category: index % 2 ? 'PWP' : 'PIBO' }));
  entries = tracker.clientIds.map((clientId, index) => ({ _id: clientId, trackerId: tracker._id, clientId, inScope: true, values: { note: index === 128 ? 'Literal a.b' : 'Literal axb', ready: index % 2 === 0, amount: 1 } }));
  const { GET } = load('app/api/client-trackers/[id]/route.ts');
  const { NextRequest } = require('next/server');
  const get = async query => {
    const response = await GET(new NextRequest(`http://localhost/api/client-trackers/test?overview=0&${query}`), { params: Promise.resolve({ id: tracker._id }) });
    assert.equal(response.status, 200);
    return response.json();
  };
  assert.equal((await get('limit=100')).entries.length, 100);
  assert.equal(overviewReads, 0, 'Table opening must not aggregate whole-tracker summaries');
  const overviewResponse = await GET(new NextRequest('http://localhost/api/client-trackers/test?overviewOnly=1'), { params: Promise.resolve({ id: tracker._id }) });
  assert.equal(overviewResponse.headers.get('cache-control'), 'private, no-store');
  const overviewBody = await overviewResponse.json();
  assert.deepEqual(overviewBody.overviewCounts, []);
  assert.equal(overviewBody.totalEntryCount, 130, 'Faceted overview preserves the whole-tracker total');
  assert(!('entries' in overviewBody), 'Summaries must not load the table a second time');
  assert.equal(overviewReads, 1);
  const freshResponse = await GET(new NextRequest('http://localhost/api/client-trackers/test?overview=0'), { params: Promise.resolve({ id: tracker._id }) });
  assert.equal(freshResponse.headers.get('cache-control'), 'private, no-store');
  console.log('PASS: table opening skips whole-tracker summaries; separate totals and table responses prohibit cached results');
  assert.deepEqual((await get('search=Needle')).entries.map(entry => entry.clientId), ['C128']);
  assert.deepEqual((await get('search=%5BLtd%5D')).entries.map(entry => entry.clientId), ['C128']);
  assert.equal((await get('search=Needle&category=PWP')).entries.length, 0);
  assert.equal((await get('field=ready&value=Yes')).entryCount, 65);
  assert.equal((await get('field=ready&value=No')).entryCount, 65);
  assert.equal((await get('field=amount&value=1.0')).entryCount, 130);
  assert.deepEqual((await get('field=note&value=a.b')).entries.map(entry => entry.clientId), ['C128']);
  tracker.savedViews = [{ id: 'all', name: 'All', conditionGroup: { mode: 'ALL', conditions: [{ fieldKey: 'amount', operator: 'greater_than_or_equal', value: 0 }] } }];
  assert.equal((await get('view=all&field=ready&value=Yes')).entries.length, 65);
  assert.equal((await get('view=all&field=amount&value=1.0&limit=250')).entries.length, 130);
  console.log('PASS: full-tracker search, literal special characters, combined categories, boolean and numeric filters, saved-view parity');

  const exportRoute = load('app/api/client-trackers/[id]/export/route.ts');
  const exported = await exportRoute.GET(new NextRequest('http://localhost/api/client-trackers/test/export?field=ready&value=Yes'), { params: Promise.resolve({ id: tracker._id }) });
  assert.equal(exported.status, 200);
  const workbook = new (require('exceljs').Workbook)();
  await workbook.xlsx.load(Buffer.from(await exported.arrayBuffer()));
  assert.equal(workbook.worksheets[0].rowCount, 66);
  console.log('PASS: exported Yes-filtered workbook contains the same 65 matching clients');

  reset();
  tracker.clientMembershipMode = 'categorySync';
  tracker.clientCategories = ['PWP'];
  clientRows = [{ clientId: 'A', category: 'PWP' }, { clientId: 'B', category: 'PIBO' }, { clientId: 'C', category: 'PWP' }, { clientId: 'D', category: 'PWP' }];
  entries.push({ trackerId: tracker._id, clientId: 'C', inScope: false, values: { note: 'Saved C' } });
  let membershipSaved = 0;
  tracker.save = async () => { membershipSaved++; };
  await load('lib/server/tracker-membership.ts').syncCategoryTrackerMembership(tracker);
  assert.deepEqual(tracker.clientIds, ['A', 'B', 'D']);
  assert.equal(membershipSaved, 0, 'Atomic additions must not save a stale entire tracker document');
  assert.equal(entries.find(entry => entry.clientId === 'B').inScope, true);
  assert.equal(entries.find(entry => entry.clientId === 'C').inScope, false);
  assert.equal(entries.find(entry => entry.clientId === 'C').values.note, 'Saved C');
  console.log('PASS: additive category membership preserves historical clients and exclusions without whole-document saves');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

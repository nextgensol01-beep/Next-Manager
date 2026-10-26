/* Actual membership engine, preview endpoint and Configure PATCH with atomic DB fixtures.
 * No production data, Gmail or external service is accessed. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { NextRequest } = require('next/server');
const createLoader = require('./search-test-loader.cjs');
const { pipeline } = require('./search-fixture-pipeline.cjs');
const copy = value => structuredClone(value);
const trackerId = '0123456789abcdef01234567';
const categories = ['Producer', 'Importer', 'Brand Owner', 'PWP'];
let clients = [], entries = [], trackers = [], session, writes = 0, queries = [], duplicateRace = false, failOnBulk = 0, bulkCalls = 0, failMetadata = false;
function at(row, key) { return key.split('.').reduce((value, part) => value?.[part], row); }
function match(row, filter) {
  return Object.entries(filter).every(([key, wanted]) => {
    if (key === '$or') return wanted.some(item => match(row, item));
    if (key === '$and') return wanted.every(item => match(row, item));
    const actual = at(row, key);
    if (wanted && typeof wanted === 'object' && !(wanted instanceof Date)) {
      if ('$in' in wanted) return [actual].flat().some(value => wanted.$in.includes(value));
      if ('$ne' in wanted) return actual !== wanted.$ne;
      if ('$nin' in wanted) return !wanted.$nin.includes(actual);
      if ('$lte' in wanted) return actual <= wanted.$lte;
    }
    if (wanted == null) return actual == null;
    return Array.isArray(actual) ? actual.includes(wanted) : actual === wanted;
  });
}
function update(row, change, insert = false) {
  for (const [key, value] of Object.entries({ ...(insert ? change.$setOnInsert : {}), ...change.$set })) {
    if (key.startsWith('values.')) row.values[key.slice(7)] = copy(value); else row[key] = copy(value);
  }
  for (const key of Object.keys(change.$unset || {})) {
    if (key.startsWith('values.')) delete row.values[key.slice(7)]; else delete row[key];
  }
  for (const [key, value] of Object.entries(change.$addToSet || {})) row[key] = [...new Set([...(row[key] || []), ...(value.$each || [value])])];
  for (const [key, value] of Object.entries(change.$pull || {})) row[key] = (row[key] || []).filter(item => !value.$in.includes(item));
}
function document(row) {
  if (!row) return null;
  const data = copy(row), doc = {};
  for (const key of Object.keys(data)) Object.defineProperty(doc, key, { enumerable: false, get: () => data[key] });
  Object.defineProperty(doc, 'toObject', { value: () => copy(data) });
  return doc;
}
function query(value, asDocument = false) {
  return { select() { return this; }, sort() { return this; }, limit(count) { value = value.slice(0,count); return this; }, lean: async () => copy(value),
    then(resolve, reject) { return Promise.resolve(asDocument ? document(value) : copy(value)).then(resolve, reject); } };
}
const Client = {
  find(filter) { queries.push(['clients', filter]); return query(clients.filter(row => match(row, filter))); },
  aggregate(stages) {
    queries.push(['aggregate', stages]);
    const rows = pipeline(copy(clients), JSON.parse(JSON.stringify(stages)), { clienttrackerentries: copy(entries) });
    return { then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject); }, cursor() {
      return { async *[Symbol.asyncIterator]() { for (const row of rows) yield row; }, async close() {} };
    } };
  },
};
const Tracker = {
  find: filter => query(trackers.filter(row => match(row, filter))),
  findById: id => query(trackers.find(row => row._id === id), true),
  async updateOne(filter, change) {
    if (failMetadata && change.$addToSet) throw new Error('Injected metadata persistence failure');
    const row = trackers.find(row => match(row, filter)); if (!row) return { matchedCount: 0, modifiedCount: 0 };
    const before = JSON.stringify(row); update(row, change); writes++;
    return { matchedCount: 1, modifiedCount: Number(before !== JSON.stringify(row)) };
  },
  async findByIdAndUpdate(id, change) { const row = trackers.find(row => row._id === id); if (!row) return null; update(row, change); writes++; return document(row); },
  async create(data) { const row = { _id: 'new-' + trackers.length, ...copy(data) }; trackers.push(row); return document(row); },
  async deleteOne(filter) { trackers = trackers.filter(row => !match(row, filter)); },
};
const Entry = {
  async insertMany(rows) { entries.push(...copy(rows)); },
  find: filter => query(entries.filter(row => match(row, filter))),
  countDocuments: async filter => entries.filter(row => match(row, filter)).length,
  async updateMany(filter, change) { entries.filter(row => match(row, filter)).forEach(row => update(row, change)); writes++; },
  async bulkWrite(operations, options) {
    bulkCalls++;
    if (bulkCalls === failOnBulk) throw new Error('Injected sync persistence failure');
    let added = 0;
    for (const { updateOne: op } of operations) {
      if (options?.timestamps === false) assert.deepEqual(Object.keys(op.update), ['$setOnInsert'], 'Sync may only initialize new rows');
      let row = entries.find(row => match(row, op.filter));
      if (!row) { row = { _id: 'entry-' + entries.length, ...copy(op.filter) }; entries.push(row); update(row, op.update, true); added++; }
      else update(row, op.update, false);
    }
    writes++;
    if (duplicateRace) { duplicateRace = false; throw Object.assign(Error('Racing upsert'), { writeErrors: [{ code: 11000 }], result: { upsertedCount: added } }); }
    return { upsertedCount: added };
  },
};
const mocks = {
  'next-auth': { getServerSession: async () => session }, '@/lib/auth': { authOptions: {} },
  '@/lib/authUsers': { isAdminSession: async value => value?.user?.role === 'admin' },
  '@/lib/mongoose': { connectDB: async () => {} }, '@/models/Client': Client,
  '@/models/ClientTracker': Tracker, '@/models/ClientTrackerEntry': Entry,
  '@/lib/server/activity-events': { recordActivityEvent: async () => null },
  '@/lib/server/tracker-linked-data': { resolveTrackerLinkedValues: async () => new Map() },
  '@/lib/server/tracker-computed-values': { resolveTrackerComputedValues: (_, values) => values },
};
process.env.NEXTAUTH_SECRET = 'isolated-tracker-sync-preview-secret';
const load = createLoader(mocks);
const membership = load('lib/server/tracker-membership.ts');
const previewRoute = load('app/api/client-trackers/[id]/sync/route.ts');
const configRoute = load('app/api/client-trackers/[id]/route.ts');
const createRoute = load('app/api/client-trackers/route.ts');
const owner = 'admin@example.invalid';
const fields = [
  { key: 'status', label: 'Status', type: 'status', options: ['Awaiting', 'Done'] },
  { key: 'ready', label: 'Ready', type: 'toggle' }, { key: 'note', label: 'Note', type: 'text' },
  { key: 'tags', label: 'Tags', type: 'tags', options: ['Review'] },
  { key: 'upload', label: 'Live upload', type: 'text', dataLink: { source: 'purchaseUploads', display: 'uploadStatus' } },
];
function reset() {
  writes = 0; queries = []; bulkCalls = 0; failOnBulk = 0; failMetadata = false;
  session = { user: { email: owner, role: 'admin' } };
  clients = categories.map((category, index) => ({ clientId: `ID-${index}`, companyName: 'Same company', category, state: 'Delhi', email: 'shared@example.invalid' }));
  trackers = [{ _id: trackerId, name: 'Compliance tracker', status: 'active', fields: copy(fields), clientIds: ['historical', 'excluded'], clientScope: 'categories', clientCategories: categories, clientMembershipMode: 'snapshot', financialYear: '2025-26' }];
  entries = [
    { _id: 'old', trackerId, clientId: 'historical', inScope: true, values: { status: 'Done', ready: true, note: 'Keep saved notes', tags: ['Review'], date: '2025-05-01', number: 17 }, updatedAt: new Date('2025-07-01'), attachments: ['approved-doc'], history: ['saved-history'] },
    { _id: 'excluded', trackerId, clientId: 'excluded', inScope: false, removalReason: 'Removed manually from tracker scope', values: { note: 'Excluded saved record' } },
  ];
  clients.push({ clientId: 'excluded', companyName: 'Excluded', category: 'PWP', state: 'Delhi' });
  trackers[0].clientIds = ['historical'];
}
const request = (body, route) => new NextRequest(`http://localhost/api/client-trackers/${trackerId}/${route}`, { method: route === 'sync' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
async function preview(body = {}) { const response = await previewRoute.POST(request(body, 'sync'), { params: Promise.resolve({ id: trackerId }) }); return { status: response.status, body: await response.json() }; }
async function save(body) { const response = await configRoute.PATCH(request(body, ''), { params: Promise.resolve({ id: trackerId }) }); return { status: response.status, body: await response.json() }; }

async function main() {
  reset();
  const create = async body => {
    const response = await createRoute.POST(new NextRequest('http://localhost/api/client-trackers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Create fixture', fields: [{ key: 'ready', label: 'Ready', type: 'toggle' }], includeStatus: false, ...body }) }));
    return { status: response.status, body: await response.json() };
  };
  let created = await create({ clientIds: ['ID-0'] });
  assert.equal(created.status, 201); assert.deepEqual(created.body.clientIds, ['ID-0']); assert.equal(created.body.clientScope, 'selected'); assert.equal(created.body.clientMembershipMode, 'snapshot');
  created = await create({ clientCategories: ['PWP'], clientMembershipMode: 'categorySync' });
  assert.equal(created.status, 201); assert.equal(created.body.clientScope, 'categories'); assert.equal(created.body.entryCount, 2);
  clients.push({ clientId: 'simp', companyName: 'Existing canonical category', category: 'SIMP' });
  created = await create({ scope: 'all', clientMembershipMode: 'categorySync' });
  assert.equal(created.status, 201); assert.equal(created.body.entryCount, 6); assert.equal(created.body.clientMembershipMode, 'categorySync');
  assert.equal((await create({ scope: 'selected', clientIds: [] })).status, 400);
  assert.equal((await create({ scope: 'selected', clientIds: ['ID-0'], clientMembershipMode: 'categorySync' })).status, 400);
  assert.equal((await create({ scope: 'categories', clientCategories: [] })).status, 400);
  assert.equal((await create({ scope: 'invalid' })).status, 400);
  console.log('PASS: actual create endpoint keeps legacy selected requests fixed, preserves legacy category sync, All clients Auto Sync and existing SIMP, strict empty/invalid scopes.');
  for (let mask = 1; mask < 16; mask++) {
    reset(); const tracker = trackers[0]; tracker.clientMembershipMode = 'categorySync'; tracker.clientCategories = categories.filter((_, i) => mask & (1 << i));
    const saved = copy(entries);
    await membership.syncCategoryTrackerMembership(tracker);
    assert.equal(entries.length, 2 + tracker.clientCategories.length);
    assert.deepEqual(entries.slice(0, 2), saved, 'Historical and excluded entries stay byte-for-byte unchanged');
    for (const client of clients.slice(0, 4)) assert.equal(entries.some(row => row.clientId === client.clientId), tracker.clientCategories.includes(client.category));
    for (const row of entries.slice(2)) assert.deepEqual(row.values, { status: 'Awaiting', ready: false, note: '', tags: [], upload: '' });
    await membership.syncCategoryTrackerMembership(tracker);
    assert.equal(new Set(entries.map(row => row.clientId)).size, entries.length);
    assert.equal(tracker.financialYear, '2025-26');
  }
  console.log('PASS: all 15 combinations of Producer/Importer/Brand Owner/PWP, nonmatching exclusion, stable Client IDs, configured defaults, preserved FY and historical marks.');
  reset(); let result = await preview(); assert.equal(result.status, 200); assert.equal(result.body.existingCount, 1); assert.equal(result.body.missingCount, 4); assert.equal(result.body.projectedCount, 5); assert.equal(writes, 0);
  assert.deepEqual(result.body.clients.map(row => row.category).sort(), [...categories].sort());
  assert.equal((await save({ clientMembershipMode: 'categorySync' })).status, 409); assert.equal(writes, 0);
  result = await preview({ clientMembershipMode: 'categorySync' });
  const saved = copy(entries), frozenCampaign = Object.freeze({ items: Object.freeze([{ clientId: 'historical', status: 'delivering', html: 'Approved snapshot', attachmentSnapshot: 'signed-proof' }]) });
  const campaignBefore = JSON.stringify(frozenCampaign);
  const enabled = await save({ clientMembershipMode: 'categorySync', syncRequested: true, syncPreviewToken: result.body.token });
  assert.equal(enabled.status, 200, JSON.stringify(enabled.body)); assert.equal(enabled.body.syncAddedCount, 4); assert.equal(trackers[0].clientMembershipMode, 'categorySync');
  assert.deepEqual(entries.slice(0, 2), saved); assert.equal(JSON.stringify(frozenCampaign), campaignBefore);
  assert.equal((await save({ syncRequested: true, syncPreviewToken: result.body.token })).status, 409, 'Replay cannot add unseen clients');
  result = await preview(); const upToDate = await save({ syncRequested: true, syncPreviewToken: result.body.token }); assert.equal(upToDate.body.syncAddedCount, 0);
  console.log('PASS: database preview counts, inert preview/cancel, enable requires signed review, one-time additive confirmation, actual counts and safe replay.');
  for (const invalid of ['tamper', 'owner', 'new-client', 'recategorize', 'deleted']) {
    reset(); result = await preview(); const before = copy(entries);
    if (invalid === 'tamper') result.body.token += 'x';
    if (invalid === 'owner') session.user.email = 'another@example.invalid';
    if (invalid === 'new-client') clients.push({ clientId: 'new', companyName: 'New', category: 'PWP' });
    if (invalid === 'recategorize') clients[0].category = 'SIMP';
    if (invalid === 'deleted') clients.splice(0, 1);
    assert.equal((await save({ syncRequested: true, syncPreviewToken: result.body.token })).status, 409);
    assert.deepEqual(entries, before); assert.equal(writes, 0);
  }
  reset(); assert.equal((await preview({ clientScope: 'categories', clientCategories: [] })).status, 400);
  assert.equal((await preview({ clientScope: 'selected', clientMembershipMode: 'categorySync' })).status, 400);
  session = null; assert.equal((await preview()).status, 401); session = { user: { email: owner, role: 'user' } }; assert.equal((await preview()).status, 403);
  console.log('PASS: stale set/owner/policy/tamper validation, empty-category rejection, specific-client protection, authentication and admin boundaries.');
  reset(); result = await preview();
  assert.equal((await save({ clientCategories: ['PWP'], syncRequested: true, syncPreviewToken: result.body.token })).status, 409);
  const clock = Date.now;
  Date.now = () => clock() + 11 * 60_000;
  try { assert.equal((await save({ syncRequested: true, syncPreviewToken: result.body.token })).status, 409); } finally { Date.now = clock; }
  reset(); result = await preview();
  const concurrent = await Promise.all([save({ syncRequested: true, syncPreviewToken: result.body.token }), save({ syncRequested: true, syncPreviewToken: result.body.token })]);
  assert(concurrent.every(row => [200,409].includes(row.status)));
  assert.equal(concurrent.filter(row => row.status === 200).reduce((sum,row) => sum + row.body.syncAddedCount, 0), 4);
  assert.equal(entries.length, 6); assert.equal(new Set(entries.map(row => row.clientId)).size, 6);
  reset(); await membership.addTrackerClients(trackers[0], ['ID-3']);
  const staleBaseline = ['historical'];
  const configured = await save({ clientIds: ['historical', 'ID-0'], clientIdsBaseline: staleBaseline });
  assert.equal(configured.status, 200, JSON.stringify(configured.body));
  assert(trackers[0].clientIds.includes('ID-3'), 'A stale Configure draft cannot remove a concurrent additive membership');
  assert(entries.find(row => row.clientId === 'ID-3').inScope);
  console.log('PASS: expired/policy-bound preview, concurrent confirmations report exact upserts, stale Configure saves preserve concurrent additions.');
  reset(); trackers[0].clientMembershipMode = 'categorySync'; trackers[0].clientCategories = ['PWP'];
  clients.push({ clientId: 'new-pwp', category: 'PWP', companyName: 'Same company' }, { clientId: 'new-importer', category: 'Importer', companyName: 'Same company' });
  await Promise.all(Array.from({ length: 5 }, () => membership.syncClientIntoAutoTrackers({ clientId: 'new-pwp', category: 'PWP' })));
  await membership.syncClientIntoAutoTrackers({ clientId: 'new-importer', category: 'Importer' });
  assert.equal(entries.filter(row => row.clientId === 'new-pwp').length, 1); assert(!entries.some(row => row.clientId === 'new-importer'));
  assert(!entries.find(row => row.clientId === 'excluded').inScope);
  trackers[0].clientScope = 'all'; trackers[0].clientSyncCheckedAt = new Date(0); await membership.syncCategoryTrackerMembership(trackers[0]);
  assert(clients.slice(0, 4).every(client => entries.some(row => row.clientId === client.clientId)));
  duplicateRace = true; await membership.addTrackerClients(trackers[0], ['ID-0']);
  reset(); trackers[0].clientScope = 'selected'; trackers[0].clientMembershipMode = 'snapshot'; await membership.syncClientIntoAutoTrackers({ clientId: 'ID-3', category: 'PWP' }); assert.equal(entries.length, 2);
  console.log('PASS: targeted creation/update fanout, concurrent idempotency, duplicate-key recovery, All clients, persistent exclusions and fixed manual lists.');
  reset(); clients = Array.from({ length: 305 }, (_, i) => ({ clientId: 'bulk-' + i.toString().padStart(4, '0'), companyName: 'Client ' + i, category: 'PWP' }));
  trackers[0].clientMembershipMode = 'categorySync'; trackers[0].clientCategories = ['PWP'];
  await membership.syncCategoryTrackerMembership(trackers[0]); assert.equal(entries.length, 202);
  await membership.syncCategoryTrackerMembership(trackers[0]); assert.equal(entries.length, 307);
  assert(queries.filter(([name]) => name === 'aggregate').every(([, stages]) => stages[0].$match.category));
  result = await preview(); assert.equal(result.body.missingCount, 0);
  reset(); clients = Array.from({ length: 305 }, (_, i) => ({ clientId: 'manual-' + i.toString().padStart(4, '0'), companyName: 'Client ' + i, category: 'PWP' }));
  result = await preview(); assert.equal(result.body.missingCount, 305); assert.equal(result.body.clients.length, 250); assert(result.body.truncated);
  failOnBulk = 2;
  const quiet = console.error; console.error = () => {};
  let partial;
  try { partial = await save({ clientMembershipMode: 'categorySync', syncRequested: true, syncPreviewToken: result.body.token }); } finally { console.error = quiet; }
  assert.equal(partial.status, 500); assert.equal(trackers[0].clientMembershipMode, 'snapshot'); assert.equal(entries.length, 202);
  failOnBulk = 0; result = await preview(); assert.equal(result.body.missingCount, 105);
  const resumed = await save({ clientMembershipMode: 'categorySync', syncRequested: true, syncPreviewToken: result.body.token });
  assert.equal(resumed.status, 200); assert.equal(resumed.body.syncAddedCount, 105); assert.equal(entries.length, 307);
  assert.equal(new Set(entries.map(row => row.clientId)).size, 307);
  console.log('PASS: 305-client preview with bounded visible metadata, partial failure is not success, old mode retained and fresh-preview retry adds only remaining clients.');
  reset(); result = await preview(); failMetadata = true;
  console.error = () => {};
  try { partial = await save({ clientMembershipMode: 'categorySync', syncRequested: true, syncPreviewToken: result.body.token }); } finally { console.error = quiet; }
  assert.equal(partial.status, 500); assert.equal(entries.length, 6); assert.deepEqual(trackers[0].clientIds, ['historical']);
  const inserted = copy(entries); failMetadata = false;
  result = await preview(); assert.equal(result.body.missingCount, 0); assert.equal(result.body.existingCount, 5);
  const repaired = await save({ clientMembershipMode: 'categorySync', syncRequested: true, syncPreviewToken: result.body.token });
  assert.equal(repaired.status, 200); assert.equal(repaired.body.syncAddedCount, 0);
  assert.deepEqual(entries, inserted); assert.equal(trackers[0].clientIds.length, 5);
  assert(!trackers[0].clientIds.includes('excluded'));
  console.log('PASS: interrupted insert-before-metadata write is repaired on retry without duplicate rows, resetting values or reactivating exclusions.');
  const source = fs.readFileSync(require('node:path').join(__dirname, '../lib/server/tracker-membership.ts'), 'utf8');
  assert(!/deliverThroughGmail|EmailLog|TrackerEmailCampaign|inngest|setInterval/.test(source));
  const listSource = fs.readFileSync(require('node:path').join(__dirname, '../app/api/client-trackers/route.ts'), 'utf8');
  assert(!listSource.includes('syncCategoryTrackerMembership'), 'Listing cannot scan Client Master once per tracker');
  const clientService = fs.readFileSync(require('node:path').join(__dirname, '../lib/server/client-contact-service.ts'), 'utf8');
  assert(clientService.includes('syncClientIntoAutoTrackers({ clientId: client.clientId, category: clientCategory })'));
  assert(clientService.includes('category cannot be changed after creation'), 'Do not weaken canonical category immutability');
  console.log('PASS: bounded 200-row catch-up, indexed category/membership lookup, no list fanout, no polling or email/campaign writes, canonical transaction hook.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

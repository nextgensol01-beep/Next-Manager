const assert = require('node:assert/strict');
const createLoader = require('./search-test-loader.cjs');
const { migrateBillingSchema } = require('./migrate-billing-schema.cjs');

async function verifyMaintenanceRoutes() {
  const origin = 'https://fixture.invalid';
  process.env.NEXTAUTH_URL = origin;
  const operations = [];
  let session = null;
  let actor = null;
  let failure = false;
  const load = createLoader({
    'server-only': {},
    'next-auth': { getServerSession: async () => session },
    '@/lib/auth': { authOptions: {} },
    '@/lib/mongoose': { connectDB: async () => {} },
    '@/models/User': { findById: () => ({ select: async () => actor }) },
    '@/models/AuthSession': {},
    '@/models/AccountSecurity': {},
    mongoose: { connection: { db: { collection: () => ({
      dropIndex: async () => { if (failure) throw Error('synthetic internal detail'); operations.push('dropIndex'); },
      createIndex: async () => operations.push('createIndex'),
    }) } } },
    '@/models/Contact': { find: async () => [{ _id: 'contact', name: 'Fixture', mobile: '1234567890', email: 'one@example.invalid' }] },
    '@/models/Client': { find: async () => [{ clientId: 'CLIENT', contactId: 'contact' }] },
    '@/models/Person': {
      findOne: async () => null,
      create: async record => { operations.push('createPerson'); return { ...record, _id: 'person' }; },
      findById: () => ({ lean: async () => ({ phoneNumbers: ['1234567890'], emails: ['one@example.invalid'] }) }),
    },
    '@/models/ClientContact': {
      findOne: async () => null,
      create: async () => operations.push('createLink'),
      find: async () => [{ personId: 'person', save: async () => operations.push('saveSelections') }],
    },
  });
  const routes = {
    'fix-indexes': ['dropIndex', 'dropIndex', 'createIndex'],
    'migrate-contacts': ['createPerson', 'createLink'],
    'migrate-client-contact-selections': ['saveSelections'],
  };
  for (const [route, expected] of Object.entries(routes)) {
    const handler = load('app/api/' + route + '/route.ts');
    assert.equal(handler.GET, undefined);
    const invoke = requestOrigin => handler.POST(new Request(origin + '/api/' + route, {
      method: 'POST', headers: requestOrigin ? { origin: requestOrigin } : {},
    }));
    session = null;
    assert.equal((await invoke(origin)).status, 401);
    session = { user: { id: 'fixture-user', role: 'admin' } };
    actor = { role: 'user', status: 'active' };
    assert.equal((await invoke(origin)).status, 403, 'A claimed role is insufficient');
    actor = { role: 'admin', status: 'pending' };
    assert.equal((await invoke(origin)).status, 403);
    actor = { role: 'admin', status: 'active' };
    assert.equal((await invoke()).status, 403);
    assert.equal((await invoke('https://other.invalid')).status, 403);
    assert.deepEqual(operations, []);
    assert.equal((await invoke(origin)).status, 200);
    assert.deepEqual(operations.splice(0), expected);
  }
  const { POST } = load('app/api/fix-indexes/route.ts');
  failure = true;
  const original = console.error; console.error = () => {};
  try {
    const response = await POST(new Request(origin, { method: 'POST', headers: { origin } }));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Maintenance operation failed' });
  } finally { console.error = original; }
}

async function verifyBillingReads() {
  const legacy = { _id: 'legacy', clientId: 'CLIENT', financialYear: '2025-26', totalAmount: 100, govtCharges: 100 };
  const general = { _id: 'general', clientId: 'CLIENT', financialYear: '2025-26', billType: 'general', billTitle: 'Fixture', totalAmount: 50 };
  const payments = [{ _id: 'payment', billingId: '', clientId: 'CLIENT', financialYear: '2025-26', amountPaid: 25 }];
  const failWrite = () => assert.fail('Read path attempted a database write');
  const select = records => ({ select: () => ({ lean: async () => records }) });
  let connected = 0;
  const load = createLoader({
    'next-auth': { getServerSession: async () => ({ user: { id: 'fixture' } }) },
    '@/lib/auth': { authOptions: {} },
    '@/lib/mongoose': { connectDB: async () => connected++ },
    '@/models/Billing': {
      collection: {
        aggregate: stages => {
          assert(stages.some(stage => stage.$lookup?.from === 'payments'));
          return { toArray: async () => [legacy, general] };
        },
        updateMany: failWrite, indexes: failWrite, dropIndex: failWrite, createIndex: failWrite,
      },
      find: () => select([legacy, general]), findOne: () => select(null),
      create: failWrite,
    },
    '@/models/Payment': { collection: { name: 'payments' }, find: () => select(payments) },
    '@/models/Quotation': { findById: () => ({ lean: async () => ({ status: 'Accepted', clientId: 'CLIENT' }) }) },
    '@/models/QuotationRevision': {},
    '@/models/Client': { findOne: () => select({ clientId: 'CLIENT' }), find: () => select([{ clientId: 'CLIENT', companyName: 'Fixture Company' }]) },
    '@/lib/server/activity-events': {}, '@/lib/server/annual-return-status-service': {},
    '@/lib/server/billing-report-category-store': { readBillingCategories: async () => [] },
  });
  const quotation = load('app/api/quotations/[id]/billing/route.ts');
  const req = new Request('https://fixture.invalid/api/billing');
  assert.equal((await quotation.GET(req, { params: Promise.resolve({ id: 'invalid' }) })).status, 400);
  assert.equal(connected, 0);
  const eligible = await quotation.GET(req, { params: Promise.resolve({ id: '0123456789abcdef01234567' }) });
  assert.equal((await eligible.json()).eligible, true);
  const response = await load('app/api/billing/route.ts').GET(req);
  const normalized = { ...legacy, billType: 'annual_return', billTitle: 'Annual Return Filing' };
  assert.deepEqual(await response.json(), [normalized, general]);
  assert.equal(Object.hasOwn(legacy, 'billType'), false);
  const { executeBillingReport } = load('lib/server/billing-report-service.ts');
  const { buildBillingReport } = load('lib/billing-report.ts');
  const report = await executeBillingReport({ financialYear: '2025-26', view: 'bill' });
  assert.equal(report.summary.billed, 150);
  assert.equal(report.summary.paid, 25);
  assert.equal(report.summary.outstanding, 125);
  assert.deepEqual(report, buildBillingReport([normalized, general], payments, [{ clientId: 'CLIENT', companyName: 'Fixture Company' }], report.options));
  const searched = await executeBillingReport({ financialYear: '2025-26', view: 'bill', search: 'Annual Return Filing' });
  assert.equal(searched.bills.length, 1);
  const { schema } = createLoader()('models/Billing.ts').default;
  assert.equal(schema.options.autoCreate, false);
  assert.equal(schema.options.autoIndex, false);
}

async function verifyMigration() {
  const calls = [];
  let duplicates = [];
  let legacyCount = 1;
  const indexes = [{ name: 'clientId_1_financialYear_1', key: { clientId: 1, financialYear: 1 }, unique: true }];
  const collection = {
    countDocuments: async () => legacyCount,
    indexes: async () => indexes,
    aggregate: () => ({ toArray: async () => duplicates }),
    createIndex: async (keys, options) => calls.push(['create', keys, options]),
    updateMany: async (filter, update) => {
      assert.deepEqual(filter, { billType: { $exists: false } });
      assert.deepEqual(update.$set, { billType: 'annual_return', billTitle: 'Annual Return Filing' });
      calls.push(['backfill']); const count = legacyCount; legacyCount = 0; return { modifiedCount: count };
    },
    dropIndex: async name => { calls.push(['drop', name]); indexes.length = 0; },
  };
  assert.equal((await migrateBillingSchema(collection)).legacyBillCount, 1);
  assert.deepEqual(calls, []);
  duplicates = [{ groups: 1 }];
  await assert.rejects(migrateBillingSchema(collection, { apply: true }), /manual review/);
  assert.deepEqual(calls, []);
  duplicates = [];
  const rejecting = { ...collection, createIndex: async () => { throw Error('Index conflict'); } };
  await assert.rejects(migrateBillingSchema(rejecting, { apply: true }), /Index conflict/);
  assert.deepEqual(calls, []);
  assert.equal((await migrateBillingSchema(collection, { apply: true })).updated, 1);
  assert.deepEqual(calls.map(call => call[0]), ['create', 'create', 'create', 'backfill', 'drop']);
  assert.equal(calls[0][2].unique, true);
  assert.deepEqual(calls[0][2].partialFilterExpression, { billType: 'annual_return' });
  assert.equal((await migrateBillingSchema(collection, { apply: true })).updated, 0);
  assert.equal(calls.filter(call => call[0] === 'drop').length, 1);
}

async function verifyLegacyBillingWrite() {
  const load = createLoader({
    'next-auth': { getServerSession: async () => ({ user: { id: 'fixture' } }) },
    '@/lib/auth': { authOptions: {} },
    '@/lib/mongoose': { connectDB: async () => {} },
    '@/models/Billing': { collection: {
      findOne: async filter => {
        assert.deepEqual(filter.$or, [{ billType: 'annual_return' }, { billType: { $exists: false } }]);
        return { _id: 'legacy', totalAmount: 100 };
      },
      updateOne: async (filter, update) => {
        assert.deepEqual(filter, { _id: 'legacy' }, 'A general bill for the same client/year must not be overwritten');
        assert.equal(update.$set.totalAmount, 125);
      },
    } },
    '@/models/Payment': {},
    '@/lib/server/billing-read': { fetchBillingAggregated: async id => ({ _id: id, totalAmount: 125 }) },
    '@/lib/server/activity-events': { recordActivityEvent: async () => {} },
    '@/lib/server/annual-return-status-service': { syncAnnualReturnStatus: async () => {} },
  });
  const response = await load('app/api/billing/route.ts').POST(new Request('https://fixture.invalid/api/billing', {
    method: 'POST', body: JSON.stringify({ clientId: 'CLIENT', financialYear: '2025-26', govtCharges: 125 }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { _id: 'legacy', totalAmount: 125 });
}

(async () => {
  await verifyMaintenanceRoutes();
  await verifyBillingReads();
  await verifyLegacyBillingWrite();
  await verifyMigration();
  console.log('PASS: active admin and origin guards, authorized maintenance, read-only billing and report parity, and explicit repeatable migration. No database contacted.');
})().catch(error => { console.error(error); process.exitCode = 1; });

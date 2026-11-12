const assert = require('node:assert/strict');
const createLoader = require('./search-test-loader.cjs');

async function main() {
  const key = { clientId: 'CLIENT', financialYear: '2025-26' };
  let record, beforeWrite, creates = 0, updates = 0, activity = true, session = null;
  const select = value => ({ select: () => ({ lean: async () => value }) });
  const annualReturn = {
    findOne: filter => {
      assert.deepEqual(filter, key);
      return select(record && { ...record });
    },
    aggregate: async () => record ? [record] : [],
    async findOneAndUpdate(filter, update, options) {
      updates++;
      beforeWrite?.();
      assert.equal(options.upsert, undefined);
      if (!record || filter._id !== record._id) return null;
      const expected = filter.status;
      if (expected.$exists !== Object.hasOwn(record, 'status') || (expected.$exists && expected.$eq !== record.status)) return null;
      record = { ...record, ...update.$set };
      return record;
    },
    async create(values) {
      creates++;
      beforeWrite?.();
      if (record) throw Object.assign(new Error('fixture unique key conflict'), { code: 11000 });
      record = { _id: 'fixture', ...values };
      return record;
    },
  };
  const load = createLoader({
    'next-auth': { getServerSession: async () => session },
    '@/lib/auth': { authOptions: {} }, '@/lib/mongoose': { connectDB: async () => {} },
    '@/models/AnnualReturn': annualReturn,
    '@/models/Client': { findOne: () => select({ category: 'Producer' }), find: () => select([]) },
    '@/models/Invoice': { find: () => select([]) },
    '@/models/UploadRecord': { exists: async () => activity ? { _id: 'upload' } : null },
    '@/models/Billing': { exists: async () => null },
    '@/models/Quotation': { find: () => select([]) },
    '@/lib/server/client-search': { recordClientSearchStages: async () => [] },
    '@/lib/server/client-contact-service': { getClientContactsMap: async () => new Map() },
    '@/lib/server/activity-events': {},
  });
  const { syncAnnualReturnStatus } = load('lib/server/annual-return-status-service.ts');
  const reconcile = () => syncAnnualReturnStatus(key.clientId, key.financialYear);
  const { GET } = load('app/api/annual-return/route.ts');
  const request = new Request('https://fixture.invalid/api/annual-return?clientId=CLIENT&fy=2025-26');
  assert.equal((await GET(request)).status, 401);
  assert.equal(creates + updates, 0);
  session = { user: { id: 'fixture' } };
  const response = await GET(request);
  assert.equal(response.status, 200);
  assert.equal((await response.json())[0].status, 'In Progress');
  assert.equal(creates, 1);
  assert.deepEqual(await reconcile(), { status: 'In Progress', changed: false });
  assert.equal(updates, 0);

  record = { _id: 'fixture', ...key, status: 'Pending' };
  beforeWrite = () => { record.status = 'Filed'; };
  assert.deepEqual(await reconcile(), { status: 'Filed', changed: false });
  assert.equal(record.status, 'Filed');

  record = { _id: 'fixture', ...key, status: 'Pending' };
  beforeWrite = () => { record.status = 'Ready to File'; };
  assert.deepEqual(await reconcile(), { status: 'Ready to File', changed: false });

  record = null;
  beforeWrite = () => { record = { _id: 'concurrent', ...key, status: 'Verified' }; };
  assert.deepEqual(await reconcile(), { status: 'Verified', changed: false });
  assert.equal(record._id, 'concurrent');

  record = { _id: 'legacy', ...key };
  beforeWrite = undefined;
  activity = false;
  assert.deepEqual(await reconcile(), { status: 'Not Started', changed: true });
  assert.equal(record.status, 'Not Started');
  console.log('PASS: profile status materialization, legacy default, no-op reads and concurrent filing/status decisions preserved. No database contacted.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });

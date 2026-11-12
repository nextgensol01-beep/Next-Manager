const { parseArgs } = require('node:util');
const { MongoClient } = require('mongodb');

const legacyBills = { billType: { $exists: false } };
const annualKey = { clientId: 1, financialYear: 1 };
const annualIndex = 'unique_annual_return_billing_per_fy';

async function migrateBillingSchema(collection, { apply = false } = {}) {
  const [legacyBillCount, indexes, duplicates] = await Promise.all([
    collection.countDocuments(legacyBills),
    collection.indexes().catch(error => {
      if (error.code === 26) return []; // Fresh database, no billing collection yet.
      throw error;
    }),
    collection.aggregate([
      { $match: { $or: [{ billType: 'annual_return' }, legacyBills] } },
      { $group: { _id: { clientId: '$clientId', financialYear: '$financialYear' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: 'groups' },
    ]).toArray(),
  ]);
  const legacyIndexes = indexes.filter(index => index.unique === true && !index.partialFilterExpression &&
    JSON.stringify(index.key) === JSON.stringify(annualKey)).map(index => index.name);
  const duplicateAnnualReturnGroups = duplicates[0]?.groups ?? 0;
  const plan = { legacyBillCount, duplicateAnnualReturnGroups, legacyIndexes, billingIndexes: indexes.map(index => index.name) };
  if (!apply) return plan;
  if (duplicateAnnualReturnGroups) throw new Error('Duplicate Annual Return groups require manual review before applying');

  // Install the replacement before dropping the old uniqueness constraint.
  await collection.createIndex(annualKey, {
    name: annualIndex, unique: true, partialFilterExpression: { billType: 'annual_return' },
  });
  // Same keys/options as models/Billing.ts, now provisioned by an operator.
  await collection.createIndex({ clientId: 1, financialYear: 1, billType: 1, createdAt: -1 });
  await collection.createIndex({ sourceQuotationIds: 1 }, { unique: true, sparse: true });
  const result = await collection.updateMany(legacyBills, {
    $set: { billType: 'annual_return', billTitle: 'Annual Return Filing' },
  });
  for (const name of legacyIndexes) {
    await collection.dropIndex(name).catch(error => {
      if (error.code !== 27) throw error; // Already removed.
    });
  }
  return { ...plan, updated: result.modifiedCount };
}

async function main() {
  const { values } = parseArgs({ options: { database: { type: 'string' }, apply: { type: 'boolean' } } });
  const uri = process.env.BILLING_MIGRATION_MONGODB_URI;
  if (!uri || !values.database) throw new Error('Set BILLING_MIGRATION_MONGODB_URI and provide --database <name>');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  try {
    const db = client.db();
    if (db.databaseName !== values.database) throw new Error('Confirmed database does not match the URI');
    const result = await migrateBillingSchema(db.collection('billings'), { apply: values.apply });
    console.log(JSON.stringify({ mode: values.apply ? 'apply' : 'dry-run', ...result }, null, 2));
  } finally {
    await client.close();
  }
}

if (require.main === module) main().catch(error => {
  // Driver messages can contain the connection target or document values.
  const message = error.code || error.name !== 'Error' ? 'Billing migration failed; review database and index configuration' : error.message;
  console.error(message);
  process.exitCode = 1;
});

module.exports = { migrateBillingSchema };

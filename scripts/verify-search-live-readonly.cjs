// Read-only consistency check on the configured database. Never writes data,
// builds indexes, expires quotations, or prints client/contact/search values.
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { performance } = require('node:perf_hooks');
require('@next/env').loadEnvConfig(require('node:path').resolve(__dirname, '..'));
const load = require('./search-test-loader.cjs')();
async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nextgen-erp', { serverSelectionTimeoutMS: 8000, autoIndex: false, autoCreate: false, bufferCommands: false });
  const Client = load('models/Client.ts').default;
  const service = load('lib/server/client-contact-service.ts');
  const server = load('lib/server/client-search.ts');
  const local = load('lib/search/client-search.ts');
  const clients = await Client.find({}).sort({clientId:1}).limit(50).lean();
  const keys = await server.searchableClientCustomKeys();
  const contacts = await service.getClientContactsMap(clients.map(client => client.clientId));
  const enriched = clients.map(client => ({...client,searchValues:server.clientSearchProjection(client,keys,contacts.get(client.clientId) || [])}));
  const ids = clients.map(client => client.clientId);
  const queries = [...new Set(enriched.flatMap(client => client.searchValues).filter(value => typeof value === 'string' && value.trim().length > 2).slice(0,12))];
  queries.push('.*','[nonexistent-search-probe]', '');
  const measurements = [];
  for (const query of queries) {
    const stages = await server.clientSearchStages(query);
    const started = performance.now();
    const actual = await Client.aggregate([{$match:{clientId:{$in:ids}}},...stages,{$project:{clientId:1}}]).option({maxTimeMS:10000});
    measurements.push(Math.round(performance.now()-started));
    const expected = enriched.filter(client => local.matchesClientSearch(client,query)).map(client => client.clientId).sort();
    assert.deepEqual(actual.map(client => client.clientId).sort(),expected,'Live server and local matching differ');
  }
  // The aggregate is read-only and the null identifier ensures zero source rows;
  // this still exercises actual server parsing of the record/contact lookup stages.
  const Invoice = load('models/Invoice.ts').default;
  await Invoice.aggregate([{$match:{clientId:'__search_validation_no_client__'}},...await server.recordClientSearchStages('probe',['clientId'],['financialYear'])]).option({maxTimeMS:10000});
  const ClientContact = load('models/ClientContact.ts').default;
  const indexes = await Promise.all([Client.collection.indexes(),ClientContact.collection.indexes()]);
  const result = {status:'PASS',sampleClients:clients.length,queries:queries.length,scopedQueryMilliseconds:measurements,
    relationshipIndexes:indexes.map((list,index)=>({collection:index?'ClientContact':'Client',keys:list.map(entry=>entry.key)})),
    limits:'Read-only sample consistency; not an unscoped production latency benchmark.'};
  const fs = require('node:fs'),path = require('node:path');
  fs.mkdirSync(path.resolve(__dirname,'../tmp/search-architecture-tests'),{recursive:true});
  fs.writeFileSync(path.resolve(__dirname,'../tmp/search-architecture-tests/live-readonly.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error('Live search check failed:',error.name); process.exitCode=1; }).finally(() => mongoose.disconnect());

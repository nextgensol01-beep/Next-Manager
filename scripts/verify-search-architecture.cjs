const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const createLoader = require('./search-test-loader.cjs');
const root = path.resolve(__dirname, '..');
const defs = [{ key: 'region' }, { key: 'aliases' }, { key: 'portalSecret' }, { key: 'legalName' }];
const models = Object.fromEntries(['Client','ClientContact','Person'].map(name => ['@/models/' + name, { collection: { name: name.toLowerCase() + 's' } }]));
const load = createLoader({ ...models,
  '@/models/ClientCustomField': { find: () => ({ select: () => ({ lean: async () => defs }) }) },
  '@/lib/server/client-credentials': { clientCredentialAccess: async () => ({ protectedKeys: new Set(['portalSecret']), searchableKeys: ['region','aliases'] }) },
});
const local = load('lib/search/client-search.ts');
const server = load('lib/server/client-search.ts');
const selections = load('lib/clientContactSelections.ts');

// Tiny fixture pipeline executor: validates the generated production stages
// against independent fixture records. Live Mongo checks are a separate script.
const {pipeline} = require("./search-fixture-pipeline.cjs");
async function main() {
  const personId = '0123456789abcdef01234567';
  const person = {_id:personId,name:'Asha Rao',phoneNumbers:['+91 98765 43210','99999 11111'],emails:['asha@one.example','asha@two.example']};
  const clients = [
    {clientId:'PWP-001',companyName:'Arihant & Sons',legalName:'Arihant Private Limited',category:'PWP',customFields:{region:'Western India',aliases:['Blue Moon','Silver Bird'],portalSecret:'never-find-secret'}},
    {clientId:'PRD-002',companyName:'Other Company',legalName:'Other Limited',category:'Producer',customFields:{}},
    {clientId:'PWP-003',companyName:'Legacy',category:'PWP',customFields:{}},
    {clientId:'PWP-004',companyName:'Explicit None',category:'PWP',customFields:{}},
    {clientId:'PWP-005',companyName:'Deleted Person',category:'PWP',customFields:{}},
  ];
  const links = [
    {clientId:'PWP-001',personId,selectedPhones:[person.phoneNumbers[0]],selectedEmails:[' ASHA@ONE.EXAMPLE ']},
    {clientId:'PRD-002',personId,selectedPhones:[person.phoneNumbers[1]],selectedEmails:[person.emails[1]]},
    {clientId:'PWP-003',personId},
    {clientId:'PWP-004',personId,selectedPhones:[],selectedEmails:[]},
    {clientId:'PWP-005',personId:'fedcba987654321001234567'},
  ];
  const db = {clients,clientcontacts:links,persons:[person]};
  const keys = await server.searchableClientCustomKeys();
  assert.deepEqual(keys,['region','aliases']);
  const enriched = clients.map(client => {
    const contacts = links.filter(link => link.clientId === client.clientId && link.personId === personId).map(link => {
      const selected = selections.resolveCompanySelections({phones:person.phoneNumbers,emails:person.emails,selectedPhones:link.selectedPhones,selectedEmails:link.selectedEmails});
      return {name:person.name,phoneNumbers:selected.selectedPhones,emails:selected.selectedEmails};
    });
    return {...client,searchValues:server.clientSearchProjection(client,keys,contacts)};
  });
  for (const query of ['arihant','ARIHANT PRIVATE','pwp001','Arihant Sons','9876543210','ASHA@ONE','asha@two','Asha Rao','Western India','silver bird','never-find-secret','[','.*','none','deleted','']) {
    const stages = await server.clientSearchStages(query);
    const remote = pipeline(clients,stages,db).map(client => client.clientId);
    const browser = enriched.filter(client => local.matchesClientSearch(client,query)).map(client => client.clientId);
    assert.deepEqual(browser,remote,'Server/browser mismatch for ' + query);
  }
  assert.deepEqual(pipeline(clients,await server.clientSearchStages('9876543210'),db).map(c => c.clientId),['PWP-001','PWP-003']);
  assert.deepEqual(pipeline(clients,await server.clientSearchStages('asha@two'),db).map(c => c.clientId),['PRD-002','PWP-003']);
  assert.equal(local.createSearchMatcher('z'.repeat(81))('z'.repeat(80)),true,'Preserve existing 80-normalized-query-char behavior');
  assert.equal(local.createSearchMatcher('tail')('x'.repeat(200)+'tail'),true,'Never truncate values');
  assert.equal(local.createSearchMatcher('moon silver')(['Blue Moon','Silver Bird']),false,'Do not bridge unrelated fields');
  assert.equal(local.matchesClientSearch({customFields:{secret:'hidden'}},'hidden'),false);
  const txs = [{fromClientId:'PWP-001',toClientId:'PRD-002',financialYear:'2025-26',notes:'CREDIT-123'}, {fromClientId:'PWP-004',toClientId:'PWP-005',financialYear:'2026-27',notes:'CREDIT-123'}];
  for (const query of ['9876543210','asha@two','credit-123']) assert.equal(pipeline(txs,[{$match:{financialYear:'2025-26'}},...await server.recordClientSearchStages(query,['fromClientId','toClientId'],['notes'])],db).length,1);
  const legacy = [{clientId:'',clientName:'Arihant & Sons'},{clientId:'',clientName:'Unrelated Arihant & Sons Subsidiary'},{clientId:'PWP-004',clientName:'Arihant & Sons'}];
  assert.equal(pipeline(legacy,await server.recordClientSearchStages('9876543210',['clientId'],['clientName'],{legacyClientName:'clientName'}),db).length,1);
  assert.equal(pipeline([{clientId:'PWP-001'},{clientId:'PRD-002'}],await server.trackerEntrySearchStages('Asha','PWP'),db).length,1);

  const cache = createLoader()('lib/cache.ts');
  let calls = 0, finish;
  global.fetch = () => { calls++; return new Promise(resolve => { finish = () => resolve(new Response(JSON.stringify({value:calls}))); }); };
  const a = cache.cachedFetch('/api/search?search=A&fy=2025-26');
  const b = cache.cachedFetch('/api/search?search=A&fy=2025-26');
  assert.equal(calls,1,'Identical requests deduplicate'); finish(); await Promise.all([a,b]);
  await cache.cachedFetch('/api/search?search=A&fy=2025-26'); assert.equal(calls,1,'Repeated search cache');
  const c = cache.cachedFetch('/api/search?search=B&fy=2025-26'); const oldFinish = finish;
  cache.invalidate('/api/search'); oldFinish(); await c;
  assert.equal(cache.getCached('/api/search?search=B&fy=2025-26'),null,'Invalidated reads cannot repopulate cache');
  const d = cache.cachedFetch('/api/search?search=B&fy=2025-27'); cache.setCached('/api/search?search=B&fy=2025-27',{value:'optimistic'}); finish(); await d;
  assert.deepEqual(cache.getCached('/api/search?search=B&fy=2025-27'),{value:'optimistic'});
  cache.clearAll();
  cache.setCached('/api/email-log?search=old-client',{value:'cached'});
  cache.invalidate('/api/clients');
  assert.equal(cache.getCached('/api/email-log?search=old-client'),null,'Client edits invalidate dependent remote search results');
  cache.setCacheScope('account-one:user');
  cache.setCached('/api/clients',{value:'account-one'});
  cache.setCacheScope('account-two:admin');
  assert.equal(cache.getCached('/api/clients'),null,'Account/role changes isolate cached search results');

  // Compare static and dynamic visual attributes using the TS AST. Logic may
  // change; classes, inline styles, placeholders, icons and element counts may not.
  const baseline = path.resolve(root,'../search-architecture-baseline');
  const visualManifestPath = path.join(__dirname,'fixtures/search-visual-baseline.json');
  const hash = value => require('node:crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const visualHashes = {};
  let compared = 0, changed = [];
  function visual(file) {
    const source = fs.readFileSync(file,'utf8');
    const ast = ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    const attrs = [];
    function walk(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        attrs.push('tag:'+node.tagName.getText(ast));
        for (const attr of node.attributes.properties) if (ts.isJsxAttribute(attr) && /^(className|style|placeholder|size|width|height)$/.test(attr.name.getText(ast))) attrs.push(attr.getText(ast));
      }
      ts.forEachChild(node,walk);
    }
    walk(ast); return attrs;
  }
  function visit(dir) {
    for (const entry of fs.readdirSync(path.join(baseline,dir),{withFileTypes:true})) {
      const relative = path.join(dir,entry.name);
      if (entry.isDirectory()) visit(relative);
      else if (/\.(ts|tsx)$/.test(relative)) {
        const original = fs.readFileSync(path.join(baseline,relative),'utf8').replace(/\r\n/g,'\n');
        const current = fs.readFileSync(path.join(root,relative),'utf8').replace(/\r\n/g,'\n');
        if (original !== current) { changed.push(relative.replace(/\\/g,'/')); if (relative.endsWith('.tsx')) { visualHashes[relative.replace(/\\/g,'/')] = hash(visual(path.join(baseline,relative))); } }
      }
    }
  }
  if (!fs.existsSync(visualManifestPath)) {
    ['app','components','lib','models'].forEach(visit);
    fs.writeFileSync(visualManifestPath,JSON.stringify({visualHashes,changed},null,2));
  }
  const manifest = JSON.parse(fs.readFileSync(visualManifestPath,'utf8'));
  changed = manifest.changed;
  for (const [relative,expected] of Object.entries(manifest.visualHashes)) {
    assert.equal(hash(visual(path.join(root,relative))),expected,relative+' visual attributes changed'); compared++;
  }
  fs.mkdirSync(path.join(root,'tmp/search-architecture-tests'),{recursive:true});
  fs.writeFileSync(path.join(root,'tmp/search-architecture-tests/changed-files.json'),JSON.stringify(changed,null,2));
  console.log(`PASS: local/server fixture parity; selected and shared contacts; secrets; literal regex; mixed OR with scopes; tracker category; cache dedup/invalidation; visual attributes unchanged in ${compared} modified TSX files.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });

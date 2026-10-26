// Actual PATCH handlers, normalization and API errors, with isolated Mongo/session fixtures.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const { NextRequest } = require('next/server');
const root = path.resolve(__dirname,'..'), loaded = new Map();
let session = { user:{email:'fixture@example.test',role:'admin'} }, failWrite=false, retryTransaction=false;
let reads=0,writes=0,transactions=0, maxAudit=0, auditInFlight=0;
const audit=[], timings=[], projections=[];
let overviewPipeline, linkedLookups=0;
const tracker = { _id:'T',name:'Fixture',status:'active',financialYear:'2025-26',fields:[
  {key:'bill',label:'Bill',type:'toggle'}, {key:'status',label:'Status',type:'status',options:['Not Started','Done']},
  {key:'note',label:'Note',type:'text'}, {key:'percentage',label:'Percentage',type:'percentage'},
  {key:'date',label:'Date',type:'date'}, {key:'live',label:'Live',type:'toggle',dataLink:{source:'annualReturn'}},
  {key:'computed',label:'Computed',type:'number',computed:{kind:'difference'}},
] };
let entries=Array.from({length:25},(_,i)=>({_id:String(i),trackerId:'T',clientId:'C'+i,inScope:true,values:{bill:false,status:'Not Started',note:'Old',other:'Preserve'}}));
entries.push({_id:'foreign',trackerId:'other',clientId:'Foreign',inScope:true,values:{bill:false}});
entries.push({_id:'removed',trackerId:'T',clientId:'Removed',inScope:false,values:{bill:false}});
const clone=x=>structuredClone(x);
function matches(e,q) { return Object.entries(q).every(([key,value])=>{if(key==='$or')return value.some(item=>matches(e,item));const actual=key.split('.').reduce((o,k)=>o?.[k],e);return value&&typeof value==='object'? '$in'in value?value.$in.includes(actual):'$ne'in value?actual!==value.$ne:'$exists'in value?(actual!==undefined)===value.$exists:false:actual===value;}); }
function chain(value) { return { select(keys){projections.push(keys);return this;},session(){return this;},lean:async()=>clone(typeof value==='function'?value():value) }; }
function apply(e,update) { for(const [key,value]of Object.entries(update.$set))if(key.startsWith('values.'))e.values[key.slice(7)]=value;else e[key]=value;for(const [key,amount]of Object.entries(update.$inc||{})){const [parent,field]=key.split('.');e[parent]||={};e[parent][field]=(e[parent][field]||0)+amount;} }
const stubs={
  'next-auth':{getServerSession:async()=>session},'@/lib/auth':{authOptions:{}},'@/lib/mongoose':{connectDB:async()=>{}},
  '@/models/ClientTracker':{findById(id){reads++;assert.equal(id,'T');return chain(tracker);}},
  '@/models/ClientTrackerEntry':{
    aggregate(pipeline){overviewPipeline=pipeline;const keys=pipeline.find(s=>s.$project).$project.values.$filter.cond.$in[1];const counts=new Map();for(const entry of entries.filter(e=>e.trackerId==='T'&&e.inScope))for(const key of keys){if(!(key in entry.values))continue;const value=entry.values[key],id=key+JSON.stringify(value),row=counts.get(id)||{_id:{key,value},count:0};row.count++;counts.set(id,row);}return Promise.resolve([...counts.values()]);},
    findOne(query){reads++;return chain(entries.find(e=>matches(e,query))||null);},
    findOneAndUpdate(query,update,options){
      assert.equal(options.new,false,'Atomic audit pre-image');assert.equal(query.trackerId,'T');assert.deepEqual(query.inScope,{$ne:false});
      writes++;const e=entries.find(e=>matches(e,query)),previous=e?clone(e):null;if(e)apply(e,update);return chain(previous);
    },
    find(query){ reads++;assert.equal(query.trackerId,'T');assert.deepEqual(query.inScope,{$ne:false});return chain(()=>entries.filter(e=>matches(e,query))); },
    async updateMany(query,update,options){
      writes++;assert(options.session,'Snapshot and writes share the same transaction');
      if(failWrite){failWrite=false;throw Error('Fixture write failure');}
      const matched=entries.filter(e=>matches(e,query));matched.forEach(e=>apply(e,update));return {modifiedCount:matched.length,matchedCount:matched.length};
    },
    db:{async startSession(){return { async withTransaction(work){transactions++;let snapshot=clone(entries);try{await work();if(retryTransaction){retryTransaction=false;entries=snapshot;snapshot=clone(entries);await work();}}catch(e){entries=snapshot;throw e;}},async endSession(){} };}},
  },
  '@/lib/server/activity-events':{async recordActivityEvent(event,actor){assert(actor);auditInFlight++;maxAudit=Math.max(maxAudit,auditInFlight);await new Promise(r=>setTimeout(r,1));auditInFlight--;audit.push(event);}},
  '@/lib/server/tracker-linked-data':{async resolveTrackerLinkedValues(_fields,ids){linkedLookups++;return new Map(ids.map(id=>[id,{live:true}]));}},
};
function load(relative){const filename=path.join(root,relative);if(loaded.has(filename))return loaded.get(filename).exports;const m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));loaded.set(filename,m);const original=m.require.bind(m);m.require=name=>name in stubs?stubs[name]:name.startsWith('@/')?load(name.slice(2)+'.ts'):original(name);m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);return m.exports;}
async function main(){
  const single=load('app/api/client-trackers/[id]/entries/[entryId]/route.ts').PATCH,bulk=load('app/api/client-trackers/[id]/entries/bulk/route.ts').PATCH;
  async function patch(body,entryId='0',raw=false) { const isBulk=Array.isArray(body.entryIds),start=performance.now(),r0=reads,w0=writes,a0=audit.length;
    if(!raw)body={...body,...(isBulk?{expectedRevisions:Object.fromEntries(body.entryIds.map(id=>[id,entries.find(e=>e._id===id)?.fieldRevisions?.[body.key]||0]))}: {expectedRevision:entries.find(e=>e._id===entryId)?.fieldRevisions?.[body.key]||0})};
    const response=await(isBulk?bulk:single)(new NextRequest('http://fixture/api',{method:'PATCH',body:JSON.stringify(body)}),{params:Promise.resolve({id:'T',entryId})});const result=await response.json();timings.push({kind:isBulk?'bulk':'cell',status:response.status,ms:performance.now()-start,reads:reads-r0,writes:writes-w0,audits:audit.length-a0});return {status:response.status,result}; }
  let response=await patch({key:'bill',value:true});assert.equal(response.status,200);assert.deepEqual(response.result.values,{bill:true});assert(!('client' in response.result));assert.equal(entries[0].values.other,'Preserve');assert.equal(audit.at(-1).detail,'Bill: false → true');assert.equal(timings.at(-1).reads,1);assert.equal(timings.at(-1).writes,1);
  response=await patch({key:'note',value:'  Trimmed  '});assert.equal(response.result.values.note,'Trimmed');assert.equal(audit.at(-1).detail,'Note: Old → Trimmed');
  assert.equal((await patch({key:'bill',value:false,expectedRevision:0},'0',true)).status,409,'Stale same-field request is rejected');
  assert.equal(entries[0].values.bill,true);
  assert.equal((await patch({key:'note',value:'Changed independently',expectedRevision:1},'0',true)).status,200,'Other field changes do not invalidate this field');
  // ABA: even if the value returns to its old state, an old Undo remains stale.
  await patch({key:'bill',value:false});await patch({key:'bill',value:true});
  assert.equal((await patch({key:'bill',value:false,expectedRevision:1},'0',true)).status,409);
  assert.equal((await patch({key:'bill',value:false},'0',true)).status,400,'Missing revision fails closed');
  const staleBulk=await patch({key:'bill',value:false,entryIds:['0','1'],expectedRevisions:{'0':0,'1':0}},'0',true);
  assert.deepEqual(staleBulk.result.appliedIds,['1']);assert.deepEqual(staleBulk.result.conflicts,['0']);assert.equal(entries[0].values.bill,true);
  for(const body of [{key:'status',value:'invalid'},{key:'percentage',value:101},{key:'date',value:'2026-02-30'},{key:'unknown',value:1}])assert.equal((await patch(body)).status,400);
  for(const key of ['live','computed'])assert.equal((await patch({key,value:true})).status,409);
  for(const id of ['foreign','removed','missing'])assert.equal((await patch({key:'bill',value:true},id)).status,404);
  tracker.status='archived';assert.equal((await patch({key:'bill',value:true})).status,409);tracker.status='active';
  session=null;assert.equal((await patch({key:'bill',value:true})).status,401);session={user:{email:'fixture@example.test'}};
  assert.equal((await patch({key:'bill',value:true,entryIds:[]})).status,400);
  assert.equal((await patch({key:'bill',value:true,entryIds:Array(1001).fill('0')})).status,400);
  const ids=entries.slice(0,25).map(e=>e._id),beforeAudit=audit.length;
  retryTransaction=true;response=await patch({key:'status',value:'Done',entryIds:ids});assert.equal(response.status,200);assert.equal(response.result.complete,true);assert.deepEqual(response.result.appliedIds,ids);assert.equal(response.result.previous.length,25);assert.equal(audit.length-beforeAudit,25,'Transaction retries do not duplicate audits');assert(maxAudit<=20);assert(entries.slice(0,25).every(e=>e.values.status==='Done'&&e.values.other==='Preserve'));
  response=await patch({key:'bill',value:true,entryIds:['0','foreign','removed','missing']});assert.deepEqual(response.result.appliedIds,['0']);assert.equal(response.result.complete,false);assert.equal(entries.find(e=>e._id==='foreign').values.bill,false);assert.equal(entries.find(e=>e._id==='removed').values.bill,false);
  const prior=clone(entries);failWrite=true;response=await patch({key:'status',value:'Not Started',entryIds:ids});assert.equal(response.status,500);assert.deepEqual(entries,prior,'Failed bulk rolls back');
  assert(projections.every(p=>!p.split(' ').includes('values')),'Only the edited mark and required tracker configuration are loaded');
  const {resolveTrackerOverview}=load('lib/server/tracker-overview.ts');
  let totals=await resolveTrackerOverview(tracker,['bill']);assert(totals.every(t=>t.key==='bill'));assert.equal(linkedLookups,0);
  assert.deepEqual(overviewPipeline.find(s=>s.$project).$project.values.$filter.cond.$in[1],['bill']);
  totals=await resolveTrackerOverview(tracker,['live']);assert.equal(linkedLookups,1);assert.deepEqual(totals,[{key:'live',value:true,count:25}]);
  console.log('PASS: field-scoped whole-tracker aggregation omits unrelated/manual dependencies; dynamic totals remain authoritative');
  fs.mkdirSync(path.join(root,'tmp/tracker-editing-tests'),{recursive:true});fs.writeFileSync(path.join(root,'tmp/tracker-editing-tests/route-measurements.json'),JSON.stringify({environment:'Actual route handlers with in-memory database fixtures; not live MongoDB latency',timings,transactions,maxAudit},null,2));
  console.log('PASS: normalized scoped PATCH, atomic previous values, narrow queries, permissions/validation, transaction retry/rollback, exact bulk acknowledgements and 25 bounded audit records');
  console.log(JSON.stringify(timings.filter(x=>x.status===200),null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

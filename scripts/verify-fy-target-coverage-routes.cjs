/* Authenticated production GET with isolated model/ledger responses. No live DB. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const root = path.resolve(__dirname,'..'), cache = new Map();
let session={user:{email:'fixture@example.invalid'}}, records=[], ledger=[], writes=0, pipeline, dbReads=0, scope;
const stubs={
  'next-auth':{getServerSession:async()=>session}, '@/lib/auth':{authOptions:{}}, '@/lib/mongoose':{connectDB:async()=>{dbReads++;}},
  '@/models/FinancialYear':{find:query=>{scope=query;return{sort(){return this;},lean:async()=>structuredClone(records.filter(record=>Object.entries(query).every(([key,value])=>record[key]===value))) };},create:()=>{writes++;throw Error('Unexpected write');},findOneAndUpdate:()=>{writes++;throw Error('Unexpected write');}},
  '@/models/CreditTransaction':{aggregate:async value=>{pipeline=value;return structuredClone(ledger);}},
  '@/lib/server/activity-events':{recordActivityEvent:async()=>{writes++;throw Error('Read must never write activity');}},
};
function load(file){const filename=path.join(root,file);if(cache.has(filename))return cache.get(filename).exports;const module=new Module(filename);module.filename=filename;module.paths=Module._nodeModulePaths(path.dirname(filename));cache.set(filename,module);const original=module.require.bind(module);module.require=name=>name in stubs?stubs[name]:name.startsWith('@/')?load(name.slice(2)+'.ts'):original(name);module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);return module.exports;}
const {GET}=load('app/api/financial-year/route.ts'), {calculateTargetCoverage:calculate}=load('lib/financial-year-coverage.ts');
const entry=(type,value)=>({categoryId:'2',type,value});
const grouped=(fy,to,type,q2,invalidQuantities=0)=>({_id:{fy,to,from:'PWP',type},q1:0,q2,q3:0,q4:0,invalidQuantities});
const checks=[];
async function read(){const response=await GET(new Request('http://fixture/api/financial-year?clientId=TEST&fy=2025-26'));assert.equal(response.status,200);return response.json();}
function pass(message){checks.push(message);console.log('PASS: '+message);}
async function main(){
  records=[{clientId:'TEST',financialYear:'2025-26',targets:[entry('RECYCLING',17),entry('EOL',26)]},{clientId:'OTHER',financialYear:'2025-26',targets:[entry('EOL',1000)]}];
  ledger=[grouped('2025-26','TEST','EOL',200),grouped('2024-25','TEST','RECYCLING',900),grouped('2025-26','OTHER','RECYCLING',900)];
  const original=structuredClone(records);let [record]=await read();const coverage=calculate(record);
  assert.deepEqual(scope,{clientId:'TEST',financialYear:'2025-26'});assert.equal(coverage.covered,26);assert.equal(coverage.pending,17);assert.equal(record.achievedByType[0].value,200);assert.deepEqual(records,original);assert.equal(writes,0);
  assert.deepEqual(pipeline[0].$match.financialYear,{$in:['2025-26']});assert.equal(pipeline.length,2);
  pass('Selected client/FY query and existing grouped ledger yield 26/43 coverage; other clients/years do not contribute; GET has no writes');
  function expression(value,row){if(typeof value==='string'&&value.startsWith('$'))return row[value.slice(1)];if(value&&typeof value==='object'&&'$ifNull'in value){const first=expression(value.$ifNull[0],row);return first==null?expression(value.$ifNull[1],row):first;}return value;}
  const amount=pipeline[1].$group.q2.$sum;
  assert.equal(expression(amount,{cat2Qty:0,cat2:999}),0);assert.equal(expression(amount,{cat2:12.125}),12.125);assert.equal(expression(amount,{cat2Qty:1.75,cat2:999}),1.75);
  pass('Canonical quantities including explicit zero take precedence; legacy quantities are used only when canonical values are absent');
  records=[{clientId:'TEST',financialYear:'2025-26',targets:[],cat1Target:0,cat2Target:43,cat3Target:0,cat4Target:0}];
  [record]=await read();assert.equal(record.targetTracking.source,'legacy');assert.equal(calculate(record).percentage,null);assert.equal(calculate(record).target,43);assert.equal(records[0].targets.length,0);
  pass('Read-only provenance prevents compatibility-generated Recycling entries from certifying a legacy allocation');
  records=[{clientId:'TEST',financialYear:'2025-26',targets:[entry('RECYCLING',0),entry('EOL',0)],cat2Target:43}];
  [record]=await read();assert.equal(record.cat2Target,0);assert.equal(record.totalTarget,0);assert.equal(calculate(record).status,'No target');assert.equal(calculate(record).target,0);
  pass('Explicit structured zero targets never revive stale positive legacy mirrors');
  records=[{clientId:'TEST',financialYear:'2025-26',targets:[entry('RECYCLING',17),entry('EOL',26)]}];
  for(const invalid of [grouped('2025-26','TEST','UNKNOWN',200),grouped('2025-26','TEST','EOL',200,1)]){
    ledger=[invalid];[record]=await read();assert(record.targetTracking.usageIssues.length);assert.equal(calculate(record).percentage,null);
  }
  records[0].targets.push(entry('EOL',26));ledger=[];[record]=await read();assert(record.targetTracking.issues.some(issue=>issue.includes('Duplicate')));assert.equal(calculate(record).percentage,null);
  pass('Unknown ledger types, invalid quantities and duplicate target buckets stay incomplete instead of becoming false 100% coverage');
  session=null;const before=dbReads;const response=await GET(new Request('http://fixture/api/financial-year?clientId=TEST&fy=2025-26'));assert.equal(response.status,401);assert.equal(dbReads,before);assert.equal(writes,0);
  pass('Unauthenticated GET is rejected before database reads; no migrations, ledger writes or activity writes');
  const arg=process.argv.indexOf('--output');if(arg>=0)fs.writeFileSync(path.resolve(process.argv[arg+1]),JSON.stringify({passed:true,checks,writes},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

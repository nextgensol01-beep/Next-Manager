const assert = require('node:assert/strict');
const { pipeline, matches } = require('./search-fixture-pipeline.cjs');
const createLoader = require('./search-test-loader.cjs');
const { NextRequest } = require('next/server');
let session = {user:{role:'user'}}, reads = 0;
const personId='0123456789abcdef01234567';
const db = {
  clients:Array.from({length:305},(_,index)=>({_id:'client-'+index,clientId:'C'+index,companyName:'Company '+index,legalName:index===304?'Needle Legal Name':'Legal '+index,category:index%2?'PWP':'Producer',state:'Gujarat',createdAt:index,customFields:{region:index===304?'Rare Region':'Common',secret:'hidden-secret'}})),
  clientcontacts:[{clientId:'C304',personId,selectedPhones:['98765 43210'],selectedEmails:['needle@example.com']},{clientId:'C303',personId,selectedPhones:[],selectedEmails:[]}],
  people:[{_id:personId,name:'Shared Person',phoneNumbers:['98765 43210','9999999999'],emails:['needle@example.com','unselected@example.com']}],
  clientcustomfields:[{key:'region',active:true,searchable:true},{key:'secret',active:true,searchable:true,type:'password'}],
  clientcustomfieldgroups:[],
  annualreturns:[{_id:'ar1',clientId:'C304',financialYear:'2025-26',status:'Pending',updatedAt:1},{_id:'ar2',clientId:'C303',financialYear:'2025-26',status:'Filed',updatedAt:2},{_id:'ar3',clientId:'C304',financialYear:'2024-25',status:'Filed',updatedAt:3}],
  invoices:[{_id:'i1',clientId:'C304',financialYear:'2025-26',fromDate:'2025-04-01',toDate:'2025-04-30',status:'Received'}],
  quotations:[{_id:'q1',clientId:'C304',clientName:'Company 304',financialYear:'2025-26',status:'Accepted',quotationNumber:'NG-123',updatedAt:1}],
  quotationrevisions:[],
  emaillogs:Array.from({length:305},(_,index)=>({_id:'email-'+index,clientId:index===304?'C304':'C0',clientName:index===304?'Old Snapshot':'Company 0',type:'custom',subject:index===304?'Old invoice marker':'Subject '+index,to:index===304?['needle@example.com']:['other@example.com'],financialYear:'2025-26',sentAt:305-index})),
  deletedrecords:Array.from({length:305},(_,index)=>({_id:'trash-'+index,recordType:'billing',label:index===304?'Old Trash Needle':'Trash '+index,subLabel:'Billing',deletedAt:305-index})),
  documents:[],
};
const collectionNames = {Person:'people',Client:'clients',ClientContact:'clientcontacts',ClientCustomField:'clientcustomfields',ClientCustomFieldGroup:'clientcustomfieldgroups',AnnualReturn:'annualreturns',Invoice:'invoices',Quotation:'quotations',QuotationRevision:'quotationrevisions',EmailLog:'emaillogs',DeletedRecord:'deletedrecords',Document:'documents'};
for(const model of ['FinancialYear','CreditTransaction','Billing','Payment','UploadRecord','ClientWorkItem','ActivityEvent']) { const name=model.toLowerCase()+'s';collectionNames[model]=name;db[name]=[]; }
const clone = value=>structuredClone(value);
function chain(value) {
  return {select(){return this;},sort(order){value=pipeline(value,[{$sort:order}],db);return this;},skip(offset){value=value.slice(offset);return this;},limit(size){value=value.slice(0,size);return this;},lean:async()=>clone(value),then(resolve,reject){return Promise.resolve(clone(value)).then(resolve,reject);}};
}
const mocks = {
  'next-auth':{getServerSession:async()=>session},'@/lib/auth':{authOptions:{}},'@/lib/mongoose':{connectDB:async()=>{}},
  '@/lib/server/annual-return-status-service':{syncAnnualReturnStatus:async()=>{}},'@/lib/server/activity-events':{recordActivityEvent:async()=>{}},
  '@/lib/quotationWorkflow':{expireStaleQuotations:async()=>{}},
};
for(const [model,name] of Object.entries(collectionNames)) mocks['@/models/'+model]={collection:{name},find(query={}){reads++;return chain((db[name]||[]).filter(row=>matches(row,query)));},countDocuments:async query=>(db[name]||[]).filter(row=>matches(row,query)).length,aggregate:async stages=>{reads++;return pipeline(clone(db[name]||[]),stages,db);}};
// Production secret exclusion logic is exercised using actual credentials service.
const load=createLoader(mocks);
async function call(file,query,expected=200) {
  const response=await load(file).GET(new NextRequest('http://localhost/api?'+query));
  assert.equal(response.status,expected,file+' status');return response.json();
}
async function main() {
  const files=['app/api/clients/route.ts','app/api/annual-return/route.ts','app/api/invoices/route.ts','app/api/invoices/coverage/route.ts','app/api/email-log/route.ts','app/api/trash/route.ts','app/api/quotations/route.ts'];
  session=null;const before=reads;
  for(const file of files) await call(file,'search=9876543210',401);
  assert.equal(reads,before,'Unauthenticated requests must not query data');session={user:{role:'user'}};
  for(const file of files) await call(file,'search='+encodeURIComponent('x'.repeat(201)),400);
  const summary=await call(files[0],'summary=1&limit=12&search=9876543210');assert.deepEqual(summary.map(c=>c.clientId),['C304']);assert(!JSON.stringify(summary).includes('98765'));
  const clientPage=await call(files[0],'limit=30&offset=0&search=Needle Legal');assert.equal(clientPage.total,1);assert.equal(clientPage.items[0].clientId,'C304');assert.equal(clientPage.hasMore,false);
  assert.equal((await call(files[0],'summary=1&search=hidden-secret')).length,0);
  const full=await call(files[0],'');assert(full.find(c=>c.clientId==='C304').searchValues.includes('Rare Region'));assert(!JSON.stringify(full).includes('hidden-secret'));
  assert.equal((await call(files[0],'summary=1&search=unselected@example.com')).length,0);
  assert.equal((await call(files[1],'search=9876543210&fy=2025-26&status=Not%20Started')).length,1);
  assert.equal((await call(files[1],'search=9876543210&fy=2025-26&clientId=C303')).length,0,'Search must not overwrite explicit client scope');
  assert.equal((await call(files[2],'search=needle@example.com&fy=2025-26')).length,1);
  assert.equal((await call(files[2],'search=needle@example.com&fy=2025-26&clientId=C303')).length,0);
  assert.equal((await call(files[3],'search=Rare%20Region&fy=2025-26')).length,1);
  for(const term of ['9876543210','NG-123','Accepted','2025-26']) assert.equal((await call(files[6],'search='+encodeURIComponent(term))).length,1);
  assert.equal((await call(files[6],'search=9876543210&status=Draft')).length,0);
  assert.equal((await call(files[4],'search=9876543210')).length,1,'Contact search must find old email outside original 200');
  assert.equal((await call(files[4],'search=Old%20invoice%20marker')).length,1);
  assert.equal((await call(files[5],'search=Old%20Trash%20Needle')).length,1);
  assert.equal((await call(files[5],'search=Old%20Trash%20Needle&type=payment')).length,0);
  for(const file of [files[4],files[5]]) {
    const first=await call(file,'paged=1');assert.equal(first.items.length,200);assert.equal(first.hasMore,true);assert.equal(first.nextOffset,200);
    const second=await call(file,'paged=1&offset=200');assert.equal(second.items.length,105);assert.equal(second.hasMore,false);
    assert.equal(new Set([...first.items,...second.items].map(row=>row._id)).size,305);
  }
  const reporting=load('lib/reporting.ts');
  const buildReport=load('lib/server/reporting-service.ts').buildReport;
  const reportQuery={...reporting.createReportQuery('2025-26','clients'),rowMode:'client',includeZero:true,quotationStatuses:[],sentOnly:false,hasTarget:'all',clientCategories:[],sortBy:'companyName',page:1,pageSize:10};
  for(const search of ['9876543210','Rare Region','NG-123']) {
    const report=await buildReport({...reportQuery,search});assert.equal(report.rows.length,1);assert.equal(report.rows[0].clientId,'C304');
  }
  assert.equal((await buildReport({...reportQuery,search:'9876543210',clientCategories:['PWP']})).rows.length,0);
  const studioScope=await buildReport(reportQuery,{clientSearch:'9876543210',clientSearchFields:['gstNumber','registrationNumber']});assert.equal(studioScope.rows[0].clientId,'C304');
  const savedLegalName=db.clients[304].legalName;
  db.clients[304].legalName='';db.clients[304].customFields.legalName='Legacy Legal Needle';
  assert.equal((await buildReport(reportQuery,{clientSearch:'Legacy Legal Needle'})).rows[0].clientId,'C304','Retain Report Studio legacy legal-name fallback');
  db.clients[304].legalName=savedLegalName;
  const exported=await buildReport({...reportQuery,search:'Company'},{exportAll:true});assert.equal(exported.rows.length,305,'Report export searches before pagination');
  const pagedReport=await buildReport({...reportQuery,search:'Company'});assert.equal(pagedReport.rows.length,10);assert.equal(pagedReport.pagination.totalRows,305);
  console.log('PASS: production Clients/summary, Annual Return, invoices/coverage, quotations, email and Trash routes: contact/custom matching, secrets, preserved filters, 401/400, matches beyond first page, bounded continuation pages.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});

/* Actual tracker components + real CSS, isolated HTTP fixtures only. Never
 * connects to MongoDB/Drive/Gmail. Output and a single reused Chrome profile
 * belong to this run, not to historical project evidence. */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core'), runtime = require('next/dist/compiled/webpack/webpack');
const root = path.resolve(__dirname, '..');
const taskArg = process.argv.indexOf('--task');
const task = taskArg >= 0 ? path.resolve(process.argv[taskArg + 1]) : fs.mkdtempSync(path.join(root, 'tmp/tracker-responsive-task-'));
assert(path.dirname(task) === path.join(root, 'tmp') && path.basename(task).startsWith('tracker-responsive-task-'));
fs.mkdirSync(task, { recursive: true });
const output = path.join(task, 'fixture'); fs.mkdirSync(output, { recursive: true });
const trackerId = '0123456789abcdef01234567', trackerPath = '/api/client-trackers/' + trackerId;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const categories = ['Producer', 'Importer', 'Brand Owner', 'PWP'];
const clients = Array.from({ length: 222 }, (_, i) => ({ clientId: 'C' + i, companyName: i ? 'Fictional client ' + i : 'Long fictional client organisation with an unusually long legal name ' + 'X'.repeat(50), category: categories[i % 4], state: 'Gujarat', address: 'Long fictional address '.repeat(12) }));
const fields = [
  { key: 'status', label: 'Status', type: 'status', options: ['Not Started', 'Done'] },
  { key: 'ready', label: 'Ready', type: 'toggle' },
  ...['select','text','longText','number','currency','percentage','quantity','date','progress','multiSelect','tags'].map(type => ({ key: type, label: type, type, options: ['First', 'Second', 'Long option ' + 'Z'.repeat(30)] })),
  { key: 'linked', label: 'Live value', type: 'toggle', dataLink: { source: 'annualReturn', display: 'yesNo' } },
  { key: 'computed', label: 'Computed value', type: 'number', computed: { kind: 'percentage', primaryFieldKey: 'number', secondaryFieldKey: 'quantity' } },
];
const conditionGroup = { mode: 'ALL', conditions: [{ fieldKey: 'ready', operator: 'equals', value: 'Yes' }] };
const workflow = { id: 'W1', name: 'Compliance update for fictional clients', description: 'Retain this workflow draft across every step and rotation.', mainFieldKey: 'ready', mainValue: 'Yes', conditionGroup, contentMode: 'points',
  subject: 'Update {{client.companyName}}', body: '<p>Dear {{client.companyName}},</p><p>{{points}}</p>', points: [], contentRules: [{ id: 'R1', type: 'point', action: 'include', content: '<p>Review your documents.</p>', conditionGroup, order: 0 }], recipientStrategy: 'selected', signatureGap: 2, attachments: [{ id: 'A1', source: 'client_latest', category: 'certificates', documentKind: 'general', financialYear: 'tracker' }] };
let tracker = { _id: trackerId, name: 'Migration Confirmation with a long tracker title ' + 'T'.repeat(28), description: 'A fictional compliance tracker used for responsive testing only.', financialYear: '2025-26', fields, status: 'active', clientColumns: ['state','address'], clientIds: clients.map(x => x.clientId), clientScope: 'categories', clientCategories: categories, clientMembershipMode: 'categorySync', emailEnabled: true, emailWorkflows: [workflow], updatedAt: '2026-10-22T00:00:00Z' };
const entries = clients.map((client, i) => ({ _id: 'E' + i, trackerId, clientId: client.clientId, client, updatedAt: '2026-10-22T00:00:00Z', fieldRevisions: {}, values: { status: 'Not Started', ready: true, select: 'First', text: 'Saved text', longText: 'Saved note', number: 4, currency: 4, percentage: 25, quantity: 16, date: '2026-10-22', progress: 25, multiSelect: ['First'], tags: ['First'], linked: true, computed: 25 } }));
const requests = [], approvals = new Map();
let saveCount = 0;
const messages = () => clients.slice(0,3).map((client, i) => ({ entryId: 'E' + i, clientId: client.clientId, companyName: client.companyName,
  to: 'person' + i + '@example.invalid', suggestedTo: ['person' + i + '@example.invalid'], recipients: [{ email: 'person' + i + '@example.invalid', name: 'Fictional person', isPrimary: true }, { email: 'long-contact-address-' + 'a'.repeat(55) + '@example.invalid', name: 'Accounts', isPrimary: false }], subject: 'Fictional update ' + client.companyName,
  body: 'Fictional body only.', html: '<html><body><p>Fictional email body. No real email is sent.</p></body></html>', points: [], statements: [], attachments: [{ documentId: 'D' + i, filename: 'Fictional client certificate ' + 'a'.repeat(100) + '.pdf', mimeType: 'application/pdf', fileSize: 4000, required: true, category: 'certificates', financialYear: '2025-26' }], attachmentWarnings: [{ required: false, code: 'missing_document', message: 'Optional fictional document was not found.' }], attachmentSnapshot: 'fictional-' + i }));
const job = { campaignId: 'responsive-fixture', trackerId, trackerName: tracker.name, workflowName: workflow.name, kind: 'initial', mode: 'send', status: 'interrupted', total: 15, processed: 6, sent: 4, drafts: 0, failed: 1, uncertain: 1, pending: 9, delivering: 0, executionMode: 'browser', canResume: true, controllerLeaseExpiresAt: null, needsHistoryRepair: false, createdAt: '2026-10-22T00:00:00Z', updatedAt: '2026-10-22T00:01:00Z', message: 'Fictional interrupted campaign' };
async function main() {
  runtime.init();
  await new Promise((resolve,reject) => {
    const compiler = runtime.webpack({ mode: 'development', devtool: false, context: root, entry: path.join(__dirname, 'fixtures/tracker-responsive.tsx'), output: { path: output, filename: 'fixture.js' },
      resolve: { extensions: ['.tsx','.ts','.js'], alias: { '@': root, 'next/link': path.join(__dirname,'fixtures/tracker-next-link.cjs'), 'next-auth/react': path.join(__dirname,'fixtures/tracker-session.cjs') } },
      module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname,'fixtures/workflow-editor-loader.cjs') }, { test: /\.css$/, type: 'asset/source' }] } });
    compiler.run((error,stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all:false, errors:true }))) : resolve()));
  });
  const css = (await require('postcss')([require('tailwindcss')(path.join(root,'tailwind.config.ts'))]).process(fs.readFileSync(path.join(root,'app/globals.css'),'utf8').replace(/^@import .+$/gm,''),{ from:path.join(root,'app/globals.css') })).css
    + ['components/ui/liquid-glass/liquid-glass.css','app/client-profile-premium.css','app/tracker-create.css','app/tracker-configure.css','components/client-trackers/email-delivery-review.css','components/client-trackers/email-delivery-security.css','components/client-trackers/email-delivery-activity.css'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n')
    + 'body{margin:0;font-family:Arial,sans-serif;background:var(--color-surface);color:var(--color-text)}';
  const responsive = fs.readFileSync(path.join(root,'components/client-trackers/tracker-responsive.css'),'utf8');
  const server = http.createServer(async(req,res) => {
    try {
      const url = new URL(req.url,'http://fixture');
      if(url.pathname.endsWith('.js')) { res.setHeader('content-type','application/javascript'); res.end(fs.readFileSync(path.join(output,path.basename(url.pathname)))); return; }
      if(!url.pathname.startsWith('/api/')) { res.setHeader('content-type','text/html'); res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><style id="tracker-responsive-style">'+responsive+'</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); return; }
      let raw=''; for await(const chunk of req)raw+=chunk; const body=raw?JSON.parse(raw):{};
      requests.push({ path:url.pathname, query:url.search, method:req.method });
      let data={}, status=200;
      if(url.pathname==='/api/clients') data=clients;
      else if(url.pathname==='/api/client-trackers') {
        if(req.method==='POST') { saveCount++; data={...body,_id:trackerId,entryCount:222}; }
        else data=[tracker,{...tracker,_id:'1123456789abcdef01234567',name:'Producer tracker'}, {...tracker,_id:'2123456789abcdef01234567',name:'PWP tracker'}].map(x=>({...x,entryCount:222}));
      } else if(url.pathname===trackerPath) {
        if(req.method==='PATCH') { tracker={...tracker,...body}; saveCount++; data=tracker; }
        else if(url.searchParams.has('overviewOnly')) data={totalEntryCount:222,overviewCounts:fields.filter(f=>['status','select','toggle'].includes(f.type)).flatMap(f=>[...new Set(entries.map(e=>e.values[f.key]))].map(value=>({key:f.key,value,count:entries.filter(e=>e.values[f.key]===value).length})))};
        else { const search=(url.searchParams.get('search')||'').toLowerCase(), category=url.searchParams.get('category'), key=url.searchParams.get('field'),value=url.searchParams.get('value'); const filtered=entries.filter(e=>(!search||e.client.companyName.toLowerCase().includes(search))&&(!category||e.client.category===category)&&(!key||!value||String(e.values[key])===String(value==='Yes'?true:value==='No'?false:value)));const offset=Number(url.searchParams.get('offset')||0);data={...tracker,entries:filtered.slice(offset,offset+100),totalEntryCount:222,entryCount:filtered.length,offset,hasMore:offset+100<filtered.length,nextOffset:offset+100<filtered.length?offset+100:null}; }
      } else if(url.pathname.endsWith('/entries/bulk')&&req.method==='PATCH') {
        const applied=entries.filter(e=>body.entryIds.includes(e._id));const previous=applied.map(e=>({id:e._id,value:e.values[body.key],revision:(e.fieldRevisions[body.key]||0)+1}));for(const entry of applied){entry.values[body.key]=body.value;entry.fieldRevisions[body.key]=(entry.fieldRevisions[body.key]||0)+1;}data={updated:applied.length,previous,appliedIds:applied.map(e=>e._id),revisions:Object.fromEntries(applied.map(e=>[e._id,e.fieldRevisions[body.key]])),value:body.value,complete:true,conflicts:[]};
      } else if(url.pathname.includes('/entries/')&&req.method==='PATCH') {
        const entry=entries.find(e=>e._id===url.pathname.split('/').pop()); assert(entry); const previousValue=entry.values[body.key]; entry.values[body.key]=body.value; entry.fieldRevisions[body.key]=(entry.fieldRevisions[body.key]||0)+1;data={...entry,previousValue};
      } else if(url.pathname.endsWith('/sync')) data={token:'fixture-preview',currentCount:222,additions:0,afterCount:222,clients:[]};
      else if(url.pathname.endsWith('/activity')) data={events:[{_id:'fixture-event',label:clients[0].companyName,detail:'A very long fictional activity update '.repeat(12),actorEmail:'fixture@example.invalid',occurredAt:'2026-10-22T00:00:00Z'}]};
      else if(url.pathname===trackerPath+'/email') data=req.method==='POST'?{workflow:{id:workflow.id,name:workflow.name,signatureGap:2},messages:messages(),skipped:[{clientId:'C9',companyName:'Fictional skipped client',reasonCode:'no_recipient',reason:'No selected email contact exists for this fictional client.'}]}:{logs:[],summary:{total:12,sent:8,draft:4,reminders:3}};
      else if(url.pathname.includes('/email/deliver')) throw Error('Sending is forbidden in responsive QA');
      else if(url.pathname==='/api/documents') data=[{_id:'D0',clientId:'C0',filename:'Fictional certificate.pdf',category:'certificates',documentKind:'general',fileSize:4000}];
      else if(url.pathname==='/api/email/default-signature') data={signature:'<p>Fictional signature</p>'};
      else if(url.pathname==='/api/settings/email-delivery-security') data={draftProtection:'confirmation',directSendProtection:'emailOtpAndPin',holdToSend:true,version:1,approvalEmailMasked:'f•••@example.invalid',approvalEmailVerified:true,sendPinConfigured:true,largeBatchThreshold:50,requireEmailOtpForLargeBatch:true};
      else if(url.pathname.endsWith('/approval/request')) { data={approvalId:'fictional-approval',methodsRequired:['emailOtp','sendPin'],methodsVerified:[],approvalEmailMasked:'f•••@example.invalid',expiresAt:new Date(Date.now()+300000).toISOString(),otpExpiresAt:new Date(Date.now()+300000).toISOString(),resendAvailableAt:new Date(Date.now()+45000).toISOString(),status:'pending',messageCount:3,holdToSend:true};approvals.set(data.approvalId,data); }
      else if(url.pathname.endsWith('/approval/verify')) { const previous=approvals.get(body.approvalId);const verified=[...previous.methodsVerified,body.otp?'emailOtp':'sendPin']; data={...previous,methodsVerified:verified,status:verified.length===2?'verified':'pending'};approvals.set(body.approvalId,data); }
      else if(url.pathname==='/api/email-delivery/jobs') data={jobs:[job],nextCursor:null};
      else if(url.pathname.startsWith('/api/email-delivery/jobs/')) data={job,items:[],nextCursor:null};
      res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(data));
    } catch(error) { res.statusCode=500;res.end(JSON.stringify({error:error.message})); }
  });
  const sockets=new Set();server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser, page; const checks=[], metrics=[];
  try {
    browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(task,'browser-profile'),args:['--no-sandbox','--disable-gpu']});
    page=await browser.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    const origin='http://127.0.0.1:'+server.address().port;
    async function open(view='detail') {await page.goto(origin+'/?view='+view);await page.waitForSelector(view==='list'?'[data-tracker-transition-id]':view==='hold'?'.email-security-hold':view==='dock'?'.delivery-activity-dock':'.tracker-client-row');await wait(180);}
    async function clickText(text,scope='body') {const found=await page.$eval(scope,(node,text)=>{const control=[...node.querySelectorAll('button,summary')].find(n=>n.textContent.trim()===text);if(!control)return false;control.click();return true;},text);assert(found,'Control not found: '+text);await wait(220);}
    async function fit(label) {
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const value=await page.evaluate(()=>{const width=innerWidth,dialogs=[...document.querySelectorAll('[role=dialog]:not([inert])')];const panel=dialogs.at(-1)||document.querySelector('.delivery-activity-dock')||document.querySelector('.client-trackers-page')||document.body;const r=panel.getBoundingClientRect();const offenders=[...panel.querySelectorAll('input,select,textarea,button,[contenteditable=true]')].filter(n=>{const b=n.getBoundingClientRect(),style=getComputedStyle(n);if(n.closest('.fluid-step-scroll')||(innerWidth>=768&&n.closest('.overflow-x-auto')))return false;return b.width&&b.height&&style.visibility!=='hidden'&&!n.closest('[inert]')&&(b.left<r.left-2||b.right>r.right+2);}).map(n=>({tag:n.tagName,label:n.getAttribute('aria-label')||n.textContent.slice(0,40),class:n.className}));return{width,height:innerHeight,documentWidth:document.documentElement.scrollWidth,panel:{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom},offenders};});
      metrics.push({label,...value}); assert(value.documentWidth<=value.width+1,label+' page overflow '+JSON.stringify(value));assert(value.panel.x>=-1&&value.panel.width<=value.width+1,label+' panel overflow');
      if(label.startsWith('progress-dock')||await page.$('[role=dialog]:not([inert])'))assert(value.panel.y>=-2&&value.panel.bottom<=value.height+2,label+' modal outside viewport '+JSON.stringify(value.panel));
      assert.deepEqual(value.offenders,[],label+' clipped controls');
    }
    async function closeDialog() {const close=await page.$('[role=dialog]:not([inert]) .tracker-modal-header > button');if(close)await close.click();await wait(300);}
    async function menu(text) {await page.$eval('.tracker-header-menu',n=>n.open=true);await clickText(text,'.tracker-header-menu');await page.waitForSelector('[role=dialog]');await wait(250);}
    const widthsArg=process.argv.indexOf('--widths');
    const widths=widthsArg<0?[320,360,375,390,430,600,768,820,1024,1280,1440]:process.argv[widthsArg+1].split(',').map(Number);
    for(const width of widths) {
      await page.setViewport({width,height:900,hasTouch:width<1024});await open('list');await fit('listing-'+width);
      await page.type('input[placeholder="Search trackers"]','Producer');assert.equal(await page.$$eval('[data-tracker-transition-id]',n=>n.length),1);await page.$eval('input[placeholder="Search trackers"]',n=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(n,'');n.dispatchEvent(new Event('input',{bubbles:true}));});
      await clickText('Create tracker');await page.waitForSelector('.tracker-create-modal');await fit('create-'+width);await closeDialog();
      await open();await fit('detail-'+width);
      if(width<768) {await page.click('.tracker-client-row:first-child .tracker-mobile-toggle');await fit('expanded-row-'+width);assert.equal(await page.$eval('.tracker-client-row:first-child',n=>[...n.querySelectorAll('[data-tracker-field]')].filter(x=>getComputedStyle(x).display!=='none').length),fields.length);}
      if(width===390){await page.$eval('.tracker-marks-panel',n=>n.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(task,'client-marks-390.png')});}
      await menu('Configure');await page.waitForSelector('.configure-workspace');await fit('configure-'+width);await closeDialog();
      await menu('Email updates');await page.waitForSelector('.tracker-email-workflow-card');await page.click('.tracker-email-workflow-card');await page.waitForSelector('.fluid-step-track');await wait(180);
      for(const step of [1,2,3,4,5,6,7]) {await page.$eval(`[aria-label^="Step ${step}:"]`,n=>n.click());await wait(160);await page.waitForFunction(()=>{const n=document.querySelector('.fluid-step[aria-current=step]'),r=n.getBoundingClientRect(),v=n.closest('.fluid-step-scroll').getBoundingClientRect();return r.left>=v.left-1&&r.right<=v.right+1;});await fit('workflow-'+step+'-'+width);}
      await page.$eval('[aria-label^="Step 1:"]',n=>n.click());await wait(150);
      if(width===390||width===1440)await page.screenshot({path:path.join(task,'workflow-'+width+'.png')});
      await closeDialog();checks.push('listing/create/detail/all fields/configure/seven steps: '+width);console.log('PASS: responsive workflow matrix '+width);
    }
    // Action/draft checks use the same cell component through a rotation.
    await page.setViewport({width:390,height:844,hasTouch:true});await open();await page.click('.tracker-client-row:first-child .tracker-mobile-toggle');
    const text='.tracker-client-row:first-child [data-tracker-field="text"] input';await page.$eval(text,n=>{n.focus();n.select();});await page.type(text,'Rotating draft');
    await page.setViewport({width:820,height:600,hasTouch:true});assert.equal(await page.$eval(text,n=>n.value),'Rotating draft');await page.keyboard.press('Enter');await wait(250);assert.equal(entries[0].values.text,'Rotating draft');
    await page.setViewport({width:390,height:844,hasTouch:true});await page.click('.tracker-client-row:first-child [role=switch]');await wait(250);assert.equal(entries[0].values.ready,false);
    await page.select('.tracker-client-row:first-child [data-tracker-field="select"] select','Second');await wait(200);assert.equal(entries[0].values.select,'Second');
    await page.focus('.tracker-client-row:first-child [role=switch]');await page.keyboard.press('ArrowDown');await page.waitForFunction(()=>document.querySelector('.tracker-client-row:nth-child(2)')?.dataset.mobileExpanded==='true'&&document.activeElement===document.querySelector('.tracker-client-row:nth-child(2) [role=switch]'));
    await page.click('.tracker-client-row:first-child .tracker-row-selection input');await page.waitForSelector('.tracker-bulk-actions');await fit('selected-bulk');await page.select('[aria-label="Bulk marker"]','status');await page.select('[aria-label="Bulk marker value"]','Done');await clickText('Apply','.tracker-bulk-actions');await clickText('Apply to selected','[role=dialog]');await wait(250);assert.equal(entries[0].values.status,'Done');
    checks.push('single mounted editor survives rotation; text/toggle/dropdown writes; selection and bulk controls');
    await open('list');await clickText('Create tracker');await page.waitForSelector('#create-tracker-name');await page.type('#create-tracker-name','Responsive fictional worklist');await page.setViewport({width:600,height:390,hasTouch:true});assert.equal(await page.$eval('#create-tracker-name',n=>n.value),'Responsive fictional worklist');await fit('create-draft-landscape');await page.click('button[form="create-client-tracker"]');await page.waitForFunction(()=>!document.querySelector('.tracker-create-modal'));assert(saveCount>0);
    await page.setViewport({width:390,height:844,hasTouch:true});await open();await menu('Configure');await page.waitForSelector('[aria-label="Eligible categories"]');
    for(const category of categories){await page.$$eval('[aria-label="Eligible categories"] button',(nodes,category)=>nodes.find(n=>n.textContent.trim()===category).click(),category);await page.$$eval('[aria-label="Eligible categories"] button',(nodes,category)=>nodes.find(n=>n.textContent.trim()===category).click(),category);}
    assert.equal(await page.$$eval('[aria-label="Eligible categories"] [aria-pressed=true]',n=>n.length),4);
    for(const label of ['Manual Sync','Auto Sync'])await page.$$eval('[aria-label="Client synchronization"] button',(nodes,label)=>nodes.find(n=>n.textContent.startsWith(label)).click(),label);
    await fit('configure-audience-sync-controls');await closeDialog();
    await menu('Email updates');await page.click('.tracker-email-workflow-card');await page.waitForSelector('.tracker-email-about-field input');
    const name='.tracker-email-about-field input';await page.$eval(name,n=>{n.focus();n.select();});await page.type(name,'Mobile workflow draft');
    for(const step of [2,7,1]){await page.$eval(`[aria-label^="Step ${step}:"]`,n=>n.click());await wait(200);}
    assert.equal(await page.$eval(name,n=>n.value),'Mobile workflow draft');
    await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,get:()=>380});visualViewport.dispatchEvent(new Event('resize'));});await fit('workflow-visual-keyboard');assert(await page.$eval('.tracker-email-modal',n=>n.classList.contains('is-short-viewport')&&n.getBoundingClientRect().bottom<=380));assert.equal(await page.$eval(name,n=>n.value),'Mobile workflow draft');await page.evaluate(()=>{delete visualViewport.height;visualViewport.dispatchEvent(new Event('resize'));});
    await page.setViewport({width:820,height:390,hasTouch:true});assert.equal(await page.$eval(name,n=>n.value),'Mobile workflow draft');await fit('workflow-draft-landscape');
    await clickText('Save email updates','.tracker-email-footer');await page.waitForFunction(()=>!document.querySelector('.tracker-email-modal'));assert.equal(tracker.emailWorkflows[0].name,'Mobile workflow draft');
    checks.push('create saves fictional tracker; audience supports all four categories; Manual/Auto Sync remain accessible; workflow draft survives steps/rotation and saves');
    // Desktop CSS parity: responsive additions cannot move any established element.
    for(const dark of [false,true]) {
      await page.setViewport({width:1440,height:1000});await open();await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);await wait(500);
      const geometry=()=>page.evaluate(()=>Object.fromEntries(['.tracker-page-header','.tracker-premium-summary','.tracker-status-strip','.tracker-marks-panel','.tracker-marks-table','.tracker-row-identity'].map(selector=>{const n=document.querySelector(selector),r=n.getBoundingClientRect(),s=getComputedStyle(n);return[selector,[r.x,r.y,r.width,r.height,s.fontSize,s.padding,s.backgroundColor]];})));
      await page.evaluate(()=>document.getElementById('tracker-responsive-style').sheet.disabled=true);await wait(160);const before=await geometry();await page.evaluate(()=>document.getElementById('tracker-responsive-style').sheet.disabled=false);await wait(160);const after=await geometry();assert.deepEqual(after,before,'Desktop geometry/material changed');metrics.push({label:'desktop-parity-'+(dark?'dark':'light'),before,after});
    }
    checks.push('1440 desktop dark/light geometry and material identical with responsive stylesheet disabled/enabled');
    // Narrow landscape/short viewport and larger text.
    for(const [width,height] of [[820,390],[600,320],[390,420],[1024,600]]) {await page.setViewport({width,height,hasTouch:true});await open();await menu('Email updates');await page.click('.tracker-email-workflow-card');await page.waitForSelector('.fluid-step-track');await fit('short-workflow-'+width+'x'+height);await closeDialog();}
    await page.setViewport({width:390,height:844,hasTouch:true});await open();await page.evaluate(()=>document.documentElement.style.fontSize='20px');await fit('larger-text');await page.evaluate(()=>document.documentElement.style.fontSize='');
    await page.click('.tracker-activity-trigger');await fit('expanded-long-activity');
    // Prepared messages stay fictional and attachments belong to each fixture client.
    await page.click('.tracker-header-primary');await page.waitForSelector('.email-review-ready');await clickText('Preview eligible clients','.email-review-ready');await page.waitForSelector('.email-review-client-row');await fit('email-audience');await page.click('.email-review-client-row');await fit('email-detail');
    assert(await page.$('.email-review-attachments'));await page.screenshot({path:path.join(task,'email-review-390.png')});
    for(const width of [320,360,430,600,768,820,1024]){await page.setViewport({width,height:844,hasTouch:true});await fit('email-detail-'+width);}await page.setViewport({width:390,height:844,hasTouch:true});await page.$eval('.email-review-detail',n=>n.scrollTop=n.scrollHeight);await fit('email-attachments-scrolled');assert(await page.$eval('.email-review-attachments',n=>{const a=n.getBoundingClientRect(),b=n.closest('.email-review-detail').getBoundingClientRect();return a.right<=b.right&&a.bottom<=b.bottom+1;}));
    await page.click('.email-review-back');await page.$eval('[aria-label="Audience filter"]',n=>[...n.querySelectorAll('button')].find(b=>b.textContent.startsWith('Skipped')).click());await page.click('.email-review-client-row');assert((await page.$eval('.email-review-skipped-detail',n=>n.textContent)).includes('No selected email'));await fit('email-skipped-reason');
    await page.click('.email-review-back');await page.$eval('[aria-label="Audience filter"]',n=>[...n.querySelectorAll('button')].find(b=>b.textContent.startsWith('Eligible')).click());await page.click('.email-review-client-row');
    await page.click('.email-review-send');await page.waitForSelector('.email-authorization-modal');await page.waitForFunction(()=>[...document.querySelectorAll('.email-authorization-modal button')].some(n=>n.textContent==='Send verification code'&&!n.disabled));await fit('authorization-request');await clickText('Send verification code','.email-authorization-modal');
    await page.waitForSelector('input[aria-label="Verification code"]');await fit('authorization-otp');for(const width of [320,360,430,600,768,820]){await page.setViewport({width,height:844,hasTouch:true});await fit('authorization-otp-'+width);}await page.setViewport({width:390,height:844,hasTouch:true});await page.type('input[aria-label="Verification code"]','123456');await clickText('Verify','.email-authorization-modal');await page.waitForSelector('input[aria-label="Send PIN"]');await fit('authorization-pin');await page.type('input[aria-label="Send PIN"]','111111');await clickText('Verify','.email-authorization-modal');await page.waitForSelector('.email-authorization-modal .email-security-hold');await fit('authorization-hold');
    for(let i=0;i<8;i++){await page.keyboard.press('Tab');assert(await page.evaluate(()=>Boolean(document.activeElement.closest('.email-authorization-modal'))),'Authorization must trap focus');}
    await page.screenshot({path:path.join(task,'authorization-390.png')});await closeDialog();await closeDialog();
    checks.push('eligible/skipped review, client attachment details, OTP then PIN and held-send stage fit phone; authorization focus trapped; no send endpoint invoked');
    // Touch safety: early release, scrolling, cancellation and close must not commit.
    await open('hold');const cdp=await page.createCDPSession();let rect=await page.$eval('.email-security-hold',n=>{const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
    const touch=async(type,y=rect.y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x:rect.x,y}]});
    await touch('touchStart');await wait(300);await touch('touchEnd');await wait(1100);assert.equal(await page.evaluate(()=>window.mockCommits||0),0);
    await touch('touchStart');await touch('touchMove',rect.y+16);await wait(1200);await touch('touchEnd');assert.equal(await page.evaluate(()=>window.mockCommits||0),0);
    await touch('touchStart');await touch('touchCancel');await wait(1200);assert.equal(await page.evaluate(()=>window.mockCommits||0),0);
    await touch('touchStart');await wait(900);await page.keyboard.press('Escape');await touch('touchEnd');await wait(1200);assert.equal(await page.evaluate(()=>window.mockCommits||0),0);
    await page.evaluate(()=>window.reopenHold());await page.waitForSelector('.email-security-hold');await wait(350);rect=await page.$eval('.email-security-hold',n=>{const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});await touch('touchStart');await wait(150);assert.equal(await page.$eval('.email-security-hold',n=>n.dataset.holding),'true','Real touch must start the hold');await wait(1100);await touch('touchEnd');assert.equal(await page.evaluate(()=>window.mockCommits),1);await cdp.detach();
    checks.push('actual touch hold: early release/swipe/pointer cancellation/close cancel; full 1100 ms hold commits once to local mock');
    for(const [width,height] of [[320,568],[390,420],[820,390],[1440,900]]) {await page.setViewport({width,height});await open('dock');await page.click('.delivery-activity-heading');await fit('progress-dock-'+width+'x'+height);}
    assert(!requests.some(x=>x.path.includes('/email/deliver')),'No sends allowed');assert.deepEqual(errors,[]);
    const report={completed:new Date().toISOString(),environment:{node:process.version,browser:await browser.version(),database:'none; fictional HTTP fixture',sending:'forbidden',profile:'one reused task-owned profile'},checks,metrics,requests,saveCount};
    fs.writeFileSync(path.join(task,'responsive-results.json'),JSON.stringify(report,null,2));console.log('PASS: '+checks.join('\nPASS: '));console.log('Report: '+path.join(task,'responsive-results.json'));
  } catch(error) {
    console.error(error);
    fs.writeFileSync(path.join(task,'partial-responsive-results.json'),JSON.stringify({checks,metrics,error:String(error)},null,2));
    if(page){await page.screenshot({path:path.join(task,'failure.png')}).catch(()=>{});console.error('Fixture screen:',(await page.$eval('body',n=>n.textContent)).slice(0,1200));}
    console.error('Evidence retained at '+task);throw error;
  } finally {if(browser)await browser.close();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});



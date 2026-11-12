// Actual tracker page + real CSS. Every API is an isolated fixture; no client data or emails.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const puppeteer = require('puppeteer-core'), compiledWebpack = require('next/dist/compiled/webpack/webpack');
const root = path.resolve(__dirname, '..'), before = process.argv.includes('--before');
const output = path.join(root, 'tmp/tracker-editing-tests', before ? 'before' : 'after');
const trackerId = '0123456789abcdef01234567', trackerPath = `/api/client-trackers/${trackerId}`;
const fields = [
  { key: 'status', label: 'Status', type: 'status', options: ['Not Started', 'In Progress', 'Done'] },
  { key: 'bill', label: 'Bill Created', type: 'toggle' },
  { key: 'migration', label: 'Migration Status', type: 'toggle' },
  { key: 'color', label: 'Color', type: 'select', options: ['Violet', 'Blue'] },
  ...['text','longText','number','currency','percentage','quantity','date','progress','multiSelect','tags'].map(type => ({ key: type, label: type, type, options: ['One','Two'] })),
];
const entries = Array.from({ length: 222 }, (_, i) => ({ _id: `C${i}`, clientId: `C${i}`, client: { clientId: `C${i}`, companyName: `Company ${i}`, category: 'PWP', state: 'Delhi' }, updatedAt: '2026-10-21T00:00:00Z',
  values: { status: 'Not Started', bill: i < 15, migration: i < 15, color: i < 2 ? 'Violet' : 'Blue', text: 'Saved', longText: 'Saved note', number: 1, currency: 1, percentage: 1, quantity: 1, date: '2026-10-21', progress: 1, multiSelect: ['One'], tags: ['One'] } }));
let failNext = false, failBulk = false, partialBulk = false, failOverview = false, delayNextOverview = 0, activeWrites = 0, maxWrites = 0;
const requests = [], audit = [];
const excluded = new Set();
const counts = () => fields.filter(f => ['toggle','select','status'].includes(f.type)).flatMap(f => [...new Set(entries.map(e => e.values[f.key]))].map(value => ({ key: f.key, value, count: entries.filter(e => !excluded.has(e._id) && e.values[f.key] === value).length })));
function data(url) {
  const field = url.searchParams.get('field'), value = url.searchParams.get('value');
  const filtered = entries.filter(e => !excluded.has(e._id) && (!field || String(e.values[field]) === String(value === 'Yes' ? true : value === 'No' ? false : value)));
  const offset = Number(url.searchParams.get('offset') || 0);
  return { _id: trackerId, name: 'Migration Confirmation', status: 'active', fields, clientIds: entries.map(e => e.clientId), emailEnabled: true, entries: filtered.slice(offset,offset+100), entryCount: filtered.length, totalEntryCount: entries.length-excluded.size, offset, hasMore: offset+100<filtered.length, nextOffset: offset+100<filtered.length ? offset+100 : null };
}
async function main() {
  fs.mkdirSync(output, { recursive: true }); compiledWebpack.init();
  const aliases = { 'next/link': path.join(__dirname,'fixtures/tracker-next-link.cjs'), 'next-auth/react': path.join(__dirname,'fixtures/tracker-session.cjs') };
  if (before) {
    const baseline=process.argv.includes('--baseline-productivity')?'tmp/tracker-productivity-before':'tmp/tracker-editing-before';
    aliases['@/app/dashboard/client-trackers/[id]/page$'] = path.join(root,baseline,'page.tsx');
    aliases['@/lib/useFreshTrackerData$'] = path.join(root,baseline,'useFreshTrackerData.ts');
  }
  aliases['@'] = root;
  await new Promise((resolve,reject) => {
    const compiler = compiledWebpack.webpack({ mode: 'development', devtool: false, context: root, entry: path.join(__dirname,'fixtures/tracker-editing.tsx'), output: { path: output, filename: 'fixture.js' }, resolve: { extensions: ['.tsx','.ts','.js'], alias: aliases }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname,'fixtures/tracker-editing-loader.cjs') }] } });
    compiler.run((err,stats) => compiler.close(() => err || stats.hasErrors() ? reject(err || Error(stats.toString({ all:false,errors:true }))) : resolve()));
  });
  const built = await require('postcss')([require('tailwindcss')(path.join(root,'tailwind.config.ts'))]).process(fs.readFileSync(path.join(root,'app/globals.css'),'utf8').replace(/^@import .+$/gm,''), { from: path.join(root,'app/globals.css') });
  const css = built.css + ['components/ui/liquid-glass/liquid-glass.css','app/client-profile-premium.css','app/tracker-create.css','app/tracker-configure.css'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n');
  const server = http.createServer((req,res) => {
    const url = new URL(req.url,'http://localhost');
    if (url.pathname.endsWith('.js')) { res.setHeader('Content-Type','application/javascript'); res.end(fs.readFileSync(path.join(output,path.basename(url.pathname)))); return; }
    if (url.pathname === '/fixture.css') { res.setHeader('Content-Type','text/css'); res.end(css); return; }
    if (!url.pathname.startsWith('/api/')) { res.setHeader('Content-Type','text/html; charset=utf-8'); res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); return; }
    requests.push({ method:req.method, path:url.pathname, query:url.search }); res.setHeader('Content-Type','application/json');
    if (req.method === 'PATCH') {
      let raw = ''; req.on('data', chunk => raw += chunk); req.on('end', () => {
        const change = JSON.parse(raw), bulk = url.pathname.endsWith('/bulk'), failed = bulk ? failBulk : failNext;
        failNext = false; failBulk = false; activeWrites++; maxWrites = Math.max(maxWrites, activeWrites);
        const affected = bulk ? entries.filter(e => change.entryIds.includes(e._id)) : entries.filter(e => e._id === url.pathname.split('/').at(-1));
        const partial = bulk && partialBulk; partialBulk = false;
        setTimeout(() => {
          activeWrites--;
          if (failed) { res.statusCode=400; res.end(JSON.stringify({ error:'Fixture rejected change' })); return; }
          const revision=e=>e.fieldRevisions?.[change.key]||0;
          const accepted=affected.filter(e=>before || (bulk?change.expectedRevisions?.[e._id]:change.expectedRevision)===revision(e));
          if(!bulk&&!accepted.length){res.statusCode=409;res.end(JSON.stringify({code:'MARK_CONFLICT',error:'This field changed elsewhere. Review the saved value.',current:{value:affected[0].values[change.key],revision:revision(affected[0])}}));return;}
          const applied=partial?accepted.slice(0,1):accepted;
          const previous=applied.map(e=>({id:e._id,value:e.values[change.key],revision:revision(e)+1}));
          const numeric = ['number','currency','percentage','quantity','progress'].includes(change.key);
          const normalized = numeric ? Number(change.value) : typeof change.value === 'string' ? change.value.trim() : change.value;
          for (const e of applied) { e.values[change.key] = normalized; e.fieldRevisions||={}; e.fieldRevisions[change.key]=revision(e)+1; audit.push({ id:e._id,key:change.key,value:normalized }); }
          res.end(JSON.stringify(bulk ? { updated:applied.length, previous, appliedIds:applied.map(e=>e._id),value:normalized,revisions:Object.fromEntries(applied.map(e=>[e._id,revision(e)])),conflicts:affected.filter(e=>!accepted.includes(e)).map(e=>e._id),complete:!partial&&accepted.length===affected.length } : {...affected[0],previousValue:previous[0].value}));
        }, change.key === 'number' ? 500 : 350);
      }); return;
    }
    const overview = url.searchParams.has('overviewOnly'), failed = overview && failOverview;
    if (overview) failOverview = false;
    const keys=url.searchParams.get('overviewFields')?.split(',');
    const snapshot = url.pathname === trackerPath ? overview ? { overviewCounts:counts().filter(c=>!keys||keys.includes(c.key)) } : data(url) : { events:[], logs:[], summary:{} };
    const delay = overview ? delayNextOverview || 100 : 100; if (overview) delayNextOverview = 0;
    setTimeout(() => { res.statusCode=failed?500:200; res.end(JSON.stringify(failed?{error:'Fixture totals unavailable'}:snapshot)); },delay);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); let browser, page;
  try {
    browser = await puppeteer.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--disable-gpu','--no-first-run'] });
    page = await browser.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.setViewport({width:1440,height:1100}); await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(()=>document.querySelector('.tracker-status-value span')?.textContent==='222');
    await page.evaluate(()=>new Promise(r=>setTimeout(r,400)));
    const switchSelector = 'tbody tr:nth-child(16) [role="switch"]';
    const summary = () => page.$$eval('.tracker-status-card',nodes=>Object.fromEntries(nodes.map(n=>[n.querySelector('p').textContent.trim(),[...n.querySelectorAll('.tracker-status-value')].map(b=>[b.lastElementChild.textContent,b.firstElementChild.textContent])])));
    const startRequests = requests.length;
    await page.evaluate(selector=>{
      const w=window; w.trackerEditorRenders=0; w.trackerCommits=[];
      w.editMeasure={start:performance.now(),visible:null,summary:null,confirmed:null,blankFrames:0,loadingFrames:0,heights:[],tableTops:[]};
      const sample=()=>{const m=w.editMeasure,card=document.querySelector('.tracker-status-strip'), target=[...document.querySelectorAll('.tracker-status-card')].find(n=>n.querySelector('p').textContent==='Bill Created');
        if(!m.visible&&document.querySelector(selector).getAttribute('aria-checked')==='true')m.visible=performance.now()-m.start;
        if(!m.summary&&target.querySelector('.tracker-status-value span').textContent==='16')m.summary=performance.now()-m.start;
        if(m.visible&&!m.confirmed&&!document.querySelector(selector).disabled&&document.querySelector(selector).getAttribute('aria-busy')!=='true')m.confirmed=performance.now()-m.start;
        if([...card.querySelectorAll('.tracker-status-value>span:first-child')].some(n=>!/^\d+$/.test(n.textContent)))m.blankFrames++;
        if(card.textContent.includes('Updating totals'))m.loadingFrames++;
        m.heights.push(card.getBoundingClientRect().height); m.tableTops.push(card.nextElementSibling.getBoundingClientRect().top);
        if(performance.now()-m.start<1100)requestAnimationFrame(sample);
      }; sample(); document.querySelector(selector).click();
    },switchSelector);
    await page.waitForFunction(()=>window.editMeasure.heights.length>10 && performance.now()-window.editMeasure.start>1150);
    const metrics = await page.evaluate(()=>({ ...window.editMeasure, editorRenders:window.trackerEditorRenders, commits:window.trackerCommits.length, maxCommitMs:Math.max(...window.trackerCommits), totalRenderMs:window.trackerCommits.reduce((a,b)=>a+b,0) }));
    metrics.heightRange = Math.max(...metrics.heights)-Math.min(...metrics.heights); metrics.tableMovement=Math.max(...metrics.tableTops)-Math.min(...metrics.tableTops); delete metrics.heights; delete metrics.tableTops; delete metrics.start;
    metrics.requests=requests.slice(startRequests); metrics.transport='isolated mock: PATCH 350ms, reads 100ms';
    metrics.overviewFieldsPerRequest=metrics.requests.filter(r=>r.query.includes('overviewOnly=1')).map(r=>new URLSearchParams(r.query).get('overviewFields')?.split(',')||fields.filter(f=>['toggle','select','status'].includes(f.type)).map(f=>f.key));
    metrics.environment={node:process.version,browser:await browser.version(),reactBuild:'development',clients:222,visibleRows:100,fields:14,observation:'synthetic click sampled on requestAnimationFrame'};
    fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify(metrics,null,2)); console.log(JSON.stringify(metrics,null,2));
    if(before) return;
    assert.equal(metrics.blankFrames,0); assert.equal(metrics.loadingFrames,0); assert.equal(metrics.heightRange,0); assert.equal(metrics.tableMovement,0); assert(metrics.summary<300,'Totals precede the delayed PATCH');
    assert(!metrics.requests.some(r=>r.method==='GET'&&r.path===trackerPath&&!r.query.includes('overviewOnly')),'No full page reload per ordinary edit');
    assert(!metrics.requests.some(r=>r.path.endsWith('/email')),'No email history reload');
    const bill = (await summary())['Bill Created']; assert.deepEqual(bill,[['Yes','16'],['No','206']]);
    assert.deepEqual((await summary())['Migration Status'],[['Yes','15'],['No','207']]);
    console.log('PASS: immediate toggle/totals, stable cards/table, targeted reads and renders');
    if(process.argv.includes('--benchmark-only'))return;
    const wait = ms => page.evaluate(ms=>new Promise(r=>setTimeout(r,ms)),ms);
    const idle = async () => { await page.waitForFunction(()=>![...document.querySelectorAll('tbody[aria-busy], tbody [aria-busy]')].some(n=>n.getAttribute('aria-busy')==='true')); await wait(180); };
    const click = selector => page.$eval(selector,n=>n.click());
    const clickText = label => page.evaluate(label=>{const n=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()===label); if(!n)throw Error('Missing '+label);n.click();},label);
    const edit = async (selector,value,blur=true) => { await page.focus(selector); await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.keyboard.type(value); if(blur)await page.keyboard.press('Tab'); };
    if(process.argv.includes('--productivity')) {
      const undo=async()=>{await clickText('Undo');await idle();};
      await undo();assert.equal(entries[15].values.bill,false);
      assert.deepEqual((await summary())['Bill Created'],[['Yes','15'],['No','207']]);
      const color='tbody tr:nth-child(17) select[aria-label="Color"]';
      await page.select(color,'Violet');await idle();await undo();assert.equal(entries[16].values.color,'Blue');
      const input='tbody tr:first-child input[aria-label="text"]';
      await edit(input,'Enter committed',false);await page.keyboard.press('Enter');await idle();assert.equal(entries[0].values.text,'Enter committed');
      await undo();assert.equal(entries[0].values.text,'Saved');
      const keyRequests=requests.length;
      await edit(input,'Cancel this',false);await page.keyboard.press('Escape');assert.equal(await page.$eval(input,n=>n.value),'Saved');
      await page.keyboard.press('Tab');await page.keyboard.down('Shift');await page.keyboard.press('Tab');await page.keyboard.up('Shift');
      assert(await page.$eval(input,n=>n===document.activeElement));
      await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowRight');
      const sw='tbody tr:nth-child(16) [role="switch"]';await page.focus(sw);await page.keyboard.press('ArrowDown');
      assert(await page.$eval('tbody tr:nth-child(17) [role="switch"]',n=>n===document.activeElement));
      await wait(100);assert(!requests.slice(keyRequests).some(r=>r.method==='PATCH'));
      console.log('PASS: individual toggle/select/text Undo, Enter commit, Escape cancel, Tab/Shift+Tab, native arrows and switch row navigation');
      const remote=(index,key,value)=>{entries[index].values[key]=value;entries[index].fieldRevisions||={};entries[index].fieldRevisions[key]=(entries[index].fieldRevisions[key]||0)+1;};
      remote(15,'bill',true);await click(sw);await idle();assert.equal(entries[15].values.bill,true);
      assert(await page.$('td [title="Bill Created: conflict"]'));
      await click(sw);await idle();assert.equal(entries[15].values.bill,false);
      remote(15,'bill',true);remote(15,'bill',false);await undo();assert.equal(entries[15].values.bill,false,'ABA update blocks old Undo');
      const queued=requests.length;await click(sw);await wait(25);await click(sw);remote(15,'bill',true);await idle();
      assert.equal(requests.slice(queued).filter(r=>r.method==='PATCH').length,1,'Conflict stops queued writes');assert.equal(entries[15].values.bill,true);
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await wait(200);
      failNext=true;await click(sw);await idle();assert.equal(entries[15].values.bill,true);
      await clickText('Retry');await idle();assert.equal(entries[15].values.bill,false);
      assert(await page.$('td [title="Bill Created: saved"]'));
      console.log('PASS: stale same-field protection, ABA-safe Undo, queued-conflict fencing, persisted-only saved feedback and guarded retry');
      for(let row=1;row<=2;row++)await click(`tbody tr:nth-child(${row}) td:first-child input`);
      await page.select('select[aria-label="Bulk marker"]','status');await page.select('select[aria-label="Bulk marker value"]','Done');
      await clickText('Apply');await page.waitForFunction(()=>document.body.textContent.includes('Update 2 client marks?'));await clickText('Apply to selected');await idle();
      remote(0,'status','In Progress');await undo();assert.equal(entries[0].values.status,'In Progress');assert.equal(entries[1].values.status,'Not Started');
      assert((await page.$eval('body',n=>n.textContent)).includes('changed elsewhere'));
      console.log('PASS: bulk Undo restores only unchanged revisions and preserves another employee\'s newer field');
      for(const [label,value,key]of [['Bill Created','Yes','bill'],['Bill Created','No','bill'],['Status','Not Started','status'],['Color','Blue','color']]) {
        await page.evaluate(({label,value})=>[...document.querySelectorAll('.tracker-status-card')].find(n=>n.querySelector('p').textContent===label).querySelectorAll('button').forEach(n=>{if(n.lastElementChild.textContent===value)n.click();}),{label,value});
        await wait(400);
        await page.waitForFunction(key=>document.querySelector('select[aria-label="Tracker marker"]').value===key&&document.querySelector('fieldset')?.getAttribute('aria-busy')==='false',{},key);
        const last=requests.filter(r=>r.path===trackerPath&&!r.query.includes('overviewOnly')).at(-1);
        assert(new URLSearchParams(last.query).get('field')===key);
        assert(new URLSearchParams(last.query).get('value')===value);
      }
      console.log('PASS: existing Yes/No/status/dropdown summary filters use the original server query mechanism');
      await page.select('select[aria-label="Tracker marker"]','__all_tracker_values__');await wait(400);
      remote(0,'text','Another employee');
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await wait(15);
      await edit(input,'My active draft',false);await wait(200);
      assert.equal(await page.$eval(input,n=>n.value),'My active draft');
      await page.keyboard.press('Enter');await idle();assert.equal(entries[0].values.text,'Another employee');
      assert.equal(await page.$eval(input,n=>n.value),'Another employee');
      console.log('PASS: an in-flight remote read preserves a focused draft; its original field revision prevents a stale text overwrite');
      const preserved=structuredClone(entries[0].values),membershipRequests=requests.length;
      await edit(input,'Keep active draft',false);
      for(const category of ['Producer','Importer','Brand Owner','PWP']) {
        const id='AUTO-'+category;
        entries.push({...structuredClone(entries[5]),_id:id,clientId:id,client:{clientId:id,companyName:'Auto '+category,category,state:'Delhi'},fieldRevisions:{}});
      }
      await page.evaluate(()=>window.dispatchEvent(new Event('online')));await wait(200);
      assert.equal(await page.$eval(input,n=>n.value),'Keep active draft');assert(await page.$eval(input,n=>n===document.activeElement));
      await page.keyboard.press('Escape');await page.$eval(input,n=>n.blur());await wait(250);
      assert.deepEqual(entries[0].values,preserved);assert(!requests.slice(membershipRequests).some(r=>r.method==='PATCH'));
      assert((await page.$eval('body',n=>n.textContent)).includes('226 clients'));
      await clickText('Next');await page.waitForFunction(()=>document.body.textContent.includes('Showing 101–200'));
      await clickText('Next');await page.waitForFunction(()=>document.body.textContent.includes('Showing 201–226'));
      for(const category of ['Producer','Importer','Brand Owner','PWP'])assert((await page.$eval('tbody',n=>n.textContent)).includes('Auto '+category));
      const totals=(await summary()).Status.map(([,count])=>Number(count)).reduce((a,b)=>a+b,0);assert.equal(totals,226);
      console.log('PASS: new Producer/Importer/Brand Owner/PWP membership reconciles on reconnect, preserves active drafts/history, and never sends email');
      // Another employee changes a different field before our next cell save.
      // A bill-only refresh would silently retain the old Status total.
      entries[0].values.status=entries[0].values.status==='Done'?'Not Started':'Done';
      const remoteDone=entries.filter(entry=>entry.values.status==='Done').length;
      await click('tbody tr:first-child [role="switch"]');await idle();
      assert.equal(Number((await summary()).Status.find(([value])=>value==='Done')[1]),remoteDone);
      assert(requests.some(r=>r.query.includes('overviewOnly=1')&&!r.query.includes('overviewFields=')));
      console.log('PASS: a cell save reconciles another employee’s different-field totals without merging old summary revisions');
      assert(!requests.some(r=>r.method==='PATCH'&&r.path.includes('/email')));
      assert.deepEqual(errors,[]);return;
    }
    // Latest intent is sent after the first same-cell request, while other cells run concurrently.
    const beforeAudit = audit.length;
    await click(switchSelector); await wait(25); await click(switchSelector);
    await page.waitForFunction(selector=>document.querySelector(selector).getAttribute('aria-checked')==='true',{},switchSelector);
    assert.equal(await page.$eval(switchSelector,n=>n.disabled),false);
    await idle(); assert.deepEqual(audit.slice(beforeAudit).map(a=>a.value),[false,true]); assert.equal(entries[15].values.bill,true);
    delayNextOverview=800; await page.evaluate(()=>window.dispatchEvent(new Event('focus'))); await wait(30);
    await click(switchSelector); await idle(); await wait(500);
    assert.deepEqual((await summary())['Bill Created'],[['Yes','15'],['No','207']]);
    await click(switchSelector); await idle();
    const parallelStart=requests.length;
    await page.evaluate(()=>{ for(let row=17;row<=21;row++)document.querySelector(`tbody tr:nth-child(${row}) [role="switch"]`).click(); });
    await wait(75); assert(requests.slice(parallelStart).filter(r=>r.method==='PATCH').length===5); assert(maxWrites>=5);
    await idle(); for(let i=16;i<=20;i++)assert.equal(entries[i].values.bill,true);
    console.log('PASS: five independent writes overlap; two rapid same-cell edits preserve the latest intent');
    // A failed cell rolls back without reverting another successful field.
    failNext=true; await click(switchSelector); await page.select('tbody tr:nth-child(17) select[aria-label="Color"]','Violet');
    await idle(); assert.equal(entries[15].values.bill,true); assert.equal(entries[16].values.color,'Violet');
    assert.equal(await page.$eval(switchSelector,n=>n.getAttribute('aria-checked')),'true');
    assert((await page.$eval('body',n=>n.textContent)).includes('Fixture rejected change'));
    await page.select('tbody tr:nth-child(17) select[aria-label="Status"]','In Progress');
    await page.waitForFunction(()=>[...document.querySelectorAll('.tracker-status-card')].find(n=>n.querySelector('p').textContent==='Status').textContent.includes('221Not Started'));
    await idle(); assert.deepEqual((await summary()).Status,[['Not Started','221'],['In Progress','1'],['Done','0']]);
    assert.deepEqual((await summary()).Color,[['Violet','3'],['Blue','219']]);
    console.log('PASS: targeted failure rollback, dropdown and status deltas, unrelated edits preserved');
    // Typing is local, survives server refresh, and normalizes only after blur/acknowledgement.
    const textSelector='tbody tr:first-child input[aria-label="text"]';
    const typingRequests=requests.length;
    await edit(textSelector,'Uncommitted draft',false);
    entries[0].values.text='Other employee';
    await page.evaluate(()=>window.dispatchEvent(new Event('focus'))); await wait(250);
    assert.equal(await page.$eval(textSelector,n=>n.value),'Uncommitted draft');
    assert(await page.$eval(textSelector,n=>n===document.activeElement));
    assert(!requests.slice(typingRequests).some(r=>r.method==='PATCH'));
    await page.keyboard.press('Tab'); await idle(); assert.equal(entries[0].values.text,'Uncommitted draft');
    const textReads=requests.length;
    await edit(textSelector,'  Normalized value  '); await idle();
    assert.equal(await page.$eval(textSelector,n=>n.value),'Normalized value');
    assert(!requests.slice(textReads).some(r=>r.path===trackerPath),'Text edits do not request whole-tracker totals or rows');
    await edit('tbody tr:first-child textarea','Longer draft'); await idle(); assert.equal(entries[0].values.longText,'Longer draft');
    for(const type of ['number','currency','percentage','quantity','progress']) { await edit(`tbody tr:first-child input[aria-label="${type}"]`,'12'); await idle(); assert.equal(Number(entries[0].values[type]),12); }
    await page.focus('tbody tr:first-child input[type="date"]');
    await page.keyboard.press('ArrowUp');
    const chosenDate=await page.$eval('tbody tr:first-child input[type="date"]',n=>n.value);
    assert.notEqual(chosenDate,'2026-10-21');
    await page.$eval('tbody tr:first-child input[type="date"]',n=>n.blur()); await idle(); assert.equal(entries[0].values.date,chosenDate);
    await click('tbody tr:first-child [role="group"][aria-label="multiSelect"] input[aria-label="Two"]');
    await click('tbody tr:first-child [role="group"][aria-label="tags"] input[aria-label="Two"]'); await idle();
    assert.deepEqual(entries[0].values.multiSelect,['One','Two']); assert.deepEqual(entries[0].values.tags,['One','Two']);
    console.log('PASS: local drafts/focus, server normalization, numeric, long text, multi-select and tags');
    // Failed counts retain honest last-known totals without changing panel geometry; focus retries.
    const lastCounts=await summary(); failOverview=true;
    await page.evaluate(()=>window.dispatchEvent(new Event('focus'))); await wait(250);
    assert.deepEqual(await summary(),lastCounts); assert(await page.$('.tracker-status-card[title*="out of date"]'));
    entries[221].values.migration=true;
    await page.evaluate(()=>window.dispatchEvent(new Event('focus'))); await wait(250);
    assert.deepEqual((await summary())['Migration Status'],[['Yes','16'],['No','206']]);
    console.log('PASS: reconciliation failure retains counts and notifies; another employee\'s edit appears on focus');
    // Keep a filtered row during the PATCH, then use the server's paginated result.
    await page.evaluate(()=>[...document.querySelectorAll('.tracker-status-card')].find(n=>n.querySelector('p').textContent==='Bill Created').querySelectorAll('button')[1].click());
    await page.waitForFunction(()=>document.querySelector('fieldset')?.getAttribute('aria-busy')==='false'&&document.querySelector('select[aria-label="Tracker marker"]').value==='bill');
    const filteredId=await page.$eval('tbody tr:first-child td:nth-child(2) p',n=>n.textContent);
    await click('tbody tr:first-child [role="switch"]'); await wait(60);
    assert.equal(await page.$eval('tbody tr:first-child td:nth-child(2) p',n=>n.textContent),filteredId);
    await idle(); assert(!(await page.$eval('tbody',n=>n.textContent)).includes(`Company ${filteredId.slice(1)}${filteredId}`));
    await page.select('select[aria-label="Tracker marker"]','__all_tracker_values__'); await wait(400);
    console.log('PASS: filtered rows stay put during save, then reconcile against server pagination');
    // Bulk optimistic counts, normalized acknowledgements, truthful failures, and existing Undo.
    for(let row=1;row<=20;row++)await click(`tbody tr:nth-child(${row}) td:first-child input`);
    await page.waitForSelector('select[aria-label="Bulk marker"]');
    await page.select('select[aria-label="Bulk marker"]','status'); await page.select('select[aria-label="Bulk marker value"]','Done');
    await clickText('Apply'); await page.waitForFunction(()=>document.body.textContent.includes('Update 20 client marks?'));
    await clickText('Apply to selected');
    await wait(75); assert.equal((await summary()).Status.find(([label])=>label==='Done')[1],'20');
    await idle(); assert.equal(entries.filter(e=>e.values.status==='Done').length,20);
    await clickText('Undo'); await idle(); assert.equal(entries.filter(e=>e.values.status==='Done').length,0);
    console.log('PASS: 20-row optimistic bulk update and existing Undo restore exact previous values');
    const bulkAgain=async()=>{
      for(let row=1;row<=2;row++)await click(`tbody tr:nth-child(${row}) td:first-child input`);
      await page.select('select[aria-label="Bulk marker"]','status'); await page.select('select[aria-label="Bulk marker value"]','Done');
      await clickText('Apply'); await page.waitForFunction(()=>document.body.textContent.includes('Update 2 client marks?')); await clickText('Apply to selected');
      await idle();
    };
    failBulk=true; await bulkAgain(); assert.equal(entries.filter(e=>e.values.status==='Done').length,0);
    // Failed bulk retains the selection; clear it before the partial-result case.
    for(let row=1;row<=2;row++)await click(`tbody tr:nth-child(${row}) td:first-child input`);
    partialBulk=true; await bulkAgain(); assert.equal(entries.filter(e=>e.values.status==='Done').length,1);
    assert.equal((await summary()).Status.find(([label])=>label==='Done')[1],'1');
    console.log('PASS: failed and partial bulk results reconcile only persisted rows, with no false all-saved state');
    await clickText('Next'); await page.waitForFunction(()=>document.body.textContent.includes('Showing 101–200'));
    await clickText('Next'); await page.waitForFunction(()=>document.body.textContent.includes('Showing 201–222'));
    for(let i=200;i<222;i++)excluded.add('C'+i);
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(()=>document.body.textContent.includes('Showing 101–200 of 200'));
    assert.equal(entries.length,222,'History remains intact while the active result shrinks');
    console.log('PASS: server-authoritative page clamping when a last page disappears');
    await page.evaluate(()=>{window.scrollTo(0,0);for(const n of document.querySelectorAll('.overflow-x-auto'))n.scrollLeft=0;});
    await page.evaluate(()=>document.documentElement.classList.add('dark'));
    await page.screenshot({path:path.join(output,'tracker-editing-dark.png')});
    await page.evaluate(()=>document.documentElement.classList.remove('dark'));
    await page.screenshot({path:path.join(output,'tracker-editing-light.png')});
    assert.deepEqual(errors,[]);
  } catch(error) {
    console.error('Last fixture requests:',requests.slice(-12));
    if(page)console.error('Fixture page:',(await page.$eval('body',n=>n.textContent)).slice(0,1700));
    throw error;
  } finally { if(browser)await browser.close(); await new Promise(resolve=>server.close(resolve)); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

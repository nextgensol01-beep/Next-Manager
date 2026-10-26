/* Isolated real Next dev/start + MongoDB opening benchmark. No application .env,
 * client database, Gmail, copied node_modules, or full-project build is used. */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { spawn } = require('node:child_process');
const { AsyncLocalStorage } = require('node:async_hooks');
// Next's custom server must see this before the route-loader imports next/server.
globalThis.AsyncLocalStorage ||= AsyncLocalStorage;
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const puppeteer = require('puppeteer-core');
const createLoader = require('./search-test-loader.cjs');
const root = path.resolve(__dirname, '..');
const sources = ['app/api/client-trackers/[id]/route.ts', 'lib/server/tracker-membership.ts',
  'app/dashboard/client-trackers/page.tsx', 'app/dashboard/client-trackers/[id]/page.tsx',
  'lib/useFreshTrackerData.ts', 'lib/cache.ts', 'app/api/client-trackers/[id]/email/route.ts'];
const args = process.argv.slice(2), option = name => args[args.indexOf(name) + 1];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const id = i => String(i).padStart(24, '0');
function write(base, file, value) { const target = path.join(base, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value); }
async function port() { const s = http.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const value = s.address().port; await new Promise(r => s.close(r)); return value; }
async function stop(child) { if (!child || child.exitCode !== null || child.signalCode !== null) return; child.kill(); await Promise.race([new Promise(r => child.once('exit', r)), wait(10000)]); if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await new Promise(r => child.once('exit', r)); } }
async function main() {
  if (args.includes('--capture')) {
    const task = fs.mkdtempSync(path.join(root, 'tmp/tracker-opening-task-'));
    for (const file of sources) write(task, 'before/' + file, fs.readFileSync(path.join(root, file)));
    write(task, 'owner.json', JSON.stringify({ purpose: 'tracker-opening-benchmark', created: Date.now() }));
    console.log(task); return;
  }
  const task = path.resolve(option('--task')), variant = option('--variant'), mode = option('--mode');
  assert(task.startsWith(path.join(root, 'tmp/tracker-opening-task-')) && fs.existsSync(path.join(task, 'owner.json')));
  assert(['before', 'after'].includes(variant) && ['development', 'production'].includes(mode));
  const project = path.join(task, 'router'), dbPath = path.join(task, 'mongo');
  fs.mkdirSync(dbPath, { recursive: true });
  const mongoPort = await port(), dbName = 'tracker_opening_fixture';
  const mongoLog = fs.openSync(path.join(task, 'mongo.log'), 'a');
  const mongod = spawn(path.join(root, 'node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe'),
    ['--dbpath', dbPath, '--bind_ip', '127.0.0.1', '--port', String(mongoPort), '--wiredTigerCacheSizeGB', '0.25'], { stdio: ['ignore', mongoLog, mongoLog], windowsHide: true });
  let browser, app, nextServer, api; const sockets = new Set();
  const peakMemory = process.memoryUsage();
  const memoryTimer = setInterval(() => { const memory = process.memoryUsage(); for(const key of Object.keys(peakMemory))peakMemory[key]=Math.max(peakMemory[key],memory[key]); },100);memoryTimer.unref();
  try {
    for (let i = 0; ; i++) { try { await mongoose.connect(`mongodb://127.0.0.1:${mongoPort}/${dbName}`, { serverSelectionTimeoutMS: 500 }); break; } catch (error) { if (i > 35 || mongod.exitCode !== null) throw error; await wait(150); } }
    await mongoose.connection.dropDatabase(); // This connection is exclusively the fictional localhost fixture above.
    const timing = new AsyncLocalStorage(); let delay = 0, fail = false;
    const session = { user: { role: 'admin', email: 'fixture@example.invalid' } };
    let signedIn = true;
    const overrides = variant === 'before' ? Object.fromEntries(sources.map(file => [file, fs.readFileSync(path.join(task, 'before', file), 'utf8')])) : {};
    let membership; const audits = [];
    const load = createLoader({
      'server-only': {},
      'next-auth': { getServerSession: async () => { const at = performance.now(); await wait(3); timing.getStore()?.phases.push({ phase: 'authentication-fixture', ms: performance.now() - at }); return signedIn ? session : null; } },
      '@/lib/auth': { authOptions: {} }, '@/lib/mongoose': { connectDB: async () => {} },
      '@/lib/authUsers': { isAdminSession: async () => true },
      '@/lib/server/activity-events': { recordActivityEvent: async (event, actor) => { assert(actor); audits.push(event); } },
      '@/lib/server/tracker-membership': new Proxy({}, { get: (_target, name) => (...values) => {
        const fn = membership[name]; if (name !== 'syncCategoryTrackerMembership') return fn(...values);
        const at = performance.now(); return Promise.resolve(fn(...values)).finally(() => timing.getStore()?.phases.push({ phase: 'membership', ms: performance.now() - at }));
      } }),
    }, overrides);
    membership = load('lib/server/tracker-membership.ts');
    const Client = load('models/Client.ts').default, Tracker = load('models/ClientTracker.ts').default;
    const Entry = load('models/ClientTrackerEntry.ts').default, Return = load('models/AnnualReturn.ts').default;
    const detail = load('app/api/client-trackers/[id]/route.ts').GET;
    const emailGet = load('app/api/client-trackers/[id]/email/route.ts').GET;
    const EmailLog = load('models/EmailLog.ts').default;
    const listing = load('app/api/client-trackers/route.ts').GET;
    const patch = load('app/api/client-trackers/[id]/entries/[entryId]/route.ts').PATCH;
    const fields = [{ key: 'status', label: 'Status', type: 'status', options: ['Not Started', 'Done'] }, { key: 'ready', label: 'Ready', type: 'toggle' }, { key: 'note', label: 'Notes', type: 'text' }];
    const clients = Array.from({ length: 210 }, (_, i) => ({ clientId: 'C' + i, companyName: 'Fixture company ' + i, category: ['Producer', 'Importer', 'Brand Owner', 'PWP'][i % 4], state: 'Gujarat' }));
    await Client.insertMany(clients);
    const trackers = [];
    for (let i = 1; i <= 3; i++) {
      const count = i === 1 ? 100 : 210;
      const tracker = await Tracker.create({ _id: id(i), name: i === 1 ? 'Manual 100' : i === 2 ? 'Auto 210' : 'Linked 210', status: 'active', financialYear: '2025-26', fields: i === 3 ? [...fields, { key: 'filed', label: 'Filed', type: 'toggle', dataLink: { source: 'annualReturn', display: 'yesNo' } }] : fields, clientScope: i === 2 ? 'all' : 'selected', clientMembershipMode: i === 2 ? 'categorySync' : 'snapshot', clientIds: clients.slice(0, count).map(x => x.clientId), emailEnabled:i===2, createdBy: session.user.email });
      trackers.push(tracker);
      await Entry.insertMany(clients.slice(0, count).map((client, n) => ({ trackerId: tracker._id, clientId: client.clientId, values: { status: 'Not Started', ready: false, note: 'History ' + n }, inScope: true, updatedAt: new Date(1700000000000 + n) })));
    }
    await Entry.create({ trackerId: id(2), clientId: 'EXCLUDED', values: { note: 'Preserve history' }, inScope: false });
    await Client.create({ clientId: 'EXCLUDED', companyName: 'Excluded fixture', category: 'PWP', state: 'Gujarat' });
    await Return.create({ clientId: 'C0', financialYear: '2025-26', status: 'Filed' });
    const fictionalBody='<p>Fictional benchmark content '+ 'x'.repeat(6144)+'</p>';
    await EmailLog.insertMany(Array.from({length:1200},(_,i)=>({type:'tracker',trackerId:id(2),clientId:'C'+(i%210),subject:'Fictional log '+i,to:['fictional@example.invalid'],status:i%5?'sent':'draft',mailKind:i%3?'initial':'reminder',sentAt:new Date(1700000000000+i),renderedHtml:fictionalBody,renderedBody:fictionalBody})));
    await Promise.all([Client.init(), Tracker.init(), Entry.init(), Return.init(),EmailLog.init()]);
    const initialMarks = JSON.stringify(await Entry.find({}).sort({ clientId: 1 }).select('clientId trackerId values inScope').lean());
    const rawQuery = mongoose.Query.prototype.exec, rawAggregate = mongoose.Aggregate.prototype.exec;
    function measured(original, kind) { return async function (...values) { const context = timing.getStore(); if (!context) return original.apply(this, values); const at = performance.now(); if (delay) await wait(delay); if (fail) throw Error('Isolated database failure'); const result = await original.apply(this, values); context.phases.push({ phase: kind, model: this.model?.modelName || this._model?.modelName, op: this.op, ms: performance.now() - at }); return result; }; }
    mongoose.Query.prototype.exec = measured(rawQuery, 'query'); mongoose.Aggregate.prototype.exec = measured(rawAggregate, 'aggregate');
    const { NextRequest } = require('next/server');
    const apiResults = [];
    async function call(url, method = 'GET', body) {
      const ctx = { phases: [] }, start = performance.now();
      const response = await timing.run(ctx, async () => {
        const match = url.pathname.match(/^\/api\/client-trackers\/([^/]+)(?:\/entries\/([^/]+))?$/);
        const request = new NextRequest(url, { method, ...(body ? { body, headers: { 'content-type': 'application/json' } } : {}) });
        const emailMatch=url.pathname.match(/^\/api\/client-trackers\/([^/]+)\/email$/);
        return emailMatch ? emailGet(request,{params:Promise.resolve({id:emailMatch[1]})}) : match ? (method === 'PATCH' ? patch : detail)(request, { params: Promise.resolve({ id: match[1], entryId: match[2] }) }) : listing(request);
      });
      const json = await response.json(), measure = { url: url.pathname + url.search, status: response.status, ms: performance.now() - start, phases: ctx.phases, memory: process.memoryUsage() };
      apiResults.push(measure); return { json, status: response.status, measure };
    }
    // Real MongoDB response and index measurements; added latency is explicit and isolated.
    const apiBenchmarks = [];
    for (const latency of [0, 20]) for (const n of [1, 2, 3]) {
      delay = latency; const samples = [];
      for (let repeat = 0; repeat < 5; repeat++) { const result = await call(new URL(`http://fixture/api/client-trackers/${id(n)}?limit=100&overview=0`)); assert.equal(result.status, 200); assert.equal(result.json.totalEntryCount, n === 1 ? 100 : 210); assert.equal(result.json.entries.length, 100); if (n === 3) assert.equal(result.json.entries.find(x => x.clientId === 'C0')?.values.filed ?? true, true); samples.push(result.measure); }
      apiBenchmarks.push({ tracker: n, addedQueryLatencyMs: latency, medianMs: samples.map(x => x.ms).sort((a,b) => a-b)[2], queries: samples[4].phases.filter(x => ['query','aggregate'].includes(x.phase)).length, phases: samples[4].phases });
    }
    delay = 0;
    const emailSample=await call(new URL('http://fixture/api/client-trackers/'+id(2)+'/email'+(variant==='after'?'?compact=1&clientIds='+encodeURIComponent(JSON.stringify(clients.slice(0,100).map(x=>x.clientId))):'')));
    const emailPayload={bytes:Buffer.byteLength(JSON.stringify(emailSample.json)),ms:emailSample.measure.ms,logs:emailSample.json.logs.length,summary:emailSample.json.summary};
    assert.equal(emailSample.status,200);
    if(variant==='after'){
      assert.equal(emailSample.json.summary.total,1200);assert.equal(emailSample.json.summary.sent,960);assert.equal(emailSample.json.summary.draft,240);assert.equal(emailSample.json.summary.reminders,400);
      assert.equal(emailSample.json.logs.length,100);assert(!JSON.stringify(emailSample.json).includes('renderedHtml'));assert(!JSON.stringify(emailSample.json).includes('Fictional benchmark content'));
      assert.equal((await call(new URL('http://fixture/api/client-trackers/'+id(2)+'/email?compact=1&clientIds='+encodeURIComponent('["C155"]')))).json.logs[0].clientId,'C155');
      assert.equal((await call(new URL('http://fixture/api/client-trackers/'+id(2)+'/email?compact=1&clientIds=invalid'))).status,400);
      assert.equal((await call(new URL('http://fixture/api/client-trackers/'+id(2)+'/email?compact=1&clientIds='+encodeURIComponent(JSON.stringify(Array(251).fill('C0')))))).status,400);
      signedIn=false;assert.equal((await call(new URL('http://fixture/api/client-trackers/'+id(2)+'/email?compact=1'))).status,401);signedIn=true;
    }
    const plan = await Entry.find({ trackerId: id(2), inScope: { $ne: false } }).sort({ updatedAt: -1, _id: -1 }).limit(101).explain('executionStats');
    assert.equal(JSON.stringify(await Entry.find({}).sort({ clientId: 1 }).select('clientId trackerId values inScope').lean()), initialMarks, 'GETs preserve all historical marks and exclusions');
    signedIn = false; assert.equal((await call(new URL('http://fixture/api/client-trackers/' + id(1)))).status, 401); signedIn = true;
    const originalError = console.error; fail = true; console.error = () => {}; try { assert.equal((await call(new URL('http://fixture/api/client-trackers/' + id(1)))).status, 500); } finally { fail = false; console.error = originalError; }
    let exclusionRace = false;
    api = http.createServer(async (req, res) => { try {
      const url = new URL(req.url, 'http://fixture');
      if (/\/activity$/.test(url.pathname)) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ events: [] })); return; }
      if (url.pathname === '/api/clients') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(await Client.find({}).select('clientId companyName category state').lean())); return; }
      if (url.pathname.startsWith('/api/email/')) { res.setHeader('content-type', 'application/json'); res.end('{}'); return; }
      let body = ''; for await (const chunk of req) body += chunk;
      const response = await call(url, req.method, body);
      // Simulate an employee's exclusion between the table and summary reads.
      if (exclusionRace && url.pathname === '/api/client-trackers/' + id(2) && !url.searchParams.has('overviewOnly')) {
        exclusionRace = false;
        await Entry.updateOne({ trackerId: id(2), clientId: 'C9' }, { $set: { inScope: false } });
        await Tracker.updateOne({ _id: id(2) }, { $pull: { clientIds: 'C9' } });
      }
      res.statusCode = response.status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(response.json));
    } catch(error) { res.statusCode = 500; res.end(JSON.stringify({ error: error.message })); } });
    await new Promise(r => api.listen(0, '127.0.0.1', r)); const apiOrigin = 'http://127.0.0.1:' + api.address().port;
    const slash = x => x.replaceAll('\\', '/');
    write(project, 'package.json', JSON.stringify({ name: 'isolated-tracker-opening-fixture', private: true }));
    const aliases = variant === 'before' ? Object.fromEntries(sources.map(file => ['@/' + file.replace(/\.tsx?$/, '') + '$', slash(path.join(task, 'before', file))])) : {};
    write(project, 'next.config.js', `module.exports={distDir:'.next-${mode}',experimental:{externalDir:true,cpus:1},webpack(config){config.resolve.alias={...${JSON.stringify(aliases)},...config.resolve.alias,'@':${JSON.stringify(slash(root))},'next-auth/react':${JSON.stringify(slash(path.join(root,'scripts/fixtures/tracker-session.cjs')))}};return config}};`);
    write(project, 'tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2017', lib: ['dom','dom.iterable','esnext'], allowJs: true, skipLibCheck: true, strict: true, noEmit: true, incremental:true,resolveJsonModule:true,esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler', isolatedModules: true, jsx: 'preserve', paths: { '@/*': [slash(root) + '/*'] }, plugins: [{ name: 'next' }] }, include: ['next-env.d.ts','**/*.ts','**/*.tsx',`.next-${mode}/types/**/*.ts`], exclude: ['node_modules'] }));
    write(project, 'app/layout.tsx', `export default function Layout({children}:{children:React.ReactNode}){return <html><body><main id="dashboard-scroll-area">{children}</main></body></html>}`);
    write(project, 'app/dashboard/client-trackers/layout.tsx', `export {default} from '@/app/dashboard/client-trackers/layout';`);
    write(project, 'app/dashboard/client-trackers/page.tsx', `export {default} from '@/app/dashboard/client-trackers/page';`);
    write(project, 'app/dashboard/client-trackers/[id]/page.tsx', `export {default} from '@/app/dashboard/client-trackers/[id]/page';`);
    write(project, 'app/dashboard/client-trackers/[id]/loading.tsx', `export {default} from '@/components/client-trackers/TrackerPageLoading';`);
    write(project, 'app/api/[...fixture]/route.ts', `export const dynamic='force-dynamic';async function proxy(req:Request){const url=new URL(req.url);const response=await fetch(${JSON.stringify(apiOrigin)}+url.pathname+url.search,{method:req.method,headers:{'content-type':'application/json'},...(req.method==='GET'?{}:{body:await req.text()}),cache:'no-store'});return new Response(await response.text(),{status:response.status,headers:{'content-type':'application/json'}})}export{proxy as GET,proxy as PATCH};`);
    if (mode === 'production') {
      const log = fs.openSync(path.join(task, `${variant}-build.log`), 'w');
      const build = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'build', project], { cwd: project, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, windowsHide: true, stdio: ['ignore', log, log] });
      const code = await new Promise(r => build.once('exit', r)); fs.closeSync(log); assert.equal(code, 0, 'Isolated production build: ' + path.join(task, `${variant}-build.log`));
    }
    const nextPort = await port();
    app = require('next')({ dev: mode === 'development', dir: project, hostname: '127.0.0.1', port: nextPort });
    await app.prepare(); const handler = app.getRequestHandler();
    nextServer = http.createServer((req,res) => handler(req,res)); await new Promise(r => nextServer.listen(nextPort, '127.0.0.1', r));
    nextServer.on('connection', socket => { sockets.add(socket);socket.on('close',()=>sockets.delete(socket)); });
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, userDataDir: path.join(task,'browser-profile'), args: ['--no-sandbox'], });
    const page = await browser.newPage(); await page.setViewport({ width: 1400, height: 1000 }); page.setDefaultTimeout(90000);
    const pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
    await page.evaluateOnNewDocument(() => {
      window.__requests = []; window.__marks = {}; window.__start = 0;
      window.__expected = location.pathname.split('/').pop();
      const current = () => {
        const heading = document.querySelector(`[data-tracker-detail-heading="${window.__expected}"]`);
        return location.pathname.endsWith('/' + window.__expected) && heading && !heading.closest('[inert]');
      };
      const mark = () => {
        if (!current()) return;
        const now = performance.now(), marks = window.__marks;
        if (!marks.header) marks.header = now;
        if (document.querySelector('fieldset tbody tr') && !marks.rows) marks.rows = now;
        const read = window.__requests.some(x => x.done && x.url.startsWith('/api/client-trackers/' + window.__expected + '?') && !x.url.includes('overviewOnly'));
        if (read && document.querySelector('fieldset tbody tr') && document.querySelector('fieldset')?.getAttribute('aria-busy') === 'false' && !marks.interactive) marks.interactive = now;
      };
      const fetchOriginal = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const at = performance.now(), entry = { url: String(args[0]), ms: null, done: false };
        window.__requests.push(entry);
        try { return await fetchOriginal(...args); }
        finally { entry.ms = performance.now() - at; entry.done = true; mark(); }
      };
      new MutationObserver(mark).observe(document, { childList: true, subtree: true, attributes: true });
    });
    const origin = 'http://127.0.0.1:' + nextPort, list = origin + '/dashboard/client-trackers';
    const results = [];
    // Separate cold route compilation from warm navigation; no fabricated zero timings.
    async function listReady() {
      await page.waitForFunction(() => location.pathname === '/dashboard/client-trackers' &&
        [...document.querySelectorAll('[data-tracker-transition-id]')].some(x => !x.closest('[inert]')) &&
        !document.querySelector('.tracker-navigation-ghost,.tracker-navigation-surface,.tracker-loading-resolve-surface'));
    }
    async function record(label, action) {
      const expected = id(label === 'first-100' ? 1 : label.includes('linked') ? 3 : 2);
      await page.evaluate(value => { window.__requests=[]; window.__marks={}; window.__expected=value; window.__start=performance.now(); }, expected);
      const cpuBefore=await page.metrics(), documentBefore=await page.evaluate(()=>performance.timeOrigin), at=performance.now();
      await action();
      await page.waitForFunction(() => Boolean(window.__marks.interactive));
      const browserMs=performance.now()-at;
      await page.waitForFunction(()=>!document.querySelector('.tracker-navigation-ghost,.tracker-navigation-surface,.tracker-loading-resolve-surface'));
      const animationSettledMs=performance.now()-at;
      await wait(150);
      const result=await page.evaluate(()=>({marks:window.__marks,requests:window.__requests,start:window.__start,rows:document.querySelectorAll('fieldset tbody tr').length,resources:performance.getEntriesByType('resource').filter(x=>x.startTime>=window.__start&&x.name.includes('_rsc')).map(x=>({url:x.name,ms:x.duration})),documentResponseMs:performance.getEntriesByType('navigation')[0]?.responseEnd}));
      const cpuAfter=await page.metrics(), sameDocument=documentBefore===await page.evaluate(()=>performance.timeOrigin);
      results.push({label,browserMs,animationSettledMs,...result,cpu:{scriptMs:sameDocument?(cpuAfter.ScriptDuration-cpuBefore.ScriptDuration)*1000:null,layoutMs:sameDocument?(cpuAfter.LayoutDuration-cpuBefore.LayoutDuration)*1000:null},apiRequests:result.requests.filter(x=>x.url.startsWith('/api/')).length});
      assert.equal(result.rows,100);
    }
    await page.goto(list); await listReady();
    await wait(200);
    const listRequests = await page.evaluate(() => window.__requests);
    assert.equal(listRequests.some(x => x.url === '/api/clients'), variant === 'before', 'Benchmark must exercise the correct list source version');
    await record('first-100', () => page.click(`[data-tracker-transition-id="${id(1)}"]`));
    await record('different-auto-210', () => page.goto(origin + '/dashboard/client-trackers/' + id(2)));
    await record('linked-210', () => page.goto(origin + '/dashboard/client-trackers/' + id(3)));
    await page.goto(list); await listReady();
    await record('warm-auto-210', () => page.click(`[data-tracker-transition-id="${id(2)}"]`));
    // SPA return, preserving in-memory tracker data and the existing reverse transition.
    await page.locator('a[href="/dashboard/client-trackers"]').click(); await listReady();
    await record('reopen-auto-210', () => page.click(`[data-tracker-transition-id="${id(2)}"]`));
    delay = 75; await record('slow-database-linked-210', () => page.goto(origin + '/dashboard/client-trackers/' + id(3)));delay=0;
    assert.deepEqual(pageErrors, []);
    const integrity = [];
    if (variant === 'after') {
      await page.goto(origin + '/dashboard/client-trackers/' + id(2));
      await page.waitForFunction(() => document.querySelector('.tracker-status-strip')?.getAttribute('aria-busy') === 'false');
      exclusionRace = true;
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await page.waitForFunction(() => document.querySelector('.tracker-premium-summary')?.textContent.includes('209 clients') && document.querySelector('.tracker-status-strip')?.getAttribute('aria-busy') === 'false');
      assert.equal(exclusionRace, false);
      assert.equal((await Entry.findOne({ trackerId: id(2), clientId: 'C9' })).values.note, 'History 9');
      await Entry.updateOne({ trackerId: id(2), clientId: 'C9' }, { $set: { inScope: true } });
      await Tracker.updateOne({ _id: id(2) }, { $addToSet: { clientIds: 'C9' } });
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await page.waitForFunction(() => document.querySelector('.tracker-premium-summary')?.textContent.includes('210 clients') && document.querySelector('.tracker-status-strip')?.getAttribute('aria-busy') === 'false');
      integrity.push('real browser reconciles a MongoDB exclusion between table and summary reads; history preserved');
    }
    const approved = mongoose.connection.collection('trackeremailcampaigns');
    await approved.insertOne({ campaignId: 'fixture-approved', status: 'queued', items: [{ clientId: 'C0', to: ['fictional@example.invalid'] }], batchHash: 'immutable-fixture' });
    const campaignBefore = JSON.stringify(await approved.findOne({ campaignId: 'fixture-approved' }));
    for (const [i, category] of ['Producer','Importer','Brand Owner','PWP'].entries()) {
      const client = await Client.create({ clientId: 'NEW' + i, companyName: 'New fixture ' + i, category, state: 'Gujarat' });
      await Promise.all([membership.syncClientIntoAutoTrackers(client), membership.syncClientIntoAutoTrackers(client)]);
    }
    assert.equal(await Entry.countDocuments({ trackerId:id(2),inScope:{$ne:false} }),214);
    assert.equal(await Entry.countDocuments({ trackerId:id(1),inScope:{$ne:false} }),100);
    integrity.push('new clients in all four categories; concurrent idempotent fanout; fixed manual audience');
    await Entry.updateOne({trackerId:id(2),clientId:'C1'},{$set:{inScope:false}});
    await Tracker.updateOne({_id:id(2)},{$pull:{clientIds:'C1'},$unset:{clientSyncCheckedAt:1}});
    await Tracker.updateOne({_id:id(2)},{$pull:{clientIds:'C2'}}); // Simulated insert-to-metadata crash gap.
    const repaired = await call(new URL('http://fixture/api/client-trackers/'+id(2)+'?overview=0'));
    assert.equal(repaired.json.totalEntryCount,213);assert(repaired.json.clientIds.includes('C2'));assert(!repaired.json.clientIds.includes('C1'));
    assert.equal((await Entry.findOne({trackerId:id(2),clientId:'EXCLUDED'})).values.note,'Preserve history');
    integrity.push('manual exclusions, historical marks, expired-lease reconciliation and metadata repair');
    const categoryTracker = await Tracker.create({_id:id(4),name:'Producer reconciliation',fields,clientScope:'categories',clientCategories:['Producer'],clientMembershipMode:'categorySync',status:'active',clientIds:[]});
    await call(new URL('http://fixture/api/client-trackers/'+id(4)+'?overview=0'));
    const priorCategoryCount=await Entry.countDocuments({trackerId:categoryTracker._id});
    // A legacy/import write that bypassed the canonical (immutable-category) UI.
    await Client.updateOne({clientId:'C1'},{$set:{category:'Producer'}});
    await Tracker.updateOne({_id:id(4)},{$unset:{clientSyncCheckedAt:1}});
    const changedCategory=await call(new URL('http://fixture/api/client-trackers/'+id(4)+'?overview=0'));
    assert.equal(changedCategory.json.totalEntryCount,priorCategoryCount+1);
    await Client.updateOne({clientId:'C1'},{$set:{category:'Importer'}});
    await Tracker.updateOne({_id:id(4)},{$unset:{clientSyncCheckedAt:1}});
    assert.equal((await call(new URL('http://fixture/api/client-trackers/'+id(4)+'?overview=0'))).json.totalEntryCount,priorCategoryCount+1);
    integrity.push('missed external category change catches up additively; history survives later category departure');
    await Return.create({clientId:'C3',financialYear:'2024-25',status:'Filed'});
    const lastPage=await call(new URL('http://fixture/api/client-trackers/'+id(3)+'?overview=0&offset=200'));
    assert.equal(lastPage.json.entries.find(x=>x.clientId==='C0').values.filed,true);
    assert.equal(lastPage.json.entries.find(x=>x.clientId==='C3').values.filed,false);
    const editable=await Entry.findOne({trackerId:id(2),clientId:'C5'});
    const outcomes=await Promise.all(['Employee A','Employee B'].map(value=>call(new URL('http://fixture/api/client-trackers/'+id(2)+'/entries/'+editable._id),'PATCH',JSON.stringify({key:'note',value,expectedRevision:0}))));
    assert.deepEqual(outcomes.map(x=>x.status).sort(),[200,409]);assert.equal(audits.length,1);
    assert.equal((await Entry.findById(editable._id)).fieldRevisions.note,1);
    integrity.push('financial-year isolation; simultaneous same-field writes conflict atomically; one audit for one committed mark');
    const totals=await call(new URL('http://fixture/api/client-trackers/'+id(2)+'?overviewOnly=1'));
    assert.equal(totals.json.overviewCounts.filter(x=>x.key==='status').reduce((sum,x)=>sum+x.count,0),213);
    assert.equal(JSON.stringify(await approved.findOne({campaignId:'fixture-approved'})),campaignBefore);
    integrity.push('whole-tracker totals reconcile with MongoDB; approved email campaign recipients unchanged');
    const report = { variant, mode, database: 'isolated real MongoDB 8.2.6, fictional records only', auth: '3 ms fixture session; production auth not benchmarked', apiBenchmarks,emailPayload, browser: results, listApiRequests: listRequests.filter(x=>x.url.startsWith('/api/')), queryPlan: { returned:plan.executionStats.nReturned,keysExamined:plan.executionStats.totalKeysExamined,docsExamined:plan.executionStats.totalDocsExamined,winningPlan:plan.queryPlanner.winningPlan }, apiRequestCount:apiResults.length, memory:process.memoryUsage(),peakMemory, correctness:{unchangedMarks:true,authorization:true,serverFailure:true,noBrowserErrors:true,integrity}, };
    write(task, `${variant}-${mode}.json`, JSON.stringify(report,null,2));
    console.log(JSON.stringify({ variant,mode,api:apiBenchmarks.map(x=>({tracker:x.tracker,latency:x.addedQueryLatencyMs,medianMs:x.medianMs,queries:x.queries})),browser:results.map(x=>({label:x.label,ms:x.browserMs,requests:x.requests.length})),listRequests:report.listApiRequests.map(x=>x.url),report:path.join(task,`${variant}-${mode}.json`) }));
  } finally {
    if(browser)await browser.close();
    if(nextServer){for(const socket of sockets)socket.destroy();nextServer.closeAllConnections();await new Promise(r=>nextServer.close(r));}
    if(app)await app.close();
    if(api){api.closeAllConnections();await new Promise(r=>api.close(r));}
    clearInterval(memoryTimer);await mongoose.disconnect();await stop(mongod);fs.closeSync(mongoLog);
  }
}
// Next's development compiler can retain watchers after app.close(). All owned
// sockets, browser and database processes have been closed by finally first.
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});

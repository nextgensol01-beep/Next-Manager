/* Real Next App Router, production tracker components, isolated fixture APIs.
 * Records rendered browser frames and DOM visibility samples; no production data. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const puppeteer = require('puppeteer-core'), sharp = require('sharp');
const root = path.resolve(__dirname, '..'), project = path.join(root, 'tmp/tracker-continuity-router');
const output = path.join(root, 'tmp/tracker-continuity-visual');
const LIST = '/dashboard/client-trackers';
const id = index => String(index + 1).padStart(24, '0');
function write(file, content) { const target = path.join(project, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); }
function scaffold() {
  const slash = value => value.replaceAll('\\', '/');
  write('package.json', JSON.stringify({ name: 'tracker-continuity-fixture', private: true }));
  write('next.config.js', `module.exports={experimental:{externalDir:true},webpack(config){config.resolve.alias['@']=${JSON.stringify(slash(root))};config.resolve.alias['next-auth/react']=${JSON.stringify(slash(path.join(__dirname, 'fixtures/tracker-session.cjs')))};return config}};`);
  write('tailwind.config.js', `const cfg=require('jiti')(__filename)(${JSON.stringify(slash(path.join(root, 'tailwind.config.ts')))});module.exports={...(cfg.default||cfg),content:[${JSON.stringify(slash(root) + '/app/**/*.{ts,tsx}')},${JSON.stringify(slash(root) + '/components/**/*.{ts,tsx}')} ]};`);
  write('postcss.config.js', `module.exports={plugins:{tailwindcss:{config:${JSON.stringify(slash(path.join(project, 'tailwind.config.js')))}},autoprefixer:{}}};`);
  write('tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2017', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: true, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler', isolatedModules: true, jsx: 'preserve', incremental: true, paths: { '@/*': [slash(root) + '/*'] }, plugins: [{ name: 'next' }] }, include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'], exclude: ['node_modules'] }));
  write('app/layout.tsx', `import '@/app/globals.css';import '@/app/client-profile-premium.css';import '@/components/ui/liquid-glass/liquid-glass.css';export default function Layout({children}:{children:React.ReactNode}){return <html lang="en" className="dark"><body>{children}</body></html>}`);
  write('app/dashboard/layout.tsx', `export default function Layout({children}:{children:React.ReactNode}){return <><aside data-fixture-chrome="sidebar" style={{position:'fixed',inset:'0 auto 0 0',width:220,padding:20,background:'var(--color-card)'}}>NextGen<br/>Client Trackers</aside><header data-fixture-chrome="topbar" style={{position:'fixed',top:0,left:220,right:0,height:64,padding:20,background:'var(--color-card)'}}>NextGen Solutions</header><main id="dashboard-scroll-area" style={{position:'fixed',top:64,left:220,right:0,bottom:0,overflow:'auto',padding:24}}>{children}</main></>}`);
  write('app/dashboard/client-trackers/layout.tsx', `export {default} from '@/app/dashboard/client-trackers/layout';`);
  write('app/dashboard/client-trackers/page.tsx', `export {default} from '@/app/dashboard/client-trackers/page';`);
  write('app/dashboard/client-trackers/[id]/page.tsx', `export {default} from '@/app/dashboard/client-trackers/[id]/page';`);
  write('app/dashboard/client-trackers/[id]/loading.tsx', `export {default} from '@/components/client-trackers/TrackerPageLoading';`);
  write('app/api/[...fixture]/route.ts', `
const state=globalThis as typeof globalThis & {trackerFixtureDelay?:number;trackerFixtureListDelay?:number;trackerFixtureMissing?:boolean;trackerFixtureVersion?:number};
const fields=[{key:'status',label:'Status',type:'status',options:['Started','Done']},{key:'ready',label:'Ready',type:'toggle'},{key:'priority',label:'Priority',type:'select',options:['Normal','Urgent']},{key:'note',label:'Notes',type:'text'}];
const trackers=Array.from({length:30},(_,i)=>({_id:String(i+1).padStart(24,'0'),name:i===0?'Work Progressing':'Work tracker '+i,description:'Client task worklist '+i,status:'active',financialYear:'2025–26',fields,clientIds:['C0'],clientColumns:['state'],entryCount:210,updatedAt:'2026-10-17T00:00:00Z'}));
export async function GET(request:Request){const url=new URL(request.url);if(url.pathname==='/api/__fixture/control'){if(url.searchParams.has('delay'))state.trackerFixtureDelay=Number(url.searchParams.get('delay'));if(url.searchParams.has('listDelay'))state.trackerFixtureListDelay=Number(url.searchParams.get('listDelay'));if(url.searchParams.has('missing'))state.trackerFixtureMissing=url.searchParams.get('missing')==='1';if(url.searchParams.has('version'))state.trackerFixtureVersion=Number(url.searchParams.get('version'));return Response.json({ok:true})}const tracker=trackers.find(item=>'/api/client-trackers/'+item._id===url.pathname);let data:unknown=[];if(url.pathname==='/api/client-trackers'){data=trackers.filter(item=>!state.trackerFixtureMissing||item._id!==trackers[0]._id);await new Promise(r=>setTimeout(r,state.trackerFixtureListDelay||20))}else if(tracker){const offset=Number(url.searchParams.get('offset')||0);data={...tracker,totalEntryCount:210,entries:Array.from({length:Math.min(100,210-offset)},(_,i)=>({_id:'C'+(i+offset),clientId:'C'+(i+offset),client:{clientId:'C'+(i+offset),companyName:'Client company '+(i+offset),category:'PWP',state:'Maharashtra'},values:{ready:false,status:'Started',priority:'Normal',note:'Version '+(state.trackerFixtureVersion||1)},updatedAt:'2026-10-17T00:00:00Z'})),overviewCounts:[{key:'ready',value:false,count:210},{key:'status',value:'Started',count:210},{key:'priority',value:'Normal',count:210}],offset,hasMore:offset+100<210,nextOffset:offset+100<210?offset+100:null};await new Promise(r=>setTimeout(r,state.trackerFixtureDelay??80))}else if(url.pathname.endsWith('/activity'))data={events:[{_id:'event',label:'Tracker updated',detail:'Latest client marks',actorEmail:'fixture@example.com',occurredAt:'2026-10-17T00:00:00Z'}]};else data=[];return Response.json(data)}
  `);
}
async function encodeVideo(browser, frames, target) {
  const page = await browser.newPage();
  await page.setContent('<canvas></canvas>');
  const data = frames.map(frame => ({ image: fs.readFileSync(frame.file).toString('base64'), at: frame.at }));
  const result = await page.evaluate(async frames => {
    const canvas = document.querySelector('canvas'); canvas.width = 1440; canvas.height = 1000;
    const stream = canvas.captureStream(0), track = stream.getVideoTracks()[0];
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 2500000 });
    const chunks = []; recorder.ondataavailable = event => chunks.push(event.data);
    const done = new Promise(resolve => recorder.onstop = resolve); recorder.start();
    for (let i = 0; i < frames.length; i++) {
      const image = new Image(); image.src = 'data:image/jpeg;base64,' + frames[i].image; await image.decode();
      canvas.getContext('2d').drawImage(image, 0, 0); track.requestFrame();
      const gap = i + 1 < frames.length ? (frames[i + 1].at - frames[i].at) * 1000 : 80;
      await new Promise(resolve => setTimeout(resolve, Math.min(250, Math.max(12, gap))));
    }
    recorder.stop(); await done; stream.getTracks().forEach(track => track.stop());
    return await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' })); });
  }, data);
  fs.writeFileSync(target, Buffer.from(result.split(',')[1], 'base64')); await page.close();
}
async function main() {
  fs.mkdirSync(output, { recursive: true }); scaffold();
  const oldCwd = process.cwd(); process.chdir(project);
  let handler, app, browser;
  const server = http.createServer((req, res) => handler(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port, base = 'http://127.0.0.1:' + port;
  try {
    app = require('next')({ dev: true, dir: project, hostname: '127.0.0.1', port }); await app.prepare(); handler = app.getRequestHandler();
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,  args: ['--no-sandbox'] });
    const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 1000 });
    page.setDefaultTimeout(60000); const errors = []; page.on('pageerror', error => errors.push(error.message));
    const control = async values => { const response = await fetch(base + '/api/__fixture/control?' + new URLSearchParams(values)); assert(response.ok); };
    const idle = () => page.waitForFunction(() => !document.querySelector('.tracker-navigation-ghost,.tracker-navigation-surface,.tracker-loading-resolve-surface,[data-tracker-phase]'));
    const loaded = () => page.waitForFunction(() => document.querySelector('fieldset')?.getAttribute('aria-busy') === 'false');
    const cards = () => page.waitForSelector('[data-tracker-transition-id]');
    await page.goto(base + LIST, { waitUntil: 'networkidle0', timeout: 180000 }); await cards();
    // Warm only the route bundle; all detail data still loads on actual navigation.
    await page.goto(base + LIST + '/' + id(25), { waitUntil: 'networkidle0', timeout: 180000 }); await loaded();
    await page.goto(base + LIST, { waitUntil: 'networkidle0' }); await cards();
    await page.evaluate(() => {
      window.continuity = { frames: [], running: true };
      const opacity = node => { let value = 1; for (let current = node; current && current !== document.body; current = current.parentElement) value *= Number(getComputedStyle(current).opacity); return value; };
      const sample = () => {
        if (!window.continuity.running) return;
        const root = document.querySelector('.tracker-navigation-boundary'), surface = document.querySelector('.tracker-navigation-surface');
        const live = root && [...root.querySelectorAll('[data-tracker-transition-id], [data-tracker-workspace-shell], [data-tracker-list-ready], [data-tracker-route-error]')].filter(node => { const r = node.getBoundingClientRect(); return r.width && r.height && r.bottom > 64 && r.top < innerHeight && opacity(node) > .1; });
        const ghosts = [...document.querySelectorAll('.tracker-navigation-ghost')];
        const heading = root?.querySelector('h1[data-tracker-title]');
        window.continuity.frames.push({ t: performance.now(), route: location.pathname, phase: root?.dataset.trackerPhase || 'idle', direction: root?.dataset.trackerDirection,
          source: surface ? opacity(surface) : 0, live: live?.length || 0, ghosts: ghosts.length,
          headingVisible: heading ? opacity(heading) > .1 : false, title: ghosts[0]?.querySelector('[data-tracker-ghost-title]')?.textContent,
          shell: !!root?.querySelector('[data-tracker-loading-shell]'), pulsing: !!root?.querySelector('.animate-pulse'),
          gridOpacity: root?.querySelector('[data-tracker-transition-id]') ? opacity(root.querySelector('[data-tracker-transition-id]')) : null });
        requestAnimationFrame(sample);
      }; requestAnimationFrame(sample);
    });
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    const cdp = await page.createCDPSession(), frames = [], pending = [];
    cdp.on('Page.screencastFrame', event => {
      const index = frames.length, file = path.join(output, 'frame-' + String(index).padStart(4, '0') + '.jpg');
      frames.push({ file, at: event.metadata.timestamp }); fs.writeFileSync(file, Buffer.from(event.data, 'base64'));
      pending.push(cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {}));
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 78, maxWidth: 1440, maxHeight: 1000, everyNthFrame: 1 });
    const scenarios = [];
    const run = async (name, action) => { const start = await page.evaluate(() => performance.now()); await action(); scenarios.push({ name, start, end: await page.evaluate(() => performance.now()) }); console.log('PASS: ' + name); };
    const open = async index => { await page.click('[data-tracker-transition-id="' + id(index) + '"]'); await loaded(); await idle(); };
    const back = async () => { await page.click('.tracker-back-link'); await cards(); await idle(); };
    await run('real App Router: first tracker forward and reverse', async () => { await open(0); await back(); });
    await run('real App Router: second and third columns', async () => { await open(1); await back(); await open(2); await back(); });
    await control({ delay: '1600' });
    await run('slow data: stable known header and localized loading', async () => {
      await page.click('[data-tracker-transition-id="' + id(3) + '"]');
      await page.waitForSelector('[data-tracker-loading-shell]');
      assert.equal(await page.$eval('h1[data-tracker-title]', node => node.textContent), 'Work tracker 3');
      assert.equal(await page.$$eval('[data-tracker-loading-records] tbody tr', nodes => nodes.length), 0);
      await idle(); await page.screenshot({ path: path.join(output, 'slow-workspace.png') });
      await loaded(); await idle(); await back();
    });
    await run('cached reopen: real content retained, stale controls disabled, server revalidates', async () => {
      await control({ version: '2' }); await page.click('[data-tracker-transition-id="' + id(3) + '"]');
      await page.waitForSelector('fieldset'); assert.equal(await page.$('[data-tracker-loading-shell]'), null);
      assert(await page.$eval('fieldset', node => node.disabled));
      await loaded(); await idle(); assert(await page.$eval('tbody', node => node.textContent.includes('Version 2') || [...node.querySelectorAll('input')].some(input => input.value === 'Version 2')));
      await back();
    });
    await control({ delay: '30' });
    await run('browser Back/Forward preserves real route geometry and list context', async () => {
      await page.type('input[placeholder="Search trackers"]', 'Work tracker 2'); await open(2);
      await page.goBack(); await cards(); await idle(); assert.equal(await page.$eval('input[placeholder="Search trackers"]', node => node.value), 'Work tracker 2');
      await page.goForward(); await loaded(); await idle(); await back();
    });
    await run('CPU throttled: source/destination continuity remains established', async () => {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); await open(2); await back(); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    });
    await page.evaluate(() => { window.continuity.running = false; });
    await cdp.send('Page.stopScreencast'); await Promise.all(pending);
    const samples = await page.evaluate(() => window.continuity.frames);
    assert(samples.length > 20);
    assert(samples.every(frame => frame.live > 0 || frame.source > .1), 'Every sampled frame has live route structure or an established source surface');
    assert(samples.every(frame => frame.ghosts <= 1), 'Never accumulate shared identity overlays');
    assert(samples.every(frame => !frame.pulsing), 'No competing full-table pulse skeleton');
    const reverse = samples.filter(frame => frame.phase === 'morphing' && frame.direction === 'close');
    assert(reverse.length > 0 && reverse.every(frame => frame.gridOpacity === 1), 'Returning grid is painted throughout the shared return');
    assert.deepEqual(errors, []);
    // Inspect representative rendered frames, including both animation boundaries.
    const indexes = [...new Set(Array.from({ length: 20 }, (_, index) => Math.round(index * (frames.length - 1) / 19)))];
    const tiles = await Promise.all(indexes.map(async index => ({ input: await sharp(frames[index].file).resize(360, 250).jpeg().toBuffer(), left: (indexes.indexOf(index) % 4) * 360, top: Math.floor(indexes.indexOf(index) / 4) * 250 })));
    await sharp({ create: { width: 1440, height: 1250, channels: 3, background: '#18181b' } }).composite(tiles).png().toFile(path.join(output, 'contact-sheet.png'));
    await encodeVideo(browser, frames, path.join(output, 'tracker-continuity.webm'));
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passed: true, browserErrors: errors, scenarios, timeOrigin, capturedFrames: frames.map(({ file, at }) => ({ file: path.basename(file), t: at * 1000 - timeOrigin })), renderedFrames: frames.length, samples }, null, 2));
    console.log('PASS: rendered-frame recording, contact sheet, and visibility invariants (' + frames.length + ' captured frames; no frame-rate claim)');
  } finally {
    if (browser) await browser.close(); if (app) await app.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); process.chdir(oldCwd);
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });

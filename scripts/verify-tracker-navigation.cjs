/* Actual tracker pages and coordinator, isolated local APIs and a minimal App Router adapter. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const puppeteer = require('puppeteer-core');
const webpack = require('next/dist/compiled/webpack/webpack');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'tmp/tracker-navigation-tests');
const LIST = '/dashboard/client-trackers';
const trackers = Array.from({ length: 30 }, (_, i) => ({ _id: `tracker-${i}`, name: `Work tracker ${i}`, description: `Tracker description ${i}`, status: 'active', financialYear: '2025–26', fields: [{ key: 'ready', label: 'Ready', type: 'toggle' }], clientIds: ['C0'], entryCount: 210, updatedAt: '2026-10-01' }));
let delay = 80, missing = false;
const requests = [];
async function main() {
  fs.mkdirSync(output, { recursive: true }); webpack.init();
  await new Promise((resolve, reject) => {
    const router = path.join(__dirname, 'fixtures/tracker-navigation-router.cjs');
    const compiler = webpack.webpack({ mode: 'development', devtool: false, context: root,
      entry: path.join(__dirname, 'fixtures/tracker-navigation.tsx'), output: { path: output, filename: 'fixture.js' },
      resolve: { extensions: ['.tsx', '.ts', '.js', '.cjs'], alias: { '@': root, 'next/link': router, 'next/navigation': router, 'next-auth/react': path.join(__dirname, 'fixtures/tracker-session.cjs') } },
      module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, 'fixtures/workflow-editor-loader.cjs') }] } });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  const css = (await require('postcss')([require('tailwindcss')(path.join(root, 'tailwind.config.ts'))]).process(fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8').replace(/^@import .+$/gm, ''), { from: path.join(root, 'app/globals.css') })).css
    + ['app/client-profile-premium.css', 'components/ui/liquid-glass/liquid-glass.css', 'components/client-trackers/tracker-navigation-transition.css'].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n')
    + 'body{margin:0;font:14px Arial}#fixture-sidebar{position:fixed;inset:0 auto 0 0;width:220px;background:var(--color-card);padding:20px}#fixture-topbar{position:fixed;top:0;left:220px;right:0;height:64px;background:var(--color-card);padding:20px}.fixture-main{position:fixed;top:64px;left:220px;right:0;bottom:0;overflow:auto;padding:24px}@media(max-width:767px){#fixture-sidebar{width:60px;padding:4px;font-size:8px}#fixture-topbar{left:60px}.fixture-main{left:60px;padding:16px}}';
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.endsWith('.js')) { res.setHeader('Content-Type', 'application/javascript'); return res.end(fs.readFileSync(path.join(output, path.basename(url.pathname)))); }
    if (url.pathname.startsWith('/api/')) {
      requests.push({ path: url.pathname, query: url.search, method: req.method });
      const tracker = trackers.find(item => `/api/client-trackers/${item._id}` === url.pathname);
      let data = url.pathname === '/api/clients' ? [] : url.pathname === '/api/client-trackers' ? trackers.filter(item => !missing || item._id !== 'tracker-0') : { events: [] };
      if (tracker) data = { ...tracker, totalEntryCount: 210, entries: [{ _id: 'entry-0', clientId: 'C0', updatedAt: '2026-10-01', client: { clientId: 'C0', companyName: 'Test client', category: 'PWP' }, values: { ready: false } }], overviewCounts: [{ key: 'ready', value: false, count: 210 }], hasMore: false };
      setTimeout(() => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); }, tracker ? delay : 20); return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, userDataDir: fs.mkdtempSync(path.join(output, 'profile-')), args: ['--no-sandbox'] });
    const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 1000 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const base = `http://127.0.0.1:${server.address().port}`;
    const cards = () => page.waitForSelector('[data-tracker-transition-id]');
    const settled = async () => { await page.waitForFunction(() => !document.querySelector('.tracker-navigation-ghost, .tracker-navigation-surface, .tracker-loading-resolve-surface') && !document.querySelector('[data-tracker-phase]')); };
    const goList = async () => { await page.goto(base + LIST); await cards(); };
    const back = async () => { await page.click('.tracker-back-link'); await cards(); await settled(); };
    await goList();
    const chrome = await page.evaluate(() => ['fixture-sidebar', 'fixture-topbar'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
    for (const index of [0, 1, 2, 20]) {
      const card = `[data-tracker-transition-id="tracker-${index}"]`;
      await page.$eval(card, node => node.scrollIntoView({ block: 'center' }));
      const scroll = await page.$eval('#dashboard-scroll-area', node => node.scrollTop);
      await page.click(card);
      await page.waitForSelector('.tracker-navigation-ghost');
      const motion = await page.evaluate(() => {
        const title = document.querySelector('[data-tracker-ghost-title]');
        const shell = document.querySelector('[data-tracker-ghost-shell]');
        const matrix = new DOMMatrix(getComputedStyle(title).transform);
        return { text: title.textContent, scale: [matrix.a, matrix.d], pointer: getComputedStyle(title.parentElement).pointerEvents, shell: !!shell };
      });
      assert.equal(motion.text, `Work tracker ${index}`); assert.equal(motion.pointer, 'none'); assert(motion.shell); assert.deepEqual(motion.scale, [1, 1]);
      await page.waitForSelector('h1[data-tracker-title]');
      assert(await page.evaluate(() => !document.querySelector('.tracker-navigation-ghost') || getComputedStyle(document.querySelector('h1[data-tracker-title]')).opacity === '0'), 'Real title stays visually hidden during the ghost handoff');
      await settled();
      assert.equal(await page.$eval('h1', node => node.textContent), `Work tracker ${index}`);
      assert.equal(await page.$eval('h1', node => node === document.activeElement), true);
      assert.deepEqual(await page.evaluate(() => ['fixture-sidebar', 'fixture-topbar'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })), chrome);
      await back(); assert(Math.abs(await page.$eval('#dashboard-scroll-area', node => node.scrollTop) - scroll) < 2);
      assert.equal(await page.$eval(card, node => node === document.activeElement), true);
    }
    console.log('PASS: measured forward/reverse endpoints in three columns and a lower row; stable dashboard chrome; scroll and focus restored');
    await page.focus('input[placeholder="Search trackers"]'); await page.keyboard.type('Work tracker 2');
    await page.click('[data-tracker-transition-id="tracker-2"]'); await page.waitForSelector('h1'); await settled(); await back();
    assert.equal(await page.$eval('input[placeholder="Search trackers"]', node => node.value), 'Work tracker 2');
    assert.equal(await page.$$eval('[data-tracker-transition-id]', nodes => nodes.length), 11);
    await page.click('[data-tracker-transition-id="tracker-2"]'); await page.waitForSelector('h1'); await settled();
    await page.goBack(); await cards(); await settled(); assert.equal(await page.$eval('input[placeholder="Search trackers"]', node => node.value), 'Work tracker 2');
    await page.goForward(); await page.waitForSelector('h1[data-tracker-title]'); await settled();
    await page.evaluate(() => window.navigationFixture.go('/dashboard/other')); await page.waitForSelector('h1');
    await page.evaluate(list => window.navigationFixture.go(list), LIST); await cards();
    assert.equal(await page.$eval('input[placeholder="Search trackers"]', node => node.value), '');
    console.log('PASS: search survives All trackers and browser Back/Forward; fresh sidebar-style visit starts clean');
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find(node => node.textContent.trim() === 'Archived').click();
    });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(node => node.textContent.trim() === 'Active trackers'));
    await cards(); await page.click('[data-tracker-transition-id="tracker-0"]'); await page.waitForSelector('h1'); await settled(); await back();
    assert(await page.evaluate(() => [...document.querySelectorAll('button')].some(node => node.textContent.trim() === 'Active trackers')));
    console.log('PASS: archive filter restored before returning list data is requested');
    await goList(); delay = 1800;
    await page.click('[data-tracker-transition-id="tracker-0"]');
    await page.waitForSelector('[data-tracker-loading-identity]'); await settled();
    assert(await page.$('[aria-label="Loading tracker"]'));
    assert.equal(await page.$eval('[data-tracker-loading-identity] h1', node => getComputedStyle(node).opacity), '1');
    await page.waitForSelector('input[aria-label="Find client"]'); delay = 80;
    assert.equal(await page.$eval('h1', node => node === document.activeElement), true);
    console.log('PASS: slow data load finishes identity handoff inside the progressive workspace; real heading receives focus');
    await goList(); await page.click('[data-tracker-transition-id="tracker-0"]'); await page.waitForSelector('h1');
    await page.setViewport({ width: 1300, height: 900 }); await settled(); await page.waitForSelector('input[aria-label="Find client"]');
    await back(); await page.click('[data-tracker-transition-id="tracker-0"]', { clickCount: 2 }); await page.waitForSelector('h1'); await settled();
    await page.click('.tracker-back-link'); await cards(); await settled();
    await page.click('[data-tracker-transition-id="tracker-1"]'); await page.goBack(); await cards(); await settled();
    assert.equal(new URL(page.url()).pathname, LIST);
    console.log('PASS: resize, double click, and browser Back during handoff clean up overlays');
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.focus('[data-tracker-transition-id="tracker-0"]'); await page.keyboard.press('Enter');
    await page.waitForSelector('input[aria-label="Find client"]'); await settled();
    assert.equal(await page.$('.tracker-navigation-ghost'), null); await back();
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await page.setViewport({ width: 390, height: 844 }); await page.click('[data-tracker-transition-id="tracker-0"]');
    await page.waitForSelector('input[aria-label="Find client"]'); await settled(); assert.equal(await page.$('.tracker-navigation-ghost'), null); await back();
    console.log('PASS: keyboard activation, reduced motion, and mobile content fallback');
    await page.setViewport({ width: 1024, height: 900 });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.click('[data-tracker-transition-id="tracker-0"]'); await page.waitForSelector('h1'); await settled();
    await page.screenshot({ path: path.join(output, 'dark-tablet-detail.png'), fullPage: true }); await back();
    await page.goto(base + LIST + '/tracker-0'); await page.waitForSelector('input[aria-label="Find client"]');
    assert.equal(await page.$('.tracker-navigation-ghost'), null);
    await page.reload(); await page.waitForSelector('input[aria-label="Find client"]'); assert.equal(await page.$('.tracker-navigation-ghost'), null);
    console.log('PASS: dark tablet navigation and direct URL/refresh without fabricated source');
    await goList();
    await page.click('[data-tracker-transition-id="tracker-0"]'); await page.waitForSelector('h1'); await settled();
    missing = true; await page.evaluate(() => window.navigationFixture.invalidateList()); await back();
    assert.equal(await page.$('[data-tracker-transition-id="tracker-0"]'), null);
    assert.equal(await page.$('[data-tracker-handoff]'), null); missing = false;
    await goList();
    await page.evaluate(() => window.navigationFixture.setParamDelay(1600));
    await page.$eval('[data-tracker-transition-id="tracker-29"]', node => node.scrollIntoView({ block: 'center' }));
    await page.click('[data-tracker-transition-id="tracker-29"]'); await page.waitForSelector('.tracker-navigation-surface');
    await settled(); await page.waitForSelector('input[aria-label="Find client"]');
    assert.equal(await page.$eval('h1', node => getComputedStyle(node).opacity), '1');
    console.log('PASS: missing-card fallback and bounded timeout when the destination route anchor is delayed');
    assert.deepEqual(errors, []);
    assert(requests.every(request => request.method === 'GET'), 'Navigation tests never write business data');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passed: true, browserErrors: errors, requests }, null, 2));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

// Dashboard activity provider/dock against isolated persisted API responses.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const puppeteer = require('puppeteer-core'), webpack = require('next/dist/compiled/webpack/webpack');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'tmp/email-activity-ui', 'run-' + Date.now());
const stamp = () => new Date().toISOString();
const makeJob = (id, status = 'processing') => ({ campaignId: id, trackerId: 'tracker-1', trackerName: 'Annual compliance', workflowName: id === 'campaign-first' ? 'Annual Return Reminder' : 'Document follow-up',
  mode: 'send', kind: 'reminder', status, total: 80, processed: 39, sent: 37, drafts: 0, failed: 2, uncertain: 0, delivering: 1, pending: 40, createdAt: stamp(), startedAt: stamp(), updatedAt: stamp(), completedAt: null, message: null, executionMode: "browser", canResume: false, controllerLeaseExpiresAt: null, needsHistoryRepair: false });
let jobs = [makeJob('campaign-first'), makeJob('campaign-second')], fail = false, requests = [], concurrent = 0, peak = 0;
let holdResume = false, releaseResume, resumeReady;
const item = i => ({ index: i, clientId: 'C' + i, companyName: 'Client ' + i, to: ['client' + i + '@example.com'], cc: ['accounts@example.com'], subject: 'Annual return reminder', status: i === 2 ? 'uncertain' : i === 1 ? 'failed' : 'sent', error: i === 2 ? 'Review Gmail before retrying.' : null, processedAt: stamp(), gmailReference: 'fixture-' + i });
async function main() {
  fs.mkdirSync(output, { recursive: true }); webpack.init();
  await new Promise((resolve, reject) => {
    const compiler = webpack.webpack({ mode: 'development', devtool: false, context: root, entry: path.join(__dirname, 'fixtures/email-activity.tsx'), output: { path: output, filename: 'fixture.js' },
      resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@': root, 'next/link': path.join(__dirname, 'fixtures/tracker-next-link.cjs') } },
      module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, 'fixtures/workflow-editor-loader.cjs') }] } });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  const css = (await require('postcss')([require('tailwindcss')(path.join(root, 'tailwind.config.ts'))]).process(fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8').replace(/^@import .+$/gm, ''), { from: path.join(root, 'app/globals.css') })).css
    + ['components/client-trackers/email-delivery-activity.css', 'components/client-trackers/email-delivery-security.css'].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n') + 'body{font-family:Arial;background:var(--color-surface);color:var(--color-text)}main{padding:30px}main button{padding:10px;border:1px solid #888;border-radius:8px}';
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/fixture.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(fs.readFileSync(path.join(output, 'fixture.js'))); }
    if (url.pathname.startsWith('/api/')) {
      requests.push(url.pathname + url.search); concurrent++; peak = Math.max(peak, concurrent);
      let data;
      const match = url.pathname.match(/\/jobs\/([^/]+)/), job = jobs.find(row => row.campaignId === match?.[1]);
      if (url.pathname.endsWith('/resume')) {
        let raw = ''; for await (const chunk of req) raw += chunk;
        assert.equal(JSON.parse(raw).confirmed, true);
        job.canResume = false; job.status = 'queued'; job.updatedAt = stamp();
        data = { job, coordinatorToken: 'isolated-coordinator-capability-token' };
      } else if (url.pathname.endsWith('/batch')) {
        setTimeout(() => {
          const count = Math.min(3, job.pending); job.sent += count; job.processed += count; job.pending -= count;
          job.status = job.pending ? 'processing' : 'completed'; job.updatedAt = stamp();
          concurrent--; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ state: job.pending ? 'processing' : 'done', job }));
        }, 700); return;
      } else if (url.pathname.endsWith('/items')) {
        const status = url.searchParams.get('status'), search = url.searchParams.get('search') || '', offset = Number(url.searchParams.get('offset') || 0);
        const rows = Array.from({ length: 80 }, (_, i) => item(i)).filter(row => (status === 'all' || row.status === status) && (!search || [row.companyName, ...row.to].some(value => value.toLowerCase().includes(search.toLowerCase()))));
        data = { job, items: rows.slice(offset, offset + 25), matching: rows.length, nextOffset: offset + 25 < rows.length ? offset + 25 : null };
      } else if (job) data = { job };
      else data = { jobs: url.searchParams.has('active') ? jobs.filter(row => ['queued', 'processing', 'recovering', 'interrupted', 'paused_daily_limit'].includes(row.status)) : jobs, nextCursor: null };
      const respond = () => { concurrent--; res.statusCode = fail ? 503 : 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(fail ? { error: 'Fixture offline' } : data)); };
      if (holdResume && url.pathname.endsWith('/resume')) { releaseResume = respond; resumeReady?.(); return; }
      setTimeout(respond, 60);
      return;
    }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = 'http://127.0.0.1:' + server.address().port;
  let browser, page;
  try {
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, userDataDir: fs.mkdtempSync(path.join(output, 'profile-')), args: ['--no-sandbox'] });
    page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    const wait = ms => page.evaluate(ms => new Promise(resolve => setTimeout(resolve, ms)), ms);
    const click = async text => { for (const node of await page.$$('button')) if ((await node.evaluate(node => node.textContent)).trim() === text) { await require('./fixtures/wait-for-stable-control.cjs')(node); return node.click(); } throw Error('Missing button ' + text); };
    await page.setViewport({ width: 1440, height: 1000 }); await page.goto(base);
    await page.waitForFunction(() => document.querySelector('.delivery-activity-dock')?.textContent.includes('39 of 80 processed'));
    assert((await page.$eval('.delivery-activity-dock', node => node.textContent)).includes('37 sent · 2 failed'));
    await page.click('[aria-label="Expand email activity"]'); await page.waitForSelector('.delivery-activity-item-summary');
    await click('Uncertain'); await page.waitForFunction(() => document.querySelectorAll('.delivery-activity-item').length === 1);
    await page.click('.delivery-activity-item-summary'); assert((await page.$eval('.delivery-activity-item-detail', node => node.textContent)).includes('Review Gmail'));
    await page.click('[aria-label="Minimize email activity"]'); await click('Navigate to reports');
    assert.equal(await page.$eval('h1', node => node.textContent), 'Reports'); assert(await page.$('.delivery-activity-progress'));
    await page.click('[aria-label="Expand email activity"]'); assert.equal(await page.$eval('[aria-label="Message outcome filter"] [aria-pressed="true"]', node => node.textContent), 'Uncertain');
    await click('All'); await page.waitForFunction(() => document.querySelectorAll('.delivery-activity-item').length === 25);
    await click('Next'); await page.waitForFunction(() => document.querySelector('.delivery-activity-pagination')?.textContent.includes('26–50'));
    await page.type('[aria-label="Search delivery messages"]', 'Client 79'); await page.waitForFunction(() => document.querySelectorAll('.delivery-activity-item').length === 1 && document.querySelector('.delivery-activity-item')?.textContent.includes('Client 79'));
    await page.screenshot({ path: path.join(output, 'expanded-light.png') });
    await page.evaluate(() => document.documentElement.classList.add('dark')); await page.screenshot({ path: path.join(output, 'expanded-dark.png') });
    for (const width of [768, 390]) { await page.setViewport({ width, height: 900 }); await wait(450); assert(await page.$eval('.delivery-activity-dock', node => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })); await page.screenshot({ path: path.join(output, 'expanded-' + width + '.png') }); }
    // Both formerly active jobs must acquire terminal results, even when one is not selected.
    jobs = jobs.map(job => ({ ...job, status: 'completed_with_errors', processed: 80, sent: 77, failed: 2, uncertain: 1, delivering: 0, pending: 0, completedAt: stamp(), updatedAt: stamp() }));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => document.querySelector('.delivery-activity-dock')?.textContent.includes('77 emails sent · 2 failed · 1 uncertain'));
    assert.equal(await page.$('[aria-label="Campaign"]'), null); // Picker disappears after all active jobs finish.
    await page.click('[aria-label="Open delivery history"]'); await page.waitForFunction(() => document.querySelectorAll('.delivery-activity-history-row').length === 2);
    fail = true; await page.evaluate(() => window.dispatchEvent(new Event('online'))); await page.waitForSelector('.delivery-activity-connection');
    fail = false; await page.click('[aria-label="Refresh email activity"]'); await page.waitForSelector('.delivery-activity-connection', { hidden: true });
    const before = requests.length; await page.evaluate(() => { for (let i = 0; i < 10; i++) window.dispatchEvent(new Event('focus')); }); await wait(400);
    assert(requests.length - before <= 3, 'Focus bursts reuse one in-flight refresh');
    await page.close();
    page = await browser.newPage(); page.on('dialog', dialog => void dialog.accept()); await page.goto(base); await click('Delivery history'); await page.waitForFunction(() => document.querySelectorAll('.delivery-activity-history-row').length === 2);
    await page.click('.delivery-activity-history-row'); await page.waitForFunction(() => document.querySelector('.delivery-activity-dock')?.textContent.includes('80 of 80 processed'));
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.screenshot({ path: path.join(output, 'restored-completion.png') });
    // The actual shared controller survives navigation, but a refresh must not restart it.
    jobs = [{ ...makeJob('campaign-first', 'interrupted'), total: 30, processed: 0, sent: 0, failed: 0, uncertain: 0, pending: 30, delivering: 0, canResume: true }];
    // This fixture resets its mock database between campaigns; reset the page too.
    // A terminal immutable campaign must never regress to a new 0/N campaign in memory.
    await page.reload(); await page.waitForFunction(() => document.querySelector('.delivery-activity-dock')?.textContent.includes('0 of 30 processed'));
    await click('Start fixture campaign');
    await page.waitForFunction(() => document.querySelector('.delivery-activity-dock')?.textContent.includes('0 of 30 processed'));
    const batchCount = () => requests.filter(value => value.endsWith('/batch')).length;
    await page.waitForFunction(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; });
    for (const route of ['clients', 'settings', 'client-trackers/other']) { await click('Navigate to ' + route); assert(await page.$('.delivery-activity-dock')); }
    await page.waitForFunction(() => document.querySelector('.delivery-activity-dock')?.textContent.includes('3 of 30 processed'));
    await page.reload(); await wait(1100);
    const afterReload = batchCount(); await wait(1100); assert.equal(batchCount(), afterReload, 'Reload never silently resumes the browser loop');
    jobs[0] = { ...jobs[0], status: 'interrupted', canResume: true, controllerLeaseExpiresAt: null, updatedAt: stamp() };
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => document.querySelector('.delivery-activity-dock')?.textContent.includes('Delivery interrupted'));
    await page.click('[aria-label="Expand email activity"]'); await click('Resume remaining');
    await page.waitForSelector('.delivery-activity-resume-confirmation .email-security-hold');
    await page.screenshot({ path: path.join(output, 'browser-resume-confirmation.png') });
    await page.$eval('.delivery-activity-resume-confirmation .email-security-hold', async node => {
      node.focus(); node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 1200)); node.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelector('.delivery-activity-dock')?.textContent.includes('30 emails sent'), { timeout: 20000 });
    assert.equal(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; }), false, 'Completion removes the leave guard');
    assert(batchCount() > afterReload, 'Explicit resume reconnects the mounted controller');
    await page.screenshot({ path: path.join(output, 'browser-resume-complete.png') });
    // The accepted-job handoff must remain Starting even before the first lease response.
    for (const total of [1, 100]) {
      jobs = [{ ...makeJob('campaign-first', 'queued'), total, processed: 0, sent: 0, failed: 0, uncertain: 0, pending: total, delivering: 0, startedAt: null, canResume: false }];
      holdResume = true; releaseResume = null;
      const receivedResume = new Promise(resolve => { resumeReady = resolve; });
      await page.reload(); await page.waitForFunction(total => document.querySelector('.delivery-activity-dock')?.textContent.includes(`0 of ${total} processed`), {}, total);
      await page.evaluate(() => {
        window.lifecycleFlashes = [];
        window.lifecycleObserver = new MutationObserver(() => {
          const dock = document.querySelector('.delivery-activity-dock');
          if (dock?.innerText.includes('Delivery interrupted') || [...(dock?.querySelectorAll('button') || [])].some(node => node.textContent.trim() === 'Resume remaining')) window.lifecycleFlashes.push(dock.innerText);
        });
        window.lifecycleObserver.observe(document.body, { subtree: true, childList: true, characterData: true });
      });
      await click('Start fixture campaign'); await receivedResume;
      const initialBatches = batchCount();
      const resumeCallsAfterWatch = requests.filter(value => value.endsWith('/resume')).length;
      await page.click('[aria-label="Expand email activity"]'); await wait(450);
      assert((await page.$eval('.delivery-activity-heading', node => node.textContent)).includes('Starting email delivery…'));
      assert.equal(batchCount(), initialBatches, 'No batch runs before the coordinator token arrives');
      await click('Navigate to reports'); await click('Navigate to clients');
      assert.equal(requests.filter(value => value.endsWith('/resume')).length, resumeCallsAfterWatch, 'Internal navigation preserves the pending coordinator claim');
      releaseResume(); holdResume = false;
      await page.waitForFunction(total => document.querySelector('.delivery-activity-dock')?.textContent.includes(total === 1 ? '1 email sent' : '3 of 100 processed'), {}, total);
      if (total === 100) {
        const current = { ...jobs[0], observedAt: new Date(Date.now() + 1000).toISOString() };
        const stale = { ...current, processed: 0, sent: 0, status: 'interrupted', canResume: true, observedAt: new Date(Date.now() - 1000).toISOString() };
        await page.evaluate(({ current, stale }) => { window.deliveryFixture.observe(current); for (let i = 0; i < 10; i++) window.deliveryFixture.observe(stale); }, { current, stale });
        await wait(100);
        assert((await page.$eval('.delivery-activity-heading', node => node.textContent)).includes('Sending emails…'));
      }
      assert.deepEqual(await page.evaluate(() => { window.lifecycleObserver.disconnect(); return window.lifecycleFlashes; }), [], 'Fresh startup/active delivery never exposes interruption or Resume');
    }
    // A new website instance recovers saved 0/N work but never claims it automatically.
    jobs = [{ ...makeJob('campaign-first', 'interrupted'), total: 100, processed: 0, sent: 0, failed: 0, uncertain: 0, pending: 100, delivering: 0, startedAt: null, canResume: true }];
    await page.reload(); await page.waitForFunction(() => document.querySelector('.delivery-activity-heading')?.textContent.includes('Delivery interrupted'));
    const resumedBefore = requests.filter(value => value.endsWith('/resume')).length;
    await page.click('[aria-label="Expand email activity"]'); await wait(450);
    assert(await page.$eval('.delivery-activity-resume-confirmation', node => node.textContent.includes('Resume remaining')));
    assert.equal(requests.filter(value => value.endsWith('/resume')).length, resumedBefore, 'A fresh page does not infer coordinator ownership');
    jobs[0] = { ...jobs[0], status: 'processing', canResume: false, controllerLeaseExpiresAt: new Date(Date.now() + 120000).toISOString(), updatedAt: stamp() };
    await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.waitForFunction(() => document.querySelector('.delivery-activity-heading')?.textContent.includes('Sending emails…'));
    assert.equal(await page.$('.delivery-activity-resume-confirmation'), null, 'Another browser owns the lease');
    assert.deepEqual(errors, []); console.log('PASS: dashboard activity, real outcome counts, route continuity, minimize/expand filter retention, item pagination/search, multiple-job completion reconciliation, offline recovery, bounded polling, history after tab closure, desktop/tablet/mobile and reduced motion. Captures: ' + output);
  } finally { if (browser) { const timer = setTimeout(() => browser.process()?.kill(), 10000); try { await browser.close(); } finally { clearTimeout(timer); } } server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

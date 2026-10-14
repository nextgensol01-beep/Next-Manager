// Browser regression checks against the actual tracker page, with isolated API fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const puppeteer = require('puppeteer-core');
const compiledWebpack = require('next/dist/compiled/webpack/webpack');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp/tracker-search-tests');
const requests = [];
const openingOnly = process.env.TRACKER_OPENING_ONLY === '1';
let overviewFinished = false;
let failNextWrite = false;
let failNextSearch = false;
const trackerId = '0123456789abcdef01234567';
const clients = Array.from({ length: 130 }, (_, index) => ({ clientId: `C${index}`, companyName: index === 128 ? 'Needle Ltd' : `Company ${index}`, category: 'PWP' }));
const entries = clients.map((client, index) => ({ _id: client.clientId, clientId: client.clientId, client, updatedAt: '2026-10-03T00:00:00Z', values: { ready: index % 2 === 0, amount: 1 } }));
const data = (url) => {
  const search = (url.searchParams.get('search') || '').toLowerCase();
  const filtered = entries.filter(entry => entry.client.companyName.toLowerCase().includes(search) || entry.clientId.toLowerCase().includes(search))
    .filter(entry => !url.searchParams.has('field') || Number(entry.values[url.searchParams.get('field')]) === Number(url.searchParams.get('value')));
  const offset = Number(url.searchParams.get('offset') || 0);
  return {
    _id: trackerId, name: 'Search test tracker', status: 'active', clientIds: clients.map(client => client.clientId),
    fields: [{ key: 'ready', label: 'Ready', type: 'toggle' }, { key: 'amount', label: 'Amount', type: 'number' }],
    emailWorkflows: openingOnly ? [{ id: 'email-fixture', name: 'Fixture email', mainFieldKey: 'ready', mainValue: 'No', subject: 'Hello {{client.companyName}}', body: '<p>Fixture body</p>', points: [], contentMode: 'points', recipientStrategy: 'selected' }] : [],
    entries: filtered.slice(offset, offset + 100), entryCount: filtered.length, totalEntryCount: 130,
    offset, hasMore: offset + 100 < filtered.length, nextOffset: offset + 100 < filtered.length ? offset + 100 : null,
    overviewCounts: [{ key: 'ready', value: true, count: 65 }, { key: 'ready', value: false, count: 65 }],
  };
};
async function main() {
  fs.mkdirSync(output, { recursive: true });
  compiledWebpack.init();
  await new Promise((resolve, reject) => {
    const compiler = compiledWebpack.webpack({
      mode: 'development', devtool: false, context: root,
      entry: path.join(__dirname, 'fixtures/tracker-search.tsx'), output: { path: output, filename: 'fixture.js' },
      resolve: { extensions: ['.tsx', '.ts', '.js'], alias: {
        '@': root, 'next/link': path.join(__dirname, 'fixtures/tracker-next-link.cjs'),
        'next-auth/react': path.join(__dirname, 'fixtures/tracker-session.cjs'),
      } },
      module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, 'fixtures/workflow-editor-loader.cjs') }] },
    });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname.endsWith('.js') && fs.existsSync(path.join(output, path.basename(url.pathname)))) { response.setHeader('Content-Type', 'application/javascript; charset=utf-8'); response.end(fs.readFileSync(path.join(output, path.basename(url.pathname)))); }
    else if (url.pathname.startsWith('/api/')) {
      requests.push(url);
      if (request.method === 'PATCH') {
        let body = '';
        request.on('data', chunk => { body += chunk; });
        request.on('end', () => {
          const change = JSON.parse(body);
          const entry = entries.find(entry => entry._id === url.pathname.split('/').at(-1));
          const failed = failNextWrite;
          failNextWrite = false;
          if (!failed) entry.values[change.key] = change.key === 'ready' ? Boolean(change.value) : Number(change.value);
          // Capture the full row at commit, then return responses in reverse order.
          const snapshot = JSON.stringify(failed ? { error: 'Write rejected' } : entry);
          setTimeout(() => {
            response.setHeader('Content-Type', 'application/json');
            response.statusCode = failed ? 500 : 200;
            response.end(snapshot);
          }, openingOnly && change.key === 'amount' ? 700 : 80);
        });
        return;
      }
      const isTracker = url.pathname === `/api/client-trackers/${trackerId}`;
      const failed = isTracker && url.searchParams.has('search') && failNextSearch;
      const isOverview = url.searchParams.get('overviewOnly') === '1';
      if (failed) failNextSearch = false;
      setTimeout(() => {
        response.setHeader('Content-Type', 'application/json');
        if (failed) { response.statusCode = 500; response.end(JSON.stringify({ error: 'Fixture error' })); }
        else response.end(JSON.stringify(isTracker ? data(url) : url.pathname === '/api/clients' ? clients : url.pathname === '/api/documents' ? [] : { events: [] }));
        if (isOverview) overviewFinished = true;
      }, openingOnly && isOverview ? 2000 : isTracker && url.searchParams.has('search') ? 700 : 100);
    } else {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file => fs.existsSync(file));
  let browser;
  let page;
  try {
    assert(executablePath, 'Local Chromium is required for browser regression checks');
    const userDataDir = fs.mkdtempSync(path.join(output, 'profile-'));
    browser = await puppeteer.launch({ executablePath, userDataDir, headless: true, args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}${openingOnly ? '/?opening=1' : ''}`);
    await page.waitForSelector('input[aria-label="Find client"]');
    const clickText = async text => {
      const clicked = await page.evaluate(text => {
        const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text);
        if (!button) return false;
        button.click(); return true;
      }, text);
      assert(clicked, `Button ${text} exists`);
    };
    await page.waitForFunction(() => document.body.textContent.includes('Showing 1–100'));
    assert(!requests.some(url => ['/api/clients', '/api/documents'].includes(url.pathname)), 'Directories load only when needed');
    console.log('PASS: opening the actual tracker page does not fetch the full client or document directories');

    if (openingOnly) {
      assert(!overviewFinished, 'Table is usable before the delayed whole-tracker summary completes');
      assert(await page.$eval('fieldset', node => !node.disabled));
      assert.equal(await page.$eval('.tracker-status-value span', node => node.textContent), '—', 'Never label page-only counts as tracker totals');
      assert(requests.some(url => url.searchParams.get('overview') === '0'));
      console.log('PASS: usable table before delayed totals, with honest pending counts');

      const editAmount = async value => {
        await page.focus('tbody tr:first-child input[type="number"]');
        await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control');
        await page.keyboard.type(String(value)); await page.keyboard.press('Tab');
      };
      const patchCount = () => requests.filter(url => url.pathname.endsWith('/entries/C0')).length;
      await editAmount(2);
      await page.waitForFunction(() => document.querySelector('tbody tr:first-child input[type="number"]').disabled);
      // Toggle a different column while the number response is deliberately delayed.
      await page.$eval('tbody tr:first-child [role="switch"]', node => node.click());
      await page.waitForFunction(() => document.querySelector('tbody tr:first-child [role="switch"]').getAttribute('aria-checked') === 'false');
      await page.waitForFunction(() => document.querySelector('fieldset')?.getAttribute('aria-busy') === 'false' && !document.querySelector('tbody tr:first-child input[type="number"]').disabled);
      assert.equal(patchCount(), 2);
      assert.equal(await page.$eval('tbody tr:first-child input[type="number"]', node => node.value), '2');
      assert.equal(await page.$eval('tbody tr:first-child [role="switch"]', node => node.getAttribute('aria-checked')), 'false');
      assert.equal(entries[0].values.amount, 2); assert.equal(entries[0].values.ready, false);
      console.log('PASS: out-of-order full-row save responses preserve both edited columns');

      failNextWrite = true;
      await editAmount(3);
      await page.waitForFunction(() => document.querySelector('tbody tr:first-child input[type="number"]').disabled);
      await page.waitForFunction(() => document.querySelector('tbody tr:first-child input[type="number"]').value === '2' && !document.querySelector('tbody tr:first-child input[type="number"]').disabled);
      assert.equal(entries[0].values.amount, 2);
      console.log('PASS: failed saves roll back the affected cell and reload server values');

      await page.evaluate(() => window.setTrackerMounted(false));
      await page.waitForFunction(() => !document.querySelector('tbody'));
      entries[0].values.amount = 9;
      await page.evaluate(() => window.setTrackerMounted(true));
      await page.waitForSelector('tbody tr:first-child input[type="number"]');
      assert.equal(await page.$eval('tbody tr:first-child input[type="number"]', node => node.value), '9');
      console.log('PASS: reopening in the same session reads changed server values');

      await page.waitForFunction(() => window.freshReads.length === 1);
      await page.evaluate(() => window.freshControls.next('second'));
      await page.waitForFunction(() => window.freshReads.length === 2);
      await page.evaluate(() => window.freshReads[1].complete(20));
      await page.waitForFunction(() => JSON.parse(document.querySelector('#fresh-result').textContent).data?.value === 20);
      await page.evaluate(() => window.freshReads[0].complete(10));
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
      assert.equal(await page.$eval('#fresh-result', node => JSON.parse(node.textContent).data.value), 20);
      await page.evaluate(() => { void window.freshControls.refetch(); });
      await page.waitForFunction(() => window.freshReads.length === 3);
      await page.evaluate(() => { window.freshControls.pause(true); window.freshControls.mutate({ value: 30 }); });
      await page.evaluate(() => window.freshReads[2].complete(21));
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
      assert.equal(await page.$eval('#fresh-result', node => JSON.parse(node.textContent).data.value), 30);
      await page.evaluate(() => { void window.freshControls.refetch(); });
      assert.equal(await page.evaluate(() => window.freshReads.length), 3, 'No reads during an outstanding save');
      await page.evaluate(() => window.freshControls.pause(false));
      await page.waitForFunction(() => window.freshReads.length === 4);
      await page.evaluate(() => window.freshReads[3].complete(31));
      await page.waitForFunction(() => JSON.parse(document.querySelector('#fresh-result').textContent).data?.value === 31);
      assert(await page.evaluate(() => window.freshReads.every(read => read.cache === 'no-store')));
      console.log('PASS: late reads cannot overwrite a newer filter or save, even when abort is ignored; resume revalidates');
      await clickText('Email updates');
      await page.waitForSelector('button[aria-label="Open Fixture email"]');
      await page.$eval('button[aria-label="Open Fixture email"]', node => node.click());
      await page.waitForSelector('button[aria-label="Step 5: Template"]');
      await page.$eval('button[aria-label="Step 5: Template"]', node => node.click());
      await page.waitForSelector('[contenteditable="true"][aria-label="Email subject"]');
      assert(await page.evaluate(() => [...document.querySelectorAll('[contenteditable="true"]')].some(node => node.textContent.includes('Fixture body'))));
      await page.$eval('button[aria-label="Step 6: Delivery"]', node => node.click());
      await page.waitForSelector('[aria-label="Create a no-reply follow-up task"]');
      console.log('PASS: deferred workflow chunks load when opened and retain template and delivery behavior');
      assert.deepEqual(errors, []);
      return;
    }

    await clickText('Next');
    await page.waitForFunction(() => document.body.textContent.includes('Showing 101–130'));
    await page.type('input[aria-label="Find client"]', 'Needle', { delay: 40 });
    await page.waitForFunction(() => document.querySelector('fieldset')?.getAttribute('aria-busy') === 'true');
    assert(await page.$eval('input[aria-label="Find client"]', node => document.activeElement === node), 'Search keeps focus while loading');
    await page.waitForFunction(() => document.body.textContent.includes('Showing 1–1 of 1'));
    assert.equal(await page.$eval('input[aria-label="Find client"]', node => node.value), 'Needle');
    assert(await page.$eval('input[aria-label="Find client"]', node => document.activeElement === node));
    const searches = requests.filter(url => url.searchParams.has('search'));
    assert.equal(searches.length, 1, 'Rapid typing coalesces into one request');
    assert.equal(searches[0].searchParams.get('offset'), '0', 'Search after page two starts at page one');
    assert.equal(searches[0].searchParams.get('search'), 'Needle');
    console.log('PASS: rapid typing keeps focus, makes one request, and resets pagination before fetching');

    await page.select('select[aria-label="Tracker marker"]', 'amount');
    await page.waitForSelector('input[aria-label="Marker value"]');
    await page.type('input[aria-label="Marker value"]', '1.0', { delay: 40 });
    await page.waitForFunction(() => document.querySelector('fieldset')?.getAttribute('aria-busy') === 'false');
    assert(await page.evaluate(() => document.querySelector('tbody').textContent.includes('Needle Ltd')), 'Numeric lexical differences must not hide server-matched rows');
    console.log('PASS: server-matched numeric results are not filtered out again by the browser');

    await page.focus('input[aria-label="Find client"]');
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => document.body.textContent.includes('Showing 1–100') && document.querySelector('fieldset')?.getAttribute('aria-busy') === 'false');
    console.log('PASS: clearing search stays on page one rather than restoring a previous page offset');

    const initialQueryCount = requests.filter(url => url.pathname === `/api/client-trackers/${trackerId}` && !url.searchParams.has('field') && !url.searchParams.has('search') && url.searchParams.get('offset') === '0').length;
    await page.focus('tbody tr:first-child input[type="number"]');
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.type('2');
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => document.body.textContent.includes('of 129 matching clients'));
    await page.select('select[aria-label="Tracker marker"]', '__all_tracker_values__');
    await page.waitForFunction(() => document.body.textContent.includes('of 130 matching clients') && document.querySelector('fieldset')?.getAttribute('aria-busy') === 'false');
    assert.equal(await page.$eval('tbody tr:first-child input[type="number"]', node => node.value), '2');
    const refreshedQueryCount = requests.filter(url => url.pathname === `/api/client-trackers/${trackerId}` && !url.searchParams.has('field') && !url.searchParams.has('search') && url.searchParams.get('offset') === '0').length;
    assert.equal(refreshedQueryCount, initialQueryCount + 1, 'Editing a mark invalidates previously cached filter variants');
    console.log('PASS: editing a mark invalidates cached filters and returning to All clients shows the new value');

    failNextSearch = true;
    await page.focus('input[aria-label="Find client"]');
    await page.keyboard.press('End');
    await page.type('input[aria-label="Find client"]', ' error');
    await page.waitForSelector('[role="alert"]');
    assert(await page.$eval('fieldset', node => node.disabled), 'Failed results cannot be edited as though they matched the new filter');
    assert(await page.$('input[aria-label="Find client"]'), 'A failed request does not remove the filters');
    await clickText('Retry');
    await page.waitForFunction(() => !document.querySelector('[role="alert"]') && document.querySelector('fieldset')?.getAttribute('aria-busy') === 'false');
    console.log('PASS: a failed search keeps filters mounted, disables stale edits, and supports retry');
    assert.deepEqual(errors, [], `No unhandled page errors: ${errors.join(', ')}`);
  } catch (error) {
    console.error('Requests:', requests.map(url => url.pathname + url.search));
    if (page) console.error('Page text:', (await page.$eval('body', node => node.textContent)).slice(0, 1500));
    throw error;
  } finally {
    if (browser) {
      const process = browser.process();
      const timer = setTimeout(() => process?.kill(), 15000);
      await browser.close().catch(() => process?.kill());
      clearTimeout(timer);
    }
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

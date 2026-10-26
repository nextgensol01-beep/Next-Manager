/* Real billing modal, 5,000 fictional clients, loopback-only APIs. No database,
 * credentials, Gmail or live client records. All disposable output is task-owned. */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core'), runtime = require('next/dist/compiled/webpack/webpack');
const root = path.resolve(__dirname, '..');
const arg = process.argv.indexOf('--task');
const task = arg < 0 ? fs.mkdtempSync(path.join(root, 'tmp/billing-combobox-task-')) : path.resolve(process.argv[arg + 1]);
assert(path.dirname(task) === path.join(root, 'tmp') && path.basename(task).startsWith('billing-combobox-task-'));
fs.mkdirSync(task, { recursive: true });
const baseline = path.join(root, '.artifacts/billing-client-combobox-20261023/BillingModal.before.txt');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], geometry = [], timings = [], requests = [], saves = [], errors = [];
function pass(message) { checks.push(message); console.log('PASS: ' + message); }
async function bundle(before) {
  const output = path.join(task, before ? 'before' : 'after');
  const loader = path.join(task, 'baseline-loader.cjs');
  fs.writeFileSync(loader, 'module.exports=function(source){return require("node:fs").readFileSync(this.getOptions().baseline,"utf8")};');
  runtime.init();
  await new Promise((resolve, reject) => {
    const compiler = runtime.webpack({ mode: 'development', devtool: false, context: root,
      entry: path.join(__dirname, 'fixtures/billing-client-combobox.tsx'), output: { path: output, filename: 'fixture.js' },
      resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@': root } },
      module: { rules: [
        ...(before ? [{ test: /[\\/]BillingModal\.tsx$/, enforce: 'pre', use: { loader, options: { baseline } } }] : []),
        { test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, 'fixtures/workflow-editor-loader.cjs') },
      ] },
    });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors()
      ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
}
async function main() {
  await bundle(false);
  if (fs.existsSync(baseline)) await bundle(true);
  const css = (await require('postcss')([require('tailwindcss')(path.join(root, 'tailwind.config.ts'))])
    .process(fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8').replace(/^@import .+$/gm, ''), { from: path.join(root, 'app/globals.css') })).css
    + ['components/ui/liquid-glass/liquid-glass.css', 'app/clients-premium.css', 'app/client-profile-premium.css', 'app/tracker-create.css', 'app/tracker-configure.css', 'app/financial-year-modal.css']
      .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n')
    + 'body{margin:0;background:var(--color-surface);color:var(--color-text)}';
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://fixture');
      if (url.pathname.endsWith('.js')) {
        res.setHeader('content-type', 'application/javascript');
        res.end(fs.readFileSync(path.join(task, url.pathname.startsWith('/before/') ? 'before' : 'after', path.basename(url.pathname)))); return;
      }
      if (!url.pathname.startsWith('/api/')) {
        const variant = url.pathname.startsWith('/before') ? 'before' : 'after';
        res.setHeader('content-type', 'text/html');
        res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/${variant}/fixture.js"></script></body></html>`); return;
      }
      let raw = ''; for await (const chunk of req) raw += chunk;
      requests.push({ path: url.pathname, query: url.search, method: req.method });
      let body = [];
      if (url.pathname === '/api/financial-year') body = [{ targets: [{ categoryId: '1', type: 'RECYCLING', value: 12.5 }] }];
      else if (url.pathname === '/api/credit-transactions') body = [{ creditType: 'RECYCLING', rateCat1: 80 }];
      else if (url.pathname.startsWith('/api/billing') && ['POST', 'PUT'].includes(req.method)) {
        saves.push({ method: req.method, body: JSON.parse(raw) }); body = { _id: 'fictional-bill' };
      } else throw Error('Unexpected fixture API: ' + req.url);
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body));
    } catch (error) { res.statusCode = 500; res.end(JSON.stringify({ error: error.message })); }
  });
  const sockets = new Set(); server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser, page;
  try {
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
      userDataDir: path.join(task, 'browser-profile'), args: ['--no-sandbox', '--disable-gpu'] });
    page = await browser.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => new URL(request.url()).origin === origin ? request.continue() : request.abort());
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.setViewport({ width: 1440, height: 1000, hasTouch: true });
    const combo = '[role=combobox]';
    async function clickText(text) {
      assert(await page.$$eval('button', (nodes, text) => { const node = nodes.find(n => n.textContent.trim() === text || [...n.querySelectorAll('span')].some(s => s.textContent.trim() === text)); if (!node) return false; node.click(); return true; }, text), 'Missing control: ' + text);
      await wait(70);
    }
    async function load(type = 'annual_return', variant = 'after', params = '') {
      await page.goto(origin + '/' + variant + '/' + params);
      await page.waitForSelector('[role=dialog]'); await wait(100);
      if (!params.includes('edit')) await clickText(type === 'general' ? 'General Bill' : 'Annual Return Bill');
      await page.waitForSelector('button[type=submit]'); await wait(100);
    }
    async function search(text) {
      await page.click(combo); await page.focus(combo); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
      await page.keyboard.type(text); await page.waitForSelector('[role=listbox]');
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    async function selected() { return page.$eval('input[name=clientId]', node => node.value); }
    async function pick(id) { await search(id); await page.click('[role=option]'); await page.waitForFunction(() => !document.querySelector('[role=listbox]')); assert.equal(await selected(), id); }
    async function field(label, value) {
      const input = await page.evaluateHandle(label => {
        const node = [...document.querySelectorAll('label')].find(n => n.textContent.trim() === label);
        return node?.parentElement.querySelector('input,textarea');
      }, label);
      assert(input.asElement(), 'Missing field ' + label); await input.asElement().evaluate(node => { node.scrollIntoView({ block: 'center' }); node.focus(); node.select(); });
      await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace');
      await page.keyboard.type(value); await input.dispose();
    }
    async function fit(label) {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const value = await page.evaluate(() => {
        const list = document.querySelector('[role=listbox]'), popup = list.parentElement.getBoundingClientRect(), input = document.querySelector('[role=combobox]').getBoundingClientRect();
        const vv = visualViewport; return { width: innerWidth, height: innerHeight, viewport: { x: vv.offsetLeft, y: vv.offsetTop, width: vv.width, height: vv.height },
          popup: { x: popup.x, y: popup.y, right: popup.right, bottom: popup.bottom, height: popup.height }, input: { x: input.x, bottom: input.bottom, y: input.y, height: input.height },
          portalOutsideDialog: !list.closest('[role=dialog]'), options: list.querySelectorAll('[role=option]').length };
      });
      geometry.push({ label, ...value }); const { popup, viewport } = value;
      assert(popup.x >= viewport.x + 10 && popup.right <= viewport.x + viewport.width - 10, label + ': horizontal fit');
      assert(popup.y >= viewport.y + 10 && popup.bottom <= viewport.y + viewport.height - 10, label + ': vertical fit ' + JSON.stringify(value));
      assert(value.portalOutsideDialog && value.options <= 15, label + ': bounded body portal');
      return value;
    }

    await load(); await search('fictional duplicate');
    assert.equal(await page.$$eval('[role=option]', nodes => nodes.length), 2);
    assert(await page.$eval(combo, node => node === document.activeElement && node.value === 'fictional duplicate'));
    pass('Visible partial company search; input receives focus; duplicate company records remain separate');
    await search('  FICTIONAL DUPLICATE INDUSTRIES  ');
    assert.equal(await page.$$eval('[role=option]', nodes => nodes.length), 2);
    assert.match(await page.$eval('[role=listbox]', node => node.textContent), /TEST-00000.*Producer.*TEST-00001.*Importer/);
    pass('Complete names, case folding, trimmed whitespace and result identity/category');
    // Exercise the real Chrome clipboard/paste command, not a synthetic input event.
    await browser.defaultBrowserContext().overridePermissions(origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
    await page.evaluate(() => navigator.clipboard.writeText('Fictional Duplicate Industries'));
    await page.focus(combo); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.press('KeyV'); await page.keyboard.up('Control');
    await page.waitForFunction(() => document.querySelector('[role=combobox]').value === 'Fictional Duplicate Industries');
    assert.equal(await page.$$eval('[role=option]', nodes => nodes.length), 2);
    pass('Actual Ctrl+V pastes a whole company name and filters results');
    const requestsBefore = requests.length;
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    assert.equal(await selected(), 'TEST-00001'); assert.equal(saves.length, 0);
    assert.equal(await page.$eval(combo, node => node.value), 'Fictional Duplicate Industries');
    assert(await page.$eval(combo, node => node === document.activeElement));
    pass('Arrow navigation and Enter commit the second duplicate ID, close popup, retain focus and never submit');
    await search('no such fictional company');
    assert.equal(await selected(), 'TEST-00001'); assert.match(await page.$eval('[role=listbox]', node => node.textContent), /No matching clients/);
    await page.keyboard.press('Enter'); assert.equal(await selected(), 'TEST-00001'); assert.equal(saves.length, 0);
    await page.keyboard.press('Escape'); assert(await page.$('[role=dialog]')); assert.equal(await selected(), 'TEST-00001');
    assert.equal(await page.$eval(combo, node => node.value), 'Fictional Duplicate Industries');
    pass('No matches, typing, Enter without a match and Escape preserve committed selection and open bill');
    await search('TEST-00003'); await page.keyboard.press('Tab');
    assert.equal(await selected(), 'TEST-00001'); assert.equal(await page.$('[role=listbox]'), null);
    assert.equal(await page.evaluate(() => document.activeElement.tagName), 'SELECT');
    await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
    assert(await page.$eval(combo, node => node === document.activeElement));
    await search('TEST-00002'); await page.click('[role=dialog] header'); assert.equal(await selected(), 'TEST-00001');
    pass('Tab/Shift+Tab follow existing form order; outside click keeps the selected ID');
    for (const id of ['TEST-00000', 'TEST-00001', 'TEST-00002', 'TEST-00003']) {
      const start = requests.length; await pick(id); await wait(80);
      const calls = requests.slice(start);
      assert(!calls.some(call => call.path === '/api/clients'));
      assert.equal(calls.filter(call => call.path === '/api/financial-year').length, id === 'TEST-00003' ? 0 : 1);
      if (id !== 'TEST-00003') assert(calls.every(call => new URLSearchParams(call.query).get(call.path === '/api/financial-year' ? 'clientId' : 'toClientId') === id));
    }
    assert(requests.length > requestsBefore);
    pass('ID search and mouse selection support all four categories; existing PIBO target fetch/PWP exclusion unchanged; no search fetches');
    await page.focus(combo); await page.keyboard.type('TEST-00004');
    assert.equal(await page.$eval(combo, node => node.value), 'TEST-00004');
    await page.keyboard.press('Enter'); assert.equal(await selected(), 'TEST-00004');
    pass('Typing after a closed selection starts a fresh draft without appending to the company name');
    await page.evaluate(() => navigator.clipboard.writeText('TEST-00005'));
    await page.keyboard.down('Control'); await page.keyboard.press('KeyV'); await page.keyboard.up('Control');
    assert.equal(await page.$eval(combo, node => node.value), 'TEST-00005');
    assert.equal(await selected(), 'TEST-00004');
    await page.keyboard.press('Enter'); assert.equal(await selected(), 'TEST-00005');
    pass('Pasting into a closed selection replaces only the draft until explicit selection');
    await search(''); assert((await fit('desktop-5000')).options <= 15);
    await page.$eval('[role=listbox]', node => { node.scrollTop = node.scrollHeight; }); await wait(70);
    assert.match(await page.$eval('[role=listbox]', node => node.textContent), /TEST-04999/);
    await page.click('[role=option][aria-posinset="5000"]'); assert.equal(await selected(), 'TEST-04999');
    await search(''); await page.keyboard.press('ArrowUp');
    assert.equal(await page.$eval(combo, node => document.getElementById(node.getAttribute('aria-activedescendant')).getAttribute('aria-posinset')), '5000');
    await page.keyboard.press('Enter'); assert.equal(await selected(), 'TEST-04999');
    pass('5,000 matches are fully scrollable with bounded DOM; keyboard wraps and keeps active descendant mounted');
    for (const query of ['Fictional', 'TEST-04999', 'no match']) {
      const start = performance.now(); await search(query); timings.push({ query, browserRoundTripMs: +(performance.now() - start).toFixed(1) });
    }
    const searchRequests = requests.length; await search('totally different query'); assert.equal(requests.length, searchRequests);
    pass('Local indexed filtering makes zero per-keystroke API calls');

    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewport({ width, height: 900, hasTouch: true }); await load(); await page.click(combo); await fit('width-' + width);
      if (width === 390 || width === 1440) { await wait(160); await page.screenshot({ path: path.join(task, 'combobox-light-' + width + '.png') }); }
      await page.evaluate(() => document.documentElement.classList.add('dark')); await wait(200); await fit('dark-' + width);
      if (width === 390) await page.screenshot({ path: path.join(task, 'combobox-dark-390.png') });
    }
    pass('Light/dark desktop, tablet and phone positioning at 320/390/768/1024/1440px');
    await page.setViewport({ width: 390, height: 844, hasTouch: true }); await load(); await search('TEST-00003');
    const option = await page.$('[role=option]'); const bounds = await option.boundingBox();
    await page.touchscreen.tap(bounds.x + 40, bounds.y + 25); assert.equal(await selected(), 'TEST-00003');
    pass('Real touch tap selects and commits the correct Client ID');
    await search('');
    await page.evaluate(() => { Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => 430 }); visualViewport.dispatchEvent(new Event('resize')); });
    await wait(80); await fit('simulated-mobile-keyboard');
    await page.evaluate(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize')); });
    await wait(50);
    const beforeScroll = await page.$eval('[role=listbox]', node => node.parentElement.getBoundingClientRect().y);
    await page.$eval(combo, node => { let p = node.parentElement; while (p && !(/auto|scroll/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight)) p = p.parentElement; p.scrollTop = 30; });
    await wait(80); assert.notEqual(await page.$eval('[role=listbox]', node => node.parentElement.getBoundingClientRect().y), beforeScroll);
    await fit('scrolled-modal');
    await page.$eval(combo, node => { let p = node.parentElement; while (p && !(/auto|scroll/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight)) p = p.parentElement; p.scrollTop = p.scrollHeight; });
    await page.waitForFunction(() => !document.querySelector('[role=listbox]'));
    pass('Popup follows modal scroll, fits simulated software-keyboard viewport and closes when anchor is clipped');
    await page.setViewport({ width: 820, height: 390, hasTouch: true }); await load(); await page.click(combo); await fit('landscape-short');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
    pass('Short landscape popup fits; first Escape closes search, next Escape retains existing modal dismissal');
    await page.setViewport({ width: 1440, height: 1000, hasTouch: true }); await load('general');
    await field('Bill Title / Purpose *', 'Fixture service'); await field('Description *', 'Fixture service'); await field('Rate *', '100');
    await search('Fictional Duplicate Industries');
    const savedBefore = saves.length; await clickText('Save Billing'); await wait(70); assert.equal(saves.length, savedBefore);
    assert.equal(await selected(), ''); assert.equal(await page.$eval(combo, node => node.checkValidity()), false);
    pass('Free text cannot satisfy required Client validation or be saved as an identifier');

    async function amounts(type, variant) {
      await load(type, variant);
      if (variant === 'before') await page.select('select', 'TEST-00002'); else await pick('TEST-00002');
      if (type === 'general') await field('Bill Title / Purpose *', 'Fictional general service');
      else {
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(n => n.textContent.trim() === 'Apply to Target Charges' && !n.disabled));
        await clickText('Apply to Target Charges');
        await field('Govt Charges', '100'); await field('Consultancy Charges', '250'); await field('Other Charges', '75');
        await clickText('Add Item');
      }
      await field('Description *', 'Fictional line item'); await field('Qty *', type === 'general' ? '2.5' : '3'); await field('Rate *', type === 'general' ? '123.45' : '50');
      const total = await page.$eval('aside p.text-3xl', node => node.textContent);
      const previous = saves.length; await clickText('Save Billing'); await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
      assert.equal(saves.length, previous + 1); return { total, ...saves.at(-1) };
    }
    const comparisons = [];
    for (const type of ['annual_return', 'general']) {
      const after = await amounts(type, 'after');
      assert.equal(after.body.clientId, 'TEST-00002'); assert.equal(after.body.financialYear, '2025-26');
      assert.equal(after.body.lineItems[0].gstPercent, 18);
      assert.equal(after.body.lineItems[0].quantity, type === 'general' ? 2.5 : 3);
      assert.equal(after.total, new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(type === 'general' ? 364.1775 : 1782));
      if (type === 'annual_return') { assert.equal(after.body.targetCharges, 1180); assert.equal(after.body.targetBreakdown[0].gstAmount, 180); assert.equal(after.body.targetBreakdown[0].totalAmount, 1180); }
      if (fs.existsSync(baseline)) { const before = await amounts(type, 'before'); assert.deepEqual(after, before); comparisons.push({ type, before, after }); }
    }
    pass('Annual target quantities/rates/GST/application, additional charges and general fractional line totals save identical before/after payloads and displayed totals');
    for (const suffix of ['?edit', '?edit&missing']) {
      await load('general', 'after', suffix); assert(await page.$eval(combo, node => node.disabled));
      assert.equal(await page.$eval(combo, node => node.value), suffix.includes('missing') ? 'TEST-00001' : 'Fictional Duplicate Industries');
      assert.equal(await page.$('[role=listbox]'), null); assert(await page.$eval('select', node => node.disabled));
      await clickText('Update Billing'); await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
      assert.equal(saves.at(-1).method, 'PUT'); assert.equal(saves.at(-1).body.clientId, 'TEST-00001');
    }
    pass('Editing locks Client and FY, displays company or fallback ID, preserves existing update payload');
    const materials = [];
    if (fs.existsSync(baseline)) {
      async function appearance(variant, dark, focused) {
        await load('annual_return', variant);
        await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark); await wait(200);
        const selector = variant === 'before' ? 'select' : combo;
        if (focused) { await page.focus(selector); if (variant === 'after') await page.keyboard.press('Escape'); await wait(180); }
        return page.$eval(selector, input => {
          const style = getComputedStyle(input), panel = input.closest('[role=dialog]');
          const rect = node => { const r = node.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(n => Math.round(n * 100) / 100); };
          return { control: rect(input), style: Object.fromEntries(['height', 'borderRadius', 'backgroundColor', 'color', 'borderColor', 'boxShadow', 'fontFamily', 'fontSize', 'fontWeight', 'letterSpacing'].map(key => [key, style[key]])),
            regions: ['header', 'footer', 'aside'].map(selector => rect(panel.querySelector(selector))), financialYear: rect([...panel.querySelectorAll('select')].at(-1)) };
        });
      }
      for (const dark of [false, true]) for (const focused of [false, true]) {
        const before = await appearance('before', dark, focused), after = await appearance('after', dark, focused);
        assert.deepEqual(after, before); materials.push({ dark, focused, before, after });
      }
      pass('Before/after light/dark input materials, height, corners, typography, focus ring, FY and modal layout match exactly');
    }
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await load(); await page.click(combo); await wait(200); await fit('spring-motion');
    const spring = await page.$eval(combo, input => { const a = input.getBoundingClientRect(), b = document.querySelector('[role=listbox]').parentElement.getBoundingClientRect(); return Math.abs(a.left - b.left) + Math.abs(a.bottom + 7 - b.top); });
    assert(spring < 3, 'Popup follows the existing modal spring motion');
    await page.keyboard.press('Escape'); await clickText('Cancel'); await page.waitForFunction(() => !document.querySelector('[role=listbox]'));
    pass('Popup follows existing spring motion and disappears immediately when its billing modal closes');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(task, 'results.json'), JSON.stringify({ checks, geometry, timings, comparisons, materials, requests, errors }, null, 2));
    console.log(JSON.stringify({ task, checks: checks.length, geometryChecks: geometry.length, requests: requests.length, saves: saves.length, errors }));
  } catch (error) {
    if (page && !page.isClosed()) {
      await page.screenshot({ path: path.join(task, 'failure.png') }).catch(() => {});
      fs.writeFileSync(path.join(task, 'failure-state.json'), JSON.stringify({ errors, html: await page.$eval('body', node => node.innerHTML.slice(0, 60000)) }, null, 2));
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { fs.writeFileSync(path.join(task, 'failure.txt'), error.stack); console.error(error); process.exitCode = 1; });

/* Actual React billing report UI against isolated HTTP fixtures. No live services. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const puppeteer = require('puppeteer-core');
const compiled = require('next/dist/compiled/webpack/webpack');
const createLoader = require('./search-test-loader.cjs');
const { fy, bills, payments, clients } = require('./fixtures/billing-report-data.cjs');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'outputs/billing-report-ui');
const baseline = JSON.stringify({ bills, payments }), assignments = [], writes = [], exported = [];
const load = createLoader();
const { buildBillingReport } = load('lib/billing-report.ts');
const { billingReportWorkbook } = load('lib/server/billing-report-excel.ts');
const opts = input => ({ financialYear: fy, view: 'company', search: '', billType: 'all', category: 'all', paymentStatus: 'all', invoiceState: 'all', dateBasis: 'invoiceDate', dateFrom: '', dateTo: '', includeUndated: false, page: 1, pageSize: 25, ...input });
async function main() {
  fs.mkdirSync(output, { recursive: true }); compiled.init();
  await new Promise((resolve, reject) => {
    const compiler = compiled.webpack({ mode: 'development', devtool: false, context: root, entry: path.join(__dirname, 'fixtures/billing-report.tsx'), output: { path: output, filename: 'fixture.js' }, resolve: { extensions: ['.tsx', '.ts', '.js', '.cjs'], alias: { '@': root } }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, 'fixtures/workflow-editor-loader.cjs') }] } });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  const css = (await require('postcss')([require('tailwindcss')(path.join(root, 'tailwind.config.ts'))]).process(fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8').replace(/^@import .+$/gm, ''), { from: path.join(root, 'app/globals.css') })).css + fs.readFileSync(path.join(root, 'app/dashboard/reports/reports-workspace.css'), 'utf8') + 'body{margin:0;font-family:Arial,sans-serif;background:var(--color-surface);color:var(--color-text)}';
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(path.join(output, 'fixture.js'))); return; }
      if (req.url.startsWith('/api/reports/studio')) {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        if (body.mode === 'billing-category') { assignments.push(body.assignment); writes.push(body.assignment); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ saved: true })); return; }
        const result = buildBillingReport(bills, payments, clients, opts(body.report), assignments, req.url.endsWith('/export'));
        if (req.url.endsWith('/export')) { exported.push(result); res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.end(await billingReportWorkbook(result)); }
        else { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result)); }
        return;
      }
      res.setHeader('Content-Type', 'text/html'); res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`);
    } catch (error) { res.statusCode = 500; res.end(JSON.stringify({ error: error.message })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser, page;
  const clickText = async text => page.evaluate(text => { const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text); if (!button) throw Error(`Button not found: ${text}`); button.click(); }, text);
  const settled = async () => page.waitForFunction(() => document.querySelector('[aria-label="Billing and payments report"]')?.getAttribute('aria-busy') === 'false' && document.body.innerText.includes('totals cover all pages'));
  const choose = async (label, text) => { await page.click(`button[aria-label="${label}"]`); await page.waitForFunction(text => [...document.querySelectorAll('[role="option"]')].some(e => e.textContent.trim() === text), {}, text); await page.evaluate(text => { const item = [...document.querySelectorAll('[role="option"]')].find(e => e.textContent.trim() === text); item.click(); }, text); await settled(); };
  try {
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle0' }); await settled();
    assert((await page.evaluate(() => document.body.innerText)).includes('Beta Consultancy'), 'General-only company is shown');
    await page.evaluate(() => [...document.querySelectorAll('summary')].find(e => e.textContent === 'Alpha Packaging').click());
    await clickText('INV-001' + '111111111111111111111111').catch(async () => { await page.evaluate(() => [...document.querySelectorAll('button')].find(e => e.textContent.startsWith('INV-001')).click()); });
    await page.waitForSelector('[role="dialog"]'); assert((await page.evaluate(() => document.body.innerText)).includes('Bill details'));
    await page.keyboard.press('Escape');
    await page.waitForSelector('[role="dialog"]', { hidden: true });
    await page.waitForFunction(() => !document.querySelector('[data-liquid-modal-active="true"]'));
    await page.screenshot({ path: path.join(output, 'company-desktop.png'), fullPage: true });
    await clickText('Bill-wise'); await settled();
    assert.equal(await page.$$eval('tbody tr', rows => rows.length), 3);
    await page.screenshot({ path: path.join(output, 'bill-desktop.png'), fullPage: true });
    await clickText('Component-wise'); await settled();
    await choose('Billing category', 'EPR Targets');
    assert.equal(await page.$$eval('tbody tr', rows => rows.length), 1);
    assert((await page.$eval('tbody', node => node.innerText)).includes('10,000'));
    await clickText('Export all matching'); await page.waitForFunction(() => !document.body.innerText.includes('Exporting…'));
    assert.equal(exported.at(-1).summary.componentGross, 10000);
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'component-mobile.png'), fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Only table scrolls on mobile');
    await choose('Billing category', 'All categories');
    await page.select('select[aria-label="Category for Target registration annual return consultancy"]', 'registration_migration');
    await settled(); await page.waitForFunction(() => document.querySelector('select[aria-label="Category for Target registration annual return consultancy"]')?.value === 'registration_migration');
    assert.equal(writes.length, 1); assert.equal(JSON.stringify({ bills, payments }), baseline);
    await choose('Billing category', 'Registration / Migration');
    assert.equal(await page.$$eval('tbody tr', rows => rows.length), 1);
    assert((await page.$eval('tbody', node => node.innerText)).includes('3,000'));
    await clickText('Company-wise'); await settled(); assert((await page.$eval('tbody', node => node.innerText)).includes('3,000'));
    await page.screenshot({ path: path.join(output, 'company-filtered-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: actual Company/Bill/Component UI, all-bill drilldown, category filtering/review, matching Excel request, source immutability and 390px responsive layout.');
  } catch (error) { if (page) { await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); fs.writeFileSync(path.join(output, 'failure.txt'), await page.evaluate(() => document.body.innerText)); } throw error; }
  finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

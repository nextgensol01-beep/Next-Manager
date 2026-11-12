/* Actual Reports workspace against local deterministic HTTP fixtures. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const puppeteer = require('puppeteer-core');
const compiled = require('next/dist/compiled/webpack/webpack');
const load = require('./search-test-loader.cjs')();
const { fieldsForSource } = load('lib/report-studio.ts');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'outputs/report-builder-ui');
const saved = [];
let nextSavedId = 1;
const previews = [];
const downloads = [];

async function main() {
  fs.mkdirSync(output, { recursive: true });
  compiled.init();
  await new Promise((resolve, reject) => {
    const compiler = compiled.webpack({
      mode: 'development', devtool: false, context: root,
      entry: path.join(__dirname, 'fixtures/report-builder.tsx'), output: { path: output, filename: 'fixture.js' },
      resolve: { extensions: ['.tsx', '.ts', '.js', '.cjs'], alias: { '@': root } },
      module: { rules: [
        { test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, 'fixtures/workflow-editor-loader.cjs') },
        { test: /\.css$/, type: 'asset/source' },
      ] },
    });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  const globalCSS = path.join(root, 'app/globals.css');
  const css = (await require('postcss')([require('tailwindcss')(path.join(root, 'tailwind.config.ts'))])
    .process(fs.readFileSync(globalCSS, 'utf8').replace(/^@import .+$/gm, ''), { from: globalCSS })).css
    + fs.readFileSync(path.join(root, 'app/client-profile-premium.css'), 'utf8')
    + fs.readFileSync(path.join(root, 'app/dashboard/reports/reports-workspace.css'), 'utf8');
  const server = http.createServer(async (req, res) => {
    const json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
    try {
      if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(path.join(output, 'fixture.js'))); return; }
      if (req.url === '/api/reports/studio/manual') return json({ fields: [], canEdit: true });
      if (req.url === '/api/reports/studio/saved' && req.method === 'GET') return json({ reports: saved });
      const savedId = req.url.match(/^\/api\/reports\/studio\/saved\/([^/]+)$/)?.[1];
      const savedIndex = savedId ? saved.findIndex(report => report.id === savedId) : -1;
      if (savedId && savedIndex === -1) { res.statusCode = 404; return json({ error: 'Saved report missing' }); }
      if (savedId && req.method === 'DELETE') { saved.splice(savedIndex, 1); return json({ deleted: true }); }
      if (req.url.startsWith('/api/reports/studio') && ['POST', 'PATCH'].includes(req.method)) {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        if (savedId && req.method === 'PATCH') {
          saved[savedIndex] = { id: savedId, ...body };
          return json({ report: saved[savedIndex] });
        }
        if (req.url.endsWith('/saved')) {
          const report = { id: `saved-${nextSavedId++}`, ...body }; saved.push(report); return json({ report });
        }
        if (req.url.endsWith('/export')) {
          downloads.push(body); res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.end('fixture'); return;
        }
        previews.push(body);
        const fields = fieldsForSource(body.source);
        const columns = body.columns.map(id => fields.find(field => field.id === id));
        return json({ config: body, columns, generatedAt: new Date().toISOString(), rows: [
          { id: 'A', clientIds: ['A'], values: { 'client.companyName': 'Alpha Packaging', 'client.category': 'Producer', 'client.state': 'Gujarat', 'financialYear.year': body.financialYear,
            'bill.type': 'General', 'bill.reference': 'G-001', 'charge.classification': 'EPR Targets', 'charge.gross': 4000 } },
        ], pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 }, quality: { messages: [] },
        summary: { matchedClients: 1, metrics: [], columnResults: [], businessResults: [], businessResultOptions: [], automaticBusinessResultIds: [], relatedBusinessResultIds: [] } });
      }
      if (req.url.startsWith('/api/auth/')) return json({});
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>window.process = { env: {} }</script><script src="/fixture.js"></script></body></html>`);
    } catch (error) { res.statusCode = 500; json({ error: error.message }); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser, page;
  const waitStep = name => page.waitForFunction(label => document.querySelector('[aria-current="step"]')?.getAttribute('aria-label')?.endsWith(label) && !document.querySelector('.workflow-nav-dock')?.matches('[aria-busy="true"]'), {}, name);
  const move = async (name) => { await page.click(`[aria-label="Go to ${name}"]`); await waitStep(name); };
  const clickText = async label => page.evaluate(text => {
    const element = [...document.querySelectorAll('button, summary, [role="option"]')].find(el => el.textContent.trim() === text && el.getClientRects().length);
    if (!element) throw Error(`Visible control missing: ${text}`);
    element.click();
  }, label);
  const selectOption = async (label, option) => {
    const trigger = `button[aria-haspopup="listbox"][aria-label="${label}"]`;
    const options = `[role="listbox"][aria-label="${label}"] [role="option"]`;
    await page.waitForSelector(trigger, { visible: true });
    await page.click(trigger);
    await page.waitForSelector(options, { visible: true });
    await page.$$eval(options, (buttons, text) => {
      const button = buttons.find(entry => entry.textContent.trim() === text);
      if (!button) throw Error(`Select option missing: ${text}`);
      button.click();
    }, option);
    await page.waitForFunction((selector, text) => {
      const button = document.querySelector(selector);
      return button?.getAttribute('aria-expanded') === 'false' && button.textContent.trim() === text;
    }, {}, trigger, option);
  };
  try {
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    page = await browser.newPage();
    const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    await page.setViewport({ width: 1440, height: 960 });
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle0' });
    await waitStep('Dataset selection');
    const selected = '.fluid-step[aria-current="step"]';
    await page.waitForSelector(`${selected} .fluid-step-liquid`);
    const material = `${selected} .fluid-step-material`;
    assert.equal(await page.$eval(material, node => getComputedStyle(node).backgroundColor), 'rgba(244, 247, 251, 0.91)');
    assert.equal(await page.$eval('.fluid-step-connector', node => getComputedStyle(node).transitionDuration), '0.24s');
    assert(await page.$eval('[aria-label="Step 2: Display structure"]', node => node.disabled));
    const box = await (await page.$(selected)).boundingBox();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
    await page.waitForSelector(`${selected} .fluid-step-fluid-wrap.is-active`);
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.6, { steps: 5 });
    await page.waitForFunction(selector => {
      const material = document.querySelector(selector);
      const canvas = material?.querySelector('canvas');
      if (!material || !canvas || getComputedStyle(material).transform === 'none') return false;
      return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((value, i) => i % 4 === 3 && value > 0);
    }, {}, material);
    await page.mouse.move(10, 10);
    await page.waitForSelector(`${selected} .fluid-step-fluid-wrap.is-settling:not(.is-active)`);
    await page.waitForSelector(`${selected} .fluid-step-fluid-wrap:not(.is-settling)`);
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    assert.equal(await page.$eval(material, node => getComputedStyle(node).backgroundColor), 'rgb(244, 246, 250)');
    await move('Display structure');
    assert.equal(await page.$eval(`${selected} .fluid-step-liquid`, node => getComputedStyle(node).animationName), 'fluid-step-liquid-bloom');
    await page.waitForFunction(() => {
      const connector = document.querySelector('.fluid-step-connector.is-complete');
      return connector && getComputedStyle(connector).backgroundColor === 'rgba(255, 255, 255, 0.23)';
    });
    await page.hover('[aria-label="Step 1: Dataset selection"]');
    await page.waitForSelector('[aria-label="Step 1: Dataset selection"].is-expanded .fluid-step-title');
    await page.mouse.move(10, 10);
    await page.waitForSelector('[aria-label="Step 1: Dataset selection"]:not(.is-expanded)');

    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.reload({ waitUntil: 'networkidle0' });
    await waitStep('Dataset selection');
    assert.equal(await page.$(`${selected} .fluid-step-liquid`), null);
    assert.equal(await page.$$eval('.report-builder-stage > .report-builder-categories > button', buttons => buttons.length), 6);
    await page.click('.report-builder-header-actions button:first-child');
    await page.waitForSelector('[role="dialog"] .report-library-entry', { visible: true });
    await page.keyboard.press('Escape');
    await page.waitForSelector('[role="dialog"]', { hidden: true });
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Start from a template');
    await clickText('Start from a template');
    await page.waitForSelector('[role="dialog"] .report-library-entry', { visible: true });
    await page.click('[role="dialog"] .report-library-entry');
    await waitStep('Display structure');
    await page.waitForSelector('[role="dialog"]', { hidden: true });
    await move('Dataset selection');
    await page.click('.report-builder-stage > .report-builder-categories > button:first-child');
    await page.click('.report-builder-stage > .report-builder-categories > button:last-child');
    await move('Display structure');
    assert.equal(previews.length, 0);
    await move('Fields & conditions');
    const searchField = 'input[placeholder="Search fields, sections or descriptions"]';
    const selectedCount = await page.$$eval('.report-field-picker .report-inspector-column-row', rows => rows.length);
    await page.type(searchField, 'Client Added Date');
    const fieldOption = '.report-field-picker [role="checkbox"][aria-label="Client Added Date"]';
    assert.equal(await page.$$eval('.report-field-picker .report-inspector-column-row', rows => rows.length), selectedCount);
    assert.equal(await page.$eval(fieldOption, button => button.getAttribute('aria-checked')), 'false');
    await page.click(fieldOption);
    assert.equal(await page.$eval(fieldOption, button => button.getAttribute('aria-checked')), 'true');
    await page.click('.report-field-picker button[aria-label="Clear search"]');
    await selectOption('Client category', 'Producer');
    await move('Display structure'); await move('Fields & conditions');
    assert.match(await page.$eval('button[aria-label="Client category"]', node => node.textContent), /Producer/);
    await page.screenshot({ path: path.join(output, 'studio-fields-desktop.png'), fullPage: true });
    await move('Preview');
    await page.waitForFunction(() => document.querySelector('#report-results tbody')?.textContent.includes('Alpha Packaging'));
    assert.equal(previews.at(-1).filters.children[0].value, 'Producer');
    assert(previews.at(-1).columns.includes('client.registrationDate'));
    assert(await page.$('#report-results thead'));
    await page.focus('button[aria-label="Sort by Company Name descending"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('button[aria-label="Sort by Company Name, clear sorting"]');
    assert.equal(previews.at(-1).sort[0].direction, 'desc');
    await move('Save & export');
    await page.screenshot({ path: path.join(output, 'studio-export-desktop.png'), fullPage: true });
    const saveInput = await page.$('input[placeholder="Name this report configuration"]');
    assert(saveInput);
    await saveInput.type('Advanced producer report');
    await clickText('Save report');
    await page.waitForFunction(() => document.body.innerText.includes('Advanced producer report'));
    assert.equal(saved[0].config.filters.children[0].value, 'Producer');
    assert.equal(saved[0].config.sort[0].direction, 'desc');
    await clickText('Export Excel');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.querySelector('strong')?.textContent === 'Export all matching rows').click());
    await page.waitForFunction(() => !document.body.innerText.includes('Exporting…'));
    assert.deepEqual(downloads[0].filters, saved[0].config.filters);
    await page.click('[aria-label="Step 1: Dataset selection"]'); await waitStep('Dataset selection');
    await clickText('Saved reports');
    await page.waitForSelector('[role="dialog"] .report-library-entry', { visible: true });
    assert.match(await page.$eval('[role="dialog"] .report-library-entry', button => button.textContent), /Advanced producer report/);
    await page.click('[role="dialog"] .report-library-entry');
    await waitStep('Display structure');
    await page.waitForSelector('[role="dialog"]', { hidden: true });
    await page.setViewport({ width: 390, height: 844 });
    await move('Fields & conditions');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Fields fit mobile width');
    await page.screenshot({ path: path.join(output, 'studio-fields-mobile.png'), fullPage: true });
    await page.click('.report-field-picker button[aria-label="Close field library"]');
    assert(await page.$('.report-field-picker button[aria-label="Remove Client Added Date"]'));
    await move('Preview');
    await page.waitForSelector('#report-results tbody');
    assert.equal(previews.at(-1).sort[0].direction, 'desc');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'The page fits mobile width');
    await page.screenshot({ path: path.join(output, 'studio-preview-mobile.png'), fullPage: true });
    await move('Save & export');
    await clickText('Export Excel');
    await page.waitForSelector('.report-builder-export .reports-quick-export-menu', { visible: true });
    assert(await page.$eval('.report-builder-export .reports-quick-export-menu', menu => {
      const bounds = menu.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= innerWidth;
    }), 'Excel options fit mobile width');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.report-builder-export .reports-quick-export-menu', { hidden: true });
    const nameField = 'input[placeholder="Name this report configuration"]';
    await page.focus(nameField);
    await page.$eval(nameField, input => input.select());
    await page.type(nameField, 'Updated producer report');
    page.once('dialog', dialog => dialog.accept());
    await clickText('Update saved report');
    await page.waitForFunction(() => document.querySelector('.report-save-form p')?.textContent.includes('Updated producer report'));
    assert.equal(saved[0].name, 'Updated producer report');
    await clickText('Save as a copy');
    await page.waitForFunction(() => document.querySelector('.report-save-form p')?.textContent.includes('Updated producer report (Copy)'));
    await clickText('Saved reports');
    await page.waitForSelector('[role="dialog"] .report-library-entry', { visible: true });
    page.once('dialog', dialog => dialog.accept());
    await page.click('[aria-label="Delete Updated producer report (Copy)"]');
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"] .report-library-entry').length === 1);
    assert.deepEqual(saved.map(report => report.name), ['Updated producer report']);
    await page.keyboard.press('Escape');
    await page.waitForSelector('[role="dialog"]', { hidden: true });

    await page.setViewport({ width: 1440, height: 960 });
    await page.reload({ waitUntil: 'networkidle0' });
    await waitStep('Dataset selection');
    await page.click('.report-builder-stage > .report-builder-categories > button:nth-child(3)');
    assert.match(await page.$eval('.report-dataset-cards button[aria-pressed="true"]', node => node.textContent), /Billing/);
    await page.screenshot({ path: path.join(output, 'studio-desktop-light.png'), fullPage: true });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'studio-mobile-dark.png'), fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Dataset selection fits mobile width');
    await page.setViewport({ width: 320, height: 720 });
    assert(await page.evaluate(() => {
      const categories = document.querySelector('.report-builder-categories');
      categories.scrollLeft = categories.scrollWidth;
      return categories.scrollLeft > 0 && document.documentElement.scrollWidth <= innerWidth;
    }), 'Categories scroll inside the workspace at narrow widths');
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await page.setViewport({ width: 1440, height: 960 });
    await move('Display structure');
    await selectOption('Reporting layout', 'Charge-wise');
    await clickText('Bill and charge scope');
    for (const [label, option] of [['Bill type', 'General'], ['Charge classification', 'EPR Targets']]) {
      await selectOption(label, option);
    }
    await move('Fields & conditions');
    await clickText('Edit billing scope');
    await waitStep('Display structure');
    assert.match(await page.$eval('[aria-label="Reporting layout"]', node => node.textContent), /Charge-wise/);
    assert.match(await page.$eval('button[aria-label="Charge classification"]', node => node.textContent), /EPR Targets/);
    await move('Fields & conditions');
    await move('Preview');
    await page.waitForFunction(() => document.querySelector('#report-results tbody')?.textContent.includes('G-001'));
    const billing = previews.at(-1);
    assert.equal(billing.source, 'billing-charges');
    assert.deepEqual(billing.billingScope.filters.children.map(({ field, value }) => [field, value]), [['bill.type', 'General'], ['charge.classification', 'EPR Targets']]);
    assert(!billing.columns.includes('bill.paid'));
    await move('Save & export');
    await clickText('Export Excel');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.querySelector('strong')?.textContent === 'Export all matching rows').click());
    await page.waitForFunction(() => !document.body.innerText.includes('Exporting…'));
    assert.deepEqual(downloads.at(-1).billingScope, billing.billingScope);
    await page.click('[aria-label="Step 2: Display structure"]');
    await waitStep('Display structure');
    await clickText('Grouping levels');
    for (const [level, label] of [[1, 'Company Name'], [2, 'Bill type'], [3, 'Charge classification']]) {
      await selectOption(`Grouping level ${level}`, label);
    }
    await move('Fields & conditions');
    await move('Preview');
    await page.waitForFunction(() => document.querySelector('#report-results')?.getAttribute('aria-busy') === 'false');
    assert.deepEqual(previews.at(-1).groupBy, ['client.companyName', 'bill.type', 'charge.classification']);
    assert.deepEqual(errors, []);
    console.log('PASS: dataset tabs and rows, stepper motion, templates, saved reports, field search and selection, mobile, billing scope, grouping, preview and Excel.');
  } catch (error) {
    if (page) {
      await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
      fs.writeFileSync(path.join(output, 'failure.txt'), await page.evaluate(() => document.body.innerText));
    }
    throw error;
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

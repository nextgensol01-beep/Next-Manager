/* Configure's real page, shared editor, and design CSS; all API writes are isolated. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http'), Module = require('node:module'), ts = require('typescript');
const puppeteer = require('puppeteer-core'), compiledWebpack = require('next/dist/compiled/webpack/webpack');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'tmp/tracker-configure-tests');
const loaded = new Map();
function load(relative) {
  const filename = path.join(root, relative); if (loaded.has(filename)) return loaded.get(filename).exports;
  const module = new Module(filename); module.filename = filename; module.paths = Module._nodeModulePaths(path.dirname(filename)); loaded.set(filename, module);
  const original = module.require.bind(module); module.require = name => name.startsWith('@/') ? load(`${name.slice(2)}.ts`) : original(name);
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename); return module.exports;
}
const config = load('lib/tracker-configuration.ts'), create = load('lib/tracker-create.ts'), trackerLib = load('lib/clientTrackers.ts');
const trackerId = '0123456789abcdef01234567';
const clients = Array.from({ length: process.env.TRACKER_CONFIGURE_STRESS_ONLY ? 3005 : 505 }, (_, index) => ({ clientId: `C${index}`, companyName: index === 504 ? 'Needle Works' : `Company ${index}`, category: ['PWP', 'Producer', 'Importer', 'Brand Owner', 'SIMP'][index % 5], state: 'Delhi', gstNumber: `GST-${index}`, legalName: `Legal ${index}`, address: `Address ${index}` }));
const fields = [structuredClone(trackerLib.DEFAULT_STATUS_FIELD),
  { key: 'mail', label: 'Mail to be sent', type: 'toggle' }, { key: 'note', label: 'Internal note', type: 'text' },
  { key: 'purchaseUpload', label: 'Purchase uploaded', type: 'text', dataLink: { source: 'purchaseUploads', display: 'uploadStatus' } },
  { key: 'covered', label: 'Covered', type: 'number' }, { key: 'required', label: 'Required', type: 'number' },
  { key: 'coverage', label: 'Invoice coverage', type: 'number', computed: { kind: 'percentage', primaryFieldKey: 'covered', secondaryFieldKey: 'required' } },
  { key: 'combined', label: 'Combined status', type: 'select', options: ['Ready', 'Pending'], computed: { kind: 'combinedStatus', conditionGroup: { mode: 'ALL', conditions: [{ fieldKey: 'mail', operator: 'equals', value: 'Yes' }] }, matchedLabel: 'Ready', fallbackLabel: 'Pending' } },
  { key: 'priority', label: 'Priority', type: 'select', options: ['First', 'Second', 'Third'] },
  { key: 'labels', label: 'Labels', type: 'multiSelect', options: ['First', 'Second', 'Third'], optionColors: { First: 'amber', Second: 'blue', Third: 'violet' } },
  { key: 'tags', label: 'Tags', type: 'tags', options: ['First', 'Second', 'Third'], optionColors: { First: 'amber', Second: 'emerald', Third: 'rose' } },
];
let tracker = { _id: trackerId, name: 'Monthly client worklist', description: 'Existing tracker', status: 'active', financialYear: '2025-26', fields: structuredClone(fields), clientColumns: ['state'], clientIds: clients.slice(0, 210).map(client => client.clientId) };
const entries = clients.map(client => ({ _id: client.clientId, clientId: client.clientId, client, updatedAt: '2026-10-08T00:00:00Z', values: { status: 'Done', mail: true, note: `Saved ${client.clientId}`, purchaseUpload: 'Partial', covered: 4, required: 12, coverage: 33.33, combined: 'Ready', priority: 'Second', labels: ['Second', 'Third'], tags: ['Second', 'Third'] } }));
const requests = [], writes = [];
const syncPreviews = new Map(), syncExclusions = new Set(['C300']);
let failWrite = false;
const json = value => JSON.parse(JSON.stringify(value));
function compatibility() {
  const baseline = config.configurationSnapshot(tracker), draft = { ...baseline, fields: baseline.fields.map(create.draftField), clientIds: [...baseline.clientIds].reverse() };
  assert.deepEqual(config.configurationChanges(baseline, draft), [], 'UI identity and client selection order cannot create fake changes');
  draft.fields[1] = { ...draft.fields[1], label: 'Renamed mail', optionInput: '' };
  assert.equal(config.configurationChanges(baseline, draft).length, 1); assert.equal(draft.fields[1].key, 'mail');
  draft.fields[1].label = baseline.fields[1].label; assert.equal(config.configurationChanges(baseline, draft).length, 0, 'Reverting clears dirty state');
  [draft.fields[1], draft.fields[2]] = [draft.fields[2], draft.fields[1]];
  assert.deepEqual(config.configurationChanges(baseline, draft).map(item => item.kind), ['reordered']);
  assert(!('uiId' in config.configurationFields(draft.fields)[0])); assert(!('optionInput' in config.configurationFields(draft.fields)[0]));
  assert.equal(config.configurationNeedsFinancialYear([{ dataLink: { source: 'uploadedData' } }]), true, 'Legacy upload links retain API FY rules');
  assert.equal(config.canPreviewSavedValue(fields[3], fields[3], true), false);
  assert.equal(config.canPreviewSavedValue(fields[1], { ...fields[1], label: 'Rename' }, false), true);
  assert.equal(config.canPreviewSavedValue(fields[1], { ...fields[1], type: 'text' }, false), false);
  assert.deepEqual(baseline.fields, config.configurationFields(fields), 'Draft mutations must not alter the baseline');
  const opening = fields.map(create.draftField), identityBaseline = config.configurationSnapshot({ ...tracker, fields: opening });
  const duplicate = create.draftField({ key: 'covered', label: 'Covered', type: 'number' });
  assert.equal(config.configurationFieldState(duplicate, identityBaseline), 'New');
  assert.equal(config.configurationPreviousField(duplicate, identityBaseline), undefined);
  const additions = config.configurationChanges(identityBaseline, { ...identityBaseline, fields: [...opening, duplicate, create.draftField()] });
  assert.equal(new Set(additions.map(item => item.id)).size, additions.length);
  assert.equal(config.configurationChanges(identityBaseline, { ...identityBaseline, fields: [...opening] }).length, 0);
  console.log('PASS: reliable structural diff, reverting, reorder, stable persisted keys, clean payload, legacy FY and honest value-preview rules');
}
async function main() {
  compatibility(); fs.mkdirSync(output, { recursive: true }); compiledWebpack.init();
  await new Promise((resolve, reject) => {
    const compiler = compiledWebpack.webpack({ mode: 'development', devtool: false, context: root, entry: path.join(__dirname, 'fixtures/tracker-search.tsx'), output: { path: output, filename: 'fixture.js' },
      resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@': root, 'next/link': path.join(__dirname, 'fixtures/tracker-next-link.cjs'), 'next-auth/react': path.join(__dirname, 'fixtures/tracker-session.cjs') } },
      module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, 'fixtures/workflow-editor-loader.cjs') }] } });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  const built = await require('postcss')([require('tailwindcss')(path.join(root, 'tailwind.config.ts'))]).process(fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8').replace(/^@import .+$/gm, ''), { from: path.join(root, 'app/globals.css') });
  const css = built.css + ['components/ui/liquid-glass/liquid-glass.css', 'app/client-profile-premium.css', 'app/tracker-create.css', 'app/tracker-configure.css'].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n') + 'body{font-family:Inter,Arial,sans-serif;margin:0;background:var(--color-surface);color:var(--color-text)}';
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname.endsWith('.js') && fs.existsSync(path.join(output, path.basename(url.pathname)))) { response.setHeader('Content-Type', 'application/javascript'); response.end(fs.readFileSync(path.join(output, path.basename(url.pathname)))); }
    else if (url.pathname === '/fixture.css') { response.setHeader('Content-Type', 'text/css'); response.end(css); }
    else if (url.pathname.startsWith('/api/')) {
      requests.push(url); response.setHeader('Content-Type', 'application/json');
      if (request.method === 'POST' && url.pathname.endsWith('/sync')) {
        let body = ''; request.on('data', chunk => body += chunk); request.on('end', () => {
          const draft = JSON.parse(body);
          const missing = clients.filter(client => !tracker.clientIds.includes(client.clientId) && !syncExclusions.has(client.clientId) &&
            (draft.clientScope === 'all' || draft.clientScope === 'categories' && draft.clientCategories.includes(client.category)));
          const token = 'preview-' + syncPreviews.size; syncPreviews.set(token, missing.map(client => client.clientId));
          response.end(JSON.stringify({ existingCount: tracker.clientIds.length, missingCount: missing.length, projectedCount: tracker.clientIds.length + missing.length, clients: missing.slice(0,250), truncated: missing.length > 250, token }));
        });
      } else if (request.method === 'PATCH') {
        let body = ''; request.on('data', chunk => body += chunk); request.on('end', () => {
          const change = JSON.parse(body);
          if (url.pathname.includes('/entries/')) {
            const entry = entries.find(entry => entry._id === url.pathname.split('/').at(-1));
            entry.values[change.key] = change.value; response.end(JSON.stringify(entry)); return;
          }
          writes.push(change); const failed = failWrite; failWrite = false;
          setTimeout(() => {
            if (failed) { response.statusCode = 500; response.end(JSON.stringify({ error: 'Fixture save failed. Your draft is kept.' })); }
            else {
              const before = new Set(tracker.fields.map(field => field.key)), after = new Set(change.fields.map(field => field.key));
              for (const entry of entries) {
                for (const key of before) if (!after.has(key)) delete entry.values[key];
                Object.assign(entry.values, trackerLib.initialTrackerValues(change.fields.filter(field => !before.has(field.key))));
              }
              tracker = { ...tracker, ...change };
              if (change.syncRequested) {
                const additions = (syncPreviews.get(change.syncPreviewToken) || []).filter(id => !tracker.clientIds.includes(id));
                tracker.clientIds = [...new Set([...tracker.clientIds, ...additions])];
                tracker.syncAddedCount = additions.length;
              }
              response.end(JSON.stringify(tracker));
            }
          }, 450);
        });
      } else if (url.pathname === '/api/clients') setTimeout(() => response.end(JSON.stringify(clients)), 120);
      else if (url.pathname === `/api/client-trackers/${trackerId}`) {
        if (url.searchParams.has('overviewOnly')) response.end(JSON.stringify({ overviewCounts: [] }));
        else response.end(JSON.stringify({ ...tracker, entries: entries.filter(entry => tracker.clientIds.includes(entry.clientId)).slice(0, 100), offset: 0, hasMore: true, nextOffset: 100, entryCount: tracker.clientIds.length, totalEntryCount: tracker.clientIds.length }));
      } else response.end(JSON.stringify(url.pathname === '/api/documents' ? [] : { events: [] }));
    } else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser, page;
  try {
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',  headless: true, args: ['--no-sandbox', '--disable-gpu', '--no-first-run'] });
    page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 1000 }); await page.goto(`http://127.0.0.1:${server.address().port}`);
    const settle = () => page.evaluate(() => new Promise(resolve => setTimeout(resolve, 430)));
    const click = async selector => { await page.$eval(selector, node => node.scrollIntoView({ block: 'center' })); await settle(); await page.click(selector); await settle(); };
    const write = async (selector, value) => { await click(selector); await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control'); if (value) await page.keyboard.type(value); else await page.keyboard.press('Backspace'); await settle(); };
    const text = selector => page.$eval(selector, node => node.textContent);
    const choose = async (label, value) => { await click(`.create-column-editor-wrap:not([inert]) button[aria-label="${label}"], .configure-fy button[aria-label="${label}"]`); await page.waitForSelector(`[role="listbox"][aria-label="${label}"]`);
      await page.$$eval(`[role="listbox"][aria-label="${label}"] [role="option"]`, (nodes, value) => { const match = nodes.find(node => node.textContent.trim() === value); if (!match) throw Error(`Missing ${value}`); match.click(); }, value); await settle(); };
    const open = async () => { await page.evaluate(() => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === 'Configure').click()); await page.waitForSelector('.configure-workspace'); await settle(); };
    const expand = key => click(`.configure-workspace [data-field-key="${key}"] .create-column-expand`);
    await page.waitForSelector('tbody');
    assert.equal(await page.$eval('tbody select[aria-label="Priority"]', node => node.dataset.optionColor), 'blue', 'Legacy table uses the same default color as the editor');
    assert.equal(await page.$eval('tbody [role="group"][aria-label="Labels"] label:has(input[aria-label="Third"])', node => node.dataset.optionColor), 'violet');
    await open();
    if (process.env.TRACKER_CONFIGURE_SYNC_ONLY === '1') {
      const radio = async (label, choice) => {
        await page.$$eval(`[role="radiogroup"][aria-label="${label}"] [role="radio"]`, (nodes, choice) => nodes.find(node => node.textContent.startsWith(choice)).click(), choice); await settle();
      };
      const syncButton = async label => {
        await page.$$eval('.configure-workspace button', (nodes, label) => nodes.find(node => node.textContent.trim() === label).click(), label); await settle();
      };
      assert.equal(await page.$$eval('[aria-label="Client synchronization"]', nodes => nodes.length), 0, 'Legacy manually selected tracker stays manual');
      await radio('Eligible client audience', 'By category');
      for (const category of ['PWP', 'Importer']) await page.$$eval('[aria-label="Eligible categories"] button', (nodes, category) => nodes.find(node => node.textContent === category).click(), category);
      await settle();
      await syncButton('Preview sync'); await page.waitForSelector('[aria-label="Client sync preview"]');
      assert((await text('[aria-label="Client sync preview"]')).includes('New matching clients: 117'));
      assert((await text('[aria-label="Client sync preview"]')).includes('PWP'));
      assert((await text('[aria-label="Client sync preview"]')).includes('Importer'));
      assert.equal(writes.length, 0, 'Preview has no membership writes');
      await page.screenshot({ path: path.join(output, 'sync-preview-light.png') });
      await page.evaluate(() => document.documentElement.classList.add('dark')); await settle();
      await page.screenshot({ path: path.join(output, 'sync-preview-dark.png') });
      await page.$eval('[aria-label="Client sync preview"] button', node => node.click()); await settle();
      assert.equal(writes.length, 0, 'Cancelling preview cannot change membership');
      await syncButton('Preview sync'); await syncButton('Add eligible clients');
      assert((await text('.configure-workspace')).includes('117 clients ready to add'));
      assert.equal(writes.length, 0, 'Confirmed additions wait for the existing Save changes action');
      const savedValues = structuredClone(entries.slice(0,210).map(entry => entry.values));
      await click('.configure-footer .tracker-modal-primary'); await page.waitForSelector('.configure-workspace', { hidden: true }); await settle();
      assert.equal(tracker.clientIds.length, 327); assert(!tracker.clientIds.includes('C300'));
      assert.deepEqual(entries.slice(0,210).map(entry => entry.values), savedValues);
      await open(); await radio('Client synchronization', 'Auto Sync');
      const writesBefore = writes.length;
      await click('.configure-footer .tracker-modal-primary');
      assert((await text('.create-server-error')).includes('Preview sync')); assert.equal(writes.length, writesBefore);
      await syncButton('Preview sync'); await syncButton('Enable and sync');
      await click('.configure-footer .tracker-modal-primary'); await page.waitForSelector('.configure-workspace', { hidden: true }); await settle();
      assert.equal(tracker.clientMembershipMode, 'categorySync');
      assert(!requests.some(url => /email.*deliver|messages\/send|drafts/.test(url.pathname)));
      await open(); assert((await text('.configure-workspace')).includes('Auto Sync enabled'));
      await page.setViewport({ width: 390, height: 844 }); await settle();
      await page.screenshot({ path: path.join(output, 'sync-controls-mobile.png') });
      assert.deepEqual(errors, []);
      console.log('PASS: actual Configure Manual/Auto controls, PWP/Importer preview and counts, cancel, staged-save confirmation, missing-review guard, preserved marks/exclusions, no email requests, light/dark/mobile.');
      return;
    }
    assert.equal((await text('.configure-unsaved')).trim(), 'No unsaved changes'); assert(await page.$eval('.configure-footer .tracker-modal-primary', node => node.disabled));
    assert.equal(await page.$$eval('.configure-changes li', nodes => nodes.length), 0);
    assert((await text('.configure-preview-stats')).includes('210 clients'));
    assert((await text('.configure-impact-scroll')).includes('Saved C0'));
    assert.equal(await page.$$eval('.configure-client-picker .create-client-row', nodes => nodes.length), 100, 'Bounded client list');
    const dimensions = () => page.evaluate(() => ({ workspace: document.querySelector('.configure-workspace').getBoundingClientRect().width, build: document.querySelector('.configure-build').getBoundingClientRect().width, inner: document.querySelector('.configure-preview-inner').getBoundingClientRect().width, scroll: document.querySelector('.configure-scroll').scrollTop, railScroll: document.querySelector('.configure-impact-scroll').scrollTop }));
    const start = await dimensions(); assert(start.build / start.workspace > .63 && start.build / start.workspace < .67);
    await page.screenshot({ path: path.join(output, 'configure-desktop-light.png') });
    await page.evaluate(() => document.documentElement.classList.add('dark')); await settle(); await page.screenshot({ path: path.join(output, 'configure-desktop-dark.png') });
    await expand('priority');
    assert.equal(await page.$eval('.create-column-editor-wrap:not([inert]) .create-option-row:nth-child(2) .create-option-dot', node => node.dataset.color), 'blue');
    await click('.create-column-editor-wrap:not([inert]) .create-option-row:nth-child(2) .create-option-color-trigger');
    await click('.create-color-palette [role="radio"][aria-label="rose"]');
    const priorityId = await page.$eval('[data-field-key="priority"]', node => node.dataset.columnId);
    assert.equal(await page.$eval(`[data-preview-value="${priorityId}"] [data-option-color]`, node => node.dataset.optionColor), 'rose', 'Draft color changes immediately update the saved-value preview');
    await click('.create-column-editor-wrap:not([inert]) .create-option-row:nth-child(2) .create-option-color-trigger');
    await click('.create-color-palette [role="radio"][aria-label="blue"]');
    assert.equal((await text('.configure-unsaved')).trim(), 'No unsaved changes', 'Reverting a legacy color clears dirty state');
    console.log('PASS: unchanged saved configuration, default 65/35 rail, honest loaded marks, bounded clients, light and dark surfaces');

    await expand('purchaseUpload');
    await page.$$eval('.create-column-editor-wrap:not([inert]) [role="radio"]', nodes => nodes.find(node => node.textContent.trim() === 'Manual').click()); await settle();
    assert.equal(await page.$$('.create-fy-reason').then(nodes => nodes.length), 0, 'FY guidance disappears when no CPCB columns remain');
    await page.$$eval('.create-column-editor-wrap:not([inert]) [role="radio"]', nodes => nodes.find(node => node.textContent.trim() === 'Live').click()); await settle();
    await choose('Live source', 'CPCB purchase uploads');
    assert.equal(await page.$$('.create-fy-reason').then(nodes => nodes.length), 1);
    assert.equal((await text('.configure-unsaved')).trim(), 'No unsaved changes');
    await click('[aria-label="Include Status column"]');
    await page.waitForFunction(() => document.body.textContent.includes('Remove “Status”?'));
    await page.evaluate(() => [...document.querySelectorAll('button')].filter(node => node.textContent.trim() === 'Cancel').at(-1).click()); await settle();
    assert.equal(await page.$eval('[aria-label="Include Status column"]', node => node.getAttribute('aria-checked')), 'true');
    assert.equal(await page.$eval('[aria-label="Include Status column"] .glass-toggle-thumb', node => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41), 24, 'Cancelled removal keeps the thumb consistent with the saved state');
    await click('[aria-label="Include Status column"]');
    await page.waitForFunction(() => document.body.textContent.includes('Remove “Status”?'));
    await page.evaluate(() => [...document.querySelectorAll('button')].filter(node => node.textContent.trim() === 'Remove column').at(-1).click()); await settle();
    assert.equal(await page.$eval('[aria-label="Include Status column"]', node => node.getAttribute('aria-checked')), 'false');
    await click('[aria-label="Include Status column"]');
    assert.equal((await text('.configure-unsaved')).trim(), 'No unsaved changes', 'Restoring Status restores baseline identity and position');
    console.log('PASS: dynamic CPCB financial-year guidance and reversible system Status removal');

    await expand('note'); const fieldId = await page.$eval('[data-field-key="note"]', node => node.dataset.columnId);
    await write('.create-column-editor-wrap:not([inert]) input[aria-label="Column name"]', 'Internal notes');
    assert.equal(await page.$eval('[data-field-key="note"]', node => node.dataset.columnId), fieldId);
    assert.equal(await text('[data-field-key="note"] .configure-field-state'), 'Modified');
    assert((await text('.configure-changes')).includes('Internal notes'));
    await write('.create-column-editor-wrap:not([inert]) input[aria-label="Column name"]', 'Internal note');
    assert.equal((await text('.configure-unsaved')).trim(), 'No unsaved changes');
    console.log('PASS: saved rename retains stable identity and key; reverting clears modifications');

    await page.$eval('.configure-scroll', node => { node.scrollTop = 430; }); await settle();
    await page.$eval('.create-column-editor-wrap:not([inert]) input[aria-label="Column name"]', node => node.focus({ preventScroll: true }));
    const beforeBlur = await dimensions(); await page.$eval('.create-column-editor-wrap:not([inert]) input[aria-label="Column name"]', node => node.blur()); await settle();
    assert.equal((await dimensions()).scroll, beforeBlur.scroll, 'Blurring a text input does not reset the form scroll');
    const beforeCollapse = await dimensions();
    await page.$eval('[aria-label="Collapse impact preview"]', node => node.click());
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 140)));
    const mid = await dimensions(); assert(mid.build > beforeCollapse.build && mid.build < start.workspace - 100, 'Builder expands continuously with the rail'); assert(Math.abs(mid.inner - beforeCollapse.inner) < .1, 'Preview text stays fixed width while clipping');
    await settle(); const collapsed = await dimensions(); assert(collapsed.build / collapsed.workspace > .88); assert(Math.abs(collapsed.scroll - beforeCollapse.scroll) < 3, 'Collapsing preserves editor scroll');
    await page.screenshot({ path: path.join(output, 'configure-collapsed-dark.png') });
    for (let index = 0; index < 12; index++) { await page.evaluate(() => { const closed = document.querySelector('.configure-workspace').dataset.previewOpen === 'false'; document.querySelector(closed ? '.configure-reopen' : '[aria-label="Collapse impact preview"]').click(); }); await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 60))); }
    await page.$eval('.configure-reopen', node => node.click()); await settle();
    assert.equal(await page.$$eval('.configure-preview-inner', nodes => nodes.length), 1); assert.equal(await page.$eval('[data-field-key="note"]', node => node.dataset.columnId), fieldId);
    console.log('PASS: connected collapse/reopen, fixed preview text width, preserved scroll and state, rapid toggles without duplicate rails');

    await click('.create-chips[aria-label="Visible client details"] button:nth-child(3)');
    assert(await page.$('[data-preview-column="detail-gstNumber"]')); assert((await text('.configure-changes')).includes('GST number'));
    await write('input[aria-label="Search tracker clients"]', 'C209'); assert.equal(await page.$$eval('.configure-client-picker .create-client-row', nodes => nodes.length), clients.filter(client => client.clientId.includes('C209')).length);
    await click('.configure-client-picker input[type="checkbox"]'); assert((await text('.configure-removal-note')).includes('saved marks are kept'));
    await write('input[aria-label="Search tracker clients"]', 'Needle'); await click('.configure-client-picker input[type="checkbox"]');
    assert((await text('.configure-changes')).includes('1 client added')); assert((await text('.configure-changes')).includes('1 client removed'));
    console.log('PASS: detail chips update columns; searching all clients can add or remove off-page participants without losing other selections');

    await expand('coverage'); await choose('Calculation', 'Upload difference');
    assert((await text('[data-field-key="coverage"]')).includes('Upload difference'));
    await choose('Calculation', 'Progress'); assert((await text('[data-field-key="coverage"]')).includes('Progress'));
    await choose('Calculation', 'Combined status'); await choose('Condition matching', 'ANY condition');
    await write('input[aria-label="Matched label"]', 'Ready now');
    await page.screenshot({ path: path.join(output, 'configure-computed-dark.png') });
    await choose('Calculation', 'Coverage percentage'); await choose('Covered', 'Covered'); await choose('Required', 'Required');
    await expand('combined'); assert((await text('.create-column-editor-wrap:not([inert])')).includes('Matched label'));
    console.log('PASS: all four existing computed modes, condition matching, result labels and source references stay available');

    await click('.create-add-column'); await write('.create-column-editor-wrap:not([inert]) input[aria-label="Column name"]', 'Covered');
    assert.equal(await text('.create-column-row:last-child .configure-field-state'), 'New', 'New row cannot become persisted by matching a saved key');
    await write('.create-column-editor-wrap:not([inert]) input[aria-label="Column name"]', 'Follow-up date');
    assert(await page.$('[data-field-key="followUpDate"]'), 'Renaming a new row continues generating its own key');
    await choose('Field type', 'Date'); assert.equal(await text('.create-column-row:last-child .configure-field-state'), 'New');
    await click('.create-column-editor-wrap:not([inert]) .create-remove-column'); assert(!(await text('.configure-workspace')).includes('Follow-up date'));
    await expand('note'); await click('.create-column-editor-wrap:not([inert]) .create-remove-column');
    await page.waitForFunction(() => document.body.textContent.includes('Remove “Internal note”?'));
    assert(await page.$('[data-field-key="note"]'), 'Saved field stays until confirmed');
    await page.evaluate(() => [...document.querySelectorAll('button')].filter(node => node.textContent.trim() === 'Remove column').at(-1).click()); await settle();
    assert(!await page.$('[data-field-key="note"]')); assert((await text('.configure-changes')).includes('Internal note'));
    await expand('mail'); await click('.create-column-editor-wrap:not([inert]) button[aria-label="Move Mail to be sent down"]');
    assert((await text('.configure-changes')).includes('Tracker columns reordered'));
    await expand('mail');
    await page.$eval('[data-field-key="covered"]', node => node.scrollIntoView({ block: 'center' })); await settle();
    const drag = await page.$eval('[data-field-key="covered"] .create-column-drag', node => { const box = node.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; });
    const target = await page.$eval('[data-field-key="required"]', node => { const box = node.getBoundingClientRect(); return box.y + box.height / 2 + 15; });
    await page.mouse.move(drag.x, drag.y); await page.mouse.down(); await page.mouse.move(drag.x, target, { steps: 18 }); await settle(); await page.mouse.up(); await settle();
    const order = await page.$$eval('.create-column-row', nodes => nodes.map(node => node.dataset.fieldKey));
    assert(order.indexOf('covered') > order.indexOf('required'), 'Pointer drag changes real field order');
    await expand('covered'); await write('.create-column-editor-wrap:not([inert]) input[aria-label="Column name"]', 'Collected');
    await expand('priority');
    await click('.create-column-editor-wrap:not([inert]) .create-option-row:nth-child(2) .create-option-color-trigger');
    await click('.create-color-palette [role="radio"][aria-label="violet"]');
    await expand('labels');
    await click('.create-column-editor-wrap:not([inert]) .create-option-row:nth-child(3) .create-option-color-trigger');
    await click('.create-color-palette [role="radio"][aria-label="emerald"]');
    console.log('PASS: new rows keep their identity, saved removal requires confirmation, pointer and keyboard reorder keep values attached');

    failWrite = true; await click('.configure-footer .tracker-modal-primary');
    await page.waitForFunction(() => document.body.textContent.includes('Apply tracker removals?'));
    await page.evaluate(() => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === 'Remove data').click());
    await page.waitForSelector('.configure-workspace [role="alert"]');
    assert((await text('.configure-workspace [role="alert"]')).includes('draft is kept'));
    assert(await page.$('.configure-workspace')); assert((await text('.configure-unsaved')).includes('unsaved')); assert(!await page.$('[data-field-key="note"]'));
    await click('.configure-footer .tracker-modal-primary'); await page.waitForFunction(() => document.body.textContent.includes('Apply tracker removals?'));
    await page.evaluate(() => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === 'Remove data').click());
    await page.waitForFunction(() => !document.querySelector('.configure-workspace'));
    assert.equal(writes.length, 2); const payload = writes.at(-1);
    assert.equal(payload.fields.find(field => field.key === 'mail').label, 'Mail to be sent');
    assert.equal(payload.fields.find(field => field.key === 'covered').label, 'Collected', 'Persisted rename saves the original key');
    assert(payload.clientIds.includes('C504')); assert(!payload.clientIds.includes('C209')); assert.equal(payload.clientIds.length, 210);
    assert(payload.fields.every(field => !('uiId' in field) && !('optionInput' in field)));
    assert.equal(entries[0].values.mail, true); assert.equal(entries[0].values.covered, 4); assert.equal(entries[0].values.required, 12);
    assert.equal(payload.fields.find(field => field.key === 'priority').optionColors.Second, 'violet');
    assert.equal(payload.fields.find(field => field.key === 'labels').optionColors.Third, 'emerald');
    assert.equal(entries[0].values.priority, 'Second'); assert.deepEqual(entries[0].values.labels, ['Second', 'Third']);
    await page.waitForFunction(() => document.querySelector('tbody select[aria-label="Priority"]')?.dataset.optionColor === 'violet');
    assert.equal(await page.$eval('tbody [role="group"][aria-label="Labels"] label:has(input[aria-label="Third"])', node => node.dataset.optionColor), 'emerald');
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark); await settle();
      assert(await page.$eval('tbody select[aria-label="Priority"]', node => getComputedStyle(node).backgroundColor !== 'rgba(0, 0, 0, 0)'), 'Shared palette classes must be generated in each theme');
      await page.screenshot({ path: path.join(output, `option-colors-table-${dark ? 'dark' : 'light'}.png`) });
    }
    await click('tbody tr:first-child [role="group"][aria-label="Labels"] input[aria-label="First"]');
    await page.waitForFunction(() => !document.querySelector('tbody tr:first-child [role="group"][aria-label="Labels"] input')?.disabled);
    assert.deepEqual(entries[0].values.labels, ['Second', 'Third', 'First'], 'Colored multi-select preserves existing selections when adding a value');
    await click('tbody tr:first-child [role="group"][aria-label="Labels"] input[aria-label="First"]');
    await page.waitForFunction(() => !document.querySelector('tbody tr:first-child [role="group"][aria-label="Labels"] input')?.disabled);
    assert.deepEqual(entries[0].values.labels, ['Second', 'Third']);
    await open(); await expand('priority');
    assert.equal(await page.$eval('.create-column-editor-wrap:not([inert]) .create-option-row:nth-child(2) .create-option-dot', node => node.dataset.color), 'violet', 'Reopening Configure retains saved table color');
    assert.equal((await text('.configure-unsaved')).trim(), 'No unsaved changes');
    const previewTone = await page.$eval(`[data-preview-value="${await page.$eval('[data-field-key="priority"]', node => node.dataset.columnId)}"] [data-option-color]`, node => ({ background: getComputedStyle(node).backgroundColor, foreground: getComputedStyle(node).color }));
    assert.deepEqual(await page.$eval('tbody select[aria-label="Priority"]', node => ({ background: getComputedStyle(node).backgroundColor, foreground: getComputedStyle(node).color })), previewTone, 'Preview and saved table must have identical theme colors');
    await page.$eval('[aria-label="Close Configure tracker"]', node => node.click()); await page.waitForFunction(() => !document.querySelector('.configure-workspace'));
    console.log('PASS: shared editor, preview and table colors in both themes, save/reopen persistence and multi-select edits without lost values');
    console.log('PASS: failed save retains draft and impact; retry emits compatible payload once, closes and preserves unaffected values');

    await open(); await expand('mail'); await write('.create-column-editor-wrap:not([inert]) input[aria-label="Column name"]', 'Rename to discard');
    await page.$eval('[aria-label="Close Configure tracker"]', node => node.click()); await page.waitForFunction(() => document.body.textContent.includes('Discard unsaved changes?'));
    await page.evaluate(() => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === 'Discard changes').click()); await page.waitForFunction(() => !document.querySelector('.configure-workspace'));
    await open(); assert((await text('[data-field-key="mail"]')).includes('Mail to be sent')); assert.equal((await text('.configure-unsaved')).trim(), 'No unsaved changes');
    console.log('PASS: discard protection uses real dirty state and reopening restores saved configuration');

    await page.setViewport({ width: 390, height: 844 }); await settle();
    assert.equal(await page.$eval('.configure-workspace', node => node.dataset.previewOpen), 'false');
    await click('.configure-mobile-preview'); assert(await page.$eval('.configure-build', node => node.inert));
    await page.screenshot({ path: path.join(output, 'configure-mobile-dark.png') });
    await page.keyboard.press('Escape'); await settle(); assert.equal(await page.$eval('.configure-build', node => node.inert), false); assert(await page.$('.configure-workspace'));
    assert(await page.$eval('.configure-mobile-preview', node => document.activeElement === node), 'Mobile close restores focus');
    await page.setViewport({ width: 1440, height: 1000 }); await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); await settle();
    await click('.configure-reopen'); assert.equal(await page.$eval('.configure-workspace', node => node.dataset.previewOpen), 'true');
    console.log('PASS: narrow preview sheet, Escape and focus return, reduced motion; no wizard');
    assert.equal(requests.filter(url => url.pathname === '/api/clients').length, 1, 'Directory read does not repeat during edits');
    assert.deepEqual(errors, [], `Unhandled errors: ${errors.join(', ')}`);
  } catch (error) {
    if (page) { console.error('Page tail:', (await page.$eval('body', node => node.textContent)).slice(-2400)); await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); }
    throw error;
  } finally {
    if (browser) { const process = browser.process(), timer = setTimeout(() => process?.kill(), 15000); await browser.close().catch(() => process?.kill()); clearTimeout(timer); }
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

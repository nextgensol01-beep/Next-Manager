const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const webpack = require('next/dist/compiled/webpack/webpack'), puppeteer = require('puppeteer-core');
const root = path.resolve(__dirname, '..'), output = path.join(root, '.artifacts/scenario-interactions/ui-' + Date.now());
async function main() {
  const loadModule = require('./search-test-loader.cjs')();
  const { createTrackerEmailContext } = loadModule('lib/tracker-email-context.ts');
  const { analyzeScenarioClient, summarizeScenarioAnalysis } = loadModule('lib/tracker-scenario-analysis.ts');
  let previewCalls = 0, previewDelay = 0;
  fs.mkdirSync(output, { recursive: true }); webpack.init();
  await new Promise((resolve, reject) => {
    const compiler = webpack.webpack({ mode: 'development', devtool: false, context: root, entry: path.join(__dirname, 'fixtures/scenario-interactions.tsx'), output: { path: output, filename: 'fixture.js' }, resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@': root } }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, 'fixtures/workflow-editor-loader.cjs') }] } });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  const css = (await require('postcss')([require('tailwindcss')(path.join(root, 'tailwind.config.ts'))]).process(fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8').replace(/^@import .+$/gm, ''), { from: path.join(root, 'app/globals.css') })).css + ['app/client-profile-premium.css', 'components/ui/liquid-glass/liquid-glass.css'].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n') + 'body{font:14px Arial;background:var(--color-surface);color:var(--color-text)}.fixture-controls{padding:16px}.fixture-floating-header{height:calc(154px - 48px * var(--workflow-header-progress,0));padding-top:12px!important}.fixture-floating-header h3{font-size:20px;margin-bottom:12px}.fixture-floating-header nav{font-size:12px;line-height:24px}.fixture-floating-header p{margin-top:10px;font-size:12px}';
  const server = http.createServer(async (req, res) => {
    if (req.url.endsWith('/email/scenario-preview')) {
      previewCalls++; let raw = ''; for await (const part of req) raw += part;
      const { workflow, entryId } = JSON.parse(raw), count = 222;
      const rows = Array.from({ length: count }, (_, i) => ({ entryId: (i + 1).toString(16).padStart(24, '0'), i })).filter(row => !entryId || row.entryId === entryId).map(({ entryId, i }) => analyzeScenarioClient(workflow, createTrackerEmailContext({ entry: { _id: entryId, clientId: 'CLIENT' + i }, client: { clientId: 'CLIENT' + i, companyName: 'Company ' + i, category: ['Producer', 'Importer', 'Brand Owner', 'PWP'][i % 4] }, fields: [{ key: 'ready', label: 'Ready', type: 'toggle' }], values: { ready: true }, financialYear: '2025-26', trackerName: 'Fixture', workflowName: workflow.name }), Boolean(entryId)));
      const result = summarizeScenarioAnalysis(workflow, rows, entryId ? rows.length : count, 2000);
      if (previewDelay) await new Promise(resolve => setTimeout(resolve, previewDelay));
      res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(result));
    }
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'application/javascript; charset=utf-8'); return res.end(fs.readFileSync(path.join(output, 'fixture.js'))); }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser;
  try {
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, userDataDir: path.join(output, 'profile'), args: ['--no-sandbox'] });
    const page = await browser.newPage(), errors = []; page.on('pageerror', error => { errors.push(error.message); console.error(error.stack); }); page.setDefaultTimeout(15000);
    await page.setViewport({ width: 1280, height: 1000 }); const base = 'http://127.0.0.1:' + server.address().port;
    const state = () => page.evaluate(() => window.scenarioFixture.workflow);
    const clickText = async (selector, text) => { for (const node of await page.$$(selector)) if ((await node.evaluate(node => node.textContent.trim())) === text) { await require('./fixtures/wait-for-stable-control.cjs')(node); await node.click(); return; } throw Error('Missing ' + text); };
    const load = async (count, inactive = 0) => { await page.evaluate((count, inactive) => window.scenarioFixture.load(count, inactive), count, inactive); await page.waitForFunction(count => window.scenarioFixture.workflow.contentRules.length === count, {}, count); };
    const reveal = async id => page.evaluate(id => { const node = document.querySelector(`[data-rule-id="${id}"] .workflow-message-expander`), port = document.querySelector('.tracker-email-content-scroll'); port.scrollTop += node.getBoundingClientRect().top - port.getBoundingClientRect().top - parseFloat(getComputedStyle(port).scrollPaddingTop) - 12; }, id);
    const requestRemove = async id => {
      await page.waitForFunction(id => { const node = document.querySelector(`[data-rule-id="${id}"] .workflow-message-remove`); return node && !node.closest('[inert]') && node.getBoundingClientRect().height > 0; }, {}, id);
      await reveal(id); const button = await page.$(`[data-rule-id="${id}"] .workflow-message-remove`); await require('./fixtures/wait-for-stable-control.cjs')(button); await button.click();
      await page.waitForSelector('.workflow-message-delete-popover:popover-open');
    };
    const confirm = async () => clickText('.workflow-message-delete-popover:popover-open button', 'Remove scenario');
    const waitVisible = async id => page.waitForFunction(id => { const node = document.querySelector(`[data-rule-id="${id}"] .workflow-message-expander`), port = document.querySelector('.tracker-email-content-scroll'); if (!node || !port) return false; const r = node.getBoundingClientRect(), p = port.getBoundingClientRect(), style = getComputedStyle(port); return r.top >= p.top + parseFloat(style.scrollPaddingTop) - 2 && r.bottom <= p.bottom - parseFloat(style.scrollPaddingBottom) + 2 && document.activeElement === node; }, {}, id);
    await page.goto(base); await page.waitForSelector('.workflow-message-surface');
    const original = await state();
    await page.evaluate(() => window.scenarioFixture.loadEmpty()); await page.waitForSelector('.workflow-message-empty'); await page.click('.workflow-message-add');
    await page.waitForFunction(() => window.scenarioFixture.workflow.contentRules.length === 1); let latest = (await state()).contentRules.at(-1).id; await waitVisible(latest);
    assert(await page.$eval(`[data-rule-id="${latest}"] .workflow-message-expander`, node => node.getAttribute('aria-expanded') === 'true'));
    for (let i = 0; i < 2; i++) { await page.evaluate(() => document.querySelector('.workflow-message-add').click()); await page.waitForFunction(count => window.scenarioFixture.workflow.contentRules.length === count, {}, i + 2); latest = (await state()).contentRules.at(-1).id; await waitVisible(latest); }
    assert((await page.$eval('[aria-atomic="true"]', node => node.textContent)).includes('Scenario 3 added'));
    await load(12);
    await page.evaluate(() => { const editor = document.querySelector('[data-rule-id="loaded-0"] .tracker-rich-text'); window.originalScenarioEditor = editor; editor.editor.commands.setTextSelection(3); window.originalScenarioSelection = editor.editor.state.selection.from; });
    const pageScroll = await page.evaluate(() => scrollY); await page.evaluate(() => { const port = document.querySelector('.tracker-email-content-scroll'); port.scrollTop = port.scrollHeight; document.querySelector('.workflow-message-add').click(); });
    await page.waitForFunction(() => window.scenarioFixture.workflow.contentRules.length === 13); latest = (await state()).contentRules.at(-1).id; await waitVisible(latest); assert.equal(await page.evaluate(() => scrollY), pageScroll);
    assert.deepEqual((await state()).contentRules.slice(0, 12).map(rule => rule.content), Array.from({ length: 12 }, (_, i) => `<p><strong>loaded-${i}</strong> has formatted <em>message content</em>.</p>`));
    assert(await page.evaluate(() => window.originalScenarioEditor === document.querySelector('[data-rule-id="loaded-0"] .tracker-rich-text') && window.originalScenarioEditor.editor.state.selection.from === window.originalScenarioSelection), 'Existing rich-text instance and document selection survive Add');
    await page.screenshot({ path: path.join(output, 'added-light-desktop.png') });
    await page.evaluate(() => window.scenarioFixture.burst()); await page.waitForFunction(() => window.scenarioFixture.workflow.contentRules.length === 16); assert.equal(new Set((await state()).contentRules.map(r => r.id)).size, 16);
    await requestRemove('loaded-5'); await confirm(); await page.waitForFunction(() => !window.scenarioFixture.workflow.contentRules.some(r => r.id === 'loaded-5')); await waitVisible('loaded-6');
    assert(await page.$eval('.tracker-email-content-scroll', node => node.scrollTop > 0), 'Deleting deep in a long list does not jump to Add at the top'); assert.equal(await page.evaluate(() => scrollY), pageScroll);
    await page.click('.workflow-message-undo'); await page.waitForFunction(() => window.scenarioFixture.workflow.contentRules.length === 16);
    await load(3); await requestRemove('loaded-1');
    const popupHeight = await page.$eval('.tracker-email-content-scroll', node => node.scrollHeight);
    assert((await page.$eval('.workflow-message-delete-popover', node => node.textContent)).includes('Remove Scenario 2?'));
    assert.equal(await page.$eval('.workflow-message-delete-popover button', node => document.activeElement === node), true);
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('.workflow-message-delete-popover:popover-open')); assert.equal((await state()).contentRules.length, 3);
    await requestRemove('loaded-1'); assert.equal(await page.$eval('.tracker-email-content-scroll', node => node.scrollHeight), popupHeight, 'Anchored confirmation causes no list reflow');
    await page.screenshot({ path: path.join(output, 'confirm-light-desktop.png') }); await clickText('.workflow-message-delete-popover button', 'Keep scenario'); assert.equal((await state()).contentRules.length, 3);
    await requestRemove('loaded-1'); const snapshot = structuredClone((await state()).contentRules.find(r => r.id === 'loaded-1')); await confirm();
    await page.waitForFunction(() => !window.scenarioFixture.workflow.contentRules.some(r => r.id === 'loaded-1')); await page.waitForFunction(() => document.activeElement?.closest('[data-rule-id]')?.dataset.ruleId === 'loaded-2');
    assert((await page.$eval('.workflow-message-feedback', node => node.textContent)).includes('removed from draft'));
    await page.click('.workflow-message-undo'); await page.waitForFunction(() => window.scenarioFixture.workflow.contentRules.length === 3); await waitVisible('loaded-1'); assert.deepEqual((await state()).contentRules.find(r => r.id === 'loaded-1'), snapshot);
    for (const id of ['loaded-0', 'loaded-2']) { await requestRemove(id); await confirm(); await page.waitForFunction(id => !window.scenarioFixture.workflow.contentRules.some(r => r.id === id), {}, id); await page.click('.workflow-message-undo'); await page.waitForFunction(id => window.scenarioFixture.workflow.contentRules.some(r => r.id === id), {}, id); }
    await requestRemove('loaded-1'); await page.evaluate(() => window.scenarioFixture.edit('loaded-1', '<p>Changed while confirming</p>')); await page.waitForFunction(() => !document.querySelector('.workflow-message-delete-popover:popover-open')); assert.equal((await state()).contentRules.length, 3);
    await load(1); await requestRemove('loaded-0'); await confirm(); await page.waitForSelector('.workflow-message-empty'); assert.equal((await state()).contentRules.length, 0);
    await clickText('.tracker-email-footer button', 'Save Email Updates'); await page.waitForFunction(() => window.scenarioFixture.status === 'saved'); await clickText('.fixture-controls button', 'Reopen workflow'); await page.waitForSelector('.workflow-message-empty'); assert.equal((await state()).contentRules.length, 0); assert.equal(await page.$('.workflow-message-undo'), null);
    await page.click('.workflow-message-add'); await page.waitForFunction(() => window.scenarioFixture.workflow.contentRules.length === 1); latest = (await state()).contentRules[0].id; await waitVisible(latest); await requestRemove(latest); await confirm(); await page.waitForSelector('.workflow-message-empty'); await page.click('.workflow-message-undo'); await page.waitForFunction(() => window.scenarioFixture.workflow.contentRules.length === 1); assert.equal((await state()).contentRules[0].content, '');
    await clickText('.tracker-email-footer button', 'Discard fixture draft'); await clickText('.fixture-controls button', 'Reopen workflow'); await page.waitForSelector('.workflow-message-empty'); assert.equal((await state()).contentRules.length, 0);
    await load(39, 10); await page.evaluate(() => { const add = document.querySelector('.workflow-message-add'); add.click(); add.click(); }); await page.waitForFunction(() => window.scenarioFixture.workflow.contentRules.length === 40);
    assert(await page.$eval('.workflow-message-add', node => node.disabled)); assert((await page.$eval('.workflow-message-limit', node => node.textContent)).includes('40-message'));
    await page.setViewport({ width: 390, height: 844 }); await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); await page.evaluate(() => document.documentElement.classList.add('dark')); await load(3);
    await page.evaluate(() => document.querySelector('.workflow-message-add').click()); await page.waitForFunction(() => window.scenarioFixture.workflow.contentRules.length === 4); latest = (await state()).contentRules.at(-1).id; await waitVisible(latest); await requestRemove(latest); await page.screenshot({ path: path.join(output, 'confirm-dark-mobile.png') }); await confirm(); await page.waitForFunction(() => window.scenarioFixture.workflow.contentRules.length === 3);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No mobile overflow'); assert.deepEqual(errors, []);
    await page.setViewport({ width: 1280, height: 1000 }); await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]); await page.evaluate(() => document.documentElement.classList.remove('dark')); await load(3);
    await page.evaluate(() => { const input = document.querySelector('[data-rule-id="loaded-0"] .tracker-rich-text'); window.originalScenarioEditor = input; input.editor.commands.setTextSelection(3); });
    await page.click('input[aria-label="Scenario 1 name"]'); await page.type('input[aria-label="Scenario 1 name"]', 'Brand Owner Migration');
    assert.equal((await state()).contentRules[0].name, 'Brand Owner Migration');
    await page.evaluate(() => document.querySelector('[aria-label="Move scenario 1 down"]').click()); await waitVisible('loaded-0');
    assert.equal((await state()).contentRules.find(rule => rule.id === 'loaded-0').order, 1);
    assert(await page.evaluate(() => window.originalScenarioEditor === document.querySelector('[data-rule-id="loaded-0"] .tracker-rich-text') && window.originalScenarioEditor.editor.state.selection.from === 3));
    await clickText('.tracker-email-footer button', 'Save Email Updates'); await page.waitForFunction(() => !window.scenarioFixture.open); await clickText('.fixture-controls button', 'Reopen workflow'); await page.waitForSelector('.workflow-message-surface');
    assert.equal((await state()).contentRules.find(rule => rule.id === 'loaded-0').name, 'Brand Owner Migration');
    await page.evaluate(() => [...document.querySelectorAll('.workflow-message-preview')].find(node => node.textContent === 'Test against tracker clients').click());
    await page.waitForFunction(() => window.scenarioFixture.analysis?.result.evaluated === 222); assert.equal(await page.$$eval('.workflow-client-test-list > button', nodes => nodes.length), 25);
    await clickText('.workflow-client-test-pagination button', 'Next clients'); assert((await page.$eval('.workflow-client-test-pagination', node => node.textContent)).includes('26–50 of 222'));
    await page.click('.workflow-client-test-list > button'); await page.waitForSelector('.workflow-client-test-detail iframe'); assert((await page.$eval('.workflow-client-test-detail', node => node.textContent)).includes('highest priority'));
    await page.screenshot({ path: path.join(output, 'tracker-clients-light-desktop.png') });
    await page.setViewport({ width: 390, height: 844 }); await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.screenshot({ path: path.join(output, 'tracker-clients-dark-mobile.png') }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewport({ width: 1280, height: 1000 }); await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]); await page.evaluate(() => document.documentElement.classList.remove('dark'));
    const callsBeforeEdit = previewCalls;
    await page.evaluate(() => window.scenarioFixture.edit('loaded-0', '<p>Unsaved changed {{client.companyName}}</p>'));
    await page.waitForFunction(() => document.querySelector('.workflow-client-test').textContent.includes('Outdated analysis'));
    assert.equal(previewCalls, callsBeforeEdit, 'Typing does not refetch clients');
    await clickText('.workflow-client-test-modal footer button', 'Retest current draft'); await page.waitForFunction(() => window.scenarioFixture.analysis?.fingerprint === JSON.stringify([window.scenarioFixture.workflow, [{ key: 'ready', label: 'Ready', type: 'toggle' }]]));
    previewDelay = 300; const incoming = page.waitForRequest(req => req.url().endsWith('/email/scenario-preview'));
    await clickText('.workflow-client-test-modal footer button', 'Retest current draft'); await incoming; await page.evaluate(() => window.scenarioFixture.edit('loaded-0', '<p>Even newer unsaved content</p>')); await page.waitForNetworkIdle();
    assert((await page.$eval('.workflow-client-test', node => node.textContent)).includes('Outdated analysis'), 'An obsolete response cannot replace a newer draft'); previewDelay = 0;
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !window.scenarioFixture.previewOpen && !document.querySelector('.workflow-client-test-modal')); assert.equal((await state()).contentRules.find(rule => rule.id === 'loaded-0').content, '<p>Even newer unsaved content</p>');
    await load(3); await page.evaluate(() => document.querySelector('.workflow-message-add').click()); await page.waitForFunction(() => window.scenarioFixture.workflow.contentRules.length === 4); latest = (await state()).contentRules.at(-1).id; await waitVisible(latest);
    assert.equal((await state()).contentRules.at(-1).conditionGroup.conditions[0].fieldKey, '');
    await page.evaluate(id => window.scenarioFixture.target(id, 0), latest); await page.waitForFunction(id => document.activeElement?.closest('[data-rule-id]')?.dataset.ruleId === id && document.activeElement?.closest('[data-condition-index]')?.dataset.conditionIndex === '0', {}, latest);
    assert((await page.$eval(`[data-rule-id="${latest}"]`, node => node.textContent)).includes('Incomplete'));
    // Rapid condition additions operate on the latest group and retain both rows.
    await page.evaluate(id => { const add = document.querySelector(`[data-rule-id="${id}"] .workflow-rule-add-wrap button`); add.click(); add.click(); }, latest);
    await page.waitForFunction(id => window.scenarioFixture.workflow.contentRules.find(rule => rule.id === id).conditionGroup.conditions.length === 3, {}, latest);
    await page.setViewport({ width: 390, height: 844 }); await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.screenshot({ path: path.join(output, 'advanced-scenario-dark-mobile.png') }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passed: true, originalScenarioCount: original.contentRules.length, checks: 'Add/delete/Undo, focus/modal scroll, rich-text selection, rapid operations, naming/reorder/save/reopen, 222 real-client fixture results and pagination/detail, unsaved draft and stale response protection, invalid scenario focus, field-first and rapid conditions, dark/mobile/reduced motion', pageScrollUnchanged: true }, null, 2));
    console.log('PASS: scenario draft interaction checks; captures at ' + output);
  } finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

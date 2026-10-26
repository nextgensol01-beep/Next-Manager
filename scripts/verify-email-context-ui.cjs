const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const webpack = require('next/dist/compiled/webpack/webpack'), puppeteer = require('puppeteer-core');
const root = path.resolve(__dirname, '..'), output = path.join(root, '.artifacts/email-context/ui-' + Date.now());
async function main() {
  fs.mkdirSync(output, { recursive: true }); webpack.init();
  await new Promise((resolve, reject) => {
    const compiler = webpack.webpack({ mode: 'development', devtool: false, context: root, entry: path.join(__dirname, 'fixtures/email-context.tsx'), output: { path: output, filename: 'fixture.js' }, resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@': root } }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, 'fixtures/workflow-editor-loader.cjs') }] } });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  const css = (await require('postcss')([require('tailwindcss')(path.join(root, 'tailwind.config.ts'))]).process(fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8').replace(/^@import .+$/gm, ''), { from: path.join(root, 'app/globals.css') })).css + fs.readFileSync(path.join(root, 'app/client-profile-premium.css'), 'utf8') + fs.readFileSync(path.join(root, 'components/ui/liquid-glass/liquid-glass.css'), 'utf8') + 'body{font:14px Arial;background:var(--color-surface);color:var(--color-text)}main.tracker-modal{position:relative;margin:24px auto;width:min(920px,100%);padding:20px;box-sizing:border-box}.fixture-tools{padding:12px}.fixture-tools button{margin:4px;padding:8px}output{display:block;margin:16px;white-space:pre-wrap}';
  const server = http.createServer((req, res) => {
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'application/javascript; charset=utf-8'); return res.end(fs.readFileSync(path.join(output, 'fixture.js'))); }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser;
  try {
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, userDataDir: path.join(output, 'profile'), args: ['--no-sandbox'] });
    const page = await browser.newPage(), errors = []; page.on('pageerror', error => { errors.push(error.message); console.error(error.stack); }); await page.setViewport({ width: 1240, height: 1000 });
    await page.goto('http://127.0.0.1:' + server.address().port); await page.waitForSelector('.workflow-message-surface');
    const clickText = async (selector, text) => { for (const node of await page.$$(selector)) if ((await node.evaluate(node => node.textContent.trim())) === text) { await require('./fixtures/wait-for-stable-control.cjs')(node); await node.click(); return; } throw Error('Missing ' + text); };
    const select = async (label, value) => { await page.click(`[aria-label="${label}"]`); await page.waitForSelector('[role="listbox"]'); await clickText('[role="listbox"] [role="option"]', value); await page.waitForFunction(() => !document.querySelector('[role="listbox"]')); };
    assert.equal(await page.evaluate(() => window.emailContextFixture.workflow.combinationMatchingMode), undefined);
    await select('Scenario 1 Condition 1 field', 'Client Category');
    assert.equal(await page.evaluate(() => window.emailContextFixture.workflow.contentRules[0].conditionGroup.conditions[0].value), '');
    assert.equal(await page.$eval('[aria-label="Scenario 1 Condition 1 operator"]', node => node.textContent.trim()), 'is');
    await select('Scenario 1 Condition 1 value', 'Brand Owner');
    const before = await page.evaluate(() => window.emailContextFixture.workflow.contentRules[0].content);
    await select('Scenario 1 Condition 1 operator', 'is any of'); await select('Scenario 1 Condition 1 values', 'Producer'); await select('Scenario 1 Condition 1 values', 'Importer');
    assert.deepEqual(await page.evaluate(() => window.emailContextFixture.workflow.contentRules[0].conditionGroup.conditions[0].value), ['Producer', 'Importer']);
    assert.equal(await page.evaluate(() => window.emailContextFixture.workflow.contentRules[0].content), before);
    await select('Scenario 1 Condition 1 operator', 'is'); await select('Scenario 1 Condition 1 value', 'Brand Owner');
    const editor = '.workflow-message-surface:first-child .tracker-rich-text'; await page.focus(editor); await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control'); await page.keyboard.type('Dear ');
    await page.click('.workflow-message-surface:first-child .workflow-variables-trigger'); await page.waitForSelector('.workflow-variable-palette:popover-open'); await page.type('.workflow-variable-palette:popover-open input', 'Client company'); await clickText('.workflow-variable-palette:popover-open button', 'Client company'); await page.keyboard.type(', {{client.clientId}}');
    await page.waitForFunction(() => window.emailContextFixture.rendered.body.includes('Dear Shared & Sons, BO'));
    assert((await page.evaluate(() => window.emailContextFixture.workflow.contentRules[0].content)).includes('{{client.companyName}}'));
    assert.deepEqual(await page.evaluate(() => window.emailContextFixture.rendered.unresolvedVariables), []);
    await select('Overlapping scenarios', 'Combine matching scenarios'); await page.waitForFunction(() => window.emailContextFixture.rendered.selection.selectedScenarioIds.length === 2);
    await clickText('.fixture-tools button', 'Save fixture'); await clickText('.fixture-tools button', 'Reopen fixture'); assert.equal(await page.evaluate(() => window.emailContextFixture.workflow.combinationMatchingMode), 'combine');
    await page.screenshot({ path: path.join(output, 'light-desktop.png'), fullPage: true }); await clickText('.fixture-tools button', 'Theme'); await page.screenshot({ path: path.join(output, 'dark-desktop.png'), fullPage: true });
    await page.setViewport({ width: 390, height: 844 }); await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await select('Scenario 1 Condition 1 field', 'State'); await select('Scenario 1 Condition 1 value', 'Delhi'); await page.screenshot({ path: path.join(output, 'dark-mobile.png'), fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'No horizontal condition-editor overflow'); assert.deepEqual(errors, []);
    console.log('PASS: grouped category/state fields, typed values/reset, category multi-selection, real Variables menu -> resolved scenario content, explicit combine/save/reopen, desktop/mobile light/dark/reduced motion. ' + output);
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

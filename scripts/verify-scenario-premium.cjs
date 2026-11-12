// Reuses the real scenario/modal/editor fixture and actual matching/rendering engine.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const webpack = require('next/dist/compiled/webpack/webpack'), puppeteer = require('puppeteer-core');
const root = path.resolve(__dirname, '..'), output = path.join(root, process.argv.includes('--help-only') ? '.artifacts/scenario-help/run-' + Date.now() : '.artifacts/scenario-liquid-glass/run-' + Date.now());
const load = require('./search-test-loader.cjs')();
const { createTrackerEmailContext } = load('lib/tracker-email-context.ts');
const { analyzeScenarioClient, summarizeScenarioAnalysis } = load('lib/tracker-scenario-analysis.ts');
const fields = [{ key: 'ready', label: 'Ready', type: 'toggle' }];
const condition = (fieldKey, value, operator = 'equals') => ({ fieldKey, value, operator });
const group = (...conditions) => ({ mode: 'ALL', conditions });
const rule = (id, name, conditions, order, action = 'include') => ({ id, name, type: 'combination', order, action, conditionGroup: group(...conditions), content: '<p>Dear <strong>{{client.companyName}}</strong>,</p><p>We received your information for {{tracker.financialYear}}.</p>' });
const base = { name: 'Migration confirmation', mainFieldKey: 'ready', mainValue: 'Yes', conditionGroup: group(condition('ready', 'Yes')), subject: 'Update for {{client.companyName}}', body: '{{combinationMessage}}', points: [], contentMode: 'combinations', combinationMatchingMode: undefined, contentRules: [
  rule('upload', 'Upload confirmation', [condition('ready', 'Yes'), condition('client.category', ['Producer', 'Importer', 'Brand Owner'], 'is_any_of')], 0),
  rule('pwp', 'PWP Registration Update', [condition('ready', 'Yes'), condition('client.category', 'PWP')], 1),
  rule('brand', 'Brand Owner Migration', [condition('ready', 'Yes'), condition('client.category', 'Brand Owner')], 2),
  rule('exclude', 'No Email Required', [condition('ready', 'No')], 3, 'skip'),
] };
let settings = { count: 226, cohort: true, missing: false, long: false, failure: false, delay: 0, total: null }, calls = { full: 0, detail: 0 };
async function main() {
  fs.mkdirSync(output, { recursive: true }); webpack.init();
  await new Promise((resolve, reject) => { const compiler = webpack.webpack({ mode: 'development', devtool: false, context: root, entry: path.join(__dirname, 'fixtures/scenario-interactions.tsx'), output: { path: output, filename: 'fixture.js' }, resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@': root } }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, 'fixtures/workflow-editor-loader.cjs') }] } }); compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve())); });
  const css = (await require('postcss')([require('tailwindcss')(path.join(root, 'tailwind.config.ts'))]).process(fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8').replace(/^@import .+$/gm, ''), { from: path.join(root, 'app/globals.css') })).css + ['app/client-profile-premium.css', 'components/ui/liquid-glass/liquid-glass.css', 'app/scenario-test-material.css'].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  const server = http.createServer(async (req, res) => {
    if (req.url.endsWith('/email/scenario-preview')) {
      let raw = ''; for await (const chunk of req) raw += chunk; const { workflow, entryId } = JSON.parse(raw), input = { ...settings };
      calls[entryId ? 'detail' : 'full']++;
      if (input.failure) { settings.failure = false; res.statusCode = 503; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ error: 'The test could not finish. Please try again.' })); }
      const rows = Array.from({ length: input.count }, (_, i) => ({ id: (i + 1).toString(16).padStart(24, '0'), i })).filter(item => !entryId || item.id === entryId).map(({ id, i }) => {
        const clientId = i === 0 ? 'BRD-005' : 'CLIENT' + i, name = i === 0 ? input.long ? 'Cedar Packaging and Sustainable Materials International Private Limited '.repeat(3) : 'Cedar Packaging Limited' : 'Tracker Company ' + i;
        if (input.missing && i === 4) return { entryId: id, clientId, companyName: name, decision: 'invalid', reason: 'The linked client record is unavailable.', sendRuleMatched: false, matchedRuleIds: [], selectedRuleIds: [], issues: ['Missing client context.'], selection: { matchingMode: workflow.combinationMatchingMode || 'legacy', matchedScenarioIds: [], selectedScenarioIds: [], ignoredScenarioIds: [], matchedStatementIds: [], matchedPointIds: [], scenarios: [] } };
        return analyzeScenarioClient(workflow, createTrackerEmailContext({ entry: { _id: id, clientId }, client: { clientId, companyName: name, category: i === 0 ? 'Brand Owner' : ['Producer', 'Importer', 'PWP'][i % 3] }, fields, values: { ready: input.cohort ? i < 28 : true }, financialYear: '2025-26', trackerName: 'Migration confirmation', workflowName: workflow.name }), Boolean(entryId));
      });
      if (input.delay) await new Promise(resolve => setTimeout(resolve, input.delay));
      res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(summarizeScenarioAnalysis(workflow, rows, entryId ? rows.length : input.total ?? input.count, 2000)));
    }
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'application/javascript; charset=utf-8'); return res.end(fs.readFileSync(path.join(output, 'fixture.js'))); }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser, page;
  const results = [];
  try {
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(15000);
    const click = async selector => { const node = await page.waitForSelector(selector, { visible: true }); await require('./fixtures/wait-for-stable-control.cjs')(node); await node.click(); };
    const textClick = async (selector, text) => { for (const node of await page.$$(selector)) if ((await node.evaluate(node => node.textContent.trim())) === text) { await require('./fixtures/wait-for-stable-control.cjs')(node); await node.click(); return; } throw Error('Missing control: ' + text); };
    const tab = async view => { await click('#scenario-tab-' + view); await page.waitForFunction(view => document.querySelector('#scenario-tab-' + view).getAttribute('aria-selected') === 'true', {}, view); };
    const fresh = () => page.waitForFunction(() => window.scenarioFixture.analysis?.fingerprint === JSON.stringify([window.scenarioFixture.workflow, [{ key: 'ready', label: 'Ready', type: 'toggle' }]]) && document.querySelector('.scenario-test')?.getAttribute('aria-busy') === 'false');
    const retest = async () => { await click('.scenario-retest'); await fresh(); };
    const draft = async patch => { await page.evaluate(patch => window.scenarioFixture.patch({ ...patch, combinationMatchingMode: patch.combinationMatchingMode }), patch); await retest(); };
    const metric = async label => { await tab('overview'); await click('[aria-label="' + label + '"]'); await page.waitForFunction(() => document.querySelector('#scenario-tab-explore').getAttribute('aria-selected') === 'true'); };
    const totals = () => page.evaluate(() => [Number(document.querySelector('.scenario-checked-total').dataset.count), ...[...document.querySelectorAll('.scenario-metrics > button > strong')].map(node => Number(node.textContent))]);
    const capture = async name => { const panel = await page.$('.scenario-refined-modal'); await require('./fixtures/wait-for-stable-control.cjs')(panel); await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.scenario-refined-modal')).opacity) > .999 && Number(getComputedStyle(document.querySelector('.scenario-view[aria-hidden="false"], .scenario-view:not([aria-hidden])')).opacity) > .999); await panel.evaluate(node => Promise.all(node.getAnimations({ subtree: true }).filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})))); await page.screenshot({ path: path.join(output, name + '.png') }); };
    const detail = async () => { await page.waitForSelector('[data-current="true"] .scenario-detail-content', { visible: true }); await page.waitForFunction(() => document.querySelector('.scenario-detail-host').getAttribute('aria-busy') === 'false' && !!document.querySelector('[data-current="true"] .scenario-detail-content')); };
    const setSearch = async value => { await page.focus('.scenario-search input'); await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control'); await page.keyboard.sendCharacter(value); };
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]); await page.setViewport({ width: 1280, height: 1000 }); await page.goto('http://127.0.0.1:' + server.address().port); await page.waitForSelector('.workflow-message-surface');
    await page.evaluate(patch => window.scenarioFixture.patch(patch), base);
    await page.evaluate(() => [...document.querySelectorAll('.workflow-message-preview')].find(node => node.textContent === 'Test against tracker clients').click()); await fresh();
    if (process.argv.includes('--help-only')) {
      const root = name => '[data-disclosure="' + name + '"]';
      const settled = (name, open) => page.waitForFunction(({name,open}) => { const node=document.querySelector('[data-disclosure="'+name+'"]'), panel=node?.querySelector('.scenario-disclosure-panel'); return node?.querySelector('button').getAttribute('aria-expanded')===String(open) && (open ? panel.getBoundingClientRect().height>0 && Math.abs(panel.getBoundingClientRect().height-panel.scrollHeight)<2 : panel.hidden); }, {}, {name,open});
      const toggle = async (name, open) => { if (await page.$eval(root(name)+' > button', node=>node.getAttribute('aria-expanded'))!==String(open)) await click(root(name)+' > button'); await settled(name,open); const button=await page.$(root(name)+' > button'); await require('./fixtures/wait-for-stable-control.cjs')(button); };
      const ruleOpen = async id => { await tab('overview'); if (!await page.$eval('[data-scenario-id="'+id+'"]', node=>node.open)) await click('[data-scenario-id="'+id+'"] > summary'); };
      assert.deepEqual(await totals(),[226,28,198,1]); assert.equal(await page.$$eval('.scenario-method > .scenario-help-disclosure',nodes=>nodes.length),1);
      const helpCalls={...calls};
      await page.focus(root('general')+' > button'); await page.keyboard.press('Enter'); await settled('general',true);
      assert(await page.$eval(root('general')+' > button',button=>{ const panel=document.getElementById(button.getAttribute('aria-controls')); return button.tagName==='BUTTON' && panel.getAttribute('aria-labelledby')===button.id && panel.getAttribute('role')==='region'; }));
      assert((await page.$eval(root('general'),node=>node.textContent)).includes('priority order determines the decision'));
      assert((await page.$eval(root('general'),node=>node.textContent)).includes('226 of 226 clients'));
      assert.equal(await page.$eval(root('general')+' time',node=>node.dateTime),await page.evaluate(()=>window.scenarioFixture.analysis.result.evaluatedAt));
      await page.focus(root('general')+' .scenario-test-measures button'); await page.$eval(root('general')+' > button',node=>node.click()); await settled('general',false); assert(await page.$eval(root('general')+' > button',node=>document.activeElement===node));
      await page.keyboard.press('Space'); await settled('general',true); await page.focus(root('general')+' .scenario-test-measures button'); await page.keyboard.press('Escape'); await settled('general',false); assert(await page.$('.scenario-liquid-modal')); assert(await page.$eval(root('general')+' > button',node=>node===document.activeElement));
      assert.deepEqual(calls,helpCalls,'Help expands entirely from the existing snapshot');
      await ruleOpen('exclude'); await toggle('numbers-exclude',true);
      assert.equal(await page.$eval(root('numbers-exclude')+' [data-metric="matched"] dd',node=>Number(node.textContent)),198);
      assert.equal(await page.$eval(root('numbers-exclude')+' [data-metric="used"] dd',node=>Number(node.textContent)),0);
      assert.equal(await page.$eval(root('numbers-exclude')+' [data-metric="outside"] dd',node=>Number(node.textContent)),198);
      assert(!(await page.$eval(root('numbers-exclude'),node=>node.textContent)).includes('Combine mode'));
      assert((await page.$eval('[data-scenario-id="exclude"]',node=>node.textContent)).includes('This Exclude action was not applied'));
      await capture('exclude-numbers-light'); await toggle('numbers-exclude',false);
      await page.$eval('[data-scenario-id="exclude"]',node=>{node.open=false;});
      await ruleOpen('brand'); await toggle('numbers-brand',true);
      assert.equal(await page.$eval(root('numbers-brand')+' [data-metric="bypassed"] dd',node=>Number(node.textContent)),1);
      await page.focus(root('numbers-brand')+' .workflow-test-link'); await page.keyboard.press('Escape'); await settled('numbers-brand',false); assert(await page.$eval('[data-scenario-id="brand"]',node=>node.open));
      const beforeActions={...calls};
      await textClick('[data-scenario-id="brand"] .scenario-rule-actions > button','See matching clients'); assert.equal(await page.$$eval('.scenario-client-list > button',nodes=>nodes.length),1);
      assert((await page.$eval('.scenario-applied',node=>node.textContent)).includes('Matching Scenario 3'));
      await ruleOpen('brand'); await textClick('[data-scenario-id="brand"] .scenario-rule-actions > button','See chosen clients'); assert.equal(await page.$$eval('.scenario-client-list > button',nodes=>nodes.length),0);
      assert((await page.$eval('.scenario-applied',node=>node.textContent)).includes('Chosen by Scenario 3')); assert.deepEqual(calls,beforeActions);
      await metric('Clients checked'); await setSearch('Cedar'); await click('.scenario-client-list > button'); await detail(); await click('.scenario-client-frame[data-current="true"] .scenario-message > summary'); await page.waitForSelector('.scenario-client-frame[data-current="true"] iframe'); await page.evaluate(()=>window.helpPreview=document.querySelector('.scenario-client-frame[data-current="true"] iframe'));
      await ruleOpen('upload'); await textClick('[data-scenario-id="upload"] .scenario-rule-actions > button','See chosen clients');
      assert.equal(await page.$eval('.scenario-search input',node=>node.value),'Cedar'); assert.equal(await page.$$eval('.scenario-client-list > button',nodes=>nodes.length),1); assert(await page.evaluate(()=>window.helpPreview===document.querySelector('.scenario-client-frame[data-current="true"] iframe')),'Related navigation preserves search and a still-matching selected preview');
      await page.setViewport({width:1280,height:580}); await tab('overview'); await toggle('general',false);
      await page.$eval('.scenario-overview-view',node=>{node.scrollTop=node.scrollHeight;}); const beforeScroll=await page.$eval('.scenario-overview-view',node=>node.scrollTop), shell=await page.$eval('.scenario-liquid-modal',node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height}));
      await toggle('general',true); await page.waitForFunction(before=>document.querySelector('.scenario-overview-view').scrollTop>before,{},beforeScroll);
      assert(await page.$eval(root('general')+' > button',node=>{const r=node.getBoundingClientRect(),p=node.closest('.scenario-overview-view').getBoundingClientRect();return r.top>=p.top-1 && r.bottom<=p.bottom;}));
      assert.deepEqual(await page.$eval('.scenario-liquid-modal',node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})),shell);
      assert.equal(await page.evaluate(()=>scrollY),0); await capture('help-short-desktop');
      for (const width of [320,375,390,430,768,1024,1280]) for(const dark of [false,true]) {
        await page.setViewport({width,height:width<600?844:1000}); await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:width===320?'reduce':'no-preference'}]); await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);
        await tab('overview'); await toggle('general',true);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        assert(await page.$eval(root('general'),node=>node.scrollWidth<=node.clientWidth+1)); assert(await page.$eval('.scenario-test-footer',node=>node.getBoundingClientRect().bottom<=innerHeight+1));
        if(width===375&&dark) await capture('help-dark-mobile');
        results.push({width,theme:dark?'dark':'light',help:true,overflow:false,footer:true,reducedMotion:width===320});
      }
      await page.setViewport({width:1280,height:1000}); await page.evaluate(()=>document.documentElement.classList.add('dark')); await capture('general-help-dark'); await toggle('general',false);
      settings={...settings,count:30,cohort:false}; await draft({...base,combinationMatchingMode:'combine',contentRules:[rule('send','Send update',[condition('ready','Yes')],0),rule('stop','Exclude update',[condition('ready','Yes')],1,'skip')]});
      await ruleOpen('send'); await toggle('numbers-send',true);
      assert.equal(await page.$eval(root('numbers-send')+' [data-metric="used"] dd',node=>Number(node.textContent)),0);
      assert.equal(await page.$eval(root('numbers-send')+' [data-metric="selected"] dd',node=>Number(node.textContent)),30);
      assert.equal(await page.$eval(root('numbers-send')+' [data-metric="blocked"] dd',node=>Number(node.textContent)),30);
      assert((await page.$eval(root('numbers-send'),node=>node.textContent)).includes('Combine mode')); await capture('combine-blocked-numbers-dark');
      await ruleOpen('stop'); await textClick('[data-scenario-id="stop"] .scenario-rule-actions > button','See excluded clients'); assert.equal(await page.$$eval('.scenario-client-list > button',nodes=>nodes.length),1,'Existing Cedar search remains applied'); assert.equal(await page.$eval('.scenario-client-list > button .scenario-client-decision',node=>node.textContent),'Excluded by rule');
      await draft({...base,contentRules:[rule('none','No applicable category',[condition('client.category','SIMP')],0)]}); await ruleOpen('none'); await toggle('numbers-none',true); assert.equal(await page.$$eval(root('numbers-none')+' .is-zero',nodes=>nodes.length),4);
      assert.equal(await page.$$eval('[data-scenario-id="none"] .scenario-rule-counts > span',nodes=>nodes.length),2,'Routine zero metrics stay inside help');
      await toggle('numbers-none',false); const rapid=await page.$(root('numbers-none')+' > button'); await rapid.click(); await rapid.click(); await settled('numbers-none',false);
      assert.deepEqual(errors,[]); assert.equal(await page.evaluate(()=>scrollY),0);
      fs.writeFileSync(path.join(output,'help-results.json'),JSON.stringify({passed:true,viewports:results,checks:'consolidated help; actual button/region semantics; Enter/Space/Escape; safe collapse focus; no help API calls; first/combine/send/exclude/outside/bypass/zero counts; matching vs chosen filters; search/preview retention; bottom reveal and shell stability; touch/reduced motion; authoritative engine fixtures',calls},null,2));
      console.log('PASS: scenario disclosures and contextual help; evidence at '+output); return;
    }
    assert.deepEqual(await totals(), [226, 28, 198, 1]);
    assert.equal(await page.$$eval('.scenario-metrics > button', nodes => nodes.length), 3);
    assert(await page.$eval('#scenario-view-explore', node => node.hidden));
    const overviewGeometry = await page.$eval('.scenario-overview-view', node => ({ scroll: node.scrollHeight, height: node.clientHeight })); assert(overviewGeometry.scroll <= overviewGeometry.height + 100, 'Overview needs little or no desktop scrolling: ' + JSON.stringify(overviewGeometry));
    await capture('overview-light-desktop');
    await page.evaluate(() => document.documentElement.classList.add('dark')); await capture('overview-dark-desktop');
    const materials = await page.evaluate(() => ({ border: getComputedStyle(document.querySelector('.scenario-refined-modal')).borderTopColor, header: getComputedStyle(document.querySelector('.scenario-refined-modal .tracker-modal-header')).backgroundColor, footer: getComputedStyle(document.querySelector('.scenario-test-footer')).backgroundColor }));
    assert(/0\.(?:0[7-9]|1[0-2])\)/.test(materials.border), 'Dark modal uses a neutral low-opacity hairline'); assert.equal(materials.header, materials.footer);
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await page.evaluate(() => {
      window.savedPill = document.querySelector('.scenario-glass-pill');
      window.sgFrames = []; window.sgTasks = []; window.sgSampling = true;
      window.sgObserver = new PerformanceObserver(list => window.sgTasks.push(...list.getEntries().map(entry => entry.duration)));
      window.sgObserver.observe({ type: 'longtask', buffered: false });
      let previous; const tick = t => { if (!window.sgSampling) return; if (previous) window.sgFrames.push(t - previous); previous = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    });
    for (const view of ['explore', 'overview', 'explore', 'overview']) {
      await tab(view); await page.waitForFunction(view => { const pill = document.querySelector('.scenario-glass-pill').getBoundingClientRect(), track = document.querySelector('.scenario-glass-tabs').getBoundingClientRect(); return Math.abs(pill.left - (view === 'explore' ? track.left + track.width / 2 : track.left + 5)) < .8; }, {}, view);
    }
    const performanceProfile = await page.evaluate(() => { window.sgSampling = false; window.sgObserver.disconnect(); const frames = window.sgFrames.slice(1).sort((a,b) => a-b); return { samples: frames.length, medianFrameMs: frames[Math.floor(frames.length / 2)], p95FrameMs: frames[Math.floor(frames.length * .95)], maxFrameMs: frames.at(-1), longTasksOver50ms: window.sgTasks.length, longestTaskMs: Math.max(0,...window.sgTasks) }; });
    if (process.argv.includes('--profile-only')) {
      await page.evaluate(() => { window.sgFrames = []; window.sgTasks = []; window.sgSampling = true; window.sgObserver.observe({ type: 'longtask', buffered: false }); let previous; const tick = t => { if (!window.sgSampling) return; if (previous) window.sgFrames.push(t-previous); previous=t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
      for (let i=0; i<12; i++) { const view = i%2 ? 'overview' : 'explore'; await tab(view); await page.waitForFunction(view => { const pill = document.querySelector('.scenario-glass-pill').getBoundingClientRect(), track = document.querySelector('.scenario-glass-tabs').getBoundingClientRect(); return Math.abs(pill.left-(view === 'explore' ? track.left+track.width/2 : track.left+5)) < .8; }, {}, view); }
      const steady = await page.evaluate(() => { window.sgSampling=false; window.sgObserver.disconnect(); const frames=window.sgFrames.slice(1).sort((a,b)=>a-b); return { samples:frames.length, medianFrameMs:frames[Math.floor(frames.length/2)], p95FrameMs:frames[Math.floor(frames.length*.95)], maxFrameMs:frames.at(-1), longTasksOver50ms:window.sgTasks.length, longestTaskMs:Math.max(0,...window.sgTasks) }; });
      fs.writeFileSync(path.join(output,'motion-profile.json'),JSON.stringify({initial:performanceProfile,steady,calls},null,2)); console.log('PASS: isolated navigation profile; evidence at '+output); return;
    }
    assert(performanceProfile.samples >= 10); assert(await page.evaluate(() => window.savedPill === document.querySelector('.scenario-glass-pill') && document.querySelectorAll('.scenario-glass-pill').length === 1), 'One continuously mounted selection pill');
    const target = await page.$('#scenario-tab-explore'), targetBox = await target.boundingBox(); await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2); await page.mouse.down();
    await page.waitForFunction(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.scenario-glass-pill')).transform).d < .995);
    await page.mouse.up(); await tab('overview');
    const readContrast = () => page.evaluate(() => {
      const style = getComputedStyle(document.querySelector('.scenario-liquid-modal'));
      const rgb = value => { if (!value.trim().startsWith('#')) return value.match(/[\d.]+/g).slice(0,3).map(Number); let hex = value.trim().slice(1); if (hex.length === 3) hex = [...hex].map(x => x + x).join(''); return hex.match(/../g).map(x => parseInt(x,16)); };
      const luminance = value => rgb(value).map(n => { n /= 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }).reduce((sum,n,i) => sum+n*[.2126,.7152,.0722][i],0);
      const ratio = (a,b) => { const x = luminance(a), y = luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
      const planes = ['--sg-content','--sg-canvas','--sg-chrome'].map(token => style.getPropertyValue(token)); return { ordinary: Math.min(...planes.map(plane => ratio(style.getPropertyValue('--sg-secondary'),plane))), metadata: Math.min(...planes.map(plane => ratio(style.getPropertyValue('--sg-tertiary'),plane))), primaryAction: ratio('#ffffff',style.getPropertyValue('--sg-action')) };
    }); const contrast = { light: await readContrast(), dark: null }; await page.evaluate(() => document.documentElement.classList.add('dark')); contrast.dark = await readContrast(); await page.evaluate(() => document.documentElement.classList.remove('dark')); assert([...Object.values(contrast.light), ...Object.values(contrast.dark)].every(value => value >= 4.5), 'Reading and primary-action text meet AA contrast in both themes');
    await click('[data-scenario-id="exclude"] > summary'); await page.waitForFunction(() => document.querySelector('[data-scenario-id="exclude"]').open);
    assert((await page.$eval('[data-scenario-id="exclude"]', node => node.textContent)).includes('198 matched but did not meet'));
    await capture('expanded-scenario-light'); await click('[data-scenario-id="exclude"] > summary');
    const beforeScenario = { ...calls }; await click('[data-scenario-id="upload"] .scenario-rule-open'); assert.equal(await page.$eval('#scenario-tab-explore', node => node.getAttribute('aria-selected')), 'true'); assert((await page.$eval('.scenario-applied', node => node.textContent)).includes('Matching Scenario 1')); assert.deepEqual(calls, beforeScenario); await tab('overview');
    await click('.scenario-findings > button'); await detail();
    assert.equal(await page.$eval('.scenario-client-list > button[aria-pressed="true"]', node => node.dataset.clientEntry), '000000000000000000000001');
    assert(await page.evaluate(() => document.querySelector('.scenario-detail-host').getBoundingClientRect().left > document.querySelector('.scenario-client-pane').getBoundingClientRect().right));
    await click('.scenario-more-proof > summary'); assert((await page.$eval('.scenario-more-proof', node => node.textContent)).includes('comes first'));
    await click('.scenario-message > summary'); await page.waitForSelector('.scenario-message iframe', { visible: true });
    assert((await page.$eval('.scenario-message iframe', node => node.srcdoc)).includes('Cedar Packaging Limited'));
    await page.evaluate(() => { window.savedList = document.querySelector('.scenario-client-list'); window.savedPreview = document.querySelector('.scenario-message iframe'); });
    const beforeSwitch = { ...calls }; await setSearch('Cedar'); await tab('overview'); await tab('explore');
    assert.equal(await page.$eval('.scenario-search input', node => node.value), 'Cedar');
    assert(await page.evaluate(() => window.savedList === document.querySelector('.scenario-client-list') && window.savedPreview === document.querySelector('.scenario-message iframe') && document.querySelector('.scenario-message').open && document.querySelector('.scenario-more-proof').open), 'Tabs preserve mounted list, selection, preview, and disclosures');
    assert.deepEqual(calls, beforeSwitch, 'Tabs and local search do not fetch or evaluate');
    await page.evaluate(() => document.documentElement.classList.add('dark')); await capture('explore-dark-desktop'); await page.evaluate(() => document.documentElement.classList.remove('dark')); await capture('explore-light-desktop');
    await click('[aria-label="Clear client search"]'); assert.equal(await page.$eval('.scenario-search input', node => node.value), ''); assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Find tracker preview client'); assert(await page.$('[aria-label="Remove decision filter"]')); await setSearch('Cedar');
    await click('#scenario-tab-explore'); await page.keyboard.press('ArrowLeft'); assert.equal(await page.evaluate(() => document.activeElement.id), 'scenario-tab-overview'); await page.keyboard.press('End'); assert.equal(await page.evaluate(() => document.activeElement.id), 'scenario-tab-explore');
    await textClick('.scenario-applied button', 'Clear filters'); await page.waitForFunction(() => document.querySelectorAll('.scenario-client-list > button').length === 25);
    settings.delay = 180; await click('.scenario-client-list > button:nth-child(2)');
    await page.waitForFunction(() => document.querySelector('.scenario-detail-host').getAttribute('aria-busy') === 'true');
    assert((await page.$eval('.scenario-client-frame[data-current="true"] .scenario-detail-heading', node => node.textContent)).includes('CLIENT1'), 'New identity is shown before its decision arrives');
    assert(await page.$$eval('.scenario-client-frame[data-current="false"]', nodes => nodes.every(node => node.inert && node.getAttribute('aria-hidden') === 'true')), 'Outgoing client is inaccessible during handoff');
    assert.equal(await page.$('.scenario-client-frame[data-current="false"] iframe'), null, 'Outgoing email body is removed during handoff'); await detail(); settings.delay = 0;
    assert((await page.$eval('.scenario-client-frame[data-current="true"] .scenario-detail-content', node => node.textContent)).includes('Only matching scenario'));
    await page.$eval('.scenario-list-scroll', node => { node.scrollTop = 250; }); await textClick('.scenario-pagination button', 'Next'); assert((await page.$eval('.scenario-pagination', node => node.textContent)).includes('26–50 of 226')); assert.equal(await page.$eval('.scenario-list-scroll', node => node.scrollTop), 0);
    await click('.scenario-client-list > button'); await detail(); const pageClient = await page.$eval('.scenario-client-list > button[aria-pressed="true"]', node => node.dataset.clientEntry);
    await tab('overview'); await tab('explore'); assert((await page.$eval('.scenario-pagination', node => node.textContent)).includes('Page 2')); assert.equal(await page.$eval('.scenario-client-list > button[aria-pressed="true"]', node => node.dataset.clientEntry), pageClient);
    const beforeRetest = { ...calls }, activePage = await page.$eval('.scenario-pagination', node => node.textContent); const buttonSize = await page.$eval('.scenario-retest', node => node.getBoundingClientRect().width);
    settings.delay = 400; await click('.scenario-retest'); await page.waitForFunction(() => document.querySelector('.scenario-test').getAttribute('aria-busy') === 'true'); assert(await page.$('.scenario-detail-content')); assert.equal(await page.$eval('.scenario-retest', node => node.getBoundingClientRect().width), buttonSize); await fresh(); await detail(); settings.delay = 0;
    assert.equal(await page.$eval('.scenario-pagination', node => node.textContent), activePage); assert.equal(await page.$eval('.scenario-client-list > button[aria-pressed="true"]', node => node.dataset.clientEntry), pageClient); assert.equal(calls.full, beforeRetest.full + 1); assert.equal(calls.detail, beforeRetest.detail + 1);
    const widths = [320, 375, 390, 430, 768, 1024, 1280];
    for (const width of widths) for (const dark of [false, true]) {
      await page.setViewport({ width, height: width < 600 ? 844 : 1000 }); await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: width === 320 ? 'reduce' : 'no-preference' }]); await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
      await tab('overview'); const size = await page.$eval('.scenario-refined-modal', node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await metric('Clients checked'); await page.waitForFunction(() => document.activeElement?.textContent === 'Client results'); await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Find tracker preview client');
      const exploreSize = await page.$eval('.scenario-refined-modal', node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })); assert.deepEqual(exploreSize, size, 'View switching keeps outer geometry');
      assert(await page.$eval('.scenario-test-footer', node => { const r = node.getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top >= 0; }));
      await click('[aria-label="Filter tracker matching decision"]'); await page.waitForSelector('[role="listbox"]'); assert(await page.$eval('[role="listbox"]', node => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; })); await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('[role="listbox"]'));
      await tab('overview');
      if (width === 375 && dark) await capture('overview-dark-375');
      if (width === 768 && !dark) { await click('.scenario-findings > button'); await detail(); await capture('inspection-tablet'); await click('.scenario-back'); assert(await page.$eval('.scenario-client-list > button[aria-pressed="true"]', node => node === document.activeElement)); }
      results.push({ width, theme: dark ? 'dark' : 'light', bothViews: true, stableGeometry: true, dropdownBounds: true });
    }
    await page.setViewport({ width: 1280, height: 580 }); await metric('Not selected'); assert(await page.$eval('.scenario-test-footer', node => node.getBoundingClientRect().bottom <= innerHeight + 1)); results.push({ width: 1280, height: 580 });
    await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 2 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); results.push({ zoomEquivalent: '200% layout viewport/device scale', textEnlargement: '125% root size' }); const regularNumberSize = await page.$eval('.scenario-metrics strong', node => parseFloat(getComputedStyle(node).fontSize)); await page.evaluate(() => document.documentElement.style.fontSize = '20px'); await tab('overview'); assert.equal(await page.$eval('.scenario-metrics strong', node => parseFloat(getComputedStyle(node).fontSize)), regularNumberSize * 1.25); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await tab('explore'); assert(await page.$eval('.scenario-test-footer', node => node.getBoundingClientRect().bottom <= innerHeight + 1)); await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
    await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 1 }); await page.evaluate(() => document.documentElement.classList.remove('dark'));
    settings = { ...settings, count: 40, cohort: false, missing: true, long: true };
    await draft({ ...base, contentRules: [...base.contentRules, rule('more', 'Additional matching message ' + 'Long name '.repeat(5), [condition('ready', 'Yes')], 4)].map(rule => ({ ...rule, name: rule.name + ' Additional guidance '.repeat(3) })) });
    assert.equal((await totals())[3], 40); await tab('overview'); assert.equal(await page.$$eval('.scenario-findings > button', nodes => nodes.length), 3); await click('.scenario-show-more'); assert.equal(await page.$$eval('.scenario-rule', nodes => nodes.length), 5);
    await textClick('.scenario-attention .scenario-section-heading button', 'View all'); assert.equal(await page.$$eval('.scenario-client-list > button', nodes => nodes.length), 25); await textClick('.scenario-pagination button', 'Next'); assert.equal(await page.$$eval('.scenario-client-list > button', nodes => nodes.length), 15);
    await setSearch('Brand Owner'); await page.waitForFunction(() => document.querySelectorAll('.scenario-client-list > button').length === 1); await click('[aria-label="Remove search filter"]'); assert(await page.$('[aria-label="Remove decision filter"]'), 'Removing search keeps the review filter'); await setSearch('CLIENT4'); await click('.scenario-client-list > button'); await detail(); assert((await page.$eval('.scenario-data-issues', node => node.textContent)).includes('Missing client context'));
    await textClick('.scenario-applied button', 'Clear filters');
    settings = { ...settings, count: 30, cohort: false, long: false, missing: false };
    await draft({ ...base, contentRules: [rule('all', 'All clients', [condition('ready', 'Yes')], 0)] }); assert.deepEqual((await totals()).slice(0, 3), [30, 30, 0]); assert.equal(await page.$('.scenario-attention'), null);
    await draft({ ...base, contentMode: 'statements', body: '{{statements}}', contentRules: ['First retained statement', 'Second retained statement'].map((name, i) => ({ ...rule('statement-' + i, name, [condition('ready', 'Yes')], i), type: 'statement', content: '<p>' + name + '</p>' })) }); assert.equal(await page.$eval('.scenario-mode', node => node.textContent), 'Matching message fragments'); await metric('Clients checked'); await click('.scenario-client-list > button'); await detail(); await click('.scenario-message > summary'); await page.waitForSelector('.scenario-message iframe'); const html = await page.$eval('.scenario-message iframe', node => node.srcdoc); assert(html.includes('First retained statement') && html.includes('Second retained statement'));
    await draft({ ...base, contentRules: [rule('none', 'Future category', [condition('client.category', 'SIMP')], 0)] }); assert.deepEqual((await totals()).slice(0, 3), [30, 0, 30]);
    await draft({ ...base, combinationMatchingMode: 'combine', contentRules: [rule('send', 'Send update', [condition('ready', 'Yes')], 0), rule('stop', 'Exclude update', [condition('ready', 'Yes')], 1, 'skip')] }); await metric('Not selected'); await click('.scenario-client-list > button'); await detail(); await click('.scenario-more-proof > summary'); assert((await page.$eval('.scenario-detail-content', node => node.textContent)).includes('stops sending even when a Send scenario also matches')); assert.equal(await page.$('.scenario-message iframe'), null);
    settings.count = 0; await retest(); assert.deepEqual(await totals(), [0, 0, 0, 0]); await tab('explore'); assert((await page.$eval('.scenario-quiet-state', node => node.textContent)).includes('No tracker clients'));
    settings.count = 226; settings.cohort = true; await draft(base);
    await metric('Clients checked'); settings.failure = true; await click('.scenario-retest'); await page.waitForSelector('.scenario-workspace-top > [role="alert"]'); assert(await page.$eval('.scenario-workspace-top > [role="alert"]', node => { const r = node.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && node === document.activeElement; })); await tab('overview'); assert.equal(await page.$eval('.scenario-completion', node => node.textContent), 'Retest needed'); assert.deepEqual(await totals(), [226, 28, 198, 1]); await capture('failed-retest-desktop'); await retest();
    await page.evaluate(() => window.scenarioFixture.edit('upload', '<p>New unsaved {{client.companyName}}</p>')); await page.waitForFunction(() => document.querySelector('.scenario-status').textContent.includes('Results are outdated')); await retest();
    assert.deepEqual(errors, []); assert.equal(await page.evaluate(() => scrollY), 0);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passed: true, viewports: results, materials, performanceProfile, contrast, checks: 'one spring/press glass pill; profiled localized motion; AA token contrast; two persistent views; three outcomes; preserved search/filter/page/selection/iframe/disclosure; no tab API calls; roving tabs; bounded desktop list and pagination; one touch scroll; authoritative 226/28/198/1 and Exclude gating; separate detail freshness; legacy multiple statements; many overlaps/missing/long names; empty/all/none/combine exclusion; stale/error/retest selection reconciliation; reduced motion; no real data or emails', calls }, null, 2)); console.log('PASS: refined scenario workspace; evidence at ' + output);
  } catch (error) {
    if (page) { await page.screenshot({ path: path.join(output, 'failure.png') }); fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify(await page.evaluate(() => ({ text: document.body.innerText, focus: document.activeElement?.outerHTML, fixture: window.scenarioFixture })), null, 2)); } throw error;
  } finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); const bundle = path.join(output, 'fixture.js'); if (fs.existsSync(bundle)) fs.unlinkSync(bundle); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });








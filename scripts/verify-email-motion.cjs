/* Production components, local mock APIs only. Optional saved-source baseline comparison. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const puppeteer = require('puppeteer-core'), webpack = require('next/dist/compiled/webpack/webpack');
const root = path.resolve(__dirname, '..'), baseline = process.argv.includes('--baseline');
const output = path.join(root, 'tmp/email-motion', (baseline ? 'before-' : 'after-') + Date.now());
const originals = path.join(root, 'tmp/email-motion-before');
const stamp = () => new Date().toISOString();
let job = { campaignId: 'motion-job', trackerId: 'TRACKER', trackerName: 'Motion tracker', workflowName: 'Motion workflow', kind: 'initial', mode: 'send', status: 'processing', total: 300, processed: 10, sent: 10, drafts: 0, failed: 0, uncertain: 0, pending: 289, delivering: 1, executionMode: 'browser', canResume: false, controllerLeaseExpiresAt: null, needsHistoryRepair: false, createdAt: stamp(), updatedAt: stamp(), startedAt: stamp(), completedAt: null, message: null };
let challenge, itemRequests = 0, policyMode = 'emailOtpAndPin';
const requests = [], metrics = {};
async function main() {
  fs.mkdirSync(output, { recursive: true }); webpack.init();
  const alias = { '@': root, 'next/link': path.join(__dirname, 'fixtures/tracker-next-link.cjs') };
  if (baseline) for (const name of ['EmailDeliveryReviewWorkspace', 'EmailDeliveryAuthorizationModal', 'EmailDeliveryActivityProvider', 'HoldToSendButton']) alias['@/components/client-trackers/' + name + '$'] = path.join(originals, name + '.tsx');
  // Exact aliases precede the @ prefix.
  const orderedAlias = Object.fromEntries(Object.entries(alias).sort(([a], [b]) => b.length - a.length));
  await new Promise((resolve, reject) => {
    const compiler = webpack.webpack({ mode: 'development', devtool: false, context: root, entry: path.join(__dirname, 'fixtures/email-motion.tsx'), output: { path: output, filename: 'fixture.js' },
      resolve: { extensions: ['.tsx', '.ts', '.js'], alias: orderedAlias }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, 'fixtures/workflow-editor-loader.cjs') }] } });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  const css = (await require('postcss')([require('tailwindcss')(path.join(root, 'tailwind.config.ts'))]).process(fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8').replace(/^@import .+$/gm, ''), { from: path.join(root, 'app/globals.css') })).css
    + ['components/ui/liquid-glass/liquid-glass.css', 'components/client-trackers/email-delivery-review.css', 'components/client-trackers/email-delivery-security.css', 'components/client-trackers/email-delivery-activity.css'].map(file => fs.readFileSync(baseline && file.includes('client-trackers') ? path.join(originals, path.basename(file)) : path.join(root, file), 'utf8')).join('\n') + 'body{font:14px Arial;background:var(--color-surface);color:var(--color-text)}body > #root > button{margin:10px;padding:10px}';
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/fixture.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(fs.readFileSync(path.join(output, 'fixture.js'))); }
    if (url.pathname.startsWith('/api/')) {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : {};
      requests.push({ path: url.pathname, body });
      let data, status = 200, delay = 20;
      if (url.pathname === '/api/settings/email-delivery-security') data = { draftProtection: 'confirmation', directSendProtection: policyMode, approvalEmailMasked: 't•••@example.com', holdToSend: true, sendPinConfigured: true };
      else if (url.pathname.endsWith('/request')) {
        challenge = { approvalId: 'motion-approval', methodsRequired: policyMode === 'emailOtp' ? ['emailOtp'] : ['emailOtp', 'sendPin'], methodsVerified: [], status: 'pending', holdToSend: true, expiresAt: new Date(Date.now() + 300000).toISOString(), otpExpiresAt: new Date(Date.now() + 300000).toISOString(), resendAvailableAt: stamp(), approvalEmailMasked: 't•••@example.com' };
        data = challenge; delay = 150;
      } else if (url.pathname.endsWith('/verify')) {
        delay = 300;
        if (body.otp && body.otp !== '123456' || body.pin && body.pin !== '246810') { status = 400; data = { error: 'Incorrect verification code' }; }
        else { challenge = { ...challenge, methodsVerified: [...challenge.methodsVerified, body.pin ? 'sendPin' : 'emailOtp'] }; challenge.status = challenge.methodsRequired.every(method => challenge.methodsVerified.includes(method)) ? 'verified' : 'pending'; data = challenge; }
      } else if (url.pathname.endsWith('/items')) {
        itemRequests++;
        data = { job, matching: 300, nextOffset: 25, items: Array.from({ length: 25 }, (_, index) => ({ index, companyName: 'Activity client ' + index, clientId: 'C' + index, to: ['c' + index + '@example.com'], cc: [], subject: 'Subject ' + index, status: index < job.sent ? 'sent' : 'pending', processedAt: null, gmailReference: null, error: null })) };
      } else if (url.pathname === '/api/email-delivery/jobs') data = { jobs: [job] };
      else data = { job };
      setTimeout(() => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); }, delay); return;
    }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser, page;
  try {
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,  args: ['--no-sandbox'] });
    page = await browser.newPage(); await page.setViewport({ width: 1440, height: 1000 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const wait = ms => page.evaluate(ms => new Promise(resolve => setTimeout(resolve, ms)), ms);
    const click = async (text, scope = 'body') => { for (const node of await page.$$(scope + ' button')) if ((await node.evaluate(node => node.textContent.trim())) === text) { await require('./fixtures/wait-for-stable-control.cjs')(node); return node.click(); } throw Error('Missing ' + text); };
    const fill = async (label, value) => { await page.focus(`[aria-label="${label}"]`); await page.keyboard.type(value); };
    await page.goto('http://127.0.0.1:' + server.address().port); await page.waitForSelector('.delivery-activity-dock'); await wait(400);
    const cdp = await page.createCDPSession(); await cdp.send('Performance.enable');
    const before = (await cdp.send('Performance.getMetrics')).metrics;
    const actionBefore = await page.evaluate(() => window.motionFixture.metrics.actionRenders);
    await page.evaluate(async () => {
      const result = await (await fetch('/api/email-delivery/jobs/motion-job')).json();
      for (let i = 0; i < 10; i++) { window.motionFixture.observe({ ...result.job }); await new Promise(resolve => setTimeout(resolve, 20)); }
    });
    metrics.unchangedSummaryActionRenders = await page.evaluate(value => window.motionFixture.metrics.actionRenders - value, actionBefore);
    const collapsedRequests = itemRequests; await wait(150);
    assert.equal(itemRequests, collapsedRequests, 'Collapsed dock does not request item pages');
    const widths = await page.evaluate(() => new Promise(resolve => {
      const samples = [], start = performance.now(), heading = document.querySelector('.delivery-activity-heading'); heading.click();
      const sample = () => { samples.push(document.querySelector('.delivery-activity-dock').getBoundingClientRect().width); if (performance.now() - start < 450) requestAnimationFrame(sample); else resolve(samples); }; sample();
    }));
    metrics.dockIntermediateWidthFrames = widths.filter(width => width > 321 && width < 429).length;
    if (!baseline) {
      // Verify interpolation independently of dropped frames on a busy build machine.
      await page.evaluate(() => document.querySelector('.delivery-activity-heading').click()); await wait(420);
      metrics.dockMidpointWidth = await page.evaluate(async () => {
        const dock = document.querySelector('.delivery-activity-dock');
        document.querySelector('.delivery-activity-heading').click();
        await Promise.resolve();
        getComputedStyle(dock).width;
        const animation = dock.getAnimations().find(animation => animation.transitionProperty === 'width');
        if (!animation) throw Error('Dock width transition was not created');
        animation.pause(); animation.currentTime = 180;
        const width = dock.getBoundingClientRect().width;
        animation.finish();
        return width;
      });
    }
    await page.waitForSelector('.delivery-activity-item');
    const detailBefore = itemRequests;
    job = { ...job, updatedAt: stamp(), controllerLeaseExpiresAt: stamp() };
    await page.evaluate(async () => window.motionFixture.observe((await (await fetch('/api/email-delivery/jobs/motion-job')).json()).job)); await wait(250);
    metrics.heartbeatItemRefetches = itemRequests - detailBefore;
    for (let i = 0; i < 6; i++) { await page.evaluate(() => document.querySelector('.delivery-activity-heading').click()); await wait(35); }
    await page.evaluate(() => { if (document.querySelector('.delivery-activity-heading').getAttribute('aria-expanded') === 'true') document.querySelector('.delivery-activity-heading').click(); }); await wait(420);
    if (!baseline) assert(await page.$eval('.delivery-activity-expansion', node => node.inert && node.getBoundingClientRect().height < 1));
    await click('Open motion review'); await page.waitForSelector('.email-review-prepare-action'); await wait(400);
    metrics.prepareRevealMs = await page.evaluate(() => new Promise(resolve => {
      const start = performance.now(); const observer = new MutationObserver(() => { if (document.querySelector('.email-review-panes')) { observer.disconnect(); resolve(performance.now() - start); } });
      observer.observe(document.body, { childList: true, subtree: true }); document.querySelector('.email-review-prepare-action').click();
    }));
    await page.waitForFunction(() => !!document.querySelector('.email-review-mail iframe')?.getAttribute('srcdoc')?.includes('Signature original')); await wait(450);
    const selectionWorkBefore = (await cdp.send('Performance.getMetrics')).metrics;
    metrics.selection = await page.evaluate(async () => {
      const original = document.querySelector('.email-review-detail-content'), timings = []; let immediate = 0;
      for (const index of [1, 2, 3, 4, 1]) {
        const start = performance.now(); document.querySelectorAll('.email-review-client-row')[index].click(); await new Promise(resolve => requestAnimationFrame(resolve));
        if (document.querySelector('.email-review-detail-content h2')?.textContent === 'Motion client ' + index) immediate++;
        while (document.querySelector('.email-review-detail-content h2')?.textContent !== 'Motion client ' + index) await new Promise(resolve => requestAnimationFrame(resolve));
        timings.push(performance.now() - start);
      }
      return { firstFrameSelections: immediate, panelRetained: original === document.querySelector('.email-review-detail-content'), latencyMs: timings };
    });
    const selectionWorkAfter = (await cdp.send('Performance.getMetrics')).metrics;
    metrics.selection.browserWorkSeconds = Object.fromEntries(['TaskDuration', 'LayoutDuration', 'ScriptDuration'].map(name => [name, selectionWorkAfter.find(row => row.name === name).value - selectionWorkBefore.find(row => row.name === name).value]));
    if (!baseline) {
      await page.waitForFunction(() => document.querySelector('.email-review-preview-viewport iframe.is-ready')?.getAttribute('srcdoc').includes('Personalised 1'));
      // Hold the real iframe load event to inspect the visible buffer during navigation.
      await page.evaluate(() => {
        window.motionFrameLoads = [];
        window.motionHoldLoads = true;
        document.querySelector('.email-review-preview-viewport').addEventListener('load', event => { if (window.motionHoldLoads && event.target.tagName === 'IFRAME' && event.target.classList.contains('is-loading')) { event.stopPropagation(); window.motionFrameLoads.push(event.target); } }, true);
        document.querySelectorAll('.email-review-client-row')[2].click();
      }); await wait(80);
      assert(await page.$eval('.email-review-preview-viewport iframe.is-ready', node => node.getAttribute('srcdoc').includes('Personalised 1')), 'Old rendered document remains during loading');
      await page.evaluate(() => document.querySelectorAll('.email-review-client-row')[3].click()); await wait(80);
      await page.evaluate(() => { window.motionHoldLoads = false; window.motionFrameLoads.forEach(frame => frame.dispatchEvent(new Event('load'))); });
      await page.waitForFunction(() => document.querySelector('.email-review-preview-viewport iframe.is-ready')?.getAttribute('srcdoc').includes('Personalised 3'));
      await page.evaluate(() => window.motionFixture.updateSignature());
      await page.waitForFunction(() => document.querySelector('.email-review-preview-viewport iframe.is-ready')?.getAttribute('srcdoc').includes('Signature revised'));
    }
    await page.screenshot({ path: path.join(output, 'review-light.png') });
    await page.evaluate(() => document.querySelector('.email-review-cancel').click()); await wait(420);
    await click('Open motion authorization'); await page.waitForSelector('.email-security-request'); await click('Send verification code');
    await page.waitForSelector('[aria-label="Verification code"]');
    await fill('Verification code', '000000'); await page.keyboard.press('Enter'); await page.waitForSelector('.email-authorization-local-error');
    assert(await page.$('[aria-label="Verification code"]'), 'Invalid OTP stays in its stage');
    await fill('Verification code', '123456'); await page.keyboard.press('Enter');
    await page.waitForSelector('[aria-label="Send PIN"]'); assert.equal(await page.$('.email-authorization-modal .email-security-hold'), null);
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Send PIN');
    await fill('Send PIN', '246810'); await page.keyboard.press('Enter'); await page.waitForSelector('.email-authorization-modal .email-security-hold'); await wait(420);
    await page.screenshot({ path: path.join(output, 'authorization-light.png') });
    if (baseline) { await click('Cancel', '.email-authorization-modal'); await wait(420); }
    else {
      await page.focus('.email-authorization-modal .email-security-hold'); await page.keyboard.down('Enter'); await wait(1200); await page.keyboard.up('Enter');
      await page.waitForSelector('.email-authorization-modal', { hidden: true });
      metrics.acceptance = await page.evaluate(() => { const m = window.motionFixture.metrics; return { notificationDelayMs: m.acceptedAt - m.commitReturnedAt, sheetExitMs: m.handoffAt - m.acceptedAt }; });
      assert(metrics.acceptance.notificationDelayMs >= 0 && metrics.acceptance.notificationDelayMs < 50, 'Delivery notification never waits for sheet motion');
      assert(metrics.acceptance.sheetExitMs >= 300, 'Sheet cleanup waits for the coordinated exit');
    }
    const holdMetrics = await page.$eval('#motion-hold .email-security-hold', async node => {
      let queries = 0; const native = node.querySelectorAll.bind(node); node.querySelectorAll = (...args) => { queries++; return native(...args); };
      const renders = window.motionFixture.metrics.holdRenders; node.focus(); node.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 500)); const halfway = Number(node.style.getPropertyValue('--hold-progress'));
      node.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true })); await new Promise(resolve => setTimeout(resolve, 240));
      return { queries, renders: window.motionFixture.metrics.holdRenders - renders, halfway, progressAfterRelease: Number(node.style.getPropertyValue('--hold-progress')), commits: window.motionFixture.metrics.holdCommits };
    }); metrics.hold = holdMetrics;
    assert(holdMetrics.halfway > .2 && holdMetrics.halfway < .8); assert.equal(holdMetrics.commits, 0); assert.equal(holdMetrics.progressAfterRelease, 0);
    await page.focus('#motion-hold .email-security-hold'); await page.keyboard.down('Enter'); await wait(1200); await page.keyboard.up('Enter'); assert.equal(await page.evaluate(() => window.motionFixture.metrics.holdCommits), 1);
    for (const width of [390, 768]) { await page.setViewport({ width, height: 900 }); await wait(400); assert(await page.$eval('.delivery-activity-dock', node => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })); }
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    policyMode = 'emailOtp'; await click('Open motion authorization'); await page.waitForSelector('.email-security-request'); await click('Send verification code'); await page.waitForSelector('[aria-label="Verification code"]');
    await fill('Verification code', '123456'); await page.keyboard.press('Enter'); await page.waitForSelector('.email-authorization-modal .email-security-hold'); assert.equal(await page.$('[aria-label="Send PIN"]'), null);
    await page.evaluate(() => document.documentElement.classList.add('dark')); await page.screenshot({ path: path.join(output, 'authorization-mobile-dark-reduced.png') });
    const after = (await cdp.send('Performance.getMetrics')).metrics;
    metrics.browserWorkSeconds = Object.fromEntries(['TaskDuration', 'LayoutDuration', 'ScriptDuration'].map(name => [name, after.find(row => row.name === name).value - before.find(row => row.name === name).value]));
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'metrics.json'), JSON.stringify(metrics, null, 2));
    if (!baseline) { assert.equal(metrics.unchangedSummaryActionRenders, 0); assert.equal(metrics.heartbeatItemRefetches, 0); assert(metrics.dockMidpointWidth > 320 && metrics.dockMidpointWidth < 430); assert(metrics.selection.panelRetained); assert.equal(metrics.selection.firstFrameSelections, 5); assert.equal(metrics.hold.queries, 0); }
    console.log('PASS: email motion, rapid selection, buffered previews, OTP/PIN focus/errors, reduced motion, dock resizing, summary isolation, hold timing/cancellation. ' + path.join(output, 'metrics.json'));
  } catch (error) { if (page) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); throw error; }
  finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

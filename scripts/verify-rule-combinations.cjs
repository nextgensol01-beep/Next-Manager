/* The real synthetic inspector, exercised without a database or email account. */
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto"), http = require("node:http");
const ts = require("typescript"), puppeteer = require("puppeteer-core"), compiledWebpack = require("next/dist/compiled/webpack/webpack");
const root = path.resolve(__dirname, ".."), output = path.join(root, "tmp/rule-combination-tests");
function load(file, dependencies = {}) { return require("./search-test-loader.cjs")(dependencies)(file); }
function verifyUnchangedResults() {
  const conditions = load("lib/server/tracker-conditions.ts");
  const { buildEmailCombinationPreviews } = load("lib/tracker-email-combinations.ts", { "@/lib/server/tracker-conditions": conditions });
  const { fields, cases } = load("scripts/fixtures/rule-combinations-data.ts");
  const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/rule-combinations-baseline.json"), "utf8"));
  for (const [name, workflow] of Object.entries(cases)) {
    const original = JSON.stringify(workflow), result = buildEmailCombinationPreviews(workflow, fields);
    const projected = { previews: result.previews.map(({ id, conditions, points, eligible, subject, body }) => ({ id, conditions, points, eligible, subject, body })), possibleCount: result.possibleCount, limited: result.limited, mode: result.mode };
    assert.equal(result.previews.length, baseline[name].count, `${name}: preview population preserved`);
    assert.equal(result.previews.filter(row => row.eligible).length, baseline[name].matched, `${name}: legacy eligibility preserved`);
    assert.equal(result.possibleCount, baseline[name].possibleCount, `${name}: combination count preserved`);
    // These three fixtures require no corrected fragment interpolation or empty
    // output changes, so their original byte-level snapshots still apply.
    if (["all", "points", "statements"].includes(name)) assert.equal(crypto.createHash("sha256").update(JSON.stringify(projected)).digest("hex"), baseline[name].sha256);
    const active = (workflow.contentRules || []).filter(rule => !workflow.contentMode || rule.type === (workflow.contentMode === 'combinations' ? 'combination' : workflow.contentMode === 'statements' ? 'statement' : 'point')).sort((a, b) => (a.order || 0) - (b.order || 0));
    for (const row of result.previews) {
      const selected = active.find(rule => rule.type === 'combination' && conditions.evaluateTrackerConditionGroup(rule.conditionGroup, row.values));
      assert.equal(row.scenarioId, selected?.id, `${name}: historical scenario priority is preserved`);
      assert.equal(row.selection.matchedStatementIds.length, active.filter(rule => rule.type === 'statement' && conditions.evaluateTrackerConditionGroup(rule.conditionGroup, row.values)).length, `${name}: all matching statements remain selected`);
      if (row.eligible && name === 'legacy') assert(row.body.includes('Point Yes'), 'Legacy fragment column variables now resolve');
    }
    assert.equal(JSON.stringify(workflow), original, "Preview does not mutate unsaved workflow state");
    assert.equal(JSON.stringify(buildEmailCombinationPreviews(workflow, fields)), JSON.stringify(result), "Preview remains deterministic");
  }
  console.log("All 10 legacy preview populations and selection policies preserved; unaffected byte snapshots match, corrected fragment variables resolve, and previews remain deterministic.");
}
async function main() {
  verifyUnchangedResults(); fs.mkdirSync(output, { recursive: true }); compiledWebpack.init();
  await new Promise((resolve, reject) => {
    const compiler = compiledWebpack.webpack({ mode: "development", devtool: false, context: root,
      entry: path.join(__dirname, "fixtures/rule-combinations.tsx"), output: { path: output, filename: "fixture.js" },
      resolve: { extensions: [".tsx", ".ts", ".js"], alias: { "@": root } },
      module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, "fixtures/workflow-editor-loader.cjs") }] },
    });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  const postcss = require("postcss"), tailwind = require("tailwindcss");
  const globals = fs.readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@import .+$/gm, "");
  const built = await postcss([tailwind(path.join(root, "tailwind.config.ts"))]).process(globals, { from: path.join(root, "app/globals.css") });
  const css = built.css + ["components/ui/liquid-glass/liquid-glass.css", "app/client-profile-premium.css"].map(file => fs.readFileSync(path.join(root, file), "utf8")).join("\n") + `
    body { margin: 0; font-family: Arial,sans-serif; background: var(--color-surface); color: var(--color-text); }
    .preview-fixture-controls { padding: 36px; }
    .preview-fixture-controls > button { margin: 5px; padding: 8px 12px; font-size: 12px; border-radius: 9px; background: var(--glass-tint); }
    .preview-fixture-controls h3 { margin-top: 80px; font-size: 24px; }
    .preview-fixture-controls p { margin-bottom: 24px; font-size: 13px; }
  `;
  const server = http.createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "application/javascript; charset=utf-8"); response.end(fs.readFileSync(path.join(output, "fixture.js"))); }
    else if (request.url === "/fixture.css") { response.setHeader("Content-Type", "text/css; charset=utf-8"); response.end(css); }
    else { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    const executablePath = process.env.CHROME_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(file => fs.existsSync(file));
    assert(executablePath, "Set CHROME_PATH to a local Chromium browser");
    browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
    const page = await browser.newPage(), errors = [], apiRequests = [];
    page.on("pageerror", error => { errors.push(error.message); console.error(error.message); });
    page.on("request", request => { if (request.url().includes("/api/")) apiRequests.push(request.url()); });
    await page.setViewport({ width: 1240, height: 960 }); await page.goto(`http://127.0.0.1:${server.address().port}`);
    const dialog = '.rule-preview-dialog', rows = '.rule-preview-list [role="option"]';
    const settled = () => page.evaluate(() => new Promise(resolve => setTimeout(resolve, 450)));
    const clickText = async (selector, text) => { for (const node of await page.$$(selector)) if ((await node.evaluate(node => node.textContent)).trim() === text) { await node.click(); return; } throw Error(`Missing ${text}`); };
    const filter = async text => { const radio = await page.$(`.rule-preview-filters [role="radio"]`); assert(radio); for (const node of await page.$$('.rule-preview-filters [role="radio"]')) if ((await node.evaluate(node => node.textContent)).startsWith(text)) { await node.click(); await settled(); return; } throw Error(`Missing filter ${text}`); };
    const open = async () => { await clickText('.preview-fixture-controls button', "Preview rule combinations"); await page.waitForSelector(dialog); await settled(); };
    const close = async () => { await page.click('.rule-preview-close'); await page.waitForSelector(dialog, { hidden: true }); };
    const profile = async name => { if (await page.$(dialog)) await close(); await clickText('.preview-fixture-controls button', name); await open(); };
    const resultText = () => page.$eval('.rule-preview-result-stage', node => node.textContent);
    const rowCount = () => page.$$(rows).then(nodes => nodes.length);
    await page.waitForSelector('.preview-fixture-controls'); await open();
    assert.equal(await rowCount(), 8, "First open shows all combinations");
    assert.equal(await page.$eval('.rule-preview-filters [role="radio"]', node => node.getAttribute("aria-checked")), "true");
    assert.equal(await page.$eval(`${rows}[aria-selected="true"] .rule-preview-row-number`, node => node.textContent), "01");
    assert.equal(await page.$eval('[role="meter"]', node => node.getAttribute("aria-valuenow")), "3");
    assert.equal(await page.$eval('[role="meter"]', node => node.getAttribute("aria-valuemax")), "8");
    assert((await resultText()).includes("No message is produced for this combination."));
    assert.equal(await page.$$('.rule-preview-mail-sheet').then(nodes => nodes.length), 0, "Unmatched combinations do not display a pretend email");
    const dimensions = await page.$eval(dialog, node => ({ width: node.offsetWidth, height: node.offsetHeight }));
    await (await page.$$(rows))[7].click(); await settled();
    assert((await resultText()).includes("Matched Scenario 1")); assert((await resultText()).includes("AND"));
    assert.equal(await page.$$('.rule-preview-mail-sheet').then(nodes => nodes.length), 1, "One shared email preview");
    assert(!(await page.$eval(dialog, node => node.innerText)).includes("{{"), "Visible preview tokens are semantic labels");
    assert(await page.$eval('.tracker-preview-variable', node => node.getAttribute("aria-label").includes("placeholder")), "Preview tokens have meaningful accessible names");
    assert((await page.$eval('.rule-preview-mail-body', node => node.textContent)).includes("Gmail signature"));
    assert.equal(await page.$eval('.rule-preview-why > button', node => node.getAttribute("aria-expanded")), "false");
    await page.click('.rule-preview-why > button'); await settled();
    assert((await page.$eval('.rule-preview-proof', node => node.textContent)).includes("Lower priority"), "Why explains overlapping rules and priority");
    const selectedBeforeHover = await resultText(); await (await page.$$(rows))[5].hover(); await settled(); assert.equal(await resultText(), selectedBeforeHover, "Hover never changes selection or email");
    await (await page.$$(rows))[5].click(); await settled();
    assert((await resultText()).includes("Matched Scenario 2")); assert((await resultText()).includes("OR"));
    assert.equal(await page.$$('.rule-preview-row-glass').then(nodes => nodes.length), 1, "One shared selection material");
    assert.deepEqual(await page.$eval(dialog, node => ({ width: node.offsetWidth, height: node.offsetHeight })), dimensions, "Selected content does not resize the modal");
    await filter("Matched"); assert.equal(await rowCount(), 3);
    await filter("No match"); assert.equal(await rowCount(), 5);
    assert.equal(await page.$eval(`${rows}[aria-selected="true"] .rule-preview-row-number`, node => node.textContent), "01", "Hidden selection quietly moves to first visible combination");
    assert(!(await resultText()).includes("Both uploads are complete."), "No stale hidden-row email");
    await filter("All"); const first = await page.$(`${rows}[aria-selected="true"]`); await first.focus();
    await page.keyboard.press("ArrowDown"); await settled();
    assert.equal(await page.$eval(`${rows}[aria-selected="true"] .rule-preview-row-number`, node => node.textContent), "02");
    await page.keyboard.press("End"); await settled();
    assert.equal(await page.$eval(`${rows}[aria-selected="true"] .rule-preview-row-number`, node => node.textContent), "08");
    await page.keyboard.press("Space"); await settled(); assert((await resultText()).includes("Matched Scenario 1"));
    await (await page.$('.rule-preview-filters [role="radio"][aria-checked="true"]')).focus(); await page.keyboard.press("ArrowRight"); await settled(); assert.equal(await rowCount(), 3, "Radio filter supports keyboard arrows");
    await page.keyboard.press("Escape"); await page.waitForSelector(dialog, { hidden: true });
    assert.equal(await page.evaluate(() => window.readPreviewFixture().parentOpen), true, "Escape closes only the secondary preview");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Preview rule combinations", "Close returns focus to the trigger");
    assert.equal(await page.$eval('[role="dialog"]', node => node.inert), false, "Parent workspace is interactive again");
    await clickText('.preview-fixture-controls button', "Edit unsaved message"); await open(); await filter("Matched");
    assert((await page.$eval('.rule-preview-mail-subject', node => node.textContent)).includes("Unsaved subject"));
    assert((await page.$eval('.rule-preview-mail-body', node => node.textContent)).includes("Unsaved scenario message."), "Current unsaved message is used");
    await profile("skip"); await (await page.$$(rows))[5].click(); await settled();
    assert((await resultText()).includes("Excluded by Scenario 2")); assert((await resultText()).includes("No message is produced"));
    await profile("none"); await filter("Matched"); assert.equal(await rowCount(), 0); assert((await resultText()).includes("No matching results"));
    await profile("all"); assert((await page.$eval('.rule-preview-coverage', node => node.textContent)).includes("All combinations are covered")); await filter("No match"); assert.equal(await rowCount(), 0);
    await profile("base"); await filter("Matched");
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), dark); await settled();
      await page.screenshot({ path: path.join(output, dark ? "dark-desktop.png" : "light-desktop.png") });
      const sheet = await page.$eval('.rule-preview-mail-sheet', node => getComputedStyle(node).backgroundColor);
      if (dark) assert(!["rgb(255, 255, 255)", "rgba(255, 255, 255, 0.84)"].includes(sheet), "Dark mail sheet is neutral, not pure white");
      await page.setViewport({ width: 390, height: 844 }); await settled();
      assert(await page.$eval(dialog, node => { const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight; }), "Narrow modal stays in viewport");
      assert(await page.$eval('.rule-preview-panes', node => { const a = node.children[0].getBoundingClientRect(), b = node.children[1].getBoundingClientRect(); return b.top >= a.bottom; }), "Narrow panes stack");
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal overflow");
      assert(await page.$eval('.rule-preview-mail-body', node => parseFloat(getComputedStyle(node).fontSize) >= 13), "Email remains readable");
      await page.screenshot({ path: path.join(output, dark ? "dark-mobile.png" : "light-mobile.png") });
      await page.setViewport({ width: 1240, height: 960 });
    }
    await profile("many"); assert.equal(await rowCount(), 32); assert((await page.$eval('.rule-preview-limit', node => node.textContent)).includes("32 of 64"));
    assert.equal(await page.$eval('[role="meter"]', node => node.getAttribute("aria-valuemax")), "32", "Limited coverage uses shown combinations, never claims total coverage");
    const scrollSelector = '.rule-preview-list-frame .rule-preview-scroll';
    assert(await page.$eval(scrollSelector, node => node.scrollHeight > node.clientHeight), "Many combinations scroll internally");
    const bounds = await (await page.$(scrollSelector)).boundingBox(); await page.mouse.move(bounds.x + 30, bounds.y + 70); await page.mouse.wheel({ deltaY: 500 });
    await page.waitForFunction(selector => document.querySelector(selector)?.scrollTop > 0, {}, scrollSelector);
    assert.equal(await page.$eval('.rule-preview-list-frame [role="scrollbar"]', node => node.getAttribute("data-visible")), "true");
    await page.mouse.move(2, 2); await page.waitForFunction(() => document.querySelector('.rule-preview-list-frame [role="scrollbar"]')?.getAttribute("data-visible") === "false");
    await filter("Matched"); await settled();
    assert(await page.$eval('.rule-preview-list [aria-selected="true"]', node => {
      const row = node.getBoundingClientRect(), scroll = node.closest('.rule-preview-scroll').getBoundingClientRect();
      return row.top >= scroll.top && row.bottom <= scroll.bottom;
    }), "Filtering brings the selected combination back into view without moving filter focus");
    assert(await page.$eval('.rule-preview-result .rule-preview-scroll', node => node.scrollHeight > node.clientHeight), "Long email scrolls without increasing modal size");
    await page.screenshot({ path: path.join(output, "dark-many.png") });
    await page.setViewport({ width: 390, height: 600 }); await settled();
    assert(await page.$eval('.rule-preview-detail', node => node.getBoundingClientRect().bottom <= innerHeight), "Short narrow layout keeps the selected result accessible");
    await close(); await page.setViewport({ width: 1240, height: 960 }); await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await clickText('.preview-fixture-controls button', "base"); await open(); await filter("Matched"); assert.equal(await rowCount(), 3);
    await page.click('.rule-preview-close'); await page.waitForSelector(dialog, { hidden: true });
    assert.deepEqual(apiRequests, [], "Synthetic preview never queries clients, creates drafts, or sends email"); assert.deepEqual(errors, [], "No runtime errors");
    console.log("Split view, coverage, filters, keyboard, one email, semantic tokens, why/priority, unsaved changes, excluded/empty states, nested-dialog focus, responsive layout, internal scrolling, and reduced motion passed.");
    console.log(`Visual captures: ${output}`);
  } finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

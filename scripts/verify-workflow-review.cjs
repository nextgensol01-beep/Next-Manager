/* Review uses actual wizard navigation, shared template editing and the existing preview. */
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), http = require("node:http"), vm = require("node:vm"), ts = require("typescript");
const puppeteer = require("puppeteer-core"), compiledWebpack = require("next/dist/compiled/webpack/webpack");
const root = path.resolve(__dirname, ".."), output = path.join(root, "tmp/workflow-review-tests");
function load(file, dependencies = {}) { return require("./search-test-loader.cjs")(dependencies)(file); }
function validationChecks() {
  const data = load("scripts/fixtures/workflow-review-data.ts", { "./rule-combinations-data": load("scripts/fixtures/rule-combinations-data.ts") });
  const validation = load("lib/tracker-email-validation.ts"), baseline = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/workflow-validation-baseline.json"), "utf8"));
  for (const [name, workflow] of Object.entries(data.cases)) {
    const before = JSON.stringify(workflow);
    assert.equal(validation.validateEmailWorkflowDrafts([workflow], data.fields), baseline[name][0], `${name}: original save validation preserved`);
    assert.equal(validation.validateEmailWorkflowDrafts([data.cases.ready, workflow], data.fields), baseline[name][1], `${name}: workflow order and error naming preserved`);
    assert.equal(validation.emailWorkflowValidationIssues(workflow, data.fields)[0]?.message || null, baseline[name][0]);
    assert.equal(JSON.stringify(workflow), before, "Readiness never mutates configuration");
  }
  assert.equal(validation.emailWorkflowValidationIssues(data.cases.incomplete, data.fields).length, 2, "Missing subject and body are both explained");
  assert.equal(validation.emailWorkflowValidationIssues(data.cases.noRules, data.fields).length, 0, "No invented rule-count requirement");
  assert.equal(validation.emailWorkflowValidationIssues(data.cases.optional, data.fields).length, 0, "Optional settings are not blockers");
  assert.equal(validation.emailWorkflowValidationIssues(data.cases.inactive, data.fields)[0].style, "statements", "Inactive draft errors remain discoverable");
  console.log("Original save validation preserved for 23 cases, including second-workflow errors, skip, inactive drafts, legacy content and optional settings.");
}
async function main() {
  validationChecks(); fs.mkdirSync(output, { recursive: true }); compiledWebpack.init();
  await new Promise((resolve, reject) => {
    const compiler = compiledWebpack.webpack({ mode: "development", devtool: false, context: root,
      entry: path.join(__dirname, "fixtures/workflow-review.tsx"), output: { path: output, filename: "fixture.js" },
      resolve: { extensions: [".tsx", ".ts", ".js"], alias: { "@": root } },
      module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, "fixtures/workflow-editor-loader.cjs") }] } });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  const postcss = require("postcss"), tailwind = require("tailwindcss");
  const built = await postcss([tailwind(path.join(root, "tailwind.config.ts"))]).process(fs.readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@import .+$/gm, ""), { from: path.join(root, "app/globals.css") });
  const css = built.css + ["components/ui/liquid-glass/liquid-glass.css", "app/client-profile-premium.css"].map(file => fs.readFileSync(path.join(root, file), "utf8")).join("\n") + `
    body { margin: 0; font-family: Arial,sans-serif; background: var(--color-surface); color: var(--color-text); }
    .fixture-stepper { display: flex; flex-wrap: wrap; gap: 12px; padding: 9px 0; font-size: 11px; }
    .fixture-stepper [aria-current] { color: var(--color-text); text-decoration: underline; }
    .fixture-stepper button { color: var(--color-text-muted); }
    .fixture-description { color: var(--color-text-muted); font-size: 12px; padding: 6px 0 12px; }
    .fixture-edit-step { min-height: 320px; }
  `;
  const server = http.createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "application/javascript; charset=utf-8"); response.end(fs.readFileSync(path.join(output, "fixture.js"))); }
    else if (request.url === "/fixture.css") { response.setHeader("Content-Type", "text/css; charset=utf-8"); response.end(css); }
    else { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox", "--disable-gpu"] });
    const page = await browser.newPage(), errors = [], apiRequests = []; page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (request.url().includes("/api/")) apiRequests.push(request.url()); });
    await page.setViewport({ width: 1200, height: 1000 }); await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForSelector('.workflow-review-workspace');
    const settle = () => page.evaluate(() => new Promise(resolve => setTimeout(resolve, 450)));
    const choose = async name => { await page.evaluate(name => window.reviewFixture.choose(name), name); await settle(); };
    const text = selector => page.$eval(selector, node => node.textContent);
    const read = () => page.evaluate(() => window.reviewFixture.workflow);
    const click = async selector => { await page.focus(selector); await settle(); await page.click(selector); await settle(); };
    const rootSelector = '.workflow-review-workspace', section = name => `[data-review-section="${name}"]`;
    const edit = name => `[aria-label="Edit ${name}"]`;
    await settle();
    assert((await text('.workflow-review-readiness h3')).includes("Ready to save"));
    assert.equal(await page.$$('.workflow-review-section').then(nodes => nodes.length), 4);
    assert.equal(await page.$$('.workflow-review-status').then(nodes => nodes.length), 4);
    assert.equal(await page.$$('.workflow-review-status.is-attention').then(nodes => nodes.length), 0);
    assert((await text(section("audience"))).includes("2 eligibility conditions · Any condition"));
    assert((await text(section("messages"))).includes("Combination style · 1 scenario"));
    assert.equal(await page.$eval('[role=meter]', node => node.getAttribute("aria-valuenow")), "1");
    assert((await text(section("template"))).includes("Client company"));
    assert(!(await text(section("template"))).includes("{{"), "Tokens use human labels");
    assert.equal(await page.$$('.workflow-review-workspace .ProseMirror, .workflow-review-workspace [contenteditable]').then(nodes => nodes.length), 0, "Review mounts no editors");
    assert((await text(section("delivery"))).includes("No blank line"));
    assert((await text(section("delivery"))).includes("Task after 3 days if no reply"));
    assert((await text(section("delivery"))).includes("1 file"));

    const original = await read();
    await click('.workflow-review-preview'); await page.waitForSelector('.rule-preview-dialog'); await settle();
    assert((await text('.rule-preview-header')).includes("Synthetic preview only"), "Uses the existing preview component");
    assert(await page.$eval('.tracker-email-modal', node => node.inert), "Preview owns focus without recreating the editor");
    await page.keyboard.press("Escape"); await page.waitForSelector('.rule-preview-dialog', { hidden: true }); await settle();
    assert.deepEqual(await read(), original, "Preview does not change unsaved data");
    assert(await page.evaluate(() => document.activeElement?.classList.contains("workflow-review-preview")), "Preview restores action focus");

    for (const [name, destination] of [["Audience", 1], ["Messages", 3], ["Template", 4], ["Delivery", 5]]) {
      await click(edit(name)); assert.equal(await page.evaluate(() => window.reviewFixture.page), destination, `${name} uses existing step navigation`);
      assert.deepEqual(await read(), original, "Direct edits preserve all unsaved data");
      await page.evaluate(() => window.reviewFixture.returnToReview()); await settle();
    }
    await click(edit("Template"));
    const subject = '.tracker-rich-text[aria-label="Email subject"]'; await page.click(subject); await page.keyboard.press("Home"); await page.keyboard.type("Updated: ");
    assert((await read()).subject.startsWith("Updated: "));
    await page.evaluate(() => window.reviewFixture.returnToReview()); await settle();
    assert((await text('.workflow-review-subject-preview')).startsWith("Updated: "), "Review immediately reflects shared editor changes");

    await choose("incomplete");
    assert.equal(await text('.workflow-review-readiness h3'), "2 items need attention");
    assert((await text(section("template"))).includes("needs an email subject"));
    assert((await text(section("template"))).includes("needs an email body"));
    assert.equal(await page.$$('.workflow-review-status.is-attention').then(nodes => nodes.length), 1);
    await click('.tracker-email-footer .tracker-modal-primary'); assert((await page.evaluate(() => window.reviewFixture.saveResult)).includes("needs an email subject"), "Save keeps original first-error behavior");
    await choose("inactive"); assert((await text(section("messages"))).includes("Edit the statements draft"));
    await click('.workflow-review-issues .workflow-review-inline-action'); assert.equal(await page.evaluate(() => window.reviewFixture.page), 2, "Inactive drafts have an accessible style-edit destination");
    await choose("name"); await click('.workflow-review-details-issue button'); assert.equal(await page.evaluate(() => window.reviewFixture.page), 0, "Name issue links to workflow details");
    await choose("ready"); await page.evaluate(() => window.reviewFixture.other()); await settle();
    assert.equal(await text('.workflow-review-readiness h3'), "2 items need attention", "Other invalid workflows do not falsely report save readiness");
    await click('.workflow-review-details-issue button'); assert(await page.evaluate(() => window.reviewFixture.library), "Existing workflow-library action is reused");

    await choose("partialCoverage");
    assert.equal(await page.$eval('[role=meter]', node => node.getAttribute("aria-valuenow")), "3");
    assert.equal(await page.$eval('[role=meter]', node => node.getAttribute("aria-valuemax")), "8");
    assert((await text('.workflow-review-coverage')).includes("no matching scenario"));
    assert.equal(await text('.workflow-review-readiness h3'), "Ready to save", "Coverage is not a new blocker");
    await choose("limited"); assert((await text('.workflow-review-coverage')).includes("First 32 of 64"), "Coverage never claims complete results beyond the existing cap");
    for (const style of ["points", "statements", "legacy", "noRules"]) {
      await choose(style); assert.equal(await page.$$('.workflow-review-coverage, .workflow-review-preview').then(nodes => nodes.length), 0, "Coverage belongs only to combinations");
      assert.equal(await text('.workflow-review-readiness h3'), "Ready to save");
    }
    await choose("optional"); assert((await text(section("delivery"))).includes("Off")); assert((await text(section("delivery"))).includes("None"));
    await choose("ready"); await page.evaluate(() => window.reviewFixture.patch({ body: '<p>Dear {{client.companyName}},</p><script>window.reviewInjected=true</script><img src=x onerror="window.reviewInjected=true"><p>Update &amp; details.</p>' })); await settle();
    assert.equal(await page.evaluate(() => window.reviewInjected), undefined, "Preview is safe text, not arbitrary HTML");
    assert.equal(await page.$$('.workflow-review-template script, .workflow-review-template img').then(nodes => nodes.length), 0);
    assert((await text('.workflow-review-body-preview')).includes("Update & details."));
    await page.evaluate(() => window.reviewFixture.patch({ body: Array.from({ length: 100 }, () => '<p>Supporting documents for {{tracker.financialYear}}.</p>').join('') })); await settle();
    assert((await text('.workflow-review-body-preview')).length < 400, "Body snippet stays compact");

    for (const dark of [false, true]) for (const mobile of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), dark);
      await page.setViewport(mobile ? { width: 390, height: 844 } : { width: 1200, height: 1000 }); await choose("ready");
      const prefix = `${dark ? "dark" : "light"}-${mobile ? "mobile" : "desktop"}`;
      await page.evaluate(() => { document.activeElement?.blur(); document.querySelector('.tracker-email-content-scroll').scrollTop = 0; }); await page.mouse.move(0, 0); await settle();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal overflow");
      assert(await page.$eval('.workflow-review-workspace', node => node.getBoundingClientRect().width <= 860), "Width matches Template and Delivery");
      await page.screenshot({ path: path.join(output, `${prefix}-top.png`) });
      await page.$eval('.tracker-email-content-scroll', node => { node.scrollTop = node.scrollHeight; }); await settle();
      await page.screenshot({ path: path.join(output, `${prefix}-bottom.png`) });
      await choose("incomplete"); await page.$eval('.tracker-email-content-scroll', node => { node.scrollTop = 0; }); await settle(); await page.screenshot({ path: path.join(output, `${prefix}-attention.png`) });
    }
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]); await choose("ready");
    assert(await page.$eval('.workflow-review-section', node => getComputedStyle(node).filter === "none" || getComputedStyle(node).filter === "blur(0px)"));
    await page.focus(edit("Template")); await page.keyboard.press("Enter"); await settle(); assert.equal(await page.evaluate(() => window.reviewFixture.page), 4, "Edit works using the keyboard");
    assert.deepEqual(errors, [], "No runtime errors"); assert.deepEqual(apiRequests, [], "Review never saves automatically or contacts live client APIs");
    console.log("Review readiness, mode-specific summaries, coverage limits, semantic safe snippets, direct editing, live updates, existing preview and Save behavior passed.");
    console.log("Light/dark desktop/mobile, keyboard and reduced-motion checks passed."); console.log(`Visual captures: ${output}`);
  } finally {
    if (browser) { const cleanup = setTimeout(() => browser.process()?.kill(), 15000); try { await browser.close(); } finally { clearTimeout(cleanup); } }
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

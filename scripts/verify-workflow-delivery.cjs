/* Real Delivery controls in a local browser fixture; no live email, storage or task creation. */
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const puppeteer = require("puppeteer-core"), compiledWebpack = require("next/dist/compiled/webpack/webpack");
const root = path.resolve(__dirname, ".."), output = path.join(root, "tmp/workflow-delivery-tests");
async function main() {
  fs.mkdirSync(output, { recursive: true }); compiledWebpack.init();
  await new Promise((resolve, reject) => {
    const compiler = compiledWebpack.webpack({ mode: "development", devtool: false, context: root,
      entry: path.join(__dirname, "fixtures/workflow-delivery.tsx"), output: { path: output, filename: "fixture.js" },
      resolve: { extensions: [".tsx", ".ts", ".js"], alias: { "@": root } },
      module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, "fixtures/workflow-editor-loader.cjs") }] } });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  const postcss = require("postcss"), tailwind = require("tailwindcss");
  const built = await postcss([tailwind(path.join(root, "tailwind.config.ts"))]).process(fs.readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@import .+$/gm, ""), { from: path.join(root, "app/globals.css") });
  const css = built.css + ["components/ui/liquid-glass/liquid-glass.css", "app/client-profile-premium.css"].map(file => fs.readFileSync(path.join(root, file), "utf8")).join("\n") + `
    body { background: var(--color-surface); color: var(--color-text); margin: 0; font-family: Arial,sans-serif; }
    .fixture-tools { display: flex; gap: 16px; padding: 16px 24px; flex-wrap: wrap; font-size: 12px; }
    main.tracker-email-modal.is-workflow-editing { position: static; width: min(1100px,100%); min-width: 0; margin: 0 auto; padding: 28px; background: var(--color-card); box-shadow: none; }
    @media(max-width:560px) { main.tracker-email-modal.is-workflow-editing { padding: 22px 18px; } }
  `;
  const server = http.createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "application/javascript; charset=utf-8"); response.end(fs.readFileSync(path.join(output, "fixture.js"))); }
    else if (request.url === "/fixture.css") { response.setHeader("Content-Type", "text/css; charset=utf-8"); response.end(css); }
    else { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox", "--disable-gpu"] });
    const page = await browser.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.setViewport({ width: 1200, height: 920 }); await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForSelector('.workflow-delivery-workspace');
    const settle = () => page.evaluate(() => new Promise(resolve => setTimeout(resolve, 460)));
    const state = () => page.evaluate(() => window.readWorkflow());
    const button = async text => { for (const item of await page.$$("button")) if ((await item.evaluate(node => node.textContent)).trim() === text) { await item.click(); return; } throw Error(`Missing button ${text}`); };
    const reset = async () => { await button("Reset"); await settle(); };
    const shortcut = async key => { await page.keyboard.down("Control"); await page.keyboard.press(key); await page.keyboard.up("Control"); };
    const select = async (label, text) => {
      await page.click(`[role=combobox][aria-label="${label}"]`); await page.waitForSelector('.condition-select-menu [role=option]');
      for (const item of await page.$$('.condition-select-menu [role=option]')) if ((await item.evaluate(node => node.textContent)).trim() === text) { await item.click(); await page.waitForSelector('.condition-select-menu', { hidden: true }); return; }
      throw Error(`Missing ${label} option ${text}`);
    };
    const fill = async (selector, text) => { await page.click(selector); await shortcut("a"); await page.keyboard.type(text); };
    const reminderSubject = '.delivery-panel[aria-hidden=false] .tracker-rich-text[aria-label="Reminder subject"]';
    const reminderBody = '.delivery-panel[aria-hidden=false] .tracker-rich-text[aria-label="Reminder email body"]';
    const toggle = '[role=switch][aria-label="Create a no-reply follow-up task"]';

    if (!process.argv.includes("--scroll-only")) {
    assert.equal(await page.$eval(toggle, node => node.getAttribute("aria-checked")), "false");
    assert.equal(await page.$$('.delivery-spacing [role=radio]').then(nodes => nodes.length), 7, "All existing signature values are retained");
    assert.equal(await page.$eval('.delivery-spacing [aria-checked=true]', node => node.dataset.gap), "2", "Signature default is unchanged");
    assert.equal(await page.$$('.delivery-panel[aria-hidden=false]').then(nodes => nodes.length), 0, "Optional controls start folded");
    assert(await page.$('.delivery-no-files'));
    await page.click('[role=combobox][aria-label="Send to"]'); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
    assert.equal((await state()).recipientStrategy, "primary", "Recipient menu keyboard selection preserves values");
    await select("Send to", "All linked contacts"); assert.equal((await state()).recipientStrategy, "all");
    await select("Send to", "Review each client before delivery"); assert.equal((await state()).recipientStrategy, "per_client");
    await select("Send to", "Client-profile selected email"); assert.equal((await state()).recipientStrategy, "selected");
    await page.click('[role=combobox][aria-label="Send to"]'); await page.keyboard.press("Escape");
    await page.waitForSelector('.condition-select-menu', { hidden: true });
    assert.equal(await page.$eval('[role=combobox][aria-label="Send to"]', node => node.getAttribute("aria-expanded")), "false");
    await page.click('.delivery-spacing [data-gap="6"]'); assert.equal((await state()).signatureGap, 6);
    await page.keyboard.press("ArrowRight"); assert.equal((await state()).signatureGap, 0, "Spacing keyboard wraps all seven values");
    await page.keyboard.press("ArrowLeft"); assert.equal((await state()).signatureGap, 6);
    await page.keyboard.press("Home"); assert.equal((await state()).signatureGap, 0);
    await page.keyboard.press("End"); assert.equal((await state()).signatureGap, 6);

    await page.click('[aria-label="Configure reminder email"]'); await settle();
    assert(await page.$eval(reminderSubject, node => node.textContent === "" && !!node.querySelector('p.is-editor-empty')), "Empty reminder subject has a decorative placeholder and no hidden newline");
    await button("Copy initial email");
    await page.waitForFunction(() => window.readWorkflow().reminderSubject === window.readWorkflow().subject);
    assert.equal((await state()).reminderBody, (await state()).body, "Copy initial email preserves exact subject/body values");
    assert.equal(await page.$eval(reminderSubject, node => node.querySelectorAll('.tracker-editor-variable').length), 1, "Reminder subject shares semantic variable architecture");
    await page.click(reminderSubject); await page.keyboard.press("Home"); await page.keyboard.type("Follow-up: ");
    assert((await state()).reminderSubject.startsWith("Follow-up: Documents"));
    await page.click(reminderBody); await page.keyboard.press("End"); await page.keyboard.type(" Reminder.");
    const reminder = await state();
    await page.$eval(reminderBody, node => { window.reminderEditorIdentity = node; });
    await page.click('[aria-label="Close reminder configuration"]'); await settle();
    assert.equal((await state()).reminderBody, reminder.reminderBody, "Folding reminder preserves its configured content");
    await page.click('[aria-label="Configure reminder email"]'); await settle();
    assert(await page.$eval(reminderBody, node => node === window.reminderEditorIdentity), "Reminder editor stays mounted through collapse");
    await page.click(reminderBody); await shortcut("z"); assert(!(await state()).reminderBody.includes("Reminder."), "Reminder undo history survives collapse");

    await page.click(toggle); await settle(); assert.deepEqual((await state()).followUp, { enabled: true, daysAfter: 3 }, "Follow-up defaults match original behavior");
    await fill('input[aria-label="Follow up after, days"]', "5");
    await fill('input[placeholder="Owner email"]', "owner@example.com");
    assert.equal((await state()).followUp.daysAfter, 5); assert.equal((await state()).followUp.ownerEmail, "owner@example.com");
    await page.click(toggle); await settle(); assert.equal((await state()).followUp.enabled, false);
    assert.equal((await state()).followUp.daysAfter, 5); assert.equal((await state()).followUp.ownerEmail, "owner@example.com", "Disabling preserves follow-up config");
    await page.focus(toggle); await page.keyboard.press("Space"); await settle(); assert.equal((await state()).followUp.enabled, true, "Switch works with keyboard");

    await button("Add files"); await settle();
    assert.deepEqual((await state()).attachments[0], { id: "attachment-1", source: "client_latest", category: "certificates", documentKind: "general", financialYear: "tracker" }, "Attachment defaults are unchanged");
    await select("Attachment 1 category", "Financial"); await select("Attachment 1 document type", "EPR certificate"); await select("Attachment 1 financial year", "Any financial year");
    await page.click('.delivery-condition-toggle input'); await select("Attachment 1 condition value", "Yes");
    assert.deepEqual((await state()).attachments[0].conditionGroup, { mode: "ALL", conditions: [{ fieldKey: "done", operator: "equals", value: "Yes" }] });
    await select("Attachment 1 condition operator", "is empty"); assert(await page.$('.delivery-no-value'), "No-value operators hide the value field");
    await select("Attachment 1 condition column", "Client note");
    assert.deepEqual((await state()).attachments[0].conditionGroup.conditions[0], { fieldKey: "note", operator: "equals", value: "" }, "Changing column resets condition operator/value exactly as before");
    await select("Attachment 1 condition operator", "contains"); await fill('input[placeholder="Value"]', "urgent");
    assert.equal((await state()).attachments[0].conditionGroup.conditions[0].value, "urgent");
    await page.click('.delivery-condition-toggle input'); assert.equal((await state()).attachments[0].conditionGroup, undefined);
    await select("Attachment 1 type", "One shared document for every client"); assert.equal((await state()).attachments[0].documentId, undefined);
    await select("Attachment 1 shared document", "Purchase-data.xlsx · C002");
    assert.equal(await page.$eval('.delivery-file-copy strong', node => node.textContent), "Purchase-data.xlsx");
    assert((await page.$eval('.delivery-file-copy > span', node => node.textContent)).includes("1.2 MB"), "Managed file name and actual size are visible");
    await select("Attachment 1 shared document", "Large-report.pdf · C003"); assert(await page.$('.delivery-file-error[role=alert]'), "Known oversize file shows inline error");
    await select("Attachment 1 shared document", "Invoice-format.pdf · C001"); assert.equal(await page.$$('.delivery-file-error').then(nodes => nodes.length), 0);
    await button("Toggle documents"); assert(await page.$('.delivery-file-warning'), "Empty managed-document list retains warning"); await button("Toggle documents");
    await button("Add files"); await button("Add files"); await button("Add files"); await settle();
    assert.equal((await state()).attachments.length, 4); assert(await page.$eval('.delivery-add', node => node.disabled), "Original four-file limit is retained");
    const saved = await state(); await button("Save"); await button("Reset"); await button("Reopen"); await settle(); assert.deepEqual(await state(), saved, "Delivery state round-trips without new schema fields");
    await button("Toggle step"); await button("Toggle step"); await settle(); assert.deepEqual(await state(), saved, "Step navigation keeps config");
    const remainingIds = saved.attachments.slice(1).map(item => item.id); await page.click('[aria-label="Remove attachment 1"]'); await settle();
    assert.deepEqual((await state()).attachments.map(item => item.id), remainingIds, "Remove keeps other attachment identities");

    for (const dark of [false, true]) {
      const prefix = dark ? "dark" : "light"; await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), dark);
      await page.setViewport({ width: 1200, height: 920 }); await reset();
      await page.screenshot({ path: path.join(output, `${prefix}-desktop.png`), fullPage: true });
      await page.click('[role=combobox][aria-label="Send to"]'); await settle();
      assert(await page.$eval('.condition-select-menu', node => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), "Recipient popup is within viewport");
      await page.screenshot({ path: path.join(output, `${prefix}-recipient.png`) }); await page.keyboard.press("Escape");
      await page.click('[aria-label="Configure reminder email"]'); await settle(); await button("Copy initial email"); await page.click(toggle); await button("Add files"); await settle();
      await page.screenshot({ path: path.join(output, `${prefix}-expanded.png`), fullPage: true });
      await page.setViewport({ width: 390, height: 844 }); await reset();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Mobile default has no horizontal overflow");
      await page.screenshot({ path: path.join(output, `${prefix}-mobile.png`), fullPage: true });
      await page.click('[role=combobox][aria-label="Send to"]'); await settle();
      assert(await page.$eval('.condition-select-menu', node => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), "Mobile recipient popup remains visible"); await page.keyboard.press("Escape");
      await page.click(toggle); await button("Add files"); await settle(); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Mobile expanded controls have no horizontal overflow");
      await page.screenshot({ path: path.join(output, `${prefix}-mobile-expanded.png`), fullPage: true });
    }
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]); await reset(); await page.click(toggle); await settle();
    assert.equal((await state()).followUp.enabled, true); assert.equal(await page.$eval('.delivery-after', node => node.getAnimations().length), 0, "Reduced motion removes entry travel");
    }
    await page.emulateMediaFeatures([]);
    await page.setViewport({ width: 1200, height: 760 });
    await page.goto(`http://127.0.0.1:${server.address().port}/?modal`); await page.waitForSelector('.workflow-delivery-workspace'); await settle();
    await page.$eval('[aria-label="Configure reminder email"]', node => node.click()); await settle(); await page.$eval(toggle, node => node.click()); await settle();
    await fill('input[placeholder="Owner email"]', "owner@example.com"); await settle();
    const scroll = () => page.$eval('.tracker-email-content-scroll', node => node.scrollTop);
    const beforeBlur = await scroll();
    assert(beforeBlur > 150, "Owner field is reached below the start of the form");
    await page.$eval('.delivery-followup-fields', node => {
      const r = node.getBoundingClientRect(); window.blurPoint = { x: r.left + 165, y: r.top + 35 };
    });
    const point = await page.evaluate(() => window.blurPoint); await page.mouse.click(point.x, point.y); await settle();
    assert(Math.abs(await scroll() - beforeBlur) < 3, "Clicking blank form space after editing keeps scroll position");
    assert(await page.evaluate(() => !document.activeElement?.classList.contains("tracker-email-editor-step")), "Blank-space clicks do not focus the whole step");
    await page.$eval('[aria-label="Close reminder configuration"]', node => node.click()); await settle();
    await page.click('input[placeholder="Owner email"]'); await settle();
    const foldedBlur = await scroll();
    await page.$eval('.delivery-followup-fields', node => { const r = node.getBoundingClientRect(); window.blurPoint = { x: r.left + 165, y: r.top + 35 }; });
    const foldedPoint = await page.evaluate(() => window.blurPoint); await page.mouse.click(foldedPoint.x, foldedPoint.y); await settle();
    assert(Math.abs(await scroll() - foldedBlur) < 3, "Clicking outside an input in the shorter form also preserves scroll");
    await page.click('input[placeholder="Owner email"]'); await settle();
    const outsideBlur = await scroll();
    const outsidePoint = await page.$eval('.tracker-email-content-scroll', node => { const r = node.getBoundingClientRect(); return { x: r.left + 7, y: r.top + r.height * .65 }; });
    await page.mouse.click(outsidePoint.x, outsidePoint.y); await settle();
    assert(Math.abs(await scroll() - outsideBlur) < 3, "Clicking the form margin preserves scroll");
    await page.setViewport({ width: 1200, height: 1100 }); await settle();
    await page.click('input[placeholder="Owner email"]'); await settle();
    const tallBlur = await scroll();
    await page.$eval('.delivery-followup-fields', node => { const r = node.getBoundingClientRect(); window.blurPoint = { x: r.left + 165, y: r.top + 35 }; });
    const tallPoint = await page.evaluate(() => window.blurPoint); await page.mouse.click(tallPoint.x, tallPoint.y); await settle();
    assert(Math.abs(await scroll() - tallBlur) < 3, "Blur does not scroll a step that fits inside the viewport");
    await page.setViewport({ width: 1200, height: 760 }); await settle();
    await page.click('input[placeholder="Owner email"]'); await settle();
    const editingScroll = await scroll(); await page.keyboard.type(".uk"); await settle();
    assert(Math.abs(await scroll() - editingScroll) < 3, "Parent updates and callback changes do not reset scroll while typing");
    assert((await state()).followUp.ownerEmail.endsWith(".uk"), "Input changes are retained in the modal");
    await page.focus('.delivery-add'); await button("Add files"); await settle();
    await page.click('[role=combobox][aria-label="Attachment 1 category"]'); await settle();
    const menuScroll = await scroll(); await page.keyboard.press("End"); await settle();
    assert(Math.abs(await scroll() - menuScroll) < 3, "Dropdown keyboard scrolling stays inside the popup");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => { const menu = document.querySelector('.condition-select-menu'); return !menu || menu.inert && getComputedStyle(menu).pointerEvents === 'none'; });
    await page.waitForSelector('.condition-select-menu', { hidden: true });
    await page.evaluate(() => window.navigateStage(4)); await settle();
    assert(await page.evaluate(() => document.activeElement?.classList.contains("tracker-email-editor-step")), "Keyboard step entry still focuses the new content");
    await page.click('input[placeholder="Owner email"]'); await settle();
    assert.equal(await page.$eval('.tracker-email-editor-step', node => node.hasAttribute("tabindex")), false, "Entry focus target is removed after the user enters a field");
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), dark);
      await page.setViewport({ width: 390, height: 844 }); await settle();
      await page.click('input[placeholder="Owner email"]'); await settle();
      const mobileScroll = await scroll();
      const mobilePoint = await page.$eval('.delivery-followup-fields', node => { const r = node.getBoundingClientRect(); return { x: r.left + r.width - 4, y: r.top + 71 }; });
      await page.mouse.click(mobilePoint.x, mobilePoint.y); await settle();
      assert(Math.abs(await scroll() - mobileScroll) < 3, "Mobile input blur preserves scroll in both themes");
      await page.screenshot({ path: path.join(output, `${dark ? "dark" : "light"}-modal.png`) });
    }
    assert.deepEqual(errors, [], "No browser runtime errors");
    console.log("Delivery recipient and signature keyboard controls, reminder history, follow-up retention, attachment fields/conditions, limits, save/reopen and navigation passed.");
    console.log("Light/dark desktop/mobile, floating menus, expanded layouts and reduced motion passed."); console.log(`Visual captures: ${output}`);
    console.log("Full modal input blur, parent updates, margin clicks, dropdown scrolling, exit interaction and keyboard entry passed.");
  } finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

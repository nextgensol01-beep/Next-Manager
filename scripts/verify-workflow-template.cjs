/* Browser coverage of the real Template workspace; no authentication or email sending. */
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const puppeteer = require("puppeteer-core"), compiledWebpack = require("next/dist/compiled/webpack/webpack");
const root = path.resolve(__dirname, ".."), output = path.join(root, "tmp/workflow-template-tests");
const subject = '.workflow-template-subject .tracker-rich-text[contenteditable="true"]';
const body = '.workflow-template-body .tracker-rich-text[contenteditable="true"]';
async function main() {
  fs.mkdirSync(output, { recursive: true }); compiledWebpack.init();
  await new Promise((resolve, reject) => {
    const compiler = compiledWebpack.webpack({ mode: "development", devtool: false, context: root,
      entry: path.join(__dirname, "fixtures/workflow-template.tsx"), output: { path: output, filename: "fixture.js" },
      resolve: { extensions: [".tsx", ".ts", ".js"], alias: { "@": root } },
      module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, "fixtures/workflow-editor-loader.cjs") }] } });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  const postcss = require("postcss"), tailwind = require("tailwindcss");
  const globals = fs.readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@import .+$/gm, "");
  const built = await postcss([tailwind(path.join(root, "tailwind.config.ts"))]).process(globals, { from: path.join(root, "app/globals.css") });
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
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox", "--disable-gpu"] });
    const page = await browser.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message)); await page.setViewport({ width: 1100, height: 870 });
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForSelector(subject);
    const button = async name => {
      for (const item of await page.$$("button")) if ((await item.evaluate(node => node.textContent)).trim() === name) { await item.click(); return; }
      throw Error(`Missing button ${name}`);
    };
    const settle = () => page.evaluate(() => new Promise(resolve => setTimeout(resolve, 380)));
    const reset = async () => { await button("Reset"); await page.waitForFunction(() => window.readTemplate().subject.startsWith("Quarterly")); await settle(); };
    const state = () => page.evaluate(() => window.readTemplate());
    const shortcut = async (key, shift = false) => { await page.keyboard.down("Control"); if (shift) await page.keyboard.down("Shift"); await page.keyboard.press(key); if (shift) await page.keyboard.up("Shift"); await page.keyboard.up("Control"); };
    const range = async (selector, needle, start = 0, end = start) => {
      // A real click establishes focus; ProseMirror intentionally restores its
      // saved selection after programmatic focus at document position zero.
      await page.click(selector);
      await page.$eval(selector, (node, needle, start, end) => {
        node.focus({ preventScroll: true }); const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT); let target;
        while (target = walker.nextNode()) if (target.textContent.includes(needle)) break;
        if (!target) throw Error(`Missing text ${needle}`);
        const offset = target.textContent.indexOf(needle), selection = getSelection(), range = document.createRange();
        range.setStart(target, offset + start); range.setEnd(target, offset + end); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event("selectionchange"));
      }, needle, start, end); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    const paste = async (plain, html = "") => page.$eval(subject, (node, plain, html) => {
      const data = new DataTransfer(); if (plain) data.setData("text/plain", plain); if (html) data.setData("text/html", html);
      node.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }, plain, html);
    const insertVariable = async name => {
      await page.click('.workflow-template-subject .workflow-variables-trigger'); await page.waitForSelector('.workflow-variable-palette:popover-open');
      await page.type('.workflow-variable-palette:popover-open input', name); await button(name);
      assert(await page.$eval(subject, node => document.activeElement === node), "Variable insertion restores subject focus");
    };

    assert.equal(await page.$eval(subject, node => node.getAttribute("aria-multiline")), "false");
    assert.equal(await page.$eval(subject, node => node.querySelectorAll(".tracker-editor-variable").length), 2);
    assert(!(await page.$eval(subject, node => node.textContent)).includes("{{"), "Subject shows semantic labels");
    await range(subject, "update"); await page.keyboard.type("fresh ");
    assert((await state()).subject.startsWith("Quarterly fresh update for {{client.companyName}}"), "Typing in the middle preserves caret and plain token serialization");
    await range(subject, "Quarterly", 0, 9); await page.keyboard.type("Monthly");
    assert((await state()).subject.startsWith("Monthly fresh update"), "Selection replacement stays at selection");
    await range(subject, "update"); await paste("A\nB\r\nC");
    assert((await state()).subject.includes("A B Cupdate"), "Pasted newlines flatten into a single subject line");
    assert.equal(await page.$eval(subject, node => node.querySelectorAll("p").length), 1);
    await page.keyboard.press("Enter"); await page.keyboard.down("Shift"); await page.keyboard.press("Enter"); await page.keyboard.up("Shift");
    assert.equal(await page.$eval(subject, node => node.querySelectorAll("p").length), 1, "Enter never adds a subject paragraph");
    await range(subject, "update", 0, 6); await insertVariable("Category");
    assert((await state()).subject.includes("{{client.category}}"), "Palette replaces selected text with original variable identity");
    await page.keyboard.press("Backspace"); assert(!(await state()).subject.includes("{{client.category}}"), "Backspace removes one atomic variable");
    await shortcut("z"); assert((await state()).subject.includes("{{client.category}}"), "Undo restores deleted variable");
    await shortcut("z", true); assert(!(await state()).subject.includes("{{client.category}}"), "Redo deletes it atomically");
    await insertVariable("Category"); await page.keyboard.press("ArrowLeft"); await page.keyboard.press("Delete");
    assert(!(await state()).subject.includes("{{client.category}}"), "Forward Delete removes adjacent variable");
    await reset(); await range(subject, "update"); await paste("", '<p><strong>X</strong><span data-email-variable="{{client.category}}">Untrusted label</span></p><p>Y</p>');
    assert((await state()).subject.includes("X{{client.category}} Yupdate"), "HTML-only paste preserves token identity, flattens paragraphs, and removes formatting");
    assert(!(await page.$eval(subject, node => node.innerHTML)).includes("<strong>"));
    await reset();
    const copied = await page.$eval(subject, node => {
      const view = node.editor.view, token = node.querySelector(".tracker-editor-variable"), pos = view.posAtDOM(token, 0);
      node.focus(); view.dispatch(view.state.tr.setSelection(view.state.selection.constructor.create(view.state.doc, pos, pos + 1)));
      const data = new DataTransfer(); node.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }));
      return { plain: data.getData("text/plain"), html: data.getData("text/html") };
    });
    assert.equal(copied.plain, "{{client.companyName}}", "Clipboard plain text contains underlying variable syntax");
    await range(subject, "update"); await paste(copied.plain, copied.html);
    assert.equal(await page.$eval(subject, node => node.querySelectorAll(".tracker-editor-variable").length), 3, "Copied atom pastes as an atom");
    const saved = await state(); await button("Save"); await button("Empty"); await button("Reopen"); await page.waitForSelector(subject);
    assert.deepEqual(await state(), saved, "Subject and body round-trip through save/reopen");
    await button("Toggle step"); await button("Toggle step"); await page.waitForSelector(subject);
    assert.deepEqual(await state(), saved, "Step navigation preserves edited content");

    await reset(); const cdp = await page.createCDPSession(); await range(subject, "update");
    await cdp.send("Input.imeSetComposition", { text: "日本", selectionStart: 2, selectionEnd: 2 });
    assert(!(await state()).subject.includes("日本"), "Composition remains local while IME is active");
    await cdp.send("Input.insertText", { text: "日本語" }); await page.waitForFunction(() => window.readTemplate().subject.includes("日本語"));
    assert((await state()).subject.includes("日本語update"), "Committed IME text stays at the original caret");

    await reset(); await button("Request purchase invoices");
    assert.equal((await state()).subject, "Purchase invoices required for {{tracker.financialYear}}", "Preset keeps original immediate data update");
    assert(await page.$('.workflow-template-previous'), "Preset visually crossfades an inert previous snapshot");
    assert.equal(await page.$$eval('.tracker-rich-text[contenteditable=true]', nodes => nodes.length), 2, "Preset transition keeps exactly two live editors");
    await page.waitForFunction(() => !document.querySelector('.workflow-template-previous'));
    const liveIdentity = await page.$eval(subject, node => { window.subjectEditorIdentity = node; return true; }); assert(liveIdentity);
    await button("Annual return follow-up"); await settle();
    assert(await page.$eval(subject, node => node === window.subjectEditorIdentity), "Preset never remounts the editor");
    assert.equal(await page.$eval('.workflow-template-preset[aria-pressed=true]', node => node.textContent), "Annual return follow-up");
    await range(subject, "Annual"); await page.keyboard.type("Custom ");
    assert.equal(await page.$$('.workflow-template-preset[aria-pressed=true]').then(items => items.length), 0, "Manual edits clear exact-match preset selection");
    await button("Request sale invoices");
    assert.equal(await page.$$('.workflow-template-previous').then(items => items.length), 0, "Preset skips decorative replacement when user was editing");
    await range(body, "Dear"); await page.keyboard.type("Hello ");
    assert((await state()).body.includes("Hello Dear"), `Body remains editable after preset application: ${JSON.stringify(await state())}`);
    await reset(); await page.evaluate(() => window.loadTemplate({ subject: 'Report <draft> & {{client.companyName}}', body: '' }));
    await page.waitForFunction(selector => document.querySelector(selector)?.textContent.includes("<draft>"), {}, subject);
    await range(subject, "Report"); await page.keyboard.type("New "); assert((await state()).subject.startsWith("New Report <draft> & "), "Subject preserves literal angle brackets and ampersands");
    await button("Empty"); await page.waitForSelector(`${body} p.is-editor-empty`); await page.click(body);
    assert(await page.$eval(subject, node => node.textContent === "" && !!node.querySelector('p.is-editor-empty')), "Empty subject is truly empty with a decorative placeholder");
    assert.equal(await page.$eval(`${body} p`, node => node.dataset.placeholder), "Write the shared email content…");
    assert(await page.$eval(body, node => node.textContent === "" && node.editor.state.selection.from === 1), "Empty placeholder does not occupy a document position");

    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), dark); await page.setViewport({ width: 1100, height: 870 });
      await reset(); await button("Request purchase invoices"); await settle(); await page.click('.workflow-template-intro h3');
      await page.screenshot({ path: path.join(output, `${dark ? "dark" : "light"}-desktop.png`) });
      await page.click(subject); await settle(); await page.screenshot({ path: path.join(output, `${dark ? "dark" : "light"}-subject.png`) });
      await page.click(body); await settle(); await page.screenshot({ path: path.join(output, `${dark ? "dark" : "light"}-body.png`) });
      await page.click('.workflow-template-body .workflow-variables-trigger'); await settle();
      await page.screenshot({ path: path.join(output, `${dark ? "dark" : "light"}-palette.png`) }); await page.keyboard.press("Escape");
      await page.setViewport({ width: 390, height: 844 }); await settle();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Mobile has no horizontal overflow");
      assert(await page.$$eval('.workflow-template-preset', nodes => nodes.some(node => node.offsetTop > nodes[0].offsetTop)), "Mobile presets wrap");
      await page.click('.workflow-template-intro h3'); await page.screenshot({ path: path.join(output, `${dark ? "dark" : "light"}-mobile.png`), fullPage: true });
      await page.click('.workflow-template-subject .workflow-variables-trigger'); await settle();
      assert(await page.$eval('.workflow-variable-palette:popover-open', node => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), "Subject palette stays in mobile viewport");
      await page.keyboard.press("Escape");
    }
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]); await reset(); await button("Request purchase invoices");
    assert.equal(await page.$$('.workflow-template-previous').then(items => items.length), 0, "Reduced motion removes replacement travel/blur");
    assert.deepEqual(errors, [], "No browser runtime errors");
    console.log("Template subject: caret, selection, paste, atomic variables, copy, undo/redo, IME, save/reopen and step navigation passed.");
    console.log("Preset transitions, stable editor instances, manual edits, placeholders, light/dark desktop/mobile and reduced motion passed.");
    console.log(`Visual captures: ${output}`);
  } finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

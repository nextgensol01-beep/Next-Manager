/* Browser regression tests for the actual shared editor and Messages workspace.
   No database, authentication, workflow save, or outbound email is used. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const puppeteer = require("puppeteer-core");
const compiledWebpack = require("next/dist/compiled/webpack/webpack");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "tmp/workflow-editor-tests");
const editor = '.workflow-message-surface:first-child .tracker-rich-text';
const toolbar = '.workflow-message-surface:first-child .tracker-rich-text-toolbar';

async function main() {
  fs.mkdirSync(output, { recursive: true });
  compiledWebpack.init();
  await new Promise((resolve, reject) => {
    const compiler = compiledWebpack.webpack({
      mode: "development", devtool: false, context: root,
      entry: path.join(__dirname, "fixtures/workflow-editor.tsx"),
      output: { path: output, filename: "fixture.js" },
      resolve: { extensions: [".tsx", ".ts", ".js"], alias: { "@": root } },
      module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, "fixtures/workflow-editor-loader.cjs") }] },
    });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  const postcss = require("postcss");
  const tailwind = require("tailwindcss");
  const globals = fs.readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@import .+$/gm, "");
  const built = await postcss([tailwind(path.join(root, "tailwind.config.ts"))]).process(globals, { from: path.join(root, "app/globals.css") });
  const css = built.css + ["components/ui/liquid-glass/liquid-glass.css", "app/client-profile-premium.css"].map(file => fs.readFileSync(path.join(root, file), "utf8")).join("\n") + `
    body { background: var(--color-surface); color: var(--color-text); margin: 0; font-family: Arial,sans-serif; }
    .fixture-tools { display: flex; gap: 12px; padding: 16px 24px; flex-wrap: wrap; }
    .fixture-tools button { font-size: 12px; }
    main.tracker-email-modal.is-workflow-editing { position: static; width: min(960px,100%); min-width: 0; margin: 0 auto; padding: 28px; background: var(--color-card); box-shadow: none; }
  `;
  const server = http.createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "application/javascript; charset=utf-8"); response.end(fs.readFileSync(path.join(output, "fixture.js"))); }
    else if (request.url === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(css); }
    else { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const executablePath = process.env.CHROME_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(file => fs.existsSync(file));
  let browser;
  try {
    assert(executablePath, "Set CHROME_PATH to a local Chromium browser");
    browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1120, height: 950 });
    const errors = [];
    page.on("pageerror", error => { errors.push(error.message); console.error("Browser error:", error.message); });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForSelector(editor);
    const clickText = async (selector, text) => {
      const buttons = await page.$$(selector);
      for (const button of buttons) if ((await button.evaluate(node => node.textContent)).trim() === text) { await button.click(); return; }
      throw Error(`Missing button ${text}`);
    };
    const tool = async name => (await page.$(`${toolbar} button[aria-label="${name}"]`)).click();
    const reset = async () => { await clickText(".fixture-tools button", "Reset"); await page.waitForFunction(selector => document.querySelector(selector)?.textContent === "First paragraph.Hello world, second paragraph.Third paragraph.", {}, editor); };
    const text = () => page.$eval(editor, node => node.textContent);
    const html = () => page.$eval(editor, node => node.innerHTML);
    const serialized = () => page.evaluate(() => window.readVisibleRules()[0].content);
    const range = async (needle, start = 0, end = start) => { await page.$eval(editor, (node, needle, start, end) => {
      node.focus({ preventScroll: true });
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let target;
      while (target = walker.nextNode()) if (target.textContent.includes(needle)) break;
      if (!target) throw Error(`Cannot find text ${needle}`);
      const offset = target.textContent.indexOf(needle);
      const selection = window.getSelection(), selected = document.createRange();
      selected.setStart(target, offset + start); selected.setEnd(target, offset + end);
      selection.removeAllRanges(); selection.addRange(selected);
      document.dispatchEvent(new Event("selectionchange"));
    }, needle, start, end); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); };
    const paste = async (plain, formatted = "") => page.$eval(editor, (node, plain, formatted) => {
      const clipboardData = new DataTransfer(); clipboardData.setData("text/plain", plain);
      if (formatted) clipboardData.setData("text/html", formatted);
      node.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
    }, plain, formatted);
    const variable = async (search = "Client company") => {
      await (await page.$(`${toolbar} .workflow-variables-trigger`)).click();
      await page.waitForSelector('.workflow-variable-palette:popover-open');
      await page.type('.workflow-variable-palette:popover-open input', search);
      await clickText('.workflow-variable-palette:popover-open .workflow-variable-results button', search);
      await page.waitForFunction(() => !document.querySelector('.workflow-variable-palette:popover-open'));
      assert.equal(await page.$eval(editor, node => document.activeElement === node), true, "Insertion returns focus");
    };
    const undo = async () => { await tool("Undo"); };
    const redo = async () => { await tool("Redo"); };
    const capture = async name => {
      // Capture the settled materials, rather than the palette's emergence frame.
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 360)));
      await page.screenshot({ path: path.join(output, name) });
    };

    for (const mode of ["points", "statements", "combinations"]) {
      await clickText(".fixture-tools button", mode); await reset();
      await clickText(".fixture-tools button", "Empty");
      await page.waitForSelector(`${editor} p.is-editor-empty`);
      await page.click(editor);
      assert(await page.$eval(editor, node => {
        const selection = window.getSelection(), paragraph = node.querySelector("p");
        const rect = paragraph.getBoundingClientRect(), position = getComputedStyle(paragraph, "::before");
        const collapsed = selection?.getRangeAt(0);
        return collapsed?.collapsed && selection.anchorOffset === 0 && position.float === "left" && position.height === "0px" && node.textContent === "" && rect.left >= 0;
      }), `${mode}: placeholder takes no inline space and caret starts at position zero`);
      const caretBeforeTyping = await page.$eval(editor, node => {
        const view = node.editor.view; const coordinates = view.coordsAtPos(view.state.selection.from);
        return { left: coordinates.left, paragraphLeft: node.querySelector("p").getBoundingClientRect().left };
      });
      assert(Math.abs(caretBeforeTyping.left - caretBeforeTyping.paragraphLeft) < 3, "Empty caret is at the beginning of the placeholder, before any input");
      await page.keyboard.type("ABC"); assert.equal(await text(), "ABC", "First typing starts at the correct empty caret");
      assert(!(await serialized()).includes("Write the"), "Placeholder never enters serialized content");
      await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control"); await page.keyboard.press("Backspace");
      assert.equal(await text(), "", `Deleting everything leaves no content: ${await html()}`);
      assert(await page.$eval(editor, node => node.querySelector("p")?.classList.contains("is-editor-empty")), `Deleting everything restores the placeholder decoration: ${await html()}`);
      await page.waitForSelector(`${editor} p.is-editor-empty`);
      assert.equal(await text(), "", "Deleting everything restores a truly empty document");
      await page.keyboard.type("Again"); assert.equal(await text(), "Again", "Typing after clearing starts at the beginning");
      await reset(); await range("world"); await page.keyboard.type("{{client.category}}");
      assert.equal(await page.$eval(`${editor} .tracker-editor-variable`, node => node.textContent), "Category", "Typed complete template syntax becomes a semantic atom");
      assert((await serialized()).includes("{{client.category}}"));
      await reset(); await range("world", 0, 5); await variable("Category");
      assert((await serialized()).includes("Hello {{client.category}},"));
      await page.keyboard.press("Backspace");
      assert.equal(await page.$eval(editor, node => node.querySelectorAll(".tracker-editor-variable").length), 0, "One Backspace removes the whole atom");
      await undo(); assert.equal(await page.$eval(editor, node => node.querySelectorAll(".tracker-editor-variable").length), 1, "Undo restores the atom");
      for (const key of ["ArrowLeft", "ArrowLeft", "ArrowRight", "ArrowRight"]) {
        await page.keyboard.press(key);
        assert(await page.$eval(editor, node => { const anchor = window.getSelection().anchorNode; return !node.querySelector(".tracker-editor-variable").contains(anchor); }), "Arrow navigation cannot enter token label text");
      }
      await page.$eval(editor, node => {
        const atom = node.querySelector(".tracker-editor-variable"), selected = document.createRange(); selected.setStartBefore(atom); selected.collapse(true);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(selected); document.dispatchEvent(new Event("selectionchange"));
      });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.keyboard.press("Delete");
      assert.equal(await page.$eval(editor, node => node.querySelectorAll(".tracker-editor-variable").length), 0, "One Delete removes the whole atom from before it");
      await undo();
      await page.$eval(editor, node => {
        const selected = document.createRange(); selected.selectNode(node.querySelector(".tracker-editor-variable"));
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(selected); document.dispatchEvent(new Event("selectionchange"));
      });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const copied = await page.$eval(editor, node => {
        const clipboardData = new DataTransfer(); node.dispatchEvent(new ClipboardEvent("copy", { clipboardData, bubbles: true, cancelable: true }));
        return { text: clipboardData.getData("text/plain"), html: clipboardData.getData("text/html") };
      });
      assert.equal(copied.text, "{{client.category}}", "Clipboard plain text preserves technical identity");
      assert(copied.html.includes("data-email-variable"), "Clipboard HTML preserves atomic identity");
      await range("Hello"); await paste(copied.text, copied.html);
      assert.equal(await page.$eval(editor, node => node.querySelectorAll(".tracker-editor-variable").length), 2, "Pasting a copied atom keeps it semantic");
      await clickText(".fixture-tools button", "Load legacy");
      await page.waitForFunction(selector => document.querySelector(selector)?.querySelectorAll(".tracker-editor-variable").length === 2, {}, editor);
      assert.equal(await text(), "Hello Client company, your status is Done or Not.", "Legacy saved templates render readable atoms");
      await clickText(".fixture-tools button", "Save"); await clickText(".fixture-tools button", "Reopen");
      assert.equal(await text(), "Hello Client company, your status is Done or Not.", "Reopened tokens retain their labels");
      assert((await serialized()).includes("<strong>{{column.done}}</strong>"), "Token serialization preserves formatting and tracker identity");
      await reset();
      assert.equal(await page.$$('.workflow-message-variable-tray').then(items => items.length), 0, "No variable chip wall");
      await range("second", 3); await page.keyboard.type("TEST");
      assert((await text()).includes("secTESTond"), `${mode}: caret stays inside paragraph two`);
      await reset(); await range("second", 0, 6); await page.keyboard.type("replacement");
      assert((await text()).includes("world, replacement paragraph"), "Typing replaces selection");
      await reset(); await range("world", 0, 5); await variable(); await page.keyboard.type("!");
      assert((await text()).includes("Hello Client company!,"), "Variable replaces selection and caret follows token");
      assert((await serialized()).includes("Hello {{client.companyName}}!,"), "Serialization keeps the original technical token");
      assert(!(await text()).includes("{{"), "Editor shows human labels only");
      assert.equal(await page.$eval(`${editor} .tracker-editor-variable`, node => node.contentEditable), "false", "Variable is an atomic, non-editable object");
      await undo(); await undo(); assert((await text()).includes("Hello world,"), "Undo reverses typing then variable insertion");
      await redo(); await redo(); assert((await text()).includes("Hello Client company!,"), "Redo restores insertion and typing");
      await reset(); await range("world"); await paste("LINE ONE\r\nLINE TWO");
      assert((await text()).includes("Hello LINE ONELINE TWOworld,"), "Multiline paste inserts at caret");
      assert(await page.$eval(editor, node => node.querySelectorAll("p").length >= 4), "Multiline paste preserves paragraph structure");
      await undo(); assert((await text()).includes("Hello world,"), "Paste is undoable");
      await redo(); assert((await text()).includes("LINE ONE"));
      await page.keyboard.type("AFTER"); assert((await text()).includes("LINE TWOAFTERworld"), "Multiline paste leaves the caret after inserted content");
      await reset(); await range("world", 0, 5); await tool("Bold"); await paste("client");
      assert(await page.$eval(editor, node => [...node.querySelectorAll("strong,b")].some(item => item.textContent.includes("client"))), "Plain paste inherits the selected text's formatting");
      await reset(); await range("world", 2); await tool("Italic"); await paste("{{client.category}}\ncontinued");
      assert(await page.$eval(editor, node => [...node.querySelectorAll("em,i")].some(item => item.querySelector(".tracker-editor-variable")) && [...node.querySelectorAll("em,i")].some(item => item.textContent.includes("continued"))), "Plain multiline paste inherits caret formatting, including atoms");
      await reset(); await range("world", 0, 5);
      await paste("Safe", '<p style="color:red"><b>Safe</b><i> italic</i><u> underline</u><a href="https://example.com" onclick="alert(1)"> link</a><script>bad()</script><img src=x onerror=alert(1)></p>');
      const pasted = await html();
      assert(await page.$eval(editor, node => !!node.querySelector("strong,b") && !!node.querySelector("em,i") && !!node.querySelector("u")), `Paste retains safe formatting: ${pasted}`);
      assert(!/onclick|script|img|color:\s*red/.test(pasted), `Paste strips unsafe markup and external styling: ${pasted}`);
      await reset(); await range("world", 0, 5); await tool("Bold"); await tool("Italic"); await tool("Underline");
      assert(await page.$eval(editor, node => !!node.querySelector('b,strong') && !!node.querySelector('i,em') && !!node.querySelector('u')), "Formatting selection remains stable");
      await variable(); assert(await page.$eval(editor, node => [...node.querySelectorAll('b,strong')].some(item => item.textContent.includes('Client company'))), "Variable inherits selected formatting");
      await page.$eval(editor, node => {
        const selected = document.createRange(); selected.selectNode(node.querySelector(".tracker-editor-variable"));
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(selected); document.dispatchEvent(new Event("selectionchange"));
      });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await tool("Clear formatting");
      assert(await page.$eval(editor, node => { const atom = node.querySelector(".tracker-editor-variable"); return !!atom && !atom.closest("strong,b,em,i,u"); }), "Clear formatting preserves the atom and removes its marks");
      assert((await serialized()).includes("{{client.companyName}}"), "Clear formatting retains token identity");
      await undo();
      assert(await page.$eval(editor, node => !!node.querySelector(".tracker-editor-variable")?.closest("strong,b")), "Undo restores token formatting");
      await reset(); await range("world", 0, 5); await tool("Add link");
      await page.type('.workflow-message-link input', "https://example.com");
      await clickText('.workflow-message-link button', "Apply link");
      assert.equal(await page.$eval(`${editor} a`, node => node.textContent), "world", "Link preserves selection");
      await reset(); await range("world"); await tool("Bullet list"); await page.keyboard.press("End"); await page.keyboard.press("Enter"); await page.keyboard.type("Next item"); await variable();
      assert(await page.$eval(editor, node => node.querySelectorAll("ul li").length >= 2 && [...node.querySelectorAll("li")].some(item => item.textContent.includes('Client company'))), "List Enter and variable insertion");
      await undo(); await redo();
      await tool("Numbered list"); assert(await page.$eval(editor, node => !!node.querySelector("ol li")), "Numbered list works");
      const beforeCollapse = await html();
      await (await page.$('.workflow-message-surface:first-child .workflow-message-expander')).click();
      await (await page.$('.workflow-message-surface:first-child .workflow-message-expander')).click();
      assert.equal(await html(), beforeCollapse, "Collapse preserves exact live document");
      await clickText(".fixture-tools button", "Save"); await clickText(".fixture-tools button", "Toggle step"); await clickText(".fixture-tools button", "Toggle step");
      assert((await text()).includes("Next itemClient company"), "Step navigation preserves content");
      await clickText(".fixture-tools button", "Reopen");
      assert((await text()).includes("Next itemClient company"), "Save/reopen retains formatted variables");
      assert((await serialized()).includes("{{client.companyName}}"), "Saved variable syntax remains compatible");
      console.log(`${mode}: caret, selection replacement, palette, paste, sanitization, undo/redo, formatting, links, lists, collapse, navigation and reopen passed.`);
    }
    await reset(); await range("world");
    const cdp = await page.createCDPSession();
    const beforeComposition = await page.evaluate(() => window.readRules().find(rule => rule.id === "rule-2").content);
    await cdp.send("Input.imeSetComposition", { text: "日本", selectionStart: 2, selectionEnd: 2 });
    assert.equal(await page.evaluate(() => window.readRules().find(rule => rule.id === "rule-2").content), beforeComposition, "Composition is not published midway");
    await cdp.send("Input.insertText", { text: "日本語" });
    await page.waitForFunction(() => window.readVisibleRules()[0].content.includes("日本語"));
    assert((await page.evaluate(() => window.readRules().find(rule => rule.id === "rule-2").content)).includes("日本語"), "Composition commits at end");
    const beforeReorder = await text();
    await (await page.$('.workflow-message-surface:first-child button[aria-label="Move scenario 1 down"]')).click();
    assert.equal(await page.$eval('.workflow-message-surface:nth-child(2) .tracker-rich-text', node => node.textContent), beforeReorder, "Reorder keeps content attached to stable rule IDs");

    await clickText(".fixture-tools button", "points"); await reset(); await range("world");
    await (await page.$(`${toolbar} .workflow-variables-trigger`)).click();
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector('.workflow-variable-palette:popover-open'));
    assert.equal(await page.$eval(editor, node => document.activeElement === node), true, "Escape returns to editor without dismissing workflow");
    await page.keyboard.type("ESC"); assert((await text()).includes("Hello ESCworld"), "Escape retains caret");
    await (await page.$(`${toolbar} .workflow-variables-trigger`)).click();
    await page.type('.workflow-variable-palette:popover-open input', "does not exist");
    assert.equal(await page.$eval('.workflow-variable-palette:popover-open [role="status"]', node => node.textContent), "No matching variables");
    await page.keyboard.press("Escape");
    await (await page.$(`${toolbar} .workflow-variables-trigger`)).click();
    await (await page.$(`${toolbar} .workflow-variables-trigger`)).click();
    await page.waitForFunction(() => !document.querySelector('.workflow-variable-palette:popover-open'));
    await (await page.$(`${toolbar} .workflow-variables-trigger`)).click();
    await page.click('.workflow-messages-intro h3');
    await page.waitForFunction(() => !document.querySelector('.workflow-variable-palette:popover-open'));
    await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute("aria-expanded") === "false", {}, `${toolbar} .workflow-variables-trigger`);
    assert.equal(await page.$eval(`${toolbar} .workflow-variables-trigger`, node => node.getAttribute("aria-expanded")), "false", "Light dismissal keeps trigger state synchronized");

    await reset(); await range("world", 0, 5);
    for (const key of ["b", "i", "u"]) { await page.keyboard.down("Control"); await page.keyboard.press(key); await page.keyboard.up("Control"); }
    assert(await page.$eval(editor, node => !!node.querySelector("b,strong") && !!node.querySelector("i,em") && !!node.querySelector("u")), "Keyboard formatting shortcuts preserve selection");
    await reset(); await range("world");
    await (await page.$(`${toolbar} .workflow-variables-trigger`)).click();
    await page.type('.workflow-variable-palette:popover-open input', "Client company");
    await page.keyboard.press("Tab"); await page.keyboard.press("Enter");
    assert((await text()).includes("Hello Client companyworld"), "Palette insertion works entirely by keyboard");
    await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.up("Control");
    assert((await text()).includes("Hello world"), "Ctrl+Z reverses variable insertion");
    await page.keyboard.down("Control"); await page.keyboard.down("Shift"); await page.keyboard.press("z"); await page.keyboard.up("Shift"); await page.keyboard.up("Control");
    assert((await text()).includes("Client company"), "Ctrl+Shift+Z restores insertion");
    await reset(); await range("world"); await page.keyboard.press("Enter"); await page.keyboard.type("New paragraph");
    assert(await page.$eval(editor, node => node.querySelectorAll("p,div").length >= 4), "Enter creates a paragraph");
    await page.keyboard.down("Shift"); await page.keyboard.press("Enter"); await page.keyboard.up("Shift"); await page.keyboard.type("Soft line");
    const softBreak = await html();
    assert(/<br>|\n/.test(softBreak), `Shift+Enter inserts a soft break: ${softBreak}`);

    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), dark);
      await page.setViewport({ width: 1120, height: 950 });
      await reset();
      await clickText(".fixture-tools button", "Load legacy");
      await page.waitForFunction(selector => document.querySelector(selector)?.querySelectorAll(".tracker-editor-variable").length === 2, {}, editor);
      assert(await page.$eval('.workflow-rule-heading', node => { const title = node.querySelector('h4').getBoundingClientRect(), mode = node.querySelector('.workflow-rule-mode').getBoundingClientRect(); return Math.abs((title.top + title.height / 2) - (mode.top + mode.height / 2)) < 2; }), "Desktop heading and All/Any share a row");
      await capture(dark ? "dark-desktop.png" : "light-desktop.png");
      await range("your"); await (await page.$(`${toolbar} .workflow-variables-trigger`)).click();
      await capture(dark ? "dark-palette.png" : "light-palette.png");
      await page.keyboard.press("Escape");
      await page.setViewport({ width: 390, height: 844 });
      await (await page.$(`${toolbar} .workflow-variables-trigger`)).click();
      assert(await page.$eval('.workflow-variable-palette:popover-open', node => { const bounds = node.getBoundingClientRect(); return bounds.left >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight && bounds.top >= 0; }), "Mobile palette stays in viewport");
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal overflow on mobile");
      await capture(dark ? "dark-mobile.png" : "light-mobile.png");
      await page.keyboard.press("Escape");
    }
    await page.setViewport({ width: 390, height: 400 });
    await (await page.$(`${toolbar} .workflow-variables-trigger`)).click();
    const scrollSelector = '.workflow-variable-palette:popover-open .workflow-variable-results-scroll';
    await page.waitForFunction(selector => { const node = document.querySelector(selector); return node && node.scrollHeight > node.clientHeight; }, {}, scrollSelector);
    assert(await page.$eval('.workflow-variable-palette:popover-open', node => { const rect = node.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight; }), "Short viewport constrains palette height");
    const scrollBounds = await (await page.$(scrollSelector)).boundingBox();
    await page.mouse.move(scrollBounds.x + 20, scrollBounds.y + 20); await page.mouse.wheel({ deltaY: 180 });
    await page.waitForFunction(selector => document.querySelector(selector)?.scrollTop > 0, {}, scrollSelector);
    assert(await page.$eval('.workflow-variable-palette:popover-open [role="scrollbar"]', node => !node.hidden && node.getAttribute("data-visible") === "true"), "Palette uses the auto-hide overlay scrollbar while scrolling");
    await page.mouse.move(2, 2);
    await page.waitForFunction(() => document.querySelector('.workflow-variable-palette:popover-open [role="scrollbar"]')?.getAttribute("data-visible") === "false");
    await page.keyboard.press("Escape");
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await reset();
    await range("world"); await page.keyboard.type("reduced");
    assert.equal(await page.$eval('.tracker-rich-text-editor', node => node.getAnimations().length), 0, "Reduced motion disables input response");
    assert.deepEqual(errors, [], "No runtime errors");
    console.log("Composition guard, stable reorder, Escape, empty search, desktop/mobile light/dark layout, and reduced motion passed.");
    console.log(`Visual captures: ${output}`);
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

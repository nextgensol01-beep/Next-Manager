const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const puppeteer = require("puppeteer-core"), webpack = require("next/dist/compiled/webpack/webpack");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "tmp/account-security-ui");
let browser, server;
async function main() {
  fs.mkdirSync(output, { recursive: true });
  webpack.init();
  await new Promise((resolve, reject) => {
    const compiler = webpack.webpack({ mode: "development", devtool: false, context: root, entry: { fixture: path.join(__dirname, "fixtures/account-security.tsx"), login: path.join(__dirname, "fixtures/account-security-login.tsx") }, output: { path: output, filename: "[name].js" }, resolve: { extensions: [".tsx", ".ts", ".js"], alias: { "@": root, "next-auth/react": path.join(__dirname, "fixtures/account-security-session.cjs"), "next/navigation": path.join(__dirname, "fixtures/account-security-navigation.cjs") } }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, "fixtures/workflow-editor-loader.cjs") }] } });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  const css = (await require("postcss")([require("tailwindcss")(path.join(root, "tailwind.config.ts"))]).process(fs.readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@import .+$/gm, ""), { from: path.join(root, "app/globals.css") })).css;
  let enabled = false, pendingAction = "", changeRequests = 0;
  const active = [{ id: "current", userName: "Administrator", userEmail: "admin@example.com", provider: "credentials", userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0", ip: "203.0.113.5", location: "Mumbai, India", createdAt: "2026-10-28T04:00:00Z", updatedAt: "2026-10-28T04:10:00Z", expires: "2026-11-04T04:00:00Z", isCurrent: true }];
  const user = { id: "pending", name: "Pending Person", email: "person@example.com", loginId: "", loginMethod: "google", loginMethods: ["google"], role: "user", status: "pending", googleStatus: "pending", googleRequestedAt: "2026-10-28T04:00:00Z", lastLoginIp: "203.0.113.4", lastLoginUserAgent: "Mozilla/5.0 (iPhone) Safari/605.1", googleRequestLocation: "Delhi, India" };
  server = http.createServer(async (req, res) => {
    if (["/fixture.js", "/login.js"].includes(req.url)) { res.setHeader("Content-Type", "application/javascript"); return res.end(fs.readFileSync(path.join(output, req.url.slice(1)))); }
    if (req.url === "/fixture.css") { res.setHeader("Content-Type", "text/css"); return res.end(css); }
    if (req.url.startsWith("/api/")) {
      let raw = ""; for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : {};
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/api/auth/session") {
        await new Promise(resolve => setTimeout(resolve, 150));
        return res.end("{}");
      }
      if (req.url === "/api/auth/admin-login") return res.end(JSON.stringify({ secondFactor: true }));
      if (req.url === "/api/auth/second-factor") {
        if (req.method === "GET") return res.end(JSON.stringify({ required: false }));
        if (body.code === "123456" || body.recoveryCode === "saved-code") return res.end(JSON.stringify({ user: { id: "fixture-user" } }));
        res.statusCode = 400; return res.end(JSON.stringify({ error: "Incorrect code" }));
      }
      if (req.url.startsWith("/api/settings/account-security")) {
        if (req.method === "GET") return res.end(JSON.stringify({ email: "admin@nextgensolutions.com", loginId: "admin@nextgensolutions.com", recoveryEmail: "security@gmail.com", emailVerified: false, twoFactorEnabled: enabled, isAdmin: true }));
        changeRequests++;
        if (body.verify) {
          if (body.code !== "123456" || pendingAction === "email" && body.newCode !== "654321") { res.statusCode = 400; return res.end(JSON.stringify({ error: "Incorrect code. 4 attempts remaining." })); }
          if (pendingAction === "twofactor_on") enabled = true;
          if (pendingAction === "twofactor_off") enabled = false;
          const generatesCodes = ["twofactor_on", "recovery_codes"].includes(pendingAction);
          return res.end(JSON.stringify({ success: true, ...(generatesCodes ? { recoveryCodes: Array.from({ length: 10 }, (_, index) => `code-${index.toString().padStart(2, "0")}-example`) } : {}) }));
        }
        pendingAction = body.action;
        return res.end(JSON.stringify({ challengeId: "fixture", dual: body.action === "email", expiresIn: 300, resendAfter: 60 }));
      }
      if (req.url.startsWith("/api/users")) return res.end(JSON.stringify(req.method === "GET" ? { users: [user] } : { success: true }));
      if (req.url.startsWith("/api/sessions")) return res.end(JSON.stringify(req.method === "GET" ? active : { success: true }));
      return res.end("{}");
    }
    res.setHeader("Content-Type", "text/html"); res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body style="margin:0;background:var(--color-surface);color:var(--color-text)"><div id="root"></div><script src="/${req.url.startsWith("/login-fixture") ? "login" : "fixture"}.js"></script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean).find(file => fs.existsSync(file));
  browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  const page = await browser.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const clickText = async text => {
    const found = await page.evaluate(label => { const button = [...document.querySelectorAll("button")].find(node => node.textContent.trim() === label); if (!button) return false; button.click(); return true; }, text);
    assert.ok(found, `Missing button: ${text}`);
  };
  const waitText = text => page.waitForFunction(value => document.body.textContent.includes(value), {}, text);
  await page.setViewport({ width: 1280, height: 1000 });
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "networkidle0" });
  await waitText("Admin Account / Login Details");
  await waitText("Login ID: admin@nextgensolutions.com");
  await page.screenshot({ path: path.join(output, "desktop.png"), fullPage: true });
  assert.equal(await page.$eval('[role="switch"]', node => node.getAttribute("aria-checked")), "false");
  await page.click('[role="switch"]');
  assert.equal(changeRequests, 0, "Opening enrollment must not save state");
  await clickText("Send verification code");
  await waitText("Code sent to your security Gmail: security@gmail.com");
  assert.equal(await page.$$eval('form input[autocomplete="off"]', nodes => nodes.length), 0, "Admin enrollment must not ask for a second code at the login ID");
  assert.equal(enabled, false);
  await page.type('input[autocomplete="one-time-code"]', "000000");
  await clickText("Verify & save"); await waitText("Incorrect code"); assert.equal(enabled, false);
  await page.$eval('input[autocomplete="one-time-code"]', node => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; setter.call(node, "123456"); node.dispatchEvent(new Event("input", { bubbles: true })); });
  const verifyAndWaitForSessionRefresh = async () => {
    const sessionsRefreshed = page.waitForResponse(response => response.url().endsWith("/api/sessions") && response.request().method() === "PATCH");
    await clickText("Verify & save");
    await sessionsRefreshed;
    await page.waitForNetworkIdle();
  };
  await verifyAndWaitForSessionRefresh();
  assert.equal(enabled, true); assert.equal(await page.$$eval('section[aria-label="Recovery codes"] code', nodes => nodes.length), 10);
  await clickText("I have saved these codes");
  await page.waitForSelector('section[aria-label="Recovery codes"]', { hidden: true });
  await page.setViewport({ width: 390, height: 844 });
  await page.waitForFunction(() => !document.querySelector('[role="status"]'));
  await page.screenshot({ path: path.join(output, "mobile.png"), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Mobile layout overflows horizontally");
  const openMenu = async () => {
    await page.evaluate(() => { const name = [...document.querySelectorAll("p")].find(node => node.textContent === "Pending Person"); name.closest(".flex.items-start.justify-between").querySelector("button").click(); });
    await page.waitForSelector(".as-sheet-entering");
    await page.waitForFunction(() => document.querySelector("#dashboard-scroll-area").getAttribute("data-sheet-open") === "true");
  };
  await openMenu(); await waitText("Approve Google");
  await page.screenshot({ path: path.join(output, "mobile-menu.png"), fullPage: true });
  await clickText("Cancel"); await page.waitForFunction(() => !document.querySelector(".as-sheet-entering,.as-sheet-closing"));
  assert.equal(await page.$eval("#dashboard-scroll-area", node => node.hasAttribute("data-sheet-open")), false);
  await openMenu(); await page.mouse.click(10, 20); await page.waitForFunction(() => !document.querySelector(".as-sheet-entering,.as-sheet-closing"));
  await openMenu(); await clickText("Approve Google"); await waitText("Confirm");
  assert.ok(await page.evaluate(() => [...document.querySelectorAll("h3")].some(node => node.textContent.startsWith("Confirm:"))), "Menu action did not open existing confirmation");
  await page.waitForFunction(() => !document.querySelector(".as-sheet-entering,.as-sheet-closing"));
  await clickText("Cancel");
  await page.waitForFunction(() => !document.querySelector(".as-sheet-entering,.as-sheet-closing") && ![...document.querySelectorAll("h3")].some(node => node.textContent.startsWith("Confirm:")));
  await page.setViewport({ width: 820, height: 1100 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Tablet layout overflows horizontally");
  await page.screenshot({ path: path.join(output, "tablet.png"), fullPage: true });
  await page.reload({ waitUntil: "networkidle0" });
  await clickText("Replace recovery codes"); await clickText("Send verification code");
  await page.type('input[autocomplete="one-time-code"]', "123456");
  await verifyAndWaitForSessionRefresh();
  assert.equal(await page.$$eval('section[aria-label="Recovery codes"] code', nodes => nodes.length), 10, "Replacement codes must survive the session refresh");
  await clickText("Copy codes");
  await waitText("Recovery codes copied");
  await clickText("I have saved these codes");
  await clickText("Change Email");
  await page.type('input[type="email"]', "new-admin@example.com");
  // The browser cooldown is intentional; use a fresh document for the independent flow.
  await page.reload({ waitUntil: "networkidle0" }); await clickText("Change Email");
  await page.type('input[type="email"]', "new-admin@example.com"); await clickText("Send verification code");
  await waitText("Code sent to your existing security email"); await waitText("Code sent to your new email");
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`http://127.0.0.1:${port}/login-fixture`, { waitUntil: "networkidle0" });
  await page.type('input[type="text"]', "member@example.com"); await page.type('input[type="password"]', "test-member-password"); await clickText("Sign In");
  await waitText("Email verification code");
  assert.equal(await page.$('input[type="password"]'), null);
  await page.type('input[autocomplete="one-time-code"]', "000000"); await clickText("Verify & Sign In"); await waitText("Incorrect code");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.navigation), undefined);
  await clickText("Lost email access? Use a recovery code"); await page.type('input[autocomplete="off"]', "saved-code");
  await page.screenshot({ path: path.join(output, "login-recovery.png"), fullPage: true });
  await clickText("Verify & Sign In"); await page.waitForFunction(() => document.documentElement.dataset.navigation === "/dashboard");
  assert.deepEqual(errors, []);
  console.log("PASS verified 2FA UI, recovery-code display, dual-email verification, password-to-OTP login, wrong OTP rejection, recovery login, mobile tap/cancel/outside-tap/action flow, desktop/mobile/tablet responsive layouts; no browser errors.");
  console.log(`Screenshots: ${output}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (server) server.close(); });

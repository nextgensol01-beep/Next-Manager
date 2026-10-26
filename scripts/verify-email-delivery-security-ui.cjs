/* Production settings, authorization, OTP input, and hold controls. Isolated HTTP only. */
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  { randomUUID } = require("node:crypto");
const puppeteer = require("puppeteer-core"),
  webpack = require("next/dist/compiled/webpack/webpack");
const root = path.resolve(__dirname, ".."),
  // Fresh captures avoid overwriting images held open by a desktop preview.
  output = path.join(root, "tmp/email-delivery-security-ui", process.argv.includes("--fresh-artifacts") ? `run-${Date.now()}` : ""),
  requests = [];
let settings = {
  draftProtection: "confirmation",
  directSendProtection: "emailOtp",
  holdToSend: true,
  restrictDuplicateRecipients: true,
  otpExpiryMinutes: 5,
  otpResendCooldownSeconds: 45,
  otpMaxAttempts: 5,
  largeBatchThreshold: 50,
  requireEmailOtpForLargeBatch: true,
  version: 0,
  approvalEmailVerified: false,
  approvalEmailMasked: null,
  suggestedApprovalEmail: "admin@example.com",
  sendPinConfigured: false,
  auditEnabled: true,
};
const approvals = new Map();
let expireNext = false, configuredPin = "";
let failNextPatch = false, dropNextPatch = false, normalizeNextPatch = false, patchDelay = 180;
const approval = (methods, purpose) => {
  const value = {
    approvalId: randomUUID(),
    methodsRequired: methods,
    methodsVerified: [],
    status: methods.length ? "pending" : "verified",
    messageCount: 1,
    holdToSend: true,
    expiresAt: new Date(
      Date.now() + (expireNext ? 1100 : 300000),
    ).toISOString(),
    otpExpiresAt: new Date(
      Date.now() + (expireNext ? 1100 : 300000),
    ).toISOString(),
    resendAvailableAt: new Date(Date.now() + 1100).toISOString(),
    approvalEmailMasked: settings.approvalEmailMasked || "a••••@example.com",
    purpose,
  };
  expireNext = false;
  approvals.set(value.approvalId, value);
  return value;
};
async function main() {
  const draft = require("./search-test-loader.cjs")()("lib/email-delivery-settings-draft.ts");
  const baseline = draft.normalizeDeliveryPolicy({});
  const reordered = Object.fromEntries(Object.entries(baseline).reverse());
  assert.equal(draft.changedDeliveryPolicyKeys(baseline, { ...reordered, version: 99, otpExpiryMinutes: "5" }).length, 0);
  const pending = { ...baseline, holdToSend: false };
  const rebased = draft.rebaseDeliveryPolicy(baseline, pending, { ...baseline, otpExpiryMinutes: 8 });
  assert.equal(rebased.holdToSend, false);
  assert.equal(rebased.otpExpiryMinutes, 8);
  assert.deepEqual(Array.from(draft.changedDeliveryPolicyKeys({ ...baseline, otpExpiryMinutes: 8 }, rebased)), ["holdToSend"]);
  fs.mkdirSync(output, { recursive: true });
  webpack.init();
  await new Promise((resolve, reject) => {
    const compiler = webpack.webpack({
      mode: "development",
      devtool: false,
      context: root,
      entry: path.join(__dirname, "fixtures/email-security.tsx"),
      output: { path: output, filename: "fixture.js" },
      resolve: {
        extensions: [".tsx", ".ts", ".js"],
        alias: {
          "@": root,
          "next/link": path.join(__dirname, "fixtures/tracker-next-link.cjs"),
          "next-auth/react": path.join(
            __dirname,
            "fixtures/tracker-session.cjs",
          ),
        },
      },
      module: {
        rules: [
          {
            test: /\.tsx?$/,
            exclude: /node_modules/,
            use: path.join(__dirname, "fixtures/workflow-editor-loader.cjs"),
          },
        ],
      },
    });
    compiler.run((error, stats) =>
      compiler.close(() =>
        error || stats.hasErrors()
          ? reject(error || Error(stats.toString({ all: false, errors: true })))
          : resolve(),
      ),
    );
  });
  const css =
    (
      await require("postcss")([
        require("tailwindcss")(path.join(root, "tailwind.config.ts")),
      ]).process(
        fs
          .readFileSync(path.join(root, "app/globals.css"), "utf8")
          .replace(/^@import .+$/gm, ""),
        { from: path.join(root, "app/globals.css") },
      )
    ).css +
    [
      "components/ui/liquid-glass/liquid-glass.css",
      "app/client-profile-premium.css",
      "components/client-trackers/email-delivery-security.css",
    ]
      .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
      .join("\n") +
    "body{margin:0;font-family:Arial,sans-serif;background:var(--color-surface);color:var(--color-text)}.security-fixture{display:flex;max-width:1180px;margin:auto}.security-fixture aside{width:250px;flex-shrink:0;padding:20px}.security-fixture main{flex:1;min-width:0}.security-fixture-tools{padding:24px;display:grid;gap:15px;max-width:400px}@media(max-width:767px){.security-fixture{display:block}.security-fixture aside{width:auto}}";
  const saveCss = ".fixture-mobile{display:none}.is-dual main{height:100vh;overflow-y:auto;scroll-padding-bottom:130px}.is-dual aside{height:100vh;overflow:auto}@media(max-width:767px){.is-dual aside{display:none}.fixture-desktop{display:none}.fixture-mobile{display:block}}";
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/fixture.js") {
      response.setHeader("Content-Type", "application/javascript");
      response.end(fs.readFileSync(path.join(output, "fixture.js")));
      return;
    }
    if (url.pathname === "/fixture.css") {
      response.setHeader("Content-Type", "text/css");
      response.end(css + saveCss);
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const body = raw ? JSON.parse(raw) : null;
      requests.push({ path: url.pathname, method: request.method, body });
      let data = {},
        status = 200,
        responseDelay = 180;
      if (url.pathname.endsWith("/activity"))
        data = {
          events: [
            {
              _id: "A1",
              event: "approval_verified",
              userEmail: "admin@example.com",
              createdAt: new Date().toISOString(),
            },
          ],
          nextCursor: null,
        };
      else if (url.pathname.endsWith("/authorize")) {
        if (body.action === "request")
          data = approval(settings.approvalEmailVerified ? ["emailOtp"] : ["sendPin"], body.purpose);
        else if (body.action === "resend") {
          data = {
            ...approvals.get(body.approvalId),
            otpExpiresAt: new Date(Date.now() + 300000).toISOString(),
            resendAvailableAt: new Date(Date.now() + 45000).toISOString(),
          };
          approvals.set(data.approvalId, data);
        } else if (body.otp === "123456" || (body.pin && body.pin === configuredPin))
          data = {
            ...approvals.get(body.approvalId),
            methodsVerified: [body.otp ? "emailOtp" : "sendPin"],
            status: "verified",
          };
        else {
          data = {
            error: "Incorrect code. 4 attempts remaining.",
            code: "INCORRECT_CODE",
          };
          status = 400;
        }
      } else if (url.pathname.endsWith("/approval-email")) {
        if (body.action === "request")
          data = approval(["emailOtp"], "new-email");
        else {
          settings = {
            ...settings,
            version: settings.version + 1,
            approvalEmailVerified: true,
            approvalEmailMasked: "a••••@example.com",
            suggestedApprovalEmail: undefined,
          };
          data = { settings };
        }
      } else if (url.pathname.endsWith("/send-pin")) {
        configuredPin = body.action === "save" ? body.pin : "";
        settings = {
          ...settings,
          version: settings.version + 1,
          sendPinConfigured: body.action === "save",
        };
        data = settings;
      } else if (url.pathname.endsWith("/approval/request"))
        data = approval(
          settings.directSendProtection === "emailOtpAndPin"
            ? ["emailOtp", "sendPin"]
            : ["emailOtp"],
          "delivery",
        );
      else if (url.pathname.endsWith("/approval/verify")) {
        responseDelay = 650;
        const current = approvals.get(body.approvalId);
        data = {
          ...current,
          methodsVerified: [
            ...current.methodsVerified,
            body.otp ? "emailOtp" : "sendPin",
          ],
        };
        data.status = data.methodsRequired.every((method) =>
          data.methodsVerified.includes(method),
        )
          ? "verified"
          : "pending";
        approvals.set(data.approvalId, data);
      } else if (url.pathname === "/api/settings/email-delivery-security") {
        if (request.method === "PATCH") {
          responseDelay = patchDelay;
          if (failNextPatch) {
            failNextPatch = false;
            status = 503;
            data = { error: "Couldn't save settings. Your changes are still here." };
          } else {
            settings = { ...settings, ...body.policy, ...(normalizeNextPatch ? { otpExpiryMinutes: 8 } : {}), version: settings.version + 1 };
            normalizeNextPatch = false;
            data = settings;
          }
        } else data = settings;
      }
      setTimeout(() => {
        response.statusCode = status;
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(data));
      }, responseDelay);
      return;
    }
    response.setHeader("Content-Type", "text/html");
    response.end(
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
      headless: true,
      userDataDir: fs.mkdtempSync(path.join(output, "profile-")),
      args: ["--no-sandbox", "--disable-gpu"],
    });
    const page = await browser.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (dropNextPatch && request.method() === "PATCH" && request.url().endsWith("/api/settings/email-delivery-security")) {
        dropNextPatch = false;
        void request.abort("internetdisconnected");
      } else void request.continue();
    });
    await page.setViewport({ width: 1240, height: 950 });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForSelector(".email-delivery-settings-group");
    const wait = (ms = 350) =>
      page.evaluate(
        (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        ms,
      );
    const button = async (text, scope = "body") => {
      await page.waitForFunction(
        (text, scope) =>
          [...document.querySelectorAll(scope + " button")].some(
            (node) => node.textContent.trim() === text && !node.disabled,
          ),
        {},
        text,
        scope,
      );
      for (const node of await page.$$(scope + " button"))
        if ((await node.evaluate((node) => node.textContent)).trim() === text) {
          await require('./fixtures/wait-for-stable-control.cjs')(node);
          await node.click();
          return;
        }
      throw Error("Missing button " + text);
    };
    const fill = async (label, value) => {
      const selector = `[aria-label="${label}"]`;
      await page.focus(selector);
      await page.keyboard.down("Control");
      await page.keyboard.press("A");
      await page.keyboard.up("Control");
      await page.keyboard.type(value);
    };
    const modal = ".email-security-modal";
    const verify = async () => {
      await page.waitForSelector(`${modal} [aria-label="Verification code"]`);
      await fill("Verification code", "123456");
      await button("Verify", modal);
      await wait();
    };
    const management = async (text) => {
      await button(text);
      await page.waitForSelector(modal);
      await button("Send verification code", modal);
      await verify();
    };
    assert(
      await page.$eval(".email-delivery-settings", (node) =>
        node.innerText.includes("Approval email required"),
      ),
    );
    assert.equal(
      await page.$eval('[aria-label="Hold to Send"]', (node) =>
        node.getAttribute("aria-checked"),
      ),
      "true",
    );
    await page.screenshot({
      path: path.join(output, "settings-light.png"),
      fullPage: true,
    });
    await button("Set up approval email");
    await page.waitForSelector('[aria-label="New approval email"]');
    assert.equal(
      await page.$eval(
        '[aria-label="New approval email"]',
        (node) => node.value,
      ),
      "admin@example.com",
    );
    await button("Verify new approval email", modal);
    await verify();
    await page.waitForSelector(modal, { hidden: true });
    assert(
      settings.approvalEmailVerified,
      "StrictMode setup callback updates the panel",
    );
    await management("Set up Send PIN");
    async function checkPinVisibility(label, digits) {
      const input = `[aria-label="${label}"]`;
      const cells = () => page.$eval(input, node => node.parentElement.querySelector(".email-security-code-cells").textContent);
      assert.equal(await page.$eval(input, node => node.type), "password");
      assert.equal(await cells(), "•".repeat(digits.length));
      await page.click(`[aria-label="Show ${label}"]`);
      assert.equal(await page.$eval(input, node => node.type), "text");
      assert.equal(await page.$eval(input, node => node.value), digits);
      assert.equal(await cells(), digits);
      await page.click(`[aria-label="Hide ${label}"]`);
      assert.equal(await page.$eval(input, node => node.type), "password");
      assert.equal(await page.$eval(input, node => node.value), digits);
    }
    await fill("New Send PIN", "001234");
    await checkPinVisibility("New Send PIN", "001234");
    await fill("New Send PIN", "246810");
    await checkPinVisibility("New Send PIN", "246810");
    await fill("Confirm Send PIN", "135790");
    assert(
      await page.$eval(
        modal,
        (node) =>
          [...node.querySelectorAll("button")].find(
            (node) => node.textContent === "Save Send PIN",
          ).disabled,
      ),
    );
    await fill("Confirm Send PIN", "246810");
    await checkPinVisibility("Confirm Send PIN", "246810");
    await page.click('[aria-label="Show Confirm Send PIN"]');
    await page.focus('[aria-label="New Send PIN"]');
    assert.equal(await page.$eval('[aria-label="Confirm Send PIN"]', node => node.type), "password", "Moving outside the field hides the PIN");
    await page.screenshot({ path: path.join(output, "pin-setup-light.png") });
    await button("Save Send PIN", modal);
    await page.waitForSelector(modal, { hidden: true });
    assert(settings.sendPinConfigured);
    await page.click('button[aria-label="Direct send protection"]');
    await page.waitForSelector("[role=option]");
    const choices = await page.$$eval("[role=option]", (nodes) =>
      nodes.map((node) => node.textContent),
    );
    assert.equal(choices.length, 3);
    assert(!choices.some((text) => /None|Confirmation/.test(text)));
    await button("Email OTP + Send PIN");
    await wait();
    const duplicateToggle = '[aria-label="Restrict duplicate email addresses"]';
    assert.equal(await page.$eval(duplicateToggle, node => node.getAttribute("aria-checked")), "true");
    await page.click(duplicateToggle);
    assert.equal(await page.$eval(duplicateToggle, node => node.getAttribute("aria-checked")), "false");
    await management("Save changes");
    await button("Save changes", modal);
    await page.waitForSelector(modal, { hidden: true });
    assert.equal(settings.directSendProtection, "emailOtpAndPin");
    assert.equal(settings.restrictDuplicateRecipients, false);
    assert.equal(requests.find(request => request.method === "PATCH").body.policy.restrictDuplicateRecipients, false);
    assert.equal(
      requests.filter((request) => request.method === "PATCH").length,
      1,
    );
    await page.reload();
    await page.waitForSelector(duplicateToggle);
    assert.equal(await page.$eval(duplicateToggle, node => node.getAttribute("aria-checked")), "false");
    await page.click(duplicateToggle);
    await management("Save changes");
    await button("Save changes", modal);
    await page.waitForSelector(modal, { hidden: true });
    assert.equal(settings.restrictDuplicateRecipients, true);
    await management("Change approval email");
    await fill("New approval email", "new@example.com");
    await button("Verify new approval email", modal);
    await verify();
    await page.waitForSelector(modal, { hidden: true });
    await button("Change PIN");
    await button("Send verification code", modal);
    await page.waitForSelector('[aria-label="Verification code"]');
    await fill("Verification code", "000000");
    await button("Verify", modal);
    await page.waitForSelector(".email-security-error");
    assert.equal(
      await page.$eval(
        '[aria-label="Verification code"]',
        (node) => node.value,
      ),
      "",
      "Wrong code is cleared",
    );
    await wait(1400);
    await button("Resend code", modal);
    await wait();
    assert.equal(
      await page.$eval(
        '[aria-label="Verification code"]',
        (node) => node.value,
      ),
      "",
    );
    await page.$eval('[aria-label="Verification code"]', (node) => {
      const clipboard = new DataTransfer();
      clipboard.setData("text", "12 34 56");
      node.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: clipboard,
        }),
      );
    });
    assert.equal(
      await page.$eval(
        '[aria-label="Verification code"]',
        (node) => node.value,
      ),
      "123456",
      "Full formatted code pastes into the one native input",
    );
    await button("Verify", modal);
    await wait();
    await page.waitForSelector('[aria-label="New Send PIN"]');
    await fill("New Send PIN", "123123");
    await button("Cancel", modal);
    await page.waitForSelector(modal, { hidden: true });
    await management("Change PIN");
    assert.equal(
      await page.$eval('[aria-label="New Send PIN"]', (node) => node.value),
      "",
      "Closing clears PIN state",
    );
    await button("Cancel", modal);
    await wait();
    expireNext = true;
    await button("Change PIN");
    await button("Send verification code", modal);
    await wait(2300);
    await button("Request new approval", modal);
    await button("Cancel", modal);
    await wait();
    await button("Open delivery");
    await page.waitForSelector(modal);
    await wait();
    await button("Send verification code", modal);
    await verify();
    await page.waitForSelector('[aria-label="Send PIN"]');
    assert.equal(
      await page.$eval('[aria-label="Send PIN"]', (node) => node.type),
      "password",
    );
    assert.equal(
      await page.$$(".email-security-hold").then((nodes) => nodes.length),
      1,
      "Delivery hold stays absent until both factors verify",
    );
    await fill("Send PIN", "246810");
    await checkPinVisibility("Send PIN", "246810");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.click('[aria-label="Show Send PIN"]');
    await page.screenshot({ path: path.join(output, "pin-verification-dark.png") });
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await button("Verify", modal);
    await page.waitForFunction(() => document.querySelector(".email-authorization-modal [data-verifying]")?.textContent.includes("Verifying PIN…"));
    await page.screenshot({ path: path.join(output, "authorization-verifying-light.png") });
    await page.waitForSelector(`${modal} .email-security-hold`);
    await page.waitForSelector(`${modal} .email-authorization-processing`, { hidden: true });
    assert(await page.$eval(`${modal} .email-security-intro`, node => node.textContent.includes("1 personalised client email is ready to be sent.")));
    assert(await page.$eval(`${modal} .email-security-summary`, node => node.textContent.includes("Client emails1") && node.textContent.includes("To / CC addresses1") && node.textContent.includes("1 file")));
    assert(await page.$eval(`${modal} .email-security-commit`, node => node.textContent.includes("1 email will be sent in short batches.")));
    assert.equal(await page.$eval(modal, node => node.innerText.includes("Sending 1 email")), false, "No sending language before a completed hold");
    assert.equal(await page.$eval(`${modal} .email-security-verified`, node => node.textContent.trim()), "Identity verified");
    await page.screenshot({ path: path.join(output, "authorized-light.png") });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.screenshot({ path: path.join(output, "authorized-dark.png") });
    const hold = `${modal} .email-security-hold`;
    await page.$eval(hold, node => { window.fixtureHold = node; });
    const approvalRequests = requests.filter(request => request.path.includes("/approval/")).length;
    await page.click(hold);
    assert.equal(await page.$eval("#delivery-attempts", node => node.textContent), "0", "A click cannot send");
    // Sample and release in one browser turn so transport/screenshot latency cannot extend a half hold.
    const sample = await page.$eval(hold, async node => {
      node.focus();
      node.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 550));
      const value = {
        progress: Number(node.style.getPropertyValue("--hold-progress")),
        label: node.textContent,
        offset: Number(node.querySelector(".hold-optical-path").style.strokeDashoffset),
      };
      node.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));
      return { ...value, draining: Number(node.style.getPropertyValue("--hold-progress")) };
    });
    assert(sample.progress > .3 && sample.progress < .85, `Fill follows elapsed hold time: ${sample.progress}`);
    assert.equal(sample.label, "Keep holding…");
    assert(Math.abs(sample.offset - (1 - sample.progress)) < .01, "Optical perimeter follows elapsed hold time");
    assert(sample.draining > 0, "Early release drains instead of snapping to zero");
    await wait(300);
    assert.equal(await page.$eval(hold, node => Number(node.style.getPropertyValue("--hold-progress"))), 0);
    assert.equal(await page.$eval("#delivery-attempts", node => node.textContent), "0");
    assert.equal(requests.filter(request => request.path.includes("/approval/")).length, approvalRequests, "Early release preserves approval");
    await page.focus(hold);
    await page.keyboard.down("Space");
    await wait(230);
    await page.keyboard.up("Space");
    assert.equal(
      await page.$eval("#hold-commits", (node) => node.textContent),
      "0",
    );
    const rectangle = await page.$eval(hold, (node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    await page.mouse.move(rectangle.x + 25, rectangle.y + 20);
    await page.mouse.down();
    await wait(200);
    await page.mouse.move(0, 0);
    await wait(1200);
    await page.mouse.up();
    assert.equal(
      await page.$eval("#hold-commits", (node) => node.textContent),
      "0",
      "Pointer exit cancels",
    );
    await page.focus(hold);
    await page.keyboard.down("Enter");
    await wait(180);
    await page.$eval(hold, (node) => node.blur());
    await wait(1200);
    await page.keyboard.up("Enter");
    assert.equal(
      await page.$eval("#hold-commits", (node) => node.textContent),
      "0",
      "Blur cancels",
    );
    const cancelledStates = await page.$eval(hold, async node => {
      const states = [];
      const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
      for (const reason of ["pointercancel", "lostpointercapture", "window-blur", "hidden-tab"]) {
        node.focus();
        node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        await pause(150);
        if (reason === "window-blur") window.dispatchEvent(new Event("blur"));
        else if (reason === "hidden-tab") {
          Object.defineProperty(document, "hidden", { configurable: true, value: true });
          document.dispatchEvent(new Event("visibilitychange"));
          delete document.hidden;
          document.dispatchEvent(new Event("visibilitychange"));
        } else node.dispatchEvent(new PointerEvent(reason, { bubbles: true, pointerId: 1 }));
        await pause(300);
        node.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
        states.push({ reason, progress: Number(node.style.getPropertyValue("--hold-progress")), state: node.dataset.state });
      }
      node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", repeat: true, bubbles: true }));
      await pause(100);
      states.push({ reason: "repeated-key", progress: Number(node.style.getPropertyValue("--hold-progress")), state: node.dataset.state });
      return states;
    });
    for (const state of cancelledStates) {
      assert.equal(state.progress, 0, `${state.reason} drains/cancels the hold`);
      assert.equal(state.state, "ready", `${state.reason} leaves approval ready`);
    }
    assert.equal(await page.$eval("#delivery-attempts", node => node.textContent), "0");
    await page.evaluate(() => { document.documentElement.dataset.failDelivery = "true"; });
    await page.focus(hold);
    await page.keyboard.down("Enter");
    await wait(1150);
    await page.keyboard.up("Enter");
    assert.equal(await page.$eval(hold, node => node === window.fixtureHold), true, "Same control survives the sending handoff");
    assert.equal(await page.$eval(hold, node => node.textContent), "Starting delivery…");
    assert.equal(await page.$eval(hold, node => node.disabled), true);
    assert.equal(await page.$$(".email-authorization-processing").then(nodes => nodes.length), 0, "No separate sending capsule");
    await page.screenshot({ path: path.join(output, "hold-sending-dark.png") });
    await page.waitForSelector(`${modal} .email-security-error`);
    await page.waitForFunction(selector => document.querySelector(selector)?.dataset.state === "ready", {}, hold);
    assert.equal(await page.$eval(hold, node => node.disabled), false);
    assert.equal(await page.$eval(hold, node => node === window.fixtureHold), true, "Recoverable failure keeps the control and approval context");
    assert.equal(requests.filter(request => request.path.includes("/approval/")).length, approvalRequests);
    await page.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);
    const reducedSample = await page.$eval(hold, async node => {
      node.focus();
      node.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 550));
      return { label: node.textContent, offset: Number(node.querySelector(".hold-optical-path").style.strokeDashoffset),
        attempts: document.querySelector("#delivery-attempts").textContent };
    });
    assert.equal(reducedSample.label, "Keep holding…");
    assert(reducedSample.offset > .15 && reducedSample.offset < .7, "Reduced motion retains elapsed-time perimeter progress");
    assert.equal(reducedSample.attempts, "1", "Reduced motion cannot shorten the hold");
    await wait(650);
    await page.$eval(hold, node => node.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true })));
    await page.waitForFunction(selector => document.querySelector(selector)?.dataset.state === "accepted", {}, hold);
    assert.equal(await page.$eval(hold, node => node.textContent), "Delivery started");
    assert.equal(await page.$eval(hold, node => node === window.fixtureHold), true);
    assert.equal(await page.$eval("#delivery-attempts", node => node.textContent), "2", "Each completed hold commits exactly once, including retry");
    await page.screenshot({ path: path.join(output, "hold-success-reduced-motion.png") });
    await page.waitForSelector(modal, { hidden: true });
    assert.equal(
      await page.$eval("#hold-commits", (node) => node.textContent),
      "1",
    );
    assert.equal(
      await page.$eval(
        ".email-security-dyes i",
        (node) => getComputedStyle(node).animationName,
      ),
      "none",
    );
    await page.$eval(".security-fixture-tools .email-security-hold", (node) =>
      node.scrollIntoView({ block: "center" }),
    );
    const touchPoint = await page.$eval(
      ".security-fixture-tools .email-security-hold",
      (node) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      },
    );
    await page.touchscreen.touchStart(touchPoint.x, touchPoint.y);
    await wait(180);
    await page.touchscreen.touchEnd();
    await wait();
    assert.equal(
      await page.$eval("#hold-commits", (node) => node.textContent),
      "1",
    );
    await page.touchscreen.touchStart(touchPoint.x, touchPoint.y);
    await wait(1300);
    await page.touchscreen.touchEnd();
    assert.equal(
      await page.$eval("#hold-commits", (node) => node.textContent),
      "2",
    );
    await page.touchscreen.tap(touchPoint.x, touchPoint.y);
    await wait();
    assert.equal(
      await page.$eval("#hold-commits", (node) => node.textContent),
      "2",
      "Committed hold cannot submit twice",
    );
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(output, "settings-dark-mobile.png"),
      fullPage: true,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.click('button[aria-label="Draft protection"]');
    await page.waitForSelector("[role=option]");
    await page.waitForFunction(() => {
      const node = document.querySelector("[role=listbox]");
      if (!node || getComputedStyle(node).visibility === "hidden") return false;
      const rect = node.getBoundingClientRect();
      return (
        rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight
      );
    });
    await page.keyboard.press("Escape");
    await page.setViewport({ width: 1240, height: 950 });
    const search = await page.$('input[placeholder="Search settings"]');
    assert(search);
    await search.type("Send PIN");
    await wait();
    await page.keyboard.press("Enter");
    assert(
      await page.evaluate(() => location.search.includes("tab=email-delivery")),
    );
    settings.approvalEmailVerified = false;
    settings.approvalEmailMasked = null;
    await page.reload();
    await page.waitForSelector(".email-delivery-settings-group");
    await button("Remove PIN");
    await button("Verify this change", modal);
    await page.waitForSelector('[aria-label="Send PIN"]');
    await fill("Send PIN", "000000");
    await checkPinVisibility("Send PIN", "000000");
    await button("Verify", modal);
    await page.waitForSelector(".email-security-error");
    await wait();
    assert.equal(await page.$eval('[aria-label="Send PIN"]', node => node.value), "");
    assert.equal(await page.$eval('[aria-label="Send PIN"]', node => node.type), "password");
    await fill("Send PIN", "246810");
    await checkPinVisibility("Send PIN", "246810");
    await button("Verify", modal);
    await wait();
    await button("Remove Send PIN", modal);
    await page.waitForSelector(modal, { hidden: true });
    assert.equal(settings.sendPinConfigured, false, "PIN fallback authorizes removal with the entered six-digit value");
    // Save-state UX: shared desktop/mobile draft, authoritative saves and guarded navigation.
    settings.approvalEmailVerified = true;
    settings.approvalEmailMasked = "a••••@example.com";
    settings.holdToSend = true;
    const fixtureUrl = page.url().split("?")[0];
    await page.goto(`${fixtureUrl}?tab=email-delivery&dual=1`);
    const desktop = ".fixture-desktop", mobile = ".fixture-mobile";
    const status = scope => `${scope} [aria-label="Email delivery save status"]`;
    const bar = scope => `${scope} .email-delivery-save-bar`;
    const holdToggle = scope => `${scope} [aria-label="Hold to Send"]`;
    const patches = () => requests.filter(request => request.method === "PATCH").length;
    const waitStatus = async (scope, expected) => page.waitForFunction((selector, expected) => document.querySelector(selector)?.getAttribute("data-save-state") === expected, {}, status(scope), expected);
    const beforeUnloadBlocked = () => page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    const beginPolicySave = async () => {
      await button("Save changes", bar(desktop));
      await page.waitForSelector(modal);
      await button("Send verification code", modal);
      await verify();
    };
    await waitStatus(desktop, "saved");
    assert.equal(await page.$$(bar(desktop)).then(nodes => nodes.length), 0);
    assert.equal(await beforeUnloadBlocked(), false);
    const initiallyPatched = patches();
    await page.click(holdToggle(desktop));
    await waitStatus(desktop, "dirty");
    await waitStatus(mobile, "dirty");
    assert.equal(patches(), initiallyPatched, "Changing a control never auto-saves");
    assert.equal(await beforeUnloadBlocked(), true);
    await page.$eval(".is-dual main", node => { node.scrollTop = 0; });
    await wait();
    assert(await page.$eval(bar(desktop), node => {
      const box = node.getBoundingClientRect();
      const side = document.querySelector("aside").getBoundingClientRect();
      return box.bottom <= innerHeight && box.top >= 0 && box.left >= side.right;
    }), "The sticky save bar is inside the main column and visible while scrolling");
    await page.screenshot({ path: path.join(output, "settings-unsaved-light.png"), fullPage: true });
    await page.click(`${desktop} [aria-label="Direct send protection"]`);
    await button("Email OTP · Recommended");
    await page.click(`${desktop} [aria-label="Restrict duplicate email addresses"]`);
    assert(await page.$eval(bar(desktop), node => node.textContent.includes("3 unsaved changes")));
    await button("Discard", bar(desktop));
    await waitStatus(desktop, "saved");
    assert.equal(await beforeUnloadBlocked(), false);
    assert.equal(await page.$$(`${desktop} [data-modified]`).then(nodes => nodes.length), 0);
    assert.equal(await page.$eval(holdToggle(desktop), node => node.getAttribute("aria-checked")), "true");

    // Separate protected updates refresh identity data without clearing policy edits.
    await page.click(holdToggle(desktop));
    await button("Change approval email", desktop);
    await page.waitForSelector(modal);
    await button("Send verification code", modal);
    await verify();
    await fill("New approval email", "second@example.com");
    await button("Verify new approval email", modal);
    await verify();
    await page.waitForSelector(modal, { hidden: true });
    await waitStatus(desktop, "dirty");
    assert.equal(await page.$eval(holdToggle(desktop), node => node.getAttribute("aria-checked")), "false");
    await button("Set up Send PIN", desktop);
    await page.waitForSelector(modal);
    await button("Send verification code", modal);
    await verify();
    await fill("New Send PIN", "006789");
    await fill("Confirm Send PIN", "006789");
    await button("Save Send PIN", modal);
    await page.waitForSelector(modal, { hidden: true });
    await waitStatus(desktop, "dirty");
    assert.equal(patches(), initiallyPatched);
    assert(await page.$eval(bar(desktop), node => node.textContent.includes("1 unsaved change")));

    await page.focus(`${desktop} [aria-label="OTP validity minutes"]`);
    await page.keyboard.down("Control"); await page.keyboard.press("A"); await page.keyboard.up("Control"); await page.keyboard.type("7");
    patchDelay = 850;
    normalizeNextPatch = true;
    await beginPolicySave();
    assert.equal(patches(), initiallyPatched, "Verification alone does not persist policy");
    await page.$eval(modal, node => {
      const save = [...node.querySelectorAll("button")].find(node => node.textContent.trim() === "Save changes");
      save.click(); save.click();
    });
    await waitStatus(desktop, "saving");
    assert.equal(await page.$eval(holdToggle(desktop), node => node.disabled), true);
    assert.equal(await page.$eval(`${mobile} [aria-label="OTP validity minutes"]`, node => node.disabled), true);
    await page.screenshot({ path: path.join(output, "settings-saving.png"), fullPage: true });
    await page.waitForSelector(modal, { hidden: true });
    await waitStatus(desktop, "saved");
    await wait(650);
    assert.equal(patches(), initiallyPatched + 1, "Rapid repeated clicks submit once");
    assert.equal(await page.$eval(`${desktop} [aria-label="OTP validity minutes"]`, node => node.value), "8", "The actual server response becomes the control value and baseline");
    assert.equal(await page.$$(bar(desktop)).then(nodes => nodes.length), 0);
    assert.equal(await beforeUnloadBlocked(), false);
    patchDelay = 180;

    // A failed response leaves the draft intact and a persistent retry after closing.
    await page.click(holdToggle(desktop));
    failNextPatch = true;
    await beginPolicySave();
    await button("Save changes", modal);
    await waitStatus(desktop, "error");
    assert.equal(await page.$eval(holdToggle(desktop), node => node.getAttribute("aria-checked")), "true");
    await button("Cancel", modal);
    await page.waitForSelector(modal, { hidden: true });
    await waitStatus(desktop, "error");
    assert(await page.$eval(bar(desktop), node => node.textContent.includes("Your changes are still here")));
    await page.screenshot({ path: path.join(output, "settings-save-error.png"), fullPage: true });
    settings.otpResendCooldownSeconds = 75;
    settings.version += 1;
    await button("Retry", status(desktop));
    await page.waitForSelector(modal);
    await button("Send verification code", modal); await verify();
    await button("Save changes", modal);
    await page.waitForSelector(modal, { hidden: true });
    await waitStatus(desktop, "saved");
    assert.equal(settings.holdToSend, true);
    assert.equal(settings.otpResendCooldownSeconds, 75, "Retry rebases untouched fields from a newer server version");

    // Keep editing, discard-and-leave, and save-and-continue all use real verification.
    await page.click(holdToggle(desktop));
    await button("General", "aside");
    await page.waitForSelector('[aria-label="Unsaved changes"]');
    await wait(150);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), "Keep editing");
    await button("Keep editing", ".email-delivery-unsaved-modal");
    await page.waitForSelector(".email-delivery-unsaved-modal", { hidden: true });
    await waitStatus(desktop, "dirty");
    await button("General", "aside");
    await button("Save & continue", ".email-delivery-unsaved-modal");
    await page.waitForSelector(modal);
    await button("Send verification code", modal); await verify();
    dropNextPatch = true;
    await button("Save changes", modal);
    await waitStatus(desktop, "error");
    assert(page.url().includes("tab=email-delivery"), "Network failure must not navigate");
    assert.equal(await page.$eval(holdToggle(desktop), node => node.getAttribute("aria-checked")), "false");
    await button("Try again", modal);
    await page.waitForSelector(`${modal} [aria-label="Verification code"]`, { hidden: true });
    await page.waitForSelector(modal);
    await button("Send verification code", modal); await verify();
    await button("Save changes", modal);
    await page.waitForSelector('[data-fixture-tab="0"]');
    assert(page.url().includes("tab=general"));
    await button("Email & Delivery", "aside");
    await waitStatus(desktop, "saved");
    const beforeDiscardNavigation = patches();
    await page.click(holdToggle(desktop));
    await button("General", "aside");
    await button("Discard changes", ".email-delivery-unsaved-modal");
    await page.waitForSelector('[data-fixture-tab="0"]');
    await button("Email & Delivery", "aside");
    await waitStatus(desktop, "saved");
    assert.equal(patches(), beforeDiscardNavigation);
    assert.equal(await beforeUnloadBlocked(), false);

    await page.click(holdToggle(desktop));
    await page.click(`${desktop} a[href="/dashboard/gmail-setup"]`);
    await page.waitForSelector('[aria-label="Unsaved changes"]');
    assert(page.url().includes("tab=email-delivery"), "Internal route links are guarded while dirty");
    await button("Keep editing", ".email-delivery-unsaved-modal");
    await page.waitForSelector(".email-delivery-unsaved-modal", { hidden: true });
    await page.setViewport({ width: 390, height: 844 });
    await waitStatus(mobile, "dirty");
    assert.equal(await page.$eval(holdToggle(mobile), node => node.getAttribute("aria-checked")), "true", "Resizing shares the same pending draft");
    await page.$eval(".is-dual main", node => { node.scrollTop = node.scrollHeight; });
    await wait();
    assert(await page.$eval(bar(mobile), node => { const box = node.getBoundingClientRect(); return box.bottom <= innerHeight && box.top >= 0; }));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    assert(await page.$eval(`${bar(mobile)} .email-delivery-save-bar-message`, node => {
      const rgb = getComputedStyle(node).color.match(/[\d.]+/g).slice(0, 3).map(Number);
      return rgb.every(channel => channel > 180);
    }), "Dark save-bar text has clear contrast against its neutral dark surface");
    await page.screenshot({ path: path.join(output, "settings-unsaved-dark-mobile.png"), fullPage: true });
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    assert.equal(await page.$eval(bar(mobile), node => getComputedStyle(node).animationName), "none");
    await button("Discard", bar(mobile));
    await waitStatus(mobile, "saved");
    assert.equal(await beforeUnloadBlocked(), false);
    await page.reload();
    await waitStatus(mobile, "saved");
    assert.equal(await page.$eval(holdToggle(mobile), node => node.getAttribute("aria-checked")), "false");
    assert.equal(
      requests.filter((request) => request.path.includes("/email/deliver"))
        .length,
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: persistent save status and sticky bar, discard, normalized baseline, duplicate-save prevention, failed/network saves and retry, protected-flow draft preservation, navigation choices, beforeunload cleanup, shared desktop/mobile draft, plus OTP/PIN and hold regressions.",
    );
  } catch (error) {
    console.error(error);
    if (browser) {
      const pages = await browser.pages();
      await pages.at(-1)?.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
    }
    throw error;
  } finally {
    if (browser) {
      const cleanup = setTimeout(() => browser.process()?.kill(), 10000);
      try { await browser.close(); } finally { clearTimeout(cleanup); }
    }
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

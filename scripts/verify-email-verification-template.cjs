/* Isolated email rendering and Gmail transport checks. No live mail or credentials. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const createLoader = require("./search-test-loader.cjs");
const load = createLoader();
const { renderVerificationEmail } = load("lib/email-verification-template.ts");
const { deliverThroughGmail } = load("lib/server/gmail-delivery.ts");
const output = path.resolve(__dirname, "../tmp/email-verification-template");
const sample = {
  verificationCode: "001234",
  expiryMinutes: 5,
  purpose: "send-pin-update",
};

function mimeParts(raw) {
  const message = Buffer.from(raw, "base64url").toString("utf8");
  const decode = type => {
    const part = message.match(new RegExp(`Content-Type: text/${type}; charset=UTF-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([^\\r]+)`));
    assert(part, `A base64 ${type} alternative is present`);
    return Buffer.from(part[1], "base64").toString("utf8");
  };
  return { message, html: decode("html"), text: decode("plain") };
}

async function main() {
  const email = renderVerificationEmail(sample);
  assert(email.html.includes("<strong>001234</strong>"));
  assert(email.html.includes("This code expires in 5 minutes."));
  assert(email.text.includes("Your verification code is 001234."));
  assert(email.text.includes("change your Email Delivery Send PIN"));
  assert(email.subject.includes("Send PIN change verification code"));
  assert(!email.subject.includes(sample.verificationCode));
  assert(!email.html.includes("box-shadow"));
  assert(!email.html.includes("border-radius"));
  assert(!email.html.includes("<script"));
  assert(!email.html.includes("<img"), "Rendering does not depend on remote images");
  assert(!email.html.includes("Best Regards"));
  assert.throws(() => renderVerificationEmail({ ...sample, verificationCode: "12345" }));
  assert.throws(() => renderVerificationEmail({ ...sample, expiryMinutes: 0 }));
  const dynamic = renderVerificationEmail({
    ...sample,
    expiryMinutes: 1,
    purpose: "delivery",
    messageCount: 32,
    workflowName: 'Workflow: <img src=x onerror="alert(1)"> & clients',
    emailType: "reminder",
    brand: { name: "Brand <&>", category: "Team & Support", supportEmail: "help+otp@example.com", address: "12 <Main> Street" },
  });
  assert(dynamic.html.includes("This code expires in 1 minute."));
  assert(dynamic.html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  assert(!dynamic.html.includes("<img"));
  assert(dynamic.html.includes("Brand &lt;&amp;&gt;"));
  assert(dynamic.html.includes("mailto:help%2Botp%40example.com"));
  assert(dynamic.text.includes("help+otp@example.com"));
  assert.throws(() => renderVerificationEmail({ ...sample, brand: { supportEmail: 'x" onmouseover="alert(1)' } }));
  const purposeCases = [
    ["delivery", "Approve email delivery", "Email delivery verification code", "delivery of 32 client emails"],
    ["send-pin-update", "Verify Send PIN change", "Send PIN change verification code", "change your Email Delivery Send PIN"],
    ["approval-email-verify", "Verify your approval email", "Approval email verification code", "verifies this email address"],
    ["approval-email-change", "Confirm approval email change", "Approval email change verification code", "change your delivery approval email"],
    ["settings-update", "Verify delivery settings", "Delivery settings verification code", "email delivery protection settings"],
  ];
  const purposeEmails = purposeCases.map(([purpose, headline, subject, body]) => {
    const result = renderVerificationEmail({ ...sample, purpose, messageCount: 32 });
    assert(result.html.includes(`>${headline}</h1>`));
    assert(result.subject.includes(subject));
    assert(result.text.includes(body));
    assert.equal((result.text.match(/\b001234\b/g) || []).length, 1);
    assert(!result.subject.includes(sample.verificationCode));
    assert(!result.html.includes(purpose === "delivery" ? 'purpose="delivery"' : purpose), "Raw backend labels stay out of copy");
    return { purpose, ...result };
  });
  const draft = renderVerificationEmail({ ...sample, purpose: "delivery", mode: "draft", messageCount: 1 });
  assert(draft.html.includes("Approve Gmail drafts"));
  assert(draft.text.includes("create Gmail drafts for 1 client email."));
  const unknown = renderVerificationEmail({ ...sample, purpose: "unknown_internal_purpose" });
  assert(unknown.html.includes("Your verification code"));
  assert(!unknown.html.includes("unknown_internal_purpose"));

  const names = ["GMAIL_OAUTH_CLIENT_ID", "GMAIL_OAUTH_CLIENT_SECRET", "GMAIL_OAUTH_REFRESH_TOKEN", "GMAIL_USER"];
  const previous = names.map(name => process.env[name]);
  const originalFetch = global.fetch;
  const requests = [];
  try {
    names.forEach(name => { process.env[name] = name === "GMAIL_USER" ? "sender@example.com" : "isolated-fixture"; });
    global.fetch = async (url, options) => {
      if (options.body instanceof ReadableStream) options = { ...options, body: await new Response(options.body).text() };
      requests.push({ url: String(url), options });
      const data = String(url).includes("oauth2") ? { access_token: "fixture-token" }
        : String(url).includes("settings/sendAs") ? { signature: '<div id="gmail-signature">Existing client signature</div>' }
        : { id: "fixture-message", threadId: "fixture-thread" };
      return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    await deliverThroughGmail({ to: ["approval@example.com"], cc: [], mode: "send", ...email, appendDefaultSignature: false });
    assert(!requests.some(request => request.url.includes("settings/sendAs")), "OTP sends skip the signature endpoint entirely");
    const sent = requests.find(request => request.url.endsWith("messages/send"));
    const parts = mimeParts(JSON.parse(sent.options.body).raw);
    assert.equal(parts.html, email.html);
    assert.equal(parts.text, email.text);
    const subject = Buffer.from(parts.message.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)[1], "base64").toString("utf8");
    assert.equal(subject, email.subject);
    assert(!parts.html.includes("gmail-signature"));
    assert(parts.message.includes("To: approval@example.com"));
    requests.length = 0;
    await deliverThroughGmail({ to: ["client@example.com"], cc: [], subject: "Client fixture", mode: "draft", html: "<html><body>Client content</body></html>" });
    assert(requests.some(request => request.url.includes("settings/sendAs")), "Client emails retain their default signature");
    const drafted = requests.find(request => request.url.endsWith("/drafts"));
    const raw = Buffer.from(JSON.parse(drafted.options.body).message.raw, "base64url").toString("utf8");
    const html = Buffer.from(raw.match(/Content-Type: text\/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([^\r]+)/)[1], "base64").toString("utf8");
    assert(html.includes('id="gmail-signature"'));
    assert(html.includes("Client content<br><br>"));
  } finally {
    global.fetch = originalFetch;
    names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; });
  }

  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "verification-email.html"), email.html);
  fs.writeFileSync(path.join(output, "verification-email.txt"), email.text);
  const delivery = renderVerificationEmail({ ...sample, purpose: "delivery", mode: "send", messageCount: 32 });
  fs.writeFileSync(path.join(output, "delivery-approval.html"), delivery.html);
  for (const email of purposeEmails) {
    fs.writeFileSync(path.join(output, `${email.purpose}.html`), email.html);
    fs.writeFileSync(path.join(output, `${email.purpose}.txt`), email.text);
  }

  if (process.argv.includes("--render")) {
    const puppeteer = require("puppeteer-core");
    const browser = await puppeteer.launch({
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
      headless: true,
      userDataDir: fs.mkdtempSync(path.join(output, "profile-")),
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on("request", request => request.abort());
      for (const width of [1440, 390, 320]) {
        await page.setViewport({ width, height: 960, deviceScaleFactor: 1 });
        await page.setContent(email.html);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}px`);
        assert.equal(await page.$eval("[data-verification-code]", node => node.textContent), "001234");
        assert.equal(await page.$eval("[data-verification-code] strong", node => node.childNodes.length), 1, "The selectable code is a single text node");
        assert(await page.$eval("[data-verification-code]", node => node.getBoundingClientRect().bottom < 560), "The code is visible on a phone without scrolling");
        await page.screenshot({ path: path.join(output, `verification-${width}.png`), fullPage: true });
      }
      // Email readers that discard style tags still receive the inline layout.
      await page.setContent(email.html.replace(/<style>[\s\S]*?<\/style>/, ""));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Inline fallback fits a 320px screen");
      await page.screenshot({ path: path.join(output, "verification-inline-fallback.png"), fullPage: true });
      await page.setContent(delivery.html);
      await page.screenshot({ path: path.join(output, "delivery-approval-mobile.png"), fullPage: true });
      for (const email of purposeEmails) {
        await page.setContent(email.html);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${email.purpose} fits mobile`);
        assert.equal(await page.$eval("[data-verification-code]", node => node.textContent), "001234");
        await page.screenshot({ path: path.join(output, `${email.purpose}-mobile.png`), fullPage: true });
      }
    } finally { await browser.close(); }
  }
  console.log("PASS: minimalist email, purpose-aware subjects/headlines/copy, contiguous OTP and natural-language plain text, dynamic context/expiry/brand, escaping, MIME transport and signature isolation. Previews use a fictional code; no live email was sent.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });

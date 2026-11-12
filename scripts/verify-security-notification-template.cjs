/* Template/transport/preview tests only. No .env loading, live mail or database access. */
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const createLoader = require("./search-test-loader.cjs");
const load = createLoader();
const { renderSecurityNotificationEmail } = load("lib/security-notification-template.ts");
const { deliverThroughGmail } = load("lib/server/gmail-delivery.ts");
const fixtures = require("./fixtures/security-notifications.cjs");
const output = path.resolve(__dirname, "../outputs/security-email-previews");
const expected = ["New sign-in to your account", "Unusual sign-in detected", "New access request", "New sign-in to your account", "Unsuccessful sign-in attempt", "Google sign-in activity", "Access request still pending", "Account access was blocked", "Your password was changed", "Your email was changed", "Recovery Gmail was changed", "Two-factor authentication enabled", "Two-factor authentication disabled", "Recovery codes were replaced", "Recovery code used to sign in", "New sign-in to your account"];

function mime(raw) {
  const split = raw.indexOf("\r\n\r\n");
  const header = raw.slice(0, split), body = raw.slice(split + 4);
  const type = header.match(/Content-Type: ([^;\r\n]+)/i)?.[1];
  const cid = header.match(/Content-ID: <([^>]+)>/i)?.[1];
  const boundary = header.match(/boundary="([^"]+)"/i)?.[1];
  if (boundary) return { type, header, children: body.split(`--${boundary}`).slice(1, -1).map(part => mime(part.replace(/^\r\n/, "").replace(/\r\n$/, ""))) };
  return { type, cid, header, bytes: /Content-Transfer-Encoding: base64/i.test(header) ? Buffer.from(body.replace(/\s/g, ""), "base64") : Buffer.from(body) };
}
function previewHtml(email) {
  return email.html.replace(/cid:([^"\s]+)/g, (_, cid) => {
    const image = email.inlineImages.find(image => image.cid === cid);
    assert(image, `Missing image ${cid}`);
    return `data:${image.mimeType};base64,${image.contentBase64}`;
  });
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const emails = fixtures.map((fixture, index) => {
    const email = renderSecurityNotificationEmail(fixture);
    assert.equal(email.headline, expected[index]);
    assert(email.html.includes('max-width:540px')); assert(email.html.includes('<!--[if mso]>'));
    assert(email.html.includes('role="presentation"')); assert(email.html.includes('bgcolor="#f3f6fa"'));
    assert(!/<script|<svg|<iframe|<link|@import|linear-gradient|font-face/i.test(email.html));
    assert(!/\p{Extended_Pictographic}/u.test(email.html), "Professional icons must not be emoji");
    assert(!/<img[^>]+src="https?:/i.test(email.html), "Graphics must not require a remote host");
    assert.match(email.text, /31 October 2026 · 1:17 PM IST/);
    const refs = [...email.html.matchAll(/src="cid:([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual([...new Set(refs)].sort(), email.inlineImages.map(image => image.cid).sort());
    for (const image of email.inlineImages) assert.equal(Buffer.from(image.contentBase64, "base64").subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert(Buffer.byteLength(email.html) < 24000); assert(email.inlineImages.reduce((sum, image) => sum + Buffer.from(image.contentBase64, "base64").length, 0) < 12000);
    assert(["/dashboard/sessions", "/dashboard/settings?tab=access"].includes(email.actionUrl.replace("https://nextgen.example.com", "")));
    fs.writeFileSync(path.join(output, `${fixture.slug}.email.html`), email.html);
    fs.writeFileSync(path.join(output, `${fixture.slug}.html`), previewHtml(email));
    fs.writeFileSync(path.join(output, `${fixture.slug}.txt`), email.text);
    return { ...email, slug: fixture.slug };
  });
  assert.match(emails[4].html, /Claimed account · Unverified/); assert.match(emails[4].text, /Claimed email \/ login ID \(unverified\)/);
  assert.notEqual(renderSecurityNotificationEmail(fixtures[0]).inlineImages[0].cid, emails[0].inlineImages[0].cid, "CID references are unique per message");
  assert.match(emails[15].html, /Unavailable/); assert.match(emails[15].text, /localhost/);
  assert(!/\b(?:undefined|null|Unknown)\b/.test(emails[15].html));
  const escaped = renderSecurityNotificationEmail({ ...fixtures[0], name: '<script>alert("name")</script>', email: 'claimed"@example.com', reason: '<img src=x onerror="alert(1)">', metadata: { userAgent: "unrecognized-agent", ip: '" onmouseover="bad', location: '<svg onload="bad">' } });
  assert(!escaped.html.includes("<script>")); assert(escaped.html.includes("&lt;script&gt;")); assert(escaped.html.includes("&lt;img")); assert(escaped.html.includes("&lt;svg"));
  for (const appUrl of [undefined, "javascript:alert(1)", "data:text/html,test", "https://user:secret@example.com"]) {
    const email = renderSecurityNotificationEmail({ ...fixtures[0], appUrl });
    assert.equal(email.actionUrl, ""); assert(!email.html.includes("href="));
  }
  assert.equal(renderSecurityNotificationEmail({ ...fixtures[0], appUrl: "https://erp.example.com/unused?token=must-not-leak#fragment" }).actionUrl, "https://erp.example.com/dashboard/sessions");
  const invalidDate = renderSecurityNotificationEmail({ ...fixtures[0], occurredAt: "invalid", name: null, email: undefined });
  assert.match(invalidDate.text, /Time: Unavailable/); assert(!invalidDate.html.includes(">null<"));

  const envNames = ["GMAIL_OAUTH_CLIENT_ID", "GMAIL_OAUTH_CLIENT_SECRET", "GMAIL_OAUTH_REFRESH_TOKEN", "GMAIL_USER"];
  const previous = envNames.map(name => process.env[name]);
  const originalFetch = global.fetch;
  const requests = [];
  try {
    envNames.forEach(name => { process.env[name] = name === "GMAIL_USER" ? "fixture-sender@example.com" : "fixture-only"; });
    global.fetch = async (url, options) => {
      if (options.body instanceof ReadableStream) options = { ...options, body: await new Response(options.body).text() };
      requests.push({ url: String(url), options });
      return Response.json(String(url).includes("oauth2") ? { access_token: "fixture-only-token" } : { id: "fixture-message" });
    };
    for (const email of emails.slice(0, 3)) {
      requests.length = 0;
      await deliverThroughGmail({ to: ["fixture-recipient@example.com"], cc: [], ...email, mode: "send", appendDefaultSignature: false, attachments: [{ filename: "fixture.txt", mimeType: "text/plain", content: Buffer.from("Existing regular attachments still work") }] });
      assert(!requests.some(request => request.url.includes("settings/sendAs")));
      const sent = requests.find(request => request.url.endsWith("messages/send"));
      const raw = Buffer.from(JSON.parse(sent.options.body).raw, "base64url").toString("utf8");
      assert(raw.split("\r\n").every(line => line.length <= 998), "New CID messages must respect email line limits");
      const tree = mime(raw), alternative = tree.children[0], related = alternative.children[1];
      assert.equal(tree.type, "multipart/mixed"); assert.equal(alternative.type, "multipart/alternative"); assert.equal(related.type, "multipart/related");
      assert.match(related.header, /type="text\/html"/);
      assert.equal(alternative.children[0].bytes.toString(), email.text); assert.equal(related.children[0].bytes.toString(), email.html);
      assert.equal(tree.children[1].bytes.toString(), "Existing regular attachments still work");
      assert.equal(related.children.length, email.inlineImages.length + 1);
      for (const image of email.inlineImages) {
        const part = related.children.find(part => part.cid === image.cid);
        assert(part); assert.match(part.header, /Content-Disposition: inline/); assert.equal(part.type, "image/png");
        assert.deepEqual(part.bytes, Buffer.from(image.contentBase64, "base64"));
      }
      // Export a clean native-email preview with only its own inline graphics.
      requests.length = 0;
      await deliverThroughGmail({ to: ["fixture-recipient@example.com"], cc: [], ...email, mode: "send", appendDefaultSignature: false });
      const previewSent = requests.find(request => request.url.endsWith("messages/send"));
      fs.writeFileSync(path.join(output, `${email.slug}.eml`), Buffer.from(JSON.parse(previewSent.options.body).raw, "base64url"));
    }
  } finally {
    global.fetch = originalFetch;
    envNames.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; });
  }
  // Account OTPs use the same sender with the shared verification presentation.
  const captured = [];
  const accountMail = createLoader({ "server-only": {}, "next/server": { after() {} }, "./gmail-delivery": { deliverThroughGmail: async input => captured.push(input) } })("lib/server/account-security-mail.ts");
  const { renderVerificationEmail } = load("lib/email-verification-template.ts");
  for (const purpose of ["account-login", "account-password-change"]) {
    const otp = renderVerificationEmail({ verificationCode: "001234", expiryMinutes: 5, purpose, subjectPrefix: "NextGen security: " });
    await accountMail.sendAccountMail("fixture@example.com", otp);
    const sent = captured.at(-1);
    assert.equal(sent.html, otp.html);
    assert.equal(sent.text, otp.text);
    assert.equal(sent.subject, otp.subject);
    assert.equal(sent.inlineImages, undefined);
    assert.equal(sent.appendDefaultSignature, false);
  }

  const titles = ["Successful login", "Suspicious login", "Google access request"];
  const gallery = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NextGen security email previews</title><style>body{margin:0;background:#edf1f5;color:#202b38;font:14px Arial,sans-serif;padding:32px}h1{font-size:24px;margin:0 0 8px}p{color:#536171;margin:0 0 26px}.gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;max-width:1820px}.sample h2{font-size:14px;font-weight:600;margin:0 0 12px}.sample iframe{width:100%;height:1180px;border:1px solid #e1e6ed;background:#fff;border-radius:8px;box-sizing:border-box}@media(max-width:1000px){.gallery{grid-template-columns:1fr;max-width:620px}}</style></head><body><h1>NextGen Solutions · Security notifications</h1><p>Fictional sample data · Desktop and mobile previews · No live email sent</p><div class="gallery">${emails.slice(0, 3).map((email, index) => `<section class="sample"><h2>${titles[index]}</h2><iframe title="${titles[index]}" src="${email.slug}.html"></iframe></section>`).join("")}</div></body></html>`;
  fs.writeFileSync(path.join(output, "index.html"), gallery);
  if (process.argv.includes("--render")) {
    const puppeteer = require("puppeteer-core");
    const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true,  args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    try {
      const page = await browser.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.setRequestInterception(true);
      page.on("request", request => request.url().startsWith("data:") || request.url().startsWith("file:") ? request.continue() : request.abort());
      for (const email of [...emails.slice(0, 3), emails[4], emails[15]]) {
        for (const width of [640, 390, 320]) {
          await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
          await page.setContent(previewHtml(email));
          await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${email.slug} overflows at ${width}px`);
          assert.equal(await page.$eval("h1", node => node.textContent), email.headline);
          await page.screenshot({ path: path.join(output, `${email.slug}-${width}.png`), fullPage: true });
        }
      }
      const long = renderSecurityNotificationEmail({ ...fixtures[0], email: `${"a".repeat(150)}@example.com`, metadata: { ...fixtures[0].metadata, ip: "2001:db8:85a3:0000:0000:8a2e:0370:7334", location: "A very long region name with a long city and administrative area, India" } });
      await page.setContent(previewHtml(long).replace(/<style>[\s\S]*?<\/style>/, "").replace(/<img\b[^>]*>/g, ""));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Inline-only/blocked-image fallback must fit mobile");
      assert.match(await page.$eval("body", node => node.innerText), /IP address/);
      await page.screenshot({ path: path.join(output, "images-blocked-mobile.png"), fullPage: true });
      assert.deepEqual(errors, []);
      await page.setViewport({ width: 1880, height: 1500, deviceScaleFactor: 1 });
      await page.goto(`file:///${path.join(output, "index.html").replaceAll("\\", "/")}`, { waitUntil: "load" });
      await page.screenshot({ path: path.join(output, "overview.png"), fullPage: true });
    } finally { await browser.close(); }
  }
  console.log(`PASS: ${emails.length} event designs, escaping, missing values, IST, authenticated-page actions, embedded PNGs, multipart/related CID transport, attachment compatibility and shared account OTP presentation${process.argv.includes("--render") ? ", desktop/mobile/blocked-image browser previews" : ""}.`);
  console.log(`Previews: ${output}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });

// Real Nodemailer stream transport, with the production utility and no network.
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer8');
const createLoader = require('./search-test-loader.cjs');
async function main() {
  process.env.GMAIL_USER = 'fixture@example.invalid';
  process.env.GMAIL_APP_PASSWORD = 'synthetic-test-only';
  let mime, calls = 0, fail = false, session = null;
  const logs = [];
  const load = createLoader({
    'next-auth': { getServerSession: async () => session },
    '@/lib/auth': { authOptions: {} },
    '@/lib/mongoose': { connectDB: async () => {} },
    '@/models/EmailLog': { create: async entry => logs.push(entry) },
    nodemailer8: { createTransport(options) {
      assert.equal(options.service, 'gmail'); assert.equal(options.auth.user, 'fixture@example.invalid');
      assert.equal(options.disableFileAccess, true); assert.equal(options.disableUrlAccess, true);
      const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows',
        disableFileAccess: options.disableFileAccess, disableUrlAccess: options.disableUrlAccess });
      return { async sendMail(payload) {
        calls++; if (fail) throw Error('Synthetic SMTP failure at C:/fixture/private.txt');
        const info = await transport.sendMail(payload); mime = info.message.toString(); return info;
      } };
    } },
  });
  const { sendEmail } = load('utils/email.ts');
  const payload = { to: 'recipient@example.invalid', subject: 'Synthetic statement', html: '<p>Amount: 1,234.50</p>', attachments: [{ filename: 'statement.txt', content: Buffer.from('exact synthetic attachment') }] };
  assert.deepEqual(await sendEmail(payload), { success: true, message: 'Email sent successfully' });
  assert.match(mime, /To: recipient@example.invalid/); assert.match(mime, /Subject: Synthetic statement/);
  assert(mime.includes('Amount: 1,234.50')); assert(mime.includes('statement.txt'));
  assert(mime.includes(Buffer.from('exact synthetic attachment').toString('base64')));
  for (const attachment of [
    { filename: '../private.txt', content: Buffer.from('fixture') },
    { filename: 'nested\\private.txt', content: Buffer.from('fixture') },
    { filename: 'C:private.txt', content: Buffer.from('fixture') },
    { filename: 'private.txt', content: { path: 'C:/fixture/private.txt' } },
    { filename: 'private.txt', content: 'literal', path: 'C:/fixture/private.txt' },
  ]) assert.deepEqual(await sendEmail({ ...payload, attachments: [attachment] }), { success: false, message: 'Invalid email details' });
  assert.equal(calls, 1);

  const { POST } = load('app/api/email/send/route.ts');
  const post = (body, raw = false) => POST(new Request('http://fixture.invalid/api/email/send', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ? body : JSON.stringify(body),
  }));
  const fields = { to: payload.to, subject: payload.subject };
  assert.equal((await post(fields)).status, 401);
  session = { user: { id: 'ordinary-user', role: 'user' } };
  for (const input of [
    { quotationHtml: { path: 'C:/fixture/private.txt' } },
    { reminderHtml: { path: '../../fixture/private.txt' } },
    { reminderHtml: { href: 'http://fixture.invalid/private.txt' } },
    { attachments: [{ filename: 'private.txt', path: '../../fixture/private.txt' }] },
    { raw: { path: 'C:/fixture/private.txt' } },
    { to: { address: 'recipient@example.invalid' } }, { to: [['recipient@example.invalid']] },
    { to: 'recipient@example.invalid\r\nBcc: other@example.invalid' },
    { subject: 'Statement\r\nBcc: other@example.invalid' },
    { message: { path: 'C:/fixture/private.txt' } }, { logClientId: { $ne: '' } },
    { logType: 'unknown' },
  ]) {
    const rejected = await post({ ...fields, ...input });
    assert.equal(rejected.status, 400);
    assert.deepEqual(await rejected.json(), { error: 'Invalid email details' });
  }
  assert.equal((await post('{', true)).status, 400);
  assert.equal(calls, 1); assert.equal(logs.length, 0);
  for (const body of [
    { ...fields, reminderHtml: payload.html, logType: 'payment_reminder', logClientId: 'FIXTURE' },
    { ...fields, quotationHtml: payload.html, to: [payload.to, 'other@example.invalid'] },
    { ...fields, message: 'Amount: 1,234.50\nThanks' },
  ]) {
    const result = await post(body);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { success: true, message: 'Email sent successfully' });
    assert(mime.replace(/=\r?\n/g, '').includes('Amount: 1,234.50'));
  }
  assert.deepEqual(logs.map(({ type, status }) => [type, status]), [['payment_reminder', 'sent'], ['quotation', 'sent'], ['custom', 'sent']]);
  fail = true; const errorLog = console.error; console.error = () => {};
  try {
    const failed = await post({ ...fields, reminderHtml: payload.html });
    assert.equal(failed.status, 500);
    assert.deepEqual(await failed.json(), { error: 'Failed to send email' });
  } finally { console.error = errorLog; }
  delete process.env.GMAIL_APP_PASSWORD;
  assert.deepEqual(await sendEmail(payload), { success: false, message: 'Email service is not configured' });
  assert.equal(calls, 5);
  console.log('PASS: actual MIME and permitted attachment bytes, authenticated delivery and logging, path/URL/traversal and header validation, safe failures; no SMTP network connection.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

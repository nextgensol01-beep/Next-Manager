// Actual PDF handler and Chromium output; synthetic HTML/session, no DB or email.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const createLoader = require('./search-test-loader.cjs');

async function verifyBlockedRequests(print) {
  let connections = 0;
  const server = http.createServer((req, res) => {
    res.writeHead(302, { Location: '/redirected' }).end();
  });
  server.on('connection', () => connections++);
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    const origin = `http://127.0.0.1:${port}`;
    const html = `<!doctype html><html><head>
      <base href="${origin}/">
      <link rel="preconnect" href="${origin}">
      <link rel="dns-prefetch" href="//localhost">
      <link rel="stylesheet" href="${origin}/redirect">
      <meta http-equiv="refresh" content="0;url=${origin}/redirect">
      <style>@import url('${origin}/redirect'); h1 { background-image:url('${origin}/redirect') }</style>
      <script>fetch('${origin}/script'); window.open('${origin}/popup');</script>
      </head><body><h1>Quotation fixture</h1>
      <img src="${origin}/redirect">
      <img src="//localhost:${port}/redirect">
      <img src="http://2130706433:${port}/decimal">
      <img src="http://0x7f000001:${port}/hex">
      <img src="http://fixture@127.0.0.1:${port}/userinfo">
      <img src="https://external.fixture.invalid/image">
      <iframe src="${origin}/frame"></iframe>
      <iframe srcdoc="&lt;img src='${origin}/nested'&gt;"></iframe>
      <object data="file:///C:/synthetic-quotation-test/fixture.html"></object>
      </body></html>`;
    const response = await print(html);
    assert.equal(response.status, 200);
    assert.equal(connections, 0, 'Quotation HTML must not open a network connection');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function main() {
  let session = null;
  const load = createLoader({ 'next-auth': { getServerSession: async () => session }, '@/lib/auth': { authOptions: {} } });
  const { POST } = load('app/api/quotation/pdf/route.ts');
  const request = body => new Request('http://localhost/api/quotation/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await POST(request({}))).status, 401);
  session = { user: { id: 'fixture' } };
  const invalid = await POST(request({ html: '' }));
  assert.equal(invalid.status, 400); assert.deepEqual(await invalid.json(), { error: 'Quotation HTML is required' });
  const malformed = new Request('http://localhost/api/quotation/pdf', { method: 'POST', body: '{' });
  assert.equal((await POST(malformed)).status, 400);
  const html = '<!doctype html><html><head><style>@page{size:A4;margin:20mm}body{font:14px Arial}h1{color:#1e40af}</style></head><body><h1>Nextgen Solutions</h1><p>Synthetic quotation / FY 2025-26</p><table><tr><td>Consultancy</td><td>1000.00</td></tr></table></body></html>';
  const response = await POST(request({ html })); assert.equal(response.status, 200);
  const body = await response.json(); assert.deepEqual(Object.keys(body), ['contentBase64']);
  const bytes = Buffer.from(body.contentBase64, 'base64'), text = bytes.toString('latin1');
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert(text.includes('%%EOF')); assert(/\/Type\s*\/Page\b/.test(text));
  assert(bytes.length > 1000);
  const output = path.join(__dirname, '../tmp/quotation-pdf-tests'); fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'quotation.pdf'), bytes);
  const { buildQuotationHTML } = load('utils/quotationTemplate.ts');
  const template = fs.readFileSync(path.join(__dirname, '../templates/quotation.html'), 'utf8');
  const quotationHtml = buildQuotationHTML(template, {
    quoteNumber: 'SYNTHETIC-01', clientName: 'Fixture Packaging & Recycling',
    clientAddress: 'Synthetic address\nFixture district', clientGst: 'FIXTURE', clientState: 'Delhi',
    financialYear: '2025-26', generatedAt: '2026-01-10T12:00:00Z', validityDays: 30,
    items: Array.from({ length: 25 }, (_, i) => ({ description: `Fixture item ${i + 1}`, category: 'Category I',
      type: 'Recycling', quantity: 1, rate: 1000, gstPercent: 18, subtotal: 1000, gstAmount: 180, totalAmount: 1180 })),
    itemsSubtotal: 25000, itemsGst: 4500, consultationCharges: 1000, consultationGstPercent: 18,
    consultationGstAmount: 180, governmentFees: 100, grandTotal: 30780, notes: 'Synthetic notes.\nSecond line.',
  });
  const quotation = await POST(request({ html: quotationHtml }));
  assert.equal(quotation.status, 200);
  const quotationBytes = Buffer.from((await quotation.json()).contentBase64, 'base64');
  assert.match(quotationBytes.toString('latin1'), /\/Type\s*\/Page\b/);
  fs.writeFileSync(path.join(output, 'rendered-quotation.html'), quotationHtml);
  fs.writeFileSync(path.join(output, 'rendered-quotation.pdf'), quotationBytes);
  await verifyBlockedRequests(html => POST(request({ html })));
  let closed = false;
  const failureRoute = createLoader({ 'next-auth': { getServerSession: async () => session }, '@/lib/auth': { authOptions: {} },
    'puppeteer-core': { launch: async () => ({ newPage: async () => { throw Error('Fixture print failure'); }, close: async () => { closed = true; } }) },
  })('app/api/quotation/pdf/route.ts');
  const errorLog = console.error; console.error = () => {};
  try {
    const failed = await failureRoute.POST(request({ html }));
    assert.equal(failed.status, 500); assert.deepEqual(await failed.json(), { error: 'Failed to generate quotation PDF' }); assert(closed);
  } finally { console.error = errorLog; }
  console.log('PASS: authenticated Chromium quotation PDF, actual template, zero synthetic loopback connections, safe errors and browser cleanup.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

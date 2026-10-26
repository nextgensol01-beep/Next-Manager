/* Isolated benchmark: actual worker/controller/materializer/MIME/Drive download code.
 * All DB calls use in-memory fixtures. Gmail is a loopback HTTP sink; Drive files
 * are synthetic local files. No .env, live account, or production DB is read. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const dc = require('node:diagnostics_channel');
const root = path.resolve(__dirname, '..');

async function run({ variant = 'after', count = 15, sizeMiB = 1, history = 30 } = {}) {
  assert(['before', 'after'].includes(variant));
  assert([1, 5, 15].includes(count));
  assert([0.25, 2, 8].includes(sizeMiB));
  // The original Drive module initialized the complete SDK even before a download.
  if (variant === 'before') require(['google', 'apis'].join(''));
  const f = require('./verify-email-delivery-security.cjs');
  const createLoader = require('./search-test-loader.cjs');
  const tables = ['Campaign', 'Tracker', 'Entry', 'EmailLog', 'Gate', 'Approval', 'Audit', 'Settings', 'WorkItem'];
  for (const table of tables) f[table].rows.length = 0;
  const docs = f.mocks['@/models/Document']; docs.rows.length = 0;
  process.env.NEXTAUTH_SECRET = 'isolated-benchmark-attachment-proof-secret';
  for (const key of ['GMAIL_OAUTH_CLIENT_ID', 'GMAIL_OAUTH_CLIENT_SECRET', 'GMAIL_OAUTH_REFRESH_TOKEN', 'GOOGLE_DRIVE_REFRESH_TOKEN']) process.env[key] = 'isolated-benchmark';
  process.env.GMAIL_USER = 'benchmark@example.invalid';
  delete process.env.EMAIL_DELIVERY_BATCH_SIZE;
  delete process.env.EMAIL_DELIVERY_MEMORY_DIAGNOSTICS;
  const filesDir = path.join(root, '.artifacts/email-memory/files');
  fs.mkdirSync(filesDir, { recursive: true });
  const files = new Map();
  for (let i = 0; i < count; i++) {
    const file = path.join(filesDir, `${sizeMiB}MiB-client-${i}.bin`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, Buffer.alloc(sizeMiB * 1024 * 1024, 31 + i));
    files.set('drive-' + i, file);
  }
  let sends = 0, transferred = 0;
  const sink = http.createServer(async (req, res) => {
    for await (const chunk of req) transferred += chunk.length;
    sends++;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: `mock-${sends}`, threadId: `thread-${sends}` }));
  });
  sink.listen(0, '127.0.0.1'); await once(sink, 'listening');
  const nativeFetch = global.fetch;
  global.fetch = async (url, options) => {
    const address = String(url);
    if (address === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'mock-token' });
    if (address.includes('/settings/sendAs/')) return Response.json({ signature: '' });
    assert.equal(address, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', 'All outgoing calls must be mocked');
    return nativeFetch(`http://127.0.0.1:${sink.address().port}/gmail`, options).catch(error => { console.error(error.message, error.cause?.message); throw error; });
  };
  const samples = [];
  const measure = stage => samples.push({ stage, ...process.memoryUsage() });
  global.__emailMemoryMark = (stage, value) => { measure(stage); return value; };
  const subscribe = value => samples.push(value);
  dc.channel('email-delivery.memory').subscribe(subscribe);
  const sourceOverrides = {};
  if (variant === 'before') {
    for (const name of ['tracker-email-worker', 'tracker-email-attachments', 'gmail-delivery', 'google-drive-documents', 'email-delivery-controller', 'email-delivery-jobs', 'tracker-attachment-snapshot']) {
      let source = fs.readFileSync(path.join(root, 'scripts/fixtures/email-memory-before', name + '.ts.txt'), 'utf8');
      // Identity wrappers sample synchronous allocations without retaining extra payloads.
      if (name === 'gmail-delivery') source = source.replace('Buffer.from(lines.join("\\r\\n")).toString("base64").replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "")',
        'globalThis.__emailMemoryMark("mime.encode.after", globalThis.__emailMemoryMark("mime.base64", Buffer.from(globalThis.__emailMemoryMark("mime.join", lines.join("\\r\\n")))).toString("base64").replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, ""))');
      if (name === 'tracker-email-attachments') source = source.replace('  const documents =', '  globalThis.__emailMemoryMark("document.lookup.before");\n  const documents =')
        .replace('  const pinned =', '  globalThis.__emailMemoryMark("document.lookup.after");\n  const pinned =')
        .replace('      bytes = await downloadDriveFile(document.driveFileId, input.signal);', '      globalThis.__emailMemoryMark("drive.download.before");\n      bytes = await downloadDriveFile(document.driveFileId, input.signal);\n      globalThis.__emailMemoryMark("drive.download.after");');
      sourceOverrides[`lib/server/${name}.ts`] = source;
    }
  }
  const mocks = { ...f.mocks, googleapis: { google: {
    auth: { OAuth2: class { setCredentials() {} } },
    drive: () => ({ files: { get: async (request, options) => {
      const file = files.get(request.fileId); assert(file, 'Only synthetic files may be read');
      if (request.alt === 'media') return { data: options.responseType === 'stream' ? fs.createReadStream(file, { highWaterMark: 64 * 1024, signal: options.signal }) : await fs.promises.readFile(file) };
      const bytes = await fs.promises.readFile(file);
      return { data: { id: request.fileId, mimeType: 'application/octet-stream', size: String(bytes.length), md5Checksum: createHash('md5').update(bytes).digest('hex') } };
    } } }),
  } } };
  mocks['googleapis/build/src/apis/drive'] = { auth: mocks.googleapis.google.auth, drive: mocks.googleapis.google.drive };
  delete mocks['@/lib/server/tracker-email-attachments'];
  delete mocks['@/lib/server/gmail-delivery'];
  delete mocks['./gmail-delivery'];
  const load = createLoader(mocks, sourceOverrides);
  const snapshots = load('lib/server/tracker-attachment-snapshot.ts');
  const controller = load('lib/server/email-delivery-controller.ts');
  const context = f.service.securityContext({ user: { id: 'ADMIN1', email: 'admin@example.com' } }, new Headers());
  const workflow = { id: 'WF1', name: 'Memory fixture', mainFieldKey: 'ready', mainValue: 'Yes', attachments: [{ id: 'file', source: 'client_latest', required: true, financialYear: 'any' }] };
  const tracker = { _id: f.trackerId, name: 'Memory fixture', fields: [{ key: 'ready', type: 'select' }], emailEnabled: true, status: 'active', emailWorkflows: [workflow] };
  f.Tracker.rows.push(tracker);
  const items = [];
  for (let i = 0; i < count; i++) {
    const clientId = 'benchmark-' + i;
    const document = { _id: 'document-' + i, clientId, documentName: `${clientId}.bin`, storageType: 'google-drive', driveFileId: 'drive-' + i, mimeType: 'application/octet-stream', fileSize: sizeMiB * 1024 * 1024, uploadedDate: new Date('2026-10-01') };
    docs.rows.push(document);
    const selected = await snapshots.prepareTrackerAttachmentSelection({ trackerId: f.trackerId, entryId: clientId, clientId, kind: 'initial', workflow, values: { ready: 'Yes' }, documents: [document] });
    items.push({ entryId: clientId, clientId, companyName: clientId, to: [clientId + '@example.invalid'], cc: [], subject: `Synthetic attachment ${i}`, html: `<p>Fixture client ${i}</p>`, attachments: [{ documentId: document._id }], attachmentSnapshot: selected.attachmentSnapshot, status: 'pending' });
    f.Entry.rows.push({ _id: clientId, clientId, trackerId: f.trackerId, values: { ready: 'Yes' } });
  }
  // Unrelated historical clients force the old query to transfer historical bodies.
  for (let h = 0; h < history; h++) f.Campaign.rows.push({ _id: `historical-${h}`, campaignId: `historical-${h}`, trackerId: f.trackerId, workflowId: 'WF1', mode: 'send', mailKind: 'initial', items: Array.from({ length: 15 }, (_, i) => ({ clientId: `other-${h}-${i}`, status: 'sent', html: 'Synthetic history '.repeat(1500), claimedAt: new Date(Date.now() - 12 * 86400000), historyRecordedAt: new Date() })) });
  f.Campaign.rows.push({ _id: 'benchmark-campaign', campaignId: 'benchmark-campaign', trackerId: f.trackerId, workflowId: 'WF1', mailKind: 'initial', mode: 'send', status: 'queued', jobVersion: 2, total: count, completed: 0, failed: 0, items, authorizedBy: context.owner, authorizedAt: new Date(), approvalId: 'mock-approval', batchHash: 'mock-exact-batch', snapshot: { trackerName: tracker.name, fields: tracker.fields, workflow, actor: { owner: context.owner, userId: context.userId, userEmail: context.userEmail } } });
  const claim = await controller.claimDeliveryCoordinator(context, 'benchmark-campaign');
  samples.length = 0;
  global.gc?.();
  measure('campaign.before');
  const start = Date.now();
  const timer = setInterval(() => measure('timer'), 5);
  let batches = 0;
  try {
    let result;
    do {
      result = await controller.processBrowserDeliveryBatch(context, 'benchmark-campaign', claim.coordinatorToken);
      measure('request.complete'); batches++;
      assert(batches <= count + 1, 'Campaign must make forward progress');
    } while (result.state === 'processing');
    assert.equal(result.state, 'done');
    assert.equal(sends, count, JSON.stringify(f.Campaign.rows.at(-1).items.map(item => ({ status: item.status, error: item.error }))));
    assert.equal(result.job.sent, count);
    measure('campaign.after');
    const metrics = ['heapUsed', 'rss', 'external', 'arrayBuffers'];
    const peak = Object.fromEntries(metrics.map(key => [key, Math.max(...samples.map(sample => sample[key]))]));
    return { variant, count, sizeMiB, history, batches, sends, transferred, durationMs: Date.now() - start, baseline: samples[0], peak,
      stages: [...new Set(samples.map(sample => sample.stage))], node: process.version, mode: process.env.NODE_ENV || 'standalone' };
  } finally {
    clearInterval(timer);
    global.fetch = nativeFetch;
    delete global.__emailMemoryMark;
    dc.channel('email-delivery.memory').unsubscribe(subscribe);
    sink.closeAllConnections(); sink.close();
  }
}
module.exports = { run };
if (require.main === module) run({ variant: process.argv[2], count: Number(process.argv[3]), sizeMiB: Number(process.argv[4]) })
  .then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error); process.exitCode = 1; });

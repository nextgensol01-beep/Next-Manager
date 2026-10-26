const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createHash } = require('node:crypto');
const dc = require('node:diagnostics_channel');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const createLoader = require('./search-test-loader.cjs');

async function encodingAndDownloads() {
  const f = require('./verify-email-delivery-security.cjs');
  const samples = []; const onSample = sample => samples.push(sample);
  dc.channel('email-delivery.memory').subscribe(onSample);
  let stream, inputChunks;
  const googleMock = {
    auth: { OAuth2: class { setCredentials() {} } }, drive: () => ({ files: { get: async () => {
      stream = Readable.from(inputChunks); return { data: stream };
    } } }),
  };
  const load = createLoader({ ...f.mocks, 'googleapis/build/src/apis/drive': googleMock });
  const gmail = load('lib/server/gmail-delivery.ts');
  const drive = load('lib/server/google-drive-documents.ts');
  process.env.GMAIL_USER = 'isolated@example.invalid';
  for (const key of ['GMAIL_OAUTH_CLIENT_ID', 'GMAIL_OAUTH_CLIENT_SECRET', 'GMAIL_OAUTH_REFRESH_TOKEN', 'GOOGLE_DRIVE_REFRESH_TOKEN']) process.env[key] = 'isolated-fixture';
  const originalFetch = global.fetch;
  let expected;
  global.fetch = async (url, options) => {
    if (String(url).includes('oauth2.googleapis.com')) return Response.json({ access_token: 'fixture-token' });
    if (String(url).includes('/settings/sendAs/')) return Response.json({ signature: '' });
    const payload = JSON.parse(await new Response(options.body).text());
    const mime = Buffer.from(payload.raw || payload.message.raw, 'base64url').toString();
    const encoded = mime.split('Content-Transfer-Encoding: base64\r\n\r\n').at(-1).split('\r\n--')[0];
    assert.equal(createHash('sha256').update(Buffer.from(encoded, 'base64')).digest('hex'), createHash('sha256').update(expected).digest('hex'));
    return Response.json({ id: 'isolated-message' });
  };
  try {
    for (const size of [1, 2, 3, 49151, 49152, 49153, 8 * 1024 * 1024]) {
      expected = Buffer.alloc(size, size % 251);
      for (const mode of ['draft', 'send']) await gmail.deliverThroughGmail({ to: ['fixture@example.invalid'], cc: [], subject: 'Fixture', html: '<p>Fixture</p>', attachments: [{ filename: 'test.bin', mimeType: 'application/octet-stream', content: expected }], mode });
    }
    expected = Buffer.from('legacy attachment');
    await gmail.deliverThroughGmail({ to: ['fixture@example.invalid'], cc: [], subject: 'Fixture', html: '<p>Fixture</p>', attachments: [{ filename: 'test.bin', mimeType: 'application/octet-stream', contentBase64: expected.toString('base64') }], mode: 'draft' });
    inputChunks = [Buffer.from('abc'), Buffer.from('def')];
    assert.equal((await drive.downloadDriveFile('fixture', undefined, 6)).toString(), 'abcdef');
    assert(stream.destroyed);
    inputChunks = [Buffer.alloc(4), Buffer.alloc(4), Buffer.alloc(4)];
    await assert.rejects(drive.downloadDriveFile('fixture', undefined, 6), /ATTACHMENT_CHANGED/);
    assert(stream.destroyed, 'Oversized downloads close the underlying stream');
    inputChunks = [Buffer.alloc(4)];
    await assert.rejects(drive.downloadDriveFile('fixture', AbortSignal.abort(), 6), /abort/i);
    assert(stream.destroyed);
    await assert.rejects(drive.downloadDriveFile('fixture', undefined, 9 * 1024 * 1024), /limits/);
    assert(samples.length);
    for (const sample of samples) {
      assert.deepEqual(Object.keys(sample).sort(), ['stage', 'rss', 'heapUsed', 'heapTotal', 'external', 'arrayBuffers'].sort());
      for (const key of ['heapUsed', 'rss', 'external', 'arrayBuffers']) assert(Number.isFinite(sample[key]));
    }
  } finally { global.fetch = originalFetch; dc.channel('email-delivery.memory').unsubscribe(onSample); }
  console.log('PASS: exact MIME bytes at Base64 chunk boundaries and 8 MiB, legacy attachments, send/draft envelopes, bounded/aborted Drive streams, numeric-only diagnostics.');
}

async function restartChild(stage, stateFile, resume) {
  const f = require('./verify-email-delivery-security.cjs');
  const controller = f.load('lib/server/email-delivery-controller.ts');
  const context = f.service.securityContext({ user: { id: 'ADMIN1', email: 'admin@example.com' } }, new Headers());
  const tables = ['Campaign', 'Tracker', 'Entry', 'EmailLog', 'Gate', 'WorkItem'];
  let accepted = [];
  const persist = () => fs.writeFileSync(stateFile, JSON.stringify({ ...Object.fromEntries(tables.map(key => [key, f[key].rows])), accepted }));
  if (resume) {
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'), (key, value) => typeof value === 'string' && /^20\d\d-\d\d-\d\dT/.test(value) ? new Date(value) : value);
    for (const key of tables) f[key].rows.push(...saved[key]);
    accepted = saved.accepted;
    f.Gate.rows.forEach(row => { row.leaseUntil = new Date(0); });
    f.Campaign.rows[0].coordinatorLeaseUntil = new Date(0);
    const before = accepted.length;
    await f.jobs.deliveryJobView(await f.jobs.findOwnedJob(context, 'restart-fixture'));
    assert.equal(accepted.length, before, 'Status read after process restart never sends');
  } else {
    f.Tracker.rows.push({ _id: f.trackerId, name: 'Restart fixture', status: 'active', emailEnabled: true });
    f.Entry.rows.push(...['one', 'two'].map(clientId => ({ _id: clientId, clientId, trackerId: f.trackerId, values: { ready: 'Yes' } })));
    f.Campaign.rows.push({ _id: 'restart-fixture', campaignId: 'restart-fixture', trackerId: f.trackerId, workflowId: 'WF1', mailKind: 'initial', mode: 'send', status: 'queued', jobVersion: 2, total: 2, authorizedBy: context.owner, authorizedAt: new Date(), approvalId: 'fixture', batchHash: 'fixture', snapshot: { trackerName: 'Restart fixture', fields: [], workflow: { id: 'WF1', mainFieldKey: 'ready', mainValue: 'Yes' }, actor: { owner: context.owner, userId: context.userId, userEmail: context.userEmail } }, items: ['one', 'two'].map(clientId => ({ ...f.batch('send', clientId).messages[0], status: 'pending' })) });
  }
  const originalUpdate = f.Campaign.updateOne;
  f.Campaign.updateOne = async (filter, change, options) => {
    const result = await originalUpdate(filter, change, options); persist();
    if (!resume && (stage === 'claimed' && change.$set?.['items.0.status'] === 'delivering' || stage === 'acknowledged' && change.$set?.['items.0.status'] === 'sent')) process.exit(73);
    return result;
  };
  f.mocks['@/lib/server/gmail-delivery'].deliverThroughGmail = async message => {
    accepted.push(message.to[0]); persist();
    if (!resume && stage === 'accepted') process.exit(73);
    return { draftId: 'mock-' + accepted.length, threadId: 'mock-thread' };
  };
  const claim = await controller.claimDeliveryCoordinator(context, 'restart-fixture');
  let result;
  do { result = await controller.processBrowserDeliveryBatch(context, 'restart-fixture', claim.coordinatorToken); } while (result.state === 'processing');
  if (resume) {
    assert.equal(new Set(accepted).size, accepted.length, 'Restart must never repeat an accepted recipient');
    assert.equal(f.Campaign.rows[0].items[0].status, stage === 'acknowledged' ? 'sent' : 'uncertain');
    assert.equal(f.Campaign.rows[0].items[1].status, 'sent');
    assert.equal(accepted.length, stage === 'claimed' ? 1 : 2);
    console.log('PASS: process exit at ' + stage + '; status read inert, explicit resume preserves uncertain/acknowledged results, pending recipient sent once.');
  }
}
async function workerBudgetsAndRelease() {
  const f = require('./verify-email-delivery-security.cjs');
  for (const table of ['Campaign', 'Tracker', 'Entry', 'EmailLog', 'Gate']) f[table].rows.length = 0;
  const refs = []; let pressure = false;
  const load = createLoader({ ...f.mocks,
    './email-delivery-memory': { deliveryMemory() {}, deliveryMemoryPressure: () => pressure },
    '@/lib/server/tracker-email-attachments': { materializeTrackerEmailAttachments: async () => {
      const attachment = { documentId: 'fixture', filename: 'fixture.bin', mimeType: 'application/octet-stream', content: Buffer.alloc(4 * 1024 * 1024), fileSize: 4 * 1024 * 1024 };
      refs.push(attachment); return [attachment];
    } },
  });
  const originalLog = f.EmailLog.create;
  f.EmailLog.create = async input => {
    assert(refs.every(item => !item.content && !item.contentBase64), 'File bytes are dropped before history bookkeeping');
    return originalLog(input);
  };
  const context = f.service.securityContext({ user: { id: 'ADMIN1', email: 'admin@example.com' } }, new Headers());
  f.Tracker.rows.push({ _id: f.trackerId, name: 'Budget fixture', status: 'active', emailEnabled: true });
  const items = ['first', 'second', 'third', 'fourth'].map(clientId => ({ ...f.batch('send', clientId).messages[0], status: 'pending' }));
  f.Entry.rows.push(...items.map(item => ({ _id: item.clientId, clientId: item.clientId, trackerId: f.trackerId, values: { ready: 'Yes' } })));
  f.Campaign.rows.push({ _id: 'budget', campaignId: 'budget', trackerId: f.trackerId, workflowId: 'WF1', mailKind: 'initial', mode: 'send', status: 'queued', jobVersion: 2, total: items.length, authorizedBy: context.owner, authorizedAt: new Date(), approvalId: 'fixture', batchHash: 'fixture', snapshot: { trackerName: 'Budget fixture', fields: [], workflow: { id: 'WF1', mainFieldKey: 'ready', mainValue: 'Yes' }, actor: { owner: context.owner, userId: context.userId, userEmail: context.userEmail } }, items });
  const controller = load('lib/server/email-delivery-controller.ts');
  const claim = await controller.claimDeliveryCoordinator(context, 'budget');
  process.env.EMAIL_DELIVERY_BATCH_SIZE = '5';
  try {
    let result = await controller.processBrowserDeliveryBatch(context, 'budget', claim.coordinatorToken);
    assert.equal(result.job.sent, 2, '8 MiB cumulative attachments end a tuned batch early');
    pressure = true;
    result = await controller.processBrowserDeliveryBatch(context, 'budget', claim.coordinatorToken);
    assert.equal(result.job.sent, 3, 'Pressure permits one message and leaves remaining work pending');
    result = await controller.processBrowserDeliveryBatch(context, 'budget', claim.coordinatorToken);
    assert.equal(result.state, 'done'); assert.equal(result.job.sent, 4);
    assert(refs.every(item => !item.content && !item.contentBase64));
    const { pinnedAttachmentQuery } = load('lib/server/tracker-attachment-query.ts');
    const query = pinnedAttachmentQuery('client-a', ['own', 'shared', 'other'], { attachments: [{ source: 'shared', documentId: 'shared' }] });
    assert.deepEqual(query, { _id: { $in: ['own', 'shared', 'other'] }, storageType: 'google-drive', $or: [{ clientId: 'client-a' }, { _id: { $in: ['shared'] } }] });
    assert.deepEqual(pinnedAttachmentQuery('client-a', [], undefined)._id.$in, []);
  } finally { delete process.env.EMAIL_DELIVERY_BATCH_SIZE; f.EmailLog.create = originalLog; }
  console.log('PASS: client/shared-only pinned document query, cumulative byte budget, memory-pressure yielding without starvation, attachment references cleared before history.');
}
async function main() {
  await encodingAndDownloads();
  await workerBudgetsAndRelease();
  const folder = path.resolve(__dirname, '../.artifacts/email-memory/restart'); fs.mkdirSync(folder, { recursive: true });
  for (const stage of ['claimed', 'accepted', 'acknowledged']) {
    const file = path.join(folder, stage + '.json');
    const crashed = spawnSync(process.execPath, [__filename, '--child', stage, file], { encoding: 'utf8', windowsHide: true });
    assert.equal(crashed.status, 73, crashed.stderr);
    const resumed = spawnSync(process.execPath, [__filename, '--child', stage, file, '--resume'], { encoding: 'utf8', windowsHide: true });
    assert.equal(resumed.status, 0, resumed.stderr); process.stdout.write(resumed.stdout);
  }
}
(process.argv[2] === '--child' ? restartChild(process.argv[3], process.argv[4], process.argv[5] === '--resume') : main())
  .catch(error => { console.error(error); process.exitCode = 1; });

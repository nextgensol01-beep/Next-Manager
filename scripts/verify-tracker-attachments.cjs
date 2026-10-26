/* Actual matching, upload routes, approval, campaign worker and Gmail MIME; isolated DB/Drive/HTTP only. */
const assert = require('node:assert/strict'), { createHash, randomUUID } = require('node:crypto');
const { NextRequest } = require('next/server'), createLoader = require('./search-test-loader.cjs');
const f = require('./verify-email-delivery-security.cjs');
process.env.NEXTAUTH_SECRET = 'isolated-attachment-authentication-secret';
process.env.EMAIL_DELIVERY_OTP_SECRET = 'isolated-attachment-otp-secret-with-thirty-two-bytes';
process.env.EMAIL_SEND_PIN_PEPPER = 'isolated-attachment-pin-secret-with-thirty-two-bytes';
for (const name of ['GMAIL_OAUTH_CLIENT_ID', 'GMAIL_OAUTH_CLIENT_SECRET', 'GMAIL_OAUTH_REFRESH_TOKEN']) process.env[name] = 'isolated-fixture';
process.env.GMAIL_USER = 'fixture@example.com';
const documents = f.mocks['@/models/Document'], remote = new Map(), uploads = [], transport = [];
let reads = 0, downloads = 0, activeReads = 0, maxReads = 0;
const query = value => ({ select() { return this; }, sort() { return this; }, lean: async () => structuredClone(value), then(resolve, reject) { return Promise.resolve(structuredClone(value)).then(resolve, reject); } });
const clients = ['A', 'B', 'C'].map(clientId => ({ clientId, companyName: 'Company ' + clientId }));
const contacts = clients.map(client => ({ clientId: client.clientId, personId: client.clientId, selectedEmails: [client.clientId.toLowerCase() + '@example.com'], isPrimaryContact: true }));
documents.findByIdAndUpdate = async (id, update) => { const row = documents.rows.find(doc => doc._id === id); if (!row) return null; Object.assign(row, update.$set); for (const key of Object.keys(update.$unset || {})) delete row[key]; return structuredClone(row); };
function doc(id, clientId, year = '2025-26', date = '2026-10-01', extra = {}) {
  const bytes = Buffer.from('%PDF isolated ' + id + ' for client ' + clientId);
  const value = { _id: id, clientId, documentName: id + '.pdf', financialYear: year, category: 'certificates', documentKind: 'general', storageType: 'google-drive',
    driveFileId: 'drive-' + id, driveLink: 'https://drive.google.com/file/d/drive-' + id + '/view', mimeType: 'application/pdf', fileSize: bytes.length, uploadedDate: new Date(date), ...extra };
  remote.set(value.driveFileId, { bytes, mimeType: value.mimeType, revision: createHash('md5').update(bytes).digest('hex') }); return value;
}
const mocks = { ...f.mocks,
  '@/models/Client': { find: () => query(clients), findOne: ({ clientId }) => query(clients.find(client => client.clientId === clientId) || null) },
  '@/models/ClientContact': { find: () => query(contacts) },
  '@/models/Person': { find: () => query(clients.map(client => ({ _id: client.clientId, name: client.companyName, emails: [client.clientId.toLowerCase() + '@example.com'] }))) },
  '@/lib/server/google-drive-documents': {
    async inspectDriveFile(id) { reads++; activeReads++; maxReads = Math.max(maxReads, activeReads); try { await new Promise(resolve => setTimeout(resolve, 2)); const item = remote.get(id); if (!item || item.error) throw Object.assign(Error('Isolated unavailable file'), { code: item?.error || 404 }); return { id, mimeType: item.mimeType, fileSize: item.bytes.length, revision: item.revision, checksum: createHash('md5').update(item.bytes).digest('hex') }; } finally { activeReads--; } },
    async downloadDriveFile(id) { downloads++; const item = remote.get(id); if (!item || item.error) throw Object.assign(Error('Isolated unavailable file'), { code: item?.error || 404 }); return item.bytes; },
    async uploadClientDocument(input) { uploads.push(input); return { driveFileId: 'uploaded-' + uploads.length, driveLink: 'https://drive.google.com/file/d/uploaded-' + uploads.length, mimeType: input.mimeType, fileSize: input.bytes.length }; },
  },
};
delete mocks['@/lib/server/tracker-email-attachments'];
mocks['./google-drive-documents'] = mocks['@/lib/server/google-drive-documents'];
const load = createLoader(mocks), matching = load('lib/server/tracker-attachment-matching.ts'), snapshots = load('lib/server/tracker-attachment-snapshot.ts');
const { normalizeDocumentFinancialYear } = load('lib/document-financial-year.ts');
const gmail = load('lib/server/gmail-delivery.ts'); mocks['./gmail-delivery'] = gmail; mocks['@/lib/server/gmail-delivery'] = gmail;
const actualFetch = global.fetch;
global.fetch = async (url, options) => {
  assert(options, 'All network calls are intercepted');
  if (String(url) === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'isolated-access-token' });
  if (String(url).includes('/settings/sendAs/')) return Response.json({ signature: '' });
  assert(['https://gmail.googleapis.com/gmail/v1/users/me/drafts', 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'].includes(String(url)), 'Unexpected external request: ' + url);
  const body = JSON.parse(await new Response(options.body).text()), raw = body.raw || body.message?.raw;
  transport.push({ mode: body.raw ? 'send' : 'draft', mime: Buffer.from(raw, 'base64url').toString() });
  return Response.json({ id: 'gmail-' + transport.length, threadId: 'thread-' + transport.length });
};
const rule = (patch = {}) => ({ id: 'certificate', source: 'client_latest', category: 'certificates', documentKind: 'general', financialYear: 'tracker', required: true, ...patch });
const workflow = (rules = [rule()]) => ({ id: 'WF1', name: 'Certificates', mainFieldKey: 'ready', mainValue: 'Yes', subject: 'Certificate for {{client.companyName}}', body: '<p>Certificate attached.</p>', points: [], attachments: rules });
const input = (overrides = {}) => ({ trackerId: f.trackerId, entryId: 'A', clientId: 'A', kind: 'initial', workflow: workflow(), values: { ready: 'Yes' }, financialYear: '2025-26', documents: documents.rows, ...overrides });
async function prepared(overrides) { return snapshots.prepareTrackerAttachmentSelection(input(overrides)); }
const batch = (selection, clientId = 'A', mode = 'draft') => ({ campaignId: randomUUID(), workflowId: 'WF1', kind: 'initial', mode, confirmed: true,
  messages: [{ entryId: clientId, clientId, companyName: 'Company ' + clientId, to: [clientId.toLowerCase() + '@example.com'], cc: [], subject: 'Your certificate', html: '<p>Approved content</p>',
    attachments: selection.attachments.map(({ documentId }) => ({ documentId })), attachmentSnapshot: selection.attachmentSnapshot }] });
async function call(file, body) { const route = load(file); const response = await route.POST(new NextRequest('http://localhost/api/fixture', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: f.trackerId }) }); return { status: response.status, body: await response.json() }; }
async function accept(value) { const result = await call('app/api/client-trackers/[id]/email/deliver/route.ts', value); assert.equal(result.status, 202, JSON.stringify(result.body)); return f.Campaign.rows.find(campaign => campaign.campaignId === value.campaignId); }
const worker = load('lib/server/tracker-email-worker.ts');
const run = campaign => worker.processDeliveryJob(campaign.campaignId, { assertOwnership: async () => {} });
async function main() {
  documents.rows.push(doc('A-old', 'A', '2024-25'), doc('A-current', 'A'), doc('A-wrong-newer', 'A', '2026-27', '2026-10-10'), doc('A-unassigned', 'A', undefined, '2026-10-15'), doc('B-current', 'B'));
  documents.rows.find(item => item._id === 'A-unassigned').financialYear = undefined;
  f.Tracker.rows.push({ _id: f.trackerId, name: 'Certificates', financialYear: '2025-26', status: 'active', emailEnabled: true, fields: [{ key: 'ready', label: 'Ready', type: 'select', options: ['Yes', 'No'] }], emailWorkflows: [workflow()] });
  f.Entry.rows.push(...clients.map(client => ({ _id: client.clientId, trackerId: f.trackerId, clientId: client.clientId, values: { ready: 'Yes' } })));
  assert.equal(normalizeDocumentFinancialYear('2025–2026'), '2025-26'); assert.equal(normalizeDocumentFinancialYear(''), undefined); assert.throws(() => normalizeDocumentFinancialYear('2025-27'));
  const clean = load('lib/server/tracker-email-workflows.ts').cleanTrackerEmailWorkflows, fields = f.Tracker.rows[0].fields;
  const persisted = clean([workflow([rule({ financialYear: '2025–2026' })])], fields);
  assert.equal(persisted[0].attachments[0].financialYear, '2025-26'); assert.equal(persisted[0].attachments[0].required, true);
  assert.equal(clean([workflow([rule({ required: undefined })])], fields)[0].attachments[0].required, undefined);
  assert.equal(clean([workflow([rule({ required: 'true' })])], fields), null); assert.equal(clean([workflow([rule({ financialYear: '2025-27' })])], fields), null);
  const select = overrides => matching.resolveTrackerAttachmentSelection(input(overrides));
  assert.equal(select().attachments[0].documentId, 'A-current');
  assert.equal(select({ workflow: workflow([rule({ financialYear: '2024-25' })]) }).attachments[0].documentId, 'A-old');
  assert.equal(select({ workflow: workflow([rule({ financialYear: 'any' })]) }).attachments[0].documentId, 'A-unassigned');
  assert.equal(select({ documents: [documents.rows.find(item => item._id === 'A-unassigned')] }).issues[0].code, 'missing_document_financial_year');
  assert.equal(select({ workflow: workflow([rule({ documentKind: 'target-screenshot' })]) }).attachments.length, 0);
  assert.equal(select({ financialYear: undefined }).issues[0].code, 'missing_financial_year');
  assert.equal(select({ clientId: 'C' }).issues[0].required, true);
  assert.equal(select({ workflow: workflow([rule({ required: undefined })]), clientId: 'C' }).issues[0].required, false);
  assert.equal(select({ workflow: workflow([rule(), rule({ id: 'invoice', category: 'invoices' })]), clientId: 'C' }).issues.filter(issue => issue.required).length, 2);
  assert.equal(select({ documents: [documents.rows.find(item => item._id === 'B-current')] }).attachments.length, 0);
  assert.equal(select({ workflow: workflow([rule({ source: 'shared', documentId: 'B-current' })]) }).attachments[0].documentId, 'B-current');
  assert.equal(select({ workflow: workflow([rule({ conditionGroup: { mode: 'ALL', conditions: [{ fieldKey: 'ready', operator: 'equals', value: 'No' }] } })]) }).issues.length, 0);
  const tied = [doc('tie-1', 'A'), doc('tie-2', 'A')]; assert.equal(select({ documents: tied.reverse() }).attachments[0].documentId, 'tie-2');
  const huge = doc('too-large', 'A', '2025-26', '2026-10-17', { fileSize: 9 * 1024 * 1024 }); assert.equal(select({ documents: [huge] }).issues[0].code, 'attachment_size_limit');
  assert.equal(select({ documents: [huge, documents.rows[1]] }).attachments[0].documentId, 'A-current');
  const budget = Array.from({ length: 4 }, (_, i) => doc('budget-' + i, 'A', '2025-26', '2026-10-01', { category: ['other', 'certificates', 'invoices', 'financial'][i], fileSize: 6 * 1024 * 1024 }));
  const budgetRules = budget.map((item, i) => rule({ id: item._id, category: item.category, required: i > 0 }));
  const budgetResult = select({ documents: budget, workflow: workflow(budgetRules) }); assert.equal(budgetResult.attachments.length, 3); assert(budgetResult.attachments.every(item => item.required));
  console.log('PASS: client/category/type/FY matching, legacy optional/unknown FY, deterministic newest-valid choice, conditions, shared rules and size budgets');

  const selected = await prepared(), selectedB = await prepared({ clientId: 'B', entryId: 'B' });
  assert.equal(downloads, 0); assert.equal(selected.attachments[0].filename, 'A-current.pdf'); assert(selected.attachmentSnapshot);
  const reviewed = batch(selected), validation = overrides => snapshots.validateTrackerAttachmentBatch({ trackerId: f.trackerId, batch: reviewed, workflow: workflow(), financialYear: '2025-26', ...overrides });
  await validation(); assert.equal(downloads, 0);
  await assert.rejects(validation({ batch: { ...reviewed, messages: [{ ...reviewed.messages[0], attachments: [] }] } }), /selection/);
  await assert.rejects(validation({ batch: { ...reviewed, messages: [{ ...reviewed.messages[0], attachmentSnapshot: undefined }] } }), /prepared/);
  await assert.rejects(validation({ batch: { ...reviewed, messages: [{ ...reviewed.messages[0], clientId: 'B', entryId: 'B' }] } }), /selection/);
  await assert.rejects(validation({ workflow: workflow([rule({ required: false })]) }), /selection/);
  const tampered = selected.attachmentSnapshot.slice(0, -8) + 'AAAAAAAA'; assert.throws(() => snapshots.readTrackerAttachmentSnapshot(tampered), /changed/);
  const { trackerEmailBatchHash } = load('lib/server/tracker-email-batch.ts'); assert.notEqual(trackerEmailBatchHash(f.trackerId, reviewed), trackerEmailBatchHash(f.trackerId, { ...reviewed, messages: [{ ...reviewed.messages[0], attachmentSnapshot: tampered }] }));
  const readOnce = snapshots.createAttachmentMetadataReader(), beforeReads = reads; await Promise.all(Array.from({ length: 20 }, () => readOnce('drive-A-current'))); assert.equal(reads - beforeReads, 1);
  await Promise.all(Array.from({ length: 20 }, (_, i) => { const item = doc('parallel-' + i, 'A'); return readOnce(item.driveFileId); })); assert(maxReads <= 6);
  const optional = await prepared({ clientId: 'C', entryId: 'C', workflow: workflow([rule({ required: false })]) }); assert.equal(optional.issues[0].required, false); assert.equal(optional.attachments.length, 0);
  remote.get('drive-B-current').error = 403; const inaccessible = await prepared({ clientId: 'B', entryId: 'B' }); assert.equal(inaccessible.issues[0].code, 'drive_file_inaccessible'); delete remote.get('drive-B-current').error;
  remote.get('drive-B-current').error = 503; const transient = await prepared({ clientId: 'B', entryId: 'B' }); assert.equal(transient.issues[0].code, 'drive_check_failed'); assert(!transient.issues[0].message.includes('missing')); delete remote.get('drive-B-current').error;
  console.log('PASS: required/optional disclosure, signed exact selection, cross-client/tamper/policy rejection, metadata-only preview and bounded deduplication');

  const previewRoute = await call('app/api/client-trackers/[id]/email/route.ts', { workflowId: 'WF1', kind: 'initial' });
  assert.equal(previewRoute.status, 200, JSON.stringify(previewRoute.body)); assert.equal(previewRoute.body.messages.length, 2); assert.equal(previewRoute.body.skipped[0].clientId, 'C'); assert.equal(previewRoute.body.skipped[0].reasonCode, 'required_attachment_unavailable');
  assert(previewRoute.body.skipped[0].reason.includes('FY 2025-26')); assert.equal(downloads, 0);
  const uploadRoute = load('app/api/documents/upload/route.ts');
  for (const year of ['', '2025–26']) { const form = new FormData(); form.set('file', new File(['upload'], 'Certificate.pdf', { type: 'application/pdf' })); form.set('clientId', 'A'); form.set('category', 'certificates'); form.set('documentKind', 'general'); form.set('financialYear', year);
    const response = await uploadRoute.POST(new NextRequest('http://localhost/api/documents/upload', { method: 'POST', body: form })); assert.equal(response.status, 201); const saved = await response.json(); assert.equal(saved.financialYear, year ? '2025-26' : undefined); assert.equal(uploads.at(-1).clientId, 'A'); }
  const updateRoute = load('app/api/documents/[id]/route.ts'), target = documents.rows.find(doc => doc._id === 'A-unassigned');
  const update = async year => { const response = await updateRoute.PUT(new NextRequest('http://localhost/api/documents/' + target._id, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ documentName: target.documentName, driveLink: target.driveLink, category: target.category, documentKind: 'general', financialYear: year }) }), { params: Promise.resolve({ id: target._id }) }); assert.equal(response.status, 200); return response.json(); };
  assert.equal((await update('2024-25')).financialYear, '2024-25'); assert.equal((await update('')).financialYear, undefined); assert.equal(target.driveFileId, 'drive-A-unassigned');
  console.log('PASS: actual preparation route skips required omissions; regular upload and existing metadata edit persist/clear FY without changing Drive association');

  // Only the approved IDs are passed to the existing bounded campaign engine.
  const duo = batch(selected); duo.messages.push(batch(selectedB, 'B').messages[0]);
  process.env.EMAIL_DELIVERY_BATCH_SIZE = '1'; const campaign = await accept(duo), before = transport.length;
  await run(campaign); assert.equal(transport.length, before + 1); assert.equal(campaign.items[0].status, 'draft');
  documents.rows.push(doc('B-newer-after-approval', 'B', '2025-26', '2026-10-17'));
  await run(campaign); assert.equal(transport.length, before + 2); assert.equal(campaign.items[1].status, 'draft');
  assert(transport[before].mime.includes('filename="A-current.pdf"')); assert(transport[before].mime.includes(remote.get('drive-A-current').bytes.toString('base64'))); assert(!transport[before].mime.includes('B-current.pdf'));
  assert(transport[before + 1].mime.includes('filename="B-current.pdf"')); assert(!transport[before + 1].mime.includes('B-newer-after-approval.pdf'));
  await run(campaign); assert.equal(transport.length, before + 2, 'Successful campaign items are never resent');
  assert(f.EmailLog.rows.some(log => log.attachments?.[0]?.filename === 'A-current.pdf' && log.attachments[0].financialYear === '2025-26'));
  const removed = await accept(batch(selected)), beforeMissing = transport.length; remote.get('drive-A-current').error = 404; await run(removed); assert.equal(removed.items[0].status, 'failed'); assert.equal(transport.length, beforeMissing); delete remote.get('drive-A-current').error;
  const changed = await accept(batch(selected)); remote.get('drive-A-current').revision = 'changed-revision'; await run(changed); assert.equal(changed.items[0].status, 'failed'); assert.equal(transport.length, beforeMissing); remote.get('drive-A-current').revision = createHash('md5').update(remote.get('drive-A-current').bytes).digest('hex');
  const invalid = await call('app/api/client-trackers/[id]/email/deliver/route.ts', { ...batch(selected), messages: [{ ...batch(selected).messages[0], attachments: [] }] }); assert.equal(invalid.status, 409);
  console.log('PASS: actual Gmail draft MIME contains each client’s exact bytes; original references survive interruption/newer files; successful items stay idempotent; deleted/changed files fail before Gmail');

  const settings = await load('lib/server/email-delivery-approval.ts').loadSecuritySettings(); Object.assign(f.Settings.rows[0], { directSendProtection: 'sendPin', sendPinHash: await load('lib/server/email-delivery-crypto.ts').hashSendPin('246810') });
  const send = batch(selected, 'A', 'send');
  f.Gate.rows.forEach(row => { row.events = []; });
  const approval = await call('app/api/client-trackers/[id]/email/approval/request/route.ts', send); assert.equal(approval.status, 200, JSON.stringify(approval.body)); assert.deepEqual(approval.body.methodsRequired, ['sendPin']);
  const verified = await call('app/api/client-trackers/[id]/email/approval/verify/route.ts', { approvalId: approval.body.approvalId, batch: send, pin: '246810' }); assert.equal(verified.status, 200, JSON.stringify(verified.body));
  const sent = await accept({ ...send, approvalId: approval.body.approvalId }); await run(sent); assert.equal(sent.items[0].status, 'sent'); assert.equal(transport.at(-1).mode, 'send'); assert(transport.at(-1).mime.includes('filename="A-current.pdf"')); assert(transport.at(-1).mime.includes(remote.get('drive-A-current').bytes.toString('base64')));
  assert(settings.holdToSend); console.log('PASS: unchanged PIN authorization and actual Gmail send MIME use the approved client document; all HTTP/Drive calls remained isolated');
}
main().then(() => { global.fetch = actualFetch; }).catch(error => { global.fetch = actualFetch; console.error(error); process.exitCode = 1; });

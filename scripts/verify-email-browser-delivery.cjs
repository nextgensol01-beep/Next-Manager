/* Actual acceptance, ownership, batch and resume services with isolated DB/Gmail fixtures.
 * No production database, Gmail account or external workflow service is accessed. */
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const f = require('./verify-email-delivery-security.cjs');
const { Campaign, Tracker, Entry, EmailLog, Gate, Approval, Settings, load, service, call, batch, eligible, trackerId, delivered, approve } = f;
const controller = load('lib/server/email-delivery-controller.ts');
const context = service.securityContext({ user: { id: 'ADMIN1', email: 'admin@example.com' } }, new Headers());
const coordinatorClass = load('lib/email-delivery-coordinator.ts').BrowserEmailDeliveryCoordinator;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const record = id => Campaign.rows.find(row => row.campaignId === id);
const expire = id => { record(id).coordinatorLeaseUntil = new Date(Date.now() - 1); };
async function route(id, name, body, headers = {}) {
  const handler = load('app/api/email-delivery/jobs/[campaignId]/' + name + '/route.ts');
  const response = await handler.POST(new NextRequest('http://localhost/api/email-delivery/jobs/' + id + '/' + name, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }), { params: Promise.resolve({ campaignId: id }) });
  return { status: response.status, body: await response.json() };
}
async function main() {
  delete process.env.INNGEST_EVENT_KEY; delete process.env.INNGEST_SIGNING_KEY; delete process.env.INNGEST_DEV;
  process.env.EMAIL_DELIVERY_OTP_SECRET = 'isolated-otp-secret-with-at-least-thirty-two-bytes';
  await call('settings', undefined, 'GET');
  Settings.rows[0].approvalEmail = 'approval@example.com'; Settings.rows[0].approvalEmailVerifiedAt = new Date();
  Tracker.rows.push({ _id: trackerId, name: 'Immutable tracker', status: 'active', emailEnabled: true, fields: [{ key: 'ready', type: 'select' }],
    emailWorkflows: [{ id: 'WF1', name: 'Approved workflow', mainFieldKey: 'ready', mainValue: 'Yes', signatureGap: 2 }] });
  const input = batch(); input.messages = Array.from({ length: 8 }, (_, i) => ({ ...batch('send', 'browser-client-' + i).messages[0], companyName: 'Client ' + i })); eligible(input);
  const approvalId = await approve(input);
  let result = await call('deliver', { ...input, approvalId, confirmed: true }, 'POST', { acceptOnly: true });
  assert.equal(result.status, 202); assert.equal(result.body.job.executionMode, 'browser'); assert.equal(result.body.job.sent, 0); assert.equal(delivered.length, 0);
  assert.equal(Campaign.rows[0].jobVersion, 2); Tracker.rows[0].emailWorkflows[0].name = 'Later edit';
  result = await call('deliver', { ...input, approvalId, confirmed: true }, 'POST', { acceptOnly: true });
  assert.equal(result.body.outcome, 'already_accepted'); assert.equal(Campaign.rows.length, 1); assert.equal(record(input.campaignId).snapshot.workflow.name, 'Approved workflow');
  assert.equal((await route(input.campaignId, 'resume', {})).status, 400, 'Resume requires explicit confirmation');
  assert.equal((await route(input.campaignId, 'resume', { confirmed: true }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await route(input.campaignId, 'batch', { coordinatorToken: 'invalid-token-but-long-enough-for-validation' })).body.code, 'COORDINATOR_LOST');
  result = await route(input.campaignId, 'resume', { confirmed: true }); assert.equal(result.status, 200);
  const token = result.body.coordinatorToken; assert(token.length >= 32); assert.notEqual(record(input.campaignId).coordinatorTokenHash, token);
  assert.equal((await route(input.campaignId, 'resume', { confirmed: true })).body.code, 'COORDINATOR_BUSY');
  assert.equal((await route(input.campaignId, 'batch', { coordinatorToken: token, messages: input.messages })).status, 400, 'Batch endpoint rejects fresh arbitrary recipients');
  const simultaneous = await Promise.all([route(input.campaignId, 'batch', { coordinatorToken: token }), route(input.campaignId, 'batch', { coordinatorToken: token })]);
  assert(simultaneous.some(value => value.body.state === 'busy')); assert(simultaneous.some(value => value.body.state === 'processing'));
  assert.equal(delivered.length, 1, 'Default memory-conservative batch sends one message');
  assert.equal(new Set(delivered.map(message => message.to[0])).size, 1);
  await assert.rejects(() => controller.processBrowserDeliveryBatch({ ...context, owner: 'other-owner' }, input.campaignId, token), error => error.status === 404);
  // A new mounted browser does not infer ownership from status/history.
  let newPageRequests = 0;
  const freshPage = new coordinatorClass({ batch: async () => { newPageRequests++; }, observe() {}, change() {}, error() {} });
  await wait(25); assert.equal(newPageRequests, 0); freshPage.dispose();
  expire(input.campaignId); assert.equal(f.jobs.publicDeliveryJob(record(input.campaignId)).status, 'interrupted');
  const claimed = await controller.claimDeliveryCoordinator(context, input.campaignId);
  assert.notEqual(claimed.coordinatorToken, token);
  assert.equal((await route(input.campaignId, 'batch', { coordinatorToken: token })).body.code, 'COORDINATOR_LOST', 'Stale controller is fenced');
  let progress;
  do { progress = await controller.processBrowserDeliveryBatch(context, input.campaignId, claimed.coordinatorToken); } while (progress.state === 'processing');
  assert.equal(progress.state, 'done'); assert.equal(delivered.length, 8); assert.equal(new Set(delivered.map(message => message.to[0])).size, 8); assert.equal(EmailLog.rows.length, 8);
  assert(!record(input.campaignId).coordinatorTokenHash); assert.equal(record(input.campaignId).status, 'completed');
  assert(!JSON.stringify(progress).includes('<p>Exact content</p>')); assert(!JSON.stringify(progress).includes('coordinatorTokenHash'));
  const interrupted = batch('draft'); interrupted.messages.push(batch('draft').messages[0]); eligible(interrupted);
  await call('deliver', { ...interrupted, confirmed: true }, 'POST', { acceptOnly: true });
  const abandoned = record(interrupted.campaignId); abandoned.items[0].status = 'delivering'; abandoned.items[0].deliveryClaimToken = 'dead-worker'; abandoned.items[0].claimedAt = new Date();
  const inFlight = await service.acquireDeliveryLease();
  await assert.rejects(() => controller.claimDeliveryCoordinator(context, interrupted.campaignId), error => error.code === 'DELIVERY_BUSY');
  assert.equal(abandoned.items[0].status, 'delivering', 'Legitimate in-flight requests must settle before reconciliation'); await inFlight.release();
  const adopted = await controller.claimDeliveryCoordinator(context, interrupted.campaignId);
  assert.equal(abandoned.items[0].status, 'uncertain');
  const beforeDraft = delivered.length;
  progress = await controller.processBrowserDeliveryBatch(context, interrupted.campaignId, adopted.coordinatorToken);
  assert.equal(delivered.length, beforeDraft + 1); assert.equal(abandoned.items[1].status, 'draft'); assert.equal(progress.job.uncertain, 1);
  assert(!progress.job.canResume, 'Uncertain-only outcomes cannot be blindly retried');
  // A browser unmount does not abort a batch and then launch another request.
  let requests = 0, observed = 0, errors = 0, settle;
  const loop = new coordinatorClass({ batch: () => { requests++; return new Promise(resolve => { settle = resolve; }); }, observe() { observed++; }, change() {}, error() { errors++; } });
  loop.add('same-id', 'token'); loop.add('same-id', 'token'); assert.equal(requests, 1);
  loop.dispose(); settle({ state: 'processing', job: progress.job }); await wait(300);
  assert.equal(requests, 1); assert.equal(observed, 0);
  const failedLoop = new coordinatorClass({ batch: async () => { requests++; throw Error('Connection lost after Gmail may have accepted'); }, observe() {}, change() {}, error() { errors++; } });
  failedLoop.add('failed', 'token'); await wait(300); assert.equal(errors, 1); assert.equal(requests, 2, 'Unknown responses are not retried automatically'); failedLoop.dispose();
  const expiring = batch(); eligible(expiring); const expiredApproval = await approve(expiring);
  Approval.rows.find(row => row.approvalId === expiredApproval).expiresAt = new Date(Date.now() - 1);
  assert.equal((await call('deliver', { ...expiring, approvalId: expiredApproval, confirmed: true }, 'POST', { acceptOnly: true })).status, 403, 'Expired unconsumed proofs cannot create a campaign');
  const slow = batch('draft'); eligible(slow); await call('deliver', { ...slow, confirmed: true }, 'POST', { acceptOnly: true });
  const slowClaim = await controller.claimDeliveryCoordinator(context, slow.campaignId);
  const linked = f.mocks['@/lib/server/tracker-linked-data']; const normal = linked.resolveTrackerLinkedValues;
  linked.resolveTrackerLinkedValues = async () => { await wait(3200); return new Map(); };
  process.env.EMAIL_DELIVERY_BATCH_BUDGET_MS = '5000';
  const beforeSlow = delivered.length; progress = await controller.processBrowserDeliveryBatch(context, slow.campaignId, slowClaim.coordinatorToken);
  assert.equal(progress.state, 'processing'); assert.equal(delivered.length, beforeSlow); assert.equal(record(slow.campaignId).items[0].status, 'pending', 'Exhausted preflight budget leaves untouched work safely pending');
  linked.resolveTrackerLinkedValues = normal; delete process.env.EMAIL_DELIVERY_BATCH_BUDGET_MS;
  const bounded = batch('draft'); bounded.messages = Array.from({ length: 8 }, (_, index) => batch('draft', 'bounded-' + index).messages[0]); eligible(bounded);
  await call('deliver', { ...bounded, confirmed: true }, 'POST', { acceptOnly: true }); const boundedClaim = await controller.claimDeliveryCoordinator(context, bounded.campaignId);
  process.env.EMAIL_DELIVERY_BATCH_SIZE = '999'; const beforeBound = delivered.length;
  await controller.processBrowserDeliveryBatch(context, bounded.campaignId, boundedClaim.coordinatorToken);
  assert.equal(delivered.length - beforeBound, 5, 'Invalid oversized tuning is clamped to five serial messages'); delete process.env.EMAIL_DELIVERY_BATCH_SIZE;
  console.log('PASS: no queue keys required; exact immutable acceptance; strict authenticated batch/resume; bounded serial work; concurrent tab exclusion; owner and stale-token fencing; explicit-only refresh/takeover; legitimate in-flight protection; uncertain/sent preservation; stopped browser loops; no retry after unknown responses; expired approval rejection.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

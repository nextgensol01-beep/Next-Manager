/* Real lifecycle/lease services with isolated MongoDB/Gmail doubles. No live messages. */
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const f = require('./verify-email-delivery-security.cjs');
const { jobs, Campaign, Tracker, Settings, load, batch, eligible, approve, call, trackerId, delivered } = f;
const controller = load('lib/server/email-delivery-controller.ts');
const { isNewerDeliverySummary, coordinatedDeliverySummary } = load('lib/email-delivery-activity-state.ts');
const { deliveryOutcomeLabel } = load('lib/email-delivery-jobs.ts');
const context = f.service.securityContext({ user: { id: 'ADMIN1', email: 'admin@example.com' } }, new Headers());
const record = id => Campaign.rows.find(job => job.campaignId === id);
async function accept(count, name) {
  const input = batch();
  input.messages = Array.from({ length: count }, (_, index) => batch('send', `${name}-${index}`).messages[0]);
  eligible(input);
  const approvalId = await approve(input);
  const result = await call('deliver', { ...input, approvalId, confirmed: true }, 'POST', { acceptOnly: true });
  assert.equal(result.status, 202);
  return { input, job: result.body.job, approvalId };
}
async function main() {
  process.env.EMAIL_DELIVERY_OTP_SECRET = 'isolated-otp-secret-with-at-least-thirty-two-bytes';
  await call('settings', undefined, 'GET');
  Settings.rows[0].approvalEmail = 'approval@example.com'; Settings.rows[0].approvalEmailVerifiedAt = new Date();
  Tracker.rows.push({ _id: trackerId, name: 'Lifecycle tracker', status: 'active', emailEnabled: true,
    fields: [{ key: 'ready', type: 'select' }], emailWorkflows: [{ id: 'WF1', name: 'Lifecycle workflow', mainFieldKey: 'ready', mainValue: 'Yes', signatureGap: 2 }] });
  for (const count of [1, 100]) {
    const { input, job, approvalId } = await accept(count, 'fresh-' + count);
    const stored = record(input.campaignId);
    assert.equal(job.status, 'queued'); assert.equal(job.processed, 0); assert.equal(job.canResume, false);
    assert.equal(deliveryOutcomeLabel(job), 'Starting email delivery…');
    assert(!stored.startedAt && !stored.coordinatorAcquiredAt);
    const queuedAt = +stored.queuedAt;
    for (const delay of [0, 1000, 15000, jobs.DELIVERY_STARTUP_GRACE_MS - 1]) {
      const view = jobs.publicDeliveryJob(stored, { now: queuedAt + delay, recoveryChecked: true });
      assert.equal(view.status, 'queued'); assert.equal(view.canResume, false, 'No resume flash while first lease negotiation is fresh');
    }
    const abandoned = jobs.publicDeliveryJob(stored, { now: queuedAt + jobs.DELIVERY_STARTUP_GRACE_MS + 1, recoveryChecked: true });
    assert.equal(abandoned.status, 'interrupted'); assert.equal(abandoned.canResume, true, 'Pre-claim crash at 0/N eventually recovers without startedAt');
    await call('deliver', { ...input, approvalId, confirmed: true }, 'POST', { acceptOnly: true });
    assert.equal(+record(input.campaignId).queuedAt, queuedAt, 'Re-accepting cannot restart the grace clock');
    const claim = await controller.claimDeliveryCoordinator(context, input.campaignId);
    assert(stored.coordinatorAcquiredAt, 'Acquisition is persisted before the first batch/startedAt');
    assert(!stored.startedAt); assert.equal(claim.job.status, 'queued'); assert.equal(claim.job.canResume, false);
    await assert.rejects(() => controller.claimDeliveryCoordinator(context, input.campaignId), error => error.code === 'COORDINATOR_BUSY');
    stored.coordinatorLeaseUntil = new Date(Date.now() - 1);
    let recovered = await jobs.deliveryJobView(stored);
    assert.equal(recovered.status, 'interrupted'); assert.equal(recovered.canResume, true, 'Post-acquisition zero-progress crash does not depend on startedAt or grace');
    const gate = await f.service.acquireDeliveryLease();
    try {
      recovered = await jobs.deliveryJobView(stored);
      assert.equal(recovered.status, 'recovering'); assert.equal(recovered.canResume, false);
      await assert.rejects(() => controller.claimDeliveryCoordinator(context, input.campaignId), error => error.code === 'DELIVERY_BUSY');
    } finally { await gate.release(); }
    const next = await controller.claimDeliveryCoordinator(context, input.campaignId);
    await assert.rejects(() => controller.processBrowserDeliveryBatch(context, input.campaignId, claim.coordinatorToken), error => error.code === 'COORDINATOR_LOST');
    const progress = await controller.processBrowserDeliveryBatch(context, input.campaignId, next.coordinatorToken);
    assert.equal(progress.job.status, count === 1 ? 'completed' : 'processing');
    assert.equal(progress.job.canResume, false);
    if (count === 100) assert.equal(deliveryOutcomeLabel(progress.job), 'Sending emails…');
    // Item/status/history responses all use the same checked lease classification.
    const itemRoute = load('app/api/email-delivery/jobs/[campaignId]/items/route.ts');
    const response = await itemRoute.GET(new NextRequest('http://localhost/api/email-delivery/jobs/' + input.campaignId + '/items'), { params: Promise.resolve({ campaignId: input.campaignId }) });
    assert.equal((await response.json()).job.canResume, false);
  }
  assert.equal(delivered.length, 2); assert.equal(new Set(delivered.map(message => message.to[0])).size, 2);
  const saved = record(Campaign.rows[1].campaignId);
  saved.coordinatorLeaseUntil = new Date(Date.now() - 1);
  saved.items[3].status = 'delivering'; saved.items[3].claimedAt = new Date();
  const workerGate = await f.service.acquireDeliveryLease();
  assert.equal((await jobs.deliveryJobView(saved)).canResume, false, 'A potentially running Gmail call blocks recovery');
  assert.equal(saved.items[3].status, 'delivering', 'Status reads never mutate/retry in-flight messages');
  await workerGate.release();
  const resumed = await controller.claimDeliveryCoordinator(context, saved.campaignId);
  assert.equal(saved.items[3].status, 'uncertain');
  const successes = saved.items.filter(item => item.status === 'sent').length;
  await controller.processBrowserDeliveryBatch(context, saved.campaignId, resumed.coordinatorToken);
  assert.equal(saved.items[3].status, 'uncertain'); assert.equal(saved.items.filter(item => item.status === 'sent').length, successes + 1);
  const t = Date.now();
  const a = { ...resumed.job, updatedAt: new Date(t).toISOString(), observedAt: new Date(t).toISOString(), status: 'queued', processed: 0, canResume: false };
  const b = { ...a, observedAt: new Date(t + 100).toISOString(), status: 'processing', processed: 3, sent: 3 };
  assert(isNewerDeliverySummary(a, b));
  assert(!isNewerDeliverySummary(b, { ...b, status: 'queued', observedAt: new Date(t + 200).toISOString() }), 'A later HTTP observation of the same old snapshot cannot undo processing');
  assert(!isNewerDeliverySummary(b, a), 'Out-of-order polling cannot undo actual progress');
  const expired = { ...b, observedAt: new Date(t + 200).toISOString(), status: 'interrupted', canResume: true };
  assert(isNewerDeliverySummary(b, expired)); assert(!isNewerDeliverySummary(expired, b), 'An older observation cannot undo a real lease expiry');
  const complete = { ...b, status: 'completed', processed: b.total };
  assert(!isNewerDeliverySummary(complete, { ...b, updatedAt: new Date(t + 500).toISOString() }));
  assert.equal(coordinatedDeliverySummary(expired, true, false).status, 'queued');
  assert.equal(coordinatedDeliverySummary(expired, false, true).canResume, false);
  const beforeReload = delivered.length;
  await jobs.deliveryJobView(saved); await jobs.deliveryJobView(saved);
  const preClaimCrash = batch('draft');
  preClaimCrash.messages = Array.from({ length: 100 }, (_, index) => batch('draft', 'pre-claim-' + index).messages[0]);
  eligible(preClaimCrash);
  await call('deliver', { ...preClaimCrash, confirmed: true }, 'POST', { acceptOnly: true });
  const persisted = record(preClaimCrash.campaignId);
  persisted.queuedAt = new Date(Date.now() - jobs.DELIVERY_STARTUP_GRACE_MS - 1);
  const listRoute = load('app/api/email-delivery/jobs/route.ts');
  const list = await listRoute.GET(new NextRequest('http://localhost/api/email-delivery/jobs?active=1'));
  const recoveredZero = (await list.json()).jobs.find(job => job.campaignId === preClaimCrash.campaignId);
  assert(recoveredZero, 'The new-page Mongo query includes old queued campaigns at 0/N');
  assert.equal(recoveredZero.status, 'interrupted'); assert.equal(recoveredZero.canResume, true);
  assert(jobs.JOB_SUMMARY_FIELDS.includes('coordinatorAcquiredAt'), 'Projection includes the persisted acquisition marker');
  assert.equal(delivered.length, beforeReload, 'Reading saved campaigns never starts delivery');
  console.log('PASS: fresh 0/1 and 0/100 startup; delayed acquisition; persisted zero-progress recovery before/after claim; both leases; other-browser fencing; shared read contracts; no implicit sends; uncertain/sent preservation; stale/equal-version polling ordering.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

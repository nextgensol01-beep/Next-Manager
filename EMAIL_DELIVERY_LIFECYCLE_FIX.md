# Email delivery startup and recovery

The interrupted-state flash came from treating every unfinished campaign without a coordinator lease as interrupted, including the period immediately after durable acceptance.

## Result

- Fresh acceptance remains `queued`, displaying **Starting email delivery…**; actual processing displays **Sending emails…**.
- A 30-second server startup grace applies only to untouched, unclaimed browser campaigns, anchored to the persisted `queuedAt`. It does not delay coordination or sending, and polling/re-acceptance cannot restart it.
- `coordinatorAcquiredAt` is persisted atomically with the coordinator token/lease, before the first batch. Recovery therefore does not depend on `startedAt` or any email already having succeeded.
- Saved zero-progress campaigns can recover after the unclaimed startup grace expires, or after an acquired coordinator's lease expires, subject to the independent delivery lease check.
- All status/history/item responses check the existing database delivery gate before enabling Resume. An active coordinator or delivery lease prevents recovery; an outstanding delivery lease is shown as **Checking saved delivery…**.
- Status reads load MongoDB records but never start delivery or reconcile ambiguous Gmail calls by themselves. Explicit resume retains the existing atomic gate, owner/token fencing, and reconciliation that marks abandoned attempts uncertain before processing untouched recipients.
- The provider tracks pending claims as well as active coordinators. Its dashboard lifetime is unchanged: internal navigation keeps the controller; a new website instance has no capability and never resumes automatically.
- Persisted timestamps, server observation timestamps, monotonic progress, lease comparisons, and terminal-state guards reject stale/out-of-order summaries. A later HTTP observation of an older queued snapshot cannot undo processing.
- The dock uses both server eligibility and actual local coordination state. No timer merely hides a Resume button. Styling, geometry, colors, and controls remain unchanged.

## Changed implementation

- `models/TrackerEmailCampaign.ts`: optional persisted acquisition marker; existing records need no migration.
- `lib/server/email-delivery-jobs.ts`: startup/recovery classification and shared delivery-gate checks.
- `lib/server/email-delivery-controller.ts`: persists acquisition with the existing CAS and returns checked summaries. Ownership/lease acquisition and reconciliation rules are preserved.
- Status list, campaign, and item routes under `app/api/email-delivery/jobs`: use the checked classification consistently.
- `lib/email-delivery-jobs.ts`: observation metadata and startup/processing labels.
- `lib/email-delivery-activity-state.ts`: response ordering and coordination-state helpers.
- `EmailDeliveryActivityProvider.tsx` and `EmailDeliveryActivityDock.tsx`: pending-claim handoff and recovery eligibility.
- Lifecycle and activity-browser regression tests and the `verify:email-delivery-lifecycle` package script.

## Verification

Passed isolated service checks cover fresh 0/1 and 0/100 campaigns, delayed initial acquisition, zero-progress crashes before and after acquisition, startup grace that cannot be renewed by re-acceptance, Mongo recovery of old queued 0/100 records, both leases, another browser's ownership, stale-token fencing, read-only recovery discovery, sent/uncertain preservation, and stale/equal-version responses.

The extended activity browser suite passed delayed claim responses, fresh 0/1 and 0/100 startup without interruption/Resume flashes, internal navigation during acquisition and active work, new-page recovery without automatic claims, another-browser ownership, and repeated stale observations. Its previous navigation, filtering, history, offline, mobile, reduced-motion, polling, and explicit-resume checks also pass.

Existing security, browser delivery engine, and production-isolation service suites passed. TypeScript, lint, and production build checks passed; lint retains the same three unrelated tracker/client-profile warnings.

All delivery tests use isolated database/Gmail doubles or local browser fixture endpoints. No real email was sent. OTP/PIN, exact-batch authorization, Hold to Send, delivery leases, concurrency, limits, snapshots, and duplicate-send protection remain intact.

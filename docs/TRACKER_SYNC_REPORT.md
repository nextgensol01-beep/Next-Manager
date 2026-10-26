Client Tracker additive synchronization — 21 October 2026

Auto Sync now adds newly eligible clients without removing historical clients, reactivating exclusions, resetting marks, or sending emails. Manual Sync uses a database preview and explicit confirmation through the existing Configure save flow.

**Existing mechanisms reused**

The existing `clientMembershipMode` values remain `snapshot` (Manual Sync) and `categorySync` (Auto Sync). Membership still uses `ClientTrackerEntry`, the unique `(trackerId, clientId)` index, `inScope`, and the tracker's `clientIds` metadata. New rows use the existing `initialTrackerValues` helper. No competing membership store, queue, polling loop, worker, or external service was introduced.

The previous category-sync function set nonmatching rows out of scope, restored matching inactive rows, and replaced `clientIds` with a freshly calculated array. That behavior was removed. Automatic synchronization now only inserts missing entries and atomically adds membership IDs.

**Manual Sync**

Open Configure → Audience / Clients, choose All clients or a category combination, and select Manual Sync. Preview sync reads current membership and matching missing clients from MongoDB. It shows current, new, and projected counts plus names, unique IDs, categories and states. Up to 250 client summaries are displayed; larger previews clearly state that confirmation includes all matching additions.

Cancel makes no membership changes. Add eligible clients stages the reviewed additions; the existing Save changes action applies them together with the configuration. A signed, ten-minute preview token binds the tracker/audience and authorizing email to a hash of the complete eligible missing-ID set. Confirmation rechecks that set. Changes, expiry or tampering require a new preview rather than silently adding unseen clients. The response reports actual upserts, and an already-current tracker reports zero.

**Auto Sync**

Selecting Auto Sync on an existing tracker requires preview and confirmation, including when converting a fixed selection to All clients or categories. Enable and sync stages the change; it becomes persisted only after Save changes succeeds. Existing missing clients are added before the new mode is saved. The UI never treats an unsaved selection as a successfully persisted enablement.

The canonical client-create and client-update transactions now synchronously add that client to relevant active Auto Sync trackers using indexed mode/scope/category queries. A sync failure rolls back the existing client transaction, including client, counter, contact and membership writes. Restore also rechecks relevant trackers. Membership is durable across instances and refreshes; it appears on the next normal tracker read/focus refresh. No live push or polling service was added.

Tracker open/export retains a recovery path for imports, interrupted operations or externally changed master data. It adds at most 200 missing rows per pass and uses a database-backed 60-second check throttle. A full catch-up page permits another pass. It also repairs a crash between inserting an entry and adding its parent membership ID; this updates metadata only, never the existing entry. Explicit sync retries perform the same repair for manual trackers. Tracker listing no longer scans Client Master separately for every tracker. Queries project only necessary fields, and a new tracker mode/scope/category index supports targeted client-change fanout.

**Categories and identity**

Producer, Importer, Brand Owner and PWP all use the same canonical category predicate. All 15 nonempty combinations of those four categories are tested, including PWP-only, PIBOs, PWP + Importer, and all four. The existing fifth canonical category, SIMP, remains available; it was not removed from existing controls or All clients behavior.

Membership uses the authoritative, unique `Client.clientId`. Matching company names or contact/email details never merge separate records. Atomic insert-only upserts plus the existing unique index prevent duplicates, including concurrent confirmation and duplicate-key races. Fixed specific-client audiences stay manual; they cannot enable Auto Sync without explicitly choosing All clients or categories and reviewing the resulting additions.

**Values, exclusions, financial years and history**

Synchronization uses `$setOnInsert` only, with existing-row timestamps disabled. Existing status, toggles, dropdowns, notes, dates, numbers, associations and historical values remain untouched. Newly inserted rows use configured field behavior: the first configured status option, the existing toggle default, empty multi-value fields, and the existing defaults for other types. Live/computed fields retain their established read-time calculations.

Every existing entry—including `inScope:false`—is excluded from automatic additions. Intentional removals stay excluded until explicitly reselected through the existing client picker. Reselecting retains the old saved values. Category changes, missing master records, changed audience filters and financial-year changes never remove active historical entries during synchronization.

Configure sends the opening client-ID baseline, and membership-array updates use atomic add/pull deltas. Saving an older Configure draft therefore preserves clients added concurrently by Auto Sync instead of overwriting the entire array.

The tracker retains its financial year. Synchronization creates no financial-year records, compliance completion records, invoices, uploads or annual returns. The existing tracker model has category/fixed-ID audiences, not a stored “Registered This FY” audience predicate; the Client Master registration filter was not invented as a tracker rule. Existing linked-data calculations still use the tracker financial year. The canonical client API currently prohibits changing a client's category after creation; that protection was preserved. Recovery reads use current canonical categories without deleting old tracker entries.

Manual reconciliation is processed in 200-ID write batches with a 15-second work budget. A partial persistence failure is an error, not full success; already-added rows remain safe and a fresh preview resumes only the remaining missing clients. The old mode remains saved if initial reconciliation fails. Preview metadata is bounded to 250 summaries, cursors batch at 200, and the manual-review guard is 20,000 missing clients per operation.

**Email safety**

The synchronization engine imports no Gmail delivery, EmailLog or campaign-writing service. It creates neither messages nor drafts and does not mark a new client Sent. Existing prepared/approved campaign item snapshots remain unchanged. New members can enter only a future explicitly prepared campaign under the existing eligibility, exact-batch approval, OTP/PIN and delivery rules. Existing email security, browser delivery, attachment isolation and lifecycle regression tests passed.

**Validation**

- `node scripts/verify-tracker-sync.cjs`: all category combinations, stable client identity, exact defaults, historic-value preservation, excluded clients, database counts, inert preview/cancel, signed confirmation, stale/tampered/expired/other-owner rejection, fixed-selection guards, concurrent confirmations, accurate upsert counts, stale Configure drafts, targeted fanout, bounded catch-up, and partial-failure recovery.
- `node scripts/verify-client-form.cjs`: existing client/contact/credential behavior plus actual creation/update transaction hooks, relevant Auto Sync only, idempotency, and complete rollback on sync failure.
- `node scripts/verify-tracker-configuration.cjs`: existing column changes, explicit removal/re-add, saved values, API validation, filtered-page membership, export/filter behavior and additive category synchronization.
- `node scripts/verify-tracker-linked-data.cjs` and `node scripts/verify-financial-year.cjs`: existing financial-year and live/computed behavior.
- `node scripts/verify-tracker-create.cjs`: actual builder audience controls, compatible create payloads, dark/light/mobile/reduced motion and existing column editors.
- `node scripts/verify-tracker-configure-ui.cjs`: existing Configure layout, 65/35 preview rail, scrolling, colors, editors, save/retry, discard, narrow screens and focus behavior.
- `TRACKER_CONFIGURE_SYNC_ONLY=1 node scripts/verify-tracker-configure-ui.cjs`: real sync controls, PWP + Importer preview, 117 accurate additions, cancellation, staged save, missing-preview guard, unchanged existing marks/exclusions, no email requests, and light/dark/mobile captures.
- `node scripts/verify-tracker-opening.cjs`: lazy directory loading, table-before-totals behavior, stable editing, fresh reads and workflow chunk loading.
- `node scripts/verify-email-delivery-security.cjs`, `node scripts/verify-email-browser-delivery.cjs`, `node scripts/verify-email-delivery-lifecycle.cjs`, and `node scripts/verify-tracker-attachments.cjs`: existing authorization, safe resume, uncertain Gmail outcomes, campaign and attachment protections.
- `npx tsc --noEmit --incremental false`: passed.
- `npm run build`: passed. Full output is retained in `.artifacts/tracker-sync/build.log`; the existing UI lint warnings remain unrelated to this change.

Tests use isolated database fixtures and mock endpoints. No production client data was changed, no real client email was sent, and no Gmail draft was created by synchronization tests. Transaction and race behavior is verified with deterministic fixtures; no live MongoDB deployment was modified for testing.

**Changed files**

- `lib/server/tracker-membership.ts`: additive engine, scoped recovery/fanout, signed preview and safe reconciliation.
- `lib/tracker-sync.ts`: shared scope/settings/preview types and legacy inference.
- `models/ClientTracker.ts`: optional audience scope, recovery-check timestamp and targeted index; existing membership modes retained.
- `lib/server/client-contact-service.ts`: creation/update transaction hooks and restore hook.
- `lib/server/tracker-api-errors.ts`: structured sync validation errors.
- `app/api/client-trackers/route.ts`: saved scope, All/category Auto Sync creation, selected-scope validation, no listing reconciliation fanout.
- `app/api/client-trackers/[id]/sync/route.ts`: authenticated administrator preview endpoint.
- `app/api/client-trackers/[id]/route.ts`: confirmed reconciliation through existing Configure PATCH and atomic membership deltas.
- `lib/tracker-create.ts` and `lib/tracker-configuration.ts`: create/save contracts, scope inference and truthful draft impact.
- `components/client-trackers/create/TrackerAudienceSection.tsx`: Manual/Auto choices using existing controls.
- `components/client-trackers/configure/TrackerSyncControls.tsx`: compact scope/category/preview controls inside Configure.
- `components/client-trackers/configure/ConfigureTrackerWorkspace.tsx` and `TrackerClientManager.tsx`: control integration and additive/exclusion help text.
- `app/dashboard/client-trackers/[id]/page.tsx`: staged sync draft, preview save guard, opening baseline and actual-result feedback.
- `scripts/verify-tracker-sync.cjs`, `scripts/verify-client-form.cjs`, `scripts/verify-tracker-configuration.cjs`, `scripts/verify-tracker-configure-ui.cjs`, `scripts/verify-tracker-create.cjs`: meaningful sync coverage and adapted regression fixtures.
- `package.json`: `verify:tracker-sync` command.
- `docs/TRACKER_SYNC_REPORT.md`: this report.

No unrelated website design was modified. Dashboard, sidebar, header, cards, marks table, toolbar, modals, preview rail, typography, colors, shadows, CSS, and navigation animations retain their existing design. Only the necessary audience/synchronization controls were added using the established component classes. Browser captures are under `tmp/tracker-configure-tests/` (`sync-preview-light.png`, `sync-preview-dark.png`, `sync-controls-mobile.png`).

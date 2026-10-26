# Tracker cell editing — 21 October 2026

Cell values and applicable summary counts now update together, before the PATCH response. Valid totals remain visible during saves and background reads. The summary has no loading/retry paragraph that changes its height. Existing styles, labels, toggle animations, table dimensions, navigation, and email controls are preserved; no stylesheet was changed for this work.

## Root cause

The summary explicitly replaced available counts with dashes whenever a write or overview request was pending. Each card also inserted an `Updating totals…` paragraph. That produced a measured 24 px shift in the following table.

The freshness hook marked optimistic data as unsettled and treated every same-query refresh as loading. Resuming after any cell save fetched the entire visible page and overview again. The parent recreated the table's editors throughout those state changes: the measured single-toggle cycle rendered 7,001 editors. Pending cells were disabled, and the handler discarded a second edit to an already pending cell.

Text drafts synchronized unconditionally from incoming values, allowing a background response to interrupt typing. Bulk saves displayed requested values rather than acknowledged normalized values, and the toast's Undo callback could retain an earlier change record.

## Changes

- `app/dashboard/client-trackers/[id]/page.tsx`: immediate cell and status/select/toggle count updates; per-cell serialization with the latest queued intent; normalized acknowledgements; targeted rollback; quiet reconciliation after writes settle; memoized rows and editors; protected focused drafts; truthful bulk acknowledgements and Undo. Navigation/filter reads remain distinct from background refreshes. Empty last pages clamp to a valid server-authoritative offset. A failed overview keeps counts, notifies through the existing toast system, and marks the existing card's tooltip as potentially out of date.
- `lib/useFreshTrackerData.ts`: distinguish settled usable data from background fetching and failed initial/navigation reads. Mutations cancel older request generations without forcing a fresh loading state. Optional resume control avoids an automatic whole-page fetch after every edit. A mutation retains the query ownership of the data it edits, so changing filters during a save cannot mislabel old rows as the new result.
- `lib/tracker-editing.ts`: immutable per-field count deltas using the actual previous and next values. Missing legacy values remain distinct from false/empty options, matching the existing aggregation. Live/computed summaries are preserved until an authoritative read.
- `app/api/client-trackers/[id]/entries/[entryId]/route.ts`: project only required tracker configuration; atomically update the scoped mark and obtain its previous value for the audit. This removes the separate entry read and the full-row response. The response contains the normalized edited mark and timestamp.
- `app/api/client-trackers/[id]/entries/bulk/route.ts`: project only the edited mark; read the Undo snapshot and update the exact scoped rows in a transaction; return normalized value, applied IDs, and completion status. Await every existing audit event with concurrency capped at 20. Transaction retries do not duplicate those post-commit audit calls.
- `package.json`: add editing verification and benchmark commands.
- `scripts/verify-tracker-editing.cjs`, `scripts/verify-tracker-editing-routes.cjs`, `scripts/benchmark-tracker-editing.cjs`, `scripts/fixtures/tracker-editing.tsx`, and `scripts/fixtures/tracker-editing-loader.cjs`: isolated page/route checks and profiling. `scripts/verify-tracker-search.cjs` now checks per-cell busy state and safe filter retries rather than requiring controls to be disabled while saving.

Different cells save concurrently. Requests for one cell are serialized; later intent remains visible while an earlier response arrives. Only the acknowledged field is merged, so a full-row response cannot overwrite another edited column. Initial/filter/page loading retains its safety restrictions, while same-query background reconciliation keeps valid controls usable. Failed or ambiguous writes trigger authoritative reads; successful unfiltered manual edits do not fetch 100 rows again. Computed dependencies, active mark filters, saved views, bulk operations, and errors request the necessary table reconciliation. Plain text changes without computed dependencies request neither the overview nor the table.

Window focus, visibility return, and a visible-page 30-second timer reconcile external employee changes. Reads pause across pending writes, with canceled/older generations rejected. A pending filtered-page reconciliation waits for a focused text draft to finish. Text/number/date inputs keep blur-to-save semantics. No save bar, worker, service, or additional permanent UI was added.

## Actual measurements

Sequential before/after runs used the captured pre-change page/hook and the final page/hook, the same real CSS, Chrome 155.0.8059.84, Node 24.14.0, development React, 222 fixture clients, 100 visible rows, and 14 fields. A synthetic click was observed on animation frames. Both variants used an isolated mock PATCH delayed by 350 ms and reads delayed by 100 ms. These are measured local browser timings, not production latency or a guarantee on every device.

| Single toggle edit | Before | After |
| --- | ---: | ---: |
| Click to observed cell update | 76.4 ms | 16.8 ms |
| Click to observed correct summary | 1,074.6 ms | 16.8 ms |
| Click to UI confirmation of save | 594.8 ms | 382.1 ms |
| Cell-editor renders across save cycle | 7,001 | 3 |
| React commits | 6 | 6 |
| Largest Profiler render duration in a commit | 188.8 ms | 21.9 ms |
| Total Profiler render duration | 393.5 ms | 71.3 ms |
| Sampled frames with blank counts | 20 | 0 |
| Sampled frames with loading paragraph | 20 | 0 |
| Summary height / following table movement | 24 px | 0 px |
| Network requests | 4 | 3 |
| Visible-page reads after the edit | 1 | 0 |
| Overview reads after the edit | 1 | 1 |
| Email-history reads after the edit | 0 | 0 |

The three after requests are PATCH, overview, and activity. Overview/activity reads are coalesced after a burst of outstanding edits. Text-only edits were separately checked to avoid tracker/overview reads. The network delay remains; it no longer controls when the user sees the selection or counts. The largest Profiler duration measures React render work, not complete browser paint time or production commit cost.

Raw results are in `.artifacts/tracker-editing/before.json`, `after.json`, and `routes.json`. The before source capture is under `tmp/tracker-editing-before/`. Re-run `npm run benchmark:tracker-editing` while those captured files are present; the current-code full acceptance suite is `npm run verify:tracker-editing`.

The actual route handlers were also timed with isolated in-memory database/session fixtures: the two successful individual requests took 20.7 ms and 13.7 ms; a retrying 25-row bulk request took 25.1 ms including 25 awaited mock audit records. Single-cell work used one tracker read, one atomic entry update, and one audit. The previous code additionally performed a separate entry read and returned all mark values. **Live MongoDB connection/query/audit latency was not measured, and no production database speed improvement is claimed.** No client records were edited by these tests and no email was sent.

## Verification

Passed:

- `npm run verify:tracker-editing`: immediate toggle totals, reverse changes, independent fields, five simultaneous requests, serialized same-cell edits, stale overview rejection, failed PATCH rollback without reverting another column, status/select counts, uncommitted focused drafts, normalized text, long text, number/currency/percentage/quantity/progress, keyboard date editing, multi-select/tags, stale-count failure notification, external changes on focus, filter reconciliation, 20-row bulk, exact Undo, failed/partial bulk, and last-page clamping. Light/dark screenshots are saved in `tmp/tracker-editing-tests/after/`.
- `npm run verify:tracker-editing-routes`: authentication, archived/live/computed protections, validation, tracker/entry/in-scope boundaries, normalized results, atomic audit previous values, transaction retry/rollback, exact bulk IDs, historical values preserved, and bounded complete audit calls. An intentional simulated database failure logs its expected server error and returns 500.
- Existing tracker search and opening browser suites, including typing focus, query debouncing, numeric filters, safe failed-filter retry, reopening freshness, ignored-abort ordering, and deferred email template/delivery screens.
- Existing tracker configuration and linked-data suites.
- Existing tracker navigation suite: stable chrome, forward/reverse transitions, scroll/focus restore, Back/Forward state, resize/interruption, keyboard/reduced motion, dark/tablet/mobile fallback.
- Existing Auto Sync service suite and Configure sync-only light/dark/mobile browser suite.
- Existing email delivery security, browser delivery, and lifecycle suites: exact-batch authorization, OTP/PIN, limits, replay/concurrency controls, uncertain outcomes, safe resume, and no implicit sends.
- TypeScript and the full production build. The first build shared `.next` with an already running development server and failed at page collection with a missing chunk. A source-isolated build at `C:/Users/User/Desktop/CodeX/tracker-editing-production-check` passed all compilation, lint/type checks, 88-page generation, and tracing without stopping that server. Hash comparisons confirmed all five changed application source files matched the verified copy. The same three pre-existing lint warnings remain in unrelated expressions/effects/image usage.

The bulk route uses MongoDB transaction support already used by the client create/update service. A transaction failure is reported and reconciled; it is not presented as a successful bulk save. Styling, authorization policy, option semantics, overview aggregation semantics, and all email delivery code remain unchanged.

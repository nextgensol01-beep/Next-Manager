Email campaign memory investigation — 21 October 2026

The active project is `align`. No website component, layout, modal, progress dock, button, animation, or stylesheet was changed. No service or production worker was added, and no Node heap limit was increased.

**Root causes and fixes**

The original worker fetched the current campaign’s complete item array (including personalized bodies) several times per request. The browser coordinator loaded that array and the workflow snapshot again before and after a batch. Its historical sent-campaign query returned every item array for the workflow. The worker now reads lightweight summaries, retrieves one durable message with a MongoDB `$slice` projection, uses client-scoped `$elemMatch` existence checks for historical sends/cooldowns, and has a supporting compound index. Summary/status endpoints never need message bodies or attachment bytes.

The reported `Document.find({})` is absent from the latest worker supplied here: its existing read was already pinned by attachment ID. It has been removed from the worker and consolidated into the materializer. The database predicate now intersects pinned IDs, Google Drive storage, current-client ownership, and only explicit shared rules. Batch authorization and preparation also project required document metadata. Signed selection, rule-condition, revision, checksum, client ownership, and size checks remain authoritative; the process never chooses a newer file when resuming.

The old attachment path produced a downloaded Buffer, another Buffer for some Google SDK responses, an attachment Base64 string, a joined MIME string, a MIME Buffer, another Base64 string, URL-safe replacement strings, a JSON string, and HTTP bytes. The new path downloads approved files through a size-bounded Drive stream into one exact-size Buffer. MIME and Gmail JSON encoding stream with backpressure in bounded chunks, preserving Base64 carry bytes and Gmail’s separate send/draft envelopes. File bytes are cleared immediately after Gmail returns and in a per-message finally block before history bookkeeping.

The Drive helper and OAuth setup routes imported the entire Google APIs SDK. They now import the installed package’s Drive/OAuth entry only. The first full build compiled but exhausted its type-check worker at about 2 GiB with the aggregate import; the full build passed after narrowing the imports, with the same heap limit. Separate fresh-process import measurements follow (absolute post-import memory, after explicit test-only GC):

| SDK import | heapUsed MiB | RSS MiB | external MiB | arrayBuffers MiB |
|---|---:|---:|---:|---:|
| googleapis | 61.4 | 147.3 | 2.7 | 0.0 |
| googleapis/build/src/apis/drive | 7.5 | 57.1 | 2.7 | 0.0 |

The default request processes one message. Explicit tuning remains clamped to 1–5 serial messages. A tuned batch yields after 8 MiB of attachments, 70% of the V8 heap limit, 128 MiB external memory, or the configurable RSS soft budget (default 512 MiB). It always permits one message so elevated development-server baseline memory cannot strand a campaign. The existing 15-second work budget (clamped to 5–20 seconds), pre-send reserve, Gmail/Drive abort signals, 60-second API maxDuration, global delivery lease, and coordinator fencing remain in place.

**Actual campaign measurements**

Node v24.14.0, Windows x64, installed Next 15.5.15. Values are MiB, before → after. Each cell reports its own sampled peak; peaks need not occur simultaneously.

Each campaign uses 1, 5, or 15 separate synthetic client files, each 256 KiB, 2 MiB, or 8 MiB. Every client’s bytes differ. The fixture includes 30 historical campaigns of 15 unrelated items with representative HTML bodies. It executes the actual coordinator, worker, signed attachment validation, Drive download, MIME encoder, and Gmail transport code. MongoDB is replaced by projection-aware fixtures; Drive reads synthetic local files through streams; Gmail HTTP is redirected exclusively to a loopback sink that drains the upload without retaining payloads. Send counts are asserted. No real client email or production database is accessed.

Standalone cases use fresh processes. Next comparisons use separate before/after processes and an excluded warmup request. The isolated Next project runs the same backend through a test-only route; it does not load the application’s .env or expose a route in the application. This measures development/compiler/runtime overhead without reproducing all dashboard navigation. The complete application was separately production-built and its existing browser UI regression suite passed.

Sampling uses a 5 ms timer plus synchronous allocation-boundary measurements through `diagnostics_channel`. Memory measurements are process-level and include the mock HTTP sink, fixture state, and test-loader overhead. They are observed peaks, not an OS allocation trace or a production capacity guarantee. Small-case external/array-buffer variation can reflect GC timing and allocator reuse; compare all four metrics.

These are single matched runs, not statistical averages. The first small-file development baseline also retains substantial compiler allocation after warmup; its external-memory outlier should not be interpreted as attachment memory. The larger repeated workloads and production fixture provide the more useful delivery comparison.

**Standalone Node, fresh process per case**

| Emails | Each file MiB | heapUsed | RSS | external | arrayBuffers |
|---:|---:|---:|---:|---:|---:|
| 1 | 0.25 | 130.6 → 53.1 | 283.6 → 193.8 | 23.6 → 23.5 | 19.9 → 19.8 |
| 5 | 0.25 | 158.3 → 73.8 | 300.5 → 204.5 | 33.3 → 32.7 | 29.6 → 28.9 |
| 15 | 0.25 | 179.8 → 103.0 | 319.7 → 241.5 | 40.6 → 44.2 | 36.9 → 40.4 |
| 1 | 2 | 138.0 → 59.4 | 317.4 → 209.5 | 46.8 → 38.9 | 36.8 → 35.1 |
| 5 | 2 | 179.1 → 94.9 | 417.3 → 275.3 | 117.9 → 91.8 | 89.3 → 85.8 |
| 15 | 2 | 178.9 → 94.3 | 403.3 → 272.8 | 104.2 → 89.5 | 79.1 → 83.8 |
| 1 | 8 | 167.0 → 80.1 | 409.1 → 261.3 | 109.2 → 89.5 | 80.6 → 85.8 |
| 5 | 8 | 206.7 → 80.9 | 522.4 → 265.3 | 176.8 → 91.4 | 137.5 → 85.3 |
| 15 | 8 | 244.5 → 63.9 | 593.2 → 251.6 | 219.5 → 77.1 | 180.2 → 69.8 |

**Next development, isolated before/after servers**

| Emails | Each file MiB | heapUsed | RSS | external | arrayBuffers |
|---:|---:|---:|---:|---:|---:|
| 1 | 0.25 | 212.5 → 138.9 | 474.7 → 409.0 | 677.0 → 70.6 | 368.1 → 66.1 |
| 5 | 0.25 | 241.3 → 161.3 | 491.6 → 417.3 | 80.1 → 79.5 | 75.9 → 75.2 |
| 15 | 0.25 | 267.6 → 189.8 | 517.0 → 430.7 | 87.4 → 90.9 | 82.9 → 86.7 |
| 1 | 2 | 225.7 → 151.2 | 521.2 → 425.3 | 93.6 → 85.7 | 83.1 → 81.4 |
| 5 | 2 | 267.2 → 151.6 | 608.3 → 433.5 | 152.5 → 93.8 | 126.9 → 89.5 |
| 15 | 2 | 263.0 → 155.4 | 611.4 → 435.0 | 158.0 → 93.8 | 132.5 → 89.5 |
| 1 | 8 | 238.6 → 166.6 | 608.2 → 458.4 | 162.2 → 115.1 | 133.1 → 110.2 |
| 5 | 8 | 297.1 → 176.9 | 711.9 → 487.8 | 223.6 → 136.2 | 183.8 → 130.0 |
| 15 | 8 | 303.1 → 195.8 | 722.2 → 508.3 | 223.6 → 140.2 | 183.8 → 133.9 |

**Next production, isolated before/after servers**

| Emails | Each file MiB | heapUsed | RSS | external | arrayBuffers |
|---:|---:|---:|---:|---:|---:|
| 1 | 0.25 | 154.1 → 76.5 | 310.0 → 239.0 | 24.0 → 23.9 | 19.9 → 19.8 |
| 5 | 0.25 | 181.7 → 92.8 | 348.5 → 246.2 | 33.4 → 30.5 | 29.6 → 26.7 |
| 15 | 0.25 | 219.8 → 94.0 | 368.6 → 247.4 | 41.6 → 31.6 | 37.8 → 27.8 |
| 1 | 2 | 164.9 → 80.2 | 367.1 → 262.7 | 46.9 → 39.0 | 36.8 → 35.1 |
| 5 | 2 | 193.2 → 81.1 | 419.8 → 275.0 | 82.2 → 50.9 | 63.3 → 47.1 |
| 15 | 2 | 197.8 → 82.7 | 472.5 → 275.3 | 118.0 → 51.0 | 89.3 → 47.2 |
| 1 | 8 | 173.8 → 86.2 | 476.3 → 295.4 | 115.5 → 66.1 | 86.8 → 62.3 |
| 5 | 8 | 229.4 → 93.2 | 578.5 → 304.3 | 176.9 → 76.1 | 137.5 → 71.7 |
| 15 | 8 | 231.6 → 94.8 | 581.1 → 313.3 | 183.1 → 85.4 | 137.5 → 73.5 |

**Development warning and production interpretation**

The installed Next `dist/server/lib/start-server.js` emits the exact warning only inside its `if (isDev)` request-finalization block, when V8 used heap exceeds 80% of the heap-size limit. This is a development restart policy. It is separate from RSS/external/array-buffer usage and does not itself establish a production memory failure. The matched fixture demonstrates additional development overhead. Neither final fixture reproduced the warning or restarted during the matrix. Actual deployment peak memory still depends on host limits, collection sizes, dashboard/compiler state, and other traffic.

**Restart and security verification**

The new test suite exits an actual child process at three persisted boundaries: immediately after the delivery claim, after mock Gmail accepts but before acknowledgement is saved, and after acknowledgement but before history completion. A new process restores the isolated durable state, verifies that status reads send nothing, expires stale leases, and explicitly resumes. Claimed/ambiguous items become uncertain and are never automatically resent; acknowledged sends repair history without Gmail; remaining pending recipients send once. The browser coordinator’s existing tests also prove that refresh/new mounts and unknown HTTP outcomes do not automatically launch another batch.

Passed: full `npm run build`; `npx tsc --noEmit --incremental false`; `verify-email-memory.cjs`; `verify-tracker-attachments.cjs`; `verify-email-delivery-security.cjs`; `verify-email-browser-delivery.cjs`; `verify-email-delivery-lifecycle.cjs`; `verify-email-verification-template.cjs`; `verify-email-production-isolation.cjs --built`; and `verify-email-delivery-review.cjs` (headless browser, isolated endpoints). The build retains three existing UI lint warnings; no UI source was edited.

Tests cover exact MIME bytes at 1/2/3-byte and 48 KiB chunk boundaries and the 8 MiB limit, both Gmail envelopes and legacy Base64 callers, bounded/aborted Drive streams, client/shared query scope, byte-budget and memory-pressure yielding, release before history, signed attachment revision/checksum checks, OTP/PIN protections, exact-batch/owner binding, stale-token/concurrent-tab exclusion, uncertain results, safe resume, history repair, and the existing 350-per-24-hours sending limit.

**Changed files**

- `lib/server/tracker-email-worker.ts`
- `lib/server/tracker-email-attachments.ts`
- `lib/server/gmail-delivery.ts`
- `lib/server/google-drive-documents.ts`
- `lib/server/email-delivery-controller.ts`
- `lib/server/tracker-attachment-snapshot.ts`
- `lib/server/tracker-attachment-query.ts`
- `lib/server/email-delivery-memory.ts`
- `models/TrackerEmailCampaign.ts`
- `app/api/client-trackers/[id]/email/route.ts`
- `app/api/gmail-oauth/route.ts`
- `app/api/google-drive-oauth/route.ts`
- `.env.email-browser-delivery.example`, `package.json` (tuning documentation and test commands).
- `scripts/benchmark-email-memory.cjs`, `scripts/run-email-memory-benchmarks.cjs`, `scripts/benchmark-email-next.cjs`, `scripts/report-email-memory.cjs`, `scripts/verify-email-memory.cjs`.
- `scripts/search-test-loader.cjs`, `scripts/verify-email-delivery-security.cjs` (source substitution and real projection semantics in isolated fixtures).
- `scripts/verify-email-browser-delivery.cjs`, `scripts/verify-email-delivery-lifecycle.cjs` (one-message default assertions).
- `scripts/verify-tracker-attachments.cjs`, `scripts/verify-email-verification-template.cjs` (consume streaming test transport bodies).
- `scripts/fixtures/email-memory-before/` (seven original source snapshots plus provenance, for reproducible before measurements).
- `docs/EMAIL_MEMORY_REPORT.md` (this report).

**Reproduce and diagnose**

Run `npm run verify:email-memory`, `npm run benchmark:email-memory`, then `npm run benchmark:email-next -- development` and `npm run benchmark:email-next -- production`. Benchmarks require localhost access and never use real Gmail. Run `node scripts/report-email-memory.cjs` to regenerate this report after both matrices complete. The Next fixture runner closes only its own process tree.

Temporarily set `EMAIL_DELIVERY_MEMORY_DIAGNOSTICS=1` to log numeric process measurements around document lookup, Drive download, MIME encoding, Gmail send, file-reference release, worker completion and browser-batch request completion. The logged fields are stage, heapUsed, heapTotal, rss, external and arrayBuffers. No file contents, client IDs, recipients, subjects, bodies, OAuth tokens, PINs, or OTPs are supplied to this logger. Set it back to 0 after diagnosis.

Raw matrices, SDK import measurements, source hashes, synthetic files, restart fixtures, and Next test/build logs are under `.artifacts/email-memory/`. Baseline source fixtures are retained under `scripts/fixtures/email-memory-before/`. No live Gmail behavior or deployed server restart was tested; all outbound delivery tests were mock-only as requested.

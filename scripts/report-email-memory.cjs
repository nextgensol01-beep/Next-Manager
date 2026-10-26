const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const folder = path.join(root, '.artifacts/email-memory');
const mib = value => (value / 1048576).toFixed(1);
const runtime = [];
for (const sdk of ['googleapis', 'googleapis/build/src/apis/drive']) {
  const code = `global.gc();const before=process.memoryUsage();require(${JSON.stringify(sdk)});global.gc();console.log(JSON.stringify({sdk:${JSON.stringify(sdk)},before,after:process.memoryUsage()}));`;
  const child = spawnSync(process.execPath, ['--expose-gc', '-e', code], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (child.status) throw Error(child.stderr);
  runtime.push(JSON.parse(child.stdout));
}
fs.writeFileSync(path.join(folder, 'sdk-load-results.json'), JSON.stringify(runtime, null, 2));
const sourceFiles = [
  'lib/server/tracker-email-worker.ts', 'lib/server/tracker-email-attachments.ts',
  'lib/server/gmail-delivery.ts', 'lib/server/google-drive-documents.ts',
  'lib/server/email-delivery-controller.ts', 'lib/server/tracker-attachment-snapshot.ts',
  'lib/server/tracker-attachment-query.ts', 'lib/server/email-delivery-memory.ts',
  'models/TrackerEmailCampaign.ts', 'app/api/client-trackers/[id]/email/route.ts',
  'app/api/gmail-oauth/route.ts', 'app/api/google-drive-oauth/route.ts',
];
const hashes = Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
fs.writeFileSync(path.join(folder, 'source-hashes.json'), JSON.stringify(hashes, null, 2));
const modes = [
  ['Standalone Node, fresh process per case', 'standalone-results.json'],
  ['Next development, isolated before/after servers', 'next-development-results.json'],
  ['Next production, isolated before/after servers', 'next-production-results.json'],
];
const text = [
  'Email campaign memory investigation — 21 October 2026', '',
  'The active project is `align`. No website component, layout, modal, progress dock, button, animation, or stylesheet was changed. No service or production worker was added, and no Node heap limit was increased.', '',
  '**Root causes and fixes**', '',
  'The original worker fetched the current campaign’s complete item array (including personalized bodies) several times per request. The browser coordinator loaded that array and the workflow snapshot again before and after a batch. Its historical sent-campaign query returned every item array for the workflow. The worker now reads lightweight summaries, retrieves one durable message with a MongoDB `$slice` projection, uses client-scoped `$elemMatch` existence checks for historical sends/cooldowns, and has a supporting compound index. Summary/status endpoints never need message bodies or attachment bytes.', '',
  'The reported `Document.find({})` is absent from the latest worker supplied here: its existing read was already pinned by attachment ID. It has been removed from the worker and consolidated into the materializer. The database predicate now intersects pinned IDs, Google Drive storage, current-client ownership, and only explicit shared rules. Batch authorization and preparation also project required document metadata. Signed selection, rule-condition, revision, checksum, client ownership, and size checks remain authoritative; the process never chooses a newer file when resuming.', '',
  'The old attachment path produced a downloaded Buffer, another Buffer for some Google SDK responses, an attachment Base64 string, a joined MIME string, a MIME Buffer, another Base64 string, URL-safe replacement strings, a JSON string, and HTTP bytes. The new path downloads approved files through a size-bounded Drive stream into one exact-size Buffer. MIME and Gmail JSON encoding stream with backpressure in bounded chunks, preserving Base64 carry bytes and Gmail’s separate send/draft envelopes. File bytes are cleared immediately after Gmail returns and in a per-message finally block before history bookkeeping.', '',
  'The Drive helper and OAuth setup routes imported the entire Google APIs SDK. They now import the installed package’s Drive/OAuth entry only. The first full build compiled but exhausted its type-check worker at about 2 GiB with the aggregate import; the full build passed after narrowing the imports, with the same heap limit. Separate fresh-process import measurements follow (absolute post-import memory, after explicit test-only GC):', '',
  '| SDK import | heapUsed MiB | RSS MiB | external MiB | arrayBuffers MiB |',
  '|---|---:|---:|---:|---:|',
  ...runtime.map(row => `| ${row.sdk} | ${mib(row.after.heapUsed)} | ${mib(row.after.rss)} | ${mib(row.after.external)} | ${mib(row.after.arrayBuffers)} |`), '',
  'The default request processes one message. Explicit tuning remains clamped to 1–5 serial messages. A tuned batch yields after 8 MiB of attachments, 70% of the V8 heap limit, 128 MiB external memory, or the configurable RSS soft budget (default 512 MiB). It always permits one message so elevated development-server baseline memory cannot strand a campaign. The existing 15-second work budget (clamped to 5–20 seconds), pre-send reserve, Gmail/Drive abort signals, 60-second API maxDuration, global delivery lease, and coordinator fencing remain in place.', '',
  '**Actual campaign measurements**', '',
  `Node ${process.version}, Windows ${process.arch}, installed Next ${require('next/package.json').version}. Values are MiB, before → after. Each cell reports its own sampled peak; peaks need not occur simultaneously.`, '',
  'Each campaign uses 1, 5, or 15 separate synthetic client files, each 256 KiB, 2 MiB, or 8 MiB. Every client’s bytes differ. The fixture includes 30 historical campaigns of 15 unrelated items with representative HTML bodies. It executes the actual coordinator, worker, signed attachment validation, Drive download, MIME encoder, and Gmail transport code. MongoDB is replaced by projection-aware fixtures; Drive reads synthetic local files through streams; Gmail HTTP is redirected exclusively to a loopback sink that drains the upload without retaining payloads. Send counts are asserted. No real client email or production database is accessed.', '',
  'Standalone cases use fresh processes. Next comparisons use separate before/after processes and an excluded warmup request. The isolated Next project runs the same backend through a test-only route; it does not load the application’s .env or expose a route in the application. This measures development/compiler/runtime overhead without reproducing all dashboard navigation. The complete application was separately production-built and its existing browser UI regression suite passed.', '',
  'Sampling uses a 5 ms timer plus synchronous allocation-boundary measurements through `diagnostics_channel`. Memory measurements are process-level and include the mock HTTP sink, fixture state, and test-loader overhead. They are observed peaks, not an OS allocation trace or a production capacity guarantee. Small-case external/array-buffer variation can reflect GC timing and allocator reuse; compare all four metrics.', '',
  'These are single matched runs, not statistical averages. The first small-file development baseline also retains substantial compiler allocation after warmup; its external-memory outlier should not be interpreted as attachment memory. The larger repeated workloads and production fixture provide the more useful delivery comparison.', '',
];
for (const [label, file] of modes) {
  const rows = JSON.parse(fs.readFileSync(path.join(folder, file)));
  if (rows.length !== 18) throw Error('Incomplete benchmark matrix: ' + file);
  text.push(`**${label}**`, '', '| Emails | Each file MiB | heapUsed | RSS | external | arrayBuffers |', '|---:|---:|---:|---:|---:|---:|');
  for (const size of [0.25, 2, 8]) for (const count of [1, 5, 15]) {
    const before = rows.find(row => row.variant === 'before' && row.sizeMiB === size && row.count === count);
    const after = rows.find(row => row.variant === 'after' && row.sizeMiB === size && row.count === count);
    text.push(`| ${count} | ${size} | ${['heapUsed', 'rss', 'external', 'arrayBuffers'].map(key => `${mib(before.peak[key])} → ${mib(after.peak[key])}`).join(' | ')} |`);
  }
  text.push('');
}
text.push(
  '**Development warning and production interpretation**', '',
  'The installed Next `dist/server/lib/start-server.js` emits the exact warning only inside its `if (isDev)` request-finalization block, when V8 used heap exceeds 80% of the heap-size limit. This is a development restart policy. It is separate from RSS/external/array-buffer usage and does not itself establish a production memory failure. The matched fixture demonstrates additional development overhead. Neither final fixture reproduced the warning or restarted during the matrix. Actual deployment peak memory still depends on host limits, collection sizes, dashboard/compiler state, and other traffic.', '',
  '**Restart and security verification**', '',
  'The new test suite exits an actual child process at three persisted boundaries: immediately after the delivery claim, after mock Gmail accepts but before acknowledgement is saved, and after acknowledgement but before history completion. A new process restores the isolated durable state, verifies that status reads send nothing, expires stale leases, and explicitly resumes. Claimed/ambiguous items become uncertain and are never automatically resent; acknowledged sends repair history without Gmail; remaining pending recipients send once. The browser coordinator’s existing tests also prove that refresh/new mounts and unknown HTTP outcomes do not automatically launch another batch.', '',
  'Passed: full `npm run build`; `npx tsc --noEmit --incremental false`; `verify-email-memory.cjs`; `verify-tracker-attachments.cjs`; `verify-email-delivery-security.cjs`; `verify-email-browser-delivery.cjs`; `verify-email-delivery-lifecycle.cjs`; `verify-email-verification-template.cjs`; `verify-email-production-isolation.cjs --built`; and `verify-email-delivery-review.cjs` (headless browser, isolated endpoints). The build retains three existing UI lint warnings; no UI source was edited.', '',
  'Tests cover exact MIME bytes at 1/2/3-byte and 48 KiB chunk boundaries and the 8 MiB limit, both Gmail envelopes and legacy Base64 callers, bounded/aborted Drive streams, client/shared query scope, byte-budget and memory-pressure yielding, release before history, signed attachment revision/checksum checks, OTP/PIN protections, exact-batch/owner binding, stale-token/concurrent-tab exclusion, uncertain results, safe resume, history repair, and the existing 350-per-24-hours sending limit.', '',
  '**Changed files**', '',
  ...sourceFiles.map(file => '- `' + file + '`'),
  '- `.env.email-browser-delivery.example`, `package.json` (tuning documentation and test commands).',
  '- `scripts/benchmark-email-memory.cjs`, `scripts/run-email-memory-benchmarks.cjs`, `scripts/benchmark-email-next.cjs`, `scripts/report-email-memory.cjs`, `scripts/verify-email-memory.cjs`.',
  '- `scripts/search-test-loader.cjs`, `scripts/verify-email-delivery-security.cjs` (source substitution and real projection semantics in isolated fixtures).',
  '- `scripts/verify-email-browser-delivery.cjs`, `scripts/verify-email-delivery-lifecycle.cjs` (one-message default assertions).',
  '- `scripts/verify-tracker-attachments.cjs`, `scripts/verify-email-verification-template.cjs` (consume streaming test transport bodies).',
  '- `scripts/fixtures/email-memory-before/` (seven original source snapshots plus provenance, for reproducible before measurements).',
  '- `docs/EMAIL_MEMORY_REPORT.md` (this report).', '',
  '**Reproduce and diagnose**', '',
  'Run `npm run verify:email-memory`, `npm run benchmark:email-memory`, then `npm run benchmark:email-next -- development` and `npm run benchmark:email-next -- production`. Benchmarks require localhost access and never use real Gmail. Run `node scripts/report-email-memory.cjs` to regenerate this report after both matrices complete. The Next fixture runner closes only its own process tree.', '',
  'Temporarily set `EMAIL_DELIVERY_MEMORY_DIAGNOSTICS=1` to log numeric process measurements around document lookup, Drive download, MIME encoding, Gmail send, file-reference release, worker completion and browser-batch request completion. The logged fields are stage, heapUsed, heapTotal, rss, external and arrayBuffers. No file contents, client IDs, recipients, subjects, bodies, OAuth tokens, PINs, or OTPs are supplied to this logger. Set it back to 0 after diagnosis.', '',
  'Raw matrices, SDK import measurements, source hashes, synthetic files, restart fixtures, and Next test/build logs are under `.artifacts/email-memory/`. Baseline source fixtures are retained under `scripts/fixtures/email-memory-before/`. No live Gmail behavior or deployed server restart was tested; all outbound delivery tests were mock-only as requested.', ''
);
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/EMAIL_MEMORY_REPORT.md'), text.join('\n'));
console.log('Saved docs/EMAIL_MEMORY_REPORT.md and raw SDK/source-hash measurements.');

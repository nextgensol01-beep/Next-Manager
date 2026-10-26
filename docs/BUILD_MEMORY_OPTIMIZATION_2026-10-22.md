# Build memory optimization — 22 October 2026

The final configuration completes production builds with a 2,048 MiB old-space cap, including a cached rebuild. At that cap, the cold-build peak total Node RSS fell **18.6%** and peak sampled per-process V8 heap fell **12.2%**. All 137 routes compile, and all 219 JavaScript/CSS chunks are byte-identical to the baseline.

The controlled original configuration also passed at 2 GB. The earlier reported OOM was not reproduced once development/build output collisions were removed. Failed attempts caused by sandbox restrictions or dev overwrites are retained separately and are not represented as heap failures or valid benchmarks.

## Changes

- Enabled `experimental.webpackBuildWorker`, retaining the UUID alias and all fs/path/crypto fallbacks. Installed Next.js 15.5.15 otherwise opts out of this worker when a custom Webpack callback exists.
- Set `experimental.cpus: 2` to bound build-time page/data worker pools. This changes build concurrency; production request handling and browser behavior are unchanged. Peak simultaneous Node processes decreased from 23 to 5 (the two-worker setting applies to each relevant pool).
- Kept production output at `.next` and placed development output at `.artifacts/development/.next`. Existing ignore rules already cover that directory; no ignore or cleanup rules were changed. Both generated type directories remain included.
- Excluded `tmp` from TypeScript root-file discovery after verifying that its 19 TypeScript files were historical editor/email snapshots and a standalone tracker-router fixture. No application imports target that directory. All 19 required TypeScript fixtures under `scripts` remain checked. Strictness, build type checking and lint validation remain enabled.
- Added `scripts/measure-build-memory.cjs` and its Windows RSS sampler for reproducible measurements. The normal build script and dependencies are unchanged.
- Updated only the model double in `scripts/verify-tracker-configuration.cjs` to recognize the existing nested overview facet, and added an assertion for the whole-tracker total. The old double threw before its existing assertions could run. The full verification then passed, including filtered Excel output. No production tracker code was changed.

## Before and after

All values are measured; MiB means 1,048,576 bytes. The primary comparison uses cold caches and a 2,048 MiB old-space cap.

| Metric | Before | After |
|---|---:|---:|
| Peak sampled V8 heap, largest single Node process | 1224.3 MiB | 1075.2 MiB |
| Peak sampled main-process V8 heap | 1224.3 MiB | 824.1 MiB |
| Peak total Node RSS, Windows sampled | 2550.6 MiB | 2077.0 MiB |
| Peak external memory, largest single process | 461.3 MiB | 425.8 MiB |
| Peak ArrayBuffer memory, largest single process | 404.1 MiB | 398.1 MiB |
| Build duration | 131.6 s | 108.3 s |
| Build success at 2 GB | Yes | Yes; cold and cached |
| Build success at 4 GB | Yes | Yes |
| Total client static output | 30.67 MiB | 30.67 MiB |
| Server output, .next/server | 39.89 MiB | 39.89 MiB |
| Functional checks | Baseline build/type validation and source/bundle fingerprints recorded | 22/22 selected checks pass after test-double correction |

External memory includes ArrayBuffers: those rows must not be added together. The client total includes asynchronous OCR and other feature chunks; it is not the initial page download. Server output excludes externally traced package files such as Chromium. The 4 GB server-output size differed by 13 bytes; the 2 GB before/after byte counts are identical.

## Individual experiments

| Configuration | Peak sampled per-process heap (MiB) | Peak total Node RSS (MiB) | Duration (s) | Peak concurrent Node processes | Result |
|---|---:|---:|---:|---:|---|
| Original, cold, 2 GB | 1224.3 | 2550.6 | 131.6 | 23 | Pass |
| Worker only, cold, 2 GB | 1091.4 | 2716.5 | 114.1 | 23 | Pass |
| Memory option only, cold, 2 GB | 1214.8 | 2847.1 | 143.0 | 23 | Pass |
| Original, cold, 4 GB | 1050.5 | 3121.4 | 120.5 | 23 | Pass |
| Final, cold, 2 GB | 1075.2 | 2077.0 | 108.3 | 5 | Pass |
| Final, cold, 4 GB | 961.0 | 1971.5 | 122.4 | 5 | Pass |
| Final, cached, 2 GB | 1214.5 | 1699.6 | 106.4 | 5 | Pass |

The worker-only experiment lowered per-process heap but did not lower total RSS on its own. `webpackMemoryOptimizations: true` also failed to improve total RSS and increased duration, so it was removed rather than combined into the final configuration. The final result combines worker isolation, lower build concurrency and verified TypeScript-scope cleanup. Their individual contributions were not isolated further; no percentage is attributed to a specific setting.

The cached 2 GB run passed with 1699.6 MiB total RSS and 1214.5 MiB sampled per-process heap. Cache memory therefore remains compatible with the tested heap cap. There is no original cached-build comparator, so this is a reliability check, not a measured cache-speed improvement.

## Where memory was consumed

| Build phase | Original 2 GB total RSS peak (MiB) | Final 2 GB total RSS peak (MiB) |
|---|---:|---:|
| webpack | 2037.3 | 2056.2 |
| validation | 2326.4 | 2077.0 |
| page-data | 1857.2 | 825.3 |
| prerender | 2550.6 | 1300.2 |
| tracing/finalization | 896.4 | 980.4 |

The original aggregate RSS peak occurred while page workers were active. After limiting concurrency, the largest remaining pressure is around the compilation/type-validation handoff. Type validation completes successfully in both configurations. The custom build worker releases each compiler process before subsequent phases; compiler memory is no longer retained in the CLI process. Phase boundaries are inferred from build stdout and are approximate.

## Dependency and compatibility audit

OCR/OpenCV and Tesseract already load dynamically in the browser adapter. jsPDF and AutoTable already load inside export actions. Report charts already use dynamic component imports. ExcelJS is used by server exports, and Google integration imports are already scoped to the Drive API/auth entry point. Puppeteer and Chromium remain server-side, with the quotation PDF Chromium trace include preserved. TipTap, Framer Motion, Recharts, and all other required packages remain installed and their application imports are unchanged.

No modal/editor was newly deferred and no entrance animation can acquire an additional load delay from this change. Production source-map generation was already disabled by the installed defaults; it was not changed. No experimental option unsupported by the installed Next schema was added.

## Validation and preservation

- 466 recorded runtime source/assets under app, components, lib, models, utils, types, vendor, templates and public remain unchanged by SHA-256. Package manifest and lockfile are unchanged.
- 219 production JS/CSS files match byte for byte. Generated build-ID directory names are normalized out of this comparison; route-manifest key ordering is normalized before comparison. All 137 route mappings match, and all 88 prerender tasks complete.
- Existing regression suites pass for report calculations/security, quotation items, client forms, financial-year data reliability, tracker configuration/sync/linked data/attachments, email authorization/delivery/lifecycle/memory and production isolation.
- Browser checks pass for shared tracker transitions and cleanup, keyboard/mobile/reduced-motion navigation, rich-text editing, workflow style navigation, email morphing and dock motion, OTP/PIN focus/errors and Hold-to-Send timing/cancellation.
- Financial-year browser checks cover OCR parsing/review, corrections, year warnings, merge/replace, cancellation, safe saves, conflict/retry behavior, and desktop/mobile/light/dark/reduced-motion flows.
- Actual application Excel export round-trips through ExcelJS; actual quotation and payment-statement utilities generate PDFs. Puppeteer generates a PDF from local fixture HTML.
- Actual OpenCV WASM initializes and converts a matrix. Actual local Tesseract recognizes a synthetic numeric image using the existing eng.traineddata file. These are smoke checks, not a claim that every scanned document is recognized accurately.
- Scoped Google OAuth/Drive imports and the UUID shim load. No Google/Gmail network request is made in that import check.
- The production server starts, login renders and hydrates without browser runtime/import errors, and unauthenticated tracker/PDF requests return 401. Authenticated client flows use isolated browser/API fixtures rather than production records.
- Development was restored on port 3000. Loading its login page returned 200, created output in the separate development directory, and left the production route manifest unchanged by SHA-256.

No real client email was sent and no production client data was modified. Live authenticated Gmail delivery was deliberately not exercised. Three existing lint warnings (unused expression, useEffect dependency, and img optimization) appear in both baseline and final builds and were not suppressed.

## Measurement method and limits

Environment: Node.js v24.14.0, installed Next.js 15.5.15, Windows, 12 logical CPUs, approximately 7.78 GiB physical RAM. The project is a local directory without Git metadata. The normal command remains `npm run build` / `next build`.

The benchmark launches the actual Next CLI with `--max-old-space-size=2048` or `4096`. A preload samples each Node process's heap/external/ArrayBuffer/RSS values every 250 ms and at exit. A separate Windows sampler polls RSS every 500 ms and records the OS per-process peak working set. Metrics retain PID, parent PID, actual V8 heap limit, phase timestamps, output sizes, configuration and exit status. Aggregate RSS uses the independent Windows samples, rather than summing unrelated per-process peaks.

V8 heap peaks are sampled lower bounds: synchronous compilation/type checking can block a Node timer. RSS is a sampled sum of process working sets, includes shared pages in each process, and excludes the diagnostic harness, PowerShell monitor and non-Node native workers. It is not total machine memory or a unique physical-memory measurement. V8 total heap limits also include young-generation space beyond the old-space cap; Next can select different limits for its worker classes. The actual values are in each metrics.json.

Each valid configuration was measured once with cold caches, plus one final cached run. Durations and GC/working-set behavior vary with other desktop activity and OS caching; these are observed results, not averaged guarantees. No simultaneous production benchmark was run. A development restart invalidated an early candidate run, motivating the permanent dev-output separation.

The official `--experimental-debug-memory-usage` mode was evaluated but not enabled: installed Next automatically generates heap snapshots near its threshold, and the mode is incompatible with Webpack build workers. Lightweight per-process/OS diagnostics supplied the required measurements without multi-gigabyte snapshots. See the [official Next.js memory guide](https://nextjs.org/docs/app/guides/memory-usage).

## Recommended allocation and retained artifacts

Use a **2,048 MiB old-space cap** for this application on the tested setup. Keep enough system RAM for compiler external/native allocations and child processes; a 2 GB heap cap is not a 2 GB total-RAM cap. The tested 4 GB fallback works, but it is not needed for these builds. Do not run another production build concurrently. Development now has its own output directory, preventing it from corrupting production manifests.

```powershell
$env:NODE_OPTIONS = '--max-old-space-size=2048'
npm run build
```

To reproduce a measured run, pause development for comparable desktop resource usage and run `node scripts/measure-build-memory.cjs unique-label 2048`. Add `--warm-cache` for a cached comparison. Labels must be unique; cold-cache runs preserve the preceding cache under the run directory. Dispose of newly generated comparison caches after measurement rather than accumulating them.

Evidence is in `.artifacts/build-memory`: per-run metrics/logs/configuration/client hashes, preservation.json, final-verification.json, individual test logs and browser screenshots. The initial failed test and the successful corrected-test rerun are both retained; the failure was not hidden. No heap snapshots were created. Approximately **5,132 MiB of disposable task-generated cache archives were removed** after the benchmarks. The original pre-benchmark generated output was preserved without copying source: **2092.38 MiB**. Retained task evidence excluding that original archive is approximately **68.18 MiB** at report generation. Active production/development caches are separate from that figure.

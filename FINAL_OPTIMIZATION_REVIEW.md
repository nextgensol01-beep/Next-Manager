# Final optimization review

3 November 2026 · NextGen Solutions ERP

## Final focused deployment review

This review starts from `bebb809` on `security/final-follow-up`. No deployment, production database inspection or migration was performed.

### Annual Return and tracker read-triggered writes

| Path | Why it writes and disposition |
|---|---|
| `GET /api/annual-return` with `clientId` and `fy` | `syncAnnualReturnStatus` reads persisted workflow prerequisites and may materialize or advance the client's Annual Return record. The scoped profile GET uses it to repair legacy status before reading. Report Studio, the FY list, status filters and rollups consume persisted records, including their presence and status. A response-only calculation would not update those other consumers, and removing the fallback could hide rows or leave stale statuses. Existing invoice, upload, billing and quotation write hooks and the dashboard's explicit FY reconcile POST cover normal updates, but cannot establish that historical or out-of-band data is current. Retained the fallback and fixed a race in the shared service. Existing rows update only if the observed status and record ID still match. Absent rows use an insert and respect a concurrent winner under the existing unique client/FY index. The derivation rules and legacy `Pending` default are unchanged. |
| `GET /api/client-trackers/[id]` and `GET /api/client-trackers/[id]/export` | `syncCategoryTrackerMembership` reserves a database-backed 60-second reconciliation lease, repairs missing client IDs in tracker metadata and inserts missing eligible rows in bounded batches of 200. It skips snapshot, selected-only and archived trackers. Insert-only operations preserve existing field values and exclusions. Client writes already add eligible clients, and manual sync exists. The read fallback also repairs interrupted inserts and historical gaps. Removing it or fabricating rows for display could change counts, edits and XLSX exports, which rely on persisted row IDs. Retained it with no implementation change. The detail route requires a session, and export requires an active administrator. |

Moving these fallbacks entirely to explicit operations would require coverage of prerequisite mutations, a controlled reconciliation of legacy state and a recovery mechanism for interrupted tracker membership writes. The FY dashboard already uses signed-in POSTs for reconciliation and bulk initialization. Reconciliation runs on the initial FY refresh. Bulk initialization is a separate user action and creates `Not Started` rows, so it cannot substitute for the derived status. Both are ordinary signed-in workflow actions and retain their current access and behavior. No new automatic reconciliation was added.

### ExcelJS advisory assessment

Fresh `npm audit --package-lock-only --omit=dev` reports eight moderate entries and zero high or critical entries. The eight are package findings stemming from one underlying minimatch advisory. The npm affected range is broader than the maintainer's demonstrated `optimizationLevel >= 2` path. The production copies of minimatch 3.1.5 and 5.1.9 lack that named preprocessing implementation. This is source-level reachability evidence, not a change to the registry's affected range. [Minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)

| Reported packages | Installed versions |
|---|---|
| ExcelJS, Archiver | 4.4.0, 5.3.2 |
| Archiver Utils, Zip Stream | 2.1.0 and 3.0.4, 4.1.1 |
| Glob, Readdir Glob, Rimraf | 7.2.3, 1.1.3, 2.7.1 |
| Minimatch | 3.1.5 and 5.1.9 |

The repository's workbook endpoints call `Workbook.xlsx.writeBuffer`, which uses ExcelJS's JSZip writer. They do not use its Archiver streaming writer or accept user-supplied glob patterns. Workbook reloads in tests and reconciliation use `xlsx.load`, also through JSZip. No application Excel upload/import entry point was found. Export request values become cells and filter selections, not archive patterns. The advisory's user-controlled glob path was not found in the application. Dependency metadata showed no patched upgrade within the declared production ranges. The published fix is minimatch 11.0.1 or later, outside both installed major lines. The npm recommendation would downgrade ExcelJS to 4.1.1. Neither an override across those incompatible ranges nor a downgrade was applied. The manifest and lockfile are unchanged. [ExcelJS releases](https://github.com/exceljs/exceljs/releases)

### Verification

- `scripts/verify-annual-return-reconciliation.cjs` covers profile materialization, legacy default handling, no-op reads, and races with concurrent filing, progression and insert. `scripts/verify-excel-exports.cjs` reloads custom-client, general Report Studio and tracker email-history workbooks. Existing tests cover billing and legacy report workbooks, tracker current state, client filters and billing/report reconciliation. These are synthetic tests using the actual XLSX writer and reader.
- All 37 core suites and eight standard browser suites passed. The browser run covered account security, billing, FY UI, tracker responsiveness and navigation, attachments, email activity and quotation PDF. Notification and OTP templates, loopback SMTP parity, production trace isolation and template drift passed separately. Synthetic report reconciliation matched billing totals and workbook exports. Both mobile-menu widths and all three quotation pages matched the baseline pixels, and the eight menu requests and interaction observations matched.
- TypeScript, strict lint and the production build passed. The initial standalone type check overlapped Next regenerating `.next/types`, and the first build caught an overly broad Mongoose query type. The corrected non-incremental type check and build passed sequentially. The final local production smoke returned 405 on maintenance GET and HEAD, 401 on anonymous maintenance POST and protected reads, and confirmed the bundled Chromium trace. Receipts are in the sibling audit directory under `followup-*` names.

### Production deployment checklist

1. Confirm the intended revision contains `b7744d5`, `bebb809` and this follow-up. Install with `npm ci` on a supported Node version meeting the existing Puppeteer requirement of 22.12+. Verify the canonical `NEXTAUTH_URL`, existing stable auth/encryption secrets, and `MONGODB_URI` through the deployment's secret configuration.
2. Inventory external maintenance bookmarks, runbooks and integrations. No first-party GET caller remains. Verify anonymous requests receive 401 on POST, ordinary or inactive users receive 403, cross-origin POST is denied, and active administrator POST is authorized. GET and HEAD are unavailable for the maintenance operations. Use isolated data for any successful POST that invokes database mutations. [Contact maintenance procedure](docs/billing-schema-maintenance.md)
3. On an isolated copy, verify the deployed MongoDB version, billing index compatibility, privileges, duplicate Annual Return groups, and unique Annual Return and tracker-entry identity indexes. Prepare a backup, pause billing writers and older app instances, and run the documented billing dry run. Apply only after operator approval, then verify index definitions, legacy count and billing/Report Studio totals before resuming traffic. [Billing migration procedure](docs/billing-schema-maintenance.md)
4. Verify legacy SMTP with controlled internal recipients and `GMAIL_USER`/`GMAIL_APP_PASSWORD` only where enabled. Separately verify Gmail OAuth sender, scopes and refresh tokens for drafts, tracker mail, security notifications and OTP. Exercise Google approval, administrator sign-in, optional 2FA and session revocation with approved staging accounts.
5. Verify the deployment can start Chromium with the configured executable or traced bundled binary and fonts. Render a representative quotation, compare every page, confirm the PDF attachment in a controlled draft, and verify the isolated renderer cannot reach a controlled internal test endpoint. Confirm mobile tracker interactions and reports on the intended staging host before sign-off.

The local build and fixtures establish code behavior. They do not establish the live database schema or index coexistence, hosting origin configuration, actual TLS/Gmail delivery, Linux Chromium behavior, or deployment egress. The deliberate Annual Return and tracker fallback writes and the eight moderate registry findings remain documented. No production security sign-off is claimed.

## Maintenance, billing reads, and mail dependency follow-up

This follow-up starts from `b7744d5` on `security/maintenance-billing`. The earlier sections document historical findings. Production sign-off remains open pending the operator migration, deployed verification and review of the other read-side writes below.

### Changes and compatibility

| Area | Changes |
|---|---|
| Contact maintenance | `app/api/fix-indexes/route.ts`, `app/api/migrate-contacts/route.ts`, and `app/api/migrate-client-contact-selections/route.ts` retain their URLs and operations as POST. `lib/server/maintenance-api.ts` requires a session, exact configured origin and the current active administrator record. Anonymous, ordinary, inactive and cross-origin requests cannot reach maintenance. The API returns a neutral 500 for operation failures. There were no first-party callers besides source comments. Review external callers before deploying the method change. |
| Billing | `app/api/billing/route.ts`, `app/api/quotations/[id]/billing/route.ts`, `lib/billing-utils.ts`, `lib/server/billing-report-service.ts`, and `models/Billing.ts` remove schema repair from request paths and disable Billing's automatic collection/index creation. Missing type/title defaults are presented without mutating records. Annual Return write lookups still match legacy bills and update the selected bill by ID. Report and payment formulas are unchanged. Invalid quotation GET IDs are rejected before opening the billing connection. |
| Operator migration | `scripts/migrate-billing-schema.cjs` previews by default and requires an explicit target database and `--apply` to write. It checks for duplicate Annual Return groups, provisions the replacement and existing Billing indexes, backfills only missing type/title fields and removes the superseded index last. `docs/billing-schema-maintenance.md` describes the pre-deployment window, approval, backup, verification and retry steps. The migration has not been run on any production data. [Operator procedure](docs/billing-schema-maintenance.md) |
| Nodemailer | `package.json` and `package-lock.json` pin only the existing `nodemailer8` alias to Nodemailer 10.1.4, the lowest stable version outside every affected range returned by the registry. The alias preserves NextAuth's optional `nodemailer` 7 peer resolution. The package ships types, so the old shim and `@types/nodemailer` dependency were removed. Node 20+ satisfies the new package and is below the existing Puppeteer requirement of 22.12+. The Gmail API, notifications and OTP implementation use their existing paths. [Nodemailer release history](https://github.com/nodemailer/nodemailer/blob/master/CHANGELOG.md), [maintainer support policy](https://github.com/nodemailer/nodemailer/security) |

The 8.0.11 registry entry covered 15 advisories spanning raw or legacy content resolution, recipient parsing and domain handling, DNS/TLS credential reuse, SMTP reply/auth parsing and DKIM header unfolding. The earlier patch already blocked caller-supplied raw and file-backed inputs, enforced plain mailbox values, and restricted SMTP to a configured Gmail transport. This app does not use Nodemailer's DKIM or multi-tenant SMTP routing. Those constraints reduce exposure, while SMTP reply parsing remains part of the enabled legacy transport. The new audit reports zero Nodemailer, high or critical production findings. Eight moderate production findings remain in the ExcelJS archive/glob dependency chain. [Nodemailer advisories](https://github.com/nodemailer/nodemailer/security/advisories)

### Verification and remaining checks

- The new `scripts/verify-maintenance-billing.cjs` covers administrator and origin enforcement, authorized mock maintenance, no billing read writes, legacy billing selection and report parity, and dry-run, conflict and repeat migration behavior. `scripts/verify-project.cjs` includes it in the core suite.
- Both Nodemailer versions produced identical SMTP envelope recipients and MIME including a Buffer attachment with fixed metadata, against a synthetic loopback SMTP server. The comparison covered authentication without Gmail, real credentials or TLS.
- All three quotation pages and the 390/600 px tracker menu screenshots matched the prior references. The tracker tap, Escape, modal and eight request observations also matched.
- All 35 core suites, six targeted browser/PDF/template suites, type checking, zero-warning lint, template drift, production build and built isolation passed. The local production build returned 405 for the old maintenance GET requests and 401 for anonymous POSTs. The CLI also rejected a mismatched database name before opening a connection.

A focused scan of 115 API routes found separate existing read-triggered writes. `GET /api/annual-return` with a client and FY may persist a derived Annual Return status. Tracker detail and export GETs may repair category-synced membership and update a reconciliation lease. Those paths preserve live feature behavior and were left for separate review. Other models retain their existing initialization behavior. No claim is made that every application read is side-effect free.

No production data, deployed authorization policy or live SMTP provider was exercised. The billing migration was tested against mocked collection methods. Index coexistence, privileges, legacy duplicates, external maintenance callers and production behavior must be checked against an isolated rehearsal and the intended deployed environment. Re-audit evidence is stored locally in the sibling audit folder under `remaining-*` names.

## Focused security patch

The approved patch starts from `097c618` on `security/smtp-quotation-pdf`. It addresses the SMTP and PDF findings in the historical review below. Production security sign-off remains pending because the maintenance routes, billing read-side migration and Nodemailer package advisories remain open.

### SMTP and PDF changes

| Files | Change and preserved contract |
|---|---|
| `app/api/email/send/route.ts`, `utils/email.ts` | The existing session guard runs before request parsing. A strict schema accepts plain mailbox recipients, subjects without control characters, string-only bodies and typed log fields. The HTTP route has no client attachment contract. It rejects file descriptors, URLs as content descriptors, raw MIME and attachment fields before SMTP or logging. The shared transport validates server-provided Buffer or literal-text attachments, rejects path-like filenames and disables Nodemailer's file and URL resolution. Provider and configuration errors return neutral messages. Existing reminder HTML, supported plain address lists, server-provided attachments, and email log semantics are preserved. [Nodemailer message fields](https://nodemailer.com/message) |
| `app/api/quotation/pdf/route.ts` | The authenticated `{ html }` endpoint keeps the existing quotation builder, inline styles, system fonts, A4 options and base64 response. Chromium serves one synthetic main-frame document from memory with a sandboxed content policy. Scripts, remote resources, embedded documents, base URLs and forms are blocked. Inert inline images and fonts are allowed. JavaScript and network access are disabled, page interception aborts all other requests, and a browser proxy without a direct or loopback fallback backs up the page controls. Chromium uses a debugging pipe. Browser errors return a neutral response. [Puppeteer interception](https://pptr.dev/api/puppeteer.page.setrequestinterception), [Chromium proxy rules](https://chromium.googlesource.com/chromium/src/+/HEAD/net/docs/proxy.md) |
| `scripts/verify-email-smtp.cjs`, `scripts/verify-quotation-pdf.cjs` | Expanded the existing suites to exercise the real SMTP MIME renderer and Chromium against synthetic session, path, header, resource and failure cases. |

### Verification

- Two-recipient reminder MIME and server-provided Buffer attachment MIME matched `097c618` byte for byte with fixed message metadata. The actual Gmail draft route attached the generated quotation PDF with identical attachment bytes using a mocked provider.
- The actual quotation template was rendered before and after with the same 25 synthetic line items. All three A4 pages matched pixel for pixel at 120 DPI. The attack fixture opened zero connections to a synthetic redirect listener despite stylesheet, image, frame, script, metadata-refresh and preconnect inputs, including alternate loopback URL forms.
- Anonymous SMTP, PDF and Gmail draft requests returned 401 in fixtures. SMTP rejected malformed JSON, path descriptors, traversal, unapproved attachments and malformed header values without contacting transport. PDF and SMTP internal errors omitted provider or filesystem details from the HTTP response.
- Type checking, zero-warning lint, the production build, all 34 core suites and six targeted browser, PDF and template suites passed. The targeted checks covered account security, billing, protected email delivery, quotation PDF, security notifications and verification codes. Template drift and built email isolation checks passed. A local production server returned 401 for all eight anonymous SMTP, PDF, maintenance and billing/workspace requests. The PDF route trace includes the bundled Chromium binary.

The tests used local Windows Chromium, synthetic data and mocked sessions, storage and providers. No real email, customer file, metadata service or deployed private network was contacted. The bundled production Chromium executable was traced in the build. The host-specific binary and egress configuration still require deployment-level verification.

### Maintenance and billing investigation

| Route or call path | Evidence and impact | Changes requiring separate approval |
|---|---|---|
| `GET /api/fix-indexes` | A session alone is sufficient. Drops two legacy contact indexes when present and creates the current unique person/client index. The route is in the production build. | Prefer a reviewed operator command. If an HTTP caller is required, use an admin-only POST with the existing origin guard and explicit operation confirmation. Review compatibility with external callers first. |
| `GET /api/migrate-contacts` | A session alone is sufficient. Can create people, merge emails and write company links or selection data. The route is in the production build. | Preserve migration history and review outstanding legacy records. Move to an explicit operation with a dry run or to protected POST after identifying external callers. |
| `GET /api/migrate-client-contact-selections` | A session alone is sufficient. Backfills selected contact details on company links. The route is in the production build. | Use the same protected operation boundary and check whether production has already run the backfill. |
| `GET /api/billing` and `GET /api/quotations/[id]/billing` via `ensureBillingSchema` | An ordinary fixture session reached the backfill and index operations on a cold process. The invalid quotation ID fixture attempted them before returning 400. The client workspace invokes billing GET internally. Corresponding billing POST paths also share the helper. The helper sets defaults on legacy bills, drops a legacy unique index if present and creates the partial unique Annual Return index. | Inventory live schema state through separately authorized read-only checks, review legacy or duplicate records, and move the backfill and index operations to an explicit migration. Preserve billing, quotation eligibility, profile reads and the uniqueness rule during the transition. |

The actual route handlers were exercised with mocked database methods. All three maintenance GETs rejected anonymous sessions and reached the database branch for ordinary and admin sessions. The repository has no extra middleware gate for these routes and no first-party caller for the three maintenance GETs beyond their usage comments. The compiled routes establish reachability in builds from this source. Hosting restrictions, deployed revisions, external callers and current database state remain unverified. No maintenance, billing or authorization code changed in this patch.

## Historical optimization review

## 1. Executive summary

The project has reached a practical stopping point for general optimization. The previously approved changes are recoverable, the build is reproducible, and the tested business and visual contracts still match. Targeted security work is justified before calling the application production-ready. In this review, an ordinary authenticated fixture reproduced server-local file ingestion through legacy SMTP and a server-side loopback request through quotation PDF rendering. The existing maintenance endpoints and cold billing reads also expose persistent operations. These paths predate the optimization.

The re-audit compared the original tag `pre-optimization-2026-11-02` with checkpoint `d1b8b89` and examined the full tracked tree. It inventoried 674 files, including 607 source/config files, 115 API routes, 24 pages and 40 models. It covered client/profile management, EPR and Annual Returns, FY workflows, CPCB uploads/invoices, billing and payments, quotations, reports, settings, access, storage, tracker/search, email and exports. Static analysis was supplemented with contract tests, actual browser and Chromium fixtures, route probes, a fresh build and read-only query sampling. Full authenticated production navigation and live provider actions require a separately authorized environment.

## 2. Original baseline versus final measurements

| Measurement | Original baseline | Optimized checkpoint | Fresh re-audit |
|---|---:|---:|---:|
| Production build, 4 GiB cap | Pass, 151.003 s warm | Pass, 122.607 s warm | Pass, 169.035 s cold and 141.280 s warm |
| OS-sampled aggregate Node peak RSS | 2.35 GiB | 2.14 GiB | 1.87 GiB cold and 1.60 GiB warm |
| Client output, all chunks | 32,380,167 B | 32,403,908 B | 32,403,908 B |
| Server output | 42,352,550 B | 42,634,911 B | 42,634,898 B |
| Shared First Load JS (Next estimate) | 103 kB | 103 kB | 103 kB |
| Node modules paths in the lockfile | 730 | 712 | 712 |
| npm audit package findings, full / production | 41 / 24 | 22 / 9 | 22 / 9 |
| Critical findings | 2 | 0 | 0 |
| Tracked bytes (before this report and doc/fixture edits) | 7,752,644 | 7,741,641 | 7,741,641 |
| Confirmed unused internal modules | 10 | 0 in scanned roots | 0 in scanned roots |
| Cross-file function body matches in the same token scan | 19 | — | 9 |
| Median login LCP, desktop / mobile | 120 / 80 ms | 100 / 80 ms | 104 / 104 ms |
| Median six protected API responses (anonymous loopback) | 5.5 ms | — | 8 ms |
| Representative populated-year/client driver round trip | Initial baseline sampled different FY data | 28.02 ms median | 26.49 ms median |

The first re-audit build started without a cache and overlapped browser tests. The warm rerun used the same cache policy and heap cap as the baseline. It was 9.723 s faster than the baseline and 18.673 s slower than the earlier optimized run. This variation limits conclusions about build speed. RSS measures sampled build-process memory. Browser login metrics use three local navigations per width. Mobile LCP and median loopback API time rose in this run, while desktop LCP fell. These small samples do not establish a repeatable change. All six anonymous responses and the login redirect matched exactly. Next's total output and route estimates do not measure initial transfer or loaded JavaScript on a business page.

The route-level First Load JS estimate rose from 310 to 316 kB for client profile, 292 to 300 kB for tracker detail, 252 to 260 kB for Reports, and 262 to 270 kB for Settings. Login and billing remained at 117 and 223 kB respectively. The larger estimates are a measurable trade-off in this build. Their effect on authenticated navigation is unmeasured.

The populated database rerun covered 28 bounded reads. MongoDB reported 0–1 ms query execution and the driver median was about 26.5 ms. The comparable sample is the prior populated-year measurement; the original baseline used mostly sparse-year plans. Native reads bypass route, session and external-service costs. No live authenticated aggregation endpoint was called. The previous matched 500-company billing render benchmark measured 20.4 to 16.0 ms median React CPU with identical output and 351.7 to 363.8 ms median fixture readiness. No overall billing load improvement is established.

## 3. Independently verified improvements

| Earlier stage | Recheck and outcome |
|---|---|
| Recovery and harness | Baseline and final commits are present. Tracker configuration and email memory/restart pass, including fixture validation, crash points, budget and byte checks. |
| Dependency batches | Fresh npm ci and npm ls passed. The lock still resolves Next 15.5.28, NextAuth 4.24.15, Mongoose 8.24.7 and the scoped patched PostCSS 8 dependency. No fresh dependency changes were needed. |
| Cleanup | Reviewed the ten prior deletions and references. The active Chromium PDF and Excel paths pass. npm has no jsPDF-only paths. The current import scan found no additional zero-incoming modules under lib, components and utils. |
| Consolidation | Repeated same-input comparison of the tagged and final billing code on 117 bills. All six paginated/full company, bill and component results were equal. Repeated equivalence probes matched the aggregation, 64 normalization cases, 63 flat mappings, saved report/template serializers and workbook styles. |
| Mongoose reliability | Fresh tests cover rejection followed by retry, shared concurrent attempts, reuse and disconnect recovery. The change is localized to the connector promise, with no index or model changes. |
| Lint and frontend | Repeated strict zero-warning lint and type checking. The existing billing formatter fixtures pass. The tracker canvas and thumbnail retain their tested output and interaction contracts. |
| Docs and templates | Fresh install/build commands worked. Inlined email HTML matches the source templates after newline normalization. Corrected Chrome fixture prerequisites and documented optional session timing keys and the separate legacy reminder job. |

The new shared modules have focused responsibilities. Billing write-response aggregation remains separate from report allocation. The spreadsheet style helper, two serializers and financial-year normalization share only equivalent code. Reconciliation of all three actual Excel billing exports was recorded in the earlier read-only run; the new review repeated complete same-input output comparison and Excel style/route fixtures.

## 4. Remaining findings and priorities

### A. Must fix before production security sign-off

| Finding and affected files | Evidence, impact and proposed review |
|---|---|
| Legacy SMTP accepts structured HTML · `app/api/email/send/route.ts`, `utils/email.ts` | With an ordinary session, both HTML fields accepted a file descriptor object. Real Nodemailer stream transport included a generated local file marker in the MIME and the handler returned 200. Anonymous access returned 401. With legacy SMTP configured, the same path can put readable local files into outgoing mail. Only a generated file and a dummy recipient were used. Propose validating request shapes before transport and disallowing filesystem/network-backed content for this route. Preserve the exact string-based quotation and reminder templates and Buffer attachments used internally. [Nodemailer message fields](https://nodemailer.com/message) |
| Quotation PDF permits caller-directed browser requests · `app/api/quotation/pdf/route.ts`, `app/dashboard/quotations/[id]/page.tsx` | The real handler returned a PDF for an ordinary fixture session and Chromium requested the supplied image from a synthetic loopback listener. This demonstrates server-side request capability. Real deployment egress and private-service reachability are unknown. Propose denying external requests and scripts by default after verifying which assets the current quotation HTML needs, then compare representative PDF pages. [Puppeteer request interception](https://pptr.dev/api/puppeteer.page.setrequestinterception) |
| Maintenance GETs expose persistent operations · `app/api/fix-indexes/route.ts`, `app/api/migrate-contacts/route.ts`, `app/api/migrate-client-contact-selections/route.ts` | Each actual handler returned 401 to anonymous requests and reached mocked database operations for ordinary and admin sessions. Local search found no callers beyond route comments. Hosting restrictions and external callers remain unknown. Review those callers, then agree on a protected operational command or admin-only POST with the existing origin guard. |
| Financial reads can write schema/data · `app/api/billing/route.ts`, `app/api/quotations/[id]/billing/route.ts`, `lib/billing-utils.ts`, `app/api/clients/[clientId]/workspace/route.ts` | On a cold mocked instance, billing GET attempted updateMany, legacy index drop and unique index creation before reading. A quotation eligibility request with an invalid ID attempted the same operations before returning 400. The workspace invokes billing GET. In production this adds cold latency and read-path dependence on write privileges and index success. Move the migration boundary only after reviewing deployed schema state, callers and rollback. No real maintenance operations were invoked. |
| Remaining high dependency finding · `package.json`, `package-lock.json`, `utils/email.ts` | The production tree reports one high package finding, Nodemailer 8.0.11. It includes multiple advisories and npm identifies 10.3.1 as the available major remediation. The direct SMTP finding above is separately reproducible on the app path and merits input validation even after an upgrade. Plan provider/MIME validation before a major update. [Nodemailer raw-option advisory](https://github.com/advisories/GHSA-p6gq-j5cr-w38f) |

### B. Worth optimizing with targeted evidence or approval

| Finding and affected files | Evidence and practical next step |
|---|---|
| Report Studio cache scope · `lib/reportStudioClientCache.ts`, `lib/cache.ts`, `app/providers.tsx`, `app/dashboard/reports/ReportStudio.tsx` | In the actual cache modules, an in-page scope change left the old fixture response available from both the synchronous and async read paths, without another network request. Normal sign-out navigates to login and reloads module memory. A deployed cross-account leak was not reproduced. Test same-tab session expiry/account or role changes, including stale in-flight results, before scoping and fencing this cache. The 12-entry cap and 60-second TTL bound the normal cache. |
| Repeated workspace authorization and section reads · `app/api/clients/[clientId]/workspace/route.ts`, section GET handlers, `app/dashboard/clients/[clientId]/page.tsx` | One workspace network request fans out to seven route handlers in parallel. They each repeat session lookup after the parent's check. SWR already deduplicates workspace reads. Use the existing Server-Timing breakdown on a representative test deployment. Internal authenticated read services may reduce work while retaining every public guard and partial-error response. Do not use the current workspace endpoint as a live read-only probe because it calls billing schema repair. |
| Legacy bulk SMTP recovery · `app/api/email/bulk-reminder/route.ts`, `app/dashboard/billing/BulkReminderModal.tsx`, `models/BulkReminderJob.ts` | A live caller exists. The PATCH marks a job running and starts an in-process task after responding, with recipient sleeps and repeated job-status reads. Host termination can strand jobs and separate start requests can race because the state check and save are separate. Source establishes these failure conditions; live delivery was not exercised. Reproduce interruption/concurrent-start in a fixture before changing delivery semantics. |
| Full-result billing and report work · `lib/billing-report.ts`, `lib/server/billing-report-service.ts`, `lib/server/reporting-service.ts`, `lib/server/report-studio-service.ts` | Billing builds components for scoped bills before filtering/pagination, including one filter of category assignments per bill. Report assembly can load all revisions of matched quotations and historical payment/advance inputs. These are scale candidates. Whole-result totals and legacy allocation rules depend on input selection. The observed populated sample does not justify changing these paths or adding indexes. |
| Dependency support horizon · `package.json`, `package-lock.json`, `next.config.mjs` | Next 15 remains on Maintenance LTS through 31 January 2027. Several moderate production findings flow through ExcelJS archive/glob dependencies. Schedule compatible patch reviews and a separately approved framework upgrade ahead of support expiry. [Next.js support policy](https://nextjs.org/support-policy) |

### C. Optional or low value

- `app/dashboard/annual-return/page.tsx` and `app/dashboard/clients/[clientId]/ClientProfileSupport.tsx` duplicate a small restore action. The latter also shares selection code with `app/dashboard/clients/page.tsx`. `ClientProfileCpcbRecords.tsx` and `app/dashboard/cpcb-uploads/invoice-tracking/page.tsx` repeat two label mappings. Extract these when touching the relevant feature. Their current cost is consistency during edits, with no measured performance effect.
- The remaining token groups include quotation and FY modal callbacks. Their identical syntax does not show equivalent closures or state transitions. Preserve local ownership unless tests establish interchangeable behavior.
- `lib/cache.ts` retains stale keys until invalidated or until the session scope changes. Source inspection shows a retention opportunity. A long-session heap capture would be needed to establish material growth. The existing request token prevents invalidated results from repopulating the general cache.
- `app/api/client-trackers/[id]/email/replies/route.ts` can make up to 100 sequential Gmail thread requests for an administrator's explicit action. The code bounds the read count. Measure provider latency and rate-limit behavior before changing batching or concurrency.

### D. Leave unchanged

- Large CSS/components and the lazy OpenCV chunk (`lib/target-screenshot/localOcrAdapter.ts`) do not establish a slow initial page. The largest generated chunk is about 26.6 MB uncompressed, about 4.4 MB gzip, and loaded by the screenshot OCR path. Tracked image assets total under 5 kB. Preserve CSS ordering, loading, pagination, tracker refresh, and animation timing until a trace shows a user-visible bottleneck.
- Retain the FY type-only import cycle, the lazy account-security mail cycle, and the email delivery provider/dock cycle. The scan found these three known edges and fixtures established no runtime initialization defect. Keep the historical byte-identical email memory fixture used for before/after testing.
- Preserve billing versus sale/purchase invoice semantics, FY typed versus legacy fallback data, and the browser coordinator's leases, explicit resume and uncertain-send handling. Preserve migrations, operational scripts, compatibility dependencies and historical test/report artifacts when external use or provenance is uncertain.

## 5. Dependency and warning details

Fresh audit reports 21 moderate and one high package findings overall, eight moderate and one high in production, and zero critical. The lockfile tree is consistent. npm reports optional Windows artifacts `@emnapi/runtime` and `@img/sharp-wasm32` as extraneous and reports transitive deprecations including `inflight`, `glob` 7, `rimraf` 2, `fstream` and `lodash.isequal`. Those notices are distinct from TypeScript, ESLint and Next build checks, which passed. The static direct-use scan was reconciled against configuration/plugin/tool entry points, including the UUID override, Next ESLint config, Autoprefixer and type packages. No dependency was confirmed safe to remove in this pass. No lint check was disabled.

## 6. Build and regression coverage

The original audit recorded 29/31 logic suites and 7/7 browser suites, a passing type check and four code warnings plus a lint-command deprecation. This review passed all 34 core suites and 20 distinct browser/Chromium suites. Both builds, strict lint, type checking, template drift, fresh npm ci, npm ls and built production isolation passed.

Two browser suites failed on their first pass. The extended FY fixture tried to click before the visible control was ready. A five-second bounded wait was added to the fixture, after which both the extended and standalone FY suites passed. The workflow delivery fixture observed a stale entry focus attribute once. It passed on an isolated repeat without changes. That first result remains a test stability signal. Production source, assets, dependencies and configuration were identical to the starting checkpoint.

| Feature | Evidence and boundary |
|---|---|
| Clients, EPR/FY, Annual Returns and invoices | Client form and FY logic/route tests, real-profile fixture with typed/legacy coverage, allocation and target tests, attachment fixture and read-only collection sample. No live record edits. No full live invoice creation or end-to-end Annual Return workflow was attempted. |
| Billing, payments and Report Studio | Same-input original/final outputs, billing UI, allocation/overpayments, report metrics/security/custom fields/interactions and workbook checks. Exact allocation rules preserved on tested cases. |
| Search and trackers | Search routes/browser, tracker configuration, synchronization, linked data, editing, navigation, responsive behavior, and uploads. No empty/loading frames in the measured tracker edit fixture. |
| Admin/Google, approval, sessions, OTP and Settings | Account-security route/logic/UI fixtures, approval and identity binding, recovery, optional 2FA and session revocation checks. Live OAuth redirects, provider configuration and all Settings panels on every device remain outside the fixture matrix. |
| Gmail, SMTP, PDFs and notifications | Browser delivery security/activity/motion, lifecycle, mail memory, SMTP MIME, template drift, built isolation and actual Chromium PDF bytes. No external delivery, inbox actions or provider credentials exercised. |

## 7. Visual and interaction comparison

The 390 and 1440 px login screenshots and the 390 and 600 px mobile three-dot menu screenshots were pixel-identical. Tracker first tap, second tap, outside tap, Escape, Edit modal open/close and all eight fixture requests matched the original. No horizontal overflow was detected in the local login checks. No CSS, animation, production handler or application component changed during this review. The prior billing and private thumbnail comparisons are retained as historical evidence.

## 8. Cleanup and deletion manifest

The previous tracked deletions remain in [cleanup-manifest.md](docs/cleanup-manifest.md). This review removed no tracked files or packages. The AST/reference inventory was checked against public asset naming, route/page conventions, dynamic OCR/browser paths, scripts, npm configuration, Vercel tracing, and the local experiment exclusion. Ignored development, output and temporary directories contain historical evidence, active test outputs and build caches. They were kept where retention or ownership was uncertain. The warm cache supports repeat builds and stays excluded from Git. New browser captures use disposable operating-system profiles.

## 9. Documentation accuracy

Checked README and AGENTS.md against scripts, tracked folders, environment reads and the auth/billing/export entry points. The auth provider variables, security secrets, invoice distinctions, template regeneration and tests are consistent. Corrected the distinction between the Chrome-based fixtures and the route's Chrome/Edge detection. Added optional session durations with current defaults, and distinguished the browser-coordinated tracker campaign from the legacy in-process billing reminder. Historical notes remain available and marked as historical. The glass lab's optional preview flag is documented in its own guide.

## 10. Final recommendation

Close the general optimization effort. The fresh evidence does not support a rewrite, general bundle reduction, changed cache lifetimes, or new indexes. Request approval for a focused hardening batch covering the verified SMTP and PDF paths first. Review the maintenance and billing read-side migration contract separately with the operator, along with a compatible dependency migration plan. Authenticated staging traces for client profiles, large reports, tracker navigation and Settings would inform any later performance work.

Evidence is retained locally in the sibling `optimization-audit-2026-11-02` directory under `reaudit-*` names, including inventory, probes, build/runtime metrics, source-equivalence results, browser runs and npm audit. The original reports, captures, Git tags and bundles are preserved. New probes use generated fixture data or bounded read-only queries and retain aggregate results only.

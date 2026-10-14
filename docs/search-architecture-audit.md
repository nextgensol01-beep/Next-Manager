# Search architecture audit and implementation report

Audit date: 2026-10-09. Repository: `C:/Users/User/Desktop/CodeX/align`. The checkout has no usable Git metadata; pre-change application sources and `package.json` are retained in the sibling directory `C:/Users/User/Desktop/CodeX/search-architecture-baseline` for review and UI comparisons. Keeping this snapshot outside the project prevents Next.js/TypeScript from compiling duplicate sources.

Implemented consistent Clients-page matching across applicable client and client-record searches. Complete local collections retain immediate filtering; server-paged or capped collections search before pagination. Existing module fields and page scopes remain additive. Search UI elements, styling, placeholders, icons and layouts were preserved. TypeScript, lint, production build, search tests and relevant existing regression suites passed. Production-wide latency and rerender benchmarks remain unmeasured.

## Audit completed before implementation

Discovery covered all `app`, `components`, `lib`, `utils`, and `models` TypeScript/TSX files, using search state names, input placeholders, `type=search`, callbacks, `includes`, filters, regex, fetch/cache hooks, and URL parameters. Raw findings: [implementation patterns](search-audit-patterns.txt) and [dashboard search inputs](search-audit-dashboard.txt). Ordinary select controls without text searching, business rule filters, DOM `querySelector`, and database lookups unrelated to user search were inspected but are not text search bars.

Types: A client lookup; B local collection filter; C client plus module; D other domain. All local paths have synchronous input state and no search debounce unless explicitly stated below. Existing sorting, scopes and result presentation must remain intact.

| Surface / component | Type | Existing fields | Source / completeness / filters / debounce | Recommendation and final strategy |
|---|---|---|---|---|
| Clients `app/dashboard/clients/page.tsx` desktop and mobile inputs | A | client ID, company, legal name, active searchable noncredential custom fields; linked person name, phones, emails | `/api/clients`, 30-row server pages; category/state/registration FY; 300 ms; cached URL | Keep server paging; share matching, correct selected contact scope |
| Financial Year `app/dashboard/financial-year/page.tsx` | C | company, ID, client category | complete FY records and full `/api/clients`; FY request scope; memoized local | Extend local client matching; retain category; FY text is additive |
| Financial Year insights `FinancialYearInsightsModal.tsx` drawer | A | client name/ID | complete metric rows derived from complete clients and records; category/metric/sort; local memo | Extend locally using the already supplied client objects |
| Billing `app/dashboard/billing/page.tsx` | C | company, ID, payment status, bill title | complete FY billing/payments and clients; bill type/status; local memo | Extend locally, retain all fields |
| Billing search renderers `BillingSearchFilters`, `BillingControlBar` (3 responsive inputs), `BillingScrollHeader`, `BillingStickyHeader`, `BillingStickyBar` | C | delegated billing search state | presentation wrappers sharing page logic; no independent queries | Leave every renderer unchanged |
| Advances `AdvancePaymentsSection.tsx` / billing page | C | company, ID, payment mode, reference, notes | complete FY payments and client grouping; local memo | Extend client matching locally, retain payment text |
| Credit Transactions `app/dashboard/credit-transactions/page.tsx` | C | sender/receiver company and IDs, External, notes, credit type, formatted date | previously complete FY/type-scoped transactions and full clients; local text memo | Extend both relationships locally; load complete FY transactions once; filter Recycling/EOL locally and retain existing summary semantics |
| CPCB upload list `cpcb-uploads/upload-records/page.tsx` | C | company, ID, Sale/Purchase label | complete FY uploads and full clients; grouping/sort after search | Extend locally, retain type label |
| CPCB upload client picker (same file) | A | company/ID | full clients; local filter before display slice of 8 | Extend locally; slice only after matching |
| Invoice Tracking `cpcb-uploads/invoice-tracking/page.tsx` | C | company/ID | invoices and coverage endpoints; FY/client scope; 250 ms remote debounce | Comprehensive server matching before loading records; literal regex |
| Annual Returns `annual-return/page.tsx` | A/C | company | previously FY/status/search-scoped `/api/annual-return` with a request on typing; full clients already loaded; FY records have no server pagination | Load complete FY records once; comprehensive local client matching OR snapshot company; local status AND text; legacy Pending remains included in Not Started. API callers retain comprehensive server search and FY/status/client constraints |
| Quotations list `quotations/page.tsx` | C | client name, quote number, FY, status, linked contact name; legacy client-name association | server records; FY/status/client scope; 350 ms | Extend remote client matching; preserve legacy contact-name behavior and all fields; prevent stale fetch completion |
| New quotation company autocomplete (same file) | A | summary company/ID/legal/custom | incomplete bounded `/api/clients?summary=1`; 200 ms | Comprehensive summary search; cancellation guard |
| Quotation editor company autocomplete `quotations/[id]/page.tsx` | A | summary company/ID/legal/custom | bounded summaries; 200 ms | Same service; cancellation guard |
| Quotation link-client modal (same file) | A | full Clients endpoint search; display first 12 | remote; 250 ms; cancellation guard already present | Request bounded summaries rather than full client documents |
| Quotation service picker (same file) | B/D | standard service label/category/type | complete static catalog; local instant | Keep unchanged |
| Tracker catalog `client-trackers/page.tsx` | D | tracker name, description, FY | complete tracker list; status filter; instant local | Keep unchanged |
| Tracker create audience `TrackerAudienceSection.tsx` | A | company/ID/category | full `/api/clients`; selected/categories separate; filter then local slice 100/load more | Extend local client matching, retain concatenated legacy text |
| Tracker configure membership `TrackerClientManager.tsx` | A | company/ID/category | full clients loaded only when configuring; selected filter; local slice/load more | Extend locally; preserve selection and no text requests |
| Tracker entries `client-trackers/[id]/page.tsx` / `lib/useTrackerQuery.ts` | A/C | client company/ID/category | 100-row server pages; category/saved view/field/value; debounced URL keys | Extend server client matching; preserve server pagination and field filters |
| Tracker field-value text input (same file) | B/C | selected text/longText/tags field substring; boolean and typed values in adjacent filters | server-paged entries; derived fields resolved in bounded scan before pagination | Keep typed filter semantics; do not substitute generic client matching |
| Workflow variable picker `TrackerRichTextEditor.tsx` | D | variable label/key/group | complete local variable catalog | Keep unchanged |
| Contacts `contacts/page.tsx` | D | person name/phones/emails | full `/api/persons?limit=all` already loaded plus `/api/contacts?withCompanies=true`; previously debounced query-specific directory requests | Load directory and persons once; instantly match name/selected phones/emails locally; map companies by person ID; refresh both after mutations |
| Person lookup `clients/[clientId]/ClientProfileSupport.tsx`, reused in client forms | D | person name/phones/emails | `/api/persons`, bounded options; 250 ms | Keep domain search; guard stale responses and close/unmount |
| Client form paste-contact resolution `components/clients/ClientFormModal.tsx` | D | remote matching name, exact lowercase name selection | unique pasted names; directory requests; batch workflow | Keep; not a keystroke search; existing cancellation checked |
| Client documents `ClientProfilePremiumSections.tsx` | D | document name | complete documents for this client; local memo | Keep unchanged |
| Email History `email-history/page.tsx` | C | subject, client snapshot name, recipients, FY | `/api/email-log` capped at 200; type filter; local search incomplete | Comprehensive client OR module matching before server page; 300 ms; 200-record pages continue on existing scroll surfaces |
| Trash `trash/page.tsx` | D | label/subLabel | `/api/trash` capped at 200; record type; local search incomplete | Domain search before server page; 300 ms; 200-record scroll continuation, label/subLabel retained |
| Settings sidebar `settings/SettingsSidebar.tsx` | D | tab labels, section labels/sublabels, user name/email/login ID, registered sections | complete local catalog/users; permission-aware sections; keyboard navigation | Keep unchanged |
| Report export clients `reports/page.tsx` + `CustomExportModal.tsx` | A | summary company/ID/legal/custom | bounded remote summaries; categories; delayed effect with AbortController | Extend shared summary service; keep existing cancellation/filter keys |
| Report export fields `CustomExportModal.tsx` | D | label/description/group | complete static/dynamic fields | Keep instant local |
| Report Studio clients `reports/ReportStudio.tsx` | A | company/legal/ID/GST/registration | server reports, server paging; source/FY/filter tree/sort; 300 ms and abort/sequence | Comprehensive matching on server; retain GST/registration |
| Report Studio column library (same file) | D | field label/description/group | complete local field definitions; memo | Keep unchanged |
| Report Studio analysis field library (same file) | D | label/description/group | complete local fields | Keep unchanged |
| Report Studio hidden/insert column context picker (same file) | D | label/group/description | complete hidden local fields; memo | Keep unchanged |
| `reports/ReportSelect.tsx` reusable searchable selector | D | option label/group | complete local options; keyboard/group/focus preserved | Keep unchanged; covers source, sort field, condition field/value, and `ReportStudioAnalysis` analyze-field selectors |
| Report API/export `lib/server/reporting-service.ts` | C | client ID/company/legal/category/state, quotation numbers | complete server-built report before paging; all query filters | Extend client matching without dropping module fields; same export path |

## Reference matching and query/index review

The original Clients search escapes literal regex, also generates an NFKD/lowercase ASCII alphanumeric query (first 80 normalized characters) with non-alphanumeric separators between characters. It does **not** search core GST/registration/address/state/category fields as client identity, unless present in configured searchable custom fields. Preserve this identity rule; module-specific existing fields remain additive. Values must not be truncated to 80 characters when searched. Password/portal-group/custom credential fields are excluded for all users.

Person–Client links store selected phones/emails. Missing selections mean all currently available values; explicit empty selections mean none. Deleted/missing persons must not match. The original global-person lookup ignored selections and requires correction.

Existing indexes include unique Client.clientId; Client createdAt/category/state; ClientContact clientId/personId; Person _id/phones/emails; FY/client compound indexes across financial modules; tracker membership and scoped update order; quotation revisions; EmailLog sentAt. No arbitrary substring B-tree indexes or search engine should be introduced. Correlated record/client/contact joins can use relationship indexes and keep matching IDs inside MongoDB. Text regex itself still scans candidate strings. Production explain/latency figures require a safe real database run and are not implied by this audit.

## Shared architecture and matching

The Clients page remains the reference. Its existing input, 300 ms delay, URL cache keys and server paging remain in place; its server service now delegates to reusable matching stages. The inventory above was created before application edits; the final-strategy column has been updated to describe the delivered implementation.

| Utility or service | Responsibility |
|---|---|
| `lib/search/client-search.ts` | Shared identity fields, literal regex escaping, established flexible query pattern, compiled matcher, safe local client values and a lightweight client-ID index |
| `lib/search/use-client-search.ts` | Memoize the index when client data changes and produce matching IDs synchronously when text changes; no requests or debounce |
| `lib/server/client-search.ts` | MongoDB client/contact matching, safe local `searchValues` projection, mixed record/client joins and tracker category scope |
| `lib/server/client-contact-service.ts` | Existing authoritative Clients service, full and summary responses, scoped count/page query, selected-contact enrichment |
| `lib/server/client-credentials.ts` | Reuse existing custom-field/group metadata to derive searchable nonprotected keys while preserving credential read/write rules |
| `lib/search/use-network-search.ts` | 300 ms network debounce for Email History and Trash |
| `lib/search/use-paged-search.ts` | URL-scoped, cached, bounded pages for those two lists; reject stale completions; continue on scroll without adding controls |
| `lib/cache.ts`, `lib/useCache.ts`, `app/providers.tsx` | Deduplicate identical reads, isolate authorization scope, reject obsolete reads and protect optimistic state |

Comprehensive matching includes company name, legal name, client ID, linked person names, relevant selected phones/emails, and active searchable custom string/string-array values. Numeric, boolean or object custom values are not silently stringified into new search fields: this preserves the reference MongoDB regex semantics. Each field matches independently. The first-80-character rule applies to the normalized query pattern, not the full stored values.

Full-client responses add server-derived `searchValues`, excluding passwords and portal credential fields even for administrators. Local matching reuses those values, so browser code does not infer custom-field visibility. Shared contacts expose only current values selected on each client link; legacy missing selections use current Person values, explicit empty selections use none, and deleted persons do not match. Contact names remain searchable on every valid link. A selected value removed from the Person no longer matches.

Server queries keep caller authorization, FY, status, category, explicit client and membership constraints outside the search OR. Correlated joins retain matching records inside MongoDB rather than passing an unbounded matching-client ID list between modules. Paginated Clients count and page are computed in one facet; contact/document enrichment follows the page limit. Summary selectors project and limit in the database. In normal tracker reads without client text/category stages, the existing find/count path remains available.

Legacy quotation records without a client ID can associate by an exact case-insensitive company name for contact matching. This keeps legacy lookup useful while avoiding false associations with similarly named companies. Report Studio retains its existing GST/registration matching and legacy custom legal-name fallback. The general report query also retains category, state and quotation-number text; Studio client search does not turn those domain fields into identity matches.

## Comprehensive modules and preserved local behavior

Comprehensive client matching now reaches Clients and bounded summaries; Financial Year and its insights drawer; Billing and Advances; both Credit Transaction relationships; CPCB upload lists and their client picker; Annual Returns; Invoice Tracking and coverage; Quotations and their company/link selectors; Tracker audience, membership and entry searches/exports; report client selectors, report queries/exports and Report Studio; and Email History.

Immediate local filtering remains on Financial Year, insights, Billing, Advances, Credit Transactions, upload records/picker, tracker audience and membership. Annual Returns and Contacts now use their complete existing data locally too. Credit type and Annual Return status filter loaded FY data immediately. Relevant client loading is included in loading state so a temporarily empty client index is not presented as a complete negative result.

Unrelated domain searches remain focused and unchanged: tracker catalog, workflow variable picker, quotation standard services, client documents, Settings, report field/column/analysis libraries and the reusable report selector. Person lookup keeps its remote directory semantics, delay and selection behavior; cancellation and a server limit matching its five visible options were added. Paste-contact resolution remains a batch workflow.

Mixed local searches compose matching client IDs with the original module predicate. Bill titles and payment statuses, advance mode/reference/notes, transaction External/type/date/notes, FY category, upload Sale/Purchase, and tracker audience/category strings remain searchable. Page filters, sorting, selections and local display slices still operate on the resulting collection. Typed tracker column filters remain distinct from client text search, including boolean, numeric, tag, text and live derived fields.

## Performance changes and evidence

| Path | Before, established from source | Delivered and verified |
|---|---|---|
| Complete local pages | Immediate text filtering with limited client fields | Comprehensive local matching; browser tests observed zero new API calls while typing or clearing across eight page/selector surfaces |
| Annual Returns | Search/status in request URL despite full clients and unpaginated FY records | FY-only load; browser checks verified status AND text with zero new requests, including Pending under Not Started |
| Credit Transactions | Type changed the FY API URL | Complete FY load; browser checks verified type AND text without new requests |
| Contacts | Full Persons data plus debounced query-specific directory reads | One directory read plus existing Persons read; phone/email typing and clearing generated no new requests |
| Client selectors | Summary search omitted contacts; quotation link fetched full matching client documents then sliced to 12 | Comprehensive bounded summary search; link selector requests 12 summaries; person selector requests five options |
| Client page | Separate count/list search plus enrichment | Single scoped aggregate facet for count/page, enrichment only for returned page; metadata reused from credential access |
| Email History / Trash | Search only within newest 200 records | Search full eligible server collection before 200-record pages; tests found record 304 and fetched offset 200 on scroll |
| Repeated cached reads | Concurrent identical reads could repeat; invalidated/old reads could refill cache | Identical URL reads share a promise; tests verified deduplication, invalidation, optimistic updates and account/role isolation |
| Fast query changes | Several manual selector/list fetches could complete out of order | Abort controllers and request generations; browser cache tests resolved reads in reverse order without stale replacement |

Memoized indexes normalize/compile a query once per change and return ID sets reused by record predicates. Client and person maps replace repeated per-row linear lookups in the changed local pages. No new fetching library, search engine, virtualization, dependency, database schema or index was introduced.

The live database check was read-only, with automatic collection/index creation disabled. It sampled 50 clients, compared 15 actual MongoDB-stage searches with local results, and inspected existing Client/ClientContact relationship indexes. Those scoped query times were 30–78 ms. This is consistency evidence and a small scoped timing sample, **not** a before/after production benchmark. Existing Client indexes include clientId, createdAt, category/createdAt and state/createdAt; actual ClientContact indexes include clientId, clientId/personId, clientId/isPrimaryContact and personId. Schema-declared Person phone/email indexes were reviewed. Arbitrary substring regex still scans candidate strings; relationship indexes do not make it a prefix or full-text search.

Reliable before/after full-database latency, MongoDB execution-plan comparisons, sustained-load query counts, browser keystroke timing and React rerender profiles were not collected. No numerical speedup is claimed. Request reductions above are supported by source comparison and instrumented production-component tests; no new text requests on complete local collections are asserted rather than an invented millisecond improvement.

## Modified application files

Paths are relative to `C:/Users/User/Desktop/CodeX/align`.

| Files | Important change |
|---|---|
| `lib/search/client-search.ts`, `use-client-search.ts`, `use-network-search.ts`, `use-paged-search.ts`; `lib/server/client-search.ts` | New shared matching and two bounded remote-list helpers |
| `lib/server/client-contact-service.ts`, `lib/server/client-credentials.ts`; `app/api/clients/route.ts` | Comprehensive full/summary/page matching, safe projection, selected contacts, shared metadata and length validation |
| `app/api/contacts/route.ts`, `app/api/persons/route.ts` | Query-length validation; bounded person selector requests with existing explicit all-persons mode retained |
| `app/dashboard/contacts/page.tsx`; `app/dashboard/clients/[clientId]/ClientProfileSupport.tsx` | Instant complete directory filtering and guarded person lookup |
| `app/dashboard/financial-year/page.tsx`, `FinancialYearInsightsModal.tsx` | Comprehensive local matching while retaining FY/category/metric logic |
| `app/dashboard/billing/page.tsx`; `app/dashboard/credit-transactions/page.tsx` | Shared local client IDs, efficient maps, original bill/payment/transaction fields; local credit-type filtering |
| `app/dashboard/cpcb-uploads/upload-records/page.tsx` | Comprehensive local upload/picker search before display limits |
| `app/dashboard/annual-return/page.tsx`; `app/api/annual-return/route.ts` | Complete FY local page search/status; comprehensive API search with explicit client scope preserved |
| `app/api/invoices/route.ts`, `app/api/invoices/coverage/route.ts` | Literal-safe comprehensive record/client joins under existing FY/client scope |
| `app/api/quotations/route.ts`; `app/dashboard/quotations/page.tsx`, `[id]/page.tsx` | Comprehensive client OR existing quote fields; bounded link summaries; stale-request guards |
| `components/client-trackers/create/TrackerAudienceSection.tsx`; `components/client-trackers/configure/TrackerClientManager.tsx` | Comprehensive local option matching; selection/category/slices preserved |
| `app/api/client-trackers/[id]/route.ts`, `export/route.ts` | Matching before server pagination/export with membership, category and typed filter behavior retained |
| `lib/server/reporting-service.ts`, `lib/server/report-studio-service.ts` | Comprehensive client matching before report pagination/export, original report-domain fields and Studio filters preserved |
| `app/api/email-log/route.ts`; `app/dashboard/email-history/page.tsx` | Full-collection server search and optional paged response with scroll continuation; legacy array callers remain supported |
| `app/api/trash/route.ts`; `app/dashboard/trash/page.tsx` | Full-collection domain matching and optional pages; existing credential scrubbing retained |
| `lib/cache.ts`, `lib/useCache.ts`, `app/providers.tsx` | Identical-request sharing, stale/optimistic protection, dependent-search invalidation and account/role cache scope |
| `package.json` | Four search verification commands; dependency declarations unchanged |

Added verification resources: `scripts/verify-search-architecture.cjs`, `verify-search-routes.cjs`, `verify-search-browser.cjs`, `verify-search-live-readonly.cjs`, `search-test-loader.cjs`, `search-fixture-pipeline.cjs`; fixtures `scripts/fixtures/search-architecture.tsx`, `search-providers.cjs`, `search-navigation.cjs`, `search-visual-baseline.json`. The existing `scripts/verify-tracker-configuration.cjs` mock was updated to interpret the new search aggregation; original regression assertions were retained. This report and the two raw discovery logs are in `docs/`. One-time implementation scripts were archived alongside the original-source snapshot.

## Verification results

| Check | Result and coverage |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS; four pre-existing warnings described below |
| `npm run build` | PASS on final source; all 83 static pages generated and application routes built |
| `npm run verify:search-architecture` | PASS: local/server fixture parity, case/partial/punctuation/phone/email/custom/long values, shared selected contacts, missing/deleted data, sensitive exclusions, literal regex, mixed OR/scopes, tracker category and cache behavior |
| `npm run verify:search-routes` | PASS: actual handlers with fixture data; unauthenticated requests, maximum lengths, full/summary/page projections, client/FY/status/category scope, module predicates, report paging/export, Studio legal fallback, 305-record email/trash continuation |
| `npm run verify:search-browser` | PASS: actual production components bundled with mock APIs in Chromium; eight local surfaces, typing/empty/clear, zero new requests, type/status AND text, off-page matches, remote scroll continuation, reverse completions and optimistic updates |
| `npm run verify:search-live-readonly` | PASS: 50-client actual MongoDB sample, 15 query comparisons, read-only joins and relationship-index inspection; sanitized results in `tmp/search-architecture-tests/live-readonly.json` |
| `npm run verify:client-form` | PASS: client paste/contact selections, credentials/encryption, linked transactions and existing client workflow checks |
| `npm run verify:financial-year` | PASS: FY/ledger migration, CRUD, decimals, concurrency and authorization regression checks |
| `npm run verify:quotation-additional-items` | PASS: existing quotation item/calculation workflow |
| `npm run verify:report-metrics`, `verify:report-security`, `verify:report-custom-fields` | PASS: existing report calculations, sensitive fields and custom export behavior |
| `npm run verify:tracker-configuration` | PASS: off-page matching, literal input, category/membership, saved views, boolean/numeric filters and export consistency |
| `npm run verify:tracker-linked-data` | PASS: existing linked and derived tracker data |
| `npm run verify:tracker-search` | PASS: actual tracker search typing/focus/debounce request, offset reset, numeric-filter integrity, cache invalidation and retry |
| `npm run verify:tracker-create` | PASS: production builder desktop/mobile/reduced motion, types/selections/keyboard and API recovery |
| UI preservation comparison | PASS: AST signatures for all 15 modified TSX files match the pre-change element tags, classes, inline styles, placeholders and size attributes, including icon tags |

Lint warnings already present before these changes: two unused-expression warnings and one missing-effect-dependency warning in `app/dashboard/client-trackers/[id]/page.tsx`, and an existing `<img>` recommendation in `app/dashboard/clients/[clientId]/ClientProfilePremiumSections.tsx`. They do not fail lint or build.

An initial build compiled but failed while locating generated route files. The generated `.next` directory was moved outside the project, and the clean build and subsequent final-source build both passed. Chromium checks initially could not launch within the sandbox; their approved runs passed. No application changes remain pending from a failed check.

The audit covers all discovered search paths. Browser interaction tests concentrate on modified production components and the relevant existing tracker/client workflows; every unchanged selector and Settings/document search was source-audited, not separately exercised end to end. Fixture tests use mocked database collections; the limited live check validates real MongoDB matching without changing records. There was no deployment or production-data migration.

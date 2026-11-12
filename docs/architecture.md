# Application architecture

Next.js App Router owns pages and HTTP endpoints. `app/dashboard/layout.tsx` validates the session on the server, then mounts the client DashboardShell. That persistent shell contains navigation and the browser email coordinator. Most business pages are interactive client components; moving the coordinator into individual pages would break navigation continuity.

## Boundaries and shared services

| Area | Main implementation |
|---|---|
| MongoDB | `lib/mongoose.ts`: globally shared connection/pending attempt, retries after rejection; models retain existing indexes. |
| Client/company/contact data | `lib/server/client-contact-service.ts`, client workspace route, `lib/clientWorkspaceCache.ts` and SWR. |
| Protected client fields | `lib/server/client-credentials.ts`: field visibility and authenticated encryption; stable secret required. |
| Financial year/EPR | FY routes; shared server entry validation/normalization; `financial-year-form`, `financial-year-coverage`, transaction/domain utilities. |
| Annual Returns | `lib/server/annual-return-status-service.ts` and `lib/annualReturnStatus.ts`; mutations synchronize nonterminal workflow status. |
| Billing/reporting | `billing-utils`, `billing-report`, `server/billing-read`, reporting/Studio/billing services. Read [financial rules](billing-reporting.md). |
| Quotations | Quotation/Revision/Counter models, `quotationRules`/workflow, quotation API routes, HTML template and Chromium PDF. |
| Documents | Drive service, upload/preview/migrate endpoints, immutable tracker attachment snapshots and bounded downloads. |
| Email | Dashboard provider/browser coordinator; server controller/worker; persisted campaigns, approvals, logs and security settings. |
| Exports | Existing Excel writers/routes plus `server/excel-report-style.ts`; distinct report formats are intentional. |

`Client.clientId` is a business identifier. Mongo `_id` is not an interchangeable replacement. Contact compatibility uses legacy Contact plus Person and ClientContact; selected phones/emails are company-specific. FinancialYear joins by client/FY; typed category/credit entries coexist with historical flat fields. Billing holds Annual Return/general bills; Payment may explicitly link a bill or use constrained legacy rules. Sale/purchase `Invoice` documents describe coverage, not billing invoices. Quotations preserve revisions and controlled transitions. Report category annotations do not rewrite bills.

## State and data loading

Session, theme and financial-year preference use React contexts. Client workspace uses scoped SWR keys/preloading. General `cache`/`useCache` provides five-minute freshness, shared pending requests, invalidation and account resets. Tracker fresh-data hooks use cancellation/generations and preserve drafts against stale responses. Search hooks debounce and paginate using existing server semantics. Report Studio has a separate one-minute, 12-entry configuration cache.

These caches have different freshness/error contracts. Do not unify them mechanically, globally cache authorization, or cache protected API responses aggressively. Report-cache account/mutation invalidation and workspace repeated session checks require further isolated investigation; no security/freshness semantics were changed during optimization.

## Rendering, files and work execution

Root styles preserve their existing cascade. OCR/OpenCV and report charts already load lazily; the large optional OCR chunk is not initial route JavaScript. Currency display reuses one lazy Intl formatter with unchanged locale/precision. Authenticated target previews remain direct, unoptimized requests to the original preview endpoint, with the original lazy loading and crop geometry.

Email delivery uses persisted immutable approval/campaign snapshots, a mounted browser coordinator, short serial server batches, leases, ownership checks and explicit resume. Reads never send. Sent/uncertain outcomes cannot be reset to pending for convenience. There is no production scheduler/Inngest integration. Detailed operations are in [browser delivery](email-browser-delivery.md); its dated measurements/default descriptions must be checked against current code and environment examples.

Email template HTML is inlined by `scripts/inline-templates.cjs`; its check mode compares exact runtime string content with normalized source HTML. Quotation HTML remains a separate runtime-read template. Preserve Chromium tracing in Next configuration for deployment.

Development and production build output are separate. `next.config.mjs` retains UUID compatibility, browser fallbacks, two data/page workers and a Webpack build worker. npm and its lockfile remain the installation contract. Billing indexes and legacy backfill are provisioned separately from web traffic. [Billing schema maintenance](billing-schema-maintenance.md)

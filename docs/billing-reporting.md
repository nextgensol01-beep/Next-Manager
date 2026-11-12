# Billing reporting

Report Studio’s **Money outstanding** template opens the configurable Studio summary. In **Preview**, switch to **Billing views** for the Company-wise, Bill-wise and Component-wise tabs and their dedicated workbooks. Set the financial year in the builder’s **Filters** step. See the [Reports builder data contract](report-builder.md) for the distinction between bill balances and the payment register.

## Inclusion and amounts

Financial reports use live `Billing` records. General-only companies, bills without FinancialYear/AnnualReturn records, and bills without targets are included. Missing client master records receive a client-ID fallback. No change was made to the separate sale/purchase document-coverage `Invoice` model.

Billing IDs are the unique financial identity. Company rows group by clientId, never company name. Invoice numbers are optional metadata, and multiple accepted quotations may already have been merged into one Annual Return bill by the existing billing workflow.

Payments are allocated once by billingId, with client/FY validation. Legacy unlinked non-advance payments use the existing Annual Return fallback only when exactly one candidate exists. Broken/ambiguous links are flagged for review; they do not reduce any bill’s outstanding. Applied advances settle bills once; unapplied client advance balances remain separate across financial years. Company outstanding sums per-bill outstanding, so an overpaid bill cannot hide another unpaid bill.

All financial aggregation uses integer paise. Components use stored gross amounts. A targetBreakdown explains targetCharges; the two are never added together. Unknown historical tax detail is displayed as unavailable, not zero. Unexpected component/invoice amount differences produce warnings rather than changes to records.

## Categories and historical data

Categories are Annual Return, General Billing / Consultancy, EPR Targets, Registration / Migration, Other and Unclassified. All Billing/All categories is a filter, not a stored category.

Explicit targetCharges default to EPR Targets. Other historical components stay Unclassified unless reviewed. Neither bill titles, bill type, descriptions nor target availability are used to guess service categories.

Use **Review unclassified charges** or the category dropdown in a component row/bill drilldown. A category change writes a small report annotation to `billingreportcategories`, including actor and timestamp. It does **not** edit Billing line items, financial amounts, invoice metadata, or Payment records. This separate annotation store is intentional to satisfy historical-record preservation. It is created only on an explicit category save; report reads do not run migrations or backfill records.

Line annotations use a content fingerprint and position, so an edit to a source component cannot silently transfer a category to a different line. A stale component save is rejected. Existing historical bills require no migration.

Category-filtered Company/Bill views display selected charge gross. Whole-bill payment/outstanding totals are explicitly labeled as context; no component allocation is invented. Excel includes both full bill gross and selected category gross as separately labeled columns. Component exports have no component-paid or component-outstanding column.

## Filters, reconciliation and exports

FY, search/company/bill ID/invoice number, bill type, category, payment status, invoice-created state, invoice/bill date range, and include-undated are supported. A date range selects bills; allocated payments are **to date**, not cash received only during that date range. No creation-date or quotation-date fallback is used in Billing views.

Invoice-not-created bills remain included by default. Billing has no draft/cancel/void lifecycle; quotation and document-coverage statuses do not become financial exclusions. Deleted bills are absent from the live collection, and surviving payment links are exceptions.

Summaries use all matching records before pagination. Company drilldown shows all matching underlying bills; a bill opens its complete charge components and a link to Billing & Payments. Export uses the same validated filters and service with pagination disabled. It includes reconciliation/filter metadata and payment review exceptions.

Legacy Custom Studio billing inclusion, allocated-payment totals and outstanding now share the same pure allocation helper. Annual Return billing presence is kept separate from any-billing presence so general bills do not satisfy Annual Return readiness prerequisites. The relationship drawer shows all bills and correct allocated totals. Quick Payment Summary Excel and custom-export billing paid/outstanding calculations use the shared allocation helper too. Custom client exports retain their existing payment-date range semantics; they are not historical as-of cash ledgers.

## Verification, 2 November 2026

Read-only evidence is in [reconciliation.json](C:/Users/User/Desktop/CodeX/align/outputs/billing-report-verification/reconciliation.json). It contains exact observation times, baseline differences, original/current cohort results, and the payment exception. Raw credentials and email content are not included.

| Scope | Bills | Companies | Gross in every view and export |
|---|---:|---:|---:|
| Original reviewed cohort | 113 | 99 | ₹70,15,912 |
| Four bills created after that snapshot | 4 | — | ₹5,32,462 |
| Current FY 2025–26 snapshot | 117 | 101 | ₹75,48,374 |

The newer bills belong to IMP-090 (₹1,40,160), BRD-013 (₹1,62,816), BRD-014 (₹2,13,580) and IMP-081 (₹15,906). No original bill had an update timestamp after the baseline. Separating the original cohort reproduces the approved 113-bill total exactly; the current unfiltered report correctly includes the additional bills.

In the current snapshot, allocated payments are ₹18,09,679.40, outstanding is ₹57,38,694.60, and unapplied advances for billed companies are ₹1,40,160. All three views and their Excel exports agree. All component gross amounts reconcile; no discrepancy was adjusted away. Billing/Payment document fingerprints were identical before and after reconciliation.

### Payment requiring review

- Client: **IMP-001 / Abn Global Exim**.
- Payment: `6a844299c16e353b0c2b54cf`, ₹1,00,000, dated 18 August 2026, source `advance_application`.
- Missing bill: `6a844283c16e353b0c2b54b2`.
- No matching live bill, surviving recycle-bin snapshot or directly linked activity was found. The evidence does not establish why the bill is absent.
- It remains unchanged, separately flagged, and excluded from bill settlements. Do not delete/reassign it automatically: it represents an advance application and the consumed advance history must be understood before any repair.

### Commands and coverage

- `npm run verify:billing-report`: production calculations/services, current Studio, HTTP export, quick/custom exports, optional EPR context, multi-bill companies, explicit/legacy allocations, advances, broken links, partial/full/overpayments, categories, tax detail, date filters, pagination, source immutability, annotation validation and request-origin protection.
- `npm run verify:billing-report-ui`: actual React report with isolated HTTP data; company/bill/component views, all-bill drilldown, category review/filtering, filtered export and 390px responsive layout. Preview PNGs are in `outputs/billing-report-ui`.
- `npm run reconcile:billing-report`: native read-only database access; production services through read-only adapters, current/original cohort totals and all exported workbooks. Reports source changes explicitly. It never loads write routes or invokes schema backfills.
- Existing report metric, export security, custom-field and interaction tests; quotation additional-item and financial-year tests are retained.

No new dependencies or schema migration were added. No production billing/payment records were modified or reassigned. No deployment was performed. Payment/advance concurrency hardening and historical cash-flow reconstruction remain separately scoped work.

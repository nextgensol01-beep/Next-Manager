# Working on Nextgen Solutions

- Preserve existing features, business calculations, visual design, loading states, animation timing, breakpoints and mobile menu behavior. This is an internal ERP, not a redesign project.
- Inspect Git status first; use small commits and preserve unrelated work. Keep real environment files, browser profiles, caches, exports and business data out of commits/evidence archives.
- `app/api` owns HTTP contracts; `lib/server` owns shared reads, validation, exports, delivery and security. Never replace public auth checks with a global session cache.
- Clients/contacts: `lib/server/client-contact-service.ts`, workspace route/SWR cache, and `client-credentials.ts`. Business client IDs differ from Mongo ObjectIds. Preserve encrypted-field access and stable keys.
- Billing: `lib/billing-report.ts` owns integer-paise reporting; `billing-utils.ts` owns schema/denormalized totals; `lib/server/billing-read.ts` owns write-response aggregation. Their historical allocation rules differ; do not merge them mechanically.
- FY: normalization/validation in `lib/server/financial-year-entry-validation.ts`; forms/provenance/coverage in `lib/financial-year-*`. Preserve typed/legacy values, missing data, recorded usage and merge/replace behavior.
- Reports/Excel: reuse report services and `lib/server/excel-report-style.ts`. Preserve columns, ordering, styles and whole-result totals before pagination. Billing invoices and sale/purchase `Invoice` coverage are different concepts.
- Auth: `lib/auth.ts`, `mongooseAuthAdapter.ts`, `authUsers.ts`, `lib/server/account-security*`. Preserve Google approval/subject binding, database-session revocation, optional 2FA, OTP, recovery and notifications.
- OTP email: Use `renderVerificationEmail` in `lib/email-verification-template.ts` for every new emailed verification code. Add purpose-specific copy there and reuse the shared HTML and plain-text layout.
- Email: dashboard coordinator and server controller/worker use approved immutable snapshots and leases. Reads never send/resume. Never retry uncertain Gmail outcomes automatically or bypass OTP/PIN/hold confirmation.
- PDF: quotation HTML/template plus `/api/quotation/pdf` and Chromium. Email HTML source is under `templates/`; use `templates:build` and `templates:check` after changes.
- Search existing callers/utilities first. Similar formatters, modals, mail paths and FY/billing rules may intentionally differ. No blanket memoization, CSS rewrites or upgrades based only on source size.
- Before deletion, verify static/dynamic/runtime/tool/deployment references and framework conventions. Retain uncertain files, migrations, historical fixtures and business evidence. Update `docs/cleanup-manifest.md`.
- `npm test` runs isolated core suites. `npm run test:browser` uses local Chrome, synthetic HTTP fixtures and disposable OS profiles; no live storage or mail. Other checks are in `docs/development.md`.
- Required checks: `typecheck`, `lint`, `test`, relevant browser/export suites, and `build`. Lint fails on warnings; do not suppress checks or add `any` to pass. Verify production isolation after building.
- Maintenance/migration routes, real delivery and financial repair are not routine tests. Security-policy changes, destructive migrations, major upgrades, uncertain removals, business-calculation changes and visible changes need explicit authorization.
- Update README/essential docs to match final behavior. Dated reports are historical observations, not current guarantees. Use comparable measurements and distinguish fixtures from live production coverage.

# Development and safe verification

Use the npm lockfile and the validation runtime in README. Inspect Git status before editing and make small recoverable commits. Never overwrite an existing environment file or rotate persisted-data encryption secrets as a cleanup step.

## Required checks

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run test:browser
npm run templates:check
npm run build
npm run verify:email-production-isolation -- --built
```

`npm test` runs 37 isolated suites, including connector retry, maintenance and billing boundaries, concurrent Annual Return reconciliation, account security, financial/report calculations, XLSX exports and reloads, FY/target validation, search, trackers, workflow rules, SMTP MIME and email safety/memory/restart. Each runs in its own Node process; no live MongoDB/Gmail/Drive is used. `npm run test:browser` runs eight selected suites against synthetic HTTP fixtures and local Chrome, including actual quotation PDF generation. Additional `verify:*` commands cover scenarios, rich-text/workflow controls, responsive special cases and email templates; choose those relevant to a change.

Browser sessions use Puppeteer's disposable OS temporary profiles. Keep captures/results under ignored outputs, but never include browser profiles/cookies/cache databases in evidence archives. Preserve required baseline screenshots, financial reconciliation workbooks and historical fixtures before refreshing test outputs. Old task-owned browser data can be removed only after confirming its ownership and that no browser process uses it.

`verify:search-live-readonly` and `reconcile:billing-report` explicitly read the configured database. Review their source/scope before running; reconciliation exports sensitive business evidence locally and requires its historical baseline file. They are excluded from default tests. Migration routes, client-ID resync, real email/draft/upload actions and financial repairs are operational tools, not test commands.

## Preservation and regression review

- Compare requests, responses/status/errors, financial-year associations, legacy allocations, integer-paise totals, advances, overpayments, report filters/pagination and exported columns/styles.
- Keep drafts, request generations, in-flight cancellation and optimistic updates intact. Do not reorder writes or parallelize email sends to obtain better timings.
- Compare desktop/phone screenshots and focus, hover, modal closure, scrolling, reduced motion and animation timing. The tracker native three-dot menu currently stays open after an outside tap or Escape, and stays open behind/after its Edit modal. Preserve that behavior unless a product change is explicitly requested.
- Use existing domain helpers rather than generic abstraction layers. `billing-read`, FY entry validation, saved/template serializers and Excel styles are shared. SMTP/Gmail, Billing/Invoice, typed/legacy FY and modal/glass variants are not interchangeable.
- Record file deletions with references/convention checks in [cleanup manifest](cleanup-manifest.md). Keep uncertain files, migration history, public assets and business evidence.

## Templates

Edit email source HTML, then run `npm run templates:build` and `npm run templates:check`. The generator preserves exact string bytes after CRLF-to-LF normalization; compare MIME/signature output as well as appearance. Quotation HTML is read separately from `templates/quotation.html`; test `verify:quotation-additional-items` and `verify:quotation-pdf` after relevant changes.

## Dependency maintenance

Update supported compatible groups, preserve npm/lockfile, and run their relevant auth/mail/financial/export/browser/build checks. Never run `npm audit fix --force`. Registry package counts are not exploit counts. Track development/build-only exposure separately from production paths and inspect actual callers.

The npm `allowScripts` entries permit the pinned `unrs-resolver` native-binding check for ESLint and skip the Tesseract sponsorship message. Review the resolver's install script again when its locked version changes.

The current scoped `next -> postcss` override uses the app's patched PostCSS 8 version to replace Next 15's vulnerable exact 8.4.31 pin. Retest CSS/build output when updating Next or removing that override. The existing UUID override is a compatibility package, not a dead direct import; audit its transitive consumers before changing it. MongoDB is explicitly pinned to the same 6.20.0 driver used by Mongoose to avoid duplicate nominal types. The `nodemailer8` alias now resolves to Nodemailer 10 with bundled types. Keep the alias separate from NextAuth's optional `nodemailer` peer.

## Performance and documentation

Measure actual request/render work with comparable data, cache policy, runtime, viewport and instrument settings. The build sampler supports `node scripts/measure-build-memory.cjs <unique-label> 4096 --warm-cache`; never overwrite old evidence. Separate React render CPU, debounce/network time, total lazy chunks and actual initial transfers. Do not claim field Web Vitals or authenticated production latency from isolated components.

No new indexes were justified by the small read-only query samples. Repeated workspace session/contact work, report-cache invalidation and route CSS splitting remain candidates for further controlled investigation; do not change their semantics speculatively. Current guides are README, architecture, authentication, this development guide, billing/reporting and the specialized document/delivery guides. Dated reports are historical evidence; use the code/current commands for defaults and runtime behavior.

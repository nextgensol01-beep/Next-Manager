# Client Profile financial-year editor

Client Profile FY Data and Credit Data actions open a local modal. The profile URL, current workspace tab and unrelated section data remain in place. Target Screenshot cards also use this local entry point. The dedicated Financial Year page and its existing deep links use the same editor.

## Shared structure

- `components/financial-year/FinancialYearModal.tsx` owns the dialog, guarded closure and embedded screenshot stages.
- `FinancialYearForm.tsx`, `FinancialYearTargetRows.tsx` and `FinancialYearSummary.tsx` provide context, the eight category/type combinations and transaction-based balances.
- `useFinancialYearForm.ts` handles fresh reads, draft validation, create/edit identity, conflicts and saves. `lib/financial-year-form.ts` supplies reusable draft, legacy migration, merge and quantity helpers.
- The existing `TargetScreenshotImporter.tsx` runs inside the same dialog. Its Tesseract/OpenCV adapter and CPCB parser are retained. All eight values require manual review; imports never save automatically. With existing positive quantities, the user explicitly chooses Merge or Replace.

## Save and refresh

One scoped, uncached FY read determines whether the client/year already exists; the dialog shell opens before it finishes. Profile client/year controls are fixed. PIBO targets and PWP generation retain their original arrays and canonical category fields.

New saves use create-only POST backed by the existing unique client/year index. Existing saves use PUT with the record ID, business client ID, year and expected update timestamp. Conflicting writes return 409, preserve the draft and require an explicit reload. Legacy API callers retain the original upsert/update behavior. No database schema or transaction changes are introduced.

After saving, a focused FY GET refreshes achieved/sold quantities from the existing credit ledger. The profile merges that record into its local FY state and its session-scoped workspace cache without revalidating other sections. Existing financial/compliance views derive their totals from that state; relevant FY/dashboard/activity caches are invalidated. If the follow-up read fails, the saved base totals and balances are recalculated using the last verified ledger usage, with a visible refresh-failure notification.

## Verification

- `npm run verify:financial-year`: production route handlers with isolated model/ledger fixtures; decimals, category/type pairs, legacy migration, stable identity, canonical fields, signed balances, clearing quantities, authentication, revision/create races and preservation of ledger data.
- `npm run verify:financial-year-ui`: real Client Profile and FY pages, shared editor and screenshot parser/review UI in local Chrome with isolated HTTP data. Checks immediate opening/unchanged URL, PIBO/PWP creation and editing, validation, import correction/cancellation/merge/replace, conflict reload, failure/retry, targeted profile refresh, focus, all closure routes, long-form scroll, light/dark desktop/laptop/mobile layouts and reduced motion. Screenshot artifacts and the success report are written to `tmp/financial-year-tests/`.
- TypeScript, targeted lint and the production build are also checked.

The browser checks use a deterministic OCR adapter so they can test incomplete and mismatched extraction reliably. Live Tesseract recognition accuracy and a real database session are not exercised by these fixtures. The production OCR engine remains unchanged and quantities always require human verification.

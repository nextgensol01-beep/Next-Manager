# Advanced scenario builder — 26 October 2026

## Reused behavior and audit findings

The implementation extends the existing Messages workspace, condition composer, seven-step editor, scenario cards, rich-text editor, priority controls, synthetic preview, functional draft helpers and Add/Delete/Undo interactions. The authoritative `renderTrackerEmail`/`selectEmailContent` pipeline and shared client context supply all matching results. No second condition engine was added.

The audit found that synthetic cases did not identify actual tracker clients; scenario names were unavailable; new condition rows silently chose the first column; composer array updates could capture older rows; validation did not locate a scenario; and the synthetic preview always displayed a First-match priority note. Its result label could also misdescribe Combine-mode exclusion. These are addressed. The earlier hydrated-Mongoose save fix remains covered by the actual save-route regression.

## Real-client testing and counts

Messages now offers **Test against tracker clients** alongside **Preview rule combinations**. It sends the current unsaved workflow to an authenticated administrator-only, read-only POST operation. It does not save the draft, synchronize membership, download attachments, create campaigns or Gmail drafts, write history, reserve capacity or send messages.

The operation reads current `ClientTrackerEntry` membership with `inScope != false`, independently of table pagination and table filters. It loads only the needed client identity/category/state fields, resolves existing financial-year-specific linked and computed values, and reads latest communication metadata only when used by the draft. Context is keyed by exact Client ID. Missing client context is explicitly reported.

Each evaluated client has matched, selected and bypassed IDs, Send/Exclude metadata, a final rule decision and a plain-language reason. Per-rule counts are computed from those same client results. The summary reports evaluated/total audience, matched, no rule match, overlapping, excluded, Send decisions, unresolved data and workflow-send-rule failures. Match/overlap/data-issue measures can overlap; they are not disjoint recipient totals. A Send decision does not establish email eligibility. Missing variables are reported independently, while recipient validity, history, attachments and the remaining preparation checks remain in Email Clients.

The inspector supports company/Client ID/category search, decision filters, per-rule filtering, 25-row client pages and on-demand client details. Detail shows the selected names, additional matches, bypassed names, exclusion reason, subject and sandboxed formatted message preview. It uses the same draft and renderer as preparation. Details read current values again and identify that fact.

## Priority, overlap and compatibility

- Overlap means a client matches multiple combination scenarios. Counts are derived from `selection.matchedScenarioIds`, with per-scenario overlap counts and inspectable clients.
- First-match, including an omitted legacy mode, selects the highest-priority match. Later matching Send and Exclude scenarios are bypassed. The inspector identifies the winner and explains the priority effect.
- Combine selects all matching scenarios. Any selected Exclude scenario blocks sending; the inspector identifies that exclusion explicitly.
- Reordering remains a functional local-draft operation with stable IDs, normalized priorities and preserved content. It does not automatically change conditions or matching mode. Moving a card keeps it visible and invalidates prior analysis.
- Existing Statements and Points continue combining their matching content. No new First-match default is assigned to historical workflows. Existing unnamed workflows and ALL/ANY serialization remain valid.
- The synthetic preview retains its 32-case safeguard, labels partial generated-case analysis and describes the active matching mode. Generated logical cases remain separate from real-client counts.

## Authoring, validation and interaction

Scenario names are optional metadata, limited to 100 characters in the editor and sanitizer. They persist without changing IDs, matching, priority or HTML; names appear in card headings, deletion confirmation, previews and Email Clients selection/summary metadata. Full Undo snapshots already retain this new metadata.

New scenario conditions and added condition rows prompt **Choose field**. Built-in attributes and actual configured tracker columns retain stable identifiers. Field changes preserve a comparison only if the existing typed validator accepts it for the new field; otherwise the value is cleared. Operators and value controls follow the selected field. Empty/non-empty operators discard hidden comparison values. Other rows are retained.

Scenario feedback distinguishes Incomplete, Invalid, Valid, zero current matches and overlaps without adding a badge-heavy interface. Errors identify the scenario and condition. Save or Test validation expands/reveals the affected card and focuses its invalid control where available. A retained inactive-style rule can be inspected without changing the active sending style, with an explicit return action. Valid rules with zero clients remain saveable. The existing validation policy, explicit Save/Cancel and unsaved-change protection remain in place.

Collapsed cards retain the number/name, effective priority, action, concise conditions, content excerpt and relevant issue/count. Add, anchored deletion confirmation and local Undo retain their existing animations, stable identities and complete snapshots. Adding conditions reveals their rows; reordering reveals the moved card. Scrolling is confined to the modal. Rich-text editors stay mounted, and memoized message-editor boundaries avoid rerendering unrelated editors when a condition or name changes.

The seven-step navigation, floating Previous/Next controls, modal layout and animation definitions are unchanged. New controls use the established modal buttons and Liquid Glass dropdown. Added styles are scoped to the scenario fields and client-test inspector, with mobile stacking, light/dark colors and existing reduced-motion behavior.

## Draft correctness and performance

Analysis is bound to a fingerprint of the exact workflow and tracker fields. Any edit, rename, priority/action/mode change or template change marks prior results outdated. Requests are aborted on draft changes/closure; responses are accepted only for their captured current fingerprint and active request. Preview responses never update the workflow. There is no client fetch on every keystroke.

Analysis evaluates up to 2,000 entries in batches of 250, with a 45-second inter-batch budget and a 60-second route duration configuration. Results distinguish complete and partial coverage and retain the total membership count. Full message HTML is returned only for one requested client, rather than for the entire audience. No new dependencies, paid services, production worker or duplicate project checkout were introduced.

## Exact files changed

| File | Purpose |
| --- | --- |
| `app/api/client-trackers/[id]/email/scenario-preview/route.ts` | New authenticated, read-only unsaved-draft analysis and detail route. |
| `lib/tracker-scenario-analysis.ts` | New presentation/count adapter over authoritative renderer selection. |
| `components/client-trackers/WorkflowTrackerClientPreview.tsx` | New paginated client inspector, detail preview and request/freshness handling. |
| `app/dashboard/client-trackers/[id]/page.tsx` | Integrates draft testing, validation navigation, inactive-rule inspection and functional group updates. |
| `components/client-trackers/WorkflowMessagesWorkspace.tsx` | Names, compact summaries, validation, coverage links, memoized editors and move/reveal wiring. |
| `components/client-trackers/WorkflowSendRuleComposer.tsx` | Field-first additions, functional row updates, typed field changes, invalid controls and row reveal. |
| `components/client-trackers/useWorkflowMessageInteractions.ts` | Explicit validation/reorder reveal, invalid-control focus and named confirmation labels. |
| `components/client-trackers/WorkflowCombinationPreview.tsx` | Mode/exclusion explanations, names and explicit partial-analysis wording. |
| `lib/clientTrackers.ts` | Optional content-rule name metadata. |
| `lib/server/tracker-email-workflows.ts` | Sanitizes and retains optional names. |
| `lib/tracker-email-draft-rules.ts` | Functional rule-patch support and draft change types. |
| `lib/tracker-email-condition-draft.ts` | New typed comparison-preservation helper using the existing validator. |
| `lib/tracker-email-validation.ts` | Scenario-specific incomplete/invalid details and location metadata. |
| `lib/tracker-email-renderer.ts` | Adds optional names to selection metadata only; content and selection semantics unchanged. |
| `app/api/client-trackers/[id]/email/route.ts` | Adds optional names to preparation summary metadata only. |
| `app/client-profile-premium.css` | Scoped authoring and client-inspector styling. |
| `package.json` | Adds `verify:scenario-analysis`; no dependency changes. |
| `scripts/verify-scenario-analysis.cjs` | New actual-route, scope/count/selection/validation/performance and read-only checks. |
| `scripts/verify-scenario-interactions.cjs` | Extends actual-component browser coverage and screenshots. |
| `scripts/fixtures/scenario-interactions.tsx` | Unsaved-draft analysis, name and validation browser fixture. |
| `scripts/fixtures/email-context.tsx` | Supports the functional rule-patch contract. |
| `scripts/fixtures/workflow-editor.tsx` | Supports the functional rule-patch contract. |
| `scripts/fixtures/workflow-validation-baseline.json` | Updates three scenario error messages to their new actionable wording; valid/invalid outcomes unchanged. |
| `docs/ADVANCED_SCENARIO_BUILDER_2026-10-26.md` | This report. |

Generated evidence remains under `.artifacts/`; it is not application source.

## Verification and delivery safety

- `verify-scenario-analysis.cjs`: actual read-only route with 222 clients, including beyond the first 100; exact per-rule counts; 2,000-entry and inter-batch time guards; all four categories; ALL/ANY; first/combine/exclusion; changed priority; named save and full Undo; typed field changes; invalid/deleted/renamed fields; zero matches; linked/computed/status values; draft detail rendering parity; unauthorized, non-admin, archived and out-of-scope requests. No writable models, contacts, Gmail or attachment transports are supplied by its isolated fixtures.
- `verify-scenario-interactions.cjs`: actual modal/workspace/editor browser coverage for first/second/third and rapid adds, focus/modal-only reveal, first/middle/last/empty deletion, Keep/Escape, exact Undo, limit handling, selection/history-bearing editor instance retention, rename/reorder/save/reopen, discard, 222-client fixture pagination/detail, unsaved changes, no refetch per keystroke, obsolete-response rejection, invalid-scenario focus, blank field choice and rapid condition additions. Light desktop, dark mobile and reduced motion checked; screenshots inspected. Final artifact path and build outcome are recorded below.
- `verify-email-context-ui.cjs`, `verify-rule-combinations.cjs`, `verify-workflow-editor.cjs` and `verify-workflow-review.cjs`: existing browser regressions passed. Review's 23 validation cases preserve the original valid/invalid outcomes; only the three expected rule error messages changed.
- `verify-workflow-save.cjs`, `verify-workflow-messages.cjs`, `verify-workflow-style-navigation.cjs` and `verify-scenario-drafts.cjs`: actual hydrated save, legacy save/load modes, priority/content retention, seven-step animations, limits and complete Undo regressions passed.
- `verify-email-context.cjs`: 34 typed-condition cases, category/Client ID isolation, safe variables, historical matching modes, actual preparation parity and frozen approved-worker content passed.
- `verify-email-delivery-security.cjs`: authorization, approval binding, replay/concurrency, uncertain outcomes, limits and safe resume passed.
- TypeScript checks and production build verification are recorded below. Production isolation checks passed before the final build.

SHA-256 comparisons confirm that the condition evaluator, delivery worker, authorization/security and approval services, seven-step navigation component and rich-text editor source remain unchanged. Preparation's only source change is optional name display in its summary. Gmail OAuth, OTP/PIN, Hold-to-Send, attachment selection, recipient/content approval, limits, idempotency and resume logic were not modified. Tests did not send real emails, create real drafts or access a production database.

## Remaining limits

Preview is a point-in-time rule/rendering test, not proof that every Send decision is eligible for delivery. Final preparation still performs all existing checks. Client detail reads values again, so it can differ from earlier counts if source records changed; the UI states this and supports retesting. Reads are not a transactionally frozen database snapshot.

Audiences over 2,000 clients or runs exceeding the inter-batch budget return explicitly partial results; they do not silently claim full coverage. Long-running individual database/link reads remain subject to the deployment's route execution limits. Synthetic cases cover generated authored values, not every value in an unbounded numeric/text/date domain.

Undo retains the existing unsaved Messages-workspace scope and 40-removal limit. Leaving that workspace, saving, closing or discarding clears its history. No real-account save or real delivery was performed during verification.

## Final verification evidence

- Final browser suite passed: `.artifacts/scenario-interactions/ui-1793013053073/results.json`. Captures include `tracker-clients-light-desktop.png`, `tracker-clients-dark-mobile.png`, `advanced-scenario-dark-mobile.png` and Add/Delete confirmation views.
- Final context/synthetic browser checks passed: `.artifacts/email-context/checks-1793012675685/results.json`. Editor/review checks passed in `.artifacts/email-context/checks-1793012345452/results.json`; that earlier run's context-fixture failure was corrected by adopting the functional-patch contract and then passed in the final context run.
- `npx tsc --noEmit --incremental false` passed. The final full production build passed with `NODE_OPTIONS=--max-old-space-size=2048`, including types, 88 static pages and traces. It reports the same three unrelated existing lint warnings: an unused expression and effect dependency in other tracker-page sections, plus the client-profile image-element warning.
- `node scripts/verify-email-production-isolation.cjs --built` passed against the final production routes and traces.

# Scenario interaction polish — 26 October 2026

## Result

Add creates a stable unique ID, expands the new card, focuses its heading, reveals it inside the existing modal scroll container, and announces its number. A temporary restrained highlight respects reduced motion. Layout effects, ResizeObserver, animation completion and animation frames coordinate reveal; no fixed mounting/layout timers were added. Existing cards and rich-text editor instances stay mounted, preserving their content, selection and expansion state.

Remove opens a compact anchored confirmation for the exact scenario, with Keep/Remove controls, safe initial focus, Escape cancellation and explicit draft-only wording. The confirmation does not change list height. A changed or unavailable target cancels confirmation. Successful removal focuses the next scenario, or the previous one when removing the last, and compensates scroll as the existing exit animation finishes.

Undo restores a deep snapshot: ID, HTML, conditions, include/exclude action and original priority. Restoration preserves later edits to other messages and their relative order. Missing/equal legacy priorities retain their original stable order when no intervening reorder occurred. Functional parent updates prevent rapid operations from replacing newer arrays. Client and server share the existing 40-content-rule limit, including inactive message styles. Removing every scenario preserves the existing empty-state and save-validation policy.

## Exact source and verification files changed in this task

| File | Change |
| --- | --- |
| `app/dashboard/client-trackers/[id]/page.tsx` | Functional workflow patches and scenario add/update/remove/reorder/restore wiring; supplies all-style rule count. |
| `components/client-trackers/WorkflowMessagesWorkspace.tsx` | Add feedback, card references, confirmation, Undo notification and limit display; existing card/editor animations retained. |
| `components/client-trackers/useWorkflowMessageInteractions.ts` | New mount/layout-aware focus and modal scrolling, confirmation invalidation, removal snapshots and local Undo coordination. |
| `components/client-trackers/WorkflowMessageRemoval.tsx` | New anchored accessible native popover with Keep/Remove and Escape handling. |
| `lib/tracker-email-draft-rules.ts` | New pure functional draft helpers and complete snapshot restoration. |
| `lib/clientTrackers.ts` | Exports shared `TRACKER_EMAIL_CONTENT_RULE_LIMIT = 40`. |
| `lib/server/tracker-email-workflows.ts` | Uses shared limit instead of a separate literal; validation policy unchanged. |
| `app/client-profile-premium.css` | Scoped highlight, compact confirmation, notification and limit styles. |
| `lib/tracker-email-context.ts` | Corrects an existing TypeScript error: an absent value is passed as an absent map entry instead of an explicitly undefined map value. The existing evaluator reads both as undefined; evaluation results are unchanged. |
| `package.json` | Adds `verify:scenario-drafts` and `verify:scenario-interactions`; no dependency changes. |
| `scripts/verify-scenario-drafts.cjs` | New actual-helper, server-boundary and rendering regression checks. |
| `scripts/fixtures/scenario-interactions.tsx` | New isolated fixture using the actual modal, step content stage, workspace and rich-text editors. |
| `scripts/verify-scenario-interactions.cjs` | New browser interaction suite and screenshots. |
| `docs/SCENARIO_INTERACTIONS_2026-10-26.md` | This implementation and verification report. |

Generated test evidence is under `.artifacts/scenario-interactions/` and `.artifacts/email-context/`. These artifacts are not application code.

## Verification

- `node scripts/verify-scenario-drafts.cjs` — passed rapid add/edit operations, exact first/middle/last and empty-rule restoration, duplicate Undo, stale confirmation protection, intervening edits/reorders, legacy priorities, shared server acceptance at 40/rejection at 41, empty workflows and unchanged render selection.
- `node scripts/verify-scenario-interactions.cjs` — passed first/second/third additions, long-list reveal/focus, rich-text instance and selection retention, burst additions, deep-list deletion without jumping to Add, unchanged webpage scroll, anchored confirmation without list reflow, Keep/Escape, first/middle/last and unsaved-empty deletion, full Undo, target-change cancellation, all-style limits, save/reopen, discard, dark/mobile and reduced-motion checks. No browser page errors or mobile horizontal overflow. Final evidence: `.artifacts/scenario-interactions/ui-1793002055387/results.json`; screenshots in the same directory.
- `node scripts/verify-email-context.cjs` — passed shared-context, typed matching, variable rendering, preparation and approved-snapshot regression checks.
- `node scripts/verify-workflow-messages.cjs` — passed existing save/load, priority and matching-mode checks.
- `node scripts/verify-workflow-style-navigation.cjs` — passed existing navigation and animation checks.
- Existing `verify-workflow-review.cjs` and `verify-workflow-editor.cjs` browser suites — passed using the artifact-output runner. Evidence: `.artifacts/email-context/checks-1793001841023/results.json`.
- `node scripts/verify-email-delivery-security.cjs` — passed approval, identity, secret handling, replay/concurrency, recovery and safe-resume checks with isolated fixtures.
- `node scripts/verify-email-production-isolation.cjs --built` — passed source, manifest/lockfile, TypeScript/Vercel, ignore-isolation and completed production route/trace isolation checks.
- `npx tsc --noEmit --incremental false` — passed.
- Production build with `NODE_OPTIONS=--max-old-space-size=2048` — passed, including type checking, 88 static pages and build traces. It reports three lint warnings outside the edited interaction logic: an unused expression and effect dependency in the tracker page, and an existing image-element warning in client profile sections.

Protected-source SHA-256 comparisons confirm the renderer, condition evaluator, email API route, worker, delivery-security and approval services, seven-step navigation component and rich-text editor are unchanged. The shared-context file has only the absent-value type-safety correction documented above. No real emails were sent and no production database or Gmail account was used by these tests.

## Remaining limits

Undo is local to the mounted Messages workspace and its unsaved draft; leaving that workspace, switching workflow/style, saving, discarding or closing the editor clears its Undo history. It retains up to 40 removals and respects the total 40-message limit when restoring. When the draft is full, removal of another message is required before Undo can restore one.

Save/reopen/discard interaction coverage uses the real components and validation with isolated fixture persistence. Existing serializer, editor and review regressions supplement this; no authenticated live-account save or real delivery was performed.

## Follow-up: valid workflow save rejected

The reported `One or more email workflows are invalid.` error was reproduced in the actual tracker PATCH route using a hydrated document from the real Mongoose tracker schema. The shared condition registry used object spread on tracker field subdocuments. Their public schema properties are accessors, so that copy lost the column key/type, and server validation rejected a workflow already accepted by browser validation.

`lib/tracker-email-context.ts` now projects the public field properties explicitly. Hydrated database fields and plain browser fields produce the same registry without Mongoose internals. Matching operators, evaluation rules, variable rendering, animations and delivery safeguards were not changed.

Added `scripts/verify-workflow-save.cjs` and the `verify:workflow-save` package script. The test reproduced HTTP 400 before the correction and passes HTTP 200 afterward. It exercises actual PATCH handling, hydrated/plain registry parity, save/reopen stability, legacy Points/Statements/Combination workflows, Brand Owner selection and resolved variables, attachment conditions, rejection of removed fields/options and incompatible operators, and authorization. Database writes are isolated fixtures; no production data or email transports are used.

Follow-up checks passed: `verify-workflow-save.cjs`, `verify-email-context.cjs`, `verify-scenario-drafts.cjs`, `verify-workflow-messages.cjs`, `npx tsc --noEmit --incremental false` and the full production build with the existing 2 GB heap limit. The build reports the same three unrelated lint warnings documented above.

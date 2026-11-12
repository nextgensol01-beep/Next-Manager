# Scenario test: contextual disclosures and help

The help polish is limited to Check who matches your email rules. It preserves the current Liquid Glass materials, navigation pill, two-view layout, client inspector, and evaluation behavior.

## Content consolidation

**Underlying counts** is now **Understand these numbers**, local to the expanded scenario. It presents a compact definition list: label and explanation on the left, authoritative count on the right. Matched, Chosen/Excluded, Bypassed, and Overlapping remain available even when zero. Zero values use secondary color and normal weight; the expanded scenario's main summary only adds nonzero bypass/overlap counts.

Extra rows appear when the result warrants them: overall sending conditions not met, selection before final exclusions, and messages stopped by another rule. The definitions distinguish First-match priority, Combine behavior, and independently retained Statement/Point fragments. Combine-specific blocking explanations appear only when relevant. The overlap filter action moved beside its definition instead of repeating a generic overlap paragraph above it.

**How are messages chosen?** and **Detailed counts and test scope** are consolidated into one **How this test works** entry point. Its short sections cover the tested matching mode, actual audience coverage/timestamp, read-only behavior and later email eligibility checks, followed by advanced result measures. Next-step guidance appears before the advanced totals. Unique definitions, original result filters, partial-run limits, table-page scope, and distinctions between rule selection and email eligibility are retained.

The 198-match/0-excluded case remains visible in the expanded Exclude scenario. The actual evaluator first ruled those 198 clients out through the overall sending conditions, so the raw Exclude match did not determine their final decision. No calculation or classification was changed.

## Interaction and material

Both help entry points use actual button triggers with a meaningful icon, a readable 13px semibold title, secondary supporting text, a right-aligned chevron, and a roughly 48–52px target with natural responsive wrapping. The quiet hover/press surfaces use the existing modal-local color, radius, border, and spacing tokens. The expanded reading area remains attached to its trigger without nested floating cards or additional glass blur.

The reusable component is local to this tracker-test modal; it is not an application-wide accordion system. Content remains mounted to retain state. Closing makes it inert and removes it from the accessibility tree immediately, then conceals it after the visual close completes.

Animations are 100ms trigger feedback, 200ms chevron rotation, and 240ms height/200ms opacity reveal. They reverse on close and can be interrupted by another toggle. Reduced-motion preferences use immediate state changes. The existing navigation and client-selection motion are unchanged.

See matching clients and See chosen/excluded clients are surfaced secondary buttons with 12px text, directional icons, visible focus, and compact hover/press feedback. Their existing filters remain distinct: raw matching clients versus clients for whom that message or exclusion actually determined the result. Scenario navigation preserves the current search and an existing selected preview when that client remains in the new result set. Related decision/scenario scope changes and pagination reset are intentional; unrelated workflow/test state remains intact.

## Scroll and focus

Reveal adjustment uses only the existing Overview scroll container. It measures once after opening, scrolls only when needed, and caps the adjustment so the trigger remains in context. It does not write to global page scroll, move the modal shell, or create another user-scrolling region. Scroll padding keeps content clear of the footer. An explicit wheel/keyboard scroll during opening suppresses the automatic adjustment, and inactive/closed ancestor views do not initiate a reveal scroll.

Triggers expose aria-expanded and aria-controls. Their labelled content regions expose the matching accessible relationship. Enter and Space use native button behavior. Escape from within an open help region collapses that region and returns focus to its trigger. Programmatic collapse while a child control has focus also returns focus safely before content becomes inert. No hover-only explanation was introduced.

## Files

Added:

- [ScenarioDisclosure.tsx](C:/Users/User/Desktop/CodeX/align/components/client-trackers/ScenarioDisclosure.tsx) — modal-local disclosure semantics, motion, focus, and local scrolling.
- [WorkflowScenarioTestHelp.tsx](C:/Users/User/Desktop/CodeX/align/components/client-trackers/WorkflowScenarioTestHelp.tsx) — consolidated general help using the tested snapshot.
- [This report](C:/Users/User/Desktop/CodeX/align/docs/SCENARIO_TEST_DISCLOSURES_2026-10-27.md).

Modified:

- [WorkflowScenarioResults.tsx](C:/Users/User/Desktop/CodeX/align/components/client-trackers/WorkflowScenarioResults.tsx) — contextual metric definitions, mode-aware explanations, and outcome actions.
- [WorkflowTrackerClientPreview.tsx](C:/Users/User/Desktop/CodeX/align/components/client-trackers/WorkflowTrackerClientPreview.tsx) — consolidated help and search-preserving scenario navigation.
- [scenario-test-material.css](C:/Users/User/Desktop/CodeX/align/app/scenario-test-material.css) — scoped triggers, attached reading surfaces, count rows, action buttons, and scroll padding.
- [verify-scenario-premium.cjs](C:/Users/User/Desktop/CodeX/align/scripts/verify-scenario-premium.cjs) — focused --help-only checks reusing the existing real-component fixture and evaluation engine.
- [verify-scenario-interactions.cjs](C:/Users/User/Desktop/CodeX/align/scripts/verify-scenario-interactions.cjs) — assertions updated for the consolidated button disclosure.

No dependency, package/lockfile, AGENTS.md, .gitignore, shared modal, API, evaluator, or email-delivery code was changed.

## Verification

Passed:

- TypeScript: `npx tsc --noEmit --incremental false`.
- `node scripts/verify-scenario-premium.cjs --help-only`: actual button/region relationships; Enter/Space/Escape; safe collapse focus; no API calls for help; First-match and Combine definitions; Send/Exclude outcomes; 198 raw matches/0 effective exclusions; bypass/overlap/zero counts; matching-versus-chosen filters; search/selected-preview retention; return from Explore; interrupted toggles; bottom-of-Overview reveal and fixed shell/footer; no background-page scrolling.
- The focused suite exercised 320, 375, 390, 430, 768, 1024, and 1280px in both themes, plus a short 1280×580 viewport. Reduced motion was enabled for 320px. Long help text wrapped without horizontal overflow.
- `node scripts/verify-scenario-interactions.cjs`: existing editor, Add/Delete/Undo, focus/rich text, save/reopen, validation, real-result pagination, priority/Combine exclusion, partial/empty results, and stale-response behavior.
- `node scripts/verify-scenario-clarity.cjs`, `node scripts/verify-scenario-analysis.cjs`, and `node scripts/verify-email-context.cjs`: authoritative counts, scope/authorization, legacy modes, client/category isolation, variable safety, preparation, and approved-worker snapshots.
- SHA-256 checks: all 15 protected files match this task's baseline, including the evaluator/explanation/context/renderer helpers, preview/preparation routes, worker/security helpers, shared modals, navigation/editor, and .gitignore.

The production build passed with the unchanged 2 GB heap limit, including type/lint checks and all 88 generated pages. Three existing unrelated lint warnings remain; none were introduced for the changed components.

Focused evidence: `C:/Users/User/Desktop/CodeX/align/.artifacts/scenario-help/run-1793098406696/`. It contains five useful screenshots (light Exclude numbers, dark general help, dark phone help, short desktop help, and Combine blocking definitions) plus `help-results.json`. Representative screenshots were visually inspected. Editor regression evidence is under `C:/Users/User/Desktop/CodeX/align/.artifacts/scenario-interactions/ui-1793098072942/`.

The checks use synthetic clients with the actual components and existing matching/rendering helpers. Physical touch devices, a screen-reader session, and native browser-menu zoom were not independently exercised. No Gmail drafts, real emails, production client updates, or attachment downloads occurred. Browser profiles and fixture bundles are disposable; only redundant captures generated during this task are cleaned, preserving older project artifacts.

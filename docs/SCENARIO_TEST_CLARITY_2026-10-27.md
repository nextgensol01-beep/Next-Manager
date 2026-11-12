# Scenario-test modal clarity — 27 October 2026

## Result

The existing modal is now titled **Check who matches your email rules**. It explains the current unsaved-draft test, defines a scenario, states that no emails or client-record changes occur, and distinguishes rule selection from final email readiness.

Four clickable primary results replace the unexplained counter row: Clients checked, Selected by send rules, Not selected and Needs review. A generated sentence explains the actual outcome. Selected and Not selected are disjoint; a separately stated unavailable-decision count accounts for missing linked client records. Needs review counts each affected client once and is explicitly already included in Clients checked. It is never added to the total.

Underlying diagnostics remain available under **Understand the detailed results**, with definitions and links to affected clients. **How are messages chosen?** explains the overall send conditions, the actual matching mode and priority. **How each scenario performed** expands individual names, priorities, actions, readable configured conditions and the reasons matches were used, bypassed or stopped.

The existing search, Liquid Glass filter, per-scenario filtering, 25-row pagination and client details remain. Applied filters and Clear filters are explicit. Pagination distinguishes the page range, filtered count and checked total. Clicking a primary result or diagnostic link focuses Client results and scrolls only the modal.

Client details answer Result, Why, Which scenario was used, What happened to the other matches, and Is this email ready to send. A collapsed **Preview selected message** shows the authoritative client-specific subject and sandboxed formatted HTML for Send decisions. Unselected clients do not display an available-but-unselected message as their chosen email. Missing values and an unrenderable body are explained explicitly. Full email preparation remains in Email Clients.

## Exclusion-count investigation

The authoritative final decision checks the workflow’s overall sending conditions before applying a scenario decision. Scenario-condition matches are still recorded independently.

Consequently, an Exclude scenario can correctly have **198 matched, zero final exclusions, and 198 overall send-rule failures**. Those clients met the scenario’s conditions, but had already been ruled out by the overall workflow. Applying an Exclude action did not determine their final result. This is not a backend counting bug, and its semantics were not changed.

The per-scenario explanation now separates:

- Conditions matched.
- Chosen to use a Send message, or actually excluded by this Exclude scenario.
- Ruled out by the overall send conditions.
- Bypassed because an earlier scenario won.
- A selected Send fragment blocked by another rule, such as Combine-mode exclusion.
- Additional overlapping matches, which are a separate review measure.

The regression fixture recreates 226 checked clients, 28 selected, 198 not selected and one overlap. Its Exclude scenario has 198 matches and zero final exclusions. These are generated test values, not measurements from a production tracker.

## Presentation/reliability defects corrected

1. The previous detail view could show raw scenario selection or available rendered HTML even when the overall send rule ruled the client out. Final-decision-aware explanations and preview gating now avoid that implication.
2. A selected Send fragment in Combine mode could be described as used even when a selected Exclude rule stopped sending. The new per-rule used count requires the actual final decision; the original underlying selected count remains available with an explanation.
3. A failed retest left earlier results looking current when the draft fingerprint was unchanged. Previous results are now preserved but marked outdated until a successful retest.
4. Filtered page counts lacked context. They now state the applied filter, the filtered count and the checked total, with a single clear action.
5. Review counts can overlap in their causes. The primary Needs review result is a client-level union, including multiple matches, missing information and a send-rule-qualified client with no scenario; it does not double-count a client with several issues.
6. Retained legacy message fragments must not be described as additional First-match winners. Their explanation explicitly preserves their independence from combination priority.

No condition matching, priority, First/Combine, Send/Exclude, category mapping, variable rendering or server eligibility semantics were changed.

## Freshness, scope and safety

The current read-only endpoint and query scope are reused without modification. No extra data fetch occurs for search, filter changes, pagination or expanding explanations. Only a requested test/retest or client-detail read fetches data.

The client keeps the tested workflow and field metadata with the result, so outdated counts do not acquire the conditions or names from a newer draft. Responses are bound to both the captured draft fingerprint and tracker ID, and obsolete requests are aborted. Failed or partial tests are labeled; previous information is retained where safe. Client detail still identifies that its values were read again and may require a summary retest.

The existing 2,000-client/250-entry-batch safeguards, route authorization and email eligibility checks are unchanged. The modal geometry, header/footer components, Liquid Glass controls, seven-step editor, navigation and animation definitions are preserved. New hierarchy styles are scoped to the test modal, with neutral surfaces, mobile wrapping and native keyboard-accessible disclosure controls. No dependency was added.

## Exact files changed

| File | Change |
| --- | --- |
| `components/client-trackers/WorkflowTrackerClientPreview.tsx` | Plain-language overview, progressive detail, contextual filters, final-decision-aware inspection, refresh errors and snapshot/scope binding. |
| `lib/tracker-scenario-explanations.ts` | New metadata-only totals, filters, per-rule breakdowns and explanation helpers. It does not import or execute a condition evaluator. |
| `app/client-profile-premium.css` | Scoped hierarchy, neutral summary controls, disclosure/detail styling and mobile wrapping. |
| `app/dashboard/client-trackers/[id]/page.tsx` | Passes tracker field labels to the existing test modal. |
| `scripts/fixtures/scenario-interactions.tsx` | Passes the same field metadata in the isolated browser fixture. |
| `scripts/verify-scenario-clarity.cjs` | New authoritative-decision explanation, counting and compatibility regression suite. |
| `scripts/verify-scenario-interactions.cjs` | Extends browser checks for clarity, filtering, keyboard behavior, failed/partial tests and Send/Exclude decisions. |
| `package.json` | Adds `verify:scenario-clarity`; dependencies and lockfile unchanged. |
| `docs/SCENARIO_TEST_CLARITY_2026-10-27.md` | This report. |

## Verification

Passed:

- `node scripts/verify-scenario-clarity.cjs`: primary partition, unresolved outcomes, deduplicated review count, exact exclusion/gate example, all four client categories, First-match priority, two Send matches, general/category overlap, Combine Send/Exclude, bypassed Exclude, blocked Send fragments, no scenarios/shared template, no matches, missing tracker marks, missing client/message data, invalid references, stable renamed IDs, retained legacy fragments, filter agreement, readable ALL/ANY conditions, partial scope and next-step text.
- `node scripts/verify-scenario-analysis.cjs`: actual read-only route authorization, current unsaved draft, full 222-client audience beyond the first table page, scoped detail, linked/computed/status values, exact rendering parity, 2,000-client and inter-batch time limits, and invalid/out-of-scope requests.
- `node scripts/verify-scenario-interactions.cjs`: actual modal/components in a headless browser; four primary results, closed initial diagnostics, summary/review/scenario/decision filters, ordinary text insertion/search without refetching, Clear filters, keyboard focus, client pages, selected-message detail, overall-send-rule failure, First-mode bypass and Combine exclusion, no selected-message iframe for unselected clients, failed retest preserving outdated results, successful recovery, partial/zero-client runs, changed drafts, obsolete response protection, light desktop, dark mobile and reduced motion. Existing Add/Delete/Undo, names, save/reopen, draft limits and editor-state checks also pass.
- `node scripts/verify-email-context.cjs`: 34 typed-condition cases, exact Client ID/category isolation, safe variables, legacy mode behavior, actual preparation and frozen approved-worker message content.
- `node scripts/verify-workflow-save.cjs`: hydrated-database save/reopen, legacy workflows, rendering, invalid conditions and authorization.
- `node scripts/verify-workflow-style-navigation.cjs`: existing seven-step navigation, handoff animation, keyboard, reduced motion and recovery.
- `node scripts/verify-email-delivery-security.cjs`: authorization, exact approval binding, replay/concurrency, recovery, uncertain outcomes, limits and safe resume.
- `npx tsc --noEmit --incremental false` passed. The final production build passed with `NODE_OPTIONS=--max-old-space-size=2048`, including types, 88 static pages and traces. It reports the same three existing unrelated warnings: an unused expression and effect dependency in other tracker-page sections, and the client-profile image-element warning.

Final browser evidence: `.artifacts/scenario-interactions/ui-1793081077605/results.json`, with `first-time-review.json` and inspected light/desktop and dark/mobile screenshots in the same directory. The browser tests use fixture records; no production database, real emails or Gmail drafts were used.

Production route/trace isolation also passed using `node scripts/verify-email-production-isolation.cjs --built`. Source-hash checks confirm that the condition evaluator, delivery worker, approval/security services, navigation and rich-text editor remain unchanged.

## Structured first-time-user acceptance review

This was a simulated structured review using visible UI text, interaction assertions and screenshot inspection. No real-user study is claimed.

| New employee’s question | Answer available in the modal |
| --- | --- |
| What is being tested? | Purpose title, current unsaved workflow explanation and tracker scope. |
| Did it send emails or change records? | Visible “This is only a test” statement explicitly says neither happened. |
| How many clients were checked? | Clients checked and the recorded complete/partial test scope. |
| How many were chosen? | Selected by send rules, with a sentence explaining what that means. |
| How many were not chosen? | Not selected, plus a separately stated unavailable-decision count where needed. |
| Why were they not chosen? | Result filter and client-level overall-rule, no-scenario or Exclude explanation. |
| What do multiple matches mean? | Scenario definition, Needs review guidance and expandable matching explanation. |
| How is the winner chosen? | Current-mode explanation and the selected client’s named priority/bypass evidence. |
| Where can I see the message? | Preview selected message in the selected client’s details. |
| Are the emails ready to send? | Visible initial caveat and explicit “Not yet” in client details. |
| What should I review next? | Needs review links and contextual What should I do next guidance. |
| How do I test changed rules again? | Changed-draft notice and persistent Retest current draft action. |

## Limits retained

This remains a rule/message test, not final recipient, history, attachment, authorization or delivery preparation. Existing missing tracker marks retain their authoritative non-match behavior; the interface does not invent an unavailable-decision classification for them. Unavailable linked client records and missing template data remain distinguishable.

Counts are point-in-time and can be partial. Details read current client values again. Final preparation may therefore differ if the draft or source values change afterward; approval still freezes the separately prepared recipient/message/attachment snapshot. No approval, sending, resume or duplicate-send protections were modified, and this work created or sent no actual email.

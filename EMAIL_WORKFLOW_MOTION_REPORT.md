# Email workflow performance and motion refinement

Implemented in the current `align` project, preserving its existing Email Clients, authorization, Liquid Glass, perimeter hold, and delivery activity design. No archive was unpacked over subsequent project changes.

## A. Confirmed causes

- Authorization used a keyed, exit-first `AnimatePresence` stage inside two layers of layout animation. The next form waited for the old stage to finish before mounting, then changed the parent's geometry again.
- Recipient preparation added a 140ms cosmetic timer and an exit-first workspace replacement after results already existed.
- Client/tab keys destroyed the entire detail subtree, including the memoized recipient editor and personalized iframe, on selection. The iframe therefore lost both its rendered document and its HTML memo on every client change.
- The activity provider rebuilt/sorted job arrays even for unchanged responses, recreated context actions, and subscribed the tracker page to all progress updates. Item fetching depended on every `updatedAt` change, including lease-only updates.
- Dock details used `hidden` immediately while the whole dock performed layout projection. This removed their layout before a coordinated contraction and scaled interior content during geometry changes.
- The hold painting loop selected SVG elements on every frame. Its elapsed-time progress, separate safety timer, single-commit guard, and lack of React state updates on every frame were already correct and were retained.
- Campaign acceptance waited for a cosmetic handoff timer before starting browser coordination. The previous handoff also animated a nested body surface independently.

Potential GPU cost from layered glass, shadows, and large iframe paints remains a runtime concern. No GPU/compositor trace establishes those as the dominant bottleneck. Large backdrop blur strengths were already static; useful glass effects were preserved.

## B. Files changed

Paths below are relative to this project.

| File | Change |
| --- | --- |
| `components/client-trackers/EmailMotionRegion.tsx` | Small shared timing constants and one measured authorization-height region; observes intrinsic content changes rather than measuring every animation frame. |
| `components/client-trackers/EmailDeliveryAuthorizationModal.tsx` | Immediate legitimate stage mounting, one geometry owner, memoized batch summary, coordinated sheet exit, immediate acceptance notification separated from visual cleanup. |
| `components/client-trackers/EmailSecurityControls.tsx` | Cancellable focus after mounting/enabling, focus recovery after a failed verification, meaningful code-sent and PIN-stage status announcements. |
| `components/client-trackers/EmailDeliveryActivityDock.tsx` | Removes whole-dock layout projection and immediate `hidden`; retains details, protects collapsed controls with `inert`, restores focus when appropriate, memoizes rows and reuses unchanged item objects, excludes lease-only changes from detail fetching. |
| `components/client-trackers/EmailDeliveryActivityProvider.tsx` | Stable actions context, memoized state value, unchanged-summary bailout, stable resume callback. Existing delivery coordinator and polling intervals remain intact. |
| `components/client-trackers/EmailDeliveryReviewWorkspace.tsx` | Removes reveal timer/exit wait, retains detail/editor structure across clients, interruptible content motion, memoized HTML survives recipient edits, pauses underlying Send drift during authorization, follows live reduced-motion changes. |
| `components/client-trackers/EmailPreviewFrame.tsx` | At most two in-memory iframe documents during handoff, preserving the loaded iframe until the latest replacement loads; committed request identity rejects stale loads. |
| `components/client-trackers/HoldToSendButton.tsx` | Retained SVG refs instead of frame-loop selectors; retained geometry refs for resize; frame cleanup; immediate visual cancellation when hidden or reduced motion applies; parallax resets when motion preference changes. |
| `components/client-trackers/email-delivery-security.css` | Measured region clipping with room for focus outlines; preserved authorization spacing/material. |
| `components/client-trackers/email-delivery-activity.css` | CSS alone owns width and grid-height expansion/contraction, coordinated content opacity, tabular counters, stable status space, reduced-motion overrides; removes nested body handoff animation. |
| `components/client-trackers/email-delivery-review.css` | Stable preview viewport and hidden pending document, with a local loading label. |
| `app/dashboard/client-trackers/[id]/page.tsx` | Subscribes to stable actions; starts accepted campaign coordination immediately, closes sheets after the visual handoff. |
| `package.json` | Adds `verify:email-motion`; no dependencies added. |
| `scripts/fixtures/email-motion.tsx`, `scripts/verify-email-motion.cjs` | Isolated 300-client regression/profiling fixture with real production components, React Profiler hold observations, and Chrome performance counters. |
| `scripts/fixtures/email-security.tsx` | Follows the separated acceptance/handoff callback contract. |
| `scripts/fixtures/wait-for-stable-control.cjs` | Browser driver waits for a visible stable click target during resizing. |
| `scripts/verify-email-delivery-review.cjs`, `scripts/verify-email-delivery-security-ui.cjs`, `scripts/verify-email-delivery-activity-ui.cjs` | Reuse that click driver; retain existing payload/security assertions. Early typing is tested separately without waiting for stage animation. |

`TrackerModal.tsx`, the shared Modal, workflow navigation, email preparation APIs, HTML/signature rendering helpers, and server delivery/security implementation were inspected and left unchanged.

## C. Transition behavior

| Interaction | Result |
| --- | --- |
| Preview → review | Results replace preparation in one commit, without the cosmetic timer or an outgoing-content wait. The fixed outer review sheet remains stable; coordinated content enters immediately. |
| Client → client | Selection and details update together. A short 8px/opacity transition runs within the retained detail structure and can be interrupted by a newer selection. |
| Send OTP → input | The request starts in the click handler. Existing processing material remains on the action; successful server response mounts the input immediately while the measured region resizes once. |
| OTP → verifying | The same form/input remains mounted and disabled during the request. Errors remain local, clear the code as before, and can return focus to the input. |
| OTP → PIN | Only confirmed server factors advance the stage. A new masked PIN input mounts with clean code state, one resized region, and an email-verified status. |
| Verified → hold | The existing verified state and hold control enter with restrained opacity/upward motion. No sending state appears before a completed hold. |
| Hold → dock | The exact acceptance validation still gates delivery. Browser coordination and compact activity notification start immediately after acceptance; the sheet exits over roughly 360ms and then cleans up. No network request waits for that exit. |
| Dock expand/minimize | A 360ms CSS geometry transition owns width and interior grid height. Content fades in/out within it; details stay mounted to preserve filter and scroll state, while collapsed controls become inert immediately. |

Reduced motion removes spatial/geometry transitions while retaining real hold progress and the exact 1100ms default security duration. Early release cancels the safety timer immediately; the normal visual retreat remains about 200ms.

## D. Rendering evidence

The saved original source and updated components were exercised using the same local 300-client fixture. Development/headless runs on this machine are observations, not a production benchmark or a measured 60fps guarantee.

Reference captures: `tmp/email-motion/before-1792132682415/metrics.json` and `tmp/email-motion/after-1792132725971/metrics.json`. The final handoff check is also captured in `tmp/email-motion/after-1792132829424/metrics.json`.

Final source verification passed in `tmp/email-motion/after-1792133607885/metrics.json`, including the controlled dock midpoint and immediate acceptance checks. The final clean production build also completed successfully with the final application source.

| Observation | Before | After, sequential comparison |
| --- | ---: | ---: |
| Prepare click → review DOM, synchronous result fixture | 555ms | 262.5ms |
| Five client selections observed at the next animation-frame callback | 0/5 | 5/5 |
| Median observed client selection latency | 217.4ms | 57.6ms |
| Detail container survives those selections | No | Yes |
| Chrome task time during those five selections | 835ms | 316ms |
| Chrome layout time during those five selections | 11.9ms | 6.0ms |
| Action-consumer renders for ten identical summaries | 10 | 0 |
| Item-page refetches for a lease-only update | 1 | 0 |
| SVG selectors during a 500ms hold plus release observation | 45 | 0 |
| React hold commits during that press/release observation | 2 | 2 |

The final handoff fixture recorded a 0.4ms acceptance-callback delay and 370ms visual cleanup interval. Later runs vary with machine load. Both old and new docks already showed intermediate visual widths; the improvement replaces scaling/immediate detail removal with one continuous real geometry transition.

A repeat while the production build was running (`tmp/email-motion/after-1792133287582/metrics.json`) recorded 707ms preparation, one 852ms selection sample, and no observed intermediate dock frames. It failed the original frame-sampling assertion, despite passing state, preview, authorization, and cancellation checks. Those results are retained rather than presented as smooth performance. The regression now separately samples the actual CSS transition at a controlled midpoint; frame observations remain diagnostic. Sustained performance under heavy CPU/memory contention remains a limitation.

The iframe test holds actual load events, switches clients again, then releases stale and latest events. It verifies that the prior loaded document stays visible, the final selection wins, and a changed signature reaches the rendered preview. Unchanged HTML does not trigger another document load. Previous-client documents are hidden from accessibility while a replacement is pending. No personalized HTML is placed in browser storage.

Existing activity pagination remains 25 items. Search remains debounced and server-backed because only a page of messages is loaded; replacing it with page-local filtering would omit matches elsewhere. Filters, pagination, open-row identity, and the mounted scroll surface are retained.

## E. Regression boundaries

No Gmail engine, eligibility, skipped-reason calculation, recipient snapshot, template helper, OTP/PIN server validation, campaign idempotency, lease, concurrency, daily limit, uncertain-outcome, safe-resume, cooldown, reply suppression, or production execution-model changes were made. No animation/state/polling library or background service was added.

All browser checks use isolated local fixture APIs. Service tests exercise the existing implementation with isolated database/Gmail doubles. No real email was sent and no production data was changed.

## F. Verification

Passed checks:

- `npx tsc --noEmit` and production build type validation.
- `npm run lint` (three existing warnings elsewhere in the tracker page/client profile; no new motion-file warnings).
- `verify:email-motion`: rapid selections, retained panel, buffered/stale iframe loads, signature invalidation, early keyboard entry, OTP errors, OTP-only and OTP/PIN policies, stage focus, mobile bounds, reduced motion, inert collapse, summary/render isolation, elapsed hold progress, early cancellation, single commit, and immediate acceptance versus delayed sheet cleanup.
- `verify:email-delivery-security-ui`: masked PIN visibility, lockout/expiry/resend behavior, failed delivery retry, mouse/touch/keyboard holds, cancellation/focus/visibility loss, reduced motion, and settings regressions.
- `verify:email-delivery-activity-ui`: filters/search/pagination, progress, multiple jobs, offline recovery, bounded polling, navigation continuity, explicit safe resume, desktop/tablet/mobile, and reduced motion.
- `verify:email-delivery-review`: exact draft/send payloads, recipient validation/editing, real reminder phases, skipped/zero/500-client cases, focus, personalized inline/expanded signature previews, protected light/dark appearance, mobile, and reduced motion.
- `verify:email-delivery-security`, `verify:email-browser-delivery`, and `verify:email-production-isolation`.
- Related `verify:workflow-delivery`, `verify:workflow-review`, and `verify:workflow-style-navigation` suites.
- Clean `npm run build`: all 88 static pages generated. Initial sandbox output errors and an inconsistent generated pages manifest were resolved by running the build outside the sandbox and clearing only the generated `.next` directory.

Remaining limits: fresh personalized documents still require browser parsing; 300-client preparation/selection remains real work and is not consistently within a 16.7ms frame budget in the development fixture. Browser task timings vary with concurrent builds and test load. No production Gmail session, low-end-device GPU trace, or measured sustained 60fps result is claimed. The existing three lint warnings were preserved because they are unrelated to this task.

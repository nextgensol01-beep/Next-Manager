# Tracker navigation continuity repair

## Root causes

The previous return CSS hid every workspace reveal section as soon as All trackers was activated, before the destination route or list was established. The incoming list then started its own zero-opacity animation with a 140 ms delay. During route unmount, only the small shared-element ghost survived; neither the old workspace nor the new grid guaranteed an established visual surface. This explains the nearly empty dark interval and detached returning card.

Forward navigation also combined independently delayed section reveals, a temporary identity header, the route loading boundary, and the client component's full loading branch. Completion used a duration-plus-timeout cleanup rather than the actual animation handles. Replacing the loading header during a morph could reveal a second title because visibility was attached to the old DOM node.

Both the route loading boundary and the client fetch branch used `TrackerPageLoading`, which previously drew a full-width pulsing panel with seven placeholder rows. `useFreshTrackerData` intentionally started each mount without previous data. That made even a recently viewed tracker briefly replace its whole workspace with the large skeleton.

Rendered-frame inspection also exposed a separate glyph-clipping issue: interpolating font weight and width could wrap a single-line title, hiding its second word behind the ghost's height. Short, single-line destination titles now remain unwrapped during travel.

## Transition lifecycle and geometry

The existing provider remains at the persistent tracker layout boundary. There is no second navigation system. Next.js and the current pathname remain authoritative.

1. Activation captures the actual card/header geometry and an inert visual copy of the outgoing content. Navigation starts immediately.
2. The outgoing visual surface remains established during `navigating` and `waiting-for-destination`. Real incoming route content always stays painted.
3. Listing readiness requires the loaded list boundary; detail readiness requires the mounted workspace shell. Scroll restoration runs before return measurement. Two boundary samples check that the real identity anchor has settled.
4. Once ready, the source surface overlaps the destination and fades out over 180 ms. The shared title/description and material shell travel for 400 ms opening or 360 ms returning. The grid is already visible beneath the returning card.
5. Actual animation completion promises trigger the final, synchronous ownership exchange: semantic text is revealed and the decorative ghost is removed together. Visibility ownership also covers a loading heading being replaced during travel.

The title and description have independent text layers; only the empty material shell scales. All layers are clipped to the actual main-content viewport. The dashboard sidebar and top bar remain outside the transition boundary.

A 1-second readiness timeout abandons spatial travel, while retaining source continuity until a real destination shell is ready. A 4-second safety limit releases presentation resources if navigation never establishes an endpoint. Missing/filtered/offscreen cards use source/destination overlap without fabricated coordinates. Direct URLs and refreshes use the normal progressive loading shell.

## Progressive loading and cached display

`TrackerPageLoading` now establishes the existing workspace structure: theme-correct heading, information bar, known summary geometry, client-marks heading, toolbar shell, and real column labels when available. It creates no fake client rows and has no pulse/shimmer. Feedback appears after 180 ms only if the corresponding loading region still exists; real data is never delayed.

The clicked card supplies only its actual identity, financial year, client count, fields, and client columns. Unknown totals remain unresolved. This identity remains available for the current detail route after the spatial animation finishes, so an unrelated render cannot erase the loading heading.

When loaded content replaces the pending regions, a short-lived inert picture of those regions dissolves over 160 ms above the real content. The header stays outside this loading-resolution layer. There is no opacity-zero animation on the incoming workspace, and no row-by-row entrance.

The detail query opts into the existing account-scoped in-memory cache for display during revalidation. Every opening still makes a fresh `no-store` request. Cached client controls remain disabled through the existing `resultsUnavailable` guard until the read settles. Optimistic mutations invalidate that tracker's cached query variants rather than caching optimistic values. Generation, abort, pause/resume, authoritative-save, and failure guards remain intact. No browser storage, API, model, or email/security changes were introduced.

Search, archive view, ordering supplied by the existing list cache, and list scroll restoration remain intact. Fresh list visits keep existing default behavior.

## Cleanup, accessibility, and rendering cost

Route changes, Back/Forward, repeated activation, resize, scroll, Escape, hidden tabs, page hiding, and motion-preference changes cancel presentation resources safely. All layers are inert, aria-hidden, and ignore pointer input. Semantic links, modified clicks, keyboard activation, and focus on actual headings/returning cards are preserved. Reduced motion skips spatial travel.

Visual copies exist only during a handoff. Offscreen table cells are omitted before cloning, while spacer rows preserve table geometry and visible header widths. DOM work is confined to transition boundaries; animation runs without per-frame React updates. The implementation removes delayed zero-opacity page/section entrances and the seven-row pulsing skeleton. No new animation dependency or frame-rate claim is made.

## Changed files

| Exact path | Responsibility |
| --- | --- |
| `C:/Users/User/Desktop/CodeX/align/components/client-trackers/TrackerNavigationTransition.tsx` | Explicit readiness lifecycle, retained source surface, measured shared identity, animation completion, loading-region resolution, cleanup and focus. |
| `C:/Users/User/Desktop/CodeX/align/components/client-trackers/tracker-navigation-transition.css` | Single visibility owner, scoped decorative layers, quiet delayed loading feedback; removes competing opacity entrances. |
| `C:/Users/User/Desktop/CodeX/align/components/client-trackers/TrackerPageLoading.tsx` | Progressive workspace loading structure shared by route and client loading paths. |
| `C:/Users/User/Desktop/CodeX/align/app/dashboard/client-trackers/page.tsx` | Supplies real card metadata to the existing transition coordinator. |
| `C:/Users/User/Desktop/CodeX/align/app/dashboard/client-trackers/[id]/page.tsx` | Explicit workspace/error readiness, progressive loader and opt-in cached display. |
| `C:/Users/User/Desktop/CodeX/align/lib/useFreshTrackerData.ts` | Optional safe cached display with fresh reads and invalidation of optimistic query variants. |
| `C:/Users/User/Desktop/CodeX/align/scripts/verify-tracker-navigation.cjs` | Updates navigation regression checks for retained surfaces and progressive loading. |
| `C:/Users/User/Desktop/CodeX/align/scripts/verify-tracker-search.cjs` | Waits for authoritative revalidation before asserting changed values on reopen. |
| `C:/Users/User/Desktop/CodeX/align/scripts/verify-tracker-continuity.cjs` | Real Next App Router fixture, isolated APIs, rendered-frame recording, CPU-throttled checks and visual artifacts. |
| `C:/Users/User/Desktop/CodeX/align/package.json` | Adds `verify:tracker-continuity`. |
| `C:/Users/User/Desktop/CodeX/align/docs/tracker-navigation-continuity.md` | Root causes, implementation, exact inventory, evidence and limitations. |
| `C:/Users/User/Desktop/CodeX/align/docs/tracker-navigation-transition.md` | Points the earlier implementation report to this repair report. |

## Actual validation and visual evidence

- `npm run verify:tracker-navigation`: passed eight groups covering geometry, reverse navigation, list context, history, slow loading, rapid interaction, resize, keyboard, reduced motion, mobile, dark tablet, direct URLs, missing cards, and delayed anchors.
- `npm run verify:tracker-opening`: passed seven existing data/save/workflow groups, including concurrent edits, failed-save rollback, changed server values after reopening, late reads, and deferred workflow chunks.
- `npm run verify:tracker-search`: passed filtering, pagination, coalesced search, invalidation after edits, and failed-search guards.
- `npm run verify:tracker-continuity`: passed against an actual local Next.js App Router using production pages and isolated fixture APIs. Covered first tracker, second/third columns, slow data, cached reopen with disabled stale controls, Back/Forward with search restoration, and 4x CPU throttling.
- Corrected recording: 777 rendered frames captured. Animation-frame visibility samples always found an established source or live route structure; the returning grid stayed fully painted during shared return, no multiple ghosts accumulated, and no pulsing table skeleton appeared. Browser page-error list was empty.
- Visually inspected representative opening, return, slow-loading, and final ownership-boundary frames. The first inspection caught title clipping, which was corrected before the final recording.
- Focused lint and standalone TypeScript checks passed. Existing warnings in unrelated portions of the detail/profile pages remain.
- Production build passed with a 4 GB Node heap: compilation, type checking, all 88 static pages, and build tracing completed with exit code 0. Log: `C:/Users/User/Desktop/CodeX/align/tmp/tracker-continuity-build.log`.

Artifacts under `C:/Users/User/Desktop/CodeX/align/tmp/tracker-continuity-visual/`:

- `tracker-continuity.webm`: corrected recording.
- `handoff-boundaries.png`: representative source, movement, ownership exchange and slow-loading frames.
- `contact-sheet.png`: overview of the recording.
- `results.json`: scenario results, captured-frame timestamps and per-frame visibility samples.

## Limits

The referenced original MP4 was not attached; its reported symptoms were investigated from the brief and the actual implementation. The new recording uses isolated test data and a representative stationary dashboard frame. Authenticated production navigation, Safari/Firefox, live email delivery, and live export execution were not exercised. Existing save/workflow regression checks used fixture APIs. CPU throttling was tested; frame rate, GPU usage, and production performance improvements were not profiled or measured.

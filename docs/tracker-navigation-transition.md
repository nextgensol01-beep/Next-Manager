# Tracker navigation transition

The subsequent continuity/loading repair supersedes the motion and loading details below. See [tracker-navigation-continuity.md](tracker-navigation-continuity.md) for the current lifecycle, exact changed files, rendered-frame evidence, and remaining limits.

The existing listing and workspace keep their layouts and business logic. The persistent tracker route layout owns a small coordinator; the dashboard sidebar and top bar are outside its boundary.

## Architecture and motion

`TrackerNavigationTransitionProvider` survives navigation between the tracker list and its detail routes. Real Next links start navigation immediately while the coordinator captures the selected card's actual viewport rectangle, title, description, and computed theme styling. Stable tracker IDs associate the two endpoints.

The coordinator measures the mounted destination header, then animates a decorative, non-interactive overlay clipped to the main content viewport. The empty material shell scales and dissolves; independently positioned text moves and changes typography without transform scaling. Semantic source and destination headings stay in the DOM with their visual opacity coordinated during the handoff. Forward motion runs for 430 ms after the anchor is available; reverse motion runs for 370 ms. Information, activity, summaries, and the table container reveal in overlapping 220 ms animations. Table rows never receive individual entrance animations.

The loading route can show the identity captured from the real card alongside the existing skeleton. This lets the header handoff finish before client rows or totals arrive, without inventing statistics.

## Return and state restoration

All trackers and browser Back capture the current workspace heading, restore the list's search and active/archive filter, restore scroll before measuring, and animate toward the actual matching card. Browser Forward captures a currently available source card again rather than reusing old coordinates.

Only lightweight list UI state and the current transition's identity live in provider memory. No browser storage or new API cache is introduced. The existing cached list retains its server ordering. This listing currently has no separate sort or view controls. A fresh sidebar-style list visit starts with its existing default state. Provider state does not survive a full refresh or leaving the tracker route subtree.

## Fallbacks and interruptions

- Direct URLs, refreshes, and unrelated navigation have no fabricated source morph.
- Mobile widths below 768 px use a short content transition.
- Missing, filtered, or offscreen destination cards use a short content fallback after the list is ready.
- Destination measurement waits at most 900 ms; loading continues normally afterward.
- Route changes remain authoritative. Duplicate activation is suppressed during the same journey. Other navigation, resize, scrolling, Escape, tab hiding, page hiding, and motion-preference changes cancel decorative motion.
- Cleanup removes the overlay, animation handles, temporary visibility attributes, observer, scheduled frame, and timers. The coordinator never locks body scrolling.

## Performance and accessibility

Only boundary measurements are taken; no layout is read every animation frame. Web Animations handles the material and text layers without React updates at animation frequency. There are no added dependencies, animated table rows, large animated blur surfaces, or animation-triggered API requests. Small text layers interpolate font metrics and width/height to avoid stretching glyphs.

Tracker navigation remains real links with normal Enter, modified click, new-tab, and prefetch behavior. Decorative overlays are inert, aria-hidden, and ignore pointer input. Focus moves to the real destination heading or returning card; a missing return card falls back to the listing heading. If data is still loading, focus waits for the real workspace heading. Reduced motion bypasses spatial animation and the fallback reveal.

## Changed files

| Exact path | Responsibility |
| --- | --- |
| `C:/Users/User/Desktop/CodeX/align/components/client-trackers/TrackerNavigationTransition.tsx` | Persistent coordinator, geometry capture, theme-aware ghosts, history, cleanup, links, loading identity, focus, and UI-state memory. |
| `C:/Users/User/Desktop/CodeX/align/components/client-trackers/tracker-navigation-transition.css` | Scoped source focus, title handoff, press response, and workspace section reveals. |
| `C:/Users/User/Desktop/CodeX/align/app/dashboard/client-trackers/layout.tsx` | Mounts the coordinator at the persistent tracker boundary and imports its stylesheet. |
| `C:/Users/User/Desktop/CodeX/align/app/dashboard/client-trackers/page.tsx` | Stable card/text anchors, transition links, and list UI-state restoration. |
| `C:/Users/User/Desktop/CodeX/align/app/dashboard/client-trackers/[id]/page.tsx` | Measurable heading, return link, loading identity, and section anchors. |
| `C:/Users/User/Desktop/CodeX/align/scripts/fixtures/tracker-navigation.tsx` | Isolated harness mounting the actual production pages and provider. |
| `C:/Users/User/Desktop/CodeX/align/scripts/fixtures/tracker-navigation-router.cjs` | Lightweight route adapter for isolated browser checks. |
| `C:/Users/User/Desktop/CodeX/align/scripts/verify-tracker-navigation.cjs` | Browser regression checks with local mock APIs. |
| `C:/Users/User/Desktop/CodeX/align/package.json` | Adds `verify:tracker-navigation`. |
| `C:/Users/User/Desktop/CodeX/align/docs/tracker-navigation-transition.md` | Architecture, implementation inventory, validation scope, and limitations. |

## Validation scope

Run `npm run verify:tracker-navigation` for geometry in three columns and a lower row, forward/reverse navigation, unchanged shell geometry, scroll/search restoration, history, loading, resize, rapid activation, keyboard, reduced motion, mobile, dark tablet, direct URLs, refreshes, missing cards, and delayed route anchors. The harness uses actual page components with local mock APIs and a route adapter; it does not replace an authenticated end-to-end test of the deployed App Router.

`npm run verify:tracker-opening` checks existing tracker loading, marks, concurrent saves, failed-save recovery, freshness on reopening, late-response isolation, and deferred workflow loading.

Actual checks completed:

| Check | Result |
| --- | --- |
| `npm run verify:tracker-navigation` | Passed all eight browser-check groups, including archive restoration, hidden real titles during handoff, unscaled text layers, missing cards, and delayed route anchors. No browser errors; local navigation API requests were GETs only. |
| `npm run verify:tracker-opening` | Passed all seven existing regression groups, including concurrent and failed mark saves and deferred workflow behavior. |
| Focused `next lint` on the four changed production TSX files | Passed; only two existing warnings in unrelated portions of the detail page remain. |
| `npm run build` with `NODE_OPTIONS=--max-old-space-size=4096` | Passed production compilation, type checking, and all 88 static pages; exit code 0. The default 2 GB worker had exhausted its heap before retrying. |

The browser results are saved in `C:/Users/User/Desktop/CodeX/align/tmp/tracker-navigation-tests/results.json`; the build log is `C:/Users/User/Desktop/CodeX/align/tmp/tracker-navigation-build.log`.

A frame rate has not been measured. Live email delivery, exports, real backend mutations, Safari/Firefox, and authenticated browser history against the deployed application are not verified by this harness.

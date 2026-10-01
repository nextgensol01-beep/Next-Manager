# Liquid Glass material laboratory

Route: `/dev/liquid-glass` (`npm run dev`). The route returns 404 in production by default. An intentionally isolated preview deployment can opt in with `LIQUID_GLASS_LAB_ENABLED=1` at build time; this is a deployment switch, not an authentication boundary. Do not enable it on the public production app.

## Audit and reuse

The existing implementation had two families:

- `components/ui/liquid-glass/`: `GlassSurface`, `GlassButton`, `GlassToolbar`, `GlassGroup`, `GlassPopover`, `GlassToggle`; `useGlassPointer`, `useGlassEnvironment`, `useGlassMotion`; `types.ts`, `index.ts`, and `liquid-glass.css`. This is the family used by the existing development route and extended here. Existing variants, intensities, radii, exports, and component props remain supported.
- Production controls: `components/ui/LiquidGlassButton.tsx`, `LiquidGlassDropdown.tsx`, `LiquidGlassLightSurface.tsx`, `useLiquidGlassLight.ts`, plus the liquid-glass, surrounding-light, tray, and pill rules in `app/globals.css`. Those controls include their own reflection and motion behavior. Their styles and APIs were left intact. They are used by clients, quotations, financial-year navigation, and related screens. The shared `GlassToggle` is also used by client trackers.

There was no existing texture renderer or refractive lens in this family. The original page contained surfaces, a toolbar/group, a switch, a popover, and a Framer Motion shared-layout morph. These capabilities remain in the lab; the latter demonstrations live in `LegacyExperiments.tsx`.

Refactored shared code:

- `useGlassPointer`: normalized coordinates, 125 ms exponential damping, bounded light travel, cached bounds, no frame-by-frame React state, settling and cleanup. Touch and reduced-motion users get static light. No global pointer listeners.
- `useGlassEnvironment`: start at the parent instead of reading the surface's own generated marker; react to ancestor environment markers and application theme changes. No pixel sampling.
- `useGlassMotion`: honor the lab's motion/interaction settings alongside the OS preference.
- `GlassSurface` and `GlassButton`: compose caller pointer handlers instead of swallowing them. Buttons default to `type="button"`. Button motion is restrained. `GlassToggle` retains its existing production animation and uses a simple, non-overshooting slide inside the optical provider.
- `liquid-glass.css`: new material rules are scoped beneath `.glass-material`. No production screen was wrapped in that boundary.

New reusable pieces are only `material.ts` (presets, numeric settings, CSS variable mapping), `GlassMaterialProvider` (opt-in material/behavior boundary), and `GlassScrollEdge` (directional diffusion). The shader and scene are deliberately local to the lab rather than a general DOM glass component.

## Rendering contract

Generic glass uses ordinary backdrop transmission with bounded blur, saturation, brightness, neutral tint, inset depth, a restrained directional reflection, and a one-pixel masked contour. It creates a polished-edge illusion; **it does not physically refract arbitrary DOM**. The pseudo-elements are decorative and pointer-transparent. Controls and selectable content remain ordinary DOM.

One `GlassMaterialProvider` supplies thin/regular/thick presets through inherited `--optical-*` variables. Existing `--glass-*` radius and pointer tokens are retained. Small nested surfaces use lower diffusion and slightly denser transmission to avoid compounding blur. Explicit light/dark/media regions control neutral body tint; environmental colour comes from the backdrop.

The pointer hook maps local coordinates to -1…1 and settles a time-based damper. The reflection only travels ±9 percentage points horizontally and ±4 vertically. It remains present at rest. It does not tilt the surface, chase the pointer with a large spotlight, or run an idle animation loop.

The lens draws the background typography and grid once to a 900×400 canvas, uploads that same canvas to a WebGL texture, and samples it both outside and inside the lens. A convex normal and GLSL `refract` vector displace UVs more strongly at the rim. Fresnel-like reflection, asymmetric specular light, opposite-side shading, and tiny chromatic separation complete the composite. This is **controlled texture refraction with an approximate optical model**, not an arbitrary-DOM capture or a physically complete light-transport simulation. The position slider is keyboard accessible. Turning refraction off provides a direct optical comparison.

## Scrolling under glass

The scroll experiment uses a real overflow container with fixed overlay toolbars. Each toolbar has three narrow, overlapping sibling backdrop layers at its content-facing edge. Linear masks phase out 2 px, 5 px, and material-strength diffusion over a default 28 px transition. A small neutral luminance contribution belongs to the innermost band. The footer reverses the masks. No radial smoke shapes, duplicated text, scroll-driven React rendering, or full-screen filters are involved.

Use the arrow buttons or scroll the content itself. Compare the progressive edge on/off, switch the underlying content between light and dark, and tune the transition width. All content, including the last row, can be brought fully above the footer. `GlassScrollEdge` is intended to sit outside the toolbar's clipped material box, inside a positioned wrapper.

## Performance and fallbacks

- Material sliders write CSS variables and outputs directly. React state handles discrete choices only. Presets reset all material parameters together.
- The single lens coalesces redraws into one requestAnimationFrame, only after tuning, resizing, visibility, or position changes. It stops drawing when offscreen or hidden. The output DPR is capped at 1.5 and width at 1000 CSS px; source texture size is fixed. All GPU objects, observers, listeners, and scheduled frames are cleaned up.
- CSS feature queries provide neutral readable fallback surfaces when backdrop filtering is unsupported. Reduced transparency removes diffusion; forced colours use system colours and visible borders.
- Missing WebGL, shader failure, context loss, reduced transparency, or forced colours displays the same known scene with a CSS glass lens and an explicit no-refraction status. Context restoration rebuilds the renderer. The lab includes a manual CSS fallback toggle.
- Moving colour is a deliberately selected background test only; it stops under reduced motion. Normal material is static at rest.
- No rendering framework or runtime dependency was added.

## Verification and further tuning

TypeScript and targeted ESLint passed. The full production build completed successfully; its existing warnings are confined to unrelated client/tracker pages. Chromium preview checks covered the 1280 px desktop layout, 390 px mobile layout (no horizontal overflow), light/dark environments, real scrolling, lens displacement and CSS fallback/restoration, keyboard sliders, layer isolation, popover, toggle, and preserved layout morph. Reduced-motion simulation disables interpolation while preserving static optical light. Safari, Firefox, real low-power touch hardware, actual context-loss recovery, and OS reduced-transparency behavior still need device testing; code paths are present but not claimed as cross-browser certification.

The visual parameters most worth tuning on target hardware are the scroll transition (start at 20–32 px), regular material blur (8–14 px), transmission (.82–.92), and lens rim refraction. Extremely transparent settings are inspection tools and may lower text contrast over high-contrast backgrounds. Check readability against the intended content before rolling the material out to production.


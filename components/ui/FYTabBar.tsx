"use client";
import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useVelocity,
  AnimatePresence,
  useReducedMotion,
} from "framer-motion";
import { FINANCIAL_YEARS } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   Spring configs — physics
───────────────────────────────────────────────────────────── */
const LEAD_SPRING    = { stiffness: 580, damping: 28, mass: 0.6  };
const TRAIL_SPRING   = { stiffness: 260, damping: 26, mass: 1.5  };
const VERT_SPRING    = { stiffness: 580, damping: 30, mass: 0.6  };
const LIGHT_SPRING   = { stiffness: 50,  damping: 13, mass: 1.8  };
const GLOSS_SPRING   = { stiffness: 70,  damping: 16, mass: 0.9  };
const TILT_SPRING    = { stiffness: 150, damping: 24, mass: 0.55 };
const SCALE_SPRING   = { stiffness: 380, damping: 32, mass: 0.55 };
const SQUASH_SPRING  = { stiffness: 420, damping: 22, mass: 0.5  };

/* ─────────────────────────────────────────────────────────────
   Spring configs — optics (reflection layers)
   Deliberately slower than physics springs so light "lags"
   behind the cursor, feeling like a real optical surface.
───────────────────────────────────────────────────────────── */
// Specular highlight — medium lag
const SPEC_SPRING    = { stiffness: 90,  damping: 18, mass: 1.0  };
// Pointer ghost — slightly faster than specular
const PTR_SPRING     = { stiffness: 120, damping: 20, mass: 0.85 };
// Edge rim brightness — fast (edge reacts quickly to proximity)
const RIM_SPRING     = { stiffness: 200, damping: 24, mass: 0.6  };
// Wet border glow — very fast so border reacts immediately to cursor proximity
const WET_BORDER_SPRING = { stiffness: 280, damping: 26, mass: 0.5 };
// Surface specular — slightly faster than SPEC for more responsive feel
const WET_SPEC_SPRING   = { stiffness: 110, damping: 16, mass: 0.9 };

interface FYTabBarProps {
  value: string;
  onChange: (fy: string) => void;
}

/* ─────────────────────────────────────────────────────────────
   GlassReflection
   ─────────────────────────────────────────────────────────────
   A purely optical overlay that sits inside a pill/button.
   It adds 5 independent light layers:

   L1 — Static top dome: a soft elliptical highlight at the top
        edge, always present. Simulates ambient light from above
        catching the curved glass surface.

   L2 — Specular slide: a smaller, brighter ellipse that tracks
        the cursor with spring lag. Simulates a specular
        reflection on a curved surface — it never sits exactly
        where the cursor is, it shifts toward it slowly.

   L3 — Pointer ghost: a very faint, heavily blurred spot at the
        cursor position, offset slightly (as if the cursor is
        being "reflected" inside the glass slightly behind the
        surface). Opacity 5–8% — barely visible, just alive.

   L4 — Edge rim brightening: four thin gradient strips (left,
        right, top, bottom) that brighten as the cursor
        approaches that edge. Simulates the Fresnel effect —
        glass reflects more light at glancing angles.

   L5 — Inner depth glow: a very soft radial glow from the
        centre-bottom, always present. Gives the pill a sense
        of internal volume and depth.

   Props:
     nx, ny   — normalised cursor coords in [-1, 1] range
     hovered  — whether cursor is inside this element
     reduced  — prefers-reduced-motion
     isActive — active pill gets stronger ambient highlight
───────────────────────────────────────────────────────────── */
interface GlassReflectionProps {
  nx: ReturnType<typeof useMotionValue<number>>;
  ny: ReturnType<typeof useMotionValue<number>>;
  hovered: boolean;
  reduced: boolean;
  isActive: boolean;
}

function GlassReflection({ nx, ny, hovered, reduced, isActive }: GlassReflectionProps) {
  /* ── Spring-lag cursor per optical layer ──
     Each layer has its own spring personality so they move at
     different speeds — layered optical depth of a real glass surface. */
  const sX = useSpring(nx, WET_SPEC_SPRING);   // specular — medium lag
  const sY = useSpring(ny, WET_SPEC_SPRING);
  const pX = useSpring(nx, PTR_SPRING);         // pointer ghost — slightly faster
  const pY = useSpring(ny, PTR_SPRING);
  const rX = useSpring(nx, RIM_SPRING);         // rim proximity — fast
  const rY = useSpring(ny, RIM_SPRING);
  const wX = useSpring(nx, WET_BORDER_SPRING);  // wet border — very fast
  const wY = useSpring(ny, WET_BORDER_SPRING);

  /* ── L2: Specular highlight position ── */
  const specLeft = useTransform(sX, [-1, 1], ["15%", "85%"]);
  const specTop  = useTransform(sY, [-1, 1], ["5%",  "75%"]);

  /* ── L2b: Secondary wet-surface specular (tighter, brighter spot) ── */
  const spec2Left = useTransform(sX, [-1, 1], ["25%", "75%"]);
  const spec2Top  = useTransform(sY, [-1, 1], ["8%",  "65%"]);

  /* ── L3: Pointer ghost — inward offset ── */
  const ghostLeft = useTransform(pX, [-1, 1], ["30%", "70%"]);
  const ghostTop  = useTransform(pY, [-1, 1], ["20%", "65%"]);

  /* ── L4: Edge rim proximity (Fresnel, inner surface) ── */
  const rimRight  = useTransform(rX, [0.25, 1.0],  [0, 0.70]);
  const rimLeft   = useTransform(rX, [-0.25, -1.0],[0, 0.70]);
  const rimTop    = useTransform(rY, [-0.25, -1.0],[0, 0.60]);
  const rimBottom = useTransform(rY, [0.25, 1.0],  [0, 0.50]);

  /* ── Wet border: cursor-angle → bright arc on nearest border ──
     This drives a conic/radial gradient that paints a wet shine
     on whichever border edge the cursor is closest to.
     wX/wY in [-1,1] → angle for the border glow arc.           */
  const wetRight  = useTransform(wX, [0.15, 1.0],  [0, 1.0]);
  const wetLeft   = useTransform(wX, [-0.15, -1.0],[0, 1.0]);
  const wetTop    = useTransform(wY, [-0.15, -1.0],[0, 1.0]);
  const wetBottom = useTransform(wY, [0.15, 1.0],  [0, 1.0]);

  /* ── Opacity envelopes ── */
  const specOpacity    = useSpring(0, { stiffness: 140, damping: 20 });
  const spec2Opacity   = useSpring(0, { stiffness: 155, damping: 22 });
  const ghostOpacity   = useSpring(0, { stiffness: 140, damping: 20 });
  const rimOpacity     = useSpring(isActive ? 0.22 : 0.02, { stiffness: 180, damping: 22 });
  const wetBorderScale = useSpring(0, { stiffness: 200, damping: 24 });

  useEffect(() => {
    if (reduced) return;
    const hovStrong = isActive ? 0.85 : 0.65;
    const hovSpec2  = isActive ? 0.55 : 0.40;
    specOpacity.set(hovered ? hovStrong : 0);
    spec2Opacity.set(hovered ? hovSpec2 : 0);
    ghostOpacity.set(hovered ? 0.09 : 0);
    rimOpacity.set(hovered ? 1 : (isActive ? 0.22 : 0.02));
    wetBorderScale.set(hovered ? 1 : 0);
  }, [hovered, isActive, reduced, specOpacity, spec2Opacity, ghostOpacity, rimOpacity, wetBorderScale]);

  useEffect(() => {
    if (!hovered || reduced) { nx.set(0); ny.set(0); }
  }, [hovered, reduced, nx, ny]);

  /* ── Hoisted combined opacities (Rules of Hooks — no transforms in JSX) ── */
  const rimRightOpacity  = useTransform([rimOpacity, rimRight],  ([o, r]: number[]) => o * r);
  const rimLeftOpacity   = useTransform([rimOpacity, rimLeft],   ([o, r]: number[]) => o * r);
  const rimTopOpacity    = useTransform([rimOpacity, rimTop],    ([o, r]: number[]) => o * r);
  const rimBottomOpacity = useTransform([rimOpacity, rimBottom], ([o, r]: number[]) => o * r);

  /* ── Wet border combined opacities ── */
  const wetRightOpacity  = useTransform([wetBorderScale, wetRight],  ([s, r]: number[]) => s * r);
  const wetLeftOpacity   = useTransform([wetBorderScale, wetLeft],   ([s, r]: number[]) => s * r);
  const wetTopOpacity    = useTransform([wetBorderScale, wetTop],    ([s, r]: number[]) => s * r);
  const wetBottomOpacity = useTransform([wetBorderScale, wetBottom], ([s, r]: number[]) => s * r);

  /* ── Specular gradient strings (hoisted, not in JSX) ── */
  const specBg  = "radial-gradient(ellipse 55% 50% at 50% 35%, rgba(255,255,255,0.92) 0%, rgba(220,235,255,0.45) 38%, rgba(180,215,255,0.10) 62%, transparent 80%)";
  const spec2Bg = "radial-gradient(ellipse 35% 30% at 50% 30%, rgba(255,255,255,0.99) 0%, rgba(240,248,255,0.60) 30%, transparent 65%)";

  if (reduced) return null;

  return (
    <>
      {/* ══════════════════════════════════════════════════════════
          L1 — Ambient top dome (always on)
          Wider, stronger — the resting glossy sheen that makes
          the button look like it has a curved wet surface.
          ══════════════════════════════════════════════════════════ */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: "3%",
          right: "3%",
          height: "58%",
          borderRadius: "9999px 9999px 50% 50%",
          background: isActive
            ? "linear-gradient(180deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.18) 50%, transparent 82%)"
            : "linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.03) 52%, transparent 82%)",
          pointerEvents: "none",
        }}
      />

      {/* ══════════════════════════════════════════════════════════
          L1b — Thin top-edge wet highlight (always on)
          A very thin bright line along the very top, like a water
          bead sitting on the surface edge.
          ══════════════════════════════════════════════════════════ */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: "12%",
          right: "12%",
          height: "2px",
          borderRadius: 9999,
          background: isActive
            ? "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.90) 35%, rgba(255,255,255,0.95) 50%, rgba(255,255,255,0.90) 65%, transparent 100%)"
            : "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 35%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0.18) 65%, transparent 100%)",
          pointerEvents: "none",
        }}
      />

      {/* ══════════════════════════════════════════════════════════
          L2 — Main specular highlight (cursor-reactive)
          A large, soft, blurred ellipse tracking the cursor with
          spring lag. The primary "light sliding over wet gel" feel.
          mix-blend-mode: overlay keeps it integrated with the tint.
          ══════════════════════════════════════════════════════════ */}
      <motion.span
        aria-hidden
        style={{
          position: "absolute",
          width: "65%",
          height: "120%",
          left: specLeft,
          top: specTop,
          x: "-50%",
          y: "-50%",
          borderRadius: "50%",
          background: specBg,
          opacity: specOpacity,
          filter: "blur(4px)",
          mixBlendMode: "overlay",
          pointerEvents: "none",
        }}
      />

      {/* ══════════════════════════════════════════════════════════
          L2b — Tight secondary specular (hot spot)
          Smaller and sharper — the "glint" on top of the main
          highlight, like the brightest point of light on a wet
          surface. Very high opacity, small blur.
          ══════════════════════════════════════════════════════════ */}
      <motion.span
        aria-hidden
        style={{
          position: "absolute",
          width: "30%",
          height: "60%",
          left: spec2Left,
          top: spec2Top,
          x: "-50%",
          y: "-50%",
          borderRadius: "50%",
          background: spec2Bg,
          opacity: spec2Opacity,
          filter: "blur(1.5px)",
          mixBlendMode: "overlay",
          pointerEvents: "none",
        }}
      />

      {/* ══════════════════════════════════════════════════════════
          L3 — Pointer ghost (inward reflection)
          Very faint, heavily blurred — simulates the cursor being
          reflected off the back inner surface of the glass at an
          inward angle. Opacity 7–9%, barely visible.
          ══════════════════════════════════════════════════════════ */}
      <motion.span
        aria-hidden
        style={{
          position: "absolute",
          width: "28%",
          height: "65%",
          left: ghostLeft,
          top: ghostTop,
          x: "-50%",
          y: "-50%",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(210,232,255,0.45) 42%, transparent 70%)",
          opacity: ghostOpacity,
          filter: "blur(9px)",
          pointerEvents: "none",
        }}
      />

      {/* ══════════════════════════════════════════════════════════
          L4 — Fresnel inner rim strips
          Four thin gradients brightening as cursor nears each edge.
          These simulate the Fresnel effect — glass reflects much
          more at glancing angles (near the edges).
          ══════════════════════════════════════════════════════════ */}

      {/* Right inner rim */}
      <motion.span
        aria-hidden
        style={{
          position: "absolute",
          top: "6%", bottom: "6%", right: 0,
          width: "32%",
          borderRadius: "0 9999px 9999px 0",
          background: "linear-gradient(to left, rgba(255,255,255,0.62) 0%, rgba(200,225,255,0.18) 55%, transparent 100%)",
          opacity: rimRightOpacity,
          pointerEvents: "none",
        }}
      />
      {/* Left inner rim */}
      <motion.span
        aria-hidden
        style={{
          position: "absolute",
          top: "6%", bottom: "6%", left: 0,
          width: "32%",
          borderRadius: "9999px 0 0 9999px",
          background: "linear-gradient(to right, rgba(255,255,255,0.62) 0%, rgba(200,225,255,0.18) 55%, transparent 100%)",
          opacity: rimLeftOpacity,
          pointerEvents: "none",
        }}
      />
      {/* Top inner rim */}
      <motion.span
        aria-hidden
        style={{
          position: "absolute",
          left: "6%", right: "6%", top: 0,
          height: "38%",
          borderRadius: "9999px 9999px 0 0",
          background: "linear-gradient(to bottom, rgba(255,255,255,0.55) 0%, rgba(200,225,255,0.08) 70%, transparent 100%)",
          opacity: rimTopOpacity,
          pointerEvents: "none",
        }}
      />
      {/* Bottom inner rim */}
      <motion.span
        aria-hidden
        style={{
          position: "absolute",
          left: "6%", right: "6%", bottom: 0,
          height: "32%",
          borderRadius: "0 0 9999px 9999px",
          background: "linear-gradient(to top, rgba(180,210,255,0.42) 0%, rgba(200,225,255,0.10) 60%, transparent 100%)",
          opacity: rimBottomOpacity,
          pointerEvents: "none",
        }}
      />

      {/* ══════════════════════════════════════════════════════════
          L4b — Wet border glow strips (OUTER edge reaction)
          These are BRIGHTER and more saturated than the inner rim.
          They sit right at the edge of the button surface and
          simulate light catching on a wet rounded edge — like
          morning dew on a glass bead edge.
          Each strip uses a bright white + blue-white gradient so
          it looks like a specular flash on the border itself.
          ══════════════════════════════════════════════════════════ */}

      {/* Wet right border */}
      <motion.span
        aria-hidden
        style={{
          position: "absolute",
          top: "10%", bottom: "10%", right: 0,
          width: "14%",
          borderRadius: "0 9999px 9999px 0",
          background: "linear-gradient(to left, rgba(255,255,255,0.95) 0%, rgba(210,232,255,0.55) 40%, transparent 100%)",
          opacity: wetRightOpacity,
          filter: "blur(0.5px)",
          pointerEvents: "none",
        }}
      />
      {/* Wet left border */}
      <motion.span
        aria-hidden
        style={{
          position: "absolute",
          top: "10%", bottom: "10%", left: 0,
          width: "14%",
          borderRadius: "9999px 0 0 9999px",
          background: "linear-gradient(to right, rgba(255,255,255,0.95) 0%, rgba(210,232,255,0.55) 40%, transparent 100%)",
          opacity: wetLeftOpacity,
          filter: "blur(0.5px)",
          pointerEvents: "none",
        }}
      />
      {/* Wet top border */}
      <motion.span
        aria-hidden
        style={{
          position: "absolute",
          left: "10%", right: "10%", top: 0,
          height: "16%",
          borderRadius: "9999px 9999px 0 0",
          background: "linear-gradient(to bottom, rgba(255,255,255,0.92) 0%, rgba(210,232,255,0.40) 55%, transparent 100%)",
          opacity: wetTopOpacity,
          filter: "blur(0.5px)",
          pointerEvents: "none",
        }}
      />
      {/* Wet bottom border */}
      <motion.span
        aria-hidden
        style={{
          position: "absolute",
          left: "10%", right: "10%", bottom: 0,
          height: "14%",
          borderRadius: "0 0 9999px 9999px",
          background: "linear-gradient(to top, rgba(200,225,255,0.80) 0%, rgba(180,215,255,0.30) 55%, transparent 100%)",
          opacity: wetBottomOpacity,
          filter: "blur(0.5px)",
          pointerEvents: "none",
        }}
      />

      {/* ══════════════════════════════════════════════════════════
          L5 — Inner depth glow (always on)
          Soft radial from centre-bottom. Brand blue on active,
          cool grey-blue on inactive. Creates interior volume.
          ══════════════════════════════════════════════════════════ */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 9999,
          background: isActive
            ? "radial-gradient(ellipse 90% 70% at 50% 88%, rgba(0,113,227,0.20) 0%, transparent 70%)"
            : "radial-gradient(ellipse 80% 60% at 50% 92%, rgba(120,160,220,0.04) 0%, transparent 65%)",
          pointerEvents: "none",
        }}
      />

      {/* ══════════════════════════════════════════════════════════
          L6 — Bottom edge wet glisten (always on)
          A very thin bright arc along the bottom edge — simulates
          light reflecting off the bottom rim of a rounded gel
          object (like a contact lens or water drop edge).
          ══════════════════════════════════════════════════════════ */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          bottom: 0,
          left: "20%",
          right: "20%",
          height: "1px",
          borderRadius: 9999,
          background: isActive
            ? "linear-gradient(90deg, transparent 0%, rgba(100,170,255,0.50) 35%, rgba(140,200,255,0.60) 50%, rgba(100,170,255,0.50) 65%, transparent 100%)"
            : "linear-gradient(90deg, transparent 0%, rgba(180,210,255,0.10) 35%, rgba(200,225,255,0.14) 50%, rgba(180,210,255,0.10) 65%, transparent 100%)",
          pointerEvents: "none",
        }}
      />
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   SelectionPill
───────────────────────────────────────────────────────────── */
interface SelectionPillProps {
  targetRect: { left: number; width: number; height: number; top: number } | null;
  reduced: boolean;
  isHovered: boolean;
  isPressed: boolean;
  cursorX: ReturnType<typeof useMotionValue<number>>;
  cursorY: ReturnType<typeof useMotionValue<number>>;
}

function SelectionPill({
  targetRect,
  reduced,
  isHovered,
  isPressed,
  cursorX,
  cursorY,
}: SelectionPillProps) {

  /* ── Raw edge targets ── */
  const leadTarget   = useMotionValue((targetRect?.left ?? 0) + (targetRect?.width ?? 0));
  const trailTarget  = useMotionValue(targetRect?.left ?? 0);
  const topTarget    = useMotionValue(targetRect?.top    ?? 0);
  const heightTarget = useMotionValue(targetRect?.height ?? 0);

  /* ── Springified edges ── */
  const leadEdge  = useSpring(leadTarget,  reduced ? { stiffness: 300, damping: 40, mass: 1 } : LEAD_SPRING);
  const trailEdge = useSpring(trailTarget, reduced ? { stiffness: 300, damping: 40, mass: 1 } : TRAIL_SPRING);
  const top       = useSpring(topTarget,   VERT_SPRING);
  const height    = useSpring(heightTarget, VERT_SPRING);

  const pillLeft  = trailEdge;
  const pillWidth = useTransform(
    [leadEdge, trailEdge] as const,
    ([lead, trail]: number[]) => Math.max(lead - trail, 4)
  );

  useEffect(() => {
    if (!targetRect) return;
    leadTarget.set(targetRect.left + targetRect.width);
    trailTarget.set(targetRect.left);
    topTarget.set(targetRect.top);
    heightTarget.set(targetRect.height);
  }, [targetRect, leadTarget, trailTarget, topTarget, heightTarget]);

  const trailVelocity = useVelocity(trailEdge);
  const leadVelocity  = useVelocity(leadEdge);

  const rawSquashY = useTransform(
    trailVelocity,
    [-800, -200, 0, 200, 800],
    reduced ? [1, 1, 1, 1, 1] : [0.93, 0.97, 1, 0.97, 0.93]
  );
  const scaleY = useSpring(rawSquashY, SQUASH_SPRING);

  /* ── Internal sloshing light ── */
  const lightXNum = useMotionValue(50);
  const lightX    = useSpring(lightXNum, LIGHT_SPRING);
  const lightXPct = useTransform(lightX, (v) => `${v}%`);

  useEffect(() => {
    const unsub = leadVelocity.on("change", (v) => {
      const clamped = Math.max(-900, Math.min(900, v));
      lightXNum.set(50 - (clamped / 900) * 28);
    });
    return unsub;
  }, [leadVelocity, lightXNum]);

  /* ── Motion shimmer ── */
  const shimmerOpacity = useTransform(
    leadVelocity,
    [-500, -80, 0, 80, 500],
    [0.85, 0, 0, 0, 0.85]
  );
  const shimmerBg = useTransform(
    leadVelocity,
    [-500, 0, 500],
    [
      "linear-gradient(270deg, rgba(255,255,255,0.20) 0%, transparent 55%)",
      "linear-gradient(90deg, rgba(255,255,255,0.00) 0%, transparent 55%)",
      "linear-gradient(90deg, rgba(255,255,255,0.20) 0%, transparent 55%)",
    ]
  );

  /* ── 3D tilt from cursor ── */
  const tX = useSpring(cursorX, TILT_SPRING);
  const tY = useSpring(cursorY, TILT_SPRING);
  const rotateY = useTransform(tX, [-1, 1], reduced ? [0, 0] : [-2.5, 2.5]);
  const rotateX = useTransform(tY, [-1, 1], reduced ? [0, 0] : [2.5, -2.5]);

  /* ── Legacy opacity springs (for rim + top dome of active pill) ── */
  const rimOpacity   = useSpring(0.35, { stiffness: 160, damping: 20 });
  const topHighlight = useSpring(0.58, { stiffness: 180, damping: 22 });

  useEffect(() => {
    if (reduced) return;
    rimOpacity.set(isHovered ? 0.72 : 0.35);
    topHighlight.set(isHovered ? 0.82 : 0.58);
  }, [isHovered, reduced, rimOpacity, topHighlight]);

  /* ── Press/hover scale ── */
  const rawScale = useMotionValue(1);
  const scale    = useSpring(rawScale, SCALE_SPRING);
  useEffect(() => {
    if (reduced) return;
    rawScale.set(isPressed ? 0.955 : isHovered ? 1.02 : 1);
  }, [isPressed, isHovered, reduced, rawScale]);

  /* ── Sloshing highlight gradient ── */
  const highlightBg = useTransform(
    lightXPct,
    (x) =>
      `radial-gradient(ellipse 80% 100% at ${x} -10%, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.18) 45%, transparent 70%)`
  );

  if (!targetRect) return null;

  return (
    <motion.div
      aria-hidden
      style={{
        position: "absolute",
        left: pillLeft,
        top,
        width: pillWidth,
        height,
        scale,
        scaleY,
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
        borderRadius: 9999,
        pointerEvents: "none",
        willChange: "transform, left, width",
        zIndex: 1,
        transformOrigin: "center center",
      }}
    >
      {/* Clip wrapper */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 9999,
          overflow: "hidden",
          background: "var(--glass-pill-active-bg)",
          border: "1px solid var(--glass-pill-active-border)",
          boxShadow: "var(--glass-pill-active-glow)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
        }}
      >
        {/* Active pill sloshing highlight (motion-driven) */}
        <motion.span
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "60%",
            borderRadius: "9999px 9999px 40% 40%",
            background: highlightBg,
            opacity: topHighlight,
            pointerEvents: "none",
          }}
        />

        {/* GlassReflection — cursor optics for the active pill */}
        <GlassReflection
          nx={cursorX}
          ny={cursorY}
          hovered={isHovered}
          reduced={reduced}
          isActive={true}
        />

        {/* Edge rim */}
        <motion.span
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 9999,
            border: "1px solid rgba(255,255,255,0.80)",
            opacity: rimOpacity,
            pointerEvents: "none",
          }}
        />

        {/* Bottom brand-blue subsurface scatter */}
        <span
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 9999,
            background:
              "radial-gradient(ellipse at 50% 110%, rgba(0,113,227,0.22) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        {/* Motion shimmer */}
        {!reduced && (
          <motion.span
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 9999,
              background: shimmerBg,
              opacity: shimmerOpacity,
              pointerEvents: "none",
            }}
          />
        )}
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────
   GhostPill — transparent label button
───────────────────────────────────────────────────────────── */
interface GhostPillProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  reduced: boolean;
  onHoverChange: (hovered: boolean) => void;
  onPressChange: (pressed: boolean) => void;
  onPointerMove: (x: number, y: number) => void;
}

function GhostPill({
  label,
  isActive,
  onClick,
  reduced,
  onHoverChange,
  onPressChange,
  onPointerMove,
}: GhostPillProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const rawScale = useMotionValue(1);
  const scale    = useSpring(rawScale, SCALE_SPRING);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [ripple,  setRipple]  = useState(false);

  /* ── Per-button cursor motion values for GlassReflection ── */
  const localNX = useMotionValue(0);
  const localNY = useMotionValue(0);

  /* ── Wet border system ──
     wX/wY drive the border glow direction.
     We derive a dynamic box-shadow that makes the border look
     wet — brighter on whichever side the cursor is nearest.   */
  const wX = useSpring(localNX, WET_BORDER_SPRING);
  const wY = useSpring(localNY, WET_BORDER_SPRING);

  /* Intensity per edge — how close cursor is to that edge [0,1] */
  const wetR = useTransform(wX, [0.15, 1.0],  [0, 1]);
  const wetL = useTransform(wX, [-0.15, -1.0],[0, 1]);
  const wetT = useTransform(wY, [-0.15, -1.0],[0, 1]);
  const wetB = useTransform(wY, [0.15, 1.0],  [0, 1]);

  /* Hover envelope — scales the entire wet border system on hover */
  const wetEnvelope = useSpring(0, { stiffness: 200, damping: 24 });

  /* Combined per-edge opacities */
  const wetRightFinal  = useTransform([wetEnvelope, wetR], ([e, r]: number[]) => e * r);
  const wetLeftFinal   = useTransform([wetEnvelope, wetL], ([e, r]: number[]) => e * r);
  const wetTopFinal    = useTransform([wetEnvelope, wetT], ([e, r]: number[]) => e * r);
  const wetBottomFinal = useTransform([wetEnvelope, wetB], ([e, r]: number[]) => e * r);

  /* Composite box-shadow string — outer glow on the button's own shadow */
  const dynamicBoxShadow = useTransform(
    [wetEnvelope, wetR, wetL, wetT, wetB],
    ([env, r, l, t, b]: number[]) => {
      if (env < 0.01) return "none";
      // Directional glow: offset toward brightest edge
      const ox = (r - l) * 3 * env;
      const oy = (b - t) * 3 * env;
      const spread = 1 + env * 2;
      const intensity = env * 0.55;
      const borderGlow = `0 0 0 1px rgba(255,255,255,${intensity * 0.7})`;
      const outerGlow  = `${ox}px ${oy}px ${6 + env * 6}px rgba(180,215,255,${intensity * 0.45})`;
      const sharpGlow  = `${ox * 0.4}px ${oy * 0.4}px ${spread}px rgba(255,255,255,${intensity * 0.5})`;
      return [borderGlow, outerGlow, sharpGlow].join(", ");
    }
  );

  useEffect(() => {
    if (reduced) return;
    if (!isActive) rawScale.set(pressed ? 0.97 : hovered ? 1.02 : 1);
    else           rawScale.set(1);
    // Drive wet border envelope
    if (!isActive) wetEnvelope.set(hovered ? 1 : 0);
    else           wetEnvelope.set(0);
  }, [hovered, pressed, isActive, reduced, rawScale, wetEnvelope]);

  const trackPointer = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (reduced) return;
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const nx = ((e.clientX - rect.left)  / rect.width  - 0.5) * 2;
      const ny = ((e.clientY - rect.top)   / rect.height - 0.5) * 2;
      // Feed both: parent (for active pill SelectionPill) and local (for reflection)
      onPointerMove(nx, ny);
      localNX.set(nx);
      localNY.set(ny);
    },
    [onPointerMove, reduced, localNX, localNY]
  );

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    setPressed(false);
    onHoverChange(false);
    localNX.set(0);
    localNY.set(0);
  }, [onHoverChange, localNX, localNY]);

  return (
    <motion.button
      ref={ref}
      type="button"
      data-fy={label}
      onClick={onClick}
      onMouseEnter={() => { setHovered(true);  onHoverChange(true);  }}
      onMouseLeave={handleMouseLeave}
      onMouseMove={trackPointer}
      onMouseDown={() => {
        setPressed(true); onPressChange(true);
        if (!isActive) { setRipple(false); requestAnimationFrame(() => setRipple(true)); }
      }}
      onMouseUp={() => { setPressed(false); onPressChange(false); }}
      onTouchStart={() => { setPressed(true);  onPressChange(true);  }}
      onTouchEnd={() =>  { setPressed(false); onPressChange(false); }}
      style={{
        scale: isActive ? undefined : scale,
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        padding: "5px 12px",
        fontSize: "11px",
        fontWeight: isActive ? 600 : 500,
        letterSpacing: isActive ? "0.005em" : "0.01em",
        borderRadius: 9999,
        border: isActive
          ? "1px solid transparent"
          : "1px solid var(--glass-pill-inactive-border)",
        background: isActive
          ? "transparent"
          : "var(--glass-pill-inactive-bg)",
        color: isActive ? "#fff" : "var(--glass-pill-inactive-text)",
        boxShadow: isActive ? "none" : dynamicBoxShadow,
        backdropFilter: isActive ? "none" : (hovered ? "blur(16px) saturate(160%)" : "blur(12px) saturate(140%)"),
        WebkitBackdropFilter: isActive ? "none" : (hovered ? "blur(16px) saturate(160%)" : "blur(12px) saturate(140%)"),
        cursor: "pointer",
        userSelect: "none",
        overflow: "hidden",
        outline: "none",
        whiteSpace: "nowrap",
        zIndex: 2,
        transition: "color 0.22s ease, border-color 0.22s ease, background 0.22s ease, box-shadow 0.22s ease",
      }}
    >
      {/* Glass reflection — all optical layers for inactive buttons */}
      {!isActive && (
        <GlassReflection
          nx={localNX}
          ny={localNY}
          hovered={hovered}
          reduced={reduced}
          isActive={false}
        />
      )}

      {/* ── Wet border inlay ──
          Sits flush against the inner border edge.
          Uses inset box-shadow + a per-edge border gradient to
          paint a bright wet rim on whichever edge the cursor
          is nearest — like light catching on a wet glass rim.
          Rendered inside overflow:hidden so it clips to pill shape. */}
      {!isActive && !reduced && (
        <>
          {/* Right wet rim inlay */}
          <motion.span
            aria-hidden
            style={{
              position: "absolute",
              top: "8%", bottom: "8%", right: 0,
              width: "3px",
              borderRadius: "0 9999px 9999px 0",
              background: "linear-gradient(to left, rgba(255,255,255,0.98) 0%, rgba(220,238,255,0.70) 40%, transparent 100%)",
              opacity: wetRightFinal,
              filter: "blur(0.3px)",
              pointerEvents: "none",
            }}
          />
          {/* Left wet rim inlay */}
          <motion.span
            aria-hidden
            style={{
              position: "absolute",
              top: "8%", bottom: "8%", left: 0,
              width: "3px",
              borderRadius: "9999px 0 0 9999px",
              background: "linear-gradient(to right, rgba(255,255,255,0.98) 0%, rgba(220,238,255,0.70) 40%, transparent 100%)",
              opacity: wetLeftFinal,
              filter: "blur(0.3px)",
              pointerEvents: "none",
            }}
          />
          {/* Top wet rim inlay */}
          <motion.span
            aria-hidden
            style={{
              position: "absolute",
              left: "8%", right: "8%", top: 0,
              height: "3px",
              borderRadius: "9999px 9999px 0 0",
              background: "linear-gradient(to bottom, rgba(255,255,255,0.98) 0%, rgba(220,238,255,0.65) 45%, transparent 100%)",
              opacity: wetTopFinal,
              filter: "blur(0.3px)",
              pointerEvents: "none",
            }}
          />
          {/* Bottom wet rim inlay */}
          <motion.span
            aria-hidden
            style={{
              position: "absolute",
              left: "8%", right: "8%", bottom: 0,
              height: "3px",
              borderRadius: "0 0 9999px 9999px",
              background: "linear-gradient(to top, rgba(190,220,255,0.90) 0%, rgba(210,232,255,0.50) 45%, transparent 100%)",
              opacity: wetBottomFinal,
              filter: "blur(0.3px)",
              pointerEvents: "none",
            }}
          />
        </>
      )}

      {/* Press ripple */}
      <AnimatePresence>
        {!isActive && ripple && (
          <motion.span
            key="ripple"
            aria-hidden
            initial={{ opacity: 0.45, scale: 0.2 }}
            animate={{ opacity: 0, scale: 1.9 }}
            exit={{ opacity: 0 }}
            onAnimationComplete={() => setRipple(false)}
            transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 9999,
              background:
                "radial-gradient(circle, rgba(255,255,255,0.35) 0%, transparent 65%)",
              pointerEvents: "none",
            }}
          />
        )}
      </AnimatePresence>

      <span style={{ position: "relative", zIndex: 3 }}>{label}</span>
    </motion.button>
  );
}

/* ─────────────────────────────────────────────────────────────
   FYTabBar — main export
───────────────────────────────────────────────────────────── */
export default function FYTabBar({ value, onChange }: FYTabBarProps) {
  const scrollRef  = useRef<HTMLDivElement>(null);
  const trackRef   = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const scrollStart= useRef(0);
  const prefersReduced = useReducedMotion();
  const reduced        = prefersReduced ?? false;

  const [showLeftFade,  setShowLeftFade]  = useState(false);
  const [showRightFade, setShowRightFade] = useState(true);
  const [pillRect, setPillRect] = useState<{
    left: number; top: number; width: number; height: number;
  } | null>(null);
  const [activeHovered, setActiveHovered] = useState(false);
  const [activePressed, setActivePressed] = useState(false);

  const pillCurX = useMotionValue(0);
  const pillCurY = useMotionValue(0);

  const measurePill = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const btn = track.querySelector<HTMLElement>(`[data-fy="${value}"]`);
    if (!btn) return;
    const trackRect = track.getBoundingClientRect();
    const btnRect   = btn.getBoundingClientRect();
    setPillRect({
      left:   btnRect.left   - trackRect.left,
      top:    btnRect.top    - trackRect.top,
      width:  btnRect.width,
      height: btnRect.height,
    });
  }, [value]);

  useEffect(() => {
    const t = setTimeout(measurePill, 20);
    return () => clearTimeout(t);
  }, [measurePill]);

  const updateFades = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 4);
    setShowRightFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    measurePill();
  }, [measurePill]);

  const scrollToSelected = useCallback((year: string) => {
    const el = scrollRef.current;
    if (!el) return;
    const btn = el.querySelector<HTMLElement>(`[data-fy="${year}"]`);
    if (!btn) return;
    const offset = btn.offsetLeft - el.clientWidth / 2 + btn.offsetWidth / 2;
    el.scrollTo({ left: offset, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { scrollToSelected(value); updateFades(); }, 100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let raf: number;
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measurePill); };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, [measurePill]);

  const onMouseDown = (e: React.MouseEvent) => {
    isDragging.current  = true;
    dragStartX.current  = e.pageX;
    scrollStart.current = scrollRef.current?.scrollLeft ?? 0;
    if (scrollRef.current) scrollRef.current.style.cursor = "grabbing";
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    e.preventDefault();
    scrollRef.current.scrollLeft = scrollStart.current - (e.pageX - dragStartX.current);
  };
  const onMouseUp = () => {
    isDragging.current = false;
    if (scrollRef.current) scrollRef.current.style.cursor = "grab";
  };

  const handleSelect = (y: string) => { onChange(y); scrollToSelected(y); };

  const handleActivePointerMove = useCallback((nx: number, ny: number) => {
    pillCurX.set(nx);
    pillCurY.set(ny);
  }, [pillCurX, pillCurY]);

  return (
    <div className="glass-tray-full mb-4">
      <span
        className="text-[10px] font-semibold uppercase tracking-widest flex-shrink-0"
        style={{ color: "var(--color-text-faint)", letterSpacing: "0.14em" }}
      >
        Financial Year
      </span>

      <div className="relative flex-1 min-w-0 overflow-hidden">
        <div
          className="pointer-events-none absolute left-0 top-0 h-full w-8 z-10 transition-opacity duration-200"
          style={{
            background: "linear-gradient(to right, var(--glass-tray-bg) 10%, transparent)",
            opacity: showLeftFade ? 1 : 0,
          }}
        />
        <div
          className="pointer-events-none absolute right-0 top-0 h-full w-8 z-10 transition-opacity duration-200"
          style={{
            background: "linear-gradient(to left, var(--glass-tray-bg) 10%, transparent)",
            opacity: showRightFade ? 1 : 0,
          }}
        />

        <div
          ref={scrollRef}
          style={{
            cursor: "grab",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
            overflowX: "auto",
          }}
          onScroll={updateFades}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <div
            ref={trackRef}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 2px",
            }}
          >
            <SelectionPill
              targetRect={pillRect}
              reduced={reduced}
              isHovered={activeHovered}
              isPressed={activePressed}
              cursorX={pillCurX}
              cursorY={pillCurY}
            />

            {FINANCIAL_YEARS.map((y) => (
              <GhostPill
                key={y}
                label={y}
                isActive={value === y}
                onClick={() => handleSelect(y)}
                reduced={reduced}
                onHoverChange={(hov) => { if (value === y) setActiveHovered(hov); }}
                onPressChange={(prs) => { if (value === y) setActivePressed(prs); }}
                onPointerMove={(nx, ny) => { if (value === y) handleActivePointerMove(nx, ny); }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

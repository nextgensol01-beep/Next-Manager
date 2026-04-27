"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, UserCircle, Calendar, ArrowLeftRight,
  Receipt, BarChart2, FileText, ClipboardCheck, Trash2, Mail, X, Settings2,
  Upload, ChevronDown,
} from "lucide-react";
import { cachedFetch } from "@/lib/cache";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
} from "framer-motion";

/* ─────────────────────────────────────────────────────────────
   SPRING CONFIGS
   Vertical pill physics — same philosophy as FYTabBar but
   oriented vertically. Leading edge = top edge (jumps first).
   Trailing edge = bottom edge (follows with inertia).
───────────────────────────────────────────────────────────── */
// Leading (top) edge — snappy
const PILL_LEAD   = { stiffness: 560, damping: 28, mass: 0.65 };
// Trailing (bottom) edge — heavy inertia, produces vertical stretch
const PILL_TRAIL  = { stiffness: 240, damping: 26, mass: 1.6  };
// Opacity / hover springs
const FADE_SPRING = { stiffness: 160, damping: 22, mass: 0.7  };
// Specular highlight — medium lag
const SPEC_SPRING = { stiffness: 90,  damping: 18, mass: 1.0  };
// Rim edge — fast
const RIM_SPRING  = { stiffness: 200, damping: 24, mass: 0.6  };
// Pointer ghost
const PTR_SPRING  = { stiffness: 120, damping: 20, mass: 0.85 };

const navItems = [
  { href: "/dashboard",                     label: "Dashboard",           icon: LayoutDashboard },
  { href: "/dashboard/clients",             label: "Clients",             icon: Users },
  { href: "/dashboard/contacts",            label: "Contacts",            icon: UserCircle },
  { href: "/dashboard/financial-year",      label: "Financial Year",      icon: Calendar },
  { href: "/dashboard/credit-transactions", label: "Credit Transactions", icon: ArrowLeftRight },
  { href: "/dashboard/annual-return",       label: "EPR Annual Return",   icon: ClipboardCheck },
  { href: "/dashboard/billing",             label: "Billing & Payments",  icon: Receipt },
  { href: "/dashboard/reports",             label: "Reports",             icon: BarChart2 },
  { href: "/dashboard/quotation",           label: "Quotation Generator", icon: FileText },
  { href: "/dashboard/settings",            label: "Settings",            icon: Settings2 },
];

const portalOpsItems = [
  { href: "/dashboard/cpcb-uploads/invoice-tracking", label: "Invoice Tracking", icon: FileText },
  { href: "/dashboard/cpcb-uploads/upload-records",   label: "Upload Records",   icon: Upload  },
];

/* ─────────────────────────────────────────────────────────────
   SidebarLinkGlow
   ─────────────────────────────────────────────────────────────
   Cursor-reactive optical overlay for individual nav links.
   4 layers — all clipped to the link's rounded rect:

   L1 — Top dome: static ambient highlight at top edge
   L2 — Specular slide: cursor-following bright ellipse
   L3 — Pointer ghost: very faint inward-offset spot (~4%)
   L4 — Left/right edge rims: Fresnel brightening on approach

   Only renders when hovered (opacity envelope prevents cost
   when cursor is elsewhere).
───────────────────────────────────────────────────────────── */
interface SidebarLinkGlowProps {
  nx: ReturnType<typeof useMotionValue<number>>;
  ny: ReturnType<typeof useMotionValue<number>>;
  hovered: boolean;
  reduced: boolean;
  isActive: boolean;
}

function SidebarLinkGlow({ nx, ny, hovered, reduced, isActive }: SidebarLinkGlowProps) {
  /* ── Per-layer springs with different personalities ── */
  const sX = useSpring(nx, SPEC_SPRING);
  const sY = useSpring(ny, SPEC_SPRING);
  const pX = useSpring(nx, PTR_SPRING);
  const pY = useSpring(ny, PTR_SPRING);
  const rX = useSpring(nx, RIM_SPRING);

  /* ── L2: Specular position ──
     For sidebar links (wider than tall) the X range is wider,
     Y range is tighter — light slides left/right more than up/down. */
  const specLeft = useTransform(sX, [-1, 1], ["15%", "85%"]);
  const specTop  = useTransform(sY, [-1, 1], ["0%",  "80%"]);

  /* ── L3: Pointer ghost — pulled inward so it reads as a
     reflection of the cursor inside the glass surface ── */
  const ghostLeft = useTransform(pX, [-1, 1], ["28%", "72%"]);
  const ghostTop  = useTransform(pY, [-1, 1], ["15%", "70%"]);

  /* ── L4: Edge rims — proximity-driven ── */
  const rimRight = useTransform(rX, [0.35, 1.0], [0, 0.52]);
  const rimLeft  = useTransform(rX, [-0.35, -1.0], [0, 0.52]);

  /* ── Opacity envelopes ── */
  const specOpacity  = useSpring(0, FADE_SPRING);
  const ghostOpacity = useSpring(0, FADE_SPRING);
  const rimEnvelope  = useSpring(0, FADE_SPRING);

  useEffect(() => {
    if (reduced) return;
    specOpacity.set(hovered ? (isActive ? 0.65 : 0.32) : 0);
    ghostOpacity.set(hovered ? 0.03 : 0);
    rimEnvelope.set(hovered ? 1 : 0);
  }, [hovered, isActive, reduced, specOpacity, ghostOpacity, rimEnvelope]);

  /* ── Hoisted combined rim opacities (no hooks in JSX) ── */
  const rimRightOpacity = useTransform(
    [rimEnvelope, rimRight] as const,
    ([env, rim]: number[]) => env * rim
  );
  const rimLeftOpacity = useTransform(
    [rimEnvelope, rimLeft] as const,
    ([env, rim]: number[]) => env * rim
  );

  /* ── Reset on leave ── */
  useEffect(() => {
    if (!hovered || reduced) { nx.set(0); ny.set(0); }
  }, [hovered, reduced, nx, ny]);

  if (reduced) return null;

  return (
    <>
      {/* L1 — Top dome: only visible on hover, driven by specOpacity envelope ──
           Active pill has its own always-on dome inside SidebarPill.
           Inactive links: dome fades in with hover, never shown at rest. */}
      <motion.span
        aria-hidden
        style={{
          position: "absolute",
          top: 0, left: "4%", right: "4%",
          height: "55%",
          borderRadius: "9999px 9999px 50% 50%",
          background: "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 55%, transparent 80%)",
          opacity: specOpacity,
          pointerEvents: "none",
        }}
      />

      {/* L2 — Specular slide */}
      <motion.span
        aria-hidden
        style={{
          position: "absolute",
          width: "50%",
          height: "160%",
          left: specLeft,
          top: specTop,
          x: "-50%",
          y: "-50%",
          borderRadius: "50%",
          background: "radial-gradient(ellipse 55% 45% at 50% 35%, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.28) 38%, rgba(200,225,255,0.06) 68%, transparent 82%)",
          opacity: specOpacity,
          filter: "blur(3.5px)",
          mixBlendMode: "overlay",
          pointerEvents: "none",
        }}
      />

      {/* L3 — Pointer ghost */}
      <motion.span
        aria-hidden
        style={{
          position: "absolute",
          width: "28%",
          height: "120%",
          left: ghostLeft,
          top: ghostTop,
          x: "-50%",
          y: "-50%",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.90) 0%, rgba(220,235,255,0.40) 45%, transparent 72%)",
          opacity: ghostOpacity,
          filter: "blur(9px)",
          pointerEvents: "none",
        }}
      />

      {/* L4 — Right rim */}
      <motion.span
        aria-hidden
        style={{
          position: "absolute",
          top: "10%", bottom: "10%", right: 0,
          width: "22%",
          borderRadius: "0 9999px 9999px 0",
          background: "linear-gradient(to left, rgba(255,255,255,0.48) 0%, rgba(180,210,255,0.10) 60%, transparent 100%)",
          opacity: rimRightOpacity,
          pointerEvents: "none",
        }}
      />

      {/* L4 — Left rim */}
      <motion.span
        aria-hidden
        style={{
          position: "absolute",
          top: "10%", bottom: "10%", left: 0,
          width: "22%",
          borderRadius: "9999px 0 0 9999px",
          background: "linear-gradient(to right, rgba(255,255,255,0.48) 0%, rgba(180,210,255,0.10) 60%, transparent 100%)",
          opacity: rimLeftOpacity,
          pointerEvents: "none",
        }}
      />

      {/* L5 — Inner depth glow (active pill only via SidebarPill; here only for hover) */}
      {isActive && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            background: "radial-gradient(ellipse 85% 60% at 50% 110%, rgba(0,113,227,0.18) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   SidebarPill
   ─────────────────────────────────────────────────────────────
   Directional dual-edge physics — the leading edge always moves
   in the direction of travel:

   Moving DOWN (new top > current top):
     bottom edge = FAST (PILL_LEAD) — jumps ahead
     top edge    = SLOW (PILL_TRAIL) — follows with inertia
     pill.top    = topEdge  (slow)
     pill.height = bottomEdge − topEdge  (stretches downward)

   Moving UP (new top < current top):
     top edge    = FAST (PILL_LEAD) — jumps ahead
     bottom edge = SLOW (PILL_TRAIL) — follows with inertia
     pill.top    = topEdge  (fast)
     pill.height = bottomEdge − topEdge  (stretches upward)

   Direction is determined by comparing the new target top
   against the last known target top on each navigation.

   Option A: instant snap on first mount — no spring animation.
───────────────────────────────────────────────────────────── */
interface PillRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface SidebarPillProps {
  targetRect: PillRect | null;
  reduced: boolean;
  isHovered: boolean;
  cursorNX: ReturnType<typeof useMotionValue<number>>;
  cursorNY: ReturnType<typeof useMotionValue<number>>;
}

function SidebarPill({ targetRect, reduced, isHovered, cursorNX, cursorNY }: SidebarPillProps) {
  const hasMounted   = useRef(false);
  const lastTop      = useRef<number | null>(null); // tracks previous target top for direction

  const reducedCfg = { stiffness: 300, damping: 40, mass: 1 };

  /* ── Four independent edge springs ──
     topEdge and bottomEdge each have their OWN spring instance.
     On each navigation we swap which one gets PILL_LEAD vs PILL_TRAIL
     by calling .set() on the underlying MotionValue — Framer Motion
     re-animates the spring from its current live position toward the
     new target, so the swap happens seamlessly mid-flight.            */
  const topTarget    = useMotionValue(targetRect?.top ?? 0);
  const bottomTarget = useMotionValue((targetRect?.top ?? 0) + (targetRect?.height ?? 0));
  const leftTarget   = useMotionValue(targetRect?.left ?? 0);
  const widthTarget  = useMotionValue(targetRect?.width ?? 0);

  // Two springs per axis — one fast, one slow.
  // We drive BOTH with the same target but control which one
  // the pill's top/height reads from based on direction.
  const topFast    = useSpring(topTarget,    reduced ? reducedCfg : PILL_LEAD);
  const topSlow    = useSpring(topTarget,    reduced ? reducedCfg : PILL_TRAIL);
  const bottomFast = useSpring(bottomTarget, reduced ? reducedCfg : PILL_LEAD);
  const bottomSlow = useSpring(bottomTarget, reduced ? reducedCfg : PILL_TRAIL);
  const left       = useSpring(leftTarget,   { stiffness: 300, damping: 35, mass: 0.8 });
  const width      = useSpring(widthTarget,  { stiffness: 300, damping: 35, mass: 0.8 });

  /* ── Direction state — which edge pair to read ── */
  // "down" = bottom leads; "up" = top leads
  const [goingDown, setGoingDown] = useState(false);

  /* ── Derived pill position from the correct edge pair ──
     When going down: top = topSlow,    height = bottomFast − topSlow
     When going up:   top = topFast,    height = bottomSlow − topFast  */
  const pillTop = useTransform(
    [topFast, topSlow] as const,
    ([fast, slow]: number[]) => goingDown ? slow : fast
  );
  const pillHeight = useTransform(
    [topFast, topSlow, bottomFast, bottomSlow] as const,
    ([tFast, tSlow, bFast, bSlow]: number[]) => {
      const top    = goingDown ? tSlow : tFast;
      const bottom = goingDown ? bFast : bSlow;
      return Math.max(bottom - top, 4);
    }
  );

  /* ── Drive springs on target change ── */
  useEffect(() => {
    if (!targetRect) return;
    const newTop    = targetRect.top;
    const newBottom = targetRect.top + targetRect.height;

    if (!hasMounted.current) {
      // Option A: instant teleport on first render, no animation
      topTarget.set(newTop);      topFast.set(newTop);    topSlow.set(newTop);
      bottomTarget.set(newBottom); bottomFast.set(newBottom); bottomSlow.set(newBottom);
      leftTarget.set(targetRect.left);   left.set(targetRect.left);
      widthTarget.set(targetRect.width); width.set(targetRect.width);
      lastTop.current    = newTop;
      hasMounted.current = true;
    } else {
      // Determine direction from last known target top
      const movingDown = lastTop.current !== null && newTop > lastTop.current;
      setGoingDown(movingDown);
      lastTop.current = newTop;

      // Drive all four springs to the new target —
      // pillTop/pillHeight derivations pick the right ones based on goingDown
      topTarget.set(newTop);
      bottomTarget.set(newBottom);
      leftTarget.set(targetRect.left);
      widthTarget.set(targetRect.width);
    }
  }, [targetRect, topTarget, bottomTarget, leftTarget, widthTarget,
      topFast, topSlow, bottomFast, bottomSlow, left, width]);

  /* ── Opacity — fades in once mounted ── */
  const pillOpacity = useSpring(0, FADE_SPRING);
  useEffect(() => {
    if (targetRect) pillOpacity.set(1);
    else            pillOpacity.set(0);
  }, [targetRect, pillOpacity]);

  if (!targetRect) return null;

  return (
    <motion.div
      aria-hidden
      style={{
        position: "absolute",
        top: pillTop,
        left,
        width,
        height: pillHeight,
        opacity: pillOpacity,
        borderRadius: "10px",
        pointerEvents: "none",
        zIndex: 0,
        willChange: "top, height",
      }}
    >
      {/* Glass surface */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "10px",
          overflow: "hidden",
          background: "var(--glass-pill-active-bg)",
          border: "1px solid var(--glass-pill-active-border)",
          boxShadow: "var(--glass-pill-active-glow)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
        }}
      >
        {/* Active pill gets full GlassReflection treatment */}
        <SidebarLinkGlow
          nx={cursorNX}
          ny={cursorNY}
          hovered={isHovered}
          reduced={reduced}
          isActive={true}
        />

        {/* Always-on top edge line */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 0, left: "8%", right: "8%",
            height: "1px",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.60) 50%, transparent)",
            pointerEvents: "none",
          }}
        />

        {/* Always-on top dome */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "10px",
            background: "radial-gradient(ellipse 90% 55% at 50% -5%, rgba(255,255,255,0.22) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        {/* Brand blue bottom glow */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "10px",
            background: "radial-gradient(ellipse at 50% 110%, rgba(0,113,227,0.22) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────
   NavLink — individual nav item with hover optics
───────────────────────────────────────────────────────────── */
interface NavLinkProps {
  href: string;
  label: string;
  icon: React.ElementType;
  isActive: boolean;
  reduced: boolean;
  onPointerMove: (nx: number, ny: number) => void;
  onHoverChange: (hovered: boolean) => void;
  children?: React.ReactNode;
}

function NavLink({ href, label, icon: Icon, isActive, reduced, onPointerMove, onHoverChange, children }: NavLinkProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [hovered, setHovered] = useState(false);
  const localNX = useMotionValue(0);
  const localNY = useMotionValue(0);

  const trackPointer = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    if (reduced) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const nx = ((e.clientX - rect.left) / rect.width  - 0.5) * 2;
    const ny = ((e.clientY - rect.top)  / rect.height - 0.5) * 2;
    localNX.set(nx);
    localNY.set(ny);
    if (isActive) onPointerMove(nx, ny);
  }, [reduced, isActive, onPointerMove, localNX, localNY]);

  const handleEnter = useCallback(() => {
    setHovered(true);
    onHoverChange(true);
  }, [onHoverChange]);

  const handleLeave = useCallback(() => {
    setHovered(false);
    onHoverChange(false);
    localNX.set(0);
    localNY.set(0);
    if (isActive) onPointerMove(0, 0);
  }, [onHoverChange, isActive, onPointerMove, localNX, localNY]);

  /* ── Hover bg opacity — fades in a subtle glass surface on hover ── */
  const hoverBgOpacity = useSpring(0, FADE_SPRING);
  useEffect(() => {
    hoverBgOpacity.set(hovered && !isActive ? 1 : 0);
  }, [hovered, isActive, hoverBgOpacity]);

  return (
    <Link
      ref={ref}
      href={href}
      data-nav={href}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onMouseMove={trackPointer}
      className="sidebar-nav-link"
      style={{
        color: isActive ? "#ffffff" : undefined,
        fontWeight: isActive ? 600 : undefined,
        position: "relative",
        zIndex: 1,
      }}
    >
      {/* Hover glass surface for inactive links */}
      {!isActive && (
        <motion.span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            overflow: "hidden",
            pointerEvents: "none",
            background: "var(--sidebar-hover-bg)",
            opacity: hoverBgOpacity,
          }}
        >
          <SidebarLinkGlow
            nx={localNX}
            ny={localNY}
            hovered={hovered}
            reduced={reduced}
            isActive={false}
          />
        </motion.span>
      )}
      <Icon className="w-4 h-4 flex-shrink-0" />
      {children ?? label}
    </Link>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main Sidebar
───────────────────────────────────────────────────────────── */
interface Props { open: boolean; onClose: () => void; }

export default function Sidebar({ open, onClose }: Props) {
  const pathname    = usePathname();
  const prefersReduced  = useReducedMotion();
  const reduced         = prefersReduced ?? false;

  const [trashCount, setTrashCount]       = useState(0);
  const [emailCount, setEmailCount]       = useState(0);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerRendered, setDrawerRendered] = useState(false);
  const portalOpsActive = portalOpsItems.some(({ href }) => pathname.startsWith(href));
  const [portalOpsOpen, setPortalOpsOpen] = useState(portalOpsActive);

  /* ── Pill measurement ── */
  const navRef     = useRef<HTMLElement>(null);
  const [pillRect, setPillRect] = useState<PillRect | null>(null);
  const [activeHovered, setActiveHovered] = useState(false);
  const pillCurNX  = useMotionValue(0);
  const pillCurNY  = useMotionValue(0);

  const measurePill = useCallback((currentPortalOpsOpen?: boolean) => {
    const nav = navRef.current;
    if (!nav) return;

    // Determine whether accordion is open — use the passed value if provided
    // (handles the case where state hasn't updated yet when called from toggle)
    const accordionOpen = currentPortalOpsOpen ?? portalOpsOpen;

    // Find active link by data-nav attribute matching current pathname
    let activeHref: string | null = null;

    // Check main nav items
    for (const item of navItems) {
      const isActive = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
      if (isActive) { activeHref = item.href; break; }
    }

    // Check portal ops items — but ONLY if the accordion is open.
    // If closed + a sub-item is active, fall through to cpcb-parent below.
    if (!activeHref && accordionOpen) {
      for (const item of portalOpsItems) {
        if (pathname.startsWith(item.href)) { activeHref = item.href; break; }
      }
    }

    // Check system links
    if (!activeHref) {
      if (pathname.startsWith("/dashboard/email-history")) activeHref = "/dashboard/email-history";
      else if (pathname.startsWith("/dashboard/trash"))    activeHref = "/dashboard/trash";
    }

    // If any portal ops sub-item is active (accordion open or closed),
    // show pill on cpcb-parent when accordion is closed
    if (!activeHref && portalOpsActive) activeHref = "cpcb-parent";

    if (!activeHref) { setPillRect(null); return; }

    const el = nav.querySelector<HTMLElement>(`[data-nav="${activeHref}"]`);
    if (!el) { setPillRect(null); return; }

    // Guard: if element has no height (hidden in collapsed accordion), skip
    const elRect  = el.getBoundingClientRect();
    if (elRect.height === 0) {
      // Try cpcb-parent as fallback
      const parent = nav.querySelector<HTMLElement>(`[data-nav="cpcb-parent"]`);
      if (!parent) { setPillRect(null); return; }
      const navRect2 = nav.getBoundingClientRect();
      const pRect    = parent.getBoundingClientRect();
      setPillRect({
        top: pRect.top - navRect2.top, left: pRect.left - navRect2.left,
        width: pRect.width, height: pRect.height,
      });
      return;
    }

    const navRect = nav.getBoundingClientRect();
    setPillRect({
      top:    elRect.top    - navRect.top,
      left:   elRect.left   - navRect.left,
      width:  elRect.width,
      height: elRect.height,
    });
  }, [pathname, portalOpsActive, portalOpsOpen]);

  // Measure on pathname change and when portal ops accordion opens/closes
  useEffect(() => {
    const t = setTimeout(measurePill, 30);
    return () => clearTimeout(t);
  }, [measurePill, portalOpsOpen]);

  // Re-measure on window resize
  useEffect(() => {
    window.addEventListener("resize", measurePill, { passive: true });
    return () => window.removeEventListener("resize", measurePill);
  }, [measurePill]);

  useEffect(() => { onClose(); }, [pathname, onClose]);

  useEffect(() => {
    if (portalOpsActive) setPortalOpsOpen(true);
  }, [portalOpsActive]);

  useEffect(() => {
    if (open) {
      setDrawerRendered(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setDrawerVisible(true)));
    } else {
      setDrawerVisible(false);
      const t = setTimeout(() => setDrawerRendered(false), 260);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    cachedFetch<unknown[]>("/api/trash?type=all")
      .then((d) => { if (Array.isArray(d)) setTrashCount(d.length); }).catch(() => {});
    cachedFetch<unknown[]>("/api/email-log")
      .then((d) => { if (Array.isArray(d)) setEmailCount(d.length); }).catch(() => {});
  }, [pathname]);

  const handleActivePtrMove = useCallback((nx: number, ny: number) => {
    pillCurNX.set(nx);
    pillCurNY.set(ny);
  }, [pillCurNX, pillCurNY]);

  const handleActiveHoverChange = useCallback((h: boolean) => {
    setActiveHovered(h);
    if (!h) { pillCurNX.set(0); pillCurNY.set(0); }
  }, [pillCurNX, pillCurNY]);

  // Is CPCB parent button the active indicator?
  // Button should appear active (white text) whenever:
  // 1. A portal ops sub-item is active but accordion is closed — pill sits on cpcb-parent
  // 2. No sub-item is active but portalOpsActive is true (direct /cpcb-uploads route)
  // i.e. any time the pill is on the cpcb-parent button
  const cpcbParentActive = portalOpsActive && !portalOpsOpen;

  const content = (
    <aside
      className="sidebar-panel w-[256px] flex-shrink-0 flex flex-col h-full"
      style={{ overflow: "hidden" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b sidebar-divider">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0"
            style={{ background: "#0071e3", boxShadow: "0 3px 10px rgba(0,113,227,0.35)" }}
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <div>
            <p className="sidebar-text-primary font-semibold text-[13px] leading-tight" style={{ letterSpacing: "-0.01em" }}>Nextgen Solutions</p>
            <p className="sidebar-text-faint text-[11px] mt-0.5">EPR Consultancy</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 rounded-lg sidebar-text-muted transition-all duration-150 active:scale-90 hover:bg-[var(--sidebar-hover-bg)]"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav — position:relative so SidebarPill can be absolutely positioned */}
      <nav ref={navRef} className="flex-1 p-3 space-y-0.5 overflow-hidden" style={{ position: "relative" }}>

        {/* The sliding glass pill — sits at z-index 0, links at z-index 1 */}
        <SidebarPill
          targetRect={pillRect}
          reduced={reduced}
          isHovered={activeHovered}
          cursorNX={pillCurNX}
          cursorNY={pillCurNY}
        />

        <p className="sidebar-text-faint text-[10px] font-semibold uppercase tracking-widest px-3 mb-1.5" style={{ position: "relative", zIndex: 2 }}>
          Navigation
        </p>

        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
          return (
            <NavLink
              key={href}
              href={href}
              label={label}
              icon={Icon}
              isActive={isActive}
              reduced={reduced}
              onPointerMove={handleActivePtrMove}
              onHoverChange={isActive ? handleActiveHoverChange : () => {}}
            />
          );
        })}

        {/* Portal Operations section */}
        <div className="pt-4 pb-1" style={{ position: "relative", zIndex: 2 }}>
          <p className="sidebar-text-faint text-[10px] font-semibold uppercase tracking-widest px-4">Portal Operations</p>
        </div>

        {/* CPCB parent accordion button */}
        <button
          type="button"
          data-nav="cpcb-parent"
          onClick={() => {
            const next = !portalOpsOpen;
            setPortalOpsOpen(next);
            // Pass the new value directly — React state update is async
            // so measurePill would read the stale value without this
            setTimeout(() => measurePill(next), 310); // after accordion animation
          }}
          aria-expanded={portalOpsOpen}
          style={{
            position: "relative",
            zIndex: 1,
            color: cpcbParentActive ? "#ffffff" : undefined,
            fontWeight: cpcbParentActive ? 600 : undefined,
          }}
          className={cn("sidebar-nav-link w-full justify-between")}
        >
          <span className="flex items-center gap-3">
            <Upload className="w-4 h-4 flex-shrink-0" />
            CPCB Uploads
          </span>
          <ChevronDown
            className="w-4 h-4 flex-shrink-0 transition-transform duration-200"
            style={{ transform: portalOpsOpen ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </button>

        {/* Accordion content */}
        <div
          className="overflow-hidden transition-all duration-300 ease-out"
          style={{
            maxHeight: portalOpsOpen ? "160px" : "0px",
            opacity: portalOpsOpen ? 1 : 0,
            position: "relative",
            zIndex: 2,
          }}
          aria-hidden={!portalOpsOpen}
        >
          <div
            className="mt-1 mb-2 space-y-1 pl-4 transition-all duration-300 ease-out"
            style={{ transform: portalOpsOpen ? "translateY(0)" : "translateY(-8px)" }}
          >
            {portalOpsItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname.startsWith(href);
              return (
                <NavLink
                  key={href}
                  href={href}
                  label={label}
                  icon={Icon}
                  isActive={isActive}
                  reduced={reduced}
                  onPointerMove={handleActivePtrMove}
                  onHoverChange={isActive ? handleActiveHoverChange : () => {}}
                />
              );
            })}
          </div>
        </div>

        {/* System section */}
        <div className="pt-4 pb-1" style={{ position: "relative", zIndex: 2 }}>
          <p className="sidebar-text-faint text-[10px] font-semibold uppercase tracking-widest px-4">System</p>
        </div>

        {/* Email History */}
        <NavLink
          href="/dashboard/email-history"
          label="Email History"
          icon={Mail}
          isActive={pathname.startsWith("/dashboard/email-history")}
          reduced={reduced}
          onPointerMove={handleActivePtrMove}
          onHoverChange={pathname.startsWith("/dashboard/email-history") ? handleActiveHoverChange : () => {}}
        >
          <span className="flex-1">Email History</span>
          {emailCount > 0 && (
            <span
              className="sidebar-badge-blue"
              style={pathname.startsWith("/dashboard/email-history") ? {
                background: "rgba(255,255,255,0.22)",
                color: "#ffffff",
              } : undefined}
            >
              {emailCount}
            </span>
          )}
        </NavLink>

        {/* Trash */}
        <NavLink
          href="/dashboard/trash"
          label="Recycle Bin"
          icon={Trash2}
          isActive={pathname.startsWith("/dashboard/trash")}
          reduced={reduced}
          onPointerMove={handleActivePtrMove}
          onHoverChange={pathname.startsWith("/dashboard/trash") ? handleActiveHoverChange : () => {}}
        >
          <span className="flex-1">Recycle Bin</span>
          {trashCount > 0 && (
            <span
              className="sidebar-badge-red"
              style={pathname.startsWith("/dashboard/trash") ? {
                background: "rgba(255,255,255,0.22)",
                color: "#ffffff",
              } : undefined}
            >
              {trashCount}
            </span>
          )}
        </NavLink>
      </nav>

      <div className="border-t sidebar-divider p-4">
        <p className="sidebar-text-faint text-xs text-center">v2.0.0 · Internal Use Only</p>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop: always visible */}
      <div className="hidden lg:flex h-screen flex-shrink-0">{content}</div>

      {/* Mobile: animated slide-in drawer */}
      {drawerRendered && (
        <>
          <div
            className="fixed inset-0 z-40 lg:hidden"
            style={{
              backgroundColor: drawerVisible ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0)",
              backdropFilter: drawerVisible ? "blur(2px)" : "none",
              transition: "background-color 0.25s, backdrop-filter 0.25s",
            }}
            onClick={onClose}
          />
          <div
            className="fixed inset-y-0 left-0 z-50 flex lg:hidden h-full"
            style={{
              transform: drawerVisible ? "translateX(0)" : "translateX(-100%)",
              transition: "transform 0.26s cubic-bezier(0.32, 0.72, 0, 1)",
              boxShadow: drawerVisible ? "4px 0 32px rgba(0,0,0,0.25)" : "none",
            }}
          >
            {content}
          </div>
        </>
      )}
    </>
  );
}

"use client";

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useIsPresent, useMotionValue, useSpring, useTransform, type Variants } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";

type Direction = "previous" | "next";
type Page = { title: string; description: string };
type Commit = { source: number; destination: number; title: string; direction: Direction; keyboard: boolean };
const ease = [0.22, 1, 0.36, 1] as const;

/** Editor-owned state. The dock only receives destinations and an immutable visual commit. */
export function useWorkflowStepNavigation(workflowId: string, startPage: number, pages: Page[], reduceMotion: boolean) {
  const [setupPage, setSetupPage] = useState(startPage);
  const [stepDirection, setStepDirection] = useState<1 | -1>(1);
  const [commit, setCommit] = useState<Commit | null>(null);
  const pending = useRef<Commit | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cancel = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    pending.current = null;
    setCommit(null);
  }, []);

  useEffect(() => {
    cancel();
    setSetupPage(startPage);
    setStepDirection(1);
    return () => {
      timers.current.forEach(clearTimeout);
      pending.current = null;
    };
  }, [workflowId, startPage, cancel]);

  const navigateToStep = (target: number) => {
    if (target < 0 || target >= pages.length) return;
    // Direct stepper selection supersedes any delayed arrow handoff.
    cancel();
    setStepDirection(target >= setupPage ? 1 : -1);
    setSetupPage(target);
  };
  const navigateStep = (direction: Direction, keyboard = false) => {
    if (pending.current) return;
    const destination = setupPage + (direction === "next" ? 1 : -1);
    if (destination < 0 || destination >= pages.length) return;
    // Existing validation belongs to Save; moving between steps has no validation gate.
    const snapshot: Commit = { source: setupPage, destination, title: pages[destination].title, direction, keyboard };
    pending.current = snapshot;
    setCommit(snapshot);
    const handoff = () => {
      if (pending.current !== snapshot) return;
      setStepDirection(direction === "next" ? 1 : -1);
      setSetupPage(snapshot.destination);
    };
    if (reduceMotion) {
      handoff();
      timers.current = [setTimeout(cancel, 100)];
    } else {
      // The outgoing object survives the canonical step change until its own fade finishes.
      // Neither handoff nor unlocking relies on AnimatePresence completion callbacks.
      timers.current = [setTimeout(handoff, 140), setTimeout(cancel, 440)];
    }
  };
  return { setupPage, stepDirection, commit, navigateToStep, navigateStep };
}

export function WorkflowStepNavigationDock({ page, pages, commit, onNavigate, reduceMotion }: {
  page: number; pages: Page[]; commit: Commit | null;
  onNavigate: (direction: Direction, keyboard: boolean) => void; reduceMotion: boolean;
}) {
  const destinations = commit
    ? [{ direction: commit.direction, page: commit.destination, title: commit.title }]
    : (["previous", "next"] as const).flatMap(direction => {
        const target = page + (direction === "next" ? 1 : -1);
        return target >= 0 && target < pages.length ? [{ direction, page: target, title: pages[target].title }] : [];
      });
  return (
    <nav className="workflow-nav-dock" aria-label="Workflow steps" aria-busy={!!commit}>
      {destinations.map(destination => (
        <LiquidNavControl key={`${commit?.source ?? page}-${destination.direction}`}
          direction={destination.direction} title={destination.title} committing={!!commit}
          reduceMotion={reduceMotion} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

function LiquidNavControl({ direction, title, committing, onNavigate, reduceMotion }: {
  direction: Direction; title: string; committing: boolean; reduceMotion: boolean;
  onNavigate: (direction: Direction, keyboard: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const labelRef = useRef<HTMLSpanElement>(null);
  const [labelWidth, setLabelWidth] = useState(80);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const x = useSpring(pointerX, { stiffness: 190, damping: 24 });
  const y = useSpring(pointerY, { stiffness: 190, damping: 24 });
  const lightX = useTransform(x, value => `${50 + value * 6}%`);
  const sign = direction === "next" ? 1 : -1;
  const expanded = hovered || focused || committing;
  useLayoutEffect(() => {
    const label = labelRef.current;
    if (!label) return;
    const measure = () => setLabelWidth(label.getBoundingClientRect().width);
    const observer = new ResizeObserver(measure);
    observer.observe(label);
    measure();
    return () => observer.disconnect();
  }, [title]);
  useEffect(() => {
    if (committing || reduceMotion) { pointerX.set(0); pointerY.set(0); }
  }, [committing, reduceMotion, pointerX, pointerY]);
  const width = 44 + labelWidth + 20;
  return (
    <motion.button type="button" className={`workflow-nav-control is-${direction}`}
      aria-label={`Go to ${title}`} disabled={committing}
      onClick={event => onNavigate(direction, event.detail === 0)}
      onPointerEnter={event => { if (event.pointerType !== "touch") setHovered(true); }}
      onPointerLeave={() => { setHovered(false); pointerX.set(0); pointerY.set(0); }}
      onPointerMove={event => {
        if (reduceMotion || committing || event.pointerType === "touch") return;
        const rect = event.currentTarget.getBoundingClientRect();
        pointerX.set(Math.max(-3, Math.min(3, (event.clientX - rect.left - rect.width / 2) / rect.width * 6)));
        pointerY.set(Math.max(-2, Math.min(2, (event.clientY - rect.top - rect.height / 2) / rect.height * 4)));
      }}
      onFocus={event => setFocused(event.currentTarget.matches(":focus-visible"))}
      onBlur={() => setFocused(false)}
      style={{ x: reduceMotion ? 0 : x, y: reduceMotion ? 0 : y, transformOrigin: direction === "next" ? "right center" : "left center" }}
      initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.94 }}
      animate={committing ? { opacity: [1, 1, 0], scale: 1, width } : { opacity: 1, scale: 1, width: expanded ? width : 44 }}
      transition={{ ...(committing ? { duration: reduceMotion ? 0.1 : 0.44, times: [0, 0.75, 1] } : { duration: 0.2 }),
        width: { duration: reduceMotion ? 0.1 : committing ? 0.12 : 0.3, delay: committing || reduceMotion ? 0 : expanded ? 0.035 : 0.08, ease } }}>
      <motion.span className="workflow-nav-material" aria-hidden="true"
        style={{ "--workflow-nav-light-x": lightX, transformOrigin: direction === "next" ? "right center" : "left center" } as React.CSSProperties}
        initial={false}
        animate={{
          width: expanded ? width : 44,
          "--neck": reduceMotion || committing ? "0px" : expanded ? ["0px", "3px", "1px", "0px"] : ["0px", "2px", "0px"],
          height: !reduceMotion && expanded && !committing ? [44, 42, 40, 44] : 44,
          borderRadius: !reduceMotion && expanded && !committing ? [22, 24, 18, 22] : 22,
          scaleX: committing && !reduceMotion ? [1, 0.97, 1, 1.045, 1.01] : 1,
          scaleY: committing && !reduceMotion ? [1, 0.97, 1, 0.99, 1] : 1,
          x: committing && !reduceMotion ? [0, 0, 0, sign * 4, sign * 2] : 0,
          boxShadow: committing && !reduceMotion
            ? ["0 7px 20px rgba(20,30,45,.10)", "0 3px 9px rgba(20,30,45,.13)", "0 7px 20px rgba(20,30,45,.12)", "0 9px 24px rgba(20,30,45,.10)", "0 7px 20px rgba(20,30,45,.04)"]
            : "0 7px 20px rgba(20,30,45,.10), inset 0 1px 0 var(--workflow-nav-rim)",
        }}
        transition={{ duration: reduceMotion ? 0.1 : committing ? 0.4 : 0.32, ease,
          ...(committing ? { times: [0, 0.175, 0.35, 0.65, 1] } : {}),
          width: { duration: reduceMotion ? 0.1 : committing ? 0.12 : 0.3, delay: committing || reduceMotion ? 0 : expanded ? 0.035 : 0.08, ease } }}>
        <span className="workflow-nav-fluid">
          {!reduceMotion && ["violet", "blue", "cyan", "pink"].map((color, index) => (
            <motion.span key={color} className={`workflow-nav-dye is-${color}`} initial={false}
              style={{ left: `${12 + index * 15}%` }}
              animate={committing ? {
                x: [sign * -22, sign * -12, sign * 14, sign * 40, sign * 56],
                scale: [0.8, 1.1, 0.92, 1.2, 1.3],
                opacity: [0.06, 0.15, 0.34 - index * 0.025, 0.13, 0],
              } : { x: 0, scale: expanded ? 1.1 : 0.8, opacity: expanded ? 0.12 : 0 }}
              transition={{ duration: committing ? 0.34 : 0.24, delay: committing ? 0.055 + index * 0.012 : 0, ...(committing ? { times: [0, 0.16, 0.32, 0.65, 1] } : {}), ease: "easeInOut" }} />
          ))}
        </span>
        <span className="workflow-nav-highlight" />
        <motion.span className="workflow-nav-title" initial={false}
          animate={{ opacity: expanded ? 1 : 0, filter: expanded || reduceMotion ? "blur(0px)" : "blur(3px)", x: expanded || reduceMotion ? 0 : sign * 3 }}
          transition={{ duration: reduceMotion ? 0.1 : 0.14, delay: expanded && !reduceMotion ? committing ? 0.07 : 0.13 : 0 }}>
          <span ref={labelRef}>{title}</span>
        </motion.span>
        <motion.span className="workflow-nav-arrow" initial={false}
          animate={{ x: committing && !reduceMotion ? -sign * 5 : 0, scale: expanded && !reduceMotion && !committing ? [1, 0.96, 1] : 1 }}
          transition={{ duration: committing ? 0.12 : 0.14 }}>
          {direction === "next" ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
        </motion.span>
      </motion.span>
    </motion.button>
  );
}

const contentVariants: Variants = {
  enter: ({ direction, reduced }) => ({ opacity: 0, x: reduced ? 0 : direction * 14, scale: reduced ? 1 : 0.992, filter: reduced ? "blur(0px)" : "blur(3px)" }),
  visible: ({ reduced }) => ({ opacity: 1, x: 0, scale: 1, filter: "blur(0px)", transition: { duration: reduced ? 0.1 : 0.24, delay: reduced ? 0 : 0.09, ease } }),
  leave: ({ direction, reduced }) => ({ opacity: 0, x: reduced ? 0 : direction * -10, scale: reduced ? 1 : 0.992, filter: reduced ? "blur(0px)" : "blur(3px)", transition: { duration: reduced ? 0.1 : 0.19, ease } }),
};

const aboutContentVariants: Variants = {
  enter: ({ reduced }) => ({ opacity: 0, y: reduced ? 0 : 8, filter: reduced ? "blur(0px)" : "blur(2px)" }),
  visible: ({ reduced }) => ({ opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: reduced ? 0.1 : 0.32, ease } }),
  leave: ({ reduced }) => ({ opacity: 0, y: reduced ? 0 : -4, filter: reduced ? "blur(0px)" : "blur(1px)", transition: { duration: reduced ? 0.1 : 0.18, ease } }),
};

// Visual chooser/composition steps own their entry; the stage only handles departure.
const emailStyleContentVariants: Variants = {
  enter: { opacity: 1 },
  visible: { opacity: 1 },
  leave: aboutContentVariants.leave,
};

// popLayout needs the DOM ref; presence also removes departing form fields from tab order.
const AnimatedStep = React.forwardRef<HTMLDivElement, {
  custom: { direction: 1 | -1; reduced: boolean }; title: string; children: React.ReactNode;
}>(function AnimatedStep({ custom, title, children }, ref) {
  const present = useIsPresent();
  return <motion.div ref={ref} custom={custom} variants={title === "Email style" || title === "Messages" ? emailStyleContentVariants : title === "About" || title === "Send rule" ? aboutContentVariants : contentVariants}
    initial="enter" animate="visible" exit="leave" tabIndex={-1}
    inert={!present} aria-hidden={!present} aria-label={title}
    className="tracker-email-editor-step">{children}</motion.div>;
});

/** Native scrolling with a small, draggable overlay thumb and no reserved gutter. */
function WorkflowOverlayScrollbar({ scrollRef, scrollId }: { scrollRef: React.RefObject<HTMLDivElement | null>; scrollId: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; scroll: number; ratio: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hovered = useRef(false);
  const show = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    trackRef.current?.setAttribute("data-visible", "true");
    hideTimer.current = setTimeout(() => {
      if (!hovered.current && !drag.current) trackRef.current?.setAttribute("data-visible", "false");
    }, 900);
  }, []);
  useEffect(() => {
    const scroll = scrollRef.current, track = trackRef.current, thumb = thumbRef.current;
    if (!scroll || !track || !thumb) return;
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const range = scroll.scrollHeight - scroll.clientHeight;
      const height = Math.min(track.clientHeight, Math.max(32, track.clientHeight * scroll.clientHeight / scroll.scrollHeight));
      track.hidden = range <= 1;
      thumb.style.height = `${height}px`;
      thumb.style.transform = `translateY(${range > 0 ? (track.clientHeight - height) * scroll.scrollTop / range : 0}px)`;
      track.setAttribute("aria-valuemax", String(Math.max(0, range)));
      track.setAttribute("aria-valuenow", String(Math.round(scroll.scrollTop)));
    };
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(update); };
    const onScroll = () => { show(); schedule(); };
    const observer = new ResizeObserver(schedule);
    observer.observe(scroll);
    observer.observe(track);
    if (scroll.firstElementChild) observer.observe(scroll.firstElementChild);
    scroll.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      observer.disconnect();
      scroll.removeEventListener("scroll", onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [scrollRef, show]);
  return <div ref={trackRef} className="workflow-overlay-scrollbar" role="scrollbar"
    aria-label="Scroll workflow editor" aria-controls={scrollId} aria-orientation="vertical" aria-valuemin={0}
    aria-valuemax={0} aria-valuenow={0} tabIndex={0}
    onPointerEnter={() => { hovered.current = true; show(); }}
    onPointerLeave={() => { hovered.current = false; show(); }}
    onFocus={show} onBlur={show}
    onKeyDown={(event) => {
      const scroll = scrollRef.current;
      if (!scroll) return;
      const deltas: Record<string, number> = { ArrowDown: 40, ArrowUp: -40, PageDown: scroll.clientHeight * .8, PageUp: -scroll.clientHeight * .8 };
      if (event.key in deltas) scroll.scrollTop += deltas[event.key];
      else if (event.key === "Home") scroll.scrollTop = 0;
      else if (event.key === "End") scroll.scrollTop = scroll.scrollHeight;
      else return;
      event.preventDefault(); show();
    }}
    onPointerDown={(event) => {
      const scroll = scrollRef.current, track = trackRef.current, thumb = thumbRef.current;
      if (!scroll || !track || !thumb || event.button !== 0) return;
      event.preventDefault();
      const ratio = (scroll.scrollHeight - scroll.clientHeight) / Math.max(1, track.clientHeight - thumb.offsetHeight);
      const rect = thumb.getBoundingClientRect();
      if (event.clientY < rect.top || event.clientY > rect.bottom) {
        scroll.scrollTop = (event.clientY - track.getBoundingClientRect().top - thumb.offsetHeight / 2) * ratio;
      }
      drag.current = { y: event.clientY, scroll: scroll.scrollTop, ratio };
      event.currentTarget.setPointerCapture(event.pointerId); show();
    }}
    onPointerMove={(event) => { if (drag.current && scrollRef.current) scrollRef.current.scrollTop = drag.current.scroll + (event.clientY - drag.current.y) * drag.current.ratio; }}
    onPointerUp={(event) => { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); show(); }}
    onLostPointerCapture={() => { drag.current = null; show(); }}>
    <div ref={thumbRef} className="workflow-overlay-scrollbar-thumb" />
  </div>;
}

export function WorkflowStepContentStage({ page, direction, reduceMotion, title, focusOnEntry, navigation, onCompactnessChange, children }: {
  page: number; direction: 1 | -1; reduceMotion: boolean; title: string; focusOnEntry: boolean;
  navigation: React.ReactNode; onCompactnessChange?: (compactness: number) => void; children: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  useLayoutEffect(() => {
    const editor = scrollRef.current?.closest<HTMLElement>(".tracker-email-editor");
    const header = editor?.querySelector<HTMLElement>(".tracker-email-sticky-header");
    const footer = editor?.closest(".tracker-email-modal")?.querySelector<HTMLElement>(".tracker-email-footer");
    if (!editor || !header || !footer) return;
    const measure = () => {
      editor.style.setProperty("--workflow-header-height", `${header.offsetHeight}px`);
      editor.style.setProperty("--workflow-footer-height", `${footer.offsetHeight}px`);
      // The description is followed by navigation and header padding, already
      // included in header height. Count it once when a step defines its gap.
      const stepper = header.querySelector<HTMLElement>(".fluid-step-navigation");
      const tail = parseFloat(getComputedStyle(header).paddingBottom) +
        (stepper ? parseFloat(getComputedStyle(stepper).paddingBottom) : 0);
      editor.style.setProperty("--workflow-header-tail", `${tail}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(header); observer.observe(footer); measure();
    return () => observer.disconnect();
  }, []);
  const updateCompactness = useCallback(() => {
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    // Keep the reversible collapse continuous, including with reduced motion.
    // Scroll updates are batched into one DOM write per frame, without React state.
    const compactness = Math.min(1, Math.max(0, (scrollTop - 40) / 80));
    onCompactnessChange?.(compactness);
    frame.current = null;
  }, [onCompactnessChange]);
  const handleScroll = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(updateCompactness);
  }, [updateCompactness]);
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    updateCompactness();
    if (focusOnEntry) content.focus({ preventScroll: true });
    // Entry focus is captured at handoff; clearing the visual commit must not refocus the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, updateCompactness]);
  useEffect(() => () => {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
  }, []);
  const custom = { direction, reduced: reduceMotion };
  return (
    <motion.div className="tracker-email-editor-stage tracker-email-content-stage" data-workflow-step={title} initial={false}>
      <div id={scrollId} className="tracker-email-content-scroll" ref={scrollRef} onScroll={handleScroll}
        onFocusCapture={(event) => {
          const scroll = scrollRef.current;
          const target = event.target as HTMLElement;
          if (!scroll || target === contentRef.current) return;
          const rect = target.getBoundingClientRect(), viewport = scroll.getBoundingClientRect();
          const style = getComputedStyle(scroll);
          const top = viewport.top + parseFloat(style.scrollPaddingTop);
          const bottom = viewport.bottom - parseFloat(style.scrollPaddingBottom);
          if (rect.height > bottom - top) scroll.scrollTop += rect.top - top;
          else if (rect.top < top) scroll.scrollTop -= top - rect.top;
          else if (rect.bottom > bottom) scroll.scrollTop += rect.bottom - bottom;
        }}>
        <div className="tracker-email-content-inner">
        <AnimatePresence initial={false} mode="popLayout" custom={custom}>
          <AnimatedStep key={page} ref={contentRef} custom={custom} title={title}>
            {children}
          </AnimatedStep>
        </AnimatePresence>
        </div>
      </div>
      <WorkflowOverlayScrollbar scrollRef={scrollRef} scrollId={scrollId} />
      <div className="tracker-email-editor-nav-overlay">{navigation}</div>
    </motion.div>
  );
}

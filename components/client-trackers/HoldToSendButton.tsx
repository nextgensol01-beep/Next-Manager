"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { Check, Send } from "lucide-react";
import { useAuthorizationReducedMotion } from "./useAuthorizationReducedMotion";

export default function HoldToSendButton({
  count, disabled, onCommit, duration = 1100, phase = "ready", resetKey = 0,
}: {
  count: number; disabled?: boolean; onCommit: () => void; duration?: number;
  phase?: "ready" | "committing" | "accepted"; resetKey?: number;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const perimeter = useRef<SVGSVGElement>(null);
  const track = useRef<SVGRectElement>(null), halo = useRef<SVGRectElement>(null), light = useRef<SVGRectElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef(0), active = useRef(false), committed = useRef(false);
  const progress = useRef(0), startedAt = useRef(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [holding, setHolding] = useState(false), [paused, setPaused] = useState(false);
  const reduced = useAuthorizationReducedMotion(), id = useId();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  // Match the review Send material's bounded local coordinates and spring character.
  const pointerX = useMotionValue(0), pointerY = useMotionValue(0);
  const x = useSpring(pointerX, { stiffness: 190, damping: 28 });
  const y = useSpring(pointerY, { stiffness: 190, damping: 28 });
  const paint = useCallback((value: number) => {
    progress.current = value;
    const node = button.current;
    if (!node) return;
    node.style.setProperty("--hold-progress", String(value));
    node.style.setProperty("--hold-focus", String(Math.max(0, (value - .8) / .2)));
    for (const path of [halo.current, light.current]) {
      if (!path) continue;
      path.style.strokeDashoffset = String(1 - value);
      path.style.opacity = value > 0 ? "1" : "0";
    }
  }, []);
  useEffect(() => {
    const node = button.current;
    if (!node) return;
    const measure = () => {
      const width = node.clientWidth, height = node.clientHeight;
      perimeter.current?.setAttribute("viewBox", "0 0 " + width + " " + height);
      for (const path of [track.current, halo.current, light.current]) {
        if (!path) continue;
        path.setAttribute("width", String(Math.max(0, width - 6))); path.setAttribute("height", String(Math.max(0, height - 6)));
        path.setAttribute("rx", String(Math.max(0, height / 2 - 3)));
      }
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const cancel = useCallback(() => {
    touchStart.current = null;
    if (!active.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; active.current = false;
    cancelAnimationFrame(frame.current); setHolding(false);
    pointerX.set(0); pointerY.set(0);
    const from = progress.current, start = performance.now();
    if (reducedRef.current || document.hidden) { paint(0); return; }
    const drain = (now: number) => {
      const elapsed = Math.min(1, (now - start) / 200);
      paint(from * (1 - elapsed) ** 2);
      if (elapsed < 1) frame.current = requestAnimationFrame(drain);
    };
    frame.current = requestAnimationFrame(drain);
  }, [paint, pointerX, pointerY]);
  useEffect(() => {
    if (reduced) { pointerX.set(0); pointerY.set(0); x.jump(0); y.jump(0); }
  }, [reduced, pointerX, pointerY, x, y]);
  const start = (contactX = 50, contactY = 50) => {
    if (disabled || phase !== "ready" || active.current || committed.current) return;
    cancelAnimationFrame(frame.current); active.current = true;
    startedAt.current = performance.now(); paint(0);
    button.current?.style.setProperty("--hold-contact-x", contactX + "%");
    button.current?.style.setProperty("--hold-contact-y", contactY + "%");
    pointerX.set(0); pointerY.set(0); setHolding(true);
    const draw = (now: number) => {
      if (!active.current) return;
      paint(Math.min(1, (now - startedAt.current) / duration));
      frame.current = requestAnimationFrame(draw);
    };
    frame.current = requestAnimationFrame(draw);
    // The authoritative safety timer is independent of animation and reduced motion.
    timer.current = setTimeout(() => {
      timer.current = null;
      if (!active.current || committed.current) return;
      committed.current = true; active.current = false;
      cancelAnimationFrame(frame.current); paint(1); setHolding(false); onCommit();
    }, duration);
  };
  useEffect(() => { if (disabled) cancel(); }, [disabled, cancel]);
  useEffect(() => { committed.current = false; paint(0); }, [resetKey, paint]);
  useEffect(() => {
    const visibility = () => { setPaused(document.hidden); if (document.hidden) cancel(); };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active.current = false;
      if (timer.current) clearTimeout(timer.current);
      cancelAnimationFrame(frame.current);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [cancel]);
  const state = phase !== "ready" ? phase : holding ? "holding" : "ready";
  const label = phase === "accepted" ? "Delivery started" : phase === "committing" ? "Starting delivery…"
    : holding ? "Keep holding…" : "Hold to send " + count + " " + (count === 1 ? "email" : "emails");
  return (
    <div className="email-security-hold-wrap">
      <motion.button ref={button} type="button" className="email-security-hold hold-to-send-pressure"
        aria-describedby={id} aria-busy={phase === "committing"}
        disabled={disabled || phase !== "ready"} data-state={state} data-holding={holding || undefined}
        data-paused={paused || undefined}
        style={{ "--hold-pointer-x": x, "--hold-pointer-y": y } as React.CSSProperties}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault(); event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          touchStart.current = event.pointerType === "touch" ? { x: event.clientX, y: event.clientY } : null;
          const rect = event.currentTarget.getBoundingClientRect();
          start((event.clientX - rect.left) / rect.width * 100, (event.clientY - rect.top) / rect.height * 100);
        }}
        onPointerUp={cancel} onPointerCancel={cancel} onLostPointerCapture={cancel}
        onPointerLeave={() => { cancel(); pointerX.set(0); pointerY.set(0); }}
        onPointerMove={event => {
          const r = event.currentTarget.getBoundingClientRect();
          if (active.current) {
            // A swipe starting on this control is not an intentional stationary hold.
            if (touchStart.current && Math.hypot(event.clientX - touchStart.current.x, event.clientY - touchStart.current.y) > 10) { cancel(); return; }
            if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) cancel();
          } else if (!reduced && !disabled && phase === "ready" && event.pointerType !== "touch") {
            pointerX.set(Math.max(-1, Math.min(1, (event.clientX - r.left) / r.width * 2 - 1)));
            pointerY.set(Math.max(-1, Math.min(1, (event.clientY - r.top) / r.height * 2 - 1)));
          }
        }}
        onKeyDown={event => {
          if (event.key !== " " && event.key !== "Enter") return;
          event.preventDefault(); if (!event.repeat) start();
        }}
        onKeyUp={event => {
          if (event.key === " " || event.key === "Enter") { event.preventDefault(); cancel(); }
        }}
        onBlur={cancel} onClick={event => event.preventDefault()}>
        <span className="hold-pressure-material" aria-hidden="true"><span className="hold-pressure-contact" /><span className="hold-pressure-reflection" /><span className="email-security-dyes"><i /><i /><i /></span></span>
        <svg ref={perimeter} className="hold-optical-perimeter" viewBox="0 0 400 48" preserveAspectRatio="none" aria-hidden="true">
          <rect ref={track} className="hold-optical-track" x="3" y="3" width="394" height="42" rx="21" fill="none" />
          <rect ref={halo} className="hold-optical-path is-halo" x="3" y="3" width="394" height="42" rx="21" fill="none" pathLength="1" strokeDasharray="1" strokeDashoffset="1" />
          <rect ref={light} className="hold-optical-path" x="3" y="3" width="394" height="42" rx="21" fill="none" pathLength="1" strokeDasharray="1" strokeDashoffset="1" />
        </svg>
        <span className="email-security-hold-copy">{phase === "accepted" ? <Check size={17} /> : <Send size={16} />}{label}</span>
      </motion.button>
      <span className="sr-only" role="status" aria-atomic="true">{label}</span>
      <p id={id}>{phase === "ready" ? <>Press and hold for {duration / 1000} {duration === 1000 ? "second" : "seconds"}. You can also hold Space or Enter. Release early to cancel.</> : "Keep this website open. Progress appears in Email activity after acceptance."}</p>
    </div>
  );
}


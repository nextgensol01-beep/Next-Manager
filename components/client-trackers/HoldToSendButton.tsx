"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { Check, Send } from "lucide-react";
import { useAuthorizationReducedMotion } from "./useAuthorizationReducedMotion";

export default function HoldToSendButton({
  count, disabled, onCommit, duration = 1100, phase = "ready", resetKey = 0, sentCount = count,
}: {
  count: number; disabled?: boolean; onCommit: () => void; duration?: number;
  phase?: "ready" | "sending" | "success"; resetKey?: number; sentCount?: number;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef(0), active = useRef(false), committed = useRef(false);
  const progress = useRef(0), startedAt = useRef(0);
  const [holding, setHolding] = useState(false), [paused, setPaused] = useState(false);
  const reduced = useAuthorizationReducedMotion(), id = useId();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  // Match the review Send material's bounded local coordinates and spring character.
  const pointerX = useMotionValue(0), pointerY = useMotionValue(0);
  const x = useSpring(pointerX, { stiffness: 190, damping: 28 });
  const y = useSpring(pointerY, { stiffness: 190, damping: 28 });
  const paint = useCallback((value: number, time = performance.now()) => {
    progress.current = value;
    const node = button.current;
    if (!node) return;
    node.style.setProperty("--hold-progress", String(value));
    const fill = node.querySelector<HTMLElement>(".email-security-hold-fill");
    if (!fill) return;
    if (value >= 1) { fill.style.clipPath = "inset(0)"; return; }
    if (value <= 0) { fill.style.clipPath = "inset(0 100% 0 0)"; return; }
    if (reducedRef.current) { fill.style.clipPath = `inset(0 ${100 - value * 100}% 0 0)`; return; }
    // Reveal full-size moving bodies with a gently lobed boundary; never resize the material.
    const edge = value * 100, amplitude = Math.min(1, value * 14, (1 - value) * 14) * 4;
    const points = Array.from({ length: 9 }, (_, index) => {
      const offset = Math.sin(index * .92 + time / 310) * amplitude;
      return `calc(${edge}% + ${offset.toFixed(2)}px) ${index * 12.5}%`;
    });
    fill.style.clipPath = `polygon(0 0, ${points.join(",")}, 0 100%)`;
  }, []);
  const cancel = useCallback(() => {
    if (!active.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; active.current = false;
    cancelAnimationFrame(frame.current); setHolding(false);
    pointerX.set(0); pointerY.set(0);
    const from = progress.current, start = performance.now();
    const drain = (now: number) => {
      const elapsed = Math.min(1, (now - start) / 240);
      paint(from * (1 - elapsed) ** 2, now);
      if (elapsed < 1) frame.current = requestAnimationFrame(drain);
    };
    frame.current = requestAnimationFrame(drain);
  }, [paint, pointerX, pointerY]);
  const start = () => {
    if (disabled || phase !== "ready" || active.current || committed.current) return;
    cancelAnimationFrame(frame.current); active.current = true;
    startedAt.current = performance.now(); paint(0);
    pointerX.set(0); pointerY.set(0); setHolding(true);
    const draw = (now: number) => {
      if (!active.current) return;
      paint(Math.min(1, (now - startedAt.current) / duration), now);
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
      if (timer.current) clearTimeout(timer.current);
      cancelAnimationFrame(frame.current);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [cancel]);
  const state = phase !== "ready" ? phase : holding ? "holding" : "ready";
  const label = phase === "success" ? sentCount === 1 ? "Email sent" : `${sentCount} emails sent`
    : phase === "sending" ? `Sending ${count} ${count === 1 ? "email" : "emails"}…`
    : holding ? "Keep holding…" : `Hold to send ${count} ${count === 1 ? "email" : "emails"}`;
  return (
    <div className="email-security-hold-wrap">
      <motion.button ref={button} type="button" className="email-security-hold hold-to-send-liquid"
        aria-describedby={id} aria-busy={phase === "sending"}
        disabled={disabled || phase !== "ready"} data-state={state} data-holding={holding || undefined}
        data-paused={paused || undefined}
        style={{ "--hold-pointer-x": x, "--hold-pointer-y": y } as React.CSSProperties}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault(); event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId); start();
        }}
        onPointerUp={cancel} onPointerCancel={cancel} onLostPointerCapture={cancel}
        onPointerLeave={() => { cancel(); pointerX.set(0); pointerY.set(0); }}
        onPointerMove={event => {
          const r = event.currentTarget.getBoundingClientRect();
          if (active.current) {
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
        <span className="email-security-hold-dormant email-security-dyes" aria-hidden="true"><i /><i /><i /></span>
        <span className="email-security-hold-fill" aria-hidden="true">
          <span className="email-security-dyes"><i /><i /><i /></span>
        </span>
        <span className="email-security-hold-copy">{phase === "success" ? <Check size={17} /> : <Send size={16} />}{label}</span>
      </motion.button>
      <span className="sr-only" role="status" aria-atomic="true">{label}</span>
      <p id={id}>Press and hold for {duration / 1000} {duration === 1000 ? "second" : "seconds"}. You can also hold Space or Enter. Release early to cancel.</p>
    </div>
  );
}


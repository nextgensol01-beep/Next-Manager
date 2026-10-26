"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useAuthorizationReducedMotion } from "./useAuthorizationReducedMotion";

// Match the existing review and authorization easing. Geometry has one owner.
export const emailMotion = { ease: [.22, .72, .24, 1] as const, content: .22, resize: .34, handoff: .36 };

/** Measure intrinsic content only when it changes, never on animation frames. */
export default function EmailMotionRegion({ children, busy }: { children: ReactNode; busy?: boolean }) {
  const content = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  const reduced = useAuthorizationReducedMotion();
  useLayoutEffect(() => {
    const node = content.current;
    if (!node) return;
    const measure = () => setHeight(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <motion.div className="email-authorization-surface" aria-busy={busy}
    initial={false} animate={{ height: height ?? "auto" }}
    transition={{ duration: reduced ? 0 : emailMotion.resize, ease: emailMotion.ease }}>
    <div ref={content}>{children}</div>
  </motion.div>;
}

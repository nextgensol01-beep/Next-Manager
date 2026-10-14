"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { motion, useMotionValue, useTransform, type MotionValue } from "framer-motion";
import { handoffPoint, measureStyleHandoff, STYLE_HANDOFF, type HandoffGeometry } from "@/lib/workflow-style-handoff";

const emptyPath: HandoffGeometry = { start: { x: 0, y: 0 }, control: { x: 0, y: 0 }, end: { x: 0, y: 0 } };

/** A sibling of the masked viewport: one continuous object, from tile to pill. */
export default function StyleToStepperHandoff({ tileRef, pillRef, editorRef, clock, selectionDelay }: {
  tileRef: RefObject<HTMLButtonElement | null>;
  pillRef: RefObject<HTMLSpanElement | null>;
  editorRef: RefObject<HTMLElement | null>;
  clock: MotionValue<number>; selectionDelay: number;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const path = useMotionValue(emptyPath);
  const ready = useMotionValue(0);
  const elapsed = useTransform(clock, value => value - selectionDelay);
  const progress = useTransform(elapsed, [STYLE_HANDOFF.detach, STYLE_HANDOFF.arrival], [0, 1]);
  const position = useTransform(() => handoffPoint(path.get(), progress.get()));
  const x = useTransform(position, value => value.x);
  const y = useTransform(position, value => value.y);
  const opacity = useTransform(elapsed, [0, .045, .09, .16, .3, .34], [0, 0, .6, 1, 1, 0]);
  const scale = useTransform(elapsed, [0, .065, .1, .18, .3, .34], [.4, .75, 1, 1.15, .8, .45]);
  const stretch = useTransform(elapsed, [.065, .1, .16, .26, .3], [1, 1.55, 1.25, 1.1, .7]);
  const rotate = useTransform(() => {
    const t = progress.get(), geometry = path.get();
    const dx = 2 * (1 - t) * (geometry.control.x - geometry.start.x) + 2 * t * (geometry.end.x - geometry.control.x);
    const dy = 2 * (1 - t) * (geometry.control.y - geometry.start.y) + 2 * t * (geometry.end.y - geometry.control.y);
    return Math.atan2(dx, -dy) * 180 / Math.PI;
  });
  const blur = useTransform(elapsed, [.05, .1, .2, .3, .34], ["blur(2px)", "blur(.7px)", "blur(1.2px)", "blur(.6px)", "blur(3px)"]);
  const trailOpacity = useTransform(elapsed, [.09, .14, .26, .3], [0, .3, .2, 0]);
  const gatherOpacity = useTransform(elapsed, [.025, .075, .11, .16], [0, .48, .35, 0]);
  const gatherScale = useTransform(elapsed, [.025, .09, .16], [.65, 1, .4]);
  const startX = useTransform(path, value => value.start.x);
  const startY = useTransform(path, value => value.start.y);

  useLayoutEffect(() => {
    const editor = editorRef.current, tile = tileRef.current, pill = pillRef.current, overlay = overlayRef.current;
    if (!editor || !tile || !pill || !overlay) return;
    const measure = () => {
      // Preserve the contact point once the pill starts its canonical horizontal move.
      if (clock.get() - selectionDelay >= STYLE_HANDOFF.advance) return;
      path.set(measureStyleHandoff(tile.getBoundingClientRect(), pill.getBoundingClientRect(), overlay.getBoundingClientRect(), overlay.offsetWidth, overlay.offsetHeight));
      ready.set(1);
    };
    const observer = new ResizeObserver(measure);
    [editor, tile, pill].forEach(element => observer.observe(element));
    window.addEventListener("resize", measure);
    editor.addEventListener("scroll", measure, true);
    measure();
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); editor.removeEventListener("scroll", measure, true); };
  }, [clock, editorRef, tileRef, pillRef, path, ready, selectionDelay]);

  return <motion.div ref={overlayRef} className="workflow-style-handoff-overlay" aria-hidden="true" style={{ opacity: ready }}>
    <motion.span className="workflow-style-handoff-position" style={{ x: startX, y: startY, opacity: gatherOpacity, scale: gatherScale }}>
      <span className="workflow-style-handoff-gather" />
    </motion.span>
    <motion.span className="workflow-style-handoff-position" data-style-handoff-droplet style={{ x, y, opacity, scale, rotate }}>
      <motion.span className="workflow-style-handoff-trail" style={{ opacity: trailOpacity }} />
      <motion.span className="workflow-style-handoff-body" style={{ scaleY: stretch, filter: blur }}>
        <span className="workflow-style-handoff-bloom" />
        <span className="workflow-style-handoff-core" />
        <span className="workflow-style-handoff-caustic" />
      </motion.span>
    </motion.span>
  </motion.div>;
}

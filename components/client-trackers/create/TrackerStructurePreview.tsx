"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeftRight, Radio, Sigma } from "lucide-react";
import { GlassSurface } from "@/components/ui/liquid-glass/GlassSurface";

export type StructureColumn = { id: string; label: string; source?: "live" | "computed"; client?: boolean };
export type StructureRow = { id: string; cells: Record<string, ReactNode> };
/** Shared lightweight table: callers decide which values are safe to show. */
export default function TrackerStructurePreview({ columns, rows, empty }: {
  columns: StructureColumn[]; rows: StructureRow[]; empty: string;
}) {
  const reduced = useReducedMotion();
  const scroll = useRef<HTMLDivElement>(null), [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const node = scroll.current;
    if (!node) return;
    const update = () => setOverflow(node.scrollWidth > node.clientWidth + 1);
    const observer = new ResizeObserver(update);
    observer.observe(node); if (node.firstElementChild) observer.observe(node.firstElementChild); update();
    return () => observer.disconnect();
  }, [columns.length]);
  const transition = { duration: reduced ? 0 : .26, ease: [.22, 1, .36, 1] as [number, number, number, number] };
  return <>
    <GlassSurface className="create-preview-surface" intensity="subtle" radius="lg">
      <div ref={scroll} className="create-preview-table-scroll" tabIndex={0} aria-label="Scroll tracker columns horizontally">
        <div role="table" aria-label="Tracker structure" className="create-preview-table">
          <div role="row" className="create-preview-row create-preview-head"><AnimatePresence initial={false} mode="popLayout">
            {columns.map(column => <motion.div key={column.id} role="columnheader" layout="position" data-preview-column={column.id}
              className={`create-preview-cell ${column.client ? "is-client" : ""}`} initial={{ opacity: 0, x: reduced ? 0 : 7 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={transition}>
              {column.source === "live" ? <Radio size={11} className="create-live-mark" /> : column.source === "computed" ? <Sigma size={11} className="create-computed-mark" /> : null}{column.label}
            </motion.div>)}
          </AnimatePresence></div>
          {rows.map(row => <div role="row" key={row.id} className="create-preview-row"><AnimatePresence initial={false} mode="popLayout">
            {columns.map(column => <motion.div key={column.id} role="cell" layout="position" data-preview-value={column.id}
              className={`create-preview-cell ${column.client ? "is-client" : ""} ${column.source === "live" ? "is-live" : ""} ${row.cells[column.id] === "—" ? "is-placeholder" : ""}`}
              initial={{ opacity: 0, x: reduced ? 0 : 7 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={transition}>{row.cells[column.id] || "—"}</motion.div>)}
          </AnimatePresence></div>)}
        </div>
        {!rows.length && <p className="create-preview-empty">{empty}</p>}
      </div>
    </GlassSurface>
    {overflow && <p className="create-preview-scroll-hint"><ArrowLeftRight size={11} />Scroll to view all {columns.length} columns</p>}
  </>;
}

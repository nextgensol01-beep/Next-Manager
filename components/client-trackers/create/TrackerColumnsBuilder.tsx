"use client";

import { useState } from "react";
import { AnimatePresence, motion, Reorder, useDragControls, useIsPresent, useReducedMotion } from "framer-motion";
import { ChevronDown, GripVertical, Plus, Radio, Sigma, Trash2 } from "lucide-react";
import { GlassToggle } from "@/components/ui/liquid-glass/GlassToggle";
import type { TrackerField } from "@/lib/clientTrackers";
import { draftField, FIELD_TYPES, LIVE_DATA_DISPLAYS, LIVE_DATA_SOURCES, type TrackerDraftField } from "@/lib/tracker-create";
import { BuilderSection } from "./BuilderControls";
import TrackerColumnEditor from "./TrackerColumnEditor";
import { COMPUTED_LABELS } from "./TrackerComputedEditor";

function ColumnRow({ field, fields, index, expanded, onExpand, onPatch, onRemove, onMove, state, configuring, persisted, positionCount }: {
  field: TrackerDraftField; fields: TrackerDraftField[]; index: number; expanded: boolean;
  onExpand: () => void; onPatch: (patch: Partial<TrackerField>) => void; onRemove: () => void; onMove: (direction: -1 | 1) => void;
  state?: string; configuring?: boolean; persisted?: boolean;
  positionCount: number;
}) {
  const controls = useDragControls(), reducedMotion = useReducedMotion();
  const present = useIsPresent();
  const summary = field.computed ? `Computed · ${COMPUTED_LABELS[field.computed.kind]}` : field.dataLink
    ? `Live · ${LIVE_DATA_SOURCES.find(source => source.value === field.dataLink?.source)?.label || "Uploaded data"} · ${LIVE_DATA_DISPLAYS[field.dataLink.source].find(display => display.value === field.dataLink?.display)?.label || field.dataLink.display}`
    : `Manual · ${FIELD_TYPES.find(type => type.id === field.type)?.label || field.type}${field.options ? ` · ${field.options.length} options` : ""}`;
  return <Reorder.Item as="div" value={field.uiId} dragListener={false} dragControls={controls}
    className={`create-column-row ${expanded ? "is-expanded" : ""} ${field.dataLink ? "is-live" : field.computed ? "is-computed" : ""}`} data-column-id={field.uiId} data-field-key={field.key} inert={!present}
    initial={{ opacity: 0, y: reducedMotion ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }}
    transition={{ duration: reducedMotion ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}>
    <div className="create-column-summary">
      <button type="button" className="create-column-drag create-icon-button" aria-label={`Reorder ${field.label || "column"}`}
        title="Drag to reorder, or use Arrow Up and Arrow Down" onPointerDown={event => controls.start(event)} onKeyDown={event => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); onMove(event.key === "ArrowUp" ? -1 : 1); }
        }}><GripVertical size={16} /></button>
      <button type="button" className="create-column-expand" aria-expanded={expanded} aria-controls={`${field.uiId}-editor`} onClick={onExpand}>
        <span className="create-column-title">{field.dataLink ? <Radio size={13} className="create-live-mark" /> : field.computed ? <Sigma size={13} className="create-computed-mark" /> : <span className="create-manual-mark" />}{field.label || "Untitled column"}</span>
        <small>{summary}</small>
      </button>
      {state && <span className={`configure-field-state is-${state.toLowerCase()}`}>{state}</span>}
      <button type="button" className="create-icon-button create-column-chevron" aria-label={`${expanded ? "Collapse" : "Edit"} ${field.label || "column"}`} aria-expanded={expanded} onClick={onExpand}><ChevronDown size={15} /></button>
      {!expanded && <button type="button" className="create-icon-button create-column-remove" aria-label={`Remove ${field.label || "column"}`} onClick={onRemove}><Trash2 size={13} /></button>}
    </div>
    <motion.div id={`${field.uiId}-editor`} className="create-column-editor-wrap" initial={false}
      animate={{ height: expanded ? "auto" : 0, opacity: expanded ? 1 : 0, y: expanded || reducedMotion ? 0 : -3 }}
      transition={{ duration: reducedMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }} inert={!expanded} aria-hidden={!expanded}>
      <TrackerColumnEditor field={field} fields={fields} index={index} onPatch={onPatch} onRemove={onRemove} onMove={onMove} preserveKey={persisted} advancedComputed={configuring} positionCount={positionCount} />
    </motion.div>
  </Reorder.Item>;
}

export default function TrackerColumnsBuilder({ fields, includeStatus, onFieldsChange, onStatusChange, configuring = false, fieldState, isPersisted, onRemoveField, statusRemovalPending = false }: {
  fields: TrackerDraftField[]; includeStatus: boolean; onFieldsChange: (fields: TrackerDraftField[]) => void;
  onStatusChange: (value: boolean) => void;
  configuring?: boolean; fieldState?: (field: TrackerDraftField) => string | undefined; isPersisted?: (field: TrackerDraftField) => boolean;
  onRemoveField?: (field: TrackerDraftField) => void;
  /** Resets the toggle's optimistic thumb while a saved removal awaits confirmation. */
  statusRemovalPending?: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const change = onFieldsChange;
  const rows = configuring ? fields.filter(field => field.type !== "status") : fields;
  const move = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= rows.length) return;
    const next = [...rows]; [next[index], next[destination]] = [next[destination], next[index]];
    let position = 0;
    change(configuring ? fields.map(field => field.type === "status" ? field : next[position++]) : next);
  };
  return <BuilderSection title="Tracker columns" description={configuring ? "Edit one column at a time. Saved values stay attached to their column." : "Build the worklist. Drag columns to arrange them."}>
    <div className="create-system-status"><div><span className="create-label">Status {configuring && <small className="configure-system-label">System</small>}</span><p className="create-help">A built-in status for every client.</p></div><GlassToggle key={String(statusRemovalPending)} aria-label="Include Status column" checked={includeStatus} disabled={configuring && includeStatus && fields.length === 1} onCheckedChange={onStatusChange} /></div>
    <Reorder.Group axis="y" as="div" values={rows.map(field => field.uiId)} onReorder={ids => {
      const reordered = ids.map(id => rows.find(field => field.uiId === id)!);
      let position = 0; change(configuring ? fields.map(field => field.type === "status" ? field : reordered[position++]) : reordered);
    }} className="create-column-stack">
      <AnimatePresence initial={false}>{rows.map((field, index) => <ColumnRow key={field.uiId} field={field} fields={fields} index={index} expanded={expandedId === field.uiId}
        state={fieldState?.(field)} configuring={configuring} persisted={isPersisted?.(field)}
        positionCount={rows.length}
        onExpand={() => setExpandedId(value => value === field.uiId ? null : field.uiId)}
        onPatch={patch => change(fields.map(value => value.uiId === field.uiId ? { ...value, ...patch } : value))}
        onRemove={() => { if (onRemoveField) onRemoveField(field); else { if (expandedId === field.uiId) setExpandedId(null); change(fields.filter(value => value.uiId !== field.uiId)); } }}
        onMove={direction => move(index, direction)} />)}</AnimatePresence>
    </Reorder.Group>
    {!fields.length && <p className="create-columns-empty">Add the columns your team needs, or keep a simple status worklist.</p>}
    <button type="button" className="create-add-column" onClick={() => {
      const field = draftField(); change([...fields, field]); setExpandedId(field.uiId);
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`#${field.uiId}-editor input`)?.focus({ preventScroll: false }));
    }}><Plus size={15} />Add column</button>
  </BuilderSection>;
}

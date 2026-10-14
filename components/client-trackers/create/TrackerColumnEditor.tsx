"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Radio, Sigma, Trash2, X } from "lucide-react";
import LiquidGlassDropdown from "@/components/ui/LiquidGlassDropdown";
import { GlassPopover } from "@/components/ui/liquid-glass/GlassPopover";
import { TRACKER_OPTION_COLORS, trackerFieldKey, type TrackerDataLinkDisplay, type TrackerDataLinkSource, type TrackerField, type TrackerFieldType, type TrackerOptionColor } from "@/lib/clientTrackers";
import { computedFieldPatch, FIELD_TYPES, LIVE_DATA_DISPLAYS, LIVE_DATA_SOURCES, liveFieldType, liveSourcePatch, manualTypePatch, type TrackerDraftField } from "@/lib/tracker-create";
import { BuilderChoices } from "./BuilderControls";
import TrackerComputedEditor from "./TrackerComputedEditor";
import { defaultTrackerOptionColor, TRACKER_OPTION_PALETTE, trackerOptionColor, trackerOptionEdit } from "@/lib/tracker-option-colors";

function OptionColorPicker({ option, color, onChange }: { option: string; color: TrackerOptionColor; onChange: (color: TrackerOptionColor) => void }) {
  const [open, setOpen] = useState(false), root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role="radio"][aria-checked="true"]')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const choose = (value: TrackerOptionColor) => { onChange(value); setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  return <div ref={root} className="create-option-color" onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
  }} onKeyDown={event => {
    if (open && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus({ preventScroll: true }); }
  }}>
    <button ref={trigger} type="button" className="create-option-color-trigger" aria-label={`Color for ${option || "new option"}: ${color}`} aria-expanded={open}
      onClick={() => setOpen(value => !value)}><span className="create-option-dot" data-color={color} style={{ backgroundColor: TRACKER_OPTION_PALETTE[color].swatch }} /></button>
    <div className="create-color-layer" inert={!open}>
      <GlassPopover open={open} className="create-color-palette"><div role="radiogroup" aria-label={`Color for ${option || "new option"}`}>
        {TRACKER_OPTION_COLORS.map((value, index) => <button key={value} type="button" role="radio" aria-label={value} aria-checked={color === value}
          tabIndex={color === value ? 0 : -1} className="create-color-choice" onClick={() => choose(value)} onKeyDown={event => {
            const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
            if (!direction) return;
            event.preventDefault(); choose(TRACKER_OPTION_COLORS[(index + direction + TRACKER_OPTION_COLORS.length) % TRACKER_OPTION_COLORS.length]);
          }}><span className="create-option-dot" data-color={value} style={{ backgroundColor: TRACKER_OPTION_PALETTE[value].swatch }} /></button>)}
      </div></GlassPopover>
    </div>
  </div>;
}

export default function TrackerColumnEditor({ field, fields, index, onPatch, onRemove, onMove, preserveKey = false, advancedComputed = false, positionCount = fields.length }: {
  field: TrackerDraftField; fields: TrackerDraftField[]; index: number;
  onPatch: (patch: Partial<TrackerField>) => void; onRemove: () => void; onMove: (direction: -1 | 1) => void;
  preserveKey?: boolean; advancedComputed?: boolean;
  positionCount?: number;
}) {
  const mode = field.computed ? "computed" : field.dataLink ? "live" : "manual";
  const options = (field.optionInput ?? field.options?.join(", ") ?? "").split(",");
  const writeOptions = (values: string[]) => onPatch(trackerOptionEdit(field, values));
  return <div className="create-column-editor">
    <label className="create-field"><span className="create-label">Column name</span><input aria-label="Column name" value={field.label} placeholder="e.g. Documents received"
      onChange={event => onPatch({ label: event.target.value, ...(preserveKey ? {} : { key: trackerFieldKey(event.target.value) }) })} /></label>
    <div className="create-field"><span className="create-label">Data source</span>
      <BuilderChoices label="Column data source" value={mode} options={[
        { value: "manual", label: "Manual" }, { value: "live", label: "Live", icon: <Radio size={13} className="create-live-mark" /> },
        { value: "computed", label: "Computed", icon: <Sigma size={13} className="create-computed-mark" /> },
      ]} onChange={value => onPatch(value === "manual" ? { dataLink: undefined, computed: undefined }
        : value === "computed" ? computedFieldPatch(fields, field) : liveSourcePatch("purchaseInvoices"))} />
    </div>
    {mode === "manual" && <div className="create-field"><span className="create-label">Field type</span>
      <LiquidGlassDropdown label="Field type" variant="condition" portal value={field.type}
        options={FIELD_TYPES.map(type => ({ value: type.id, label: type.label }))} onChange={value => onPatch(manualTypePatch(value as TrackerFieldType))} />
    </div>}
    {mode === "live" && field.dataLink && <div className="create-editor-grid">
      <div className="create-field"><span className="create-label">Live source</span><LiquidGlassDropdown label="Live source" variant="condition" portal value={field.dataLink.source}
        options={field.dataLink.source === "uploadedData" ? [...LIVE_DATA_SOURCES, { value: "uploadedData", label: "Uploaded data (legacy)" }] : LIVE_DATA_SOURCES} onChange={value => onPatch(liveSourcePatch(value as TrackerDataLinkSource))} /></div>
      <div className="create-field"><span className="create-label">Display</span><LiquidGlassDropdown label="Live display" variant="condition" portal value={field.dataLink.display}
        options={LIVE_DATA_DISPLAYS[field.dataLink.source]} onChange={value => onPatch({ dataLink: { ...field.dataLink!, display: value as TrackerDataLinkDisplay },
          type: liveFieldType(value as TrackerDataLinkDisplay), options: undefined, optionInput: undefined })} /></div>
      <p className="create-help">Updates from the selected source. Its display determines the field type.</p>
    </div>}
    {mode === "computed" && field.computed && <TrackerComputedEditor field={field} fields={fields} advanced={advancedComputed} onPatch={onPatch} />}
    {mode === "manual" && field.type === "quantity" && <label className="create-field"><span className="create-label">Quantity unit <span className="create-optional">Optional</span></span>
      <input aria-label="Quantity unit" value={field.unit || ""} placeholder="e.g. MT or kg" onChange={event => onPatch({ unit: event.target.value })} /></label>}
    {mode === "manual" && ["select", "multiSelect", "tags"].includes(field.type) && <div className="create-options">
      <span className="create-label">Options</span><div className="create-option-list">{options.map((option, optionIndex) => {
        const name = option.trim(), color = name ? trackerOptionColor(field, name) : field.optionColors?.[""] || defaultTrackerOptionColor(options.slice(0, optionIndex).filter(value => value.trim()).length);
        return <div className="create-option-row" key={optionIndex}>
          <OptionColorPicker option={name} color={color} onChange={value => onPatch({ optionColors: { ...field.optionColors, [name]: value } })} />
          <input aria-label={`Option ${optionIndex + 1}`} value={option.trimStart()} placeholder="Option name" onChange={event => {
            const values = [...options]; values[optionIndex] = event.target.value;
            onPatch(trackerOptionEdit(field, values, optionIndex));
          }} />
          <button type="button" className="create-icon-button" aria-label={`Remove option ${optionIndex + 1}`} onClick={() => writeOptions(options.filter((_, i) => i !== optionIndex))}><X size={14} /></button>
        </div>;
      })}</div><button type="button" className="create-text-action" disabled={options.some(option => !option.trim())} onClick={() => writeOptions([...options, ""])}><Plus size={13} />Add option</button>
    </div>}
    <div className="create-column-editor-actions"><div className="create-order-actions">
      <button type="button" className="create-icon-button" disabled={index === 0} aria-label={`Move ${field.label || "column"} up`} onClick={() => onMove(-1)}><ArrowUp size={14} /></button>
      <button type="button" className="create-icon-button" disabled={index === positionCount - 1} aria-label={`Move ${field.label || "column"} down`} onClick={() => onMove(1)}><ArrowDown size={14} /></button>
      <span className="create-help">Column {index + 1} of {positionCount}</span>
    </div><button type="button" className="create-remove-column" onClick={onRemove}><Trash2 size={13} />Remove column</button></div>
  </div>;
}

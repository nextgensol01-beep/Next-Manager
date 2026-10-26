"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, Eye, X } from "lucide-react";
import LiquidGlassDropdown from "@/components/ui/LiquidGlassDropdown";
import ConfirmModal from "@/components/client-trackers/TrackerConfirmModal";
import { DEFAULT_STATUS_FIELD, type ClientTrackerDetailKey } from "@/lib/clientTrackers";
import { FINANCIAL_YEARS } from "@/lib/utils";
import { draftField, type TrackerDraftField } from "@/lib/tracker-create";
import { configurationChanges, configurationFieldState, configurationNeedsFinancialYear, configurationPreviousField, type TrackerConfiguration } from "@/lib/tracker-configuration";
import { BuilderError, BuilderSection } from "../create/BuilderControls";
import ClientDetailsPicker from "../create/ClientDetailsPicker";
import TrackerColumnsBuilder from "../create/TrackerColumnsBuilder";
import TrackerClientManager from "./TrackerClientManager";
import TrackerSyncControls from "./TrackerSyncControls";
import type { TrackerSyncDraft } from "@/lib/tracker-sync";
import TrackerImpactPreview, { type ConfigurePreviewClient, type ConfigurePreviewEntry } from "./TrackerImpactPreview";

export default function ConfigureTrackerWorkspace({ baseline, fields, clientColumns, clientIds, financialYear, clients, entries, trackerId, syncDraft, onSyncChange,
  saving, saved, serverError, clientsLoading, clientsError, categorySync, onFieldsChange, onColumnsChange, onClientsChange, onFinancialYearChange, onCompactChange, onNestedDialogChange }: {
  baseline: TrackerConfiguration; fields: TrackerDraftField[]; clientColumns: ClientTrackerDetailKey[]; clientIds: string[]; financialYear: string;
  trackerId: string; syncDraft: TrackerSyncDraft; onSyncChange: (draft: TrackerSyncDraft) => void;
  clients: ConfigurePreviewClient[]; entries: ConfigurePreviewEntry[]; saving: boolean; saved: boolean; serverError: string | null;
  clientsLoading: boolean; clientsError: string | null; categorySync?: string;
  onFieldsChange: (fields: TrackerDraftField[]) => void; onColumnsChange: (columns: ClientTrackerDetailKey[]) => void;
  onClientsChange: (ids: string[]) => void; onFinancialYearChange: (year: string) => void;
  onCompactChange: (value: boolean) => void; onNestedDialogChange: (value: boolean) => void;
}) {
  const reduced = useReducedMotion(), id = useId();
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && matchMedia("(max-width: 1023px)").matches);
  const [previewOpen, setPreviewOpen] = useState(() => typeof window === "undefined" || !matchMedia("(max-width: 1023px)").matches);
  const [size, setSize] = useState({ width: 1050, height: 640 });
  const workspace = useRef<HTMLDivElement>(null), scroll = useRef<HTMLDivElement>(null), reopen = useRef<HTMLButtonElement>(null), mobileTrigger = useRef<HTMLButtonElement>(null), close = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [removeField, setRemoveField] = useState<TrackerDraftField | null>(null);
  const draft = useMemo<TrackerConfiguration>(() => ({ fields, clientColumns, clientIds, financialYear, ...syncDraft }), [fields, clientColumns, clientIds, financialYear, syncDraft]);
  const changes = useMemo(() => configurationChanges(baseline, draft), [baseline, draft]);
  const needsFY = configurationNeedsFinancialYear(fields);
  const pickerClients = useMemo(() => {
    const all = new Map(clients.map(client => [client.clientId, client]));
    const known = new Map(entries.map(entry => [entry.clientId, entry.client]));
    for (const clientId of baseline.clientIds) if (!all.has(clientId)) all.set(clientId, known.get(clientId) || { clientId, companyName: clientId, category: "" });
    return [...all.values()];
  }, [clients, entries, baseline.clientIds]);
  useEffect(() => {
    const node = workspace.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) }));
    observer.observe(node); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const media = matchMedia("(max-width: 1023px)");
    const update = () => { setNarrow(media.matches); if (media.matches) setPreviewOpen(false); };
    media.addEventListener("change", update); return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => { onNestedDialogChange(Boolean(removeField)); return () => onNestedDialogChange(false); }, [removeField, onNestedDialogChange]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const setPreview = (open: boolean) => {
    setPreviewOpen(open);
    requestAnimationFrame(() => (open ? close.current : narrow ? mobileTrigger.current : reopen.current)?.focus({ preventScroll: true }));
  };
  const remove = (field: TrackerDraftField) => {
    if (configurationPreviousField(field, baseline)) setRemoveField(field);
    else onFieldsChange(fields.filter(item => item.uiId !== field.uiId));
  };
  const includeStatus = fields.some(field => field.type === "status");
  const railWidth = Math.round(size.width * .35);
  const spring = reduced ? { duration: .08 } : { type: "spring" as const, stiffness: 310, damping: 36, mass: .9 };
  return <motion.div ref={workspace} className={`configure-workspace ${previewOpen ? "is-preview-open" : "is-preview-collapsed"} ${narrow ? "is-narrow" : ""} ${saving ? "is-saving" : ""}`}
    data-preview-open={previewOpen} aria-busy={saving} initial={false}
    animate={{ gridTemplateColumns: narrow ? "minmax(0, 1fr)" : `minmax(0, 1fr) ${previewOpen ? railWidth : 112}px` }} transition={spring}
    style={{ "--configure-preview-width": `${narrow ? size.width - 20 : railWidth - 16}px`, "--configure-preview-height": `${size.height - 32}px` } as React.CSSProperties}
    onKeyDown={event => { if (narrow && previewOpen && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setPreview(false); } }}>
    <fieldset className="configure-build" disabled={saving} inert={narrow && previewOpen}>
      <legend className="sr-only">Tracker configuration</legend>
      <div className="configure-toolbar"><span className="create-eyebrow">Configuration</span>
        <button ref={mobileTrigger} type="button" className="configure-mobile-preview create-text-action" aria-label="Show impact preview" aria-expanded={previewOpen} aria-controls={`${id}-impact`}
          onClick={() => setPreview(true)}><Eye size={14} />Preview{changes.length > 0 && <small>{changes.length}</small>}</button></div>
      <motion.div layoutScroll ref={scroll} className="create-builder-scroll configure-scroll" onScroll={() => {
        const node = scroll.current; if (!node) return;
        onCompactChange(node.scrollTop > 20); node.classList.add("is-scrolling");
        if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => node.classList.remove("is-scrolling"), 800);
      }}><div className="create-builder-content configure-content">
        {serverError && <p className="create-server-error" role="alert">{serverError}</p>}
        <BuilderSection title="Tracker context"><div className="configure-fy create-field"><span className="create-label">Financial year
          {needsFY && <span className={!financialYear ? "create-required" : "create-optional"}>Required</span>}</span>
          <LiquidGlassDropdown label="Financial year" variant="condition" portal value={financialYear} required={needsFY} invalid={needsFY && !financialYear}
            describedBy={needsFY ? `${id}-fy-help` : undefined} options={[{ value: "", label: "Not tied to a FY" }, ...FINANCIAL_YEARS.map(year => ({ value: year, label: year }))]} onChange={onFinancialYearChange} />
          {needsFY && <p id={`${id}-fy-help`} className="create-help create-fy-reason">Required because this tracker uses CPCB upload data.</p>}
        </div></BuilderSection>
        <TrackerSyncControls trackerId={trackerId} value={syncDraft} savedMode={baseline.clientMembershipMode} onChange={onSyncChange} />
        <TrackerClientManager clients={pickerClients} selectedIds={clientIds} baselineIds={baseline.clientIds} loading={clientsLoading} error={clientsError} categorySync={categorySync} onChange={onClientsChange} />
        <ClientDetailsPicker value={clientColumns} onChange={onColumnsChange} />
        <TrackerColumnsBuilder fields={fields} includeStatus={includeStatus} configuring onFieldsChange={onFieldsChange} onRemoveField={remove}
          statusRemovalPending={removeField?.type === "status"}
          isPersisted={field => Boolean(configurationPreviousField(field, baseline))} fieldState={field => configurationFieldState(field, baseline)}
          onStatusChange={value => {
            const status = fields.find(field => field.type === "status");
            if (!value && status) remove(status);
            else if (value && !status) {
              const previous = baseline.fields.find(field => field.type === "status");
              const restored = draftField(previous || DEFAULT_STATUS_FIELD);
              const originalId = Object.entries(baseline.fieldIdentities || {}).find(([, key]) => key === previous?.key)?.[0];
              if (originalId) restored.uiId = originalId;
              const next = [...fields]; next.splice(Math.max(0, Math.min(baseline.fields.findIndex(field => field.type === "status"), next.length)), 0, restored); onFieldsChange(next);
            }
          }} />
        {!fields.length && <BuilderError id={`${id}-fields-error`}>Keep at least one tracker column.</BuilderError>}
      </div></motion.div>
    </fieldset>
    <motion.aside className="configure-preview-shell" id={`${id}-impact`} aria-label="Impact and preview" initial={false}
      animate={narrow ? { opacity: previewOpen ? 1 : 0, y: previewOpen || reduced ? 0 : 12, height: size.height - 20 }
        : { opacity: 1, y: 0, height: previewOpen ? size.height - 32 : 38 }} transition={spring}>
      <motion.div className="configure-preview-inner" inert={!previewOpen} aria-hidden={!previewOpen} initial={false}
        animate={{ opacity: previewOpen ? 1 : 0, x: previewOpen || reduced ? 0 : 8, filter: reduced ? "none" : previewOpen ? "blur(0px)" : "blur(3px)" }}
        transition={{ duration: reduced ? .06 : previewOpen ? .22 : .13, delay: reduced ? 0 : previewOpen ? .12 : .025 }}>
        <div className="configure-preview-heading"><span className="create-eyebrow">Impact &amp; Preview</span>
          <button ref={close} type="button" className="create-icon-button" aria-label="Collapse impact preview" aria-expanded={previewOpen} aria-controls={`${id}-impact`}
            onClick={() => setPreview(false)}>{narrow ? <X size={15} /> : <ChevronLeft size={15} />}</button></div>
        <div className="configure-impact-scroll"><TrackerImpactPreview draft={draft} baseline={baseline} fields={fields} clients={clients} entries={entries} changes={changes} loading={clientsLoading} saved={saved} /></div>
      </motion.div>
      <motion.button ref={reopen} type="button" className="configure-reopen" inert={previewOpen || narrow} aria-hidden={previewOpen || narrow}
        aria-label="Show impact preview" aria-expanded={previewOpen} aria-controls={`${id}-impact`} onClick={() => setPreview(true)} initial={false}
        animate={{ opacity: previewOpen ? 0 : 1 }} transition={{ duration: reduced ? .04 : .12, delay: previewOpen || reduced ? 0 : .22 }}>
        <ChevronLeft size={14} /><span>Preview</span>{changes.length > 0 && <small>{changes.length}</small>}
      </motion.button>
    </motion.aside>
    <ConfirmModal open={Boolean(removeField)} title={`Remove “${removeField?.label || "column"}”?`}
      description="Saving this removal clears this column’s values for clients currently in this tracker. Other columns and client records are kept."
      note="This changes the draft first. Values are cleared only when you save changes." confirmLabel="Remove column" variant="warning"
      onClose={() => setRemoveField(null)} onConfirm={() => {
        if (removeField) onFieldsChange(fields.filter(field => field.uiId !== removeField.uiId)); setRemoveField(null);
      }} />
  </motion.div>;
}

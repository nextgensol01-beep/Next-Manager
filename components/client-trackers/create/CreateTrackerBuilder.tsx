"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Columns3, Eye, FileCheck2, Mail, Plus, X } from "lucide-react";
import { GlassToggle } from "@/components/ui/liquid-glass/GlassToggle";
import { draftField, TRACKER_STARTERS, trackerAudience, trackerColumnSignature, type TrackerBuilderClient, type TrackerCreateDraft, type TrackerCreateErrors } from "@/lib/tracker-create";
import { BuilderChoices, BuilderError, BuilderSection } from "./BuilderControls";
import TrackerAudienceSection from "./TrackerAudienceSection";
import TrackerColumnsBuilder from "./TrackerColumnsBuilder";
import TrackerLivePreview from "./TrackerLivePreview";
import ClientDetailsPicker from "./ClientDetailsPicker";

export default function CreateTrackerBuilder({ form, clients, saving, errors, serverError, loadingClients, clientLoadError,
  starterId, onStarterChange, onChange, onSubmit }: {
  form: TrackerCreateDraft; clients: TrackerBuilderClient[]; saving: boolean;
  errors: TrackerCreateErrors; serverError: string | null; loadingClients: boolean; clientLoadError: string | null;
  starterId: string; onStarterChange: (id: string) => void;
  onChange: (form: TrackerCreateDraft) => void; onSubmit: (event: FormEvent) => void;
}) {
  const [baselineColumns, setBaselineColumns] = useState(() => trackerColumnSignature(form.fields, form.includeStatus));
  const [pendingStarter, setPendingStarter] = useState<string | null>(null);
  const customized = useMemo(() => trackerColumnSignature(form.fields, form.includeStatus) !== baselineColumns, [form.fields, form.includeStatus, baselineColumns]);
  const [previewOpen, setPreviewOpen] = useState(false), [narrow, setNarrow] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null), previewButton = useRef<HTMLButtonElement>(null), previewClose = useRef<HTMLButtonElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { scope, selected, selectedCategories } = form;
  const audience = useMemo(() => trackerAudience(clients, { scope, selected, selectedCategories }), [clients, scope, selected, selectedCategories]);
  useEffect(() => {
    const media = matchMedia("(max-width: 1023px)");
    const update = () => setNarrow(media.matches); update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => () => { if (scrollTimer.current) clearTimeout(scrollTimer.current); }, []);
  useEffect(() => { if (narrow && previewOpen) previewClose.current?.focus({ preventScroll: true }); }, [narrow, previewOpen]);
  const patch = (change: Partial<TrackerCreateDraft>) => onChange({ ...form, ...change });
  const applyStarter = (id: string) => {
    const starter = TRACKER_STARTERS.find(value => value.id === id) || TRACKER_STARTERS[0];
    const fields = starter.fields.map(draftField);
    patch({ fields, includeStatus: true });
    setBaselineColumns(trackerColumnSignature(fields, true));
    onStarterChange(starter.id); setPendingStarter(null);
  };
  const closePreview = () => {
    setPreviewOpen(false);
    // The builder becomes focusable again after React removes its inert state.
    requestAnimationFrame(() => previewButton.current?.focus({ preventScroll: true }));
  };
  return <form id="create-client-tracker" noValidate onSubmit={onSubmit} className={`create-workbench ${previewOpen ? "is-preview-open" : ""}`}
    aria-busy={saving} onKeyDown={event => {
      if (narrow && previewOpen && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closePreview(); }
    }}>
    <fieldset className="create-build" disabled={saving} inert={narrow && previewOpen}>
      <legend className="sr-only">Build your client tracker</legend>
      <div className="create-build-toolbar"><span className="create-eyebrow">Build</span><button ref={previewButton} type="button" className="create-preview-trigger"
        aria-expanded={previewOpen} aria-controls="create-preview-rail" onClick={() => setPreviewOpen(value => !value)}><Eye size={14} />Preview</button></div>
      <motion.div layoutScroll ref={scrollRef} className="create-builder-scroll" onScroll={() => {
        scrollRef.current?.classList.add("is-scrolling"); if (scrollTimer.current) clearTimeout(scrollTimer.current);
        scrollTimer.current = setTimeout(() => scrollRef.current?.classList.remove("is-scrolling"), 800);
      }}>
        <div className="create-builder-content">
          {serverError && <p className="create-server-error" role="alert">{serverError}</p>}
          <BuilderSection title="Start from" className="create-starter-section">
            <BuilderChoices label="Tracker starter" value={starterId} className="create-starters" options={[
              { value: "blank", label: "Blank", description: "Your own columns", icon: <Plus size={20} /> },
              { value: "follow-up", label: "Follow-up", description: "Tasks & priorities", icon: <Columns3 size={20} /> },
              { value: "cpcb", label: "CPCB", description: "Invoices & uploads", icon: <FileCheck2 size={20} /> },
            ]} onChange={id => {
              if (customized) setPendingStarter(id); else if (id !== starterId) applyStarter(id);
            }} />
            {pendingStarter && <div className="create-starter-confirm" role="status"><p>Replace your current columns with the {pendingStarter === "cpcb" ? "CPCB" : pendingStarter === "follow-up" ? "Follow-up" : "Blank"} starter?</p>
              <div><button type="button" className="create-text-action" onClick={() => setPendingStarter(null)}>Cancel</button><button type="button" className="create-confirm-action" onClick={() => applyStarter(pendingStarter)}>Replace columns</button></div>
            </div>}
          </BuilderSection>
          <BuilderSection title="Tracker details">
            <label className="create-field create-name"><span className="create-label">Tracker name</span><input id="create-tracker-name" autoFocus aria-required="true"
              aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "create-name-error" : undefined}
              value={form.name} placeholder="e.g. September invoice collection" onChange={event => patch({ name: event.target.value })} />
              <BuilderError id="create-name-error">{errors.name}</BuilderError>
            </label>
            <label className="create-field create-description"><span className="create-label">Description <span className="create-optional">Optional</span></span>
              <textarea aria-label="Tracker description" rows={2} value={form.description} placeholder="A short note about this worklist" onChange={event => patch({ description: event.target.value })} />
            </label>
          </BuilderSection>
          <TrackerAudienceSection form={form} clients={clients} count={audience.length} errors={errors} loading={loadingClients} loadError={clientLoadError} onChange={onChange} />
          <ClientDetailsPicker value={form.clientColumns} onChange={clientColumns => patch({ clientColumns })} />
          <TrackerColumnsBuilder fields={form.fields} includeStatus={form.includeStatus}
            onFieldsChange={fields => patch({ fields })} onStatusChange={includeStatus => patch({ includeStatus })} />
          <BuilderSection title="Optional" className="create-email-section"><div className="create-email-capability"><div><span className="create-label"><Mail size={15} />Email updates</span>
            <p className="create-help" id="create-email-help">{form.emailEnabled ? "Email tools will be available in this tracker. Configure workflows after creation." : "Enable email workflows, drafts, and reminders after the tracker is created."}</p>
          </div><GlassToggle checked={form.emailEnabled} aria-label="Enable email updates" aria-describedby="create-email-help" onCheckedChange={emailEnabled => patch({ emailEnabled })} /></div></BuilderSection>
        </div>
      </motion.div>
    </fieldset>
    <aside className="create-preview-rail" id="create-preview-rail" inert={narrow && !previewOpen}>
      <button ref={previewClose} type="button" className="create-preview-close create-icon-button" aria-label="Close tracker preview" onClick={closePreview}><X size={17} /></button>
      <TrackerLivePreview form={form} audience={audience} saving={saving} loading={loadingClients} />
    </aside>
  </form>;
}

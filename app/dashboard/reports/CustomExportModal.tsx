"use client";
import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { FINANCIAL_YEARS } from "@/lib/utils";
import { ChevronDown, Download, Search, Save, X } from "lucide-react";
import {
  CUSTOM_EXPORT_CLIENT_CATEGORIES,
  CUSTOM_EXPORT_PRESETS,
  CUSTOM_EXPORT_SORT_OPTIONS,
  type CustomClientExportField,
  type CustomClientExportFieldDefinition,
  type CustomExportClientCategory,
  type CustomExportPresetConfig,
  type CustomExportPresetDefinition,
  type CustomExportSortBy,
} from "@/lib/reports";
import {
  type AdvancedCustomExportSection,
  type ClientOption,
  type CustomExportPreview,
} from "./ReportsSupport";
import ReportSelect from "./ReportSelect";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { reportControlSpring, reportSoftSpring } from "./report-motion";

type CustomExportModalProps = {
  customExportOpen: boolean;
  customDownloading: boolean;
  allCustomExportFields: CustomClientExportFieldDefinition[];
  customExportGroups: Array<[string, CustomClientExportFieldDefinition[]]>;
  customFields: CustomClientExportField[];
  customFy: string;
  customCategories: CustomExportClientCategory[];
  selectedClientIds: string[];
  clientSearch: string;
  dateFrom: string;
  dateTo: string;
  includeOnlyNonEmpty: boolean;
  sortBy: CustomExportSortBy;
  userPresets: CustomExportPresetDefinition[];
  presetName: string;
  showAdvancedControls: boolean;
  activeAdvancedSection: AdvancedCustomExportSection;
  expandedFieldGroups: string[];
  allFieldsSelected: boolean;
  noFieldsSelected: boolean;
  usingExampleFields: boolean;
  filtersAreReset: boolean;
  clientsLoading: boolean;
  hasClientQuery: boolean;
  filteredClientOptions: ClientOption[];
  selectedClientSet: Set<string>;
  clientsLoadError: string;
  preview: CustomExportPreview | null;
  previewLoading: boolean;
  previewError: string;
  setCustomExportOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setCustomFields: React.Dispatch<React.SetStateAction<CustomClientExportField[]>>;
  setCustomFy: React.Dispatch<React.SetStateAction<string>>;
  setCustomCategories: React.Dispatch<React.SetStateAction<CustomExportClientCategory[]>>;
  setSelectedClientIds: React.Dispatch<React.SetStateAction<string[]>>;
  setClientSearch: React.Dispatch<React.SetStateAction<string>>;
  setDateFrom: React.Dispatch<React.SetStateAction<string>>;
  setDateTo: React.Dispatch<React.SetStateAction<string>>;
  setIncludeOnlyNonEmpty: React.Dispatch<React.SetStateAction<boolean>>;
  setSortBy: React.Dispatch<React.SetStateAction<CustomExportSortBy>>;
  setPresetName: React.Dispatch<React.SetStateAction<string>>;
  setClientLoadAttempt: React.Dispatch<React.SetStateAction<number>>;
  setExpandedFieldGroups: React.Dispatch<React.SetStateAction<string[]>>;
  toggleFieldGroup: (groupName: string) => void;
  toggleCustomField: (field: CustomClientExportField) => void;
  toggleAdvancedControls: () => void;
  toggleAdvancedSection: (section: AdvancedCustomExportSection) => void;
  isPresetActive: (config: CustomExportPresetConfig) => boolean;
  applyPreset: (config: CustomExportPresetConfig) => void;
  deletePreset: (presetId: string) => void;
  saveCurrentPreset: () => void;
  toggleCategory: (category: CustomExportClientCategory) => void;
  toggleClientSelection: (clientId: string) => void;
  downloadCustomExport: () => void;
};

export default function CustomExportModal({
  customExportOpen,
  customDownloading,
  allCustomExportFields,
  customExportGroups,
  customFields,
  customFy,
  customCategories,
  selectedClientIds,
  clientSearch,
  dateFrom,
  dateTo,
  includeOnlyNonEmpty,
  sortBy,
  userPresets,
  presetName,
  expandedFieldGroups,
  clientsLoading,
  hasClientQuery,
  filteredClientOptions,
  selectedClientSet,
  clientsLoadError,
  preview,
  previewLoading,
  previewError,
  setCustomExportOpen,
  setCustomFields,
  setCustomFy,
  setCustomCategories,
  setSelectedClientIds,
  setClientSearch,
  setDateFrom,
  setDateTo,
  setIncludeOnlyNonEmpty,
  setSortBy,
  setPresetName,
  setClientLoadAttempt,
  toggleFieldGroup,
  toggleCustomField,
  applyPreset,
  deletePreset,
  saveCurrentPreset,
  toggleCategory,
  toggleClientSelection,
  downloadCustomExport,
}: CustomExportModalProps) {
  const [step, setStep] = useState<"fields" | "filters" | "review">("fields");
  const [fieldQuery, setFieldQuery] = useState("");
  const [showPresets, setShowPresets] = useState(false);
  const reduceMotion = useReducedMotion();
  const steps = ["fields", "filters", "review"] as const;
  const index = steps.indexOf(step);
  const invalidDates = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const canDownload = !customDownloading && !previewLoading && !previewError && !invalidDates && Boolean(preview?.previewColumns.length) && customFields.length > 0;
  const goToStep = (next: typeof step) => {
    if (next !== "fields" && !customFields.length) return;
    setStep(next);
  };
  const moveField = (id: string, direction: number) => setCustomFields((current) => {
    const next = [...current]; const from = next.indexOf(id); const to = from + direction;
    if (from < 0 || to < 0 || to >= next.length) return current;
    [next[from], next[to]] = [next[to], next[from]]; return next;
  });
  const resetFilters = () => { setCustomCategories([]); setSelectedClientIds([]); setClientSearch(""); setDateFrom(""); setDateTo(""); setIncludeOnlyNonEmpty(false); setSortBy("companyName"); };
  const fieldById = new Map(allCustomExportFields.map((field) => [field.id, field]));
  return <Modal open={customExportOpen} onClose={() => !customDownloading && setCustomExportOpen(false)} title="Custom client export" hideHeader size="2xl" className="report-export-modal" bgColor="var(--color-card)" fluidMotion>
    <div className="report-export-header"><div><span className="report-eyebrow">EXCEL WORKBOOK</span><h3>Build your client export</h3></div><button className="report-icon-button" onClick={() => setCustomExportOpen(false)} disabled={customDownloading} aria-label="Close custom export"><X size={16} /></button></div>
    <nav className="report-export-steps" aria-label="Export steps">{steps.map((id, number) => <button key={id} aria-current={id === step ? "step" : undefined} disabled={customDownloading || (id !== "fields" && !customFields.length)} onClick={() => goToStep(id)}><span>{number + 1}</span>{["Choose fields", "Filter clients", "Review"][number]}</button>)}</nav>
    <div className="report-export-scroll custom-export-workspace"><AnimatePresence mode="wait" initial={false}><motion.div key={step} className="min-h-full" initial={reduceMotion ? false : { opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -10 }} transition={reduceMotion ? { duration: 0.01 } : reportSoftSpring}>
      {step === "fields" && <div className="report-export-field-layout">
        <section><div className="report-export-section-heading"><div><h4>Field library</h4><p className="report-caption">Add the information your workbook needs.</p></div><button className="report-text-button" onClick={() => setShowPresets((open) => !open)} aria-expanded={showPresets}><Save size={14} />Presets</button></div>
          <AnimatePresence initial={false}>{showPresets && <motion.div className="report-export-presets" initial={reduceMotion ? false : { opacity: 0, height: 0, y: -8 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, y: -6 }} transition={reduceMotion ? { duration: 0.01 } : reportControlSpring}><p className="report-caption">Ready-made templates and your saved configurations.</p>{[...userPresets, ...CUSTOM_EXPORT_PRESETS].map((preset) => <div key={preset.id} className="flex items-center gap-2"><button className="flex-1 rounded-lg px-3 py-2 text-left text-xs text-default hover:bg-surface" onClick={() => applyPreset(preset.config)}><strong className="block">{preset.name}</strong><span className="text-muted">{preset.description}</span></button>{userPresets.some((entry) => entry.id === preset.id) && <button className="report-icon-button" onClick={() => deletePreset(preset.id)} aria-label={`Delete ${preset.name}`}><X size={14} /></button>}</div>)}</motion.div>}</AnimatePresence>
          <label className="report-client-search !max-w-none mb-4"><Search size={16} /><input value={fieldQuery} onChange={(event) => setFieldQuery(event.target.value)} placeholder="Find a field…" aria-label="Search export fields" /></label>
          {customExportGroups.map(([group, fields]) => {
            const visible = fields.filter((field) => `${field.label} ${field.description} ${group}`.toLowerCase().includes(fieldQuery.toLowerCase()));
            if (!visible.length) return null;
            const open = Boolean(fieldQuery) || expandedFieldGroups.includes(group);
            return <section key={group} className="report-export-field-group"><button onClick={() => toggleFieldGroup(group)} aria-expanded={open} className="report-export-group-title"><span>{group}<small>{fields.filter((field) => customFields.includes(field.id)).length} / {fields.length}</small></span><motion.span animate={{ rotate: open ? 0 : -90 }} transition={reduceMotion ? { duration: 0.01 } : reportControlSpring}><ChevronDown size={15} /></motion.span></button><AnimatePresence initial={false}>{open && <motion.div className="report-export-field-options overflow-hidden" initial={reduceMotion ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }} transition={reduceMotion ? { duration: 0.01 } : reportSoftSpring}>{visible.map((field) => <label key={field.id}><input type="checkbox" checked={customFields.includes(field.id)} onChange={() => toggleCustomField(field.id)} /><span><strong>{field.label}</strong><small>{field.description}</small></span></label>)}</motion.div>}</AnimatePresence></section>;
          })}
          {fieldQuery && !allCustomExportFields.some((field) => `${field.label} ${field.description} ${field.group}`.toLowerCase().includes(fieldQuery.toLowerCase())) && <p className="py-8 text-center text-sm text-muted">No fields match your search.</p>}
        </section>
        <aside className="report-export-selected"><div className="report-export-section-heading"><div><h4>Your columns <span>{customFields.length}</span></h4><p className="report-caption">In the order they will appear.</p></div><button className="report-text-button" onClick={() => setCustomFields([])}>Clear</button></div><AnimatePresence initial={false}>{customFields.length ? customFields.map((id, position) => <motion.div layout={!reduceMotion} key={id} initial={reduceMotion ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8 }} transition={reduceMotion ? { duration: 0.01 } : reportControlSpring} className="report-export-selected-row"><span>{position + 1}</span><strong>{fieldById.get(id)?.label || id}</strong><button disabled={position === 0} onClick={() => moveField(id, -1)} aria-label={`Move ${fieldById.get(id)?.label || id} earlier`}><ChevronDown size={14} className="rotate-180" /></button><button disabled={position === customFields.length - 1} onClick={() => moveField(id, 1)} aria-label={`Move ${fieldById.get(id)?.label || id} later`}><ChevronDown size={14} /></button><button onClick={() => toggleCustomField(id)} aria-label={`Remove ${fieldById.get(id)?.label || id}`}><X size={14} /></button></motion.div>) : <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-10 text-center text-sm text-muted">Select a field from the library to get started.</motion.p>}</AnimatePresence></aside>
      </div>}
      {step === "filters" && <div className="report-export-filters"><div className="report-export-section-heading"><div><h4>Define your scope</h4><p className="report-caption">Leave categories and clients empty to include all clients.</p></div><button className="report-text-button" onClick={resetFilters}>Reset filters</button></div>
        <div className="grid gap-5 sm:grid-cols-2"><label className="report-export-label">Financial year<ReportSelect value={customFy} onChange={setCustomFy} ariaLabel="Export financial year" options={FINANCIAL_YEARS.map((year) => ({ value: year, label: year }))} /></label><label className="report-export-label">Sort workbook by<ReportSelect value={sortBy} onChange={(value) => setSortBy(value as CustomExportSortBy)} ariaLabel="Export sort order" options={CUSTOM_EXPORT_SORT_OPTIONS.map((sort) => ({ value: sort.id, label: sort.label }))} /></label></div>
        <fieldset className="report-export-filter-section"><legend>Client categories</legend><div className="flex flex-wrap gap-2">{CUSTOM_EXPORT_CLIENT_CATEGORIES.map((category) => <button key={category} aria-pressed={customCategories.includes(category)} className={`report-category-choice ${customCategories.includes(category) ? "is-active" : ""}`} onClick={() => toggleCategory(category)}>{category}</button>)}</div></fieldset>
        <div className="report-export-filter-section"><h4>Specific clients</h4><p className="report-caption">Search and select clients to limit the workbook. Search alone does not filter the export.</p><label className="report-client-search !max-w-none mt-3"><Search size={16} /><input value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} placeholder="Search by client name…" aria-label="Find export clients" /></label>
          {selectedClientIds.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{selectedClientIds.map((id) => <button key={id} className="report-filter-chip px-2 py-1 text-xs text-default" onClick={() => toggleClientSelection(id)} aria-label={`Remove client ${id}`}>{filteredClientOptions.find((client) => client.clientId === id)?.companyName || id}<X size={12} className="ml-2" /></button>)}</div>}
          {clientsLoadError ? <p className="mt-3 text-sm text-rose-600">{clientsLoadError}<button onClick={() => setClientLoadAttempt((attempt) => attempt + 1)} className="ml-2 underline">Retry</button></p> : clientsLoading ? <p className="mt-3 text-sm text-muted" role="status">Finding clients…</p> : hasClientQuery && <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-base">{filteredClientOptions.length ? filteredClientOptions.map((client) => <label key={client.clientId} className="flex items-center gap-3 border-b border-base p-3 last:border-0"><input type="checkbox" checked={selectedClientSet.has(client.clientId)} onChange={() => toggleClientSelection(client.clientId)} /><span className="text-xs text-default">{client.companyName}<small className="block text-muted">{client.clientId} · {client.category}</small></span></label>) : <p className="p-4 text-sm text-muted">No clients match that search.</p>}</div>}
        </div>
        <div className="report-export-filter-section"><h4>Related record dates <span className="font-normal text-muted">optional</span></h4><p className="report-caption">Applies to payments, invoices, documents, and emails. Other fields use the financial year or client record.</p><div className="grid grid-cols-2 gap-4 mt-3"><label className="report-export-label">From<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label className="report-export-label">Through<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /></label></div>{invalidDates && <p role="alert" className="mt-2 text-xs text-rose-600">The end date must be on or after the start date.</p>}</div>
        <label className="flex items-center gap-3 text-sm text-default"><input type="checkbox" checked={includeOnlyNonEmpty} onChange={(event) => setIncludeOnlyNonEmpty(event.target.checked)} />Omit columns that are empty for every matching client</label>
      </div>}
      {step === "review" && <section className="report-export-review"><div><h4>Your workbook, ready to review</h4><p className="report-caption">The preview shows up to five rows. Excel includes all matching clients.</p></div><div className="report-export-scope"><span>FY {customFy}</span><span>{customCategories.join(", ") || "All categories"}</span><span>{selectedClientIds.length ? `${selectedClientIds.length} selected clients` : "All clients"}</span><span>{CUSTOM_EXPORT_SORT_OPTIONS.find((entry) => entry.id === sortBy)?.label}</span>{(dateFrom || dateTo) && <span>{dateFrom || "Any start"} → {dateTo || "Any end"}</span>}{includeOnlyNonEmpty && <span>Empty columns omitted</span>}</div>
        {previewError || invalidDates ? <div role="alert" className="rounded-xl border border-rose-200 p-4 text-sm text-rose-600">{invalidDates ? "Correct the date range in Filter clients to continue." : previewError}<button onClick={() => setStep("filters")} className="block mt-2 underline">Review filters</button></div> : previewLoading || !preview ? <div role="status" className="p-12 text-center text-sm text-muted">Preparing your preview…</div> : <><div className="flex items-center justify-between"><strong className="text-sm text-default">{preview.summary.matchedClients} clients · {preview.previewColumns.length} columns</strong><span className="report-caption">Sample rows</span></div><div className="report-export-preview"><table><thead><tr>{preview.previewColumns.map((column) => <th key={column.id}>{column.label}</th>)}</tr></thead><tbody>{preview.sampleRows?.length ? preview.sampleRows.map((row, rowIndex) => <tr key={rowIndex}>{preview.previewColumns.map((column) => <td key={column.id}>{row[column.id] === "" || row[column.id] == null ? <span className="text-faint">—</span> : String(row[column.id])}</td>)}</tr>) : <tr><td colSpan={Math.max(1, preview.previewColumns.length)}>No clients match this scope. Return to filters to broaden it.</td></tr>}</tbody></table></div>{!preview.previewColumns.length && <p role="alert" className="text-sm text-rose-600">All selected columns are empty. Turn off “Omit columns” or choose more fields.</p>}</>}
        <div className="report-export-save"><div><h4>Use this setup again</h4><p className="report-caption">Save fields, order, FY, and filters to your account.</p></div><div className="flex gap-2 mt-3"><input value={presetName} maxLength={120} onChange={(event) => setPresetName(event.target.value)} className="input-field min-w-0 flex-1" placeholder="Name this export" aria-label="Export preset name" /><button onClick={saveCurrentPreset} disabled={!presetName.trim() || !customFields.length} className="report-secondary-button"><Save size={15} />Save preset</button></div></div>
      </section>}
    </motion.div></AnimatePresence></div>
    <footer className="report-export-footer"><div><strong>{step === "review" ? "Export all matching clients" : `Step ${index + 1} of 3`}</strong>{step === "review" ? `${preview?.summary.matchedClients ?? "—"} rows · ${preview?.previewColumns.length ?? "—"} columns · .xlsx` : `${customFields.length} columns selected`}</div>{index > 0 && <button onClick={() => goToStep(steps[index - 1])} disabled={customDownloading} className="report-secondary-button">Back</button>}{step === "review" ? <button onClick={downloadCustomExport} disabled={!canDownload} className="report-primary-button"><Download size={16} />{customDownloading ? "Preparing Excel…" : "Download Excel"}</button> : <button onClick={() => goToStep(steps[index + 1])} disabled={!customFields.length || invalidDates} className="report-primary-button">{step === "fields" ? "Continue to filters" : "Review workbook"}</button>}</footer>
  </Modal>;
}

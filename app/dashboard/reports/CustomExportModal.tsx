"use client";
import type React from "react";
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
  DEFAULT_CUSTOM_FIELDS,
  type AdvancedCustomExportSection,
  type ClientOption,
  type CustomExportPreview,
} from "./ReportsSupport";

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
  showAdvancedControls,
  activeAdvancedSection,
  expandedFieldGroups,
  allFieldsSelected,
  noFieldsSelected,
  usingExampleFields,
  filtersAreReset,
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
  setExpandedFieldGroups,
  toggleFieldGroup,
  toggleCustomField,
  toggleAdvancedControls,
  toggleAdvancedSection,
  isPresetActive,
  applyPreset,
  deletePreset,
  saveCurrentPreset,
  toggleCategory,
  toggleClientSelection,
  downloadCustomExport,
}: CustomExportModalProps) {
  return (    <Modal open={customExportOpen} onClose={() => !customDownloading && setCustomExportOpen(false)} title="Custom Client Export" size="2xl" className="!max-w-[1100px]" bgColor="var(--color-card)">
      <div className="space-y-4">
        <div className="rounded-2xl border border-base bg-surface/60 p-4">
          <h4 className="text-sm font-semibold text-default mb-1">Choose the client fields you want in the sheet</h4>
          <p className="text-sm text-muted">
            You can now mix client master data with related client records like contacts, billing, payments, FY summaries, invoices, uploads, documents, email history, and portal details.
          </p>
        </div>
    
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
          <div className="space-y-4">
            {customExportGroups.map(([groupName, fields]) => (
              <div
                key={groupName}
                className={`rounded-2xl border bg-card transition-all duration-200 ${
                  expandedFieldGroups.includes(groupName)
                    ? "border-brand-500/60 shadow-sm dark:bg-brand-900/5"
                    : "border-base"
                }`}
              >
                <div className="flex items-start gap-3 p-4">
                  <button
                    type="button"
                    onClick={() => toggleFieldGroup(groupName)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h5 className="text-sm font-semibold text-default">{groupName}</h5>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            fields.filter((field) => customFields.includes(field.id as CustomClientExportField)).length > 0
                              ? "bg-brand-500 text-white"
                              : "border border-base text-faint"
                          }`}>
                            {fields.filter((field) => customFields.includes(field.id as CustomClientExportField)).length} selected
                          </span>
                          <span className="rounded-full border border-base px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
                            {fields.length} fields
                          </span>
                        </div>
                        <p className="text-xs text-muted mt-1">
                          {fields.some((field) => field.fyScoped)
                            ? `Includes fields that use the selected FY ${customFy}`
                            : "All-time or client-level fields"}
                        </p>
                      </div>
                      <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform ${
                        expandedFieldGroups.includes(groupName) ? "rotate-180" : ""
                      }`} />
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`glass-pill ${fields.every((field) => customFields.includes(field.id as CustomClientExportField)) ? "glass-pill-active" : ""}`}
                    onClick={() => {
                      const fieldIds = fields.map((field) => field.id) as CustomClientExportField[];
                      setCustomFields((current) => Array.from(new Set<CustomClientExportField>([...current, ...fieldIds])));
                      setExpandedFieldGroups((current) => current.includes(groupName) ? current : [...current, groupName]);
                    }}
                  >
                    Select Group
                  </button>
                </div>
    
                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                    expandedFieldGroups.includes(groupName) ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="border-t border-base px-4 pb-4 pt-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {fields.map((field) => {
                          const fieldId = field.id as CustomClientExportField;
                          const isSelected = customFields.includes(fieldId);
                          return (
                            <label
                              key={field.id}
                              className={`rounded-2xl border p-4 cursor-pointer transition-all ${isSelected ? "border-brand-500 bg-brand-50/60 dark:bg-brand-900/15" : "border-base bg-surface/40 hover:bg-surface/70"}`}
                            >
                              <div className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  className="mt-1 rounded"
                                  checked={isSelected}
                                  onChange={() => toggleCustomField(fieldId)}
                                />
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="text-sm font-semibold text-default">{field.label}</div>
                                    {field.fyScoped && (
                                      <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300 bg-brand-100 dark:bg-brand-900/30 px-2 py-0.5 rounded-full">
                                        FY Based
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted mt-1">{field.description}</div>
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
    
          <div className="xl:sticky xl:top-0 xl:self-start space-y-4">
            <div className="rounded-2xl border border-base bg-card p-4">
              <div className="text-xs uppercase tracking-wide text-faint mb-3">Quick Actions</div>
              <div className="glass-tray" style={{ flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={`glass-pill ${allFieldsSelected ? "glass-pill-active" : ""}`}
                  onClick={() => setCustomFields(allCustomExportFields.map((field) => field.id))}
                >
                  Select All
                </button>
                <button
                  type="button"
                  className={`glass-pill ${usingExampleFields ? "glass-pill-active" : ""}`}
                  onClick={() => setCustomFields([...DEFAULT_CUSTOM_FIELDS])}
                >
                  Use Example
                </button>
                <button
                  type="button"
                  className={`glass-pill ${noFieldsSelected ? "glass-pill-active" : ""}`}
                  onClick={() => setCustomFields([])}
                >
                  Clear Fields
                </button>
                <button
                  type="button"
                  className={`glass-pill ${filtersAreReset ? "glass-pill-active" : ""}`}
                  onClick={() => {
                    setCustomCategories([]);
                    setSelectedClientIds([]);
                    setClientSearch("");
                    setDateFrom("");
                    setDateTo("");
                    setIncludeOnlyNonEmpty(false);
                    setSortBy("companyName");
                  }}
                >
                  Reset Filters
                </button>
              </div>
            </div>
    
            <div className="rounded-2xl border border-base bg-card p-3">
              <button
                type="button"
                onClick={toggleAdvancedControls}
                className="flex w-full items-center justify-between gap-3 rounded-xl bg-surface/40 px-3 py-2.5 text-left transition hover:bg-surface/70"
              >
                <div>
                  <div className="text-sm font-semibold text-default">More Options</div>
                  <div className="text-[11px] text-muted mt-0.5">Presets, filters, preview, and summary</div>
                </div>
                <ChevronDown className={`h-4 w-4 text-muted transition-transform ${showAdvancedControls ? "rotate-180" : ""}`} />
              </button>
            </div>
    
            <div
              className={`grid transition-[grid-template-rows,opacity,margin-top] duration-300 ease-out ${
                showAdvancedControls ? "mt-0 grid-rows-[1fr] opacity-100" : "mt-[-0.25rem] grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
              <div className="space-y-3 pt-1">
                <div className={`rounded-2xl border bg-card transition-colors ${
                  activeAdvancedSection === "presets"
                    ? "border-brand-500 bg-brand-50/30 shadow-sm dark:bg-brand-900/10"
                    : "border-base"
                }`}>
                  <button
                    type="button"
                    onClick={() => toggleAdvancedSection("presets")}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors ${
                      activeAdvancedSection === "presets" ? "text-brand-700 dark:text-brand-200" : ""
                    }`}
                  >
                    <div>
                      <div className="text-xs uppercase tracking-wide text-faint">Saved Presets</div>
                      <div className="text-sm text-muted mt-1">Use built-in or saved export setups</div>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted transition-transform ${activeAdvancedSection === "presets" ? "rotate-180" : ""}`} />
                  </button>
                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                      activeAdvancedSection === "presets" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                    <div className="border-t border-base px-4 pb-4 pt-3">
                      <div className="space-y-4">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-faint mb-2">Built-In Presets</div>
                        <div className="space-y-2">
                          {CUSTOM_EXPORT_PRESETS.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => applyPreset(preset.config)}
                              className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                                isPresetActive(preset.config)
                                  ? "border-brand-500 bg-brand-50/70 shadow-sm dark:bg-brand-900/20"
                                  : "border-base bg-surface/50 hover:bg-surface"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-semibold text-default">{preset.name}</div>
                                {isPresetActive(preset.config) && (
                                  <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                    Active
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-muted mt-1">{preset.description}</div>
                            </button>
                          ))}
                        </div>
                      </div>
    
                      <div>
                        <div className="text-xs uppercase tracking-wide text-faint mb-2">Your Presets</div>
                        <div className="space-y-2">
                          {userPresets.length > 0 ? userPresets.map((preset) => (
                            <div
                              key={preset.id}
                              className={`rounded-2xl border p-3 ${
                                isPresetActive(preset.config)
                                  ? "border-brand-500 bg-brand-50/70 shadow-sm dark:bg-brand-900/20"
                                  : "border-base bg-surface/50"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <button
                                  type="button"
                                  onClick={() => applyPreset(preset.config)}
                                  className="min-w-0 flex-1 text-left"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-sm font-semibold text-default truncate">{preset.name}</div>
                                    {isPresetActive(preset.config) && (
                                      <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                        Active
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted mt-1">{preset.description}</div>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deletePreset(preset.id)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-base text-muted transition hover:text-red-500 hover:border-red-300"
                                  aria-label={`Delete ${preset.name}`}
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )) : (
                            <div className="rounded-2xl border border-dashed border-base px-3 py-4 text-sm text-muted">
                              Save one of your current export setups here for reuse.
                            </div>
                          )}
                        </div>
                      </div>
    
                      <div className="space-y-2">
                        <label className="text-xs text-muted block">Save current setup</label>
                        <div className="flex gap-2">
                          <input
                            value={presetName}
                            onChange={(e) => setPresetName(e.target.value)}
                            placeholder="Preset name"
                            className="flex-1 rounded-xl border border-base bg-surface px-3 py-2.5 text-sm text-default outline-none focus:border-brand-500"
                            disabled={customDownloading}
                          />
                          <button type="button" className="glass-btn" style={{padding:"8px 10px"}} onClick={saveCurrentPreset} disabled={customDownloading}>
                            <Save className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      </div>
                    </div>
                    </div>
                  </div>
                </div>
    
                <div className={`rounded-2xl border bg-card transition-colors ${
                  activeAdvancedSection === "filters"
                    ? "border-brand-500 bg-brand-50/30 shadow-sm dark:bg-brand-900/10"
                    : "border-base"
                }`}>
                  <button
                    type="button"
                    onClick={() => toggleAdvancedSection("filters")}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors ${
                      activeAdvancedSection === "filters" ? "text-brand-700 dark:text-brand-200" : ""
                    }`}
                  >
                    <div>
                      <div className="text-xs uppercase tracking-wide text-faint">Filters</div>
                      <div className="text-sm text-muted mt-1">Financial year, category, client, date range, and sorting</div>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted transition-transform ${activeAdvancedSection === "filters" ? "rotate-180" : ""}`} />
                  </button>
                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                      activeAdvancedSection === "filters" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                    <div className="border-t border-base px-4 pb-4 pt-3">
                      <div className="space-y-4">
                <label className="block">
                  <span className="text-xs text-muted mb-2 block">Financial Year</span>
                  <select
                    value={customFy}
                    onChange={(e) => setCustomFy(e.target.value)}
                    className="w-full rounded-xl border border-base bg-surface px-3 py-2.5 text-sm text-default outline-none focus:border-brand-500"
                    disabled={customDownloading}
                  >
                    {FINANCIAL_YEARS.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
    
                <div>
                  <div className="text-xs text-muted mb-2">Category Filter</div>
                  <div className="flex flex-wrap gap-2">
                    {CUSTOM_EXPORT_CLIENT_CATEGORIES.map((category) => {
                      const active = customCategories.includes(category);
                      return (
                        <button
                          key={category}
                          type="button"
                          onClick={() => toggleCategory(category)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                            active
                              ? "border-brand-500 bg-brand-500 text-white"
                              : "border-base bg-surface text-muted hover:text-default"
                          }`}
                        >
                          {category}
                        </button>
                      );
                    })}
                  </div>
                </div>
    
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs text-muted">Client Filter</span>
                    <span className="text-[11px] text-faint">{selectedClientIds.length} selected</span>
                  </div>
                  <div className="relative mb-2">
                    <Search className="w-4 h-4 text-faint absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="Search company or client ID"
                      className="w-full rounded-xl border border-base bg-surface pl-9 pr-3 py-2.5 text-sm text-default outline-none focus:border-brand-500"
                      disabled={customDownloading}
                    />
                  </div>
                  <div className="glass-tray mb-2">
                    <button
                      type="button"
                      className={`glass-pill ${filteredClientOptions.length > 0 && filteredClientOptions.every((client) => selectedClientSet.has(client.clientId)) ? "glass-pill-active" : ""}`}
                      onClick={() => {
                        const visibleIds = filteredClientOptions.map((client) => client.clientId);
                        setSelectedClientIds((current) => Array.from(new Set([...current, ...visibleIds])));
                      }}
                      disabled={clientsLoading || !hasClientQuery || filteredClientOptions.length === 0}
                    >
                      Select Visible
                    </button>
                    <button
                      type="button"
                      className={`glass-pill ${selectedClientIds.length === 0 ? "glass-pill-active" : ""}`}
                      onClick={() => setSelectedClientIds([])}
                      disabled={selectedClientIds.length === 0}
                    >
                      Clear Selection
                    </button>
                  </div>
                  <div className="relative">
                    <div
                      className={`absolute inset-x-0 top-0 overflow-hidden rounded-2xl border border-base bg-surface/40 transition-[height] duration-200 ease-out ${
                        hasClientQuery ? "h-56" : "h-[4.5rem]"
                      }`}
                    >
                      <div className="h-full overflow-y-auto">
                      {!hasClientQuery ? (
                        <div className="px-3 py-4 text-sm text-muted">
                          Type a company name or client ID, or choose a category to start searching clients.
                        </div>
                      ) : clientsLoading ? (
                        <div className="px-3 py-4 text-sm text-muted">
                          {clientSearch.trim() || customCategories.length > 0 ? "Searching matching clients..." : "Loading clients..."}
                        </div>
                      ) : clientsLoadError ? (
                        <div className="px-3 py-4">
                          <div className="text-sm text-red-500 dark:text-red-300">{clientsLoadError}</div>
                          <button
                            type="button"
                            className="glass-btn"
                            style={{marginTop:"10px"}}
                            onClick={() => setClientLoadAttempt((current) => current + 1)}
                          >
                            Retry Loading Clients
                          </button>
                        </div>
                      ) : filteredClientOptions.length > 0 ? (
                        filteredClientOptions.map((client) => {
                          const selected = selectedClientSet.has(client.clientId);
                          return (
                            <label
                              key={client.clientId}
                              className={`flex cursor-pointer items-start gap-3 border-b border-base/70 px-3 py-3 last:border-b-0 ${
                                selected ? "bg-brand-50/60 dark:bg-brand-900/15" : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="mt-1 rounded"
                                checked={selected}
                                onChange={() => toggleClientSelection(client.clientId)}
                              />
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-default truncate">{client.companyName}</div>
                                <div className="text-xs text-muted mt-0.5">
                                  {client.clientId} · {client.category}
                                </div>
                              </div>
                            </label>
                          );
                        })
                      ) : (
                        <div className="px-3 py-4 text-sm text-muted">
                          {clientSearch.trim() || customCategories.length > 0
                            ? "No clients match the current search and category filter."
                            : "No clients available to select right now."}
                        </div>
                      )}
                      </div>
                    </div>
                    <div
                      aria-hidden="true"
                      className={`transition-[height] duration-200 ease-out ${
                        hasClientQuery ? "h-56" : "h-[4.5rem]"
                      }`}
                    />
                  </div>
                </div>
    
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs text-muted mb-2 block">Date From</span>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full rounded-xl border border-base bg-surface px-3 py-2.5 text-sm text-default outline-none focus:border-brand-500"
                      disabled={customDownloading}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted mb-2 block">Date To</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full rounded-xl border border-base bg-surface px-3 py-2.5 text-sm text-default outline-none focus:border-brand-500"
                      disabled={customDownloading}
                    />
                  </label>
                </div>
    
                <label className="flex items-start gap-3 rounded-2xl border border-base bg-surface/40 px-3 py-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 rounded"
                    checked={includeOnlyNonEmpty}
                    onChange={(e) => setIncludeOnlyNonEmpty(e.target.checked)}
                  />
                  <div>
                    <div className="text-sm font-medium text-default">Include Only Non-Empty Fields</div>
                    <div className="text-xs text-muted mt-1">Hide selected columns that would be completely blank for the current export.</div>
                  </div>
                </label>
    
                <label className="block">
                  <span className="text-xs text-muted mb-2 block">Sort By</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as CustomExportSortBy)}
                    className="w-full rounded-xl border border-base bg-surface px-3 py-2.5 text-sm text-default outline-none focus:border-brand-500"
                    disabled={customDownloading}
                  >
                    {CUSTOM_EXPORT_SORT_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div className="text-xs text-muted mt-2">
                    {CUSTOM_EXPORT_SORT_OPTIONS.find((option) => option.id === sortBy)?.description}
                  </div>
                </label>
                      </div>
                    </div>
                    </div>
                  </div>
                </div>
    
                <div className={`rounded-2xl border bg-card transition-colors ${
                  activeAdvancedSection === "selected-fields"
                    ? "border-brand-500 bg-brand-50/30 shadow-sm dark:bg-brand-900/10"
                    : "border-base"
                }`}>
                  <button
                    type="button"
                    onClick={() => toggleAdvancedSection("selected-fields")}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors ${
                      activeAdvancedSection === "selected-fields" ? "text-brand-700 dark:text-brand-200" : ""
                    }`}
                  >
                    <div>
                      <div className="text-xs uppercase tracking-wide text-faint">Selected Fields</div>
                      <div className="text-sm text-muted mt-1">{customFields.length} fields currently selected</div>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted transition-transform ${activeAdvancedSection === "selected-fields" ? "rotate-180" : ""}`} />
                  </button>
                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                      activeAdvancedSection === "selected-fields" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                    <div className="border-t border-base px-4 pb-4 pt-3">
                      <div className="flex flex-wrap gap-2">
                        {customFields.length > 0 ? customFields.map((fieldId) => {
                          const field = allCustomExportFields.find((entry) => entry.id === fieldId);
                          return (
                            <span key={fieldId} className="text-xs font-medium text-default bg-surface px-2.5 py-1 rounded-full border border-base">
                              {field?.label || fieldId}
                            </span>
                          );
                        }) : (
                          <span className="text-sm text-muted">No fields selected yet.</span>
                        )}
                      </div>
                    </div>
                    </div>
                  </div>
                </div>
    
                <div className={`rounded-2xl border bg-card transition-colors ${
                  activeAdvancedSection === "preview"
                    ? "border-brand-500 bg-brand-50/30 shadow-sm dark:bg-brand-900/10"
                    : "border-base"
                }`}>
                  <button
                    type="button"
                    onClick={() => toggleAdvancedSection("preview")}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors ${
                      activeAdvancedSection === "preview" ? "text-brand-700 dark:text-brand-200" : ""
                    }`}
                  >
                    <div>
                      <div className="text-xs uppercase tracking-wide text-faint">Preview Columns</div>
                      <div className="text-sm text-muted mt-1">See the final export sheet structure before download</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {previewLoading && <span className="text-[11px] text-brand-600">Refreshing...</span>}
                      <ChevronDown className={`h-4 w-4 text-muted transition-transform ${activeAdvancedSection === "preview" ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                      activeAdvancedSection === "preview" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                    <div className="border-t border-base px-4 pb-4 pt-3">
                      {previewError ? (
                        <div className="rounded-xl border border-red-200 bg-red-50/80 px-3 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
                          {previewError}
                        </div>
                      ) : preview?.previewColumns?.length ? (
                        <div className="space-y-2">
                          {preview.previewColumns.map((column, index) => (
                            <div key={column.id} className="rounded-2xl border border-base bg-surface/40 px-3 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-default">
                                    {index + 1}. {column.label}
                                  </div>
                                  <div className="text-xs text-muted mt-1">
                                    {column.group}
                                    {column.fyScoped ? ` · FY ${preview.fy}` : " · Global"}
                                  </div>
                                </div>
                                <span className="shrink-0 rounded-full border border-base bg-card px-2.5 py-1 text-[11px] font-medium text-muted">
                                  {column.nonEmptyCount} non-empty
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted">Select fields to see the final sheet structure.</div>
                      )}
                    </div>
                    </div>
                  </div>
                </div>
    
                <div className={`rounded-2xl border bg-card transition-colors ${
                  activeAdvancedSection === "summary"
                    ? "border-brand-500 bg-brand-50/30 shadow-sm dark:bg-brand-900/10"
                    : "border-base"
                }`}>
                  <button
                    type="button"
                    onClick={() => toggleAdvancedSection("summary")}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors ${
                      activeAdvancedSection === "summary" ? "text-brand-700 dark:text-brand-200" : ""
                    }`}
                  >
                    <div>
                      <div className="text-xs uppercase tracking-wide text-faint">Export Count Summary</div>
                      <div className="text-sm text-muted mt-1">Matched clients and data coverage at a glance</div>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted transition-transform ${activeAdvancedSection === "summary" ? "rotate-180" : ""}`} />
                  </button>
                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                      activeAdvancedSection === "summary" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                    <div className="border-t border-base px-4 pb-4 pt-3">
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: "Matched Clients", value: preview?.summary.matchedClients ?? 0 },
                          { label: "With Contacts", value: preview?.summary.withContacts ?? 0 },
                          { label: "With Billing", value: preview?.summary.withBilling ?? 0 },
                          { label: "With Payments", value: preview?.summary.withPayments ?? 0 },
                          { label: "With Emails", value: preview?.summary.withEmails ?? 0 },
                          { label: "With Documents", value: preview?.summary.withDocuments ?? 0 },
                          { label: "With Annual Return", value: preview?.summary.withAnnualReturn ?? 0 },
                        ].map((item) => (
                          <div key={item.label} className="rounded-2xl border border-base bg-surface/40 px-3 py-3">
                            <div className="text-lg font-semibold text-default">{item.value}</div>
                            <div className="text-xs text-muted mt-1">{item.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </div>
    
            <div className="rounded-2xl border border-base bg-card p-4 space-y-3">
              <div className="text-xs uppercase tracking-wide text-faint">Actions</div>
              <div className="text-sm text-muted">
                {preview
                  ? `${preview.summary.matchedClients} clients matched and ${preview.previewColumns.length} columns will be exported.`
                  : "The export file will be generated with your current field and filter setup."}
              </div>
              <button type="button" className="btn-primary w-full justify-center" onClick={downloadCustomExport} disabled={customDownloading || customFields.length === 0}>
                <Download className="w-4 h-4" />
                {customDownloading ? "Generating..." : "Download Custom Export"}
              </button>
              <button type="button" className="btn-secondary w-full justify-center" onClick={() => setCustomExportOpen(false)} disabled={customDownloading}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

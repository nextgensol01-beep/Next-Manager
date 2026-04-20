"use client";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import { FINANCIAL_YEARS } from "@/lib/utils";
import { ChevronDown, Download, Users, Leaf, ArrowLeftRight, CreditCard, FileText, Upload, ClipboardCheck, SlidersHorizontal, Search, Save, X } from "lucide-react";
import toast from "react-hot-toast";
import FYTabBar from "@/components/ui/FYTabBar";
import { useFinancialYearState } from "@/app/providers";
import {
  CUSTOM_CLIENT_EXPORT_FIELDS,
  CUSTOM_EXPORT_CLIENT_CATEGORIES,
  CUSTOM_EXPORT_PRESETS,
  CUSTOM_EXPORT_SORT_OPTIONS,
  REPORT_DEFINITIONS,
  REPORT_FILE_PREFIX,
  type CustomExportClientCategory,
  type CustomExportPresetConfig,
  type CustomExportPresetDefinition,
  type CustomExportSortBy,
  type CustomClientExportFieldDefinition,
  type CustomClientExportField,
  type ReportType,
} from "@/lib/reports";

const DEFAULT_CUSTOM_FIELDS: CustomClientExportField[] = ["companyName", "state", "gstNumber"];
const CUSTOM_EXPORT_USER_PRESETS_KEY = "reports.customExportPresets.v1";

type ClientOption = {
  clientId: string;
  companyName: string;
  category: string;
};

type CustomExportPreview = {
  fy: string;
  fields: CustomClientExportField[];
  previewColumns: Array<{
    id: CustomClientExportField;
    label: string;
    group: string;
    fyScoped: boolean;
    nonEmptyCount: number;
  }>;
  summary: {
    matchedClients: number;
    withContacts: number;
    withBilling: number;
    withPayments: number;
    withDocuments: number;
    withEmails: number;
    withAnnualReturn: number;
  };
};

type AdvancedCustomExportSection =
  | "presets"
  | "filters"
  | "selected-fields"
  | "preview"
  | "summary";

function arraysEqual<T>(left: T[], right: T[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameMembers<T extends string>(left: T[], right: T[]) {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

const REPORT_VISUALS: Record<ReportType, { icon: typeof Users; color: string; darkColor: string }> = {
  targets: { icon: Users, color: "bg-blue-50 text-blue-600", darkColor: "dark:bg-blue-900/30 dark:text-blue-400" },
  pwp: { icon: Leaf, color: "bg-emerald-50 text-emerald-600", darkColor: "dark:bg-emerald-900/30 dark:text-emerald-400" },
  transactions: { icon: ArrowLeftRight, color: "bg-violet-50 text-violet-600", darkColor: "dark:bg-violet-900/30 dark:text-violet-400" },
  payments: { icon: CreditCard, color: "bg-amber-50 text-amber-600", darkColor: "dark:bg-amber-900/30 dark:text-amber-400" },
  invoices: { icon: FileText, color: "bg-rose-50 text-rose-600", darkColor: "dark:bg-rose-900/30 dark:text-rose-400" },
  "annual-return": { icon: ClipboardCheck, color: "bg-indigo-50 text-indigo-600", darkColor: "dark:bg-indigo-900/30 dark:text-indigo-400" },
  uploads: { icon: Upload, color: "bg-teal-50 text-teal-600", darkColor: "dark:bg-teal-900/30 dark:text-teal-400" },
};

const REPORT_TYPES = REPORT_DEFINITIONS.map((report) => ({
  ...report,
  ...REPORT_VISUALS[report.id],
}));

const CUSTOM_EXPORT_GROUPS = Array.from(
  CUSTOM_CLIENT_EXPORT_FIELDS.reduce((map, field) => {
    const existing = map.get(field.group) || [];
    existing.push(field);
    map.set(field.group, existing);
    return map;
  }, new Map<string, CustomClientExportFieldDefinition[]>())
);

export default function ReportsPage() {
  const [fy, setFy] = useFinancialYearState();
  const [downloading, setDownloading] = useState<ReportType[]>([]);
  const [customExportOpen, setCustomExportOpen] = useState(false);
  const [customDownloading, setCustomDownloading] = useState(false);
  const [customFields, setCustomFields] = useState<CustomClientExportField[]>(DEFAULT_CUSTOM_FIELDS);
  const [customFy, setCustomFy] = useFinancialYearState();
  const [customCategories, setCustomCategories] = useState<CustomExportClientCategory[]>([]);
  const [availableClients, setAvailableClients] = useState<ClientOption[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsLoadError, setClientsLoadError] = useState("");
  const [clientLoadAttempt, setClientLoadAttempt] = useState(0);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [includeOnlyNonEmpty, setIncludeOnlyNonEmpty] = useState(false);
  const [sortBy, setSortBy] = useState<CustomExportSortBy>("companyName");
  const [preview, setPreview] = useState<CustomExportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [userPresets, setUserPresets] = useState<CustomExportPresetDefinition[]>([]);
  const [presetName, setPresetName] = useState("");
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const [activeAdvancedSection, setActiveAdvancedSection] = useState<AdvancedCustomExportSection>("presets");
  const [expandedFieldGroups, setExpandedFieldGroups] = useState<string[]>(() => (
    CUSTOM_EXPORT_GROUPS[0] ? [CUSTOM_EXPORT_GROUPS[0][0]] : []
  ));

  const downloadBlobResponse = async (response: Response, fallbackName: string) => {
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const contentDisposition = response.headers.get("content-disposition") || "";
    const filenameMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
    const downloadName = filenameMatch?.[1] || fallbackName;
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const filteredClientOptions = useMemo(() => availableClients, [availableClients]);

  const selectedClientSet = useMemo(() => new Set(selectedClientIds), [selectedClientIds]);
  const hasClientQuery = clientSearch.trim().length > 0 || customCategories.length > 0;
  const allFieldsSelected = customFields.length === CUSTOM_CLIENT_EXPORT_FIELDS.length;
  const usingExampleFields = arraysEqual(customFields, DEFAULT_CUSTOM_FIELDS);
  const noFieldsSelected = customFields.length === 0;
  const filtersAreReset = (
    customCategories.length === 0 &&
    selectedClientIds.length === 0 &&
    clientSearch === "" &&
    dateFrom === "" &&
    dateTo === "" &&
    !includeOnlyNonEmpty &&
    sortBy === "companyName"
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(CUSTOM_EXPORT_USER_PRESETS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      setUserPresets(parsed.filter((preset) => preset && typeof preset.id === "string" && typeof preset.name === "string"));
    } catch {
      // Ignore malformed preset storage and continue with no saved presets.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CUSTOM_EXPORT_USER_PRESETS_KEY, JSON.stringify(userPresets));
  }, [userPresets]);

  useEffect(() => {
    const firstGroup = CUSTOM_EXPORT_GROUPS[0]?.[0];
    const groupsWithSelectedFields = CUSTOM_EXPORT_GROUPS
      .filter(([, fields]) => fields.some((field) => customFields.includes(field.id as CustomClientExportField)))
      .map(([groupName]) => groupName);

    setExpandedFieldGroups((current) => {
      const next = Array.from(new Set([
        ...(firstGroup ? [firstGroup] : []),
        ...current,
        ...groupsWithSelectedFields,
      ]));

      return arraysEqual(current, next) ? current : next;
    });
  }, [customFields]);

  useEffect(() => {
    if (!customExportOpen) return;
    if (!hasClientQuery) {
      setAvailableClients([]);
      setClientsLoadError("");
      setClientsLoading(false);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setClientsLoading(true);
      setClientsLoadError("");
      try {
        const params = new URLSearchParams({ summary: "1" });
        const trimmedSearch = clientSearch.trim();
        if (trimmedSearch) {
          params.set("search", trimmedSearch);
        }
        if (customCategories.length > 0) {
          params.set("categories", customCategories.join(","));
        }

        const response = await fetch(`/api/clients?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load clients");
        const data = await response.json();
        if (cancelled) return;
        const nextClients = Array.isArray(data)
          ? data.map((client) => ({
              clientId: String(client.clientId || ""),
              companyName: String(client.companyName || ""),
              category: String(client.category || ""),
            })).filter((client) => client.clientId && client.companyName)
          : [];
        setAvailableClients(nextClients);
      } catch {
        if (!cancelled) {
          setClientsLoadError("Unable to load clients for custom export");
          toast.error("Unable to load clients for custom export");
        }
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [clientLoadAttempt, clientSearch, customCategories, customExportOpen, hasClientQuery]);

  useEffect(() => {
    if (!customExportOpen || customFields.length === 0) {
      setPreview(null);
      setPreviewError("");
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError("");
      try {
        const response = await fetch("/api/reports/custom-export/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            fields: customFields,
            fy: customFy,
            categories: customCategories,
            clientIds: selectedClientIds,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            includeOnlyNonEmpty,
            sortBy,
          }),
        });
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setPreview(null);
          setPreviewError(typeof body?.error === "string" ? body.error : "Failed to load preview");
          return;
        }
        setPreview(body as CustomExportPreview);
      } catch {
        if (!cancelled) {
          setPreview(null);
          setPreviewError("Failed to load preview");
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    customExportOpen,
    customFields,
    customFy,
    customCategories,
    selectedClientIds,
    dateFrom,
    dateTo,
    includeOnlyNonEmpty,
    sortBy,
  ]);

  const downloadReport = async (type: ReportType) => {
    if (downloading.includes(type)) return;
    setDownloading((current) => [...current, type]);
    try {
      const r = await fetch(
        `/api/reports/export?type=${encodeURIComponent(type)}&fy=${encodeURIComponent(fy)}`,
        { cache: "no-store" }
      );
      if (!r.ok) {
        let message = "Failed to generate report";
        try {
          const errorBody = await r.json();
          if (typeof errorBody?.error === "string" && errorBody.error.trim()) {
            message = errorBody.error;
          }
        } catch {
          // Ignore JSON parsing failures and keep the generic message.
        }
        toast.error(message);
        return;
      }
      await downloadBlobResponse(r, `${REPORT_FILE_PREFIX[type]}-${fy}.xlsx`);
      toast.success("Report downloaded!");
    } catch {
      toast.error("Error generating report");
    } finally {
      setDownloading((current) => current.filter((reportType) => reportType !== type));
    }
  };

  const toggleCustomField = (field: CustomClientExportField) => {
    setCustomFields((current) => (
      current.includes(field)
        ? current.filter((entry) => entry !== field)
        : [...current, field]
    ));
  };

  const downloadCustomExport = async () => {
    if (customFields.length === 0) {
      toast.error("Select at least one field");
      return;
    }

    setCustomDownloading(true);
    try {
      const r = await fetch("/api/reports/custom-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          fields: customFields,
          fy: customFy,
          categories: customCategories,
          clientIds: selectedClientIds,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          includeOnlyNonEmpty,
          sortBy,
        }),
      });
      if (!r.ok) {
        let message = "Failed to generate custom export";
        try {
          const errorBody = await r.json();
          if (typeof errorBody?.error === "string" && errorBody.error.trim()) {
            message = errorBody.error;
          }
        } catch {
          // Ignore JSON parsing failures and keep the generic message.
        }
        toast.error(message);
        return;
      }
      await downloadBlobResponse(r, "custom-client-export.xlsx");
      toast.success("Custom export downloaded!");
      setCustomExportOpen(false);
    } catch {
      toast.error("Error generating custom export");
    } finally {
      setCustomDownloading(false);
    }
  };

  const openCustomExport = () => {
    setCustomFy(fy);
    setCustomExportOpen(true);
  };

  const toggleCategory = (category: CustomExportClientCategory) => {
    setCustomCategories((current) => (
      current.includes(category)
        ? current.filter((entry) => entry !== category)
        : [...current, category]
    ));
  };

  const toggleClientSelection = (clientId: string) => {
    setSelectedClientIds((current) => (
      current.includes(clientId)
        ? current.filter((entry) => entry !== clientId)
        : [...current, clientId]
    ));
  };

  const applyPreset = (config: CustomExportPresetConfig) => {
    setCustomFields(config.fields.length > 0 ? [...config.fields] : [...DEFAULT_CUSTOM_FIELDS]);
    setCustomCategories([...(config.categories || [])]);
    setSelectedClientIds([...(config.clientIds || [])]);
    setDateFrom(config.dateFrom || "");
    setDateTo(config.dateTo || "");
    setIncludeOnlyNonEmpty(Boolean(config.includeOnlyNonEmpty));
    setSortBy(config.sortBy || "companyName");
    if (config.fy) setCustomFy(config.fy);
  };

  const isPresetActive = (config: CustomExportPresetConfig) => (
    arraysEqual(customFields, config.fields.length > 0 ? [...config.fields] : DEFAULT_CUSTOM_FIELDS) &&
    sameMembers(customCategories, [...(config.categories || [])]) &&
    sameMembers(selectedClientIds, [...(config.clientIds || [])]) &&
    dateFrom === (config.dateFrom || "") &&
    dateTo === (config.dateTo || "") &&
    includeOnlyNonEmpty === Boolean(config.includeOnlyNonEmpty) &&
    sortBy === (config.sortBy || "companyName") &&
    customFy === (config.fy || customFy)
  );

  const saveCurrentPreset = () => {
    const trimmedName = presetName.trim();
    if (!trimmedName) {
      toast.error("Enter a preset name");
      return;
    }

    const preset: CustomExportPresetDefinition = {
      id: `user-${Date.now()}`,
      name: trimmedName,
      description: "Saved in this browser",
      config: {
        fields: customFields,
        fy: customFy,
        categories: customCategories,
        clientIds: selectedClientIds,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        includeOnlyNonEmpty,
        sortBy,
      },
    };

    setUserPresets((current) => [preset, ...current]);
    setPresetName("");
    toast.success("Preset saved");
  };

  const deletePreset = (presetId: string) => {
    setUserPresets((current) => current.filter((preset) => preset.id !== presetId));
  };

  const toggleFieldGroup = (groupName: string) => {
    setExpandedFieldGroups((current) => {
      if (current.includes(groupName)) {
        return current.filter((entry) => entry !== groupName);
      }
      return [...current, groupName];
    });
  };

  const toggleAdvancedControls = () => {
    setShowAdvancedControls((current) => {
      const next = !current;
      if (next) {
        setActiveAdvancedSection("presets");
      }
      return next;
    });
  };

  const toggleAdvancedSection = (section: AdvancedCustomExportSection) => {
    setActiveAdvancedSection((current) => (current === section ? current : section));
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Export operational data as Excel files for analysis, sharing, and records"
        action={(
          <button className="btn-secondary" onClick={openCustomExport}>
            <SlidersHorizontal className="w-4 h-4" />
            Custom Export
          </button>
        )}
      />

      <FYTabBar value={fy} onChange={setFy} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {REPORT_TYPES.map(({ id, label, description, icon: Icon, color, darkColor }) => (
          <div key={id} className="bg-card border border-base rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${color} ${darkColor}`}>
              <Icon className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-default mb-1">{label}</h3>
            <p className="text-xs text-muted mb-4 leading-relaxed">{description}</p>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-medium text-faint bg-surface px-2 py-0.5 rounded-full">FY {fy}</span>
              <span className="text-xs text-faint">&bull;</span>
              <span className="text-xs text-faint">Excel .xlsx</span>
            </div>
            <button
              onClick={() => downloadReport(id)}
              disabled={downloading.includes(id)}
              className="btn-primary w-full justify-center"
            >
              <Download className="w-4 h-4" />
              {downloading.includes(id) ? "Generating..." : "Download"}
            </button>
          </div>
        ))}
      </div>

      <div className="bg-card border border-base rounded-2xl p-5 transition-colors">
        <h4 className="font-semibold text-default mb-3 flex items-center gap-2">
          <span className="w-5 h-5 bg-brand-100 dark:bg-brand-900/40 text-brand-600 rounded flex items-center justify-center text-xs">i</span>
          About Exports
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs text-muted">
          {REPORT_TYPES.map((report) => (
            <div key={`${report.id}-about`}>
              <strong className="text-default">{report.label}</strong> - {report.summary}
            </div>
          ))}
        </div>
      </div>

      <Modal open={customExportOpen} onClose={() => !customDownloading && setCustomExportOpen(false)} title="Custom Client Export" size="xl">
        <div className="space-y-4">
          <div className="rounded-2xl border border-base bg-surface/60 p-4">
            <h4 className="text-sm font-semibold text-default mb-1">Choose the client fields you want in the sheet</h4>
            <p className="text-sm text-muted">
              You can now mix client master data with related client records like contacts, billing, payments, FY summaries, invoices, uploads, documents, email history, and portal details.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
            <div className="space-y-4">
              {CUSTOM_EXPORT_GROUPS.map(([groupName, fields]) => (
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
                      className={`btn-secondary !py-1.5 !text-xs shrink-0 ${
                        fields.every((field) => customFields.includes(field.id as CustomClientExportField))
                          ? "!border-brand-500 !bg-brand-50 !text-brand-700 dark:!bg-brand-900/20 dark:!text-brand-300"
                          : ""
                      }`}
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

            <div className="xl:sticky xl:top-24 xl:self-start xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-1 space-y-4">
              <div className="rounded-2xl border border-base bg-card p-4">
                <div className="text-xs uppercase tracking-wide text-faint mb-2">Quick Actions</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`btn-secondary !py-1.5 !text-xs ${allFieldsSelected ? "!border-brand-500 !bg-brand-50 !text-brand-700 dark:!bg-brand-900/20 dark:!text-brand-300" : ""}`}
                    onClick={() => setCustomFields(CUSTOM_CLIENT_EXPORT_FIELDS.map((field) => field.id))}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className={`btn-secondary !py-1.5 !text-xs ${usingExampleFields ? "!border-brand-500 !bg-brand-50 !text-brand-700 dark:!bg-brand-900/20 dark:!text-brand-300" : ""}`}
                    onClick={() => setCustomFields([...DEFAULT_CUSTOM_FIELDS])}
                  >
                    Use Example
                  </button>
                  <button
                    type="button"
                    className={`btn-secondary !py-1.5 !text-xs ${noFieldsSelected ? "!border-brand-500 !bg-brand-50 !text-brand-700 dark:!bg-brand-900/20 dark:!text-brand-300" : ""}`}
                    onClick={() => setCustomFields([])}
                  >
                    Clear Fields
                  </button>
                  <button
                    type="button"
                    className={`btn-secondary !py-1.5 !text-xs ${filtersAreReset ? "!border-brand-500 !bg-brand-50 !text-brand-700 dark:!bg-brand-900/20 dark:!text-brand-300" : ""}`}
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
                            <button type="button" className="btn-secondary !px-3" onClick={saveCurrentPreset} disabled={customDownloading}>
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
                    <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      className={`btn-secondary !py-1.5 !text-xs ${
                        filteredClientOptions.length > 0 &&
                        filteredClientOptions.every((client) => selectedClientSet.has(client.clientId))
                          ? "!border-brand-500 !bg-brand-50 !text-brand-700 dark:!bg-brand-900/20 dark:!text-brand-300"
                          : ""
                      }`}
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
                      className={`btn-secondary !py-1.5 !text-xs ${selectedClientIds.length === 0 ? "!border-brand-500 !bg-brand-50 !text-brand-700 dark:!bg-brand-900/20 dark:!text-brand-300" : ""}`}
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
                              className="btn-secondary !mt-3 !py-1.5 !text-xs"
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
                            const field = CUSTOM_CLIENT_EXPORT_FIELDS.find((entry) => entry.id === fieldId);
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
    </div>
  );
}

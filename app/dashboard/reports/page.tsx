"use client";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { Download, SlidersHorizontal } from "lucide-react";
import toast from "react-hot-toast";
import FYTabBar from "@/components/ui/FYTabBar";
import { useFinancialYearState } from "@/app/providers";
import { useCache } from "@/lib/useCache";
import type { ClientCustomFieldDefinition } from "@/lib/clientCustomFields";
import CustomExportModal from "./CustomExportModal";
import {
  CUSTOM_CLIENT_EXPORT_FIELDS,
  REPORT_FILE_PREFIX,
  type CustomExportClientCategory,
  type CustomExportPresetConfig,
  type CustomExportPresetDefinition,
  type CustomExportSortBy,
  type CustomClientExportField,
  type CustomClientExportFieldDefinition,
  type ReportType,
} from "@/lib/reports";
import {
  CUSTOM_EXPORT_USER_PRESETS_KEY,
  DEFAULT_CUSTOM_FIELDS,
  REPORT_TYPES,
  arraysEqual,
  sameMembers,
  type AdvancedCustomExportSection,
  type ClientOption,
  type CustomExportPreview,
} from "./ReportsSupport";

const groupCustomExportFields = (fields: CustomClientExportFieldDefinition[]) => Array.from(
  fields.reduce((map, field) => {
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
  const { data: clientCustomFields } = useCache<ClientCustomFieldDefinition[]>("/api/client-custom-fields", { initialData: [] });
  const allCustomExportFields = useMemo(() => [
    ...CUSTOM_CLIENT_EXPORT_FIELDS,
    ...clientCustomFields
      .filter((field) => field.key !== "legalName")
      .map((field) => ({
        id: `custom:${field.key}`,
        label: field.label,
        description: "Custom client field configured in Settings",
        group: "Custom Client Fields",
        width: 24,
      })),
  ], [clientCustomFields]);
  const customExportGroups = useMemo(() => groupCustomExportFields(allCustomExportFields), [allCustomExportFields]);
  const [expandedFieldGroups, setExpandedFieldGroups] = useState<string[]>(() => (
    []
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
  const allFieldsSelected = customFields.length === allCustomExportFields.length;
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
    const firstGroup = customExportGroups[0]?.[0];
    const groupsWithSelectedFields = customExportGroups
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
  }, [customExportGroups, customFields]);

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
          <button className="glass-btn" onClick={openCustomExport}>
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

      <CustomExportModal
        customExportOpen={customExportOpen}
        customDownloading={customDownloading}
        allCustomExportFields={allCustomExportFields}
        customExportGroups={customExportGroups}
        customFields={customFields}
        customFy={customFy}
        customCategories={customCategories}
        selectedClientIds={selectedClientIds}
        clientSearch={clientSearch}
        dateFrom={dateFrom}
        dateTo={dateTo}
        includeOnlyNonEmpty={includeOnlyNonEmpty}
        sortBy={sortBy}
        userPresets={userPresets}
        presetName={presetName}
        showAdvancedControls={showAdvancedControls}
        activeAdvancedSection={activeAdvancedSection}
        expandedFieldGroups={expandedFieldGroups}
        allFieldsSelected={allFieldsSelected}
        noFieldsSelected={noFieldsSelected}
        usingExampleFields={usingExampleFields}
        filtersAreReset={filtersAreReset}
        clientsLoading={clientsLoading}
        hasClientQuery={hasClientQuery}
        filteredClientOptions={filteredClientOptions}
        selectedClientSet={selectedClientSet}
        clientsLoadError={clientsLoadError}
        preview={preview}
        previewLoading={previewLoading}
        previewError={previewError}
        setCustomExportOpen={setCustomExportOpen}
        setCustomFields={setCustomFields}
        setCustomFy={setCustomFy}
        setCustomCategories={setCustomCategories}
        setSelectedClientIds={setSelectedClientIds}
        setClientSearch={setClientSearch}
        setDateFrom={setDateFrom}
        setDateTo={setDateTo}
        setIncludeOnlyNonEmpty={setIncludeOnlyNonEmpty}
        setSortBy={setSortBy}
        setPresetName={setPresetName}
        setClientLoadAttempt={setClientLoadAttempt}
        setExpandedFieldGroups={setExpandedFieldGroups}
        toggleFieldGroup={toggleFieldGroup}
        toggleCustomField={toggleCustomField}
        toggleAdvancedControls={toggleAdvancedControls}
        toggleAdvancedSection={toggleAdvancedSection}
        isPresetActive={isPresetActive}
        applyPreset={applyPreset}
        deletePreset={deletePreset}
        saveCurrentPreset={saveCurrentPreset}
        toggleCategory={toggleCategory}
        toggleClientSelection={toggleClientSelection}
        downloadCustomExport={downloadCustomExport}
      />
    </div>
  );
}

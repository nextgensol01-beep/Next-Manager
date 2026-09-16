"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import toast from "react-hot-toast";
import { useFinancialYearState } from "@/app/providers";
import { useCache } from "@/lib/useCache";
import type { ClientCustomFieldDefinition } from "@/lib/clientCustomFields";
import { buildReportStudioCustomFields } from "@/lib/report-studio";
import ReportStudio from "./ReportStudio";
import {
  CUSTOM_CLIENT_EXPORT_FIELDS,
  REPORT_FILE_PREFIX,
  isSafeCustomExportField,
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

const CustomExportModal = dynamic(() => import("./CustomExportModal"), {
  ssr: false,
  loading: () => null,
});

export default function ReportsPage() {
  const [fy, setFy, financialYearReady] = useFinancialYearState();
  const [downloading, setDownloading] = useState<ReportType[]>([]);
  const [customExportOpen, setCustomExportOpen] = useState(false);
  const [customDownloading, setCustomDownloading] = useState(false);
  const [customFields, setCustomFields] = useState<CustomClientExportField[]>(DEFAULT_CUSTOM_FIELDS);
  const [customFy, setCustomFy] = useState(fy);
  const [presetsLoaded, setPresetsLoaded] = useState(false);
  const savingPresetRef = useRef(false);
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
  const { data: clientCustomFields } = useCache<ClientCustomFieldDefinition[]>("/api/client-custom-fields", {
    enabled: true,
    initialData: [],
  });
  const reportStudioCustomFields = useMemo(
    () => buildReportStudioCustomFields(clientCustomFields),
    [clientCustomFields],
  );
  const allCustomExportFields = useMemo(() => [
    ...CUSTOM_CLIENT_EXPORT_FIELDS,
    ...clientCustomFields
      .filter((field) => (
        field.key !== "legalName" &&
        isSafeCustomExportField(`${field.key} ${field.label}`)
      ))
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
    if (!customExportOpen || presetsLoaded) return;
    let cancelled = false;
    const load = async () => {
      try {
        let legacy: CustomExportPresetDefinition[] = [];
        try { const parsed = JSON.parse(window.localStorage.getItem(CUSTOM_EXPORT_USER_PRESETS_KEY) || "[]"); if (Array.isArray(parsed)) legacy = parsed.filter((entry) => entry?.id && entry?.name && entry?.config?.fields?.length); } catch { /* Keep malformed browser data untouched. */ }
        const response = await fetch("/api/reports/custom-export/presets", legacy.length ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ presets: legacy.map((entry) => ({ name: entry.name, config: entry.config, migrationKey: entry.id })) }) } : { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load export presets");
        if (legacy.length) window.localStorage.removeItem(CUSTOM_EXPORT_USER_PRESETS_KEY);
        if (!cancelled) { setUserPresets(body.presets || []); setPresetsLoaded(true); }
      } catch (error) { if (!cancelled) toast.error(error instanceof Error ? error.message : "Could not load export presets"); }
    };
    void load(); return () => { cancelled = true; };
  }, [customExportOpen, presetsLoaded]);

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
    const controller = new AbortController();
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

        const response = await fetch(`/api/clients?${params.toString()}`, { cache: "no-store", signal: controller.signal });
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
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
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
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [clientLoadAttempt, clientSearch, customCategories, customExportOpen, hasClientQuery]);

  useEffect(() => {
    if (!customExportOpen || customFields.length === 0) {
      setPreview(null);
      setPreviewError("");
      return;
    }

    setPreview(null);
    setPreviewLoading(true);
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError("");
      try {
        const response = await fetch("/api/reports/custom-export/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal: controller.signal,
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
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
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
      controller.abort();
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

    if (previewLoading || previewError || !preview?.previewColumns.length || (dateFrom && dateTo && dateFrom > dateTo)) { toast.error("Review the export preview and correct any errors first"); return; }
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
    const safeFields = config.fields.filter((fieldId) => allCustomExportFields.some((field) => field.id === fieldId));
    setCustomFields(safeFields.length > 0 ? safeFields : [...DEFAULT_CUSTOM_FIELDS]);
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

  const saveCurrentPreset = async () => {
    if (savingPresetRef.current) return;
    const trimmedName = presetName.trim();
    if (!trimmedName) {
      toast.error("Enter a preset name");
      return;
    }

    const preset: CustomExportPresetDefinition = {
      id: `user-${Date.now()}`,
      name: trimmedName,
      description: "Saved to your account",
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

    savingPresetRef.current = true;
    try {
      const response = await fetch("/api/reports/custom-export/presets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: preset.name, config: preset.config }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Could not save preset");
      setUserPresets(body.presets || []); setPresetName(""); toast.success("Export preset saved to your account");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save preset"); }
    finally { savingPresetRef.current = false; }
  };

  const deletePreset = async (presetId: string) => {
    try {
      const response = await fetch("/api/reports/custom-export/presets?id=" + encodeURIComponent(presetId), { method: "DELETE" });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Could not delete preset");
      setUserPresets(body.presets || []); toast.success("Preset deleted");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete preset"); }
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
    <div className="reports-page">
      <ReportStudio
        fy={fy}
        ready={financialYearReady}
        customFields={reportStudioCustomFields}
        onFyChange={setFy}
        onOpenCustomExport={openCustomExport}
        onDownloadQuickReport={downloadReport}
        quickDownloading={downloading}
      />

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

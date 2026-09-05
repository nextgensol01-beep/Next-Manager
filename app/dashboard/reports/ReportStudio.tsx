"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bookmark,
  Calculator,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Filter,
  FolderOpen,
  Group,
  GripVertical,
  Info,
  Layers3,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sigma,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Network,
  ShieldCheck,
  Target,
  Trash2,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { FINANCIAL_YEARS, formatCurrency } from "@/lib/utils";
import type { ReportType } from "@/lib/reports";
import { fetchReportStudio, getCachedReportStudio } from "@/lib/reportStudioClientCache";
import { REPORT_TYPES } from "./ReportsSupport";
import ReportSelect from "./ReportSelect";
import {
  ACCEPTED_TARGET_COMPACT_COLUMNS,
  ACCEPTED_TARGET_DETAIL_COLUMNS,
  REPORT_STUDIO_FIELD_MAP,
  REPORT_STUDIO_OPERATOR_LABELS,
  REPORT_STUDIO_SOURCES,
  createAcceptedTargetStudioConfig,
  fieldsForSource,
  reportStudioExcelColor,
  type ReportStudioCellValue,
  type ReportStudioConfig,
  type ReportStudioFieldDefinition,
  type ReportStudioFilterClause,
  type ReportStudioFilterGroup,
  type ReportStudioFilterValue,
  type ReportStudioOperator,
  type ReportStudioResponse,
  type ReportStudioResultValue,
  type ReportStudioSource,
} from "@/lib/report-studio";

type StudioPanel = "columns" | "filters" | "group" | "metrics" | "saved" | null;
type SavedStudioReport = { id: string; name: string; config: ReportStudioConfig; createdAt?: string; updatedAt?: string };
type ReportTemplate = {
  source: ReportStudioSource;
  label: string;
  description: string;
  icon: typeof Target;
  tone: string;
};

type ReportStudioProps = {
  fy: string;
  ready: boolean;
  onFyChange: (financialYear: string) => void;
  onOpenCustomExport: () => void;
  onDownloadQuickReport: (type: ReportType) => void;
  quickDownloading: ReportType[];
};

const SAVED_REPORTS_KEY = "reports.studio.saved.v1";

const ReportStudioChart = dynamic(() => import("./ReportStudioChart"), {
  ssr: false,
  loading: () => <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>,
});

const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    source: "clients",
    label: "Target progress",
    description: "Accepted clients, obligations, achievement and balance.",
    icon: Target,
    tone: "reports-template-icon-blue",
  },
  {
    source: "billing",
    label: "Money outstanding",
    description: "Billing, receipts and pending amount by client.",
    icon: Calculator,
    tone: "reports-template-icon-amber",
  },
  {
    source: "annual-returns",
    label: "Return readiness",
    description: "Filing status, invoice coverage and remaining work.",
    icon: ShieldCheck,
    tone: "reports-template-icon-violet",
  },
  {
    source: "pwp-credits",
    label: "Credit position",
    description: "Generated, sold and available PWP credits.",
    icon: BarChart3,
    tone: "reports-template-icon-emerald",
  },
];

function quantity(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value || 0);
}

function percentage(value: number) {
  return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(value || 0)}%`;
}

function formatCell(value: ReportStudioCellValue, definition: ReportStudioFieldDefinition) {
  if (value == null) return <span className="text-faint">No Record</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-faint">None</span>;
    if (definition.type === "currency-list") return value.map((entry) => formatCurrency(Number(entry))).join(", ");
    return value.join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (definition.type === "currency") return formatCurrency(value);
    if (definition.type === "percentage") return percentage(value);
    return quantity(value);
  }
  return value;
}

function formatResultValue(result: ReportStudioResultValue) {
  if (result.value == null) return "No Record";
  if (result.type === "currency") return formatCurrency(Number(result.value));
  if (result.type === "percentage") return percentage(Number(result.value));
  if (["number", "quantity"].includes(result.type)) return quantity(Number(result.value));
  if (result.type === "date") {
    const date = new Date(String(result.value));
    return Number.isNaN(date.getTime()) ? String(result.value) : date.toLocaleDateString("en-IN");
  }
  return String(result.value);
}

function defaultConfigForSource(source: ReportStudioSource, financialYear: string): ReportStudioConfig {
  if (source === "clients") return createAcceptedTargetStudioConfig(financialYear, false);
  const base = {
    ...createAcceptedTargetStudioConfig(financialYear, false),
    source,
    filters: { id: "root", kind: "group", logic: "and", children: [] } as ReportStudioConfig["filters"],
    groupBy: [],
    view: "table" as const,
  };
  const definitions: Partial<Record<ReportStudioSource, Pick<ReportStudioConfig, "name" | "columns" | "metrics">>> = {
    "financial-years": { name: "Financial Year Overview", columns: ["client.companyName", "client.category", "financialYear.year", "annualReturn.status", "target.overall.target", "target.overall.achieved", "target.overall.remaining"], metrics: ["client.count", "target.overall.target", "target.overall.achieved", "target.overall.remaining"] },
    "pibo-targets": { name: "PIBO Target Analysis", columns: ACCEPTED_TARGET_COMPACT_COLUMNS, metrics: ["client.count", "target.overall.target", "target.overall.achieved", "target.overall.remaining"] },
    "pwp-credits": { name: "PWP Credit Position", columns: ["client.companyName", "client.state", "financialYear.year", "pwp.generated", "pwp.sold", "pwp.remaining"], metrics: ["client.count", "pwp.generated", "pwp.sold", "pwp.remaining"] },
    "annual-returns": { name: "Annual Return Progress", columns: ["client.companyName", "client.category", "financialYear.year", "annualReturn.status", "annualReturn.completionPercent", "invoice.coveragePercent", "target.overall.remaining"], metrics: ["client.count", "annualReturn.completionPercent", "invoice.coveragePercent", "target.overall.remaining"] },
    "invoice-tracking": { name: "Invoice Coverage", columns: ["client.companyName", "client.category", "financialYear.year", "invoice.saleMonthsReceived", "invoice.purchaseMonthsReceived", "invoice.coveragePercent", "annualReturn.status"], metrics: ["client.count", "invoice.recordCount", "invoice.coveragePercent"] },
    quotations: { name: "Linked Quotation Analysis", columns: ["client.companyName", "client.category", "financialYear.year", "quotation.statuses", "quotation.count", "quotation.acceptedCount", "quotation.acceptedValue", "billing.invoiceCreated"], metrics: ["client.count", "quotation.count", "quotation.acceptedCount", "quotation.acceptedValue"] },
    billing: { name: "Billing & Outstanding", columns: ["client.companyName", "client.category", "financialYear.year", "billing.total", "payment.received", "billing.outstanding", "payment.status", "billing.invoiceCreated"], metrics: ["client.count", "billing.total", "payment.received", "billing.outstanding"] },
    payments: { name: "Payment Analysis", columns: ["client.companyName", "client.category", "financialYear.year", "payment.count", "billing.total", "payment.received", "billing.outstanding", "payment.status"], metrics: ["client.count", "payment.count", "payment.received", "billing.outstanding"] },
    "cpcb-uploads": { name: "CPCB Upload Analysis", columns: ["client.companyName", "client.category", "financialYear.year", "upload.recordCount", "upload.quantity", "invoice.coveragePercent", "annualReturn.status"], metrics: ["client.count", "upload.recordCount", "upload.quantity"] },
    "credit-transactions": { name: "Credit Transaction Analysis", columns: ["client.companyName", "client.category", "financialYear.year", "transaction.inboundCount", "transaction.outboundCount", "target.overall.achieved", "pwp.sold"], metrics: ["client.count", "transaction.inboundCount", "transaction.outboundCount", "target.overall.achieved"] },
    documents: { name: "Client Documents", columns: ["client.companyName", "client.category", "client.state", "document.count", "annualReturn.status"], metrics: ["client.count", "document.count"] },
    tasks: { name: "Tasks & Follow-ups", columns: ["client.companyName", "client.category", "task.count", "task.openCount", "task.overdueCount", "contact.primaryNames"], metrics: ["client.count", "task.count", "task.openCount", "task.overdueCount"] },
    activities: { name: "Client Activity", columns: ["client.companyName", "client.category", "activity.count", "task.openCount", "annualReturn.status"], metrics: ["client.count", "activity.count", "task.openCount"] },
    contacts: { name: "People & Client Relationships", columns: ["client.companyName", "client.category", "client.state", "contact.count", "contact.primaryNames", "task.openCount"], metrics: ["client.count", "contact.count"] },
  };
  return { ...base, ...(definitions[source] || definitions["financial-years"]) };
}

function PanelButton({ active, icon: Icon, label, count, onClick }: { active: boolean; icon: typeof Columns3; label: string; count?: number; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`reports-control inline-flex h-10 items-center gap-2 px-3 text-xs font-semibold ${active ? "text-brand-600 ring-1 ring-brand-200 dark:ring-brand-900" : "text-muted hover:text-default"}`}><Icon className="h-3.5 w-3.5" />{label}{count != null && <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] text-faint">{count}</span>}</button>;
}

function updateConditionInGroup(group: ReportStudioFilterGroup, id: string, patch: Partial<ReportStudioFilterClause>): ReportStudioFilterGroup {
  return {
    ...group,
    children: group.children.map((child) => child.kind === "group"
      ? updateConditionInGroup(child, id, patch)
      : child.id === id ? { ...child, ...patch } : child),
  };
}

function removeFilterNode(group: ReportStudioFilterGroup, id: string): ReportStudioFilterGroup {
  return {
    ...group,
    children: group.children
      .filter((child) => child.id !== id)
      .map((child) => child.kind === "group" ? removeFilterNode(child, id) : child),
  };
}

function sortBySelectorOrder(ids: string[], fields: ReportStudioFieldDefinition[]) {
  const order = new Map(fields.map((definition, index) => [definition.id, index]));
  return [...ids].sort((left, right) => (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER));
}

function insertBySelectorOrder(current: string[], additions: string[], fields: ReportStudioFieldDefinition[]) {
  const order = new Map(fields.map((definition, index) => [definition.id, index]));
  const next = [...current];
  sortBySelectorOrder(additions.filter((fieldId) => !next.includes(fieldId)), fields).forEach((fieldId) => {
    const fieldOrder = order.get(fieldId) ?? Number.MAX_SAFE_INTEGER;
    const insertAt = next.findIndex((existingId) => (order.get(existingId) ?? Number.MAX_SAFE_INTEGER) > fieldOrder);
    if (insertAt < 0) next.push(fieldId);
    else next.splice(insertAt, 0, fieldId);
  });
  return next;
}

function defaultFrozenColumns(columns: string[]) {
  const primary = columns.includes("client.companyName") ? "client.companyName" : columns[0];
  return primary ? [primary] : [];
}

export default function ReportStudio({
  fy,
  ready,
  onFyChange,
  onOpenCustomExport,
  onDownloadQuickReport,
  quickDownloading,
}: ReportStudioProps) {
  const initialConfigRef = useRef<ReportStudioConfig | null>(null);
  if (!initialConfigRef.current) initialConfigRef.current = createAcceptedTargetStudioConfig(fy, false);
  const [draft, setDraft] = useState<ReportStudioConfig>(initialConfigRef.current);
  const [applied, setApplied] = useState<ReportStudioConfig>(initialConfigRef.current);
  const [report, setReport] = useState<ReportStudioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<StudioPanel>(null);
  const [fieldSearch, setFieldSearch] = useState("");
  const [savedReports, setSavedReports] = useState<SavedStudioReport[]>([]);
  const [saveName, setSaveName] = useState("");
  const [activeSavedReportId, setActiveSavedReportId] = useState<string | null>(null);
  const [savedReportsLoading, setSavedReportsLoading] = useState(false);
  const [savedReportsLoaded, setSavedReportsLoaded] = useState(false);
  const [savingSavedReport, setSavingSavedReport] = useState(false);
  const [deletingSavedReportId, setDeletingSavedReportId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [drilldownStack, setDrilldownStack] = useState<ReportStudioConfig[]>([]);
  const [relationshipClientId, setRelationshipClientId] = useState<string | null>(null);
  const [businessResultsOpen, setBusinessResultsOpen] = useState(false);
  const [setupExpanded, setSetupExpanded] = useState(false);
  const [frozenColumnIds, setFrozenColumnIds] = useState<string[]>(() => defaultFrozenColumns(initialConfigRef.current?.columns || []));
  const [refreshRequest, setRefreshRequest] = useState(0);
  const forceRefreshRef = useRef(false);
  const reportRequestRef = useRef(0);
  const savedReportsRequestRef = useRef(false);

  const fetchReport = useCallback(async (config: ReportStudioConfig, refresh = false) => {
    const requestId = reportRequestRef.current + 1;
    reportRequestRef.current = requestId;
    setLoading(true);
    setError("");

    if (!refresh) {
      const cached = getCachedReportStudio(config);
      if (cached) {
        setReport(cached);
        setLoading(false);
        return;
      }
    }

    try {
      const body = await fetchReportStudio(config, { refresh });
      if (reportRequestRef.current === requestId) setReport(body);
    } catch (requestError) {
      if (reportRequestRef.current === requestId) {
        setError(requestError instanceof Error ? requestError.message : "Unable to run report");
      }
    } finally {
      if (reportRequestRef.current === requestId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready || applied.financialYear !== fy) return;
    const refresh = forceRefreshRef.current;
    forceRefreshRef.current = false;
    void fetchReport(applied, refresh);
  }, [applied, fetchReport, fy, ready, refreshRequest]);
  useEffect(() => {
    setDraft((current) => current.financialYear === fy ? current : { ...current, financialYear: fy, page: 1 });
    setApplied((current) => current.financialYear === fy ? current : { ...current, financialYear: fy, page: 1 });
  }, [fy]);
  useEffect(() => {
    setFrozenColumnIds((current) => current.filter((fieldId) => applied.columns.includes(fieldId)));
  }, [applied.columns, applied.source]);
  useEffect(() => {
    if (panel !== "saved" || savedReportsLoaded || savedReportsRequestRef.current) return;
    savedReportsRequestRef.current = true;
    setSavedReportsLoading(true);
    const loadSavedReports = async () => {
      let legacyReports: SavedStudioReport[] = [];
      try {
        const raw = window.localStorage.getItem(SAVED_REPORTS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) {
          legacyReports = parsed.filter((entry): entry is SavedStudioReport => Boolean(
            entry && typeof entry.id === "string" && typeof entry.name === "string" && entry.config,
          ));
        }

        const response = await fetch("/api/reports/studio/saved", legacyReports.length > 0 ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            reports: legacyReports.map((report) => ({
              migrationKey: report.id,
              name: report.name,
              config: report.config,
            })),
          }),
        } : { cache: "no-store" });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error || "Unable to load saved reports");
        if (legacyReports.length > 0) window.localStorage.removeItem(SAVED_REPORTS_KEY);
        setSavedReports(Array.isArray(body?.reports) ? body.reports : []);
      } catch (requestError) {
        setSavedReports(legacyReports);
        toast.error(requestError instanceof Error ? requestError.message : "Unable to load saved reports");
      } finally {
        savedReportsRequestRef.current = false;
        setSavedReportsLoading(false);
        setSavedReportsLoaded(true);
      }
    };
    void loadSavedReports();
  }, [panel, savedReportsLoaded]);

  const availableFields = useMemo(() => fieldsForSource(draft.source), [draft.source]);
  const fieldGroups = useMemo(() => {
    const search = fieldSearch.trim().toLowerCase();
    const filtered = search
      ? availableFields.filter((definition) => `${definition.label} ${definition.description} ${definition.group}`.toLowerCase().includes(search))
      : availableFields;
    const groups = new Map<string, ReportStudioFieldDefinition[]>();
    filtered.forEach((definition) => groups.set(definition.group, [...(groups.get(definition.group) || []), definition]));
    return Array.from(groups);
  }, [availableFields, fieldSearch]);
  const dimensionFields = availableFields.filter((definition) => definition.role === "dimension");
  const metricFields = availableFields.filter((definition) => definition.role === "metric");
  const filterConditions = useMemo(() => {
    const result: ReportStudioFilterClause[] = [];
    const visit = (group: ReportStudioFilterGroup) => group.children.forEach((child) => child.kind === "group" ? visit(child) : result.push(child));
    visit(draft.filters);
    return result;
  }, [draft.filters]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const detailedPreset = draft.columns.length === ACCEPTED_TARGET_DETAIL_COLUMNS.length && ACCEPTED_TARGET_DETAIL_COLUMNS.every((column) => draft.columns.includes(column));
  const compactPreset = draft.columns.length === ACCEPTED_TARGET_COMPACT_COLUMNS.length && ACCEPTED_TARGET_COMPACT_COLUMNS.every((column) => draft.columns.includes(column));

  const runReport = () => {
    const next = { ...draft, page: 1 };
    if (next.source !== applied.source) setFrozenColumnIds(defaultFrozenColumns(next.columns));
    if (JSON.stringify(next) === JSON.stringify(applied)) {
      forceRefreshRef.current = true;
      setRefreshRequest((current) => current + 1);
    } else {
      setApplied(next);
    }
    setDraft((current) => ({ ...current, page: 1 }));
    setPanel(null);
    setSetupExpanded(false);
  };

  const changeSource = (source: ReportStudioSource) => {
    const next = defaultConfigForSource(source, draft.financialYear);
    setDraft(next);
    setSetupExpanded(true);
  };

  const applyTemplate = (template: ReportTemplate) => {
    const next = defaultConfigForSource(template.source, fy);
    setFrozenColumnIds(defaultFrozenColumns(next.columns));
    setDraft(next);
    setApplied(next);
    setActiveSavedReportId(null);
    setSaveName("");
    setDrilldownStack([]);
    setBusinessResultsOpen(false);
    setPanel(null);
    setSetupExpanded(false);
  };

  const showAllRecords = () => {
    const next = {
      ...applied,
      filters: { id: `root-${Date.now()}`, kind: "group" as const, logic: "and" as const, children: [] },
      page: 1,
    };
    setDraft(next);
    setApplied(next);
    setPanel(null);
  };

  const toggleColumn = (fieldId: string) => {
    setDraft((current) => {
      const selected = current.columns.includes(fieldId);
      if (selected && current.columns.length === 1) return current;
      const columns = selected
        ? current.columns.filter((entry) => entry !== fieldId)
        : insertBySelectorOrder(current.columns, [fieldId], availableFields);
      return { ...current, columns, page: 1 };
    });
  };

  const toggleColumnGroup = (fieldIds: string[], selectAll: boolean) => {
    setDraft((current) => {
      const fieldSet = new Set(fieldIds);
      const columns = selectAll
        ? insertBySelectorOrder(current.columns, fieldIds, availableFields)
        : current.columns.filter((fieldId) => !fieldSet.has(fieldId));
      return { ...current, columns: columns.length > 0 ? columns : current.columns, page: 1 };
    });
  };

  const reorderDraftColumn = (sourceField: string, targetField: string) => {
    if (sourceField === targetField) return;
    setDraft((current) => {
      const columns = [...current.columns];
      const sourceIndex = columns.indexOf(sourceField);
      const targetIndex = columns.indexOf(targetField);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const [moved] = columns.splice(sourceIndex, 1);
      columns.splice(targetIndex, 0, moved);
      return { ...current, columns, page: 1 };
    });
  };

  const setExcelColumnColor = (fieldId: string, color: string) => {
    setDraft((current) => ({
      ...current,
      excelColumnColors: { ...(current.excelColumnColors || {}), [fieldId]: color.toUpperCase() },
    }));
  };

  const setExcelGroupColor = (fieldIds: string[], color: string) => {
    setDraft((current) => ({
      ...current,
      excelColumnColors: {
        ...(current.excelColumnColors || {}),
        ...Object.fromEntries(fieldIds.map((fieldId) => [fieldId, color.toUpperCase()])),
      },
    }));
  };

  const createFilterCondition = (): ReportStudioFilterClause | null => {
    const definition = availableFields.find((entry) => entry.id === "client.category") || availableFields[0];
    if (!definition) return null;
    return {
      id: `condition-${Date.now()}`,
      kind: "condition",
      field: definition.id,
      operator: definition.operators[0],
      value: definition.options?.[0] || "",
    };
  };

  const transformFilterGroup = (group: ReportStudioFilterGroup, groupId: string, transform: (group: ReportStudioFilterGroup) => ReportStudioFilterGroup): ReportStudioFilterGroup => {
    if (group.id === groupId) return transform(group);
    return { ...group, children: group.children.map((child) => child.kind === "group" ? transformFilterGroup(child, groupId, transform) : child) };
  };

  const addFilter = (groupId = "root") => {
    const condition = createFilterCondition();
    if (!condition) return;
    setDraft((current) => ({ ...current, filters: transformFilterGroup(current.filters, groupId, (group) => ({ ...group, children: [...group.children, condition] })), page: 1 }));
  };

  const addFilterGroup = (parentId = "root") => {
    const condition = createFilterCondition();
    if (!condition) return;
    const group: ReportStudioFilterGroup = { id: `group-${Date.now()}`, kind: "group", logic: "or", children: [condition] };
    setDraft((current) => ({ ...current, filters: transformFilterGroup(current.filters, parentId, (parent) => ({ ...parent, children: [...parent.children, group] })), page: 1 }));
  };

  const updateFilter = (id: string, patch: Partial<ReportStudioFilterClause>) => {
    setDraft((current) => ({
      ...current,
      filters: updateConditionInGroup(current.filters, id, patch),
      page: 1,
    }));
  };

  const changeFilterField = (condition: ReportStudioFilterClause, fieldId: string) => {
    const definition = REPORT_STUDIO_FIELD_MAP.get(fieldId);
    if (!definition) return;
    updateFilter(condition.id, { field: fieldId, operator: definition.operators[0], value: definition.options?.[0] || "", secondValue: undefined });
  };

  const removeFilter = (id: string) => setDraft((current) => ({ ...current, filters: removeFilterNode(current.filters, id), page: 1 }));
  const updateFilterLogic = (groupId: string, logic: "and" | "or") => setDraft((current) => ({ ...current, filters: transformFilterGroup(current.filters, groupId, (group) => ({ ...group, logic })), page: 1 }));

  const toggleMetric = (fieldId: string) => setDraft((current) => {
    const metrics = current.metrics.includes(fieldId)
      ? current.metrics.filter((entry) => entry !== fieldId)
      : [...current.metrics, fieldId];
    return { ...current, metrics: sortBySelectorOrder(metrics, metricFields), page: 1 };
  });

  const toggleGroup = (fieldId: string) => setDraft((current) => {
    const selected = current.groupBy.includes(fieldId);
    const groupBy = selected ? current.groupBy.filter((entry) => entry !== fieldId) : current.groupBy.length < 2 ? [...current.groupBy, fieldId] : [current.groupBy[1], fieldId];
    const orderedGroupBy = sortBySelectorOrder(groupBy, dimensionFields);
    return { ...current, groupBy: orderedGroupBy, sort: orderedGroupBy.length > 0 ? [{ field: orderedGroupBy[0], direction: "asc" }] : current.sort, page: 1 };
  });

  const createSavedReport = async (asCopy = false) => {
    const activeSavedReport = savedReports.find((entry) => entry.id === activeSavedReportId);
    const requestedName = saveName.trim() || draft.name.trim();
    const name = asCopy && activeSavedReport && requestedName === activeSavedReport.name
      ? `${requestedName.slice(0, 113)} (Copy)`
      : requestedName;
    if (!name) return;
    setSavingSavedReport(true);
    try {
      const response = await fetch("/api/reports/studio/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, config: { ...draft, name } }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Unable to save report configuration");
      const created = body.report as SavedStudioReport;
      setSavedReports((current) => [created, ...current]);
      setActiveSavedReportId(created.id);
      setSaveName(created.name);
      toast.success(asCopy ? "Report copy saved to your account" : "Report configuration saved to your account");
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : "Unable to save report configuration");
    } finally {
      setSavingSavedReport(false);
    }
  };

  const updateSavedReport = async () => {
    const activeSavedReport = savedReports.find((entry) => entry.id === activeSavedReportId);
    if (!activeSavedReport) return;
    const name = saveName.trim() || draft.name.trim();
    if (!name) return;
    if (!window.confirm(`Update “${activeSavedReport.name}” with the current Report Studio configuration?`)) return;

    setSavingSavedReport(true);
    try {
      const response = await fetch(`/api/reports/studio/saved/${encodeURIComponent(activeSavedReport.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, config: { ...draft, name } }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Unable to update saved report");
      const updated = body.report as SavedStudioReport;
      setSavedReports((current) => [updated, ...current.filter((entry) => entry.id !== updated.id)]);
      setSaveName(updated.name);
      setDraft((current) => ({ ...current, name: updated.name }));
      toast.success("Saved report updated");
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : "Unable to update saved report");
    } finally {
      setSavingSavedReport(false);
    }
  };

  const deleteSavedReport = async (id: string) => {
    setDeletingSavedReportId(id);
    try {
      const response = await fetch(`/api/reports/studio/saved/${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Unable to delete saved report");
      setSavedReports((current) => current.filter((entry) => entry.id !== id));
      if (activeSavedReportId === id) {
        setActiveSavedReportId(null);
        setSaveName("");
      }
      toast.success("Saved report deleted");
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : "Unable to delete saved report");
    } finally {
      setDeletingSavedReportId(null);
    }
  };

  const loadSaved = (saved: SavedStudioReport) => {
    const savedFields = fieldsForSource(saved.config.source);
    const savedDimensionFields = savedFields.filter((definition) => definition.role === "dimension");
    const savedMetricFields = savedFields.filter((definition) => definition.role === "metric");
    const config = {
      ...saved.config,
      groupBy: sortBySelectorOrder(saved.config.groupBy, savedDimensionFields),
      metrics: sortBySelectorOrder(saved.config.metrics, savedMetricFields),
      businessResultIds: saved.config.businessResultIds ?? null,
      excelColumnColors: saved.config.excelColumnColors || {},
    };
    setDraft(config);
    setApplied(config);
    setFrozenColumnIds(defaultFrozenColumns(config.columns));
    setActiveSavedReportId(saved.id);
    setSaveName(saved.name);
    onFyChange(saved.config.financialYear);
    setPanel(null);
    setSetupExpanded(false);
  };

  const downloadExcel = async () => {
    setDownloading(true);
    try {
      const response = await fetch("/api/reports/studio/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(applied),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Unable to export report");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const disposition = response.headers.get("content-disposition") || "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || "report-studio.xlsx";
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Report Studio workbook downloaded");
    } catch (downloadError) {
      toast.error(downloadError instanceof Error ? downloadError.message : "Unable to export report");
    } finally {
      setDownloading(false);
    }
  };

  const setBusinessResultIds = (businessResultIds: string[] | null) => {
    setDraft((current) => ({ ...current, businessResultIds, page: 1 }));
  };

  const setPage = (page: number) => {
    const next = { ...applied, page };
    setApplied(next);
    setDraft(next);
  };

  const updateTableConfig = (transform: (config: ReportStudioConfig) => ReportStudioConfig) => {
    setApplied((current) => transform(current));
    setDraft((current) => transform(current));
  };

  const reorderTableColumn = (sourceField: string, targetField: string | number, side: "before" | "after" = "before") => {
    if (applied.groupBy.length > 0) return;
    const reorder = (config: ReportStudioConfig) => {
      const columns = [...config.columns];
      const sourceIndex = columns.indexOf(sourceField);
      if (sourceIndex < 0) return config;
      const [moved] = columns.splice(sourceIndex, 1);
      const targetBaseIndex = typeof targetField === "number" ? targetField : columns.indexOf(targetField);
      if (targetBaseIndex < 0) return config;
      const targetIndex = typeof targetField === "number"
        ? Math.max(0, Math.min(columns.length, targetBaseIndex))
        : targetBaseIndex + (side === "after" ? 1 : 0);
      columns.splice(targetIndex, 0, moved);
      if (columns.every((fieldId, index) => fieldId === config.columns[index])) return config;
      return { ...config, columns };
    };

    // Column values are keyed by field id, so the visible table can be reordered
    // immediately while the refreshed server response is fetched in the background.
    setReport((current) => {
      if (!current || current.config.groupBy.length > 0) return current;
      const nextConfig = reorder(current.config);
      if (nextConfig === current.config) return current;
      const definitions = new Map(current.columns.map((column) => [column.id, column]));
      return {
        ...current,
        config: nextConfig,
        columns: nextConfig.columns.map((fieldId) => definitions.get(fieldId)).filter((column): column is ReportStudioFieldDefinition => Boolean(column)),
      };
    });
    updateTableConfig(reorder);
  };

  const moveTableColumn = (fieldId: string, direction: "left" | "right" | "first" | "last") => {
    if (applied.groupBy.length > 0) return;
    updateTableConfig((config) => {
      const columns = [...config.columns];
      const index = columns.indexOf(fieldId);
      if (index < 0) return config;
      const target = direction === "first" ? 0 : direction === "last" ? columns.length - 1 : direction === "left" ? Math.max(0, index - 1) : Math.min(columns.length - 1, index + 1);
      columns.splice(target, 0, columns.splice(index, 1)[0]);
      return { ...config, columns };
    });
  };

  const hideTableColumn = (fieldId: string) => {
    if (applied.groupBy.length > 0 || applied.columns.length <= 1) return;
    updateTableConfig((config) => ({ ...config, columns: config.columns.length > 1 ? config.columns.filter((column) => column !== fieldId) : config.columns }));
  };

  const insertTableColumn = (anchorFieldId: string, fieldId: string, side: "left" | "right") => {
    if (applied.groupBy.length > 0) return;
    updateTableConfig((config) => {
      if (config.columns.includes(fieldId)) return config;
      const anchorIndex = config.columns.indexOf(anchorFieldId);
      const columns = [...config.columns];
      columns.splice(anchorIndex < 0 ? columns.length : anchorIndex + (side === "right" ? 1 : 0), 0, fieldId);
      return { ...config, columns, page: 1 };
    });
  };

  const showTableColumn = (fieldId: string) => {
    if (applied.groupBy.length > 0) return;
    updateTableConfig((config) => config.columns.includes(fieldId)
      ? config
      : { ...config, columns: [...config.columns, fieldId], page: 1 });
  };

  const showAllTableColumns = () => {
    if (applied.groupBy.length > 0) return;
    const sourceFields = fieldsForSource(applied.source).map((definition) => definition.id);
    updateTableConfig((config) => ({ ...config, columns: insertBySelectorOrder(config.columns, sourceFields, fieldsForSource(config.source)), page: 1 }));
  };

  const sortTableColumn = (fieldId: string, direction: "asc" | "desc" | null) => {
    updateTableConfig((config) => ({ ...config, sort: direction ? [{ field: fieldId, direction }] : [], page: 1 }));
  };

  const addTableSort = (fieldId: string, direction: "asc" | "desc") => {
    updateTableConfig((config) => {
      const withoutField = config.sort.filter((sort) => sort.field !== fieldId);
      return { ...config, sort: [...withoutField, { field: fieldId, direction }].slice(-3), page: 1 };
    });
  };

  const clearTableColumnSort = (fieldId: string) => {
    updateTableConfig((config) => ({ ...config, sort: config.sort.filter((sort) => sort.field !== fieldId), page: 1 }));
  };

  const clearAllTableSort = () => {
    updateTableConfig((config) => ({ ...config, sort: [], page: 1 }));
  };

  const openTableColumnFilter = (fieldId: string) => {
    const definition = REPORT_STUDIO_FIELD_MAP.get(fieldId);
    if (!definition) return;
    const condition: ReportStudioFilterClause = {
      id: `table-filter-draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind: "condition",
      field: fieldId,
      operator: definition.operators[0],
      value: definition.options?.[0] ?? "",
    };
    setDraft((current) => ({
      ...current,
      filters: { ...current.filters, children: [...current.filters.children, condition] },
      page: 1,
    }));
    setSetupExpanded(true);
    setPanel("filters");
  };

  const clearTableColumnFilter = (fieldId: string) => {
    const removeField = (group: ReportStudioFilterGroup): ReportStudioFilterGroup => ({
      ...group,
      children: group.children
        .filter((child) => child.kind === "group" || child.field !== fieldId)
        .map((child) => child.kind === "group" ? removeField(child) : child),
    });
    updateTableConfig((config) => ({ ...config, filters: removeField(config.filters), page: 1 }));
  };

  const filterFromTableCell = (fieldId: string, value: ReportStudioCellValue, exclude: boolean) => {
    const rootId = `table-filter-root-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const condition: ReportStudioFilterClause = {
      id: `table-filter-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind: "condition",
      field: fieldId,
      operator: value == null ? (exclude ? "not_empty" : "empty") : (exclude ? "neq" : "eq"),
      value: Array.isArray(value) ? value[0] ?? null : value,
    };
    updateTableConfig((config) => ({
      ...config,
      filters: {
        id: rootId,
        kind: "group",
        logic: "and",
        children: config.filters.children.length > 0 ? [config.filters, condition] : [condition],
      },
      page: 1,
    }));
  };

  const drillIntoRow = (row: ReportStudioResponse["rows"][number]) => {
    if (applied.groupBy.length === 0) {
      setRelationshipClientId(row.clientIds[0] || null);
      return;
    }
    const groupConditions: ReportStudioFilterClause[] = applied.groupBy.map((fieldId, index) => ({
      id: `drill-${Date.now()}-${index}`,
      kind: "condition",
      field: fieldId,
      operator: Array.isArray(row.values[fieldId]) ? "contains" : "eq",
      value: row.values[fieldId] as ReportStudioFilterValue,
    }));
    const next: ReportStudioConfig = {
      ...applied,
      name: `${applied.name} · Details`,
      filters: {
        id: `drill-root-${Date.now()}`,
        kind: "group",
        logic: "and",
        children: applied.filters.children.length > 0
          ? [applied.filters, ...groupConditions]
          : groupConditions,
      },
      groupBy: [],
      view: "table",
      page: 1,
    };
    setDrilldownStack((current) => [...current, applied]);
    setDraft(next);
    setApplied(next);
  };

  const returnFromDrilldown = () => {
    const previous = drilldownStack[drilldownStack.length - 1];
    if (!previous) return;
    setDrilldownStack((current) => current.slice(0, -1));
    setDraft(previous);
    setApplied(previous);
  };

  const changeResultView = (view: ReportStudioConfig["view"]) => {
    const next = { ...applied, view };
    setApplied(next);
    setDraft(next);
  };

  const sourceDefinition = REPORT_STUDIO_SOURCES.find((source) => source.id === draft.source);
  const viewOptions = [
    { id: "table" as const, label: "Table", Icon: Table2, available: true, help: "View detailed rows" },
    { id: "pivot" as const, label: "Pivot", Icon: Sigma, available: applied.groupBy.length >= 2 && applied.metrics.length > 0, help: "Add two groupings and a metric to use Pivot" },
    { id: "chart" as const, label: "Chart", Icon: BarChart3, available: applied.groupBy.length > 0 && applied.metrics.length > 0, help: "Add a grouping and a metric to use Chart" },
    { id: "relationships" as const, label: "Relationships", Icon: Network, available: applied.groupBy.length === 0, help: "Open an ungrouped report to use Relationships" },
  ];

  return (
    <div className="reports-page space-y-5 pb-8">
      <header className="reports-hero flex flex-col gap-5 rounded-[28px] px-5 py-6 sm:px-7 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600"><Sparkles className="h-3.5 w-3.5" />Report Studio</div>
          <h1 className="text-[30px] font-semibold tracking-[-0.04em] text-default sm:text-[36px]">Turn your data into a clear answer</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">Choose an outcome, refine it only when needed, and export exactly what you see.</p>
        </div>
        <div className="reports-action-cluster flex flex-wrap gap-2 rounded-2xl p-1.5">
          <button type="button" onClick={() => setPanel(panel === "saved" ? null : "saved")} className="glass-btn"><FolderOpen className="h-4 w-4" />Saved Reports</button>
          <ExportMenu fy={fy} reportAvailable={Boolean(report)} downloadingCurrent={downloading} downloading={quickDownloading} onDownloadCurrent={() => void downloadExcel()} onDownload={onDownloadQuickReport} onOpenCustomExport={onOpenCustomExport} />
        </div>
      </header>

      <section aria-labelledby="report-templates-title" className="reports-template-strip rounded-[24px] p-3 sm:p-4">
        <div className="mb-3 flex items-end justify-between gap-4 px-1">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-600">Quick start</p>
            <h2 id="report-templates-title" className="mt-0.5 text-sm font-semibold text-default sm:text-base">What do you need to understand?</h2>
          </div>
          <span className="hidden text-xs text-muted sm:block">One click builds and runs the report</span>
        </div>
        <div className="reports-template-grid">
          {REPORT_TEMPLATES.map((template) => {
            const Icon = template.icon;
            const active = applied.source === template.source && !activeSavedReportId;
            return <button key={template.source} type="button" onClick={() => applyTemplate(template)} aria-pressed={active} className={`reports-template-card group ${active ? "is-active" : ""}`}>
              <span className={`reports-template-icon ${template.tone}`}><Icon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <strong className="block text-[12px] font-semibold text-default sm:text-[13px]">{template.label}</strong>
                <span className="mt-0.5 block text-[10px] leading-4 text-muted sm:text-[11px]">{template.description}</span>
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
            </button>;
          })}
        </div>
      </section>

      <section className="reports-glass-panel rounded-[24px] p-3.5 sm:p-4" aria-labelledby="report-setup-title">
        {!setupExpanded ? <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-600">Current report</p>
            <h2 id="report-setup-title" className="mt-1 truncate text-base font-semibold tracking-[-0.01em] text-default">{applied.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
              <span className="reports-config-chip">{sourceDefinition?.label}</span>
              <span className="reports-config-chip">FY {applied.financialYear}</span>
              <span className="reports-config-chip">{applied.columns.length} columns</span>
              <span className="reports-config-chip">{filterConditions.length} {filterConditions.length === 1 ? "filter" : "filters"}</span>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => setSetupExpanded(true)} className="glass-btn h-10 text-xs"><SlidersHorizontal className="h-3.5 w-3.5" />Customize</button>
            <button type="button" onClick={() => void fetchReport(applied)} disabled={loading} className="glass-btn h-10 text-xs">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Refresh data</button>
          </div>
        </div> : <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-600">Customize report</p><h2 id="report-setup-title" className="mt-0.5 text-base font-semibold text-default">Choose the data and level of detail</h2></div>
            <button type="button" onClick={() => { setDraft(applied); setPanel(null); setSetupExpanded(false); }} className="rounded-xl px-3 py-2 text-xs font-semibold text-muted hover:bg-surface hover:text-default">Cancel</button>
          </div>
          <div className="grid gap-3 xl:grid-cols-[minmax(190px,1fr)_170px_minmax(240px,1.2fr)_auto]">
            <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">Report on<span className="mt-1.5 block"><ReportSelect value={draft.source} onChange={(value) => changeSource(value as ReportStudioSource)} ariaLabel="Report source" searchable options={REPORT_STUDIO_SOURCES.map((source) => ({ value: source.id, label: source.label }))} buttonClassName="text-sm" /></span></label>
            <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">Financial year<span className="mt-1.5 block"><ReportSelect value={draft.financialYear} onChange={(value) => { onFyChange(value); setDraft((current) => ({ ...current, financialYear: value, page: 1 })); }} ariaLabel="Financial year" options={FINANCIAL_YEARS.map((year) => ({ value: year, label: year }))} buttonClassName="text-sm" /></span></label>
            <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">Report name<input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="reports-control mt-1.5 h-11 w-full px-3 text-sm font-semibold" /></label>
            <div className="flex items-end"><button type="button" onClick={runReport} className="btn-primary h-11 w-full justify-center px-5 xl:w-auto">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{loading ? "Applying…" : dirty ? "Apply changes" : "Refresh data"}</button></div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-base pt-4">
            <PanelButton active={panel === "columns"} icon={Columns3} label="Columns" count={draft.columns.length} onClick={() => setPanel(panel === "columns" ? null : "columns")} />
            <PanelButton active={panel === "filters"} icon={Filter} label="Filters" count={filterConditions.length} onClick={() => setPanel(panel === "filters" ? null : "filters")} />
            <PanelButton active={panel === "group"} icon={Group} label="Group by" count={draft.groupBy.length} onClick={() => setPanel(panel === "group" ? null : "group")} />
            <PanelButton active={panel === "metrics"} icon={Sigma} label="Summary" count={draft.metrics.length} onClick={() => setPanel(panel === "metrics" ? null : "metrics")} />
            <div className="hidden h-6 w-px bg-slate-200 dark:bg-white/10 sm:block" />
            <div className="reports-sort-control text-xs"><SlidersHorizontal className="h-3.5 w-3.5" /><ReportSelect variant="bare" value={draft.sort[0]?.field || draft.columns[0]} onChange={(value) => setDraft((current) => ({ ...current, sort: [{ field: value, direction: current.sort[0]?.direction || "asc" }] }))} ariaLabel="Sort field" searchable options={availableFields.map((definition) => ({ value: definition.id, label: definition.shortLabel, group: definition.group }))} /><span className="reports-sort-divider" /><ReportSelect variant="bare" value={draft.sort[0]?.direction || "asc"} onChange={(value) => setDraft((current) => ({ ...current, sort: [{ field: current.sort[0]?.field || current.columns[0], direction: value as "asc" | "desc" }] }))} ariaLabel="Sort direction" options={[{ value: "asc", label: "Ascending" }, { value: "desc", label: "Descending" }]} /></div>
            {draft.source === "clients" && <div className="ml-auto flex rounded-xl bg-surface p-1 text-xs font-semibold"><button type="button" onClick={() => setDraft((current) => ({ ...current, columns: ACCEPTED_TARGET_COMPACT_COLUMNS }))} className={`rounded-lg px-2.5 py-1.5 ${compactPreset ? "bg-card text-brand-600 shadow-sm" : "text-muted"}`}>Essential</button><button type="button" onClick={() => setDraft((current) => ({ ...current, columns: ACCEPTED_TARGET_DETAIL_COLUMNS }))} className={`rounded-lg px-2.5 py-1.5 ${detailedPreset ? "bg-card text-brand-600 shadow-sm" : "text-muted"}`}>Full detail</button></div>}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted">
            <span className="rounded-full bg-surface px-2.5 py-1">Each row: {sourceDefinition?.grain}</span>
            {filterConditions.map((condition) => { const definition = REPORT_STUDIO_FIELD_MAP.get(condition.field); return <span key={condition.id} className="rounded-full border border-base bg-card px-2.5 py-1"><strong className="text-default">{definition?.shortLabel}</strong> {REPORT_STUDIO_OPERATOR_LABELS[condition.operator]} {Array.isArray(condition.value) ? condition.value.join(", ") : String(condition.value ?? "")}</span>; })}
          </div>
        </div>}
      </section>

      {panel && <StudioInspector panel={panel} dirty={dirty} onClose={() => setPanel(null)} onUndo={() => setDraft(applied)} onRun={runReport}>
        {panel === "columns" && <ColumnPanel groups={fieldGroups} selected={draft.columns} colors={draft.excelColumnColors || {}} search={fieldSearch} onSearch={setFieldSearch} onToggle={toggleColumn} onToggleGroup={toggleColumnGroup} onReorder={reorderDraftColumn} onColor={setExcelColumnColor} onGroupColor={setExcelGroupColor} />}
        {panel === "filters" && <FilterPanel group={draft.filters} fields={availableFields} onLogic={updateFilterLogic} onAdd={addFilter} onAddGroup={addFilterGroup} onField={changeFilterField} onUpdate={updateFilter} onRemove={removeFilter} />}
        {panel === "group" && <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]"><ChoicePanel kind="group" fields={dimensionFields} selected={draft.groupBy} onToggle={toggleGroup} empty="No grouping — one result row per source record" /><GroupingImpactPreview source={draft.source} selected={draft.groupBy} metrics={draft.metrics} appliedSelected={applied.groupBy} configurationDirty={dirty} report={report} /></div>}
        {panel === "metrics" && <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]"><ChoicePanel kind="metric" fields={metricFields} selected={draft.metrics} onToggle={toggleMetric} empty="Select metrics for KPI cards and grouped results" /><MetricImpactPreview selected={draft.metrics} groupBy={draft.groupBy} appliedSelected={applied.metrics} configurationDirty={dirty} report={report} /></div>}
        {panel === "saved" && <SavedPanel reports={savedReports} name={saveName} activeId={activeSavedReportId} loading={savedReportsLoading} saving={savingSavedReport} deletingId={deletingSavedReportId} onName={setSaveName} onCreate={() => void createSavedReport()} onUpdate={() => void updateSavedReport()} onSaveCopy={() => void createSavedReport(true)} onLoad={loadSaved} onDelete={(id) => void deleteSavedReport(id)} />}
      </StudioInspector>}

      {error && <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>Report could not run.</strong> {error}</div></div>}
      {report?.quality.messages.length ? <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{report.quality.messages.join(" ")}</div> : null}

      {report && report.pagination.totalRows > 0 && (report.summary.metrics.some((metric) => metric.field === "target.overall.target")
        ? <TargetOutcomeSummary report={report} />
        : <section className={`reports-metric-strip grid grid-cols-2 overflow-hidden rounded-[24px] ${report.summary.metrics.length >= 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
            {report.summary.metrics.slice(0, 4).map((metric) => <div key={metric.field} className="reports-metric-item px-4 py-4 sm:px-5"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">{metric.label}</p><p className="mt-1 text-xl font-bold tracking-tight text-default">{metric.type === "currency" ? formatCurrency(metric.value) : metric.type === "percentage" ? percentage(metric.value) : quantity(metric.value)}</p></div>)}
          </section>)}
      {report && report.pagination.totalRows > 0 && report.summary.metrics.some((metric) => /^target\.cat[1-4]\.total\./.test(metric.field)) && <TargetCategorySummaries report={report} />}

      <section className="reports-results-card relative overflow-hidden rounded-[24px]" aria-busy={loading}>
        {loading && report && <div role="status" className="absolute inset-x-0 top-0 z-20 flex h-1 overflow-hidden bg-brand-100/70 dark:bg-brand-950/50"><span className="h-full w-1/3 animate-pulse rounded-full bg-brand-500" /><span className="sr-only">Updating report data while keeping the current results available</span></div>}
        <div className="flex flex-col gap-3 border-b border-base p-4 xl:flex-row xl:items-center xl:justify-between"><div><div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-brand-600" /><h2 className="font-semibold text-default">{applied.name}</h2></div><p className="mt-1 text-xs text-muted">{loading ? "Refreshing data…" : `${report?.pagination.totalRows || 0} rows · ${report?.summary.matchedClients || 0} clients`}</p><p className="mt-1 text-[10px] text-faint sm:hidden">Swipe the table to see more columns</p></div><div className="flex flex-wrap items-center gap-2">{drilldownStack.length > 0 && <button type="button" onClick={returnFromDrilldown} className="glass-btn h-9 text-xs"><ChevronLeft className="h-3.5 w-3.5" />Back to grouped report</button>}{report && <button type="button" onClick={() => setBusinessResultsOpen((open) => !open)} className={`glass-btn h-9 text-xs ${businessResultsOpen ? "text-brand-600" : ""}`}><Calculator className="h-3.5 w-3.5" />Details ({report.summary.businessResults.length})</button>}<div className="reports-view-switcher flex rounded-xl bg-surface p-1">{viewOptions.map(({ id, Icon, label, available, help }) => <button key={id} type="button" onClick={() => available && changeResultView(id)} disabled={!available} title={available ? `${label} view` : help} aria-label={available ? `${label} view` : `${label} unavailable: ${help}`} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${applied.view === id ? "bg-card text-brand-600 shadow-sm" : "text-muted hover:text-default"} disabled:cursor-not-allowed disabled:opacity-35`}><Icon className="h-3.5 w-3.5" /><span className="hidden sm:inline">{label}</span></button>)}</div>{dirty && <button type="button" onClick={() => setSetupExpanded(true)} className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">Review changes</button>}</div></div>
        {report && businessResultsOpen && <BusinessResultsPanel
          results={report.summary.businessResults}
          options={report.summary.businessResultOptions}
          selectedIds={draft.businessResultIds}
          automaticIds={report.summary.automaticBusinessResultIds}
          relatedIds={report.summary.relatedBusinessResultIds}
          canEdit={draft.source === applied.source}
          dirty={dirty}
          onSelectionChange={setBusinessResultIds}
        />}
        {loading && !report ? <InitialReportSkeleton ready={ready} /> : report && report.rows.length > 0 ? <StudioResult report={report} availableFields={fieldsForSource(report.config.source)} frozenColumnIds={frozenColumnIds} onFrozenColumnsChange={setFrozenColumnIds} onRowClick={drillIntoRow} onReorderColumn={reorderTableColumn} onMoveColumn={moveTableColumn} onInsertColumn={insertTableColumn} onShowColumn={showTableColumn} onShowAllColumns={showAllTableColumns} onHideColumn={hideTableColumn} onSortColumn={sortTableColumn} onAddSort={addTableSort} onClearColumnSort={clearTableColumnSort} onClearAllSort={clearAllTableSort} onOpenColumnFilter={openTableColumnFilter} onClearColumnFilter={clearTableColumnFilter} onFilterCell={filterFromTableCell} /> : <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-faint"><Layers3 className="h-5 w-5" /></span><h3 className="font-semibold text-default">No records match this setup</h3><p className="mt-1 max-w-md text-sm leading-6 text-muted">Try the same report without filters, or open the filter builder to make a smaller adjustment.</p><div className="mt-4 flex flex-wrap justify-center gap-2">{filterConditions.length > 0 && <button type="button" onClick={showAllRecords} className="btn-primary h-9 px-4 text-xs"><Sparkles className="h-3.5 w-3.5" />Show all records</button>}<button type="button" onClick={() => setPanel("filters")} className="glass-btn h-9 text-xs"><Filter className="h-3.5 w-3.5" />Review filters</button></div></div>}
        {report && report.pagination.totalRows > 0 && <div className="flex flex-col gap-3 border-t border-base px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-muted">Showing {Math.min((report.pagination.page - 1) * applied.pageSize + 1, report.pagination.totalRows)}–{Math.min(report.pagination.page * applied.pageSize, report.pagination.totalRows)} of {report.pagination.totalRows} rows</span><div className="flex items-center gap-2"><ReportSelect variant="bare" className="w-[96px] rounded-lg border border-base bg-surface" value={String(applied.pageSize)} onChange={(value) => { const next = { ...applied, pageSize: Number(value), page: 1 }; setApplied(next); setDraft(next); }} ariaLabel="Rows per page" options={[10, 25, 50, 100].map((size) => ({ value: String(size), label: `${size} rows` }))} /><span className="px-1 text-[11px] text-faint">Page {report.pagination.page} of {report.pagination.totalPages}</span><button type="button" aria-label="Previous page" onClick={() => setPage(Math.max(1, applied.page - 1))} disabled={applied.page <= 1} className="rounded-lg border border-base p-1.5 text-muted disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><button type="button" aria-label="Next page" onClick={() => setPage(Math.min(report.pagination.totalPages, applied.page + 1))} disabled={applied.page >= report.pagination.totalPages} className="rounded-lg border border-base p-1.5 text-muted disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></div>}
      </section>
      {relationshipClientId && <RelationshipDrawer clientId={relationshipClientId} financialYear={applied.financialYear} onClose={() => setRelationshipClientId(null)} />}
    </div>
  );
}

function InitialReportSkeleton({ ready }: { ready: boolean }) {
  return <div role="status" className="min-h-72 animate-pulse p-4 sm:p-5"><div className="mb-4 flex items-center gap-2 text-xs font-medium text-muted"><Loader2 className="h-4 w-4 animate-spin text-brand-600" />{ready ? "Loading report data…" : "Preparing your financial year…"}</div><div className="space-y-3"><div className="h-9 rounded-xl bg-surface" /><div className="grid grid-cols-3 gap-3"><div className="h-8 rounded-lg bg-surface" /><div className="h-8 rounded-lg bg-surface" /><div className="h-8 rounded-lg bg-surface" /></div>{Array.from({ length: 5 }, (_, index) => <div key={index} className="grid grid-cols-4 gap-3"><div className="h-7 rounded-lg bg-surface" /><div className="h-7 rounded-lg bg-surface" /><div className="h-7 rounded-lg bg-surface" /><div className="h-7 rounded-lg bg-surface" /></div>)}</div></div>;
}

function ExportMenu({ fy, reportAvailable, downloadingCurrent, downloading, onDownloadCurrent, onDownload, onOpenCustomExport }: {
  fy: string;
  reportAvailable: boolean;
  downloadingCurrent: boolean;
  downloading: ReportType[];
  onDownloadCurrent: () => void;
  onDownload: (type: ReportType) => void;
  onOpenCustomExport: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} className={`glass-btn ${open ? "text-brand-600" : ""}`}>
        <Download className="h-4 w-4" />Export<ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="reports-quick-export-menu reports-secondary-card fixed inset-x-4 top-24 rounded-2xl p-3 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[420px] sm:max-w-[calc(100vw-2rem)]">
          <div className="px-1 pb-2">
            <h2 className="text-sm font-semibold text-default">Export reports</h2>
            <p className="mt-0.5 text-[11px] text-muted">Current view or a ready-made workbook for FY {fy}.</p>
          </div>
          <button type="button" onClick={() => { onDownloadCurrent(); setOpen(false); }} disabled={!reportAvailable || downloadingCurrent} className="mb-2 flex w-full items-center gap-3 rounded-xl border border-base bg-card px-3 py-2.5 text-left transition hover:bg-surface disabled:opacity-45">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600 dark:bg-brand-950/30">{downloadingCurrent ? <Loader2 className="h-4 w-4 animate-spin" /> : <Table2 className="h-4 w-4" />}</span>
            <span className="min-w-0 flex-1"><strong className="block text-xs font-semibold text-default">Current report</strong><span className="block text-[10px] text-muted">Export the active setup to Excel</span></span>
            <Download className="h-3.5 w-3.5 text-faint" />
          </button>
          <p className="px-1 pb-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-faint">Ready-made workbooks</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {REPORT_TYPES.map(({ id, label, icon: Icon, color, darkColor }) => {
              const isDownloading = downloading.includes(id);
              return (
                <button key={id} type="button" onClick={() => onDownload(id)} disabled={isDownloading} className="flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-default hover:bg-surface disabled:opacity-60">
                  <span className={`shrink-0 rounded-lg p-1.5 ${color} ${darkColor}`}>{isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}</span>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <Download className="h-3.5 w-3.5 shrink-0 text-faint" />
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => { onOpenCustomExport(); setOpen(false); }} className="mt-2 flex w-full items-center gap-2 rounded-xl border-t border-base px-2.5 pt-3 text-left text-xs font-semibold text-default hover:text-brand-600"><SlidersHorizontal className="h-3.5 w-3.5" /><span className="flex-1">Build a custom client export</span><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </div>
  );
}

const INSPECTOR_DETAILS: Record<Exclude<StudioPanel, null>, { title: string; description: string; Icon: typeof Columns3 }> = {
  columns: { title: "Columns", description: "Choose what appears in the table and Excel, then arrange it in the order people will read it.", Icon: Columns3 },
  filters: { title: "Filters", description: "Narrow the report with safe, read-only conditions across related website records.", Icon: Filter },
  group: { title: "Group By", description: "Combine matching rows into useful business groups and preview the resulting table shape.", Icon: Group },
  metrics: { title: "Summary Metrics", description: "Choose the calculations that appear in summaries, grouped results, the total bar and Excel.", Icon: Sigma },
  saved: { title: "Saved Reports", description: "Load, update or save configurations to your account. Fresh data is fetched whenever a report runs.", Icon: FolderOpen },
};

function StudioInspector({ panel, dirty, onClose, onUndo, onRun, children }: {
  panel: Exclude<StudioPanel, null>;
  dirty: boolean;
  onClose: () => void;
  onUndo: () => void;
  onRun: () => void;
  children: ReactNode;
}) {
  const { title, description, Icon } = INSPECTOR_DETAILS[panel];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return createPortal(<div className="report-inspector-backdrop fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-5" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="report-inspector-title" className="report-inspector-shell flex h-[92vh] w-full flex-col overflow-hidden rounded-t-[30px] sm:h-[min(820px,calc(100vh-2.5rem))] sm:max-w-[1080px] sm:rounded-[30px]">
      <header className="report-inspector-header flex shrink-0 items-center gap-3 px-4 py-3.5 sm:px-6 sm:py-4">
        <span className="report-inspector-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] text-brand-600"><Icon className="h-[18px] w-[18px]" /></span>
        <div className="min-w-0 flex-1"><h2 id="report-inspector-title" className="text-[16px] font-semibold tracking-[-0.018em] text-default">{title}</h2><p className="mt-0.5 max-w-3xl text-[11px] leading-4 text-muted sm:text-xs">{description}</p></div>
        <button type="button" onClick={onClose} aria-label={`Close ${title}`} className="report-inspector-close rounded-full p-2.5 text-faint transition-all hover:text-default"><X className="h-4 w-4" /></button>
      </header>
      <div className="report-inspector-body min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">{children}</div>
      <footer className="report-inspector-footer flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <div className="report-inspector-status flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-medium text-muted">
          <span className={`h-1.5 w-1.5 rounded-full ${dirty ? "bg-amber-500" : "bg-emerald-500"}`} />
          {dirty ? "Pending changes" : "Up to date"}
        </div>
        <div className="flex items-center gap-2">
          {panel !== "saved" && <button type="button" onClick={onUndo} disabled={!dirty} className="rounded-xl px-3 py-2 text-[11px] font-semibold text-muted transition-colors hover:bg-surface hover:text-default disabled:cursor-not-allowed disabled:opacity-35">Undo</button>}
          <button type="button" onClick={onClose} className="report-inspector-secondary h-9 rounded-xl px-4 text-[11px] font-semibold text-default">Done</button>
          {panel !== "saved" && dirty && <button type="button" onClick={onRun} className="btn-primary h-9 rounded-xl px-4 text-[11px] shadow-[0_8px_18px_-9px_rgba(0,113,227,0.75)]"><Play className="h-3.5 w-3.5" />Apply &amp; Run</button>}
        </div>
      </footer>
    </section>
  </div>, document.body);
}

function InspectorSearch({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="reports-search-field">
    <Search className="pointer-events-none h-4 w-4 shrink-0 text-faint" />
    <span className="sr-only">{placeholder}</span>
    <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-[12px] text-default outline-none placeholder:text-faint" />
    {value && <button type="button" onClick={() => onChange("")} aria-label="Clear search" className="rounded-full p-1 text-faint hover:bg-surface hover:text-default"><X className="h-3 w-3" /></button>}
  </label>;
}

function ColumnPanel({ groups, selected, colors, search, onSearch, onToggle, onToggleGroup, onReorder, onColor, onGroupColor }: {
  groups: Array<[string, ReportStudioFieldDefinition[]]>;
  selected: string[];
  colors: Record<string, string>;
  search: string;
  onSearch: (value: string) => void;
  onToggle: (fieldId: string) => void;
  onToggleGroup: (fieldIds: string[], selectAll: boolean) => void;
  onReorder: (sourceField: string, targetField: string) => void;
  onColor: (fieldId: string, color: string) => void;
  onGroupColor: (fieldIds: string[], color: string) => void;
}) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(groups[0]?.[0] ? [groups[0][0]] : []));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const selectedDefinitions = selected.map((id) => REPORT_STUDIO_FIELD_MAP.get(id)).filter((entry): entry is ReportStudioFieldDefinition => Boolean(entry));
  const toggleExpanded = (group: string) => setExpandedGroups((current) => {
    const next = new Set(current);
    if (next.has(group)) next.delete(group); else next.add(group);
    return next;
  });

  return <div className={`grid min-h-0 gap-4 ${libraryOpen ? "lg:grid-cols-[minmax(270px,0.68fr)_minmax(480px,1.32fr)]" : ""}`}>
    <section className={`report-inspector-panel min-w-0 overflow-hidden rounded-[22px] ${libraryOpen ? "hidden lg:block" : ""}`}>
      <div className="flex items-center justify-between gap-3 border-b border-base px-3.5 py-3 sm:px-4"><div><div className="flex items-center gap-2"><h3 className="text-xs font-semibold text-default">Selected columns</h3><span className="rounded-full bg-brand-50 px-2 py-0.5 text-[9px] font-bold text-brand-600 dark:bg-brand-950/35">{selected.length}</span></div><p className="mt-0.5 text-[9px] leading-4 text-muted">Drag rows to set table and Excel order.</p></div><button type="button" onClick={() => setLibraryOpen((open) => !open)} className={`report-inspector-library-button inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[10px] font-semibold ${libraryOpen ? "text-default" : "text-brand-600"}`}><Plus className={`h-3.5 w-3.5 transition-transform ${libraryOpen ? "rotate-45" : ""}`} />{libraryOpen ? "Close library" : "Field library"}</button></div>
      <div className={`report-inspector-selected-list max-h-[57vh] overflow-y-auto p-2 ${libraryOpen ? "space-y-1" : "grid grid-cols-1 gap-1 sm:grid-cols-2"}`}>{selectedDefinitions.map((definition, index) => {
        const color = reportStudioExcelColor(definition, colors);
        return <div key={definition.id} draggable onDragStart={() => setDraggingId(definition.id)} onDragEnd={() => setDraggingId(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggingId) onReorder(draggingId, definition.id); setDraggingId(null); }} className={`report-inspector-column-row group flex min-h-[46px] items-center gap-2 rounded-xl px-2 transition-all ${draggingId === definition.id ? "scale-[0.985] opacity-45" : ""}`}>
          <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-faint opacity-55 transition-opacity group-hover:opacity-100 active:cursor-grabbing" />
          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-[7px] bg-brand-600 px-1 text-[9px] font-bold text-white shadow-[0_3px_8px_-4px_rgba(0,113,227,0.8)]">{index + 1}</span>
          <span className="min-w-0 flex-1"><strong className="block truncate text-[10px] font-semibold text-default">{definition.label}</strong><span className="block truncate text-[8px] text-faint">{definition.group}</span></span>
          <label className="relative h-[18px] w-[18px] shrink-0 cursor-pointer rounded-full border border-black/10 shadow-sm ring-2 ring-white/80 dark:ring-black/30" style={{ backgroundColor: color }} title={`${definition.label} Excel header colour`}><input type="color" value={color} onInput={(event) => onColor(definition.id, event.currentTarget.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`${definition.label} Excel colour`} /></label>
          <button type="button" onClick={() => onToggle(definition.id)} aria-label={`Remove ${definition.label}`} title={selected.length === 1 ? "At least one column is required" : `Remove ${definition.label}`} className="rounded-lg p-1 text-faint opacity-55 transition-all hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 dark:hover:bg-rose-950/25"><X className="h-3 w-3" /></button>
        </div>;
      })}</div>
      <div className="flex items-center gap-2 border-t border-base px-3.5 py-2.5 text-[9px] leading-4 text-muted"><span className="h-3 w-3 shrink-0 rounded-full border border-black/10 bg-brand-500 shadow-sm" />Colour dots preview Excel header colours.</div>
    </section>

    {libraryOpen && <section className="report-inspector-panel min-w-0 overflow-hidden rounded-[22px]">
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3.5"><div><h3 className="text-xs font-semibold text-default">Field library</h3><p className="mt-0.5 text-[9px] leading-4 text-muted">Browse related website sections and add only what matters.</p></div><div className="flex items-center gap-2"><span className="rounded-full bg-surface px-2.5 py-1 text-[9px] font-semibold text-muted">{selected.length} selected</span><button type="button" onClick={() => setLibraryOpen(false)} aria-label="Close field library" className="report-inspector-close rounded-full p-1.5 text-faint lg:hidden"><X className="h-3.5 w-3.5" /></button></div></div>
      <div className="mx-3.5 mb-3"><InspectorSearch value={search} onChange={onSearch} placeholder="Search fields, sections or descriptions" /></div>
      <div className="report-inspector-library max-h-[55vh] space-y-1 overflow-y-auto border-t border-base p-2">{groups.length === 0 ? <div className="rounded-xl border border-dashed border-base p-6 text-center text-xs text-muted">No fields match your search.</div> : groups.map(([group, fields]) => {
        const fieldIds = fields.map((field) => field.id);
        const selectedCount = fieldIds.filter((fieldId) => selected.includes(fieldId)).length;
        const allSelected = selectedCount === fieldIds.length;
        const groupColor = reportStudioExcelColor(fields[0], colors);
        const open = Boolean(search.trim()) || expandedGroups.has(group);
        return <div key={group} className="report-inspector-field-group overflow-hidden rounded-xl">
          <div className="flex items-center gap-2 px-2.5 py-2"><button type="button" onClick={() => toggleExpanded(group)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left"><ChevronDown className={`h-3.5 w-3.5 shrink-0 text-faint transition-transform ${open ? "" : "-rotate-90"}`} /><span className="min-w-0 flex-1"><strong className="block truncate text-[10px] font-semibold text-default">{group}</strong><span className="block text-[8px] text-faint">{selectedCount} of {fieldIds.length} selected</span></span></button>
            <label className="relative h-5 w-5 shrink-0 cursor-pointer rounded-full border border-black/10 shadow-sm" style={{ backgroundColor: groupColor }} title={`Set one Excel colour for all ${group} fields`}><input type="color" value={groupColor} onInput={(event) => onGroupColor(fieldIds, event.currentTarget.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`${group} Excel colour`} /></label>
            <button type="button" onClick={() => onToggleGroup(fieldIds, !allSelected)} className="rounded-lg px-2 py-1 text-[9px] font-semibold text-brand-600 transition-colors hover:bg-brand-50 dark:hover:bg-brand-950/25">{allSelected ? "Clear" : "Add all"}</button>
          </div>
          {open && <div className="report-inspector-field-rows border-t border-base p-1.5">{fields.map((definition) => {
            const active = selected.includes(definition.id);
            const selectedOrder = active ? selected.indexOf(definition.id) + 1 : null;
            return <div key={definition.id} className={`rounded-lg transition-colors ${active ? "bg-brand-50/80 dark:bg-brand-950/25" : "hover:bg-surface"}`}>
              <div className="flex items-center gap-2 px-2 py-1.5"><button type="button" onClick={() => onToggle(definition.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left"><span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${active ? "border-brand-600 bg-brand-600 text-white" : "border-base bg-card"}`}>{active && <Check className="h-3 w-3" />}</span><span className="min-w-0 flex-1 truncate text-[10px] font-medium text-default">{definition.label}</span>{selectedOrder && <span className="text-[9px] font-bold tabular-nums text-brand-600">#{selectedOrder}</span>}</button><button type="button" onClick={() => setDetailId((current) => current === definition.id ? null : definition.id)} aria-label={`About ${definition.label}`} className={`rounded-md p-1 ${detailId === definition.id ? "bg-surface text-brand-600" : "text-faint hover:bg-surface hover:text-default"}`}><Info className="h-3.5 w-3.5" /></button></div>
              {detailId === definition.id && <p className="border-t border-base/70 px-8 py-2 text-[9px] leading-4 text-muted">{definition.description}</p>}
            </div>;
          })}</div>}
        </div>;
      })}</div>
    </section>}
  </div>;
}

function ChoicePanel({ kind, fields, selected, onToggle, empty }: { kind: "group" | "metric"; fields: ReportStudioFieldDefinition[]; selected: string[]; onToggle: (fieldId: string) => void; empty: string }) {
  const [view, setView] = useState<"selected" | "all">("selected");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const filteredFields = fields.filter((definition) => `${definition.label} ${definition.description} ${definition.group}`.toLowerCase().includes(search.trim().toLowerCase()));
  const visibleFields = view === "selected"
    ? selected.map((id) => REPORT_STUDIO_FIELD_MAP.get(id)).filter((entry): entry is ReportStudioFieldDefinition => Boolean(entry))
    : filteredFields;
  const fieldGroups = new Map<string, ReportStudioFieldDefinition[]>();
  visibleFields.forEach((definition) => fieldGroups.set(definition.group, [...(fieldGroups.get(definition.group) || []), definition]));
  const browseLabel = kind === "group" ? "Add grouping" : "Add metrics";

  return <section className="min-w-0 rounded-2xl border border-base bg-card p-2.5 sm:p-3">
    <div className="mb-3 grid gap-2 sm:grid-cols-[auto_minmax(240px,1fr)] sm:items-center"><div className="flex w-fit rounded-xl bg-surface p-1 text-[10px] font-semibold"><button type="button" onClick={() => setView("selected")} className={`rounded-lg px-2.5 py-1.5 ${view === "selected" ? "bg-card text-brand-600 shadow-sm" : "text-muted"}`}>Selected <span className="ml-1 text-faint">{selected.length}</span></button><button type="button" onClick={() => setView("all")} className={`rounded-lg px-2.5 py-1.5 ${view === "all" ? "bg-card text-brand-600 shadow-sm" : "text-muted"}`}>All fields <span className="ml-1 text-faint">{fields.length}</span></button></div>{view === "all" && <InspectorSearch value={search} onChange={setSearch} placeholder="Search fields" />}</div>
    {visibleFields.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-base px-5 text-center"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface text-faint">{kind === "group" ? <Group className="h-4 w-4" /> : <Sigma className="h-4 w-4" />}</span><p className="mt-3 text-xs font-semibold text-default">{view === "selected" ? empty : "No matching fields"}</p>{view === "selected" && <button type="button" onClick={() => setView("all")} className="mt-2 text-[11px] font-semibold text-brand-600 hover:underline">{browseLabel}</button>}</div> : <div className="max-h-[53vh] space-y-3 overflow-y-auto pr-1">{Array.from(fieldGroups, ([group, definitions]) => <div key={group}><p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-[0.09em] text-faint">{group}</p><div className="space-y-1">{definitions.map((definition) => {
      const active = selected.includes(definition.id);
      const selectedOrder = active ? selected.indexOf(definition.id) + 1 : null;
      return <div key={definition.id} className={`rounded-xl border ${active ? "border-brand-200 bg-brand-50/60 dark:border-brand-900/60 dark:bg-brand-950/20" : "border-base bg-card hover:bg-surface"}`}><div className="flex items-center gap-2 px-2.5 py-2"><button type="button" onClick={() => onToggle(definition.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left"><span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border ${active ? "border-brand-600 bg-brand-600 text-white" : "border-base bg-card"}`}>{active && <Check className="h-3 w-3" />}</span>{selectedOrder && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-bold text-white">{selectedOrder}</span>}<span className="min-w-0 flex-1"><strong className="block truncate text-[11px] text-default">{definition.label}</strong><span className="block truncate text-[9px] text-faint">{kind === "metric" ? aggregateLabel(definition.aggregate) : "Grouping field"}</span></span></button><button type="button" onClick={() => setDetailId((current) => current === definition.id ? null : definition.id)} aria-label={`About ${definition.label}`} className={`rounded-lg p-1.5 ${detailId === definition.id ? "bg-card text-brand-600 shadow-sm" : "text-faint hover:bg-surface hover:text-default"}`}><Info className="h-3.5 w-3.5" /></button></div>{detailId === definition.id && <p className="border-t border-base px-3 py-2 text-[9px] leading-4 text-muted">{definition.description}</p>}</div>;
    })}</div></div>)}</div>}
  </section>;
}

function aggregateLabel(aggregate: ReportStudioFieldDefinition["aggregate"]) {
  if (aggregate === "average") return "Average";
  if (aggregate === "count-distinct") return "Distinct count";
  if (aggregate === "first") return "Recorded value";
  return "Sum";
}

function selectionsMatch(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function previewValue(value: ReportStudioCellValue | undefined, definition: ReportStudioFieldDefinition) {
  if (value === undefined) return <span className="text-faint">Calculated after Run</span>;
  return formatCell(value, definition);
}

function GroupingImpactPreview({ source, selected, metrics, appliedSelected, configurationDirty, report }: {
  source: ReportStudioSource;
  selected: string[];
  metrics: string[];
  appliedSelected: string[];
  configurationDirty: boolean;
  report: ReportStudioResponse | null;
}) {
  const sourceDefinition = REPORT_STUDIO_SOURCES.find((entry) => entry.id === source);
  const groupDefinitions = selected.map((id) => REPORT_STUDIO_FIELD_MAP.get(id)).filter((entry): entry is ReportStudioFieldDefinition => Boolean(entry));
  const metricDefinitions = metrics.map((id) => REPORT_STUDIO_FIELD_MAP.get(id)).filter((entry): entry is ReportStudioFieldDefinition => Boolean(entry)).slice(0, 3);
  const unchanged = selectionsMatch(selected, appliedSelected);
  const rowMeaning = groupDefinitions.length === 0
    ? sourceDefinition?.grain || "One row per source record"
    : `One row per unique ${groupDefinitions.map((entry) => entry.label).join(" + ")} combination`;
  const previewColumns = [...groupDefinitions, ...metricDefinitions];
  const actualPreviewRows = unchanged && !configurationDirty && report ? report.rows.slice(0, 3) : [];
  const sampleValues = groupDefinitions.map((definition) => definition.options?.[0] || `Each ${definition.shortLabel}`);

  return <aside className="h-fit rounded-2xl border border-brand-200 bg-brand-50/50 p-3.5 dark:border-brand-900/60 dark:bg-brand-950/15">
    <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Table2 className="h-4 w-4 text-brand-600" /><h4 className="text-xs font-semibold text-default">Impact Preview</h4></div><span className="rounded-full bg-card px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.07em] text-muted">Read only</span></div>
    <div className="mt-3 rounded-xl bg-card p-3 shadow-sm"><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">What each row will represent</p><p className="mt-1 text-xs font-semibold leading-5 text-default">{rowMeaning}</p><p className="mt-1 text-[10px] leading-4 text-muted">{groupDefinitions.length === 0 ? "Client or source-level records stay separate; selected metrics are not combined into category rows." : `Matching ${sourceDefinition?.label.toLowerCase() || "records"} will be combined into these groups. Numeric metrics will be recalculated for every group.`}</p></div>
    <div className="mt-3"><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">Result structure</p>{previewColumns.length === 0 ? <p className="mt-2 text-xs text-muted">Select a grouping field or summary metric to preview the result columns.</p> : <div className="mt-2 overflow-hidden rounded-xl border border-base bg-card"><div className={`grid divide-x divide-base bg-surface`} style={{ gridTemplateColumns: `repeat(${previewColumns.length}, minmax(90px, 1fr))` }}>{previewColumns.map((definition) => <div key={definition.id} className="truncate px-2 py-2 text-[9px] font-semibold text-default" title={definition.label}>{definition.shortLabel}</div>)}</div>{actualPreviewRows.length > 0 ? actualPreviewRows.map((row) => <div key={row.id} className="grid divide-x divide-base border-t border-base" style={{ gridTemplateColumns: `repeat(${previewColumns.length}, minmax(90px, 1fr))` }}>{previewColumns.map((definition) => <div key={definition.id} className="truncate px-2 py-2 text-[10px] text-muted">{previewValue(row.values[definition.id], definition)}</div>)}</div>) : <div className="grid divide-x divide-base border-t border-base" style={{ gridTemplateColumns: `repeat(${previewColumns.length}, minmax(90px, 1fr))` }}>{previewColumns.map((definition, index) => <div key={definition.id} className="truncate px-2 py-2 text-[10px] text-muted">{index < sampleValues.length ? sampleValues[index] : "Calculated after Run"}</div>)}</div>}</div>}</div>
    <div className="mt-3 rounded-xl border border-dashed border-brand-200 px-3 py-2 text-[10px] leading-4 text-muted dark:border-brand-900/60">{!configurationDirty ? `Current result: ${report?.pagination.totalRows || 0} row${report?.pagination.totalRows === 1 ? "" : "s"}.` : unchanged ? "The row structure is unchanged, but other pending report settings may change the exact values and row count after you run the report." : "This is a structure preview. Exact group values and row count will be calculated from all matching records after you run the report."}</div>
  </aside>;
}

function MetricImpactPreview({ selected, groupBy, appliedSelected, configurationDirty, report }: {
  selected: string[];
  groupBy: string[];
  appliedSelected: string[];
  configurationDirty: boolean;
  report: ReportStudioResponse | null;
}) {
  const definitions = selected.map((id) => REPORT_STUDIO_FIELD_MAP.get(id)).filter((entry): entry is ReportStudioFieldDefinition => Boolean(entry));
  const groupDefinitions = groupBy.map((id) => REPORT_STUDIO_FIELD_MAP.get(id)).filter((entry): entry is ReportStudioFieldDefinition => Boolean(entry));
  const unchanged = selectionsMatch(selected, appliedSelected);
  const currentMetrics = new Map((report?.summary.metrics || []).map((metric) => [metric.field, metric]));
  const placementText = groupDefinitions.length > 0
    ? `Each metric becomes a calculated column for every ${groupDefinitions.map((entry) => entry.shortLabel).join(" + ")} group.`
    : "Metrics summarize all matching records while the table remains at its current client or source-record level.";

  return <aside className="h-fit rounded-2xl border border-brand-200 bg-brand-50/50 p-3.5 dark:border-brand-900/60 dark:bg-brand-950/15">
    <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Sigma className="h-4 w-4 text-brand-600" /><h4 className="text-xs font-semibold text-default">Impact Preview</h4></div><span className="rounded-full bg-card px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.07em] text-muted">Read only</span></div>
    <div className="mt-3 rounded-xl bg-card p-3 shadow-sm"><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">What will happen</p><p className="mt-1 text-xs font-semibold leading-5 text-default">{definitions.length === 0 ? "No summary calculations will be requested." : `${definitions.length} website calculation${definitions.length === 1 ? "" : "s"} will be included.`}</p><p className="mt-1 text-[10px] leading-4 text-muted">{placementText}</p></div>
    <div className="mt-3 flex flex-wrap gap-1.5">{["KPI summary", groupDefinitions.length > 0 ? "Grouped columns" : "Report totals", "Total bar", "Excel"].map((location) => <span key={location} className="rounded-full border border-base bg-card px-2 py-1 text-[9px] font-semibold text-muted">{location}</span>)}</div>
    <div className="mt-3"><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">Selected calculation preview</p>{definitions.length === 0 ? <p className="mt-2 rounded-xl border border-dashed border-base p-3 text-xs text-muted">Select a metric to see its source, calculation and output.</p> : <div className="mt-2 max-h-[290px] space-y-1.5 overflow-y-auto pr-1">{definitions.map((definition) => { const current = currentMetrics.get(definition.id); return <div key={definition.id} className="rounded-xl border border-base bg-card p-2.5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block text-[11px] text-default">{definition.label}</strong><span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.06em] text-faint">{definition.group} · {aggregateLabel(definition.aggregate)}</span></div><strong className="shrink-0 text-[11px] tabular-nums text-brand-600">{current ? formatCell(current.value, definition) : "After Run"}</strong></div><p className="mt-1 text-[10px] leading-4 text-muted">{definition.description}</p></div>; })}</div>}</div>
    <div className="mt-3 rounded-xl border border-dashed border-brand-200 px-3 py-2 text-[10px] leading-4 text-muted dark:border-brand-900/60">{!configurationDirty ? "Values shown come from the currently loaded report and all matching records, not only the visible page." : unchanged ? "These are the currently loaded values. Pending grouping, filters or other settings may change them after you run the report." : "Existing values are shown where available. Newly selected calculations will use all matching records after you run the report."}</div>
  </aside>;
}

function parseFilterInput(value: string, definition: ReportStudioFieldDefinition, operator: ReportStudioOperator): ReportStudioFilterValue {
  if (operator === "in" || operator === "not_in") return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (["number", "quantity", "currency", "percentage"].includes(definition.type)) return value === "" ? null : Number(value);
  if (definition.type === "boolean") return value === "true";
  return value;
}

function FilterPanel({ group, fields, onLogic, onAdd, onAddGroup, onField, onUpdate, onRemove }: {
  group: ReportStudioFilterGroup;
  fields: ReportStudioFieldDefinition[];
  onLogic: (groupId: string, logic: "and" | "or") => void;
  onAdd: (groupId?: string) => void;
  onAddGroup: (groupId?: string) => void;
  onField: (condition: ReportStudioFilterClause, fieldId: string) => void;
  onUpdate: (id: string, patch: Partial<ReportStudioFilterClause>) => void;
  onRemove: (id: string) => void;
}) {
  return <FilterGroupEditor group={group} fields={fields} depth={0} onLogic={onLogic} onAdd={onAdd} onAddGroup={onAddGroup} onField={onField} onUpdate={onUpdate} onRemove={onRemove} />;
}

function FilterGroupEditor({ group, fields, depth, onLogic, onAdd, onAddGroup, onField, onUpdate, onRemove }: {
  group: ReportStudioFilterGroup;
  fields: ReportStudioFieldDefinition[];
  depth: number;
  onLogic: (groupId: string, logic: "and" | "or") => void;
  onAdd: (groupId?: string) => void;
  onAddGroup: (groupId?: string) => void;
  onField: (condition: ReportStudioFilterClause, fieldId: string) => void;
  onUpdate: (id: string, patch: Partial<ReportStudioFilterClause>) => void;
  onRemove: (id: string) => void;
}) {
  return <div className={depth > 0 ? "rounded-xl border border-brand-100 bg-brand-50/40 p-3 dark:border-brand-900/50 dark:bg-brand-950/10" : ""}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2"><div className="flex rounded-lg bg-surface p-1 text-[11px] font-semibold"><button type="button" onClick={() => onLogic(group.id, "and")} className={`rounded-md px-2 py-1 ${group.logic === "and" ? "bg-card text-brand-600 shadow-sm" : "text-muted"}`}>Match ALL</button><button type="button" onClick={() => onLogic(group.id, "or")} className={`rounded-md px-2 py-1 ${group.logic === "or" ? "bg-card text-brand-600 shadow-sm" : "text-muted"}`}>Match ANY</button></div>{depth > 0 && <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">Nested group</span>}</div>
      <div className="flex gap-2"><button type="button" onClick={() => onAdd(group.id)} className="glass-btn h-9 text-xs"><Plus className="h-3.5 w-3.5" />Condition</button>{depth < 2 && <button type="button" onClick={() => onAddGroup(group.id)} className="glass-btn h-9 text-xs"><Group className="h-3.5 w-3.5" />Nested Group</button>}{depth > 0 && <button type="button" onClick={() => onRemove(group.id)} className="rounded-lg p-2 text-faint hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}</div>
    </div>
    {group.children.length === 0 ? <div className="rounded-xl border border-dashed border-base p-5 text-center text-xs text-muted">No filters. All source records can qualify.</div> : <div className="space-y-2">{group.children.map((child, index) => child.kind === "group" ? <FilterGroupEditor key={child.id} group={child} fields={fields} depth={depth + 1} onLogic={onLogic} onAdd={onAdd} onAddGroup={onAddGroup} onField={onField} onUpdate={onUpdate} onRemove={onRemove} /> : <FilterConditionEditor key={child.id} condition={child} prefix={index === 0 ? "Where" : group.logic} fields={fields} onField={onField} onUpdate={onUpdate} onRemove={onRemove} />)}</div>}
  </div>;
}

function FilterConditionEditor({ condition, prefix, fields, onField, onUpdate, onRemove }: { condition: ReportStudioFilterClause; prefix: string; fields: ReportStudioFieldDefinition[]; onField: (condition: ReportStudioFilterClause, fieldId: string) => void; onUpdate: (id: string, patch: Partial<ReportStudioFilterClause>) => void; onRemove: (id: string) => void }) {
  const definition = REPORT_STUDIO_FIELD_MAP.get(condition.field) || fields[0];
  if (!definition) return null;
  const noValue = condition.operator === "empty" || condition.operator === "not_empty";
  const inputType = ["number", "quantity", "currency", "percentage"].includes(definition.type) ? "number" : definition.type === "date" ? "date" : "text";
  return <div className="grid items-center gap-2 rounded-xl border border-base bg-card p-2 sm:grid-cols-[44px_minmax(170px,1fr)_minmax(150px,0.8fr)_minmax(150px,1fr)_auto]">
    <span className="text-center text-[10px] font-semibold uppercase text-faint">{prefix}</span>
    <ReportSelect value={condition.field} onChange={(value) => onField(condition, value)} ariaLabel="Filter field" searchable options={fields.map((entry) => ({ value: entry.id, label: entry.label, group: entry.group }))} buttonClassName="min-h-9 text-xs" />
    <ReportSelect value={condition.operator} onChange={(value) => onUpdate(condition.id, { operator: value as ReportStudioOperator })} ariaLabel="Filter operator" options={definition.operators.map((operator) => ({ value: operator, label: REPORT_STUDIO_OPERATOR_LABELS[operator] }))} buttonClassName="min-h-9 text-xs" />
    {noValue
      ? <span className="px-2 text-xs text-faint">No value needed</span>
      : definition.options && condition.operator !== "in" && condition.operator !== "not_in"
        ? <ReportSelect value={String(condition.value ?? "")} onChange={(value) => onUpdate(condition.id, { value: parseFilterInput(value, definition, condition.operator) })} ariaLabel="Filter value" searchable={definition.options.length > 8} options={definition.options.map((option) => ({ value: option, label: option }))} buttonClassName="min-h-9 text-xs" />
        : <input type={inputType} value={Array.isArray(condition.value) ? condition.value.join(", ") : String(condition.value ?? "")} onChange={(event) => onUpdate(condition.id, { value: parseFilterInput(event.target.value, definition, condition.operator) })} placeholder={condition.operator === "in" || condition.operator === "not_in" ? "Comma-separated values" : "Value"} className="input-field h-9 rounded-lg text-xs" />}
    <button type="button" onClick={() => onRemove(condition.id)} aria-label="Remove condition" className="rounded-lg p-2 text-faint hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/20"><Trash2 className="h-4 w-4" /></button>
    {condition.operator === "between" && <input type={inputType} value={String(condition.secondValue ?? "")} onChange={(event) => onUpdate(condition.id, { secondValue: parseFilterInput(event.target.value, definition, condition.operator) })} placeholder="And" className="input-field h-9 rounded-lg text-xs sm:col-start-4" />}
  </div>;
}

function SavedPanel({ reports, name, activeId, loading, saving, deletingId, onName, onCreate, onUpdate, onSaveCopy, onLoad, onDelete }: { reports: SavedStudioReport[]; name: string; activeId: string | null; loading: boolean; saving: boolean; deletingId: string | null; onName: (value: string) => void; onCreate: () => void; onUpdate: () => void; onSaveCopy: () => void; onLoad: (report: SavedStudioReport) => void; onDelete: (id: string) => void }) {
  const activeReport = reports.find((report) => report.id === activeId);
  return <div>{activeReport && <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50/70 px-3 py-2 dark:border-brand-900/60 dark:bg-brand-950/20"><span className="min-w-0 text-xs text-muted">Editing <strong className="text-default">{activeReport.name}</strong></span><span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-600">Loaded saved report</span></div>}<div className="flex flex-col gap-2 sm:flex-row"><input value={name} maxLength={120} disabled={saving} onChange={(event) => onName(event.target.value)} placeholder="Name this report configuration" className="input-field h-10 min-w-0 flex-1 rounded-xl text-sm" />{activeReport ? <><button type="button" disabled={saving || loading} onClick={onUpdate} className="btn-primary h-10 shrink-0 disabled:cursor-not-allowed disabled:opacity-60"><Save className="h-4 w-4" />{saving ? "Saving…" : "Update Saved"}</button><button type="button" disabled={saving || loading} onClick={onSaveCopy} className="glass-btn h-10 shrink-0 disabled:cursor-not-allowed disabled:opacity-60">Save as Copy</button></> : <button type="button" disabled={saving || loading} onClick={onCreate} className="btn-primary h-10 shrink-0 disabled:cursor-not-allowed disabled:opacity-60"><Save className="h-4 w-4" />{saving ? "Saving…" : "Save Current"}</button>}</div>{loading ? <div className="mt-3 rounded-xl border border-dashed border-base p-5 text-center text-xs text-muted"><div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" /><p className="mt-2">Loading saved reports from your account…</p></div> : reports.length === 0 ? <div className="mt-3 rounded-xl border border-dashed border-base p-5 text-center text-xs text-muted"><Bookmark className="mx-auto mb-2 h-5 w-5 text-faint" />No saved Report Studio configurations yet.</div> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{reports.map((report) => <div key={report.id} className={`flex items-center justify-between gap-3 rounded-xl border bg-card p-3 ${report.id === activeId ? "border-brand-300 ring-1 ring-brand-100 dark:border-brand-800 dark:ring-brand-950" : "border-base"}`}><button type="button" onClick={() => onLoad(report)} className="min-w-0 flex-1 text-left"><span className="flex items-center gap-2"><strong className="block truncate text-xs text-default">{report.name}</strong>{report.id === activeId && <span className="shrink-0 rounded-full bg-brand-50 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-brand-600 dark:bg-brand-950/40">Editing</span>}</span><span className="mt-0.5 block text-[10px] text-faint">{report.config.financialYear} · {report.config.columns.length} columns · {report.config.filters.children.length} filters</span></button><button type="button" disabled={deletingId === report.id} title="Delete saved report" onClick={() => onDelete(report.id)} className="rounded-lg p-1.5 text-faint hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>}</div>;
}

function BusinessResultsPanel({ results, options, selectedIds, automaticIds, relatedIds, canEdit, dirty, onSelectionChange }: {
  results: ReportStudioResultValue[];
  options: ReportStudioResultValue[];
  selectedIds: string[] | null;
  automaticIds: string[];
  relatedIds: string[];
  canEdit: boolean;
  dirty: boolean;
  onSelectionChange: (ids: string[] | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const optionById = new Map(options.map((option) => [option.id, option]));
  const selected = selectedIds === null
    ? automaticIds.filter((id) => optionById.has(id))
    : selectedIds.filter((id) => optionById.has(id));
  const selectedSet = new Set(selected);
  const editorIds = Array.from(new Set([...relatedIds, ...selected]));
  const editorOptions = editorIds.map((id) => optionById.get(id)).filter((option): option is ReportStudioResultValue => Boolean(option));
  const optionGroups = new Map<string, ReportStudioResultValue[]>();
  editorOptions.forEach((option) => optionGroups.set(option.group || "Other", [...(optionGroups.get(option.group || "Other") || []), option]));

  const toggle = (id: string) => {
    if (!canEdit) return;
    const next = selectedSet.has(id)
      ? selected.filter((selectedId) => selectedId !== id)
      : [...selected, id];
    if (next.length === 0) return;
    onSelectionChange(next);
  };
  const moveSelected = (id: string, offset: -1 | 1) => {
    if (!canEdit || selectedIds === null) return;
    const index = selected.indexOf(id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= selected.length) return;
    const next = [...selected];
    [next[index], next[target]] = [next[target], next[index]];
    onSelectionChange(next);
  };

  return <div className="border-b border-base bg-surface/45 p-4">
    <div className="mb-3 flex items-start justify-between gap-3">
      <div><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold text-default">Report Insights</p><span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] ${selectedIds === null ? "bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-200" : "bg-surface text-muted"}`}>{selectedIds === null ? "Automatic · related to table" : "Manually selected"}</span></div><p className="mt-0.5 text-[10px] text-muted">Derived from this table&apos;s source, visible fields, filters, groupings, and metrics across all matching records.</p></div>
      <button type="button" onClick={() => setEditing((open) => !open)} className={`glass-btn h-8 shrink-0 text-[11px] ${editing ? "text-brand-600" : ""}`}><SlidersHorizontal className="h-3.5 w-3.5" />{editing ? "Done" : "Edit insights"}</button>
    </div>
    {editing && <div className="mb-3 rounded-xl border border-base bg-card p-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2"><div><p className="text-[11px] font-semibold text-default">Choose related insights</p><p className="mt-0.5 text-[9px] text-muted">Only insight families represented in the formed table are offered. The selection and order are stored with saved reports.</p></div><button type="button" disabled={!canEdit || selectedIds === null} onClick={() => onSelectionChange(null)} className="rounded-lg px-2 py-1 text-[10px] font-semibold text-brand-600 hover:bg-brand-50 disabled:cursor-not-allowed disabled:text-faint dark:hover:bg-brand-950/20">Use automatic suggestions</button></div>
      {!canEdit && <p className="mb-3 rounded-lg bg-amber-50 px-2.5 py-2 text-[10px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">Run the newly selected data source first, then edit its related insights.</p>}
      {selectedIds !== null && <div className="mb-3 rounded-lg border border-base bg-surface p-2.5"><p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">Insight card order</p><div className="flex flex-wrap gap-1.5">{selected.map((id, index) => { const option = optionById.get(id); if (!option) return null; return <span key={id} className="inline-flex items-center gap-1 rounded-lg border border-base bg-card py-1 pl-2 pr-1 text-[9px] font-semibold text-default"><span>{index + 1}. {option.label}</span><button type="button" disabled={index === 0} title="Move insight earlier" onClick={() => moveSelected(id, -1)} className="rounded p-0.5 text-faint hover:bg-surface hover:text-default disabled:opacity-30"><ChevronLeft className="h-3 w-3" /></button><button type="button" disabled={index === selected.length - 1} title="Move insight later" onClick={() => moveSelected(id, 1)} className="rounded p-0.5 text-faint hover:bg-surface hover:text-default disabled:opacity-30"><ChevronRight className="h-3 w-3" /></button></span>; })}</div></div>}
      <div className="space-y-3">{Array.from(optionGroups, ([group, groupOptions]) => <div key={group}><p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">{group}</p><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{groupOptions.map((option) => {
        const checked = selectedSet.has(option.id);
        const lastSelected = checked && selected.length === 1;
        return <button key={option.id} type="button" disabled={!canEdit || lastSelected} onClick={() => toggle(option.id)} title={lastSelected ? "At least one insight is required" : option.description} className={`flex min-w-0 items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${checked ? "border-brand-300 bg-brand-50/70 dark:border-brand-800 dark:bg-brand-950/20" : "border-base bg-surface hover:border-brand-200"} disabled:cursor-not-allowed disabled:opacity-60`}><span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? "border-brand-600 bg-brand-600 text-white" : "border-base bg-card"}`}>{checked && <Check className="h-3 w-3" />}</span><span className="min-w-0"><strong className="block text-[10px] text-default">{option.label}</strong><span className="mt-0.5 block line-clamp-2 text-[9px] leading-4 text-muted">{option.description}</span></span></button>;
      })}</div></div>)}</div>
      {dirty && canEdit && <p className="mt-2 text-[9px] font-medium text-amber-700 dark:text-amber-300">Run Report to apply these choices. They will be included when you save this report configuration.</p>}
    </div>}
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">{results.map((result) => <div key={result.id} title={result.description} className="rounded-xl border border-base bg-card px-3 py-2.5"><p className="text-[8px] font-semibold uppercase tracking-[0.08em] text-faint">{result.group}</p><p className="mt-1 text-[10px] font-semibold text-muted">{result.label}</p><p className="mt-1 text-lg font-bold tabular-nums text-default">{formatResultValue(result)}</p><p className="mt-1 line-clamp-2 text-[9px] leading-4 text-muted">{result.description}</p></div>)}</div>
  </div>;
}

type StudioTableActions = {
  report: ReportStudioResponse;
  availableFields: ReportStudioFieldDefinition[];
  frozenColumnIds: string[];
  onFrozenColumnsChange: (fieldIds: string[]) => void;
  onRowClick: (row: ReportStudioResponse["rows"][number]) => void;
  onReorderColumn: (sourceField: string, targetField: string | number, side?: "before" | "after") => void;
  onMoveColumn: (fieldId: string, direction: "left" | "right" | "first" | "last") => void;
  onInsertColumn: (anchorFieldId: string, fieldId: string, side: "left" | "right") => void;
  onShowColumn: (fieldId: string) => void;
  onShowAllColumns: () => void;
  onHideColumn: (fieldId: string) => void;
  onSortColumn: (fieldId: string, direction: "asc" | "desc" | null) => void;
  onAddSort: (fieldId: string, direction: "asc" | "desc") => void;
  onClearColumnSort: (fieldId: string) => void;
  onClearAllSort: () => void;
  onOpenColumnFilter: (fieldId: string) => void;
  onClearColumnFilter: (fieldId: string) => void;
  onFilterCell: (fieldId: string, value: ReportStudioCellValue, exclude: boolean) => void;
};

function StudioResult(props: StudioTableActions) {
  const { report, onRowClick } = props;
  if (report.config.view === "pivot") return <PivotView report={report} onRowClick={onRowClick} />;
  if (report.config.view === "chart") return <ReportStudioChart report={report} onRowClick={onRowClick} />;
  if (report.config.view === "relationships") return <RelationshipCards report={report} onRowClick={onRowClick} />;
  return <StudioTable {...props} />;
}

type TableContext = {
  x: number;
  y: number;
  column: ReportStudioFieldDefinition;
  row?: ReportStudioResponse["rows"][number];
  value?: ReportStudioCellValue;
};

type TableContextView = "root" | "add-left" | "add-right" | "sort-add" | "move" | "hidden" | "summary";

type TableColumnDropSlot = {
  key: string;
  insertionIndex: number;
  indicatorColumnIndex: number;
  indicatorSide: "before" | "after";
  label: string;
};

type TableColumnDragSession = {
  sourceId: string;
  sourceIndex: number;
  sourceWidth: number;
  grabOffsetX: number;
  lastClientX: number;
  scrollVelocity: number;
  animationFrame: number | null;
  dwellTimer: number | null;
  currentSlot: TableColumnDropSlot | null;
  gapSlot: TableColumnDropSlot | null;
  preview: HTMLDivElement | null;
};

function StudioTable({
  report,
  availableFields,
  frozenColumnIds,
  onFrozenColumnsChange,
  onRowClick,
  onReorderColumn,
  onMoveColumn,
  onInsertColumn,
  onShowColumn,
  onShowAllColumns,
  onHideColumn,
  onSortColumn,
  onAddSort,
  onClearColumnSort,
  onClearAllSort,
  onOpenColumnFilter,
  onClearColumnFilter,
  onFilterCell,
}: StudioTableActions) {
  const [context, setContext] = useState<TableContext | null>(null);
  const [contextView, setContextView] = useState<TableContextView>("root");
  const [contextSearch, setContextSearch] = useState("");
  const [frozenOffsets, setFrozenOffsets] = useState<Record<string, number>>({});
  const tableRef = useRef<HTMLTableElement | null>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const grouped = report.config.groupBy.length > 0;
  const frozenSet = useMemo(() => new Set(grouped ? [] : frozenColumnIds), [frozenColumnIds, grouped]);
  const displayedColumns = useMemo(() => {
    if (grouped || frozenSet.size === 0) return report.columns;
    return [
      ...report.columns.filter((column) => frozenSet.has(column.id)),
      ...report.columns.filter((column) => !frozenSet.has(column.id)),
    ];
  }, [frozenSet, grouped, report.columns]);
  const hiddenFields = useMemo(() => availableFields.filter((field) => !report.config.columns.includes(field.id)), [availableFields, report.config.columns]);
  const filteredHiddenFields = useMemo(() => {
    const search = contextSearch.trim().toLowerCase();
    return search
      ? hiddenFields.filter((field) => `${field.label} ${field.group} ${field.description}`.toLowerCase().includes(search))
      : hiddenFields;
  }, [contextSearch, hiddenFields]);
  const filteredFieldIds = useMemo(() => {
    const ids = new Set<string>();
    const visit = (group: ReportStudioFilterGroup) => group.children.forEach((child) => child.kind === "group" ? visit(child) : ids.add(child.field));
    visit(report.config.filters);
    return ids;
  }, [report.config.filters]);

  const closeContext = () => {
    setContext(null);
    setContextView("root");
    setContextSearch("");
  };

  const showContextView = (view: TableContextView) => {
    setContextView(view);
    setContextSearch("");
  };
  useEffect(() => {
    if (!context) return;
    const close = () => {
      setContext(null);
      setContextView("root");
      setContextSearch("");
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", escape);
    };
  }, [context]);

  useEffect(() => {
    if (!context) return;
    const frame = window.requestAnimationFrame(() => {
      const menu = document.querySelector<HTMLElement>('[data-report-column-menu="true"]');
      if (!menu) return;
      const viewportPadding = 8;
      const menuWidth = menu.offsetWidth;
      const naturalHeight = menu.scrollHeight;
      const maxViewportHeight = Math.max(220, window.innerHeight - viewportPadding * 2);
      const renderedHeight = Math.min(naturalHeight, maxViewportHeight);
      const roomBelow = window.innerHeight - context.y - viewportPadding;
      const roomAbove = context.y - viewportPadding;
      const shouldOpenUpward = naturalHeight > roomBelow && roomAbove > roomBelow;
      const top = shouldOpenUpward
        ? Math.max(viewportPadding, context.y - renderedHeight)
        : Math.max(viewportPadding, Math.min(context.y, window.innerHeight - renderedHeight - viewportPadding));
      const left = Math.max(viewportPadding, Math.min(context.x, window.innerWidth - menuWidth - viewportPadding));
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      menu.style.maxHeight = `${Math.max(220, window.innerHeight - top - viewportPadding)}px`;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [context, contextView]);

  const handleTableContextMenu = (event: React.MouseEvent<HTMLTableElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.target instanceof HTMLElement ? event.target : null;
    const cell = target?.closest<HTMLTableCellElement>("th, td");
    if (!cell || !event.currentTarget.contains(cell)) return;
    const column = displayedColumns[cell.cellIndex] || displayedColumns[0];
    if (!column) return;
    const rowElement = target?.closest<HTMLTableRowElement>("tbody tr");
    const bodyRows = rowElement ? Array.from(event.currentTarget.tBodies[0]?.rows || []) : [];
    const rowIndex = rowElement ? bodyRows.indexOf(rowElement) : -1;
    const row = rowIndex >= 0 ? report.rows[rowIndex] : undefined;
    setContextView("root");
    setContextSearch("");
    setContext({
      x: Math.min(event.clientX, window.innerWidth - 310),
      y: Math.min(event.clientY, window.innerHeight - 460),
      column,
      row,
      value: row ? row.values[column.id] ?? null : undefined,
    });
  };
  const copyText = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(message);
    } catch {
      toast.error("Unable to copy from this browser");
    }
  };
  const rawValue = (value: ReportStudioCellValue | undefined) => value == null ? "" : Array.isArray(value) ? value.join(", ") : String(value);
  const columnResults = context ? report.summary.columnResults.find((result) => result.field === context.column.id)?.results || [] : [];
  const currentSort = context ? report.config.sort.find((sort) => sort.field === context.column.id) : undefined;

  useEffect(() => {
    const table = tableRef.current;
    const container = tableContainerRef.current;
    if (!table || frozenSet.size === 0) {
      setFrozenOffsets({});
      if (container) delete container.dataset.frozenScrolled;
      return;
    }
    const updateOffsets = () => {
      let left = 0;
      const offsets: Record<string, number> = {};
      displayedColumns.forEach((column) => {
        if (!frozenSet.has(column.id)) return;
        offsets[column.id] = left;
        const header = table.querySelector<HTMLElement>(`thead [data-column-id="${column.id}"]`);
        left += header?.offsetWidth || (column.id === "client.companyName" ? 240 : 144);
      });
      setFrozenOffsets(offsets);
    };
    updateOffsets();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateOffsets);
    observer?.observe(table);
    const updateBoundary = () => {
      container?.setAttribute("data-frozen-scrolled", container.scrollLeft > 1 ? "true" : "false");
    };
    updateBoundary();
    container?.addEventListener("scroll", updateBoundary, { passive: true });
    window.addEventListener("resize", updateOffsets);
    return () => {
      observer?.disconnect();
      container?.removeEventListener("scroll", updateBoundary);
      if (container) delete container.dataset.frozenScrolled;
      window.removeEventListener("resize", updateOffsets);
    };
  }, [displayedColumns, frozenSet]);

  const updateFrozenColumns = (nextIds: string[]) => {
    const unique = report.columns.map((column) => column.id).filter((fieldId) => nextIds.includes(fieldId));
    if (unique.length > frozenColumnIds.length && unique.length > 1) {
      const headers = Array.from(tableRef.current?.tHead?.rows[0]?.cells || []);
      const projectedWidth = displayedColumns
        .filter((column) => unique.includes(column.id))
        .reduce((total, column) => {
          const index = displayedColumns.findIndex((entry) => entry.id === column.id);
          return total + (headers[index]?.getBoundingClientRect().width || (column.id === "client.companyName" ? 240 : 144));
        }, 0);
      const availableWidth = tableContainerRef.current?.clientWidth || window.innerWidth;
      if (projectedWidth > availableWidth * 0.65) {
        toast.error("Unfreeze another column first so the scrolling area remains usable");
        return;
      }
    }
    onFrozenColumnsChange(unique);
  };

  useEffect(() => {
    if (grouped) return;
    const table = tableRef.current;
    const container = tableContainerRef.current;
    const headerRow = table?.tHead?.rows[0];
    if (!table || !container || !headerRow) return;

    container.classList.add("report-studio-table-scroll");
    let session: TableColumnDragSession | null = null;
    let disposed = false;

    const cellsAt = (columnIndex: number) => Array.from(table.rows)
      .map((row) => row.cells[columnIndex])
      .filter((cell): cell is HTMLTableCellElement => Boolean(cell));

    const clearDwell = () => {
      if (!session?.dwellTimer) return;
      window.clearTimeout(session.dwellTimer);
      session.dwellTimer = null;
    };

    const clearIndicator = () => {
      Array.from(headerRow.cells).forEach((cell) => {
        cell.classList.remove("report-studio-drop-before", "report-studio-drop-after");
        delete cell.dataset.dropLabel;
      });
    };

    const clearGap = () => {
      if (!session?.gapSlot) return;
      Array.from(table.rows).forEach((row) => Array.from(row.cells).forEach((cell) => {
        cell.classList.remove("report-studio-column-gap-source", "report-studio-column-shift");
        cell.style.removeProperty("--report-column-shift");
      }));
      session.gapSlot = null;
    };

    const clearScrollCue = () => {
      container.classList.remove("report-studio-autoscroll-left", "report-studio-autoscroll-right");
    };

    const removePreview = () => {
      if (!session?.preview) return;
      session.preview.remove();
      session.preview = null;
    };

    const finishDrag = () => {
      if (session?.animationFrame != null) window.cancelAnimationFrame(session.animationFrame);
      clearDwell();
      removePreview();
      clearIndicator();
      clearGap();
      clearScrollCue();
      Array.from(headerRow.cells).forEach((cell) => cell.classList.remove("report-studio-column-dragging"));
      table.classList.remove("report-studio-column-reordering");
      session = null;
    };

    const sourceVirtualRect = (active: TableColumnDragSession, clientX: number) => {
      const left = clientX - active.grabOffsetX;
      return { left, right: left + active.sourceWidth, center: left + active.sourceWidth / 2 };
    };

    const resolveDropSlot = (clientX: number): TableColumnDropSlot | null => {
      if (!session) return null;
      const containerRect = container.getBoundingClientRect();
      const headers = Array.from(headerRow.cells);
      const frozenCount = displayedColumns.filter((column) => frozenSet.has(column.id)).length;
      const lastFrozenRect = frozenCount > 0 ? headers[frozenCount - 1]?.getBoundingClientRect() : null;
      const frozenRight = lastFrozenRect
        ? Math.min(containerRect.right, Math.max(containerRect.left, lastFrozenRect.right))
        : containerRect.left;
      const sourceFrozen = frozenSet.has(session.sourceId);
      const remaining = headers
        .map((header, originalIndex) => ({
          header,
          originalIndex,
          remainingIndex: originalIndex < session!.sourceIndex ? originalIndex : originalIndex - 1,
        }))
        .filter((entry) => entry.originalIndex !== session!.sourceIndex)
        .filter((entry) => frozenSet.has(displayedColumns[entry.originalIndex]?.id) === sourceFrozen);
      const visible = remaining.flatMap((entry) => {
        const rect = entry.header.getBoundingClientRect();
        const visibleLeft = sourceFrozen ? rect.left : Math.max(rect.left, frozenRight);
        const visibleRight = Math.min(rect.right, containerRect.right);
        if (visibleRight - visibleLeft < 4) return [];
        return [{ ...entry, center: visibleLeft + (visibleRight - visibleLeft) / 2 }];
      });
      if (visible.length === 0) return null;

      const draggedCenter = sourceVirtualRect(session, clientX).center;
      const next = visible.find((entry) => draggedCenter < entry.center);
      const insertionIndex = next
        ? next.remainingIndex
        : visible[visible.length - 1].remainingIndex + 1;
      if (insertionIndex === session.sourceIndex) return null;

      const indicator = next || visible[visible.length - 1];
      const definition = displayedColumns[indicator.originalIndex];
      const indicatorSide = next ? "before" as const : "after" as const;
      return {
        key: String(insertionIndex),
        insertionIndex,
        indicatorColumnIndex: indicator.originalIndex,
        indicatorSide,
        label: `${indicatorSide === "before" ? "Before" : "After"} ${definition?.shortLabel || "column"}`,
      };
    };

    const showIndicator = (slot: TableColumnDropSlot | null) => {
      clearIndicator();
      if (!slot) return;
      const indicator = headerRow.cells[slot.indicatorColumnIndex];
      if (!indicator) return;
      indicator.classList.add(slot.indicatorSide === "before" ? "report-studio-drop-before" : "report-studio-drop-after");
      indicator.dataset.dropLabel = slot.label;
    };

    const openGap = (slot: TableColumnDropSlot) => {
      if (!session || session.currentSlot?.key !== slot.key || session.scrollVelocity !== 0) return;
      clearGap();
      session.gapSlot = slot;
      cellsAt(session.sourceIndex).forEach((cell) => cell.classList.add("report-studio-column-gap-source"));
      const movingRight = slot.insertionIndex > session.sourceIndex;
      const shift = movingRight ? -session.sourceWidth : session.sourceWidth;
      const firstShifted = movingRight ? session.sourceIndex + 1 : slot.insertionIndex;
      const lastShifted = movingRight ? slot.insertionIndex : session.sourceIndex - 1;
      for (let index = firstShifted; index <= lastShifted; index += 1) {
        cellsAt(index).forEach((cell) => {
          cell.style.setProperty("--report-column-shift", `${shift}px`);
          cell.classList.add("report-studio-column-shift");
        });
      }
    };

    const scheduleGap = () => {
      if (!session?.currentSlot || session.scrollVelocity !== 0 || session.gapSlot?.key === session.currentSlot.key || session.dwellTimer) return;
      const intendedSlot = session.currentSlot;
      const intendedSession = session;
      session.dwellTimer = window.setTimeout(() => {
        intendedSession.dwellTimer = null;
        if (session === intendedSession && session.currentSlot?.key === intendedSlot.key && session.scrollVelocity === 0) {
          openGap(intendedSlot);
        }
      }, 350);
    };

    const updateCandidate = (next: TableColumnDropSlot | null, allowGap: boolean) => {
      if (!session) return;
      if (session.currentSlot?.key !== next?.key) {
        clearDwell();
        clearGap();
        session.currentSlot = next;
        showIndicator(next);
      }
      if (allowGap) scheduleGap();
    };

    const edgeVelocity = (clientX: number) => {
      if (!session || container.scrollWidth <= container.clientWidth + 1) return 0;
      if (frozenSet.has(session.sourceId)) return 0;
      const bounds = container.getBoundingClientRect();
      const virtual = sourceVirtualRect(session, clientX);
      const frozenCount = displayedColumns.filter((column) => frozenSet.has(column.id)).length;
      const lastFrozenRect = frozenCount > 0 ? headerRow.cells[frozenCount - 1]?.getBoundingClientRect() : null;
      const leftBoundary = lastFrozenRect
        ? Math.min(bounds.right, Math.max(bounds.left, lastFrozenRect.right))
        : bounds.left;
      const leftOverlap = container.scrollLeft > 0.5 ? Math.max(0, leftBoundary - virtual.left) : 0;
      const rightLimit = Math.max(0, container.scrollWidth - container.clientWidth);
      const rightOverlap = container.scrollLeft < rightLimit - 0.5 ? Math.max(0, virtual.right - bounds.right) : 0;
      if (leftOverlap === 0 && rightOverlap === 0) return 0;
      const direction = rightOverlap > leftOverlap ? 1 : -1;
      const overlap = Math.max(leftOverlap, rightOverlap);
      const ratio = Math.min(1, overlap / Math.max(56, session.sourceWidth * 0.55));
      return direction * Math.ceil(3 + 21 * ratio * ratio);
    };

    const setScrollVelocity = (velocity: number) => {
      if (!session || session.scrollVelocity === velocity) return;
      session.scrollVelocity = velocity;
      clearScrollCue();
      if (velocity !== 0) {
        clearDwell();
        clearGap();
        container.classList.add(velocity < 0 ? "report-studio-autoscroll-left" : "report-studio-autoscroll-right");
      }
    };

    const runAutoScroll = () => {
      if (!session || session.animationFrame != null || session.scrollVelocity === 0) return;
      const activeSession = session;
      const tick = () => {
        if (session !== activeSession || disposed) return;
        activeSession.animationFrame = null;
        if (activeSession.scrollVelocity === 0) return;
        const previous = container.scrollLeft;
        container.scrollLeft += activeSession.scrollVelocity;
        const moved = Math.abs(container.scrollLeft - previous) > 0.5;
        const nextVelocity = moved ? edgeVelocity(activeSession.lastClientX) : 0;
        setScrollVelocity(nextVelocity);
        updateCandidate(resolveDropSlot(activeSession.lastClientX), nextVelocity === 0);
        if (activeSession.scrollVelocity !== 0) {
          activeSession.animationFrame = window.requestAnimationFrame(tick);
        }
      };
      activeSession.animationFrame = window.requestAnimationFrame(tick);
    };

    const handleDragStart = (event: DragEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLTableCellElement>("th") : null;
      if (!target || target.closest("table") !== table || target.parentElement !== headerRow || !event.dataTransfer) return;
      const sourceIndex = target.cellIndex;
      const definition = displayedColumns[sourceIndex];
      if (!definition) return;
      const rect = target.getBoundingClientRect();
      const preview = document.createElement("div");
      preview.className = "report-studio-drag-preview";
      const grip = document.createElement("span");
      grip.textContent = "⋮⋮";
      const label = document.createElement("span");
      label.textContent = definition.shortLabel;
      preview.append(grip, label);
      document.body.appendChild(preview);

      session = {
        sourceId: definition.id,
        sourceIndex,
        sourceWidth: rect.width,
        grabOffsetX: Math.max(8, Math.min(rect.width - 8, event.clientX - rect.left)),
        lastClientX: event.clientX,
        scrollVelocity: 0,
        animationFrame: null,
        dwellTimer: null,
        currentSlot: null,
        gapSlot: null,
        preview,
      };
      table.classList.add("report-studio-column-reordering");
      target.classList.add("report-studio-column-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", definition.id);
      event.dataTransfer.setDragImage(preview, session.grabOffsetX, Math.min(24, rect.height / 2));
      closeContext();
    };

    const handleDragOver = (event: DragEvent) => {
      if (!session) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      session.lastClientX = event.clientX;
      const velocity = edgeVelocity(event.clientX);
      setScrollVelocity(velocity);
      updateCandidate(resolveDropSlot(event.clientX), velocity === 0);
      runAutoScroll();
    };

    const flashDroppedColumn = (columnIndex: number) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        const currentTable = tableRef.current;
        if (!currentTable) return;
        const flashed = Array.from(currentTable.rows)
          .map((row) => row.cells[columnIndex])
          .filter((cell): cell is HTMLTableCellElement => Boolean(cell));
        flashed.forEach((cell) => cell.classList.add("report-studio-column-settled"));
        window.setTimeout(() => flashed.forEach((cell) => cell.classList.remove("report-studio-column-settled")), 520);
      }));
    };

    const handleDrop = (event: DragEvent) => {
      if (!session) return;
      event.preventDefault();
      event.stopPropagation();
      const active = session;
      const slot = active.currentSlot;
      finishDrag();
      if (!slot) return;
      const targetFieldId = displayedColumns[slot.indicatorColumnIndex]?.id;
      if (!targetFieldId) return;
      onReorderColumn(active.sourceId, targetFieldId, slot.indicatorSide);
      flashDroppedColumn(slot.insertionIndex);
    };

    const handleDragEnd = () => {
      if (session) finishDrag();
    };

    table.addEventListener("dragstart", handleDragStart, true);
    container.addEventListener("dragover", handleDragOver);
    container.addEventListener("drop", handleDrop, true);
    table.addEventListener("dragend", handleDragEnd, true);
    return () => {
      disposed = true;
      table.removeEventListener("dragstart", handleDragStart, true);
      container.removeEventListener("dragover", handleDragOver);
      container.removeEventListener("drop", handleDrop, true);
      table.removeEventListener("dragend", handleDragEnd, true);
      finishDrag();
      container.classList.remove("report-studio-table-scroll");
    };
  }, [displayedColumns, frozenSet, grouped, onReorderColumn]);

  const totalBarResult = (column: ReportStudioFieldDefinition) => {
    const results = report.summary.columnResults.find((result) => result.field === column.id)?.results || [];
    if (column.type === "percentage") return results.find((result) => result.id === "average");
    if (["number", "quantity", "currency"].includes(column.type)) return results.find((result) => result.id === "sum");
    return undefined;
  };

  const activeColumnFrozen = context ? frozenSet.has(context.column.id) : false;
  const lastFrozenId = displayedColumns.filter((column) => frozenSet.has(column.id)).at(-1)?.id;
  const runAndClose = (action: () => void) => {
    action();
    closeContext();
  };
  const freezeThroughContextColumn = () => {
    if (!context) return;
    const index = report.columns.findIndex((column) => column.id === context.column.id);
    updateFrozenColumns(report.columns.slice(0, index + 1).map((column) => column.id));
  };
  const copyVisibleColumn = () => {
    if (!context) return;
    void copyText([
      context.column.label,
      ...report.rows.map((row) => rawValue(row.values[context.column.id])),
    ].join("\n"), "Visible column copied");
  };

  return <>
    <div ref={tableContainerRef} className="max-h-[650px] overflow-auto">
      <table ref={tableRef} onContextMenuCapture={handleTableContextMenu} className="report-studio-table min-w-full text-xs">
        <thead><tr>{displayedColumns.map((column) => {
          const sortIndex = report.config.sort.findIndex((sort) => sort.field === column.id);
          const frozen = frozenSet.has(column.id);
          return <th
            key={column.id}
            data-column-id={column.id}
            draggable={!grouped}
            style={frozen ? { left: frozenOffsets[column.id] || 0 } : undefined}
            className={`${column.id === "client.companyName" ? "min-w-60" : "min-w-36"} whitespace-nowrap px-3 py-3 text-left ${!grouped ? "cursor-grab active:cursor-grabbing" : ""} ${frozen ? "report-studio-frozen-column" : ""} ${lastFrozenId === column.id ? "report-studio-last-frozen" : ""}`}
            title={!grouped ? "Drag to reorder within this column area · right-click for options" : "Right-click for column options"}
          >
            <span className="block text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">{column.group}</span>
            <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-default">{column.shortLabel}{sortIndex >= 0 && <span className="text-[9px] text-brand-600">{report.config.sort[sortIndex].direction === "asc" ? "▲" : "▼"}{report.config.sort.length > 1 ? sortIndex + 1 : ""}</span>}</span>
          </th>;
        })}</tr></thead>
        <tbody className="divide-y divide-base">{report.rows.map((row) => <tr key={row.id} onClick={() => onRowClick(row)} className="cursor-pointer hover:bg-surface/70" title={grouped ? "Open underlying clients" : "Explore client relationships"}>{displayedColumns.map((column) => {
          const value = row.values[column.id] ?? null;
          const numeric = typeof value === "number";
          const frozen = frozenSet.has(column.id);
          return <td key={column.id} style={frozen ? { left: frozenOffsets[column.id] || 0 } : undefined} className={`px-3 py-3 ${numeric ? "text-right font-medium tabular-nums text-default" : "text-muted"} ${frozen ? "report-studio-frozen-column" : ""} ${lastFrozenId === column.id ? "report-studio-last-frozen" : ""}`}>{formatCell(value, column)}</td>;
        })}</tr>)}</tbody>
        <tfoot className="sticky bottom-0 z-20 bg-[#245b88] text-white shadow-[0_-1px_0_rgba(255,255,255,0.18)]"><tr>{displayedColumns.map((column, index) => {
          const result = totalBarResult(column);
          const frozen = frozenSet.has(column.id);
          return <td key={column.id} title={result?.description || (index === 0 ? "Totals are calculated from all matching records, not only the current page" : undefined)} style={frozen ? { left: frozenOffsets[column.id] || 0 } : undefined} className={`whitespace-nowrap px-3 py-2.5 font-semibold ${index === 0 ? "text-left" : "text-right tabular-nums"} ${frozen ? "report-studio-frozen-column" : ""} ${lastFrozenId === column.id ? "report-studio-last-frozen" : ""}`}>{index === 0 ? <span className="flex items-center justify-between gap-3"><span className="uppercase tracking-[0.08em]">Total</span>{result && <span>{column.type === "percentage" ? "Avg " : ""}{formatResultValue(result)}</span>}</span> : result ? <span>{column.type === "percentage" ? "Avg " : ""}{formatResultValue(result)}</span> : null}</td>;
        })}</tr></tfoot>
      </table>
    </div>
    {context && <div role="menu" data-report-column-menu="true" onClick={(event) => event.stopPropagation()} className="fixed z-[70] max-h-[calc(100vh-16px)] w-[310px] overflow-y-auto rounded-xl border border-base bg-card py-1 text-xs shadow-2xl" style={{ left: Math.max(8, context.x), top: Math.max(8, context.y) }}>
      <div className="flex items-start gap-2 border-b border-base px-3 py-2">
        {contextView !== "root" && <button type="button" onClick={() => showContextView("root")} aria-label="Back to column options" className="mt-0.5 rounded-md p-1 text-muted hover:bg-surface hover:text-default"><ChevronLeft className="h-3.5 w-3.5" /></button>}
        <div className="min-w-0"><p className="truncate font-semibold text-default">{contextView === "root" ? context.column.label : contextView === "add-left" ? "Add column to left" : contextView === "add-right" ? "Add column to right" : contextView === "sort-add" ? "Add to sorting" : contextView === "move" ? "Move column" : contextView === "hidden" ? "Show hidden columns" : "Column summary"}</p><p className="mt-0.5 text-[9px] text-faint">{contextView === "root" ? "Column options" : context.column.shortLabel}</p></div>
      </div>

      {(contextView === "add-left" || contextView === "add-right" || contextView === "hidden") && <ContextFieldPicker fields={filteredHiddenFields} search={contextSearch} onSearch={setContextSearch} emptyLabel="No hidden columns match" onSelect={(fieldId) => runAndClose(() => contextView === "hidden" ? onShowColumn(fieldId) : onInsertColumn(context.column.id, fieldId, contextView === "add-left" ? "left" : "right"))} />}

      {contextView === "sort-add" && <><ContextButton label="Add ascending" onClick={() => runAndClose(() => onAddSort(context.column.id, "asc"))} /><ContextButton label="Add descending" onClick={() => runAndClose(() => onAddSort(context.column.id, "desc"))} /><p className="border-t border-base px-3 py-2 text-[9px] leading-4 text-faint">Up to three sort fields are applied in the numbered order shown in the headers.</p></>}

      {contextView === "move" && <><ContextButton label="Move to beginning" onClick={() => runAndClose(() => onMoveColumn(context.column.id, "first"))} /><ContextButton label="Move left" onClick={() => runAndClose(() => onMoveColumn(context.column.id, "left"))} /><ContextButton label="Move right" onClick={() => runAndClose(() => onMoveColumn(context.column.id, "right"))} /><ContextButton label="Move to end" onClick={() => runAndClose(() => onMoveColumn(context.column.id, "last"))} /></>}

      {contextView === "hidden" && hiddenFields.length > 0 && <div className="border-t border-base pt-1"><ContextButton label="Show all hidden columns" onClick={() => runAndClose(onShowAllColumns)} /></div>}

      {contextView === "summary" && <>{columnResults.length > 0 ? columnResults.map((result) => <div key={result.id} title={result.description} className="flex items-center justify-between gap-3 px-3 py-2"><span className="text-muted">{result.label}</span><strong className="tabular-nums text-default">{formatResultValue(result)}</strong></div>) : <p className="px-3 py-4 text-center text-muted">No summary is available for this column.</p>}<p className="border-t border-base px-3 py-2 text-[9px] text-faint">Calculated from all matching records, not only this page.</p></>}

      {contextView === "root" && <>
        {context.row && <><div className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">Cell and row</div><ContextButton label="Copy cell value" onClick={() => runAndClose(() => { void copyText(rawValue(context.value), "Cell copied"); })} /><ContextButton label="Copy complete row" onClick={() => runAndClose(() => { void copyText(displayedColumns.map((column) => rawValue(context.row?.values[column.id])).join("\t"), "Row copied"); })} /><ContextButton label="Filter to this value" onClick={() => runAndClose(() => onFilterCell(context.column.id, context.value ?? null, false))} /><ContextButton label="Exclude this value" onClick={() => runAndClose(() => onFilterCell(context.column.id, context.value ?? null, true))} /><ContextButton label={grouped ? "Open underlying clients" : "Open relationship explorer"} onClick={() => runAndClose(() => onRowClick(context.row!))} /><div className="my-1 border-t border-base" /></>}

        {!grouped && <><div className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">Add</div><ContextButton label="Add column to left" hint="›" disabled={hiddenFields.length === 0} disabledReason="All available fields are already displayed" onClick={() => showContextView("add-left")} /><ContextButton label="Add column to right" hint="›" disabled={hiddenFields.length === 0} disabledReason="All available fields are already displayed" onClick={() => showContextView("add-right")} /><div className="my-1 border-t border-base" /></>}

        <div className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">Sort and filter</div>
        <ContextButton label="Sort ascending" active={currentSort?.direction === "asc" && report.config.sort.length === 1} onClick={() => runAndClose(() => onSortColumn(context.column.id, "asc"))} />
        <ContextButton label="Sort descending" active={currentSort?.direction === "desc" && report.config.sort.length === 1} onClick={() => runAndClose(() => onSortColumn(context.column.id, "desc"))} />
        <ContextButton label="Add to sorting" hint="›" disabled={report.config.sort.length >= 3 && !currentSort} disabledReason="A report can use up to three sort fields" onClick={() => showContextView("sort-add")} />
        {currentSort && <ContextButton label="Clear this column’s sorting" onClick={() => runAndClose(() => onClearColumnSort(context.column.id))} />}
        {report.config.sort.length > 0 && <ContextButton label="Clear all sorting" onClick={() => runAndClose(onClearAllSort)} />}
        <ContextButton label="Filter this column…" onClick={() => runAndClose(() => onOpenColumnFilter(context.column.id))} />
        {filteredFieldIds.has(context.column.id) && <ContextButton label="Clear filter from this column" onClick={() => runAndClose(() => onClearColumnFilter(context.column.id))} />}

        {!grouped && <><div className="my-1 border-t border-base" /><div className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">Freeze and arrange</div>{activeColumnFrozen ? <ContextButton label="Unfreeze this column" onClick={() => runAndClose(() => updateFrozenColumns(frozenColumnIds.filter((fieldId) => fieldId !== context.column.id)))} /> : <ContextButton label="Freeze this column" onClick={() => runAndClose(() => updateFrozenColumns([...frozenColumnIds, context.column.id]))} />}<ContextButton label="Freeze up to this column" onClick={() => runAndClose(freezeThroughContextColumn)} />{frozenColumnIds.length > 0 && <ContextButton label="Unfreeze all columns" onClick={() => runAndClose(() => updateFrozenColumns([]))} />}<ContextButton label="Move" hint="›" onClick={() => showContextView("move")} /><ContextButton label="Hide column" disabled={report.columns.length <= 1} disabledReason="A report must keep at least one column" onClick={() => runAndClose(() => onHideColumn(context.column.id))} /><ContextButton label="Show hidden columns" hint="›" disabled={hiddenFields.length === 0} disabledReason="There are no hidden columns" onClick={() => showContextView("hidden")} /></>}

        <div className="my-1 border-t border-base" /><div className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">Copy and inspect</div><ContextButton label="Copy column name" onClick={() => runAndClose(() => { void copyText(context.column.label, "Column name copied"); })} /><ContextButton label="Copy visible column" onClick={() => runAndClose(copyVisibleColumn)} /><ContextButton label="Column summary" hint="›" disabled={columnResults.length === 0} disabledReason="No summary is available for this field" onClick={() => showContextView("summary")} />
      </>}
    </div>}
  </>;
}

function ContextFieldPicker({ fields, search, onSearch, emptyLabel, onSelect }: { fields: ReportStudioFieldDefinition[]; search: string; onSearch: (value: string) => void; emptyLabel: string; onSelect: (fieldId: string) => void }) {
  return <div><div className="sticky top-0 z-10 border-b border-base bg-card p-2"><label className="flex items-center gap-2 rounded-lg border border-base bg-surface px-2"><Search className="h-3.5 w-3.5 text-faint" /><input autoFocus value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search fields" className="h-8 min-w-0 flex-1 bg-transparent text-xs text-default outline-none" /></label></div><div className="max-h-72 overflow-y-auto py-1">{fields.length > 0 ? fields.map((field) => <button key={field.id} type="button" role="menuitem" onClick={() => onSelect(field.id)} title={field.description} className="block w-full px-3 py-2 text-left hover:bg-surface"><span className="block text-[9px] font-semibold uppercase tracking-[0.06em] text-faint">{field.group}</span><span className="mt-0.5 block text-xs font-medium text-default">{field.label}</span></button>) : <p className="px-3 py-5 text-center text-xs text-muted">{emptyLabel}</p>}</div></div>;
}

function ContextButton({ label, active, disabled, disabledReason, hint, onClick }: { label: string; active?: boolean; disabled?: boolean; disabledReason?: string; hint?: string; onClick: () => void }) {
  return <button type="button" role="menuitem" disabled={disabled} title={disabled ? disabledReason : undefined} onClick={onClick} className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40 ${active ? "font-semibold text-brand-600" : "text-default"}`}><span>{label}</span>{active ? <Check className="h-3.5 w-3.5" /> : hint ? <span className="text-base leading-none text-faint">{hint}</span> : null}</button>;
}

function PivotView({ report, onRowClick }: { report: ReportStudioResponse; onRowClick: (row: ReportStudioResponse["rows"][number]) => void }) {
  const [rowField, columnField] = report.config.groupBy;
  const metricField = report.config.metrics[0];
  if (!rowField || !columnField || !metricField) return <ViewGuidance title="Pivot needs two groupings" detail="Choose two dimensions in Group By and at least one Summary Metric, then run the report." />;
  const rowDefinition = REPORT_STUDIO_FIELD_MAP.get(rowField);
  const columnDefinition = REPORT_STUDIO_FIELD_MAP.get(columnField);
  const metricDefinition = REPORT_STUDIO_FIELD_MAP.get(metricField);
  if (!rowDefinition || !columnDefinition || !metricDefinition) return null;
  const rowKeys = Array.from(new Set(report.rows.map((row) => String(row.values[rowField] ?? "No value"))));
  const columnKeys = Array.from(new Set(report.rows.map((row) => String(row.values[columnField] ?? "No value"))));
  const findRow = (rowKey: string, columnKey: string) => report.rows.find((row) => String(row.values[rowField] ?? "No value") === rowKey && String(row.values[columnField] ?? "No value") === columnKey);
  return <div className="overflow-auto p-4"><div className="mb-3 text-xs text-muted"><strong className="text-default">{rowDefinition.label}</strong> × <strong className="text-default">{columnDefinition.label}</strong> · {metricDefinition.label}</div><div className="reports-pivot-shell overflow-hidden rounded-2xl"><table className="reports-pivot-table min-w-full text-xs"><thead><tr><th className="px-3 py-2.5 text-left text-default">{rowDefinition.shortLabel}</th>{columnKeys.map((key) => <th key={key} className="px-3 py-2.5 text-right text-default">{key}</th>)}</tr></thead><tbody>{rowKeys.map((rowKey) => <tr key={rowKey}><td className="px-3 py-2.5 font-semibold text-default">{rowKey}</td>{columnKeys.map((columnKey) => { const row = findRow(rowKey, columnKey); return <td key={columnKey} onClick={() => row && onRowClick(row)} className="cursor-pointer px-3 py-2.5 text-right font-medium text-brand-600 transition-colors hover:bg-brand-50/70 dark:text-[#4aa8ff] dark:hover:bg-brand-950/20">{row ? formatCell(row.values[metricField] ?? null, metricDefinition) : "–"}</td>; })}</tr>)}</tbody></table></div></div>;
}

function RelationshipCards({ report, onRowClick }: { report: ReportStudioResponse; onRowClick: (row: ReportStudioResponse["rows"][number]) => void }) {
  if (report.config.groupBy.length > 0) return <ViewGuidance title="Open a group first" detail="Click a grouped row in Table or Pivot view to drill into its clients, then use Relationships." />;
  return <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">{report.rows.map((row) => <button key={row.id} type="button" onClick={() => onRowClick(row)} className="rounded-2xl border border-base bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm"><div className="flex items-start justify-between gap-3"><div><strong className="block text-sm text-default">{String(row.values["client.companyName"] || row.clientIds[0])}</strong><span className="mt-1 block text-xs text-muted">{String(row.values["client.category"] || "Client")} · {row.clientIds[0]}</span></div><Network className="h-4 w-4 text-brand-600" /></div><p className="mt-3 text-[11px] text-faint">Explore people, financial years, targets, quotations, billing, payments, compliance, documents, tasks, and activity.</p></button>)}</div>;
}

function ViewGuidance({ title, detail }: { title: string; detail: string }) {
  return <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><SlidersHorizontal className="mb-3 h-7 w-7 text-faint" /><h3 className="font-semibold text-default">{title}</h3><p className="mt-1 max-w-md text-sm text-muted">{detail}</p></div>;
}

type RelationshipData = {
  client: Record<string, unknown>;
  financialYear: string;
  financialYearRecord: Record<string, unknown> | null;
  quotations: Array<Record<string, unknown>>;
  billing: Record<string, unknown> | null;
  payments: Array<Record<string, unknown>>;
  annualReturn: Record<string, unknown> | null;
  invoiceCoverage: { sale: { doneCount: number }; purchase: { doneCount: number } };
  invoiceCount: number;
  uploads: { count: number; quantity: number };
  transactions: { inboundCount: number; outboundCount: number };
  documents: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  activities: Array<Record<string, unknown>>;
  contacts: Array<Record<string, unknown>>;
};

function RelationshipDrawer({ clientId, financialYear, onClose }: { clientId: string; financialYear: string; onClose: () => void }) {
  const [data, setData] = useState<RelationshipData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reports/studio/relationships/${encodeURIComponent(clientId)}?fy=${encodeURIComponent(financialYear)}`, { cache: "no-store" })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body?.error || "Unable to load relationships"); return body; })
      .then((body) => { if (!cancelled) setData(body); })
      .catch((requestError) => { if (!cancelled) setError(requestError instanceof Error ? requestError.message : "Unable to load relationships"); });
    return () => { cancelled = true; };
  }, [clientId, financialYear]);
  const clientName = String(data?.client?.companyName || clientId);
  const billingTotal = Number(data?.billing?.totalAmount) || 0;
  const paid = data?.payments.reduce((sum, payment) => sum + (Number(payment.amountPaid) || 0), 0) || 0;
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/25 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-base bg-card shadow-2xl"><div className="sticky top-0 z-10 flex items-start justify-between border-b border-base bg-card/95 p-5 backdrop-blur-xl"><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-600">Relationship Explorer · {financialYear}</p><h2 className="mt-1 text-xl font-semibold text-default">{clientName}</h2><a href={`/dashboard/clients/${encodeURIComponent(clientId)}`} className="mt-1 inline-block text-xs font-semibold text-brand-600 hover:underline">Open client profile</a></div><button type="button" onClick={onClose} className="rounded-xl p-2 text-muted hover:bg-surface"><X className="h-5 w-5" /></button></div>{error ? <div className="m-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : !data ? <div className="flex min-h-80 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-brand-600" /></div> : <div className="space-y-4 p-5"><RelationshipNode title="People" detail={`${data.contacts.length} related contact${data.contacts.length === 1 ? "" : "s"}`} tone="violet" /><RelationshipNode title={`Financial Year ${financialYear}`} detail={data.financialYearRecord ? "Financial Year record available" : "No Financial Year record"} tone="blue" /><div className="ml-5 grid gap-3 border-l border-base pl-4 sm:grid-cols-2"><RelationshipNode title="Targets / Credits" detail={data.financialYearRecord ? "Open the target columns in this report for CAT/type values" : "No target or generated-credit record"} tone="blue" /><RelationshipNode title="Annual Return" detail={String(data.annualReturn?.status || "Not recorded")} tone="indigo" /><RelationshipNode title="Invoice Tracking" detail={`${data.invoiceCoverage.sale.doneCount}/12 sale · ${data.invoiceCoverage.purchase.doneCount}/12 purchase months`} tone="teal" /><RelationshipNode title="CPCB Upload" detail={`${data.uploads.count} records · ${quantity(data.uploads.quantity)} quantity`} tone="teal" /></div><RelationshipNode title="Linked Quotations" detail={`${data.quotations.length} linked · ${data.quotations.filter((quotation) => quotation.status === "Accepted").length} accepted`} tone="emerald" /><div className="ml-5 grid gap-3 border-l border-base pl-4 sm:grid-cols-2"><RelationshipNode title="Billing" detail={data.billing ? `${formatCurrency(billingTotal)} billed` : "No billing record"} tone="amber" /><RelationshipNode title="Payments" detail={`${data.payments.length} records · ${formatCurrency(paid)} received · ${formatCurrency(billingTotal - paid)} outstanding`} tone="amber" /></div><div className="grid gap-3 sm:grid-cols-3"><RelationshipNode title="Documents" detail={`${data.documents.length} recent records`} tone="slate" /><RelationshipNode title="Tasks" detail={`${data.tasks.filter((task) => task.status === "open").length} open · ${data.tasks.length} recent`} tone="slate" /><RelationshipNode title="Activity" detail={`${data.activities.length} recent events`} tone="slate" /></div><RelationshipNode title="Credit Transactions" detail={`${data.transactions.inboundCount} inbound · ${data.transactions.outboundCount} outbound`} tone="violet" /></div>}</aside></div>;
}

function RelationshipNode({ title, detail, tone }: { title: string; detail: string; tone: string }) {
  const tones: Record<string, string> = { blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-200", violet: "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-200", indigo: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-200", teal: "bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-200", emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200", amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200", slate: "bg-surface text-muted" };
  return <div className={`rounded-2xl p-4 ${tones[tone] || tones.slate}`}><strong className="block text-xs">{title}</strong><span className="mt-1 block text-[11px] leading-4 opacity-80">{detail}</span></div>;
}

function TargetOutcomeSummary({ report }: { report: ReportStudioResponse }) {
  const metricValue = (field: string) => report.summary.metrics.find((metric) => metric.field === field)?.value || 0;
  const target = metricValue("target.overall.target");
  const achieved = metricValue("target.overall.achieved");
  const remaining = metricValue("target.overall.remaining");
  const clients = metricValue("client.count") || report.summary.matchedClients;
  const progress = target > 0 ? Math.min(100, Math.max(0, (achieved / target) * 100)) : 0;

  return <section className="reports-outcome-card overflow-hidden rounded-[26px]">
    <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.5fr)] xl:items-center">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-600">Overall progress</p>
        <div className="mt-1 flex items-end gap-2"><strong className="text-[42px] font-semibold leading-none tracking-[-0.05em] text-default sm:text-[48px]">{percentage(progress)}</strong><span className="pb-1 text-xs font-medium text-muted">achieved</span></div>
        <p className="mt-2 text-xs leading-5 text-muted">{quantity(remaining)} remains across {quantity(clients)} clients.</p>
      </div>
      <div>
        <div className="reports-progress-track"><span style={{ width: `${progress}%` }} /></div>
        <div className="mt-4 grid grid-cols-3 divide-x divide-base">
          <div className="pr-3"><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">Target</p><strong className="mt-1 block text-sm text-default sm:text-base">{quantity(target)}</strong></div>
          <div className="px-3"><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">Achieved</p><strong className="mt-1 block text-sm text-emerald-600 sm:text-base">{quantity(achieved)}</strong></div>
          <div className="pl-3"><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">Remaining</p><strong className="mt-1 block text-sm text-amber-600 sm:text-base">{quantity(remaining)}</strong></div>
        </div>
      </div>
    </div>
  </section>;
}

function TargetCategorySummaries({ report }: { report: ReportStudioResponse }) {
  const romans = ["I", "II", "III", "IV"];
  const metricValue = (field: string) => report.summary.metrics.find((metric) => metric.field === field)?.value || 0;
  return <section aria-labelledby="category-progress-title"><div className="mb-2 flex items-center justify-between px-1"><h2 id="category-progress-title" className="text-xs font-semibold text-default">Progress by category</h2><span className="text-[10px] text-faint">Swipe to compare</span></div><div className="reports-category-grid">{["1", "2", "3", "4"].map((categoryId, index) => {
    const target = metricValue(`target.cat${categoryId}.total.target`);
    const achieved = metricValue(`target.cat${categoryId}.total.achieved`);
    const remaining = metricValue(`target.cat${categoryId}.total.remaining`);
    const progress = target > 0 ? Math.min(100, Math.max(0, achieved / target * 100)) : 0;
    return <div key={categoryId} className="reports-secondary-card rounded-[20px] p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-semibold text-default">CAT {romans[index]}</h3><span className="text-[10px] font-semibold text-brand-600">{percentage(progress)}</span></div><div className="reports-category-progress"><span style={{ width: `${progress}%` }} /></div><div className="mt-3 grid grid-cols-3 gap-2"><div><p className="text-[8px] uppercase tracking-wide text-faint">Target</p><strong className="mt-1 block text-xs text-default">{quantity(target)}</strong></div><div><p className="text-[8px] uppercase tracking-wide text-faint">Achieved</p><strong className="mt-1 block text-xs text-emerald-600">{quantity(achieved)}</strong></div><div><p className="text-[8px] uppercase tracking-wide text-faint">Remaining</p><strong className="mt-1 block text-xs text-amber-600">{quantity(remaining)}</strong></div></div></div>;
  })}</div></section>;
}

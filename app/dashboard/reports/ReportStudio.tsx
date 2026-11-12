"use client";

import { readJsonResponse } from "@/lib/http-response";
import Modal from "@/components/ui/Modal";

import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  Ellipsis,
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
  PieChart,
  ShieldCheck,
  Target,
  Trash2,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  AnimatePresence,
  animate as animateMotion,
  motion,
  type PanInfo,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import { FINANCIAL_YEARS, formatCurrency } from "@/lib/utils";
import type { ReportType } from "@/lib/reports";
import { fetchReportStudio, getCachedReportStudio } from "@/lib/reportStudioClientCache";
import { useSession } from "next-auth/react";
import { REPORT_BUILDER_CATEGORIES, REPORT_DETAIL_DATASETS, isBillingAnalysisSource, isReportDetailSource, isRestrictedReportSource } from "@/lib/report-datasets";
import { DETAIL_MONTHS, reportDatasetRoot, reportLayouts, REPORT_COMPARISON_SOURCES, REPORT_DATASET_CARD_COPY, type ReportLayout } from "@/lib/report-layouts";
import { billingReportDrilldown } from "@/lib/report-billing-view";
import { type ReportManualField, hasManualReportFields } from "@/lib/report-manual";
import { WorkflowStepNavigationDock, useWorkflowStepNavigation } from "@/components/client-trackers/WorkflowStepNavigation";
import ReportBuilderStepper, { REPORT_STEPS, ReportStepDescription } from "./ReportBuilderStepper";
import ReportManualEditor from "./ReportManualEditor";
import { REPORT_TYPES } from "./ReportsSupport";
import ReportSelect from "./ReportSelect";
const BillingReport = dynamic(() => import("./BillingReport"), { ssr: false });
import ReportOverview, { type ReportFocus } from "./ReportOverview";
import { reportConfigKey, withoutFilter } from "@/lib/report-studio-view";
import ReportQualityPanel from "./ReportQualityPanel";
import { reportControlSpring, reportFadeTransition, reportPanelExitTransition, reportPanelSpring, reportSoftSpring } from "./report-motion";
import "./reports-workspace.css";
import {
  ACCEPTED_TARGET_COMPACT_COLUMNS,
  ACCEPTED_TARGET_DETAIL_COLUMNS,
  REPORT_STUDIO_OPERATOR_LABELS,
  REPORT_STUDIO_SOURCES,
  REPORT_GROUP_LIMIT,
  createAcceptedTargetStudioConfig,
  billingScopeFields,
  fieldsForSource,
  reportManualDefinition,
  reportCalculatedDefinitions,
  validateReportStudioConfig,
  reportStudioExcelColor,
  type ReportStudioCellValue,
  type ReportStudioAnalysisBucket,
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
  customFields: ReportStudioFieldDefinition[];
  onFyChange: (financialYear: string) => void;
  onOpenCustomExport: () => void;
  onDownloadQuickReport: (type: ReportType) => void;
  quickDownloading: ReportType[];
};

const SAVED_REPORTS_KEY = "reports.studio.saved.v1";
const REPORT_STAGE_HEADINGS = ["Choose your data", "Organize your report", "Choose fields and filters", "Review your report", "Save or download"];

const ReportStudioChart = dynamic(() => import("./ReportStudioChart"), {
  ssr: false,
  loading: () => <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>,
});

const ReportStudioAnalysis = dynamic(() => import("./ReportStudioAnalysis"), {
  ssr: false,
  loading: () => <div className="flex min-h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>,
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
  if (definition.type === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-IN", { timeZone: "UTC" });
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
    return Number.isNaN(date.getTime()) ? String(result.value) : date.toLocaleDateString("en-IN", { timeZone: "UTC" });
  }
  return String(result.value);
}

function defaultConfigForSource(source: ReportStudioSource, financialYear: string): ReportStudioConfig {
  const base = {
    ...createAcceptedTargetStudioConfig(financialYear, false),
    source,
    filters: { id: "root", kind: "group", logic: "and", children: [] } as ReportStudioConfig["filters"],
    groupBy: [],
    view: "table" as const,
  };
  if (isReportDetailSource(source)) {
    const dataset = REPORT_DETAIL_DATASETS[source];
    if (isBillingAnalysisSource(source)) {
      return { ...base, version: 2, name: dataset.label, columns: dataset.columns,
        metrics: source === "billing-charges" ? ["charge.gross"] : ["charge.selectedGross", "bill.gross", "bill.paid", "bill.outstanding"],
        analysis: { ...base.analysis, field: dataset.columns[0], transform: "presence" },
        sort: [{ field: source === "billing-companies" ? "client.companyName" : "bill.date", direction: source === "billing-companies" ? "asc" : "desc" }] };
    }
    return { ...base, version: 2, name: dataset.label, columns: dataset.columns, metrics: [],
      ...(source === "payment-register" ? { paymentPeriod: "receipt" as const } : {}),
      analysis: { ...base.analysis, field: dataset.columns[0], transform: "presence" },
      sort: [{ field: dataset.columns.includes("record.date") ? "record.date" : "client.companyName", direction: dataset.columns.includes("record.date") ? "desc" : "asc" }] };
  }
  const definitions: Partial<Record<ReportStudioSource, Pick<ReportStudioConfig, "name" | "columns" | "metrics">>> = {
    "client-directory": { name: "Client Directory", columns: ["client.companyName", "client.clientId", "client.category", "client.state", "client.registrationNumber"], metrics: ["client.count"] },
    clients: { name: "Client and FY Overview", columns: ["client.companyName", "client.category", "financialYear.year", "annualReturn.status"], metrics: ["client.count"] },
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
  return { ...base, ...(definitions[source] || definitions["financial-years"]), sort: [{ field: "client.companyName", direction: "asc" }] };
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

function transformFilterGroup(group: ReportStudioFilterGroup, groupId: string, transform: (entry: ReportStudioFilterGroup) => ReportStudioFilterGroup): ReportStudioFilterGroup {
  if (group.id === groupId) return transform(group);
  return { ...group, children: group.children.map((child) => child.kind === "group" ? transformFilterGroup(child, groupId, transform) : child) };
}

function keepAvailableFilters(group: ReportStudioFilterGroup, availableFieldIds: ReadonlySet<string>): ReportStudioFilterGroup {
  return {
    ...group,
    children: group.children.reduce<Array<ReportStudioFilterClause | ReportStudioFilterGroup>>((children, child) => {
      if (child.kind !== "group") return availableFieldIds.has(child.field) ? [...children, child] : children;
      const nested = keepAvailableFilters(child, availableFieldIds);
      return nested.children.length > 0 ? [...children, nested] : children;
    }, []),
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
  customFields,
  onFyChange,
  onOpenCustomExport,
  onDownloadQuickReport,
  quickDownloading,
}: ReportStudioProps) {
  const initialConfigRef = useRef<ReportStudioConfig | null>(null);
  if (!initialConfigRef.current) initialConfigRef.current = { ...defaultConfigForSource("client-directory", fy), version: 2 };
  const [draft, setDraft] = useState<ReportStudioConfig>(initialConfigRef.current);
  const [applied, setApplied] = useState<ReportStudioConfig>(initialConfigRef.current);
  const [reportData, setReport] = useState<ReportStudioResponse | null>(null);
  const [fetching, setLoading] = useState(true);
  const [error, setError] = useState("");
  const report = reportData && reportConfigKey(reportData.config) === reportConfigKey(applied) ? reportData : null;
  const loading = fetching || (!report && !error);
  const [clientQuery, setClientQuery] = useState("");
  const [qualityOpen, setQualityOpen] = useState(false);
  const [panel, setPanel] = useState<StudioPanel>(null);
  const [fieldSearch, setFieldSearch] = useState("");
  const [savedReports, setSavedReports] = useState<SavedStudioReport[]>([]);
  const [saveName, setSaveName] = useState("");
  const [activeSavedReportId, setActiveSavedReportId] = useState<string | null>(null);
  const [billingDetails, setBillingDetails] = useState(true);
  const [savedReportsLoading, setSavedReportsLoading] = useState(false);
  const [savedReportsLoaded, setSavedReportsLoaded] = useState(false);
  const [savingSavedReport, setSavingSavedReport] = useState(false);
  const [deletingSavedReportId, setDeletingSavedReportId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [drilldownStack, setDrilldownStack] = useState<ReportStudioConfig[]>([]);
  const [relationshipClientId, setRelationshipClientId] = useState<string | null>(null);
  const [businessResultsOpen, setBusinessResultsOpen] = useState(false);
  const [setupExpanded, setSetupExpanded] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [frozenColumnIds, setFrozenColumnIds] = useState<string[]>(() => defaultFrozenColumns(initialConfigRef.current?.columns || []));
  const [refreshRequest, setRefreshRequest] = useState(0);
  const forceRefreshRef = useRef(false);
  const reportRequestRef = useRef(0);
  const savedReportsRequestRef = useRef(false);
  const reduceMotion = useReducedMotion();
  const reduced = Boolean(reduceMotion);
  const { setupPage: step, stepDirection, commit, navigateStep, navigateToStep } = useWorkflowStepNavigation("reports", 0, REPORT_STEPS, reduced);
  const [reached, setReached] = useState(0);
  const [categoryId, setCategoryId] = useState<string>("clients");
  const [library, setLibrary] = useState<"saved" | "templates" | null>(null);
  const [billingScopeOpen, setBillingScopeOpen] = useState(false);
  const [stepError, setStepError] = useState<{ step: number; draft: ReportStudioConfig; message: string } | null>(null);
  const [manualCatalog, setManualCatalog] = useState<{ fields: ReportManualField[]; canEdit: boolean } | null>(null);
  const [manualError, setManualError] = useState("");
  const [manualRevision, setManualRevision] = useState(0);
  const session = useSession().data;
  const cacheScope = session?.user?.email ? `${session.user.email}:${manualRevision}` : undefined;
  const showSaved = library === "saved";
  const loadManualCatalog = step >= 1 || showSaved || categoryId === "operations";
  const previewActive = step >= 3;
  const additionalFields = useMemo(() => [...customFields, ...(manualCatalog?.fields || []).map(reportManualDefinition)], [customFields, manualCatalog]);
  const availableFields = useMemo(() => fieldsForSource(draft.source, [...additionalFields, ...reportCalculatedDefinitions(draft.calculatedColumns)]), [additionalFields, draft.source, draft.calculatedColumns]);
  const appliedFields = useMemo(() => fieldsForSource(applied.source, [...additionalFields, ...reportCalculatedDefinitions(applied.calculatedColumns)]), [additionalFields, applied.source, applied.calculatedColumns]);
  const fieldMap = useMemo(() => new Map([...appliedFields, ...availableFields].map((field) => [field.id, field])), [appliedFields, availableFields]);

  useEffect(() => {
    if (!ready || !loadManualCatalog) return;
    let cancelled = false;
    fetch("/api/reports/studio/manual", { cache: "no-store" })
      .then(async (response) => {
        const body = await readJsonResponse(response);
        if (!response.ok) throw new Error(body.error || "Unable to load manual fields.");
        if (!cancelled) setManualCatalog(body);
      })
      .catch((problem) => { if (!cancelled) setManualError(problem.message); });
    return () => { cancelled = true; };
  }, [ready, loadManualCatalog]);

  const fetchReport = useCallback(async (config: ReportStudioConfig, refresh = false) => {
    const requestId = reportRequestRef.current + 1;
    reportRequestRef.current = requestId;
    setLoading(true);
    setError("");

    if (!refresh) {
      const cached = cacheScope ? getCachedReportStudio(config, cacheScope) : null;
      if (cached) {
        setReport(cached);
        setLastUpdatedAt(cached.generatedAt ? new Date(cached.generatedAt) : null);
        setLoading(false);
        return;
      }
    }

    try {
      const body = await fetchReportStudio(config, { refresh, scope: cacheScope });
      if (reportRequestRef.current === requestId) {
        setReport(body);
        setLastUpdatedAt(new Date(body.generatedAt || Date.now()));
      }
    } catch (requestError) {
      if (reportRequestRef.current === requestId) {
        setError(requestError instanceof Error ? requestError.message : "Unable to run report");
      }
    } finally {
      if (reportRequestRef.current === requestId) setLoading(false);
    }
  }, [cacheScope]);

  useEffect(() => {
    if (!ready || !previewActive || applied.financialYear !== fy) return;
    if (applied.source === "billing" && billingDetails) { reportRequestRef.current++; setLoading(false); return; }
    const refresh = forceRefreshRef.current;
    forceRefreshRef.current = false;
    void fetchReport(applied, refresh);
  }, [applied, billingDetails, fetchReport, fy, ready, refreshRequest, previewActive]);
  useEffect(() => {
    setDraft((current) => current.financialYear === fy ? current : { ...current, financialYear: fy, page: 1 });
    setApplied((current) => current.financialYear === fy ? current : { ...current, financialYear: fy, page: 1 });
  }, [fy]);
  useEffect(() => {
    setFrozenColumnIds((current) => current.filter((fieldId) => applied.columns.includes(fieldId)));
  }, [applied.columns, applied.source]);
  useEffect(() => {
    if (panel !== "saved" && !showSaved && step !== 4 || savedReportsLoaded || savedReportsRequestRef.current) return;
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
        const body = await readJsonResponse(response).catch(() => null);
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
  }, [panel, savedReportsLoaded, showSaved, step]);

  useEffect(() => { setClientQuery(applied.search || ""); }, [applied.search]);
  useEffect(() => {
    if (clientQuery.trim() === (applied.search || "")) return;
    const timer = window.setTimeout(() => {
      const search = clientQuery.trim();
      setApplied((current) => ({ ...current, search, page: 1 }));
      setDraft((current) => ({ ...current, search, page: 1 }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [clientQuery, applied.search]);

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
  const appliedConditions = applied.filters.children;
  const filterLabel = (node: ReportStudioFilterGroup | ReportStudioFilterClause): string => node.kind === "group"
    ? "(" + node.children.map(filterLabel).join(node.logic === "or" ? " or " : " and ") + ")"
    : (fieldMap.get(node.field)?.shortLabel || node.field) + " " + REPORT_STUDIO_OPERATOR_LABELS[node.operator] + " " + (Array.isArray(node.value) ? node.value.join(", ") : String(node.value ?? "")) + (node.operator === "between" ? " and " + (node.secondValue ?? "") : "");
  const removeAppliedFilter = (id: string) => {
    setApplied((current) => ({ ...current, filters: withoutFilter(current.filters, id), page: 1 }));
    setDraft((current) => ({ ...current, filters: withoutFilter(current.filters, id), page: 1 }));
  };
  const focusReport = ({ field, value = 0, operator = "gt", label }: ReportFocus) => {
    const focusRootId = "focus-root-" + Date.now();
    const update = (config: ReportStudioConfig): ReportStudioConfig => ({ ...config, page: 1, view: "table", groupBy: [],
      sort: [{ field, direction: "desc" }], filters: { id: focusRootId, kind: "group", logic: "and", children: [
        ...(config.filters.children.length ? [withoutFilter(config.filters, "overview-focus")] : []),
        { id: "overview-focus", kind: "condition", field, operator, value },
      ] } });
    setApplied(update); setDraft(update);
    window.requestAnimationFrame(() => document.getElementById("report-results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    toast.success("Showing " + label.toLowerCase());
  };
  const dirty = reportConfigKey(draft) !== reportConfigKey(applied);
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
    onFyChange(next.financialYear);
    setDraft((current) => ({ ...current, page: 1 }));
    setPanel(null);
    setSetupExpanded(false);
  };

  const changeSource = (source: ReportStudioSource) => {
    billingLevelDrafts.current = {};
    setBillingScopeOpen(false);
    const next = { ...defaultConfigForSource(source, draft.financialYear), version: 2 as const };
    setBillingDetails(false);
    setActiveSavedReportId(null);
    setSaveName("");
    setDrilldownStack([]);
    setDraft(next);
    setSetupExpanded(true);
  };

  const billingLevelDrafts = useRef<Partial<Record<ReportStudioSource, ReportStudioConfig>>>({});
  const defaultGroupingMetrics = (config: ReportStudioConfig) => {
    const fields = fieldsForSource(config.source);
    const metrics = new Set(fields.filter(field => field.role === "metric").map(field => field.id));
    const selected = config.metrics.filter(id => metrics.has(id));
    if (selected.length) return selected;
    if (config.source === "invoice-months") return ["invoice.received", "invoice.covered", "invoice.missing", "invoice.partial", "invoice.nil", "invoice.unknown"];
    const visible = config.columns.filter(id => id !== "record.count" && metrics.has(id)).slice(0, 6);
    return visible.length ? visible : [...metrics].filter(id => id === "record.count" || id === "client.count").slice(0, 1);
  };
  const withGrouping = (config: ReportStudioConfig, groupBy: string[]): ReportStudioConfig => ({
    ...config, groupBy, page: 1, view: "table",
    metrics: groupBy.length ? defaultGroupingMetrics(config) : config.metrics,
    sort: groupBy.length ? groupBy.map(field => ({ field, direction: "asc" })) : config.sort,
  });
  const chooseLayout = (layout: ReportLayout) => {
    const source = layout.source;
    if (source !== draft.source) billingLevelDrafts.current[draft.source] = draft;
    const next = source === draft.source ? draft : billingLevelDrafts.current[source] ?? defaultConfigForSource(source, draft.financialYear);
    const compatible = new Set(fieldsForSource(source).map(field => field.id));
    const filters = source === draft.source || billingLevelDrafts.current[source] ? next.filters : keepAvailableFilters(draft.filters, compatible);
    const fromInvoiceGrid = source === "invoice-coverage" && DETAIL_MONTHS.every((_, index) => next.columns.includes(`invoice.month.${index + 1}`));
    const columns = layout.columns ?? (fromInvoiceGrid ? REPORT_DETAIL_DATASETS["invoice-coverage"].columns : next.columns);
    setDraft(withGrouping({
      ...next, name: activeSavedReportId ? draft.name : next.name, financialYear: draft.financialYear, filters, columns,
      billingScope: isBillingAnalysisSource(source) ? draft.billingScope : undefined,
      comparisonYears: REPORT_COMPARISON_SOURCES.has(source) ? draft.comparisonYears : undefined,
    }, layout.groupBy));
  };

  const applyTemplate = (template: ReportTemplate) => {
    setLibrary(null);
    setBillingDetails(false);
    const next = { ...(template.source === "clients" ? createAcceptedTargetStudioConfig(fy, false) : defaultConfigForSource(template.source, fy)), version: 2 as const };
    setCategoryId(template.source === "clients" ? "advanced" : REPORT_BUILDER_CATEGORIES.find((category) => category.sources.some((source) => source === template.source))?.id || "advanced");
    setFrozenColumnIds(defaultFrozenColumns(next.columns));
    setDraft(next);
    setApplied(next);
    setActiveSavedReportId(null);
    setSaveName("");
    setDrilldownStack([]);
    setBusinessResultsOpen(false);
    setPanel(null);
    setSetupExpanded(false);
    setReached((current) => Math.max(current, 1));
    navigateToStep(1);
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
      value: definition.options?.length ? parseFilterInput(definition.options[0], definition, definition.operators[0]) : "",
    };
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
    const definition = fieldMap.get(fieldId);
    if (!definition) return;
    updateFilter(condition.id, { field: fieldId, operator: definition.operators[0], value: definition.options?.length ? parseFilterInput(definition.options[0], definition, definition.operators[0]) : "", secondValue: undefined });
  };

  const removeFilter = (id: string) => setDraft((current) => ({ ...current, filters: removeFilterNode(current.filters, id), page: 1 }));
  const updateFilterLogic = (groupId: string, logic: "and" | "or") => setDraft((current) => ({ ...current, filters: transformFilterGroup(current.filters, groupId, (group) => ({ ...group, logic })), page: 1 }));

  const toggleMetric = (fieldId: string) => setDraft((current) => {
    const metrics = current.metrics.includes(fieldId)
      ? current.metrics.filter((entry) => entry !== fieldId)
      : [...current.metrics, fieldId];
    return { ...current, metrics: sortBySelectorOrder(metrics, metricFields), page: 1 };
  });

  const toggleGroup = (fieldId: string) => {
    const selected = draft.groupBy.includes(fieldId);
    if (!selected && draft.groupBy.length >= REPORT_GROUP_LIMIT) {
      toast.error("Remove a grouping level before adding another.");
      return;
    }
    setDraft((current) => {
      const currentlySelected = current.groupBy.includes(fieldId);
      if (!currentlySelected && current.groupBy.length >= REPORT_GROUP_LIMIT) return current;
      const groupBy = currentlySelected
        ? current.groupBy.filter((entry) => entry !== fieldId)
        : [...current.groupBy, fieldId];
      return withGrouping(current, groupBy);
    });
  };

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
      const body = await readJsonResponse(response).catch(() => null);
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
      const body = await readJsonResponse(response).catch(() => null);
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
    const savedReport = savedReports.find((entry) => entry.id === id);
    if (!savedReport || !window.confirm(`Delete “${savedReport.name}”? This saved configuration cannot be recovered.`)) return;
    setDeletingSavedReportId(id);
    try {
      const response = await fetch(`/api/reports/studio/saved/${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await readJsonResponse(response).catch(() => null);
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
    if (hasManualReportFields(saved.config) && !manualCatalog) {
      toast.error(manualError || "Manual fields are still loading. Try again shortly.");
      return;
    }
    setLibrary(null);
    setBillingDetails(false);
    billingLevelDrafts.current = {};
    const savedFields = fieldsForSource(saved.config.source, [...additionalFields, ...reportCalculatedDefinitions(saved.config.calculatedColumns)]);
    const savedFieldIds = new Set(savedFields.map((definition) => definition.id));
    const savedDimensionFields = savedFields.filter((definition) => definition.role === "dimension");
    const savedMetricFields = savedFields.filter((definition) => definition.role === "metric");
    const fallbackColumns = defaultConfigForSource(saved.config.source, saved.config.financialYear).columns;
    const availableColumns = saved.config.columns.filter((fieldId, index, columns) => (
      savedFieldIds.has(fieldId) && columns.indexOf(fieldId) === index
    ));
    const fallbackAnalysis = defaultConfigForSource(saved.config.source, saved.config.financialYear).analysis;
    const requestedAnalysis = saved.config.analysis && savedFieldIds.has(saved.config.analysis.field)
      ? saved.config.analysis
      : fallbackAnalysis;
    const requestedAnalysisField = savedFields.find((field) => field.id === requestedAnalysis.field);
    const analysisTransformIsValid = requestedAnalysisField && (
      requestedAnalysis.transform === "presence" ||
      requestedAnalysis.transform === "value" ||
      (requestedAnalysis.transform === "range" && ["number", "quantity", "currency", "percentage"].includes(requestedAnalysisField.type)) ||
      (requestedAnalysis.transform === "timePeriod" && requestedAnalysisField.type === "date")
    );
    const savedAnalysis = analysisTransformIsValid ? requestedAnalysis : { ...requestedAnalysis, transform: "presence" as const };
    const config = {
      ...saved.config,
      columns: availableColumns.length > 0 ? availableColumns : fallbackColumns,
      filters: keepAvailableFilters(saved.config.filters, savedFieldIds),
      groupBy: saved.config.groupBy.filter((fieldId, index, groupBy) => (
        savedDimensionFields.some((field) => field.id === fieldId) && groupBy.indexOf(fieldId) === index
      )).slice(0, REPORT_GROUP_LIMIT),
      metrics: sortBySelectorOrder(saved.config.metrics.filter((fieldId) => savedMetricFields.some((field) => field.id === fieldId)), savedMetricFields),
      sort: saved.config.sort.filter((entry) => savedFieldIds.has(entry.field)).slice(0, 3),
      analysis: savedAnalysis,
      businessResultIds: saved.config.businessResultIds ?? null,
      excelColumnColors: Object.fromEntries(Object.entries(saved.config.excelColumnColors || {}).filter(([fieldId]) => savedFieldIds.has(fieldId))),
    };
    setDraft(config);
    setApplied(config);
    setFrozenColumnIds(defaultFrozenColumns(config.columns));
    setActiveSavedReportId(saved.id);
    setSaveName(saved.name);
    onFyChange(saved.config.financialYear);
    setPanel(null);
    setSetupExpanded(false);
    setDrilldownStack([]);
    setCategoryId(REPORT_BUILDER_CATEGORIES.find((category) => category.sources.some((source) => source === saved.config.source))?.id || "advanced");
    setReached((current) => Math.max(current, 1));
    navigateToStep(1);
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
        const body = await readJsonResponse(response).catch(() => null);
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
    setApplied((current) => ({ ...current, page }));
    setDraft((current) => ({ ...current, page }));
  };

  const setPageSize = (pageSize: number) => {
    setApplied((current) => ({ ...current, pageSize, page: 1 }));
    setDraft((current) => ({ ...current, pageSize, page: 1 }));
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
    const sourceFields = fieldsForSource(applied.source, customFields).map((definition) => definition.id);
    updateTableConfig((config) => ({ ...config, columns: insertBySelectorOrder(config.columns, sourceFields, fieldsForSource(config.source, customFields)), page: 1 }));
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
    const definition = fieldMap.get(fieldId);
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
      const billingDetail = billingReportDrilldown(applied, row);
      if (billingDetail) {
        setDrilldownStack((current) => [...current, applied]);
        setFrozenColumnIds(defaultFrozenColumns(billingDetail.columns));
        setDraft(billingDetail);
        setApplied(billingDetail);
        return;
      }
      if (row.href?.startsWith("/dashboard/")) {
        window.open(row.href, "_blank", "noopener,noreferrer");
        return;
      }
      setRelationshipClientId(row.clientIds[0] || null);
      return;
    }
    const groupConditions = row.drilldownFilters ?? applied.groupBy.map((fieldId, index): ReportStudioFilterClause => ({
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
    setApplied((current) => ({ ...current, view }));
    setDraft((current) => ({ ...current, view }));
  };

  const updateAnalysis = (patch: Partial<ReportStudioConfig["analysis"]>) => {
    const update = (config: ReportStudioConfig): ReportStudioConfig => ({
      ...config,
      analysis: { ...config.analysis, ...patch },
      view: "analysis",
      page: 1,
    });
    setApplied(update);
    setDraft(update);
  };

  const drillIntoAnalysisBucket = (bucket: ReportStudioAnalysisBucket) => {
    if (bucket.filters.length === 0) return;
    const timestamp = Date.now();
    const conditions: ReportStudioFilterClause[] = bucket.filters.map((filter, index) => ({
      id: `analysis-${timestamp}-${index}`,
      kind: "condition",
      ...filter,
    }));
    const bucketGroup: ReportStudioFilterGroup = {
      id: `analysis-group-${timestamp}`,
      kind: "group",
      logic: "and",
      children: conditions,
    };
    const next: ReportStudioConfig = {
      ...applied,
      name: `${applied.name} · ${bucket.label}`,
      filters: {
        id: `analysis-root-${timestamp}`,
        kind: "group",
        logic: "and",
        children: applied.filters.children.length > 0 ? [applied.filters, bucketGroup] : [bucketGroup],
      },
      groupBy: [],
      view: "table",
      page: 1,
    };
    setDrilldownStack((current) => [...current, applied]);
    setDraft(next);
    setApplied(next);
  };

  const sourceDefinition = REPORT_STUDIO_SOURCES.find((source) => source.id === draft.source);
  const category = REPORT_BUILDER_CATEGORIES.find((entry) => entry.id === categoryId) ?? REPORT_BUILDER_CATEGORIES[0];
  const billingAnalysis = isBillingAnalysisSource(draft.source);
  const categorySources = [...new Set(category.sources.map(reportDatasetRoot))]
    .filter(source => !["billing", "bill-register", "payments", "quotations", "invoice-tracking"].includes(source))
    .filter((source) => !isRestrictedReportSource(source) || manualCatalog?.canEdit);
  const layouts = reportLayouts(draft.source, availableFields);
  const layoutKey = layouts.find(layout => layout.source === draft.source && layout.columns?.every(id => draft.columns.includes(id)))?.id ??
    layouts.find(layout => layout.source === draft.source && layout.groupBy.join() === draft.groupBy.join())?.id ?? "";
  const legacyBilling = applied.source === "billing" && billingDetails;
  const prepareStep = (destination: number) => {
    if (destination === 3 && step < 3) {
      try { validateReportStudioConfig(draft, additionalFields); }
      catch (problem) {
        setStepError({ step, draft, message: problem instanceof Error ? problem.message : "Check your report setup." });
        return false;
      }
      runReport();
    }
    if (destination === 4 && (step < 3 || dirty || !legacyBilling && (loading || !report))) {
      setStepError({ step, draft, message: "Review the current preview before saving or exporting." });
      return false;
    }
    setStepError(null);
    setReached((current) => Math.max(current, destination));
    return true;
  };
  const saveReportForm = <SaveReportForm name={saveName} activeReport={savedReports.find(report => report.id === activeSavedReportId)} loading={savedReportsLoading} saving={savingSavedReport} onName={setSaveName} onCreate={() => void createSavedReport()} onUpdate={() => void updateSavedReport()} onSaveCopy={() => void createSavedReport(true)} />;
  const savedReportList = <SavedReportList reports={savedReports} activeId={activeSavedReportId} loading={savedReportsLoading} deletingId={deletingSavedReportId} onLoad={loadSaved} onDelete={(id) => void deleteSavedReport(id)} />;
  const filterEditor = <FilterPanel group={draft.filters} fields={availableFields} onLogic={updateFilterLogic} onAdd={addFilter} onAddGroup={addFilterGroup} onField={changeFilterField} onUpdate={updateFilter} onRemove={removeFilter} />;
  const columnPanelProps = { fields: availableFields, groups: fieldGroups, selected: draft.columns, colors: draft.excelColumnColors || {}, search: fieldSearch, onSearch: setFieldSearch, onToggle: toggleColumn, onToggleGroup: toggleColumnGroup, onReorder: reorderDraftColumn, onColor: setExcelColumnColor, onGroupColor: setExcelGroupColor };
  const reportScope = `FY ${[...new Set([applied.financialYear, ...(applied.billingScope?.years ?? []), ...(applied.comparisonYears ?? [])])].join(", ")}`;
  const layoutSummary = draft.groupBy.length
    ? `One row per ${draft.groupBy.map(id => fieldMap.get(id)?.label ?? id).join(" → ")}`
    : sourceDefinition?.grain ?? "One row per source record";
  const billingFilters = draft.billingScope?.filters?.children ?? [];
  const setQuickFilter = (field: string, value: ReportStudioFilterValue, operator: ReportStudioOperator = "eq", suffix = "") => {
    const id = `quick-${field}${suffix}`;
    setDraft((current) => {
      const cleaned = withoutFilter(current.filters, id);
      if (value === "") return { ...current, filters: cleaned, page: 1 };
      const root: ReportStudioFilterGroup = cleaned.logic === "and" ? cleaned : { id: crypto.randomUUID(), kind: "group", logic: "and", children: [cleaned] };
      return { ...current, filters: { ...root, children: [...root.children, { id, kind: "condition", field, operator, value }] }, page: 1 };
    });
  };
  const quickFilters = [
    ["client.category", "Client category"], ["client.state", "State"], ["client.registrationRecorded", "Registration record"],
    ["annualReturn.status", "Annual Return status"], ["record.status", "Record status"], ["invoice.status", "Invoice status"], ["record.direction", "Direction"], ["calculated.purchaseComplete", "Purchase invoice coverage"],
  ] as const;
  const quickDate = availableFields.find((field) => field.id === (isReportDetailSource(draft.source) ? "record.date" : "client.registrationDate"));
  const viewOptions = [
    { id: "table" as const, label: "Table", Icon: Table2, available: true, help: "View detailed rows" },
    { id: "analysis" as const, label: "Analyze", Icon: PieChart, available: true, help: "Analyze totals and field completeness" },
    { id: "pivot" as const, label: "Pivot", Icon: Sigma, available: applied.groupBy.length === 2 && applied.metrics.length > 0, help: "Choose two grouping levels and a metric to use Pivot" },
    { id: "chart" as const, label: "Chart", Icon: BarChart3, available: applied.groupBy.length > 0 && applied.metrics.length > 0, help: "Add a grouping and a metric to use Chart" },
    { id: "relationships" as const, label: "Relationships", Icon: Network, available: applied.groupBy.length === 0, help: "Open an ungrouped report to use Relationships" },
  ];

  return (
    <div className="reports-page report-workspace">
      <div className="report-builder-workspace">
      <header className="report-builder-header">
        <div className="report-builder-topline">
          <div className="report-title-block"><span className="report-builder-kicker">Report Studio</span><h1>Create a report</h1></div>
          <div className="report-builder-header-actions">
            <button type="button" className="report-text-button" aria-haspopup="dialog" onClick={() => setLibrary("templates")}><Layers3 size={15} />Start from a template</button>
            <button type="button" className="report-secondary-button" aria-haspopup="dialog" onClick={() => setLibrary("saved")}><FolderOpen size={15} />Saved reports</button>
          </div>
        </div>
        <ReportBuilderStepper step={step} reached={reached} reduced={reduced} onStep={(destination) => { if (prepareStep(destination)) navigateToStep(destination); }} />
      </header>
      <div className="report-builder-nav">
        <div><h2>{REPORT_STAGE_HEADINGS[step]}</h2><ReportStepDescription step={step} reduced={reduced} /></div>
        <WorkflowStepNavigationDock page={step} pages={REPORT_STEPS} commit={commit} reduceMotion={reduced}
          onNavigate={(direction, keyboard) => { if (!commit && prepareStep(step + (direction === "next" ? 1 : -1))) navigateStep(direction, keyboard); }} />
      </div>
      <motion.section key={step} aria-label={REPORT_STEPS[step].title} className={step === 3 ? "report-builder-preview" : "report-builder-stage"}
        initial={reduced ? false : { opacity: 0, x: stepDirection * 10 }} animate={{ opacity: 1, x: 0 }} transition={reportFadeTransition}>
      {stepError?.step === step && stepError.draft === draft && <p className="report-builder-validation" role="alert"><AlertTriangle size={15} />{stepError.message}</p>}
      {step === 0 && <>
        <div className="report-builder-categories" role="group" aria-label="Report category">{REPORT_BUILDER_CATEGORIES.map((entry) => <button key={entry.id} type="button" title={entry.description} aria-pressed={category.id === entry.id} onClick={() => {
          if (category.id !== entry.id) {
            setCategoryId(entry.id);
            changeSource(entry.sources[0]);
          }
        }}>{entry.id === "advanced" ? "Advanced" : entry.title}</button>)}</div>
        <fieldset>
          <legend className="report-builder-label">Dataset</legend>
          <div className="report-dataset-cards">
            {categorySources.map(source => {
              const definition = REPORT_STUDIO_SOURCES.find(entry => entry.id === source);
              const [label, description] = REPORT_DATASET_CARD_COPY[source] ?? [definition?.label ?? source, definition?.description ?? ""];
              const selected = reportDatasetRoot(draft.source) === source;
              return <button key={source} type="button" aria-pressed={selected} onClick={() => { if (!selected) changeSource(source); }}>
                <span><strong>{label}</strong><small>{description}</small></span><span className="report-dataset-indicator" aria-hidden="true">{selected && <Check size={12} strokeWidth={2.6} />}</span>
              </button>;
            })}
          </div>
        </fieldset>
      </>}
      {step === 1 && <>
        <div className="report-builder-layout">
        <div className="report-builder-dataset">
          <label>Reporting layout<ReportSelect ariaLabel="Reporting layout" value={layoutKey} placeholder="Custom grouping"
            options={layouts.map(layout => ({ value: layout.id, label: layout.label }))}
            onChange={id => { const layout = layouts.find(entry => entry.id === id); if (layout) chooseLayout(layout); }} /></label>
        </div>
        {draft.source === "payment-register" && <div className="report-builder-dataset">
          <label>Payment period<ReportSelect ariaLabel="Payment period" value={draft.paymentPeriod ?? "recorded"}
            options={[{ value: "receipt", label: "Payment date" }, { value: "recorded", label: "Stored financial year" }]}
            onChange={value => setDraft(current => ({ ...current, paymentPeriod: value === "receipt" ? "receipt" : "recorded", page: 1 }))} /></label>
        </div>}
        {billingAnalysis && draft.groupBy.some(id => ["bill.month", "bill.invoiceMonth", "bill.dueMonth"].includes(id)) && <div className="report-builder-dataset">
          <label>Month basis<ReportSelect ariaLabel="Month basis"
            value={draft.groupBy.find(id => ["bill.month", "bill.invoiceMonth", "bill.dueMonth"].includes(id)) ?? "bill.month"}
            options={[{ value: "bill.month", label: "Bill date" }, { value: "bill.invoiceMonth", label: "Invoice date" }, { value: "bill.dueMonth", label: "Due date" }]}
            onChange={field => setDraft(current => withGrouping(current, [...new Set(current.groupBy.map(id => ["bill.month", "bill.invoiceMonth", "bill.dueMonth"].includes(id) ? field : id))]))} /></label>
        </div>}
        </div>
        <div className="report-layout-summary"><Table2 size={17} aria-hidden="true" /><div><strong>{layoutSummary}</strong><p className="report-caption">FY {draft.financialYear}{billingFilters.length ? ` · ${billingFilters.length} billing ${billingFilters.length === 1 ? "condition" : "conditions"}` : ""}</p></div></div>
        <details className="report-builder-disclosure">
          <summary>Grouping levels</summary>
          <div className="report-builder-filter-grid mt-3">
            {Array.from({ length: Math.min(draft.groupBy.length + 1, REPORT_GROUP_LIMIT) }, (_, index) => <label key={index}>Level {index + 1}
              <ReportSelect ariaLabel={`Grouping level ${index + 1}`} value={draft.groupBy[index] ?? ""}
                options={[{ value: "", label: "None" }, ...dimensionFields.filter(field => !draft.groupBy.includes(field.id) || draft.groupBy[index] === field.id)
                  .map(field => ({ value: field.id, label: field.label, group: field.group }))]} searchable
                onChange={field => setDraft(current => withGrouping(current, field ? [...current.groupBy.slice(0, index), field, ...current.groupBy.slice(index + 1)] : current.groupBy.slice(0, index)))} />
            </label>)}
          </div>
        </details>
        {billingAnalysis && <details className="report-builder-disclosure" open={billingScopeOpen} onToggle={(event) => setBillingScopeOpen(event.currentTarget.open)}>
          <summary>Bill and charge scope</summary>
          <div className="report-builder-scope">
            <BillingScopeEditor financialYear={draft.financialYear} scope={draft.billingScope}
              onYear={(financialYear) => setDraft(current => ({ ...current, financialYear, page: 1 }))}
              onScope={(billingScope) => setDraft(current => ({ ...current, billingScope, page: 1 }))} />
          </div>
        </details>}
      </>}
      {step === 2 && <>
        <ColumnPanel {...columnPanelProps} embedded />
        {draft.groupBy.length > 0 && <details className="report-builder-disclosure"><summary>Summary measures</summary>
          <ChoicePanel kind="metric" fields={metricFields} selected={draft.metrics} onToggle={toggleMetric} empty="Select measures to total for each group" />
        </details>}
        <CalculatedColumnEditor key={draft.source} config={draft} fields={availableFields} additionalFields={additionalFields} onChange={setDraft} />
        {!isReportDetailSource(draft.source) && (manualCatalog ? <ReportManualEditor fields={manualCatalog.fields} canEdit={manualCatalog.canEdit}
          financialYear={draft.financialYear} onCreate={(field) => setManualCatalog((current) => current && ({ ...current, fields: [...current.fields, field] }))}
          onSave={() => setManualRevision((current) => current + 1)} /> : <p className="report-caption" role={manualError ? "alert" : "status"}>{manualError || "Loading manual data fields…"}</p>)}
        {billingAnalysis ? <>
        <div className="report-builder-scope-link"><p className="report-caption">{billingFilters.length ? `${billingFilters.length} bill and charge ${billingFilters.length === 1 ? "condition" : "conditions"} applied` : "All bills and charges in scope"} · FY {draft.financialYear}</p><button type="button" className="report-text-button" onClick={() => { setBillingScopeOpen(true); navigateToStep(1); }}>Edit billing scope<ArrowRight size={14} /></button></div>
        <details className="report-builder-disclosure"><summary>Filter the resulting rows</summary>
          <p className="report-caption mb-3">These conditions apply after the reporting level is calculated.</p>
          {filterEditor}
        </details>
      </> : <>
        <fieldset><legend className="report-builder-label">Filters</legend><div className="report-builder-filter-grid">
          {draft.source !== "client-directory" && <label>Financial year<ReportSelect value={draft.financialYear} ariaLabel="Report financial year"
            onChange={(financialYear) => setDraft((current) => ({ ...current, financialYear, page: 1 }))}
            options={FINANCIAL_YEARS.map((value) => ({ value, label: value }))} /></label>}
          {quickFilters.map(([id, label]) => {
            if (draft.source === "invoice-months" && id === "record.status") return null;
            const definition = availableFields.find((field) => field.id === id);
            if (!definition) return null;
            const value = filterConditions.find((condition) => condition.id === `quick-${id}`)?.value;
            return <label key={id}>{label}{definition.options?.length ? <ReportSelect ariaLabel={label} value={String(value ?? "")} onChange={(next) => setQuickFilter(id, next)}
              options={[{ value: "", label: "Any" }, ...definition.options.map((option) => ({ value: option, label: option }))]} />
              : <input aria-label={label} className="input-field h-10" placeholder="Any" value={String(value ?? "")} onChange={(event) => setQuickFilter(id, event.target.value, id === "record.status" ? "contains" : "eq")} />}</label>;
          })}
          {quickDate && (["from", "to"] as const).map((bound) => <label key={bound}>{quickDate.shortLabel} {bound}
            <input type="date" className="input-field h-10" value={String(filterConditions.find((condition) => condition.id === `quick-${quickDate.id}-${bound}`)?.value ?? "")}
              onChange={(event) => setQuickFilter(quickDate.id, event.target.value, bound === "from" ? "gte" : "lte", `-${bound}`)} /></label>)}
          {availableFields.some((field) => field.id === "billing.outstanding") && <label className="report-builder-checkbox"><input type="checkbox" checked={filterConditions.some((filter) => filter.id === "quick-billing.outstanding")} onChange={(event) => setQuickFilter("billing.outstanding", event.target.checked ? 0 : "", "gt")} /> Outstanding balance only</label>}
          {availableFields.some((field) => field.id === "calculated.unbilled") && <label className="report-builder-checkbox"><input type="checkbox" checked={filterConditions.some((filter) => filter.id === "quick-calculated.unbilled")} onChange={(event) => setQuickFilter("calculated.unbilled", event.target.checked ? "Yes" : "")} /> Accepted quotations awaiting billing</label>}
        </div></fieldset>
        {REPORT_COMPARISON_SOURCES.has(draft.source) && <details className="report-builder-disclosure">
          <summary>Compare financial years{draft.comparisonYears?.length ? ` · ${draft.comparisonYears.length + 1} years` : ""}</summary>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {draft.comparisonYears?.filter(year => year !== draft.financialYear).map(year => <button key={year} type="button" className="report-secondary-button"
              onClick={() => setDraft(current => ({ ...current, comparisonYears: current.comparisonYears?.filter(value => value !== year), page: 1 }))}>{year}<X size={13} /></button>)}
            <ReportSelect ariaLabel="Add comparison year" value="" placeholder="Add comparison year" disabled={(draft.comparisonYears?.length ?? 0) >= 5}
              onChange={year => setDraft(current => ({ ...current, comparisonYears: [...(current.comparisonYears ?? []), year], page: 1 }))}
              options={FINANCIAL_YEARS.filter(year => year !== draft.financialYear && !draft.comparisonYears?.includes(year)).map(value => ({ value, label: value }))} />
          </div>
        </details>}
        <details className="report-builder-disclosure"><summary>Advanced conditions</summary><p className="report-caption mb-3">These rules decide which records are included. Date fields support a between condition.</p>{filterEditor}</details>
      </>}
      </>}
      {step === 4 && <>
        <div className="report-builder-finish">
          <section className="report-builder-export">
            <div><h3>Download report</h3><p className="report-caption">{applied.name} · {reportScope}</p></div>
            <ExportMenu fy={applied.financialYear} reportAvailable={Boolean(report) && !loading && !dirty} totalRows={report?.pagination.totalRows} downloadingCurrent={downloading} downloading={quickDownloading} onDownloadCurrent={() => void downloadExcel()} onDownload={onDownloadQuickReport} onOpenCustomExport={onOpenCustomExport} />
          </section>
          {legacyBilling ? <p className="report-caption">Use the export controls in the Billing views to download their results.</p> : <section className="report-builder-save">
            <h3>Save configuration</h3><p className="report-caption">Keep this layout, columns and filters for next time.</p>{saveReportForm}
          </section>}
        </div>
      </>}
      {(step === 3 || step === 4 && legacyBilling) && <>
      {step === 3 && <p className="report-preview-summary">{REPORT_STUDIO_SOURCES.find(source => source.id === applied.source)?.label} <span>·</span> {reportScope}{isBillingAnalysisSource(applied.source) && applied.billingScope?.filters?.children.length ? ` · ${applied.billingScope.filters.children.slice(0, 2).map(filterLabel).join(" · ")}` : ""}</p>}
      {applied.source === "billing" && <div className="flex flex-wrap gap-2"><button className="report-secondary-button" aria-pressed={billingDetails} onClick={() => setBillingDetails(true)}>Billing views</button><button className="report-secondary-button" aria-pressed={!billingDetails} onClick={() => setBillingDetails(false)}>Custom Studio report</button></div>}
      {applied.source === "billing" && billingDetails ? <BillingReport financialYear={applied.financialYear} ready={ready} /> : <>
      <div className="report-context-bar"><div className="report-filter-chips"><span className="report-context-label"><Filter size={14} />{appliedConditions.length ? (applied.filters.logic === "or" ? "Match any" : "Filtered by") : "All matching clients"}</span>{appliedConditions.map((condition) => <span key={condition.id} className="report-filter-chip"><button title={filterLabel(condition)} onClick={() => { setSetupExpanded(true); setPanel("filters"); }}>{filterLabel(condition)}</button><button aria-label={`Remove filter: ${filterLabel(condition)}`} onClick={() => removeAppliedFilter(condition.id)}><X size={12} /></button></span>)}</div>
        {isBillingAnalysisSource(applied.source) && <button type="button" className="report-text-button" onClick={() => navigateToStep(2)}><Filter size={15} />Billing scope</button>}
        <button type="button" onClick={() => setSetupExpanded((open) => !open)} className="report-text-button"><SlidersHorizontal size={15} />Customize{dirty && <span className="report-pending-dot" aria-label="Pending changes" />}</button>
      </div>
      <AnimatePresence initial={false}>{setupExpanded && <motion.section className="reports-glass-panel overflow-hidden rounded-[24px] p-3.5 sm:p-4" aria-labelledby="report-setup-title" initial={reduceMotion ? false : { opacity: 0, height: 0, y: -12 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, y: -8 }} transition={reduceMotion ? { duration: 0.01 } : reportSoftSpring}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-600">Customize report</p><h2 id="report-setup-title" className="mt-0.5 text-base font-semibold text-default">Choose the data and level of detail</h2></div>
            <button type="button" onClick={() => { setDraft(applied); setPanel(null); setSetupExpanded(false); }} className="rounded-xl px-3 py-2 text-xs font-semibold text-muted hover:bg-surface hover:text-default">Cancel</button>
          </div>
          <div className="grid gap-3 xl:grid-cols-[minmax(190px,1fr)_170px_minmax(240px,1.2fr)_auto]">
            <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">Report on<span className="mt-1.5 block"><ReportSelect value={draft.source} onChange={(value) => changeSource(value as ReportStudioSource)} ariaLabel="Report source" searchable options={REPORT_STUDIO_SOURCES.map((source) => ({ value: source.id, label: source.label }))} buttonClassName="text-sm" /></span></label>
            <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">Financial year<span className="mt-1.5 block"><ReportSelect value={draft.financialYear} onChange={(value) => setDraft((current) => ({ ...current, financialYear: value, page: 1 }))} ariaLabel="Financial year" options={FINANCIAL_YEARS.map((year) => ({ value: year, label: year }))} buttonClassName="text-sm" /></span></label>
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
            {filterConditions.map((condition) => { const definition = fieldMap.get(condition.field); return <span key={condition.id} className="rounded-full border border-base bg-card px-2.5 py-1"><strong className="text-default">{definition?.shortLabel}</strong> {REPORT_STUDIO_OPERATOR_LABELS[condition.operator]} {Array.isArray(condition.value) ? condition.value.join(", ") : String(condition.value ?? "")}</span>; })}
          </div>
        </div>
      </motion.section>}</AnimatePresence>

      <AnimatePresence>{panel && <StudioInspector key="studio-inspector" panel={panel} dirty={dirty} onClose={() => setPanel(null)} onUndo={() => setDraft(applied)} onRun={runReport}>
        {panel === "columns" && <ColumnPanel {...columnPanelProps} />}
        {panel === "filters" && <div className="mx-auto -mt-1 w-full max-w-[840px]"><FilterPanel group={draft.filters} fields={availableFields} onLogic={updateFilterLogic} onAdd={addFilter} onAddGroup={addFilterGroup} onField={changeFilterField} onUpdate={updateFilter} onRemove={removeFilter} /></div>}
        {panel === "group" && <InspectorSplitLayout choice={<ChoicePanel kind="group" fields={dimensionFields} selected={draft.groupBy} onToggle={toggleGroup} empty="No grouping — one result row per source record" />} preview={<GroupingImpactPreview source={draft.source} fields={availableFields} selected={draft.groupBy} metrics={draft.metrics} appliedSelected={applied.groupBy} configurationDirty={dirty} report={report} />} />}
        {panel === "metrics" && <InspectorSplitLayout choice={<ChoicePanel kind="metric" fields={metricFields} selected={draft.metrics} onToggle={toggleMetric} empty="Select metrics for KPI cards and grouped results" />} preview={<MetricImpactPreview fields={availableFields} selected={draft.metrics} groupBy={draft.groupBy} appliedSelected={applied.metrics} configurationDirty={dirty} report={report} />} />}
        {panel === "saved" && <><div className="mb-4 rounded-xl border border-base bg-surface p-3"><p className="text-xs text-muted">Report configurations and custom export presets are saved to your account.</p><button className="report-text-button mt-1" onClick={() => { setPanel(null); onOpenCustomExport(); }}>Open custom export presets<ArrowRight size={14} /></button></div>{saveReportForm}{savedReportList}</>}
      </StudioInspector>}</AnimatePresence>

      {error && <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>Report could not run.</strong> {error}</div></div>}
      {!report && loading && <div className={`report-overview-skeleton ${["clients", "pibo-targets", "financial-years"].includes(applied.source) ? "with-target" : ""}`} aria-hidden="true"><div /><div /></div>}
      {report && report.pagination.totalRows > 0 && applied.view !== "analysis" && <ReportOverview report={report} onFocus={focusReport} />}
      {report?.quality.messages.length ? <div className="report-quality-notice"><AlertTriangle size={16} /><div><strong>Some records need attention</strong><p>{report.quality.messages.join(" ")}</p></div><button onClick={() => setQualityOpen(true)}>Review records<ArrowRight size={14} /></button></div> : null}
      <ReportQualityPanel open={qualityOpen} financialYear={applied.financialYear} onClose={() => setQualityOpen(false)} />
      {report?.summary.subtotals?.some(level => level.rows.length > 0) && <ReportSubtotals report={report} onOpen={drillIntoRow} />}
      <section id="report-results" className="reports-results-card relative overflow-hidden rounded-[24px]" aria-busy={loading}>
        {loading && report && <div role="status" className="absolute inset-x-0 top-0 z-20 flex h-1 overflow-hidden bg-brand-100/70 dark:bg-brand-950/50"><span className="h-full w-1/3 animate-pulse rounded-full bg-brand-500" /><span className="sr-only">Updating report data while keeping the current results available</span></div>}
        <div className="report-results-toolbar">
          <div className="report-results-heading"><h2>{applied.name || "Report details"}</h2><p className="report-caption" role="status">{loading ? "Loading your report…" : report ? `${report.pagination.totalRows} rows · ${report.summary.matchedClients} clients${lastUpdatedAt ? ` · Updated ${lastUpdatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}` : "Report unavailable"}</p></div>
          <div className="report-table-actions"><button onClick={() => void fetchReport(applied, true)} disabled={loading} aria-label="Refresh report data" className="report-icon-button">{loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}</button><button onClick={() => { setSetupExpanded(true); setPanel("columns"); }} className="report-secondary-button"><Columns3 size={15} />Columns <span>{applied.columns.length}</span></button>{report && <button onClick={() => setBusinessResultsOpen((open) => !open)} aria-expanded={businessResultsOpen} className="report-secondary-button"><Calculator size={15} />Insights</button>}</div>
        </div>
        <div className="report-table-controls"><label className="report-client-search"><Search size={16} /><input value={clientQuery} maxLength={120} onChange={(event) => setClientQuery(event.target.value)} placeholder="Search clients, ID or registration…" aria-label="Search all report clients" />{clientQuery && <button onClick={() => setClientQuery("")} aria-label="Clear client search"><X size={14} /></button>}</label>
          <div className="reports-view-switcher report-view-tabs">{viewOptions.map(({ id, Icon, label, available, help }) => <button key={id} aria-pressed={applied.view === id} onClick={() => { if (available) { changeResultView(id); return; } setSetupExpanded(true); setPanel(id === "relationships" || applied.groupBy.length < (id === "pivot" ? 2 : 1) ? "group" : "metrics"); toast(help); }} title={available ? `${label} view` : `${help}. Click to configure.`} aria-label={`${label} view`} className={applied.view === id ? "is-active" : ""}><Icon size={15} /><span>{label}</span></button>)}</div>
        </div>
        <AnimatePresence initial={false}>{dirty && <motion.div className="report-draft-notice" initial={reduceMotion ? false : { opacity: 0, height: 0, y: -8 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, y: -6 }} transition={reduceMotion ? { duration: 0.01 } : reportSoftSpring}><span>You have unapplied changes. Results show the current report.</span><button onClick={() => setDraft(applied)}>Discard</button><button onClick={runReport}>Apply changes<ArrowRight size={14} /></button></motion.div>}</AnimatePresence>
        <AnimatePresence initial={false}>{drilldownStack.length > 0 && <motion.button initial={reduceMotion ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -6 }} transition={reduceMotion ? { duration: 0.01 } : reportControlSpring} onClick={returnFromDrilldown} className="report-text-button m-4"><ChevronLeft size={15} />Back to grouped report</motion.button>}</AnimatePresence>
        <AnimatePresence initial={false}>{report && businessResultsOpen && <motion.div initial={reduceMotion ? false : { opacity: 0, height: 0, y: -10 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, y: -8 }} transition={reduceMotion ? { duration: 0.01 } : reportSoftSpring} className="overflow-hidden"><BusinessResultsPanel
          results={report.summary.businessResults}
          options={report.summary.businessResultOptions}
          selectedIds={draft.businessResultIds}
          automaticIds={report.summary.automaticBusinessResultIds}
          relatedIds={report.summary.relatedBusinessResultIds}
          canEdit={draft.source === applied.source}
          dirty={dirty}
          onSelectionChange={setBusinessResultIds}
        /></motion.div>}</AnimatePresence>
        {loading && !report ? <InitialReportSkeleton ready={ready} /> : error && !report ? <div className="p-10 text-center"><p className="text-sm text-muted">Your report could not be loaded. Your setup has been kept.</p><button onClick={() => void fetchReport(applied, true)} className="report-secondary-button mx-auto mt-4"><RefreshCw size={15} />Try again</button></div> : report && report.rows.length > 0 ? <StudioResult report={report} availableFields={appliedFields} onUpdateAnalysis={updateAnalysis} onDrilldownAnalysis={drillIntoAnalysisBucket} frozenColumnIds={frozenColumnIds} onFrozenColumnsChange={setFrozenColumnIds} onRowClick={drillIntoRow} onReorderColumn={reorderTableColumn} onMoveColumn={moveTableColumn} onInsertColumn={insertTableColumn} onShowColumn={showTableColumn} onShowAllColumns={showAllTableColumns} onHideColumn={hideTableColumn} onSortColumn={sortTableColumn} onAddSort={addTableSort} onClearColumnSort={clearTableColumnSort} onClearAllSort={clearAllTableSort} onOpenColumnFilter={openTableColumnFilter} onClearColumnFilter={clearTableColumnFilter} onFilterCell={filterFromTableCell} /> : <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-faint"><Layers3 className="h-5 w-5" /></span><h3 className="font-semibold text-default">No records match this report</h3><p className="mt-1 max-w-md text-sm leading-6 text-muted">Try a different search, clear a filter, or choose another financial year.</p><div className="mt-4 flex flex-wrap justify-center gap-2">{appliedConditions.length > 0 && <button type="button" onClick={showAllRecords} className="btn-primary h-9 px-4 text-xs"><Sparkles className="h-3.5 w-3.5" />Show all records</button>}<button type="button" onClick={() => setPanel("filters")} className="glass-btn h-9 text-xs"><Filter className="h-3.5 w-3.5" />Review filters</button></div></div>}
        {report && report.pagination.totalRows > 0 && (applied.view === "table" || applied.view === "relationships") && <div className="flex flex-col gap-3 border-t border-base px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-muted">Showing {Math.min((report.pagination.page - 1) * applied.pageSize + 1, report.pagination.totalRows)}–{Math.min(report.pagination.page * applied.pageSize, report.pagination.totalRows)} of {report.pagination.totalRows} rows</span><div className="flex items-center gap-2"><ReportSelect variant="bare" className="w-[116px] rounded-lg border border-base bg-surface" value={String(applied.pageSize)} onChange={(value) => setPageSize(Number(value))} ariaLabel="Rows per page" options={[10, 25, 50, 100].map((size) => ({ value: String(size), label: `${size} rows` }))} /><span className="px-1 text-[11px] text-faint">Page {report.pagination.page} of {report.pagination.totalPages}</span><button type="button" aria-label="Previous page" onClick={() => setPage(Math.max(1, applied.page - 1))} disabled={applied.page <= 1} className="rounded-lg border border-base p-1.5 text-muted disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><button type="button" aria-label="Next page" onClick={() => setPage(Math.min(report.pagination.totalPages, applied.page + 1))} disabled={applied.page >= report.pagination.totalPages} className="rounded-lg border border-base p-1.5 text-muted disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></div>}
      </section>
      </>}
      </>}
      </motion.section>
      </div>
      <Modal open={library === "templates"} onClose={() => setLibrary(null)} title="Report templates" fluidMotion className="report-builder-library">
        <div className="report-library-list">
          {REPORT_TEMPLATES.map(template => <button key={template.source} type="button" className="report-library-entry" onClick={() => applyTemplate(template)}>
            <span className={`report-library-icon ${template.tone}`}><template.icon size={17} /></span><span><strong>{template.label}</strong><small>{template.description}</small></span><ChevronRight size={15} aria-hidden="true" />
          </button>)}
        </div>
      </Modal>
      <Modal open={library === "saved"} onClose={() => setLibrary(null)} title="Saved reports" fluidMotion className="report-builder-library">
        {savedReportList}
        <button type="button" className="report-text-button mt-3" onClick={() => { setLibrary(null); onOpenCustomExport(); }}>Open custom export presets<ArrowRight size={14} /></button>
      </Modal>
      <AnimatePresence>{relationshipClientId && <RelationshipDrawer key={relationshipClientId} clientId={relationshipClientId} financialYear={applied.financialYear} onClose={() => setRelationshipClientId(null)} />}</AnimatePresence>
    </div>
  );
}

function InitialReportSkeleton({ ready }: { ready: boolean }) {
  return <div role="status" className="min-h-72 animate-pulse p-4 sm:p-5"><div className="mb-4 flex items-center gap-2 text-xs font-medium text-muted"><Loader2 className="h-4 w-4 animate-spin text-brand-600" />{ready ? "Loading report data…" : "Preparing your financial year…"}</div><div className="space-y-3"><div className="h-9 rounded-xl bg-surface" /><div className="grid grid-cols-3 gap-3"><div className="h-8 rounded-lg bg-surface" /><div className="h-8 rounded-lg bg-surface" /><div className="h-8 rounded-lg bg-surface" /></div>{Array.from({ length: 5 }, (_, index) => <div key={index} className="grid grid-cols-4 gap-3"><div className="h-7 rounded-lg bg-surface" /><div className="h-7 rounded-lg bg-surface" /><div className="h-7 rounded-lg bg-surface" /><div className="h-7 rounded-lg bg-surface" /></div>)}</div></div>;
}

function ExportMenu({ fy, totalRows, reportAvailable, downloadingCurrent, downloading, onDownloadCurrent, onDownload, onOpenCustomExport }: {
  fy: string;
  reportAvailable: boolean;
  totalRows?: number;
  downloadingCurrent: boolean;
  downloading: ReportType[];
  onDownloadCurrent: () => void;
  onDownload: (type: ReportType) => void;
  onOpenCustomExport: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

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
      <motion.button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} whileTap={reduceMotion ? undefined : { scale: 0.97 }} transition={reportControlSpring} className="report-primary-button">
        <Download className="h-4 w-4" />Export Excel<motion.span animate={{ rotate: open ? 180 : 0 }} transition={reduceMotion ? { duration: 0.01 } : reportControlSpring}><ChevronDown className="h-3.5 w-3.5" /></motion.span>
      </motion.button>
      <AnimatePresence>{open && (
        <motion.div className="reports-quick-export-menu reports-secondary-card fixed inset-x-4 top-24 rounded-2xl p-3 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[420px] sm:max-w-[calc(100vw-2rem)]" initial={reduceMotion ? false : { opacity: 0, scale: 0.975, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985, y: -5 }} transition={reduceMotion ? { duration: 0.01 } : reportControlSpring} style={{ transformOrigin: "top right" }}>
          <div className="px-1 pb-2">
            <h2 className="text-sm font-semibold text-default">Export reports</h2>
            <p className="mt-0.5 text-[11px] text-muted">Excel workbooks · FY {fy}</p>
          </div>
          <button type="button" onClick={() => { onDownloadCurrent(); setOpen(false); }} disabled={!reportAvailable || downloadingCurrent} className="mb-2 flex w-full items-center gap-3 rounded-xl border border-base bg-card px-3 py-2.5 text-left transition hover:bg-surface disabled:opacity-45">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600 dark:bg-brand-950/30">{downloadingCurrent ? <Loader2 className="h-4 w-4 animate-spin" /> : <Table2 className="h-4 w-4" />}</span>
            <span className="min-w-0 flex-1"><strong className="block text-xs font-semibold text-default">Export all matching rows</strong><span className="block text-[10px] text-muted">{totalRows ?? "—"} rows · applied filters · summary sheets</span></span>
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
        </motion.div>
      )}</AnimatePresence>
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
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const reduceMotion = useReducedMotion();
  const isConfigPanel = panel !== "saved";
  const usesSplitLayout = panel === "group" || panel === "metrics";
  const [motionMode, setMotionMode] = useState<"bottom" | "right">(() => {
    if (typeof window === "undefined") return "bottom";
    return window.matchMedia("(max-width: 767px), ((pointer: coarse) and (orientation: portrait))").matches ? "bottom" : "right";
  });
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 1280 : window.innerWidth,
    height: typeof window === "undefined" ? 800 : window.innerHeight,
  }));
  const [touchInput, setTouchInput] = useState(() => typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);
  const dragControls = useDragControls();
  const panelX = useMotionValue(0);
  const panelY = useMotionValue(0);
  const panelScaleX = useMotionValue(1);
  const panelScaleY = useMotionValue(1);
  const desktopPanelWidth = viewport.width >= 1440 ? 920 : viewport.width >= 1024 ? 860 : 600;
  const dragDistance = motionMode === "bottom"
    ? Math.max(480, viewport.height * 0.94)
    : Math.min(desktopPanelWidth, viewport.width - 24) + 24;
  const scrimOpacityX = useTransform(panelX, [0, dragDistance], [1, 0.08]);
  const scrimOpacityY = useTransform(panelY, [0, dragDistance], [1, 0.08]);
  const gestureClosingRef = useRef(false);
  const [gestureDismissed, setGestureDismissed] = useState(false);
  const motionModeRef = useRef(motionMode);
  closeRef.current = onClose;

  useEffect(() => {
    const updateMotionMode = () => {
      const nextMotionMode = window.matchMedia("(max-width: 767px), ((pointer: coarse) and (orientation: portrait))").matches ? "bottom" : "right";
      if (motionModeRef.current !== nextMotionMode) {
        motionModeRef.current = nextMotionMode;
        panelX.set(0);
        panelY.set(0);
      }
      setMotionMode(nextMotionMode);
      setTouchInput(window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0);
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    updateMotionMode();
    window.addEventListener("resize", updateMotionMode);
    window.addEventListener("orientationchange", updateMotionMode);
    return () => {
      window.removeEventListener("resize", updateMotionMode);
      window.removeEventListener("orientationchange", updateMotionMode);
    };
  }, [panelX, panelY]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      const first = dialog?.querySelector<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])');
      (first || dialog)?.focus();
    });
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'));
      if (focusable.length === 0) { event.preventDefault(); dialogRef.current.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeys);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeys);
      previousFocus?.focus();
    };
  }, []);

  useLayoutEffect(() => {
    if (!isConfigPanel || reduceMotion) return;
    const activeValue = motionMode === "bottom" ? panelY : panelX;
    const inactiveValue = motionMode === "bottom" ? panelX : panelY;
    const activeScale = motionMode === "bottom" ? panelScaleY : panelScaleX;
    const crossScale = motionMode === "bottom" ? panelScaleX : panelScaleY;
    inactiveValue.set(0);
    activeValue.set(dragDistance);
    activeScale.set(0.965);
    crossScale.set(1.008);
    let entranceAnimations: Array<ReturnType<typeof animateMotion>> = [];
    const frame = window.requestAnimationFrame(() => {
      entranceAnimations = [
        animateMotion(activeValue, 0, reportPanelSpring),
        animateMotion(activeScale, 1, { type: "spring", stiffness: 360, damping: 22, mass: 0.7 }),
        animateMotion(crossScale, 1, { type: "spring", stiffness: 380, damping: 28, mass: 0.7 }),
      ];
    });
    return () => {
      window.cancelAnimationFrame(frame);
      entranceAnimations.forEach((animation) => animation.stop());
    };
    // Opening runs once for this mounted inspector. Responsive direction changes
    // are handled by the motion-mode effect without replaying the entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gestureEnabled = isConfigPanel && touchInput && !reduceMotion;
  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!gestureEnabled || event.pointerType === "mouse") return;
    if ((event.target as HTMLElement).closest("button, input, select, textarea, a")) return;
    gestureClosingRef.current = false;
    setGestureDismissed(false);
    dragControls.start(event.nativeEvent, { snapToCursor: false });
  };
  const finishDrag = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (!gestureEnabled || gestureClosingRef.current) return;
    const offset = motionMode === "bottom" ? info.offset.y : info.offset.x;
    const velocity = motionMode === "bottom" ? info.velocity.y : info.velocity.x;
    const threshold = motionMode === "bottom"
      ? Math.min(150, window.innerHeight * 0.18)
      : Math.min(180, window.innerWidth * 0.16);
    const activeValue = motionMode === "bottom" ? panelY : panelX;

    if (offset > threshold || velocity > 720) {
      gestureClosingRef.current = true;
      setGestureDismissed(true);
      void animateMotion(activeValue, dragDistance, {
        type: "spring",
        stiffness: 320,
        damping: 36,
        mass: 0.82,
        velocity,
        restDelta: 0.8,
        restSpeed: 8,
      }).then(() => closeRef.current());
      return;
    }

    void animateMotion(activeValue, 0, {
      type: "spring",
      stiffness: 420,
      damping: 34,
      mass: 0.78,
      velocity,
      restDelta: 0.5,
      restSpeed: 5,
    });
  };

  const panelInitial = reduceMotion
    ? false
    : panel === "saved"
      ? { opacity: 0, scale: 0.98, y: 26 }
      : false;
  const panelExit = reduceMotion
    ? { opacity: 0 }
    : gestureDismissed
      ? { opacity: 1, transition: { duration: 0.01 } }
    : panel === "saved"
      ? { opacity: 0, scale: 0.985, y: 18 }
      : motionMode === "bottom"
        ? { opacity: 1, y: [0, -10, dragDistance], scaleY: [1, 1.018, 0.965], scaleX: [1, 0.996, 1.006], transition: reportPanelExitTransition }
        : { opacity: 1, x: [0, -12, dragDistance], scaleX: [1, 1.018, 0.965], scaleY: [1, 0.996, 1.006], transition: reportPanelExitTransition };

  return createPortal(<motion.div className={`report-inspector-backdrop ${panel === "saved" ? "report-library-dialog" : "report-config-dialog"} fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-5`} initial={reduceMotion || isConfigPanel ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={isConfigPanel ? { opacity: 1 } : { opacity: 0 }} transition={reduceMotion ? { duration: 0.01 } : reportFadeTransition}>
    <motion.div className="report-inspector-scrim absolute inset-0" aria-hidden="true" style={{ opacity: motionMode === "bottom" ? scrimOpacityY : scrimOpacityX }} onPointerDown={(event) => { if (event.button === 0) onClose(); }} />
    <motion.section
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-inspector-title"
      data-motion-mode={motionMode}
      className={`report-inspector-shell flex w-full flex-col overflow-hidden rounded-t-[30px] sm:max-w-[1080px] sm:rounded-[30px] focus:outline-none ${panel === "saved" ? "h-auto max-h-[92vh] sm:max-h-[min(720px,calc(100vh-2.5rem))]" : "h-[92vh] sm:h-[min(820px,calc(100vh-2.5rem))]"}`}
      initial={panelInitial}
      animate={panel === "saved" ? { opacity: 1, scale: 1, x: 0, y: 0 } : { opacity: 1 }}
      exit={panelExit}
      transition={reduceMotion ? { duration: 0.01 } : reportPanelSpring}
      style={{ x: panelX, y: panelY, scaleX: panelScaleX, scaleY: panelScaleY, transformOrigin: motionMode === "bottom" ? "center bottom" : "right center" }}
      drag={gestureEnabled ? (motionMode === "bottom" ? "y" : "x") : false}
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={motionMode === "bottom" ? { top: 0, bottom: dragDistance } : { left: 0, right: dragDistance }}
      dragElastic={0}
      dragMomentum={false}
      onDragEnd={finishDrag}
    >
      <header className={`report-inspector-header relative flex shrink-0 items-center gap-3 px-4 py-3.5 sm:px-6 sm:py-4 ${gestureEnabled ? "report-inspector-drag-zone" : ""}`} onPointerDown={startDrag}>
        {gestureEnabled && <span className="report-inspector-grabber" aria-hidden="true" />}
        <span className="report-inspector-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] text-brand-600"><Icon className="h-[18px] w-[18px]" /></span>
        <div className="min-w-0 flex-1"><h2 id="report-inspector-title" className="text-[16px] font-semibold tracking-[-0.018em] text-default">{title}</h2><p className="mt-0.5 max-w-3xl text-[11px] leading-4 text-muted sm:text-xs">{description}</p></div>
        <button type="button" onClick={onClose} aria-label={`Close ${title}`} className="report-inspector-close rounded-full p-2.5 text-faint transition-all hover:text-default"><X className="h-4 w-4" /></button>
      </header>
      <div className={`report-inspector-body min-h-0 flex-1 overflow-y-auto p-3 sm:p-5 ${usesSplitLayout ? "lg:overflow-hidden" : ""}`}><AnimatePresence mode="wait" initial={false}><motion.div key={panel} className={usesSplitLayout ? "min-h-0 lg:h-full" : undefined} initial={reduceMotion ? false : { opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8 }} transition={reduceMotion ? { duration: 0.01 } : reportSoftSpring}>{children}</motion.div></AnimatePresence></div>
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
    </motion.section>
  </motion.div>, document.body);
}

function InspectorSearch({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="reports-search-field">
    <Search className="pointer-events-none h-4 w-4 shrink-0 text-faint" />
    <span className="sr-only">{placeholder}</span>
    <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-[12px] text-default outline-none placeholder:text-faint" />
    {value && <button type="button" onClick={() => onChange("")} aria-label="Clear search" className="rounded-full p-1 text-faint hover:bg-surface hover:text-default"><X className="h-3 w-3" /></button>}
  </label>;
}

function InspectorSplitLayout({ choice, preview }: { choice: ReactNode; preview: ReactNode }) {
  const [pane, setPane] = useState<"choose" | "preview">("choose");

  return <div className="flex min-h-0 flex-col lg:h-full">
    <div className="mb-3 flex w-full shrink-0 rounded-xl bg-surface p-1 text-[11px] font-semibold lg:hidden">
      <button type="button" onClick={() => setPane("choose")} aria-pressed={pane === "choose"} className={`flex-1 rounded-lg px-3 py-2 transition-colors ${pane === "choose" ? "bg-card text-brand-600 shadow-sm" : "text-muted"}`}>Choose</button>
      <button type="button" onClick={() => setPane("preview")} aria-pressed={pane === "preview"} className={`flex-1 rounded-lg px-3 py-2 transition-colors ${pane === "preview" ? "bg-card text-brand-600 shadow-sm" : "text-muted"}`}>Preview</button>
    </div>
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(420px,1.12fr)_minmax(350px,0.88fr)]">
      <div className={`${pane === "choose" ? "min-h-0" : "hidden"} lg:block lg:min-h-0`}>{choice}</div>
      <div className={`${pane === "preview" ? "min-h-0" : "hidden"} lg:block lg:min-h-0`}>{preview}</div>
    </div>
  </div>;
}

function ColumnPanel({ fields, groups, selected, colors, search, onSearch, onToggle, onToggleGroup, onReorder, onColor, onGroupColor, embedded = false }: {
  fields: ReportStudioFieldDefinition[];
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
  embedded?: boolean;
}) {
  const [libraryOpen, setLibraryOpen] = useState(embedded);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(groups[0]?.[0] ? [groups[0][0]] : []));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const definitionsById = new Map(fields.map((definition) => [definition.id, definition]));
  const selectedDefinitions = selected.map((id) => definitionsById.get(id)).filter((entry): entry is ReportStudioFieldDefinition => Boolean(entry));
  const toggleExpanded = (group: string) => setExpandedGroups((current) => {
    const next = new Set(current);
    if (next.has(group)) next.delete(group); else next.add(group);
    return next;
  });

  return <div className={`grid min-h-0 items-stretch gap-4 ${embedded ? "report-field-picker" : ""} ${libraryOpen ? embedded ? "lg:grid-cols-2" : "xl:grid-cols-[minmax(350px,0.9fr)_minmax(420px,1.1fr)]" : ""}`}>
    <section className={`report-inspector-panel min-w-0 w-full flex-col overflow-hidden rounded-[22px] ${libraryOpen ? embedded ? "hidden lg:flex" : "hidden xl:flex" : "flex"}`}>
      <div className="flex items-center justify-between gap-4 border-b border-base px-4 py-3.5"><div className="min-w-0"><div className="flex items-center gap-2"><h3 className="whitespace-nowrap text-xs font-semibold text-default">Selected columns</h3><span className="rounded-full bg-brand-50 px-2 py-0.5 text-[9px] font-bold text-brand-600 dark:bg-brand-950/35">{selected.length}</span></div><p className="mt-0.5 text-[9px] leading-4 text-muted">Drag rows to set table and Excel order.</p></div>{!libraryOpen && <button type="button" onClick={() => setLibraryOpen(true)} className="report-inspector-library-button inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[10px] font-semibold text-brand-600"><Plus className="h-3.5 w-3.5" />Field library</button>}</div>
      <div className="report-inspector-selected-list min-h-0 max-h-[calc(100dvh-260px)] flex-1 space-y-1 overflow-y-auto p-2.5">{selectedDefinitions.map((definition, index) => {
        const color = reportStudioExcelColor(definition, colors);
        return <div key={definition.id} draggable onDragStart={() => setDraggingId(definition.id)} onDragEnd={() => setDraggingId(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggingId) onReorder(draggingId, definition.id); setDraggingId(null); }} className={`report-inspector-column-row group flex min-h-[50px] items-center gap-2.5 rounded-xl px-2.5 transition-all ${draggingId === definition.id ? "scale-[0.985] opacity-45" : ""}`}>
          <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-faint opacity-55 transition-opacity group-hover:opacity-100 active:cursor-grabbing" />
          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-[7px] bg-brand-600 px-1 text-[9px] font-bold text-white shadow-[0_3px_8px_-4px_rgba(0,113,227,0.8)]">{index + 1}</span>
          <span className="min-w-0 flex-1"><strong className="block truncate text-[11px] font-semibold text-default">{definition.label}</strong><span className="mt-0.5 block truncate text-[9px] text-faint">{definition.group}</span></span>
          {appearanceOpen && <label className="relative h-[18px] w-[18px] shrink-0 cursor-pointer rounded-full border border-black/10 shadow-sm ring-2 ring-white/80 dark:ring-black/30" style={{ backgroundColor: color }} title={`${definition.label} Excel header colour`}><input type="color" value={color} onInput={(event) => onColor(definition.id, event.currentTarget.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`${definition.label} Excel colour`} /></label>}
          <button type="button" onClick={() => onToggle(definition.id)} aria-label={`Remove ${definition.label}`} disabled={selected.length === 1} title={selected.length === 1 ? "At least one column is required" : `Remove ${definition.label}`} className="rounded-lg p-1 text-faint opacity-55 transition-all hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 dark:hover:bg-rose-950/25"><X className="h-3 w-3" /></button>
        </div>;
      })}</div>
      <div className="flex items-center gap-2 border-t border-base px-3.5 py-2.5 text-[9px] leading-4 text-muted"><button onClick={() => setAppearanceOpen((open) => !open)} aria-expanded={appearanceOpen} className="report-text-button">{appearanceOpen ? "Hide" : "Edit"} Excel header colors<ChevronDown size={14} /></button></div>
    </section>

    {libraryOpen && <section className="report-inspector-panel flex min-w-0 flex-col overflow-hidden rounded-[22px]">
      <div className="flex items-center justify-between gap-2 px-4 pb-2.5 pt-3.5"><div className="min-w-0"><h3 className="text-xs font-semibold text-default">Field library</h3>{!embedded && <p className="mt-0.5 max-w-[250px] text-[9px] leading-4 text-muted">Browse related website sections and add only what matters.</p>}</div><div className="flex shrink-0 items-center gap-2"><span className="report-library-selection-count rounded-full bg-surface px-2.5 py-1 text-[9px] font-semibold text-muted">{selected.length} selected</span><button type="button" onClick={() => setLibraryOpen(false)} aria-label="Close field library" className="report-inspector-library-button inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-semibold text-default"><ChevronLeft className={embedded ? "h-3.5 w-3.5 lg:hidden" : "h-3.5 w-3.5 xl:hidden"} /><X className={embedded ? "hidden h-3.5 w-3.5 lg:block" : "hidden h-3.5 w-3.5 xl:block"} /><span className={embedded ? "lg:hidden" : "xl:hidden"}>Selected columns</span><span className={embedded ? "hidden lg:inline" : "hidden xl:inline"}>Close</span></button></div></div>
      <div className="mx-3.5 mb-3"><InspectorSearch value={search} onChange={onSearch} placeholder="Search fields, sections or descriptions" /></div>
      <div className="report-inspector-library min-h-0 max-h-[calc(100dvh-310px)] flex-1 space-y-1 overflow-y-auto border-t border-base p-2">{groups.length === 0 ? <div className="rounded-xl border border-dashed border-base p-6 text-center text-xs text-muted">No fields match your search.</div> : groups.map(([group, fields]) => {
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
              <div className="flex items-center gap-2 px-2 py-1.5"><button type="button" role="checkbox" aria-checked={active} aria-label={definition.label} onClick={() => onToggle(definition.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left"><span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${active ? "border-brand-600 bg-brand-600 text-white" : "border-base bg-card"}`}>{active && <Check className="h-3 w-3" />}</span><span className="min-w-0 flex-1 truncate text-[10px] font-medium text-default">{definition.label}</span>{selectedOrder && <span aria-hidden="true" className="text-[9px] font-bold tabular-nums text-brand-600">#{selectedOrder}</span>}</button><button type="button" onClick={() => setDetailId((current) => current === definition.id ? null : definition.id)} aria-label={`About ${definition.label}`} aria-expanded={detailId === definition.id} className={`rounded-md p-1 ${detailId === definition.id ? "bg-surface text-brand-600" : "text-faint hover:bg-surface hover:text-default"}`}><Info className="h-3.5 w-3.5" /></button></div>
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
    ? selected.map((id) => fields.find((definition) => definition.id === id)).filter((entry): entry is ReportStudioFieldDefinition => Boolean(entry))
    : filteredFields;
  const fieldGroups = new Map<string, ReportStudioFieldDefinition[]>();
  visibleFields.forEach((definition) => fieldGroups.set(definition.group, [...(fieldGroups.get(definition.group) || []), definition]));
  const browseLabel = kind === "group" ? "Add grouping" : "Add metrics";

  return <section className={`flex min-w-0 flex-col rounded-[20px] border border-base bg-card p-2.5 sm:p-3 ${visibleFields.length > 0 ? "lg:h-full lg:min-h-0" : ""}`}>
    <div className={`mb-3 grid gap-2 ${view === "all" ? "sm:grid-cols-[auto_minmax(200px,1fr)] sm:items-center" : ""}`}><div className="flex w-fit rounded-xl bg-surface p-1 text-[10px] font-semibold"><button type="button" onClick={() => setView("selected")} className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 ${view === "selected" ? "bg-card text-brand-600 shadow-sm" : "text-muted"}`}>Selected <span className="ml-1 text-faint">{selected.length}</span></button><button type="button" onClick={() => setView("all")} className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 ${view === "all" ? "bg-card text-brand-600 shadow-sm" : "text-muted"}`}>All fields <span className="ml-1 text-faint">{fields.length}</span></button></div>{view === "all" && <InspectorSearch value={search} onChange={setSearch} placeholder="Search fields" />}</div>
    {visibleFields.length === 0 ? <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-base px-5 text-center"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface text-faint">{kind === "group" ? <Group className="h-4 w-4" /> : <Sigma className="h-4 w-4" />}</span><p className="mt-3 text-xs font-semibold text-default">{view === "selected" ? empty : "No matching fields"}</p>{view === "selected" && <button type="button" onClick={() => setView("all")} className="mt-2 text-[11px] font-semibold text-brand-600 hover:underline">{browseLabel}</button>}</div> : <div className="min-h-0 max-h-[53vh] flex-1 space-y-3 overflow-y-auto pr-1 lg:max-h-none">{Array.from(fieldGroups, ([group, definitions]) => <div key={group}><p className="mb-1.5 px-1 text-[9px] font-semibold uppercase tracking-[0.09em] text-faint">{group}</p><div className="space-y-1.5">{definitions.map((definition) => {
      const active = selected.includes(definition.id);
      const selectedOrder = active ? selected.indexOf(definition.id) + 1 : null;
      return <div key={definition.id} className={`rounded-xl border ${active ? "border-brand-200 bg-brand-50/60 dark:border-brand-900/60 dark:bg-brand-950/20" : "border-base bg-card hover:bg-surface"}`}><div className="flex min-h-[50px] items-center gap-2.5 px-3 py-2.5"><button type="button" onClick={() => onToggle(definition.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left"><span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border ${active ? "border-brand-600 bg-brand-600 text-white" : "border-base bg-card"}`}>{active && <Check className="h-3 w-3" />}</span>{selectedOrder && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-bold text-white">{selectedOrder}</span>}<span className="min-w-0 flex-1"><strong className="block truncate text-[11px] text-default">{definition.label}</strong><span className="mt-0.5 block truncate text-[9px] text-faint">{kind === "metric" ? aggregateLabel(definition.aggregate) : "Grouping field"}</span></span></button><button type="button" onClick={() => setDetailId((current) => current === definition.id ? null : definition.id)} aria-label={`About ${definition.label}`} className={`rounded-lg p-1.5 ${detailId === definition.id ? "bg-card text-brand-600 shadow-sm" : "text-faint hover:bg-surface hover:text-default"}`}><Info className="h-3.5 w-3.5" /></button></div>{detailId === definition.id && <p className="border-t border-base px-3 py-2.5 text-[9px] leading-4 text-muted">{definition.description}</p>}</div>;
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

function GroupingImpactPreview({ source, fields, selected, metrics, appliedSelected, configurationDirty, report }: {
  source: ReportStudioSource;
  fields: ReportStudioFieldDefinition[];
  selected: string[];
  metrics: string[];
  appliedSelected: string[];
  configurationDirty: boolean;
  report: ReportStudioResponse | null;
}) {
  const sourceDefinition = REPORT_STUDIO_SOURCES.find((entry) => entry.id === source);
  const definitionsById = new Map(fields.map((definition) => [definition.id, definition]));
  const groupDefinitions = selected.map((id) => definitionsById.get(id)).filter((entry): entry is ReportStudioFieldDefinition => Boolean(entry));
  const metricDefinitions = metrics.map((id) => definitionsById.get(id)).filter((entry): entry is ReportStudioFieldDefinition => Boolean(entry)).slice(0, 3);
  const unchanged = selectionsMatch(selected, appliedSelected);
  const rowMeaning = groupDefinitions.length === 0
    ? sourceDefinition?.grain || "One row per source record"
    : `One row per unique ${groupDefinitions.map((entry) => entry.label).join(" + ")} combination`;
  const previewColumns = [...groupDefinitions, ...metricDefinitions];
  const actualPreviewRows = unchanged && !configurationDirty && report ? report.rows.slice(0, 3) : [];
  const sampleValues = groupDefinitions.map((definition) => definition.options?.[0] || `Each ${definition.shortLabel}`);

  return <aside className="flex h-fit min-h-0 flex-col rounded-[20px] border border-brand-200 bg-brand-50/50 p-3.5 dark:border-brand-900/60 dark:bg-brand-950/15">
    <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Table2 className="h-4 w-4 text-brand-600" /><h4 className="text-xs font-semibold text-default">Impact Preview</h4></div><span className="rounded-full bg-card px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.07em] text-muted">Read only</span></div>
    <div className="mt-3 rounded-xl bg-card p-3 shadow-sm"><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">What each row will represent</p><p className="mt-1 text-xs font-semibold leading-5 text-default">{rowMeaning}</p><p className="mt-1 text-[10px] leading-4 text-muted">{groupDefinitions.length === 0 ? "Client or source-level records stay separate; selected metrics are not combined into category rows." : `Matching ${sourceDefinition?.label.toLowerCase() || "records"} will be combined into these groups. Numeric metrics will be recalculated for every group.`}</p></div>
    <div className="mt-3"><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">Result structure</p>{previewColumns.length === 0 ? <p className="mt-2 text-xs text-muted">Select a grouping field or summary metric to preview the result columns.</p> : <div className="mt-2 overflow-x-auto rounded-xl border border-base bg-card"><div className="grid divide-x divide-base bg-surface" style={{ gridTemplateColumns: `repeat(${previewColumns.length}, minmax(90px, 1fr))` }}>{previewColumns.map((definition) => <div key={definition.id} className="truncate px-2 py-2 text-[9px] font-semibold text-default" title={definition.label}>{definition.shortLabel}</div>)}</div>{actualPreviewRows.length > 0 ? actualPreviewRows.map((row) => <div key={row.id} className="grid divide-x divide-base border-t border-base" style={{ gridTemplateColumns: `repeat(${previewColumns.length}, minmax(90px, 1fr))` }}>{previewColumns.map((definition) => <div key={definition.id} className="truncate px-2 py-2 text-[10px] text-muted">{previewValue(row.values[definition.id], definition)}</div>)}</div>) : <div className="grid divide-x divide-base border-t border-base" style={{ gridTemplateColumns: `repeat(${previewColumns.length}, minmax(90px, 1fr))` }}>{previewColumns.map((definition, index) => <div key={definition.id} className="truncate px-2 py-2 text-[10px] text-muted">{index < sampleValues.length ? sampleValues[index] : "Calculated after Run"}</div>)}</div>}</div>}</div>
    <div className="mt-3 rounded-xl border border-dashed border-brand-200 px-3 py-2 text-[10px] leading-4 text-muted dark:border-brand-900/60">{!configurationDirty ? `Current result: ${report?.pagination.totalRows || 0} row${report?.pagination.totalRows === 1 ? "" : "s"}.` : unchanged ? "The row structure is unchanged, but other pending report settings may change the exact values and row count after you run the report." : "This is a structure preview. Exact group values and row count will be calculated from all matching records after you run the report."}</div>
  </aside>;
}

function MetricImpactPreview({ fields, selected, groupBy, appliedSelected, configurationDirty, report }: {
  fields: ReportStudioFieldDefinition[];
  selected: string[];
  groupBy: string[];
  appliedSelected: string[];
  configurationDirty: boolean;
  report: ReportStudioResponse | null;
}) {
  const definitionsById = new Map(fields.map((definition) => [definition.id, definition]));
  const definitions = selected.map((id) => definitionsById.get(id)).filter((entry): entry is ReportStudioFieldDefinition => Boolean(entry));
  const groupDefinitions = groupBy.map((id) => definitionsById.get(id)).filter((entry): entry is ReportStudioFieldDefinition => Boolean(entry));
  const unchanged = selectionsMatch(selected, appliedSelected);
  const currentMetrics = new Map((report?.summary.metrics || []).map((metric) => [metric.field, metric]));
  const placementText = groupDefinitions.length > 0
    ? `Each metric becomes a calculated column for every ${groupDefinitions.map((entry) => entry.shortLabel).join(" + ")} group.`
    : "Metrics summarize all matching records while the table remains at its current client or source-record level.";

  return <aside className="flex min-h-0 flex-col rounded-[20px] border border-brand-200 bg-brand-50/50 p-3.5 lg:h-full dark:border-brand-900/60 dark:bg-brand-950/15">
    <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Sigma className="h-4 w-4 text-brand-600" /><h4 className="text-xs font-semibold text-default">Impact Preview</h4></div><span className="rounded-full bg-card px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.07em] text-muted">Read only</span></div>
    <div className="mt-3 rounded-xl bg-card p-3 shadow-sm"><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">What will happen</p><p className="mt-1 text-xs font-semibold leading-5 text-default">{definitions.length === 0 ? "No summary calculations will be requested." : `${definitions.length} website calculation${definitions.length === 1 ? "" : "s"} will be included.`}</p><p className="mt-1 text-[10px] leading-4 text-muted">{placementText}</p></div>
    <div className="mt-3 flex flex-wrap gap-1">{["KPI summary", groupDefinitions.length > 0 ? "Grouped columns" : "Report totals", "Total bar", "Excel"].map((location) => <span key={location} className="rounded-full border border-base bg-card px-1.5 py-1 text-[9px] font-semibold text-muted">{location}</span>)}</div>
    <div className="mt-3 flex min-h-0 flex-1 flex-col"><p className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">Selected calculation preview</p>{definitions.length === 0 ? <p className="mt-2 rounded-xl border border-dashed border-base p-3 text-xs text-muted">Select a metric to see its source, calculation and output.</p> : <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">{definitions.map((definition) => { const current = currentMetrics.get(definition.id); return <div key={definition.id} className="rounded-xl border border-base bg-card p-2.5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block text-[11px] text-default">{definition.label}</strong><span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.06em] text-faint">{definition.group} · {aggregateLabel(definition.aggregate)}</span></div><strong className="shrink-0 text-[11px] tabular-nums text-brand-600">{current ? formatCell(current.value, definition) : "After Run"}</strong></div><p className="mt-1 text-[10px] leading-4 text-muted">{definition.description}</p></div>; })}</div>}</div>
    <div className="mt-3 rounded-xl border border-dashed border-brand-200 px-3 py-2 text-[10px] leading-4 text-muted dark:border-brand-900/60">{!configurationDirty ? "Values shown come from the currently loaded report and all matching records, not only the visible page." : unchanged ? "These are the currently loaded values. Pending grouping, filters or other settings may change them after you run the report." : "Existing values are shown where available. Newly selected calculations will use all matching records after you run the report."}</div>
  </aside>;
}

function parseFilterInput(value: string, definition: ReportStudioFieldDefinition, operator: ReportStudioOperator): ReportStudioFilterValue {
  if (operator === "in" || operator === "not_in" || operator === "same_set") return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (["number", "quantity", "currency", "percentage"].includes(definition.type)) return value === "" ? null : Number(value);
  if (definition.type === "boolean") return value === "true";
  return value;
}

function CalculatedColumnEditor({ config, fields, additionalFields, onChange }: { config: ReportStudioConfig; fields: ReportStudioFieldDefinition[]; additionalFields: ReportStudioFieldDefinition[]; onChange: (next: ReportStudioConfig) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [condition, setCondition] = useState<ReportStudioFilterGroup>({ id: "rule-root", kind: "group", logic: "and", children: [] });
  const [error, setError] = useState("");
  const sourceFields = fields.filter((field) => !field.id.startsWith("rule."));
  const columns = config.calculatedColumns || [];
  const begin = (column?: typeof columns[number]) => {
    setEditingId(column?.id || `rule.${crypto.randomUUID()}`);
    setLabel(column?.label || "");
    setCondition(column?.condition || { id: crypto.randomUUID(), kind: "group", logic: "and", children: [] });
    setError("");
  };
  const defaultClause = (definition: ReportStudioFieldDefinition): ReportStudioFilterClause => ({
    id: crypto.randomUUID(), kind: "condition", field: definition.id, operator: definition.operators[0],
    value: definition.options?.length ? parseFilterInput(definition.options[0], definition, definition.operators[0]) : null,
  });
  const updateGroup = (id: string, update: (group: ReportStudioFilterGroup) => ReportStudioFilterGroup) => setCondition((current) => transformFilterGroup(current, id, update));
  const add = (id = condition.id, nested = false) => {
    if (!sourceFields[0]) return;
    const child = defaultClause(sourceFields[0]);
    updateGroup(id, (group) => ({ ...group, children: [...group.children, nested ? { id: crypto.randomUUID(), kind: "group", logic: "or", children: [child] } : child] }));
  };
  const save = () => {
    if (!editingId) return;
    const column = { id: editingId, label: label.trim(), condition };
    const exists = columns.some((entry) => entry.id === editingId);
    const next: ReportStudioConfig = { ...config, version: 2, calculatedColumns: exists ? columns.map((entry) => entry.id === editingId ? column : entry) : [...columns, column],
      columns: config.columns.includes(editingId) ? config.columns : [...config.columns, editingId], page: 1 };
    try { onChange(validateReportStudioConfig(next, additionalFields)); setEditingId(null); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Check the calculated column."); }
  };
  return <details className="report-builder-disclosure">
    <summary>Custom calculated columns</summary>
    <p className="report-caption">A calculated column displays Yes, No or Unknown for each record. It does not remove rows.</p>
    {columns.length > 0 && <ul className="my-3 flex flex-wrap gap-2">{columns.map((column) => <li key={column.id}><button type="button" className="report-secondary-button" onClick={() => begin(column)}>{column.label}</button></li>)}</ul>}
    {!editingId ? <button type="button" className="report-secondary-button mt-3" onClick={() => begin()} disabled={columns.length >= 12}><Plus size={15} /> Add calculated column</button> : <div className="mt-3 space-y-3">
      <label className="block text-sm">Column name<input className="input-field mt-1 block h-10" value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} /></label>
      <FilterPanel group={condition} fields={sourceFields} onLogic={(id, logic) => updateGroup(id, (group) => ({ ...group, logic }))}
        onAdd={add} onAddGroup={(id) => add(id, true)}
        onField={(clause, id) => {
          const field = sourceFields.find((entry) => entry.id === id);
          if (field) setCondition((current) => updateConditionInGroup(current, clause.id, { ...defaultClause(field), id: clause.id, secondValue: undefined }));
        }}
        onUpdate={(id, patch) => setCondition((current) => updateConditionInGroup(current, id, patch))}
        onRemove={(id) => setCondition((current) => removeFilterNode(current, id))} />
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" onClick={save} disabled={!label.trim() || condition.children.length === 0}>Apply calculated column</button><button type="button" className="report-secondary-button" onClick={() => setEditingId(null)}>Cancel</button></div>
    </div>}
  </details>;
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

function BillingScopeEditor({ financialYear, scope, onYear, onScope }: {
  financialYear: string; scope: ReportStudioConfig["billingScope"];
  onYear: (financialYear: string) => void;
  onScope: (scope: NonNullable<ReportStudioConfig["billingScope"]>) => void;
}) {
  const group: ReportStudioFilterGroup = scope?.filters ?? { id: "billing-scope", kind: "group", logic: "and", children: [] };
  const years = (scope?.years ?? []).filter(year => year !== financialYear);
  const change = (filters: ReportStudioFilterGroup) => onScope({ ...scope, filters });
  const quick = (id: string) => group.children.find((child): child is ReportStudioFilterClause => child.kind === "condition" && child.id === `billing-quick-${id}`);
  const setQuick = (field: string, value: ReportStudioFilterValue, operator: ReportStudioOperator = "eq") => {
    const id = `billing-quick-${field}`;
    const cleaned = withoutFilter(group, id);
    if (value === "") return change(cleaned);
    const children = cleaned.logic === "or" && cleaned.children.length ? [cleaned] : cleaned.children;
    change({ ...cleaned, id: cleaned.logic === "or" ? crypto.randomUUID() : cleaned.id, logic: "and", children: [...children, { id, kind: "condition", field, operator, value }] });
  };
  const quickFields = ["bill.type", "charge.kind", "charge.classification", "bill.paymentStatus"];
  const makeCondition = (definition: ReportStudioFieldDefinition): ReportStudioFilterClause => {
    const operator = definition.operators[0];
    return { id: crypto.randomUUID(), kind: "condition", field: definition.id, operator,
      value: definition.options?.length ? parseFilterInput(definition.options[0], definition, operator) : "" };
  };
  const updateGroup = (id: string, update: (entry: ReportStudioFilterGroup) => ReportStudioFilterGroup) => change(transformFilterGroup(group, id, update));
  const add = (id = group.id, nested = false) => {
    const clause = makeCondition(billingScopeFields.find(field => field.id === "bill.type")!);
    const child: ReportStudioFilterClause | ReportStudioFilterGroup = nested
      ? { id: crypto.randomUUID(), kind: "group", logic: "or", children: [clause] } : clause;
    updateGroup(id, entry => ({ ...entry, children: [...entry.children, child] }));
  };
  return <>
    <div className="report-builder-filter-grid">
      <label>Financial year<ReportSelect value={financialYear} ariaLabel="Report financial year" onChange={onYear}
        options={FINANCIAL_YEARS.map(value => ({ value, label: value }))} /></label>
      {quickFields.map(id => {
        const definition = billingScopeFields.find(field => field.id === id)!;
        return <label key={id}>{definition.label}<ReportSelect ariaLabel={definition.label} value={String(quick(id)?.value ?? "")}
          onChange={value => setQuick(id, value)} options={[{ value: "", label: "Any" }, ...(definition.options ?? []).map(value => ({ value, label: value }))]} /></label>;
      })}
      <label className="report-builder-checkbox"><input type="checkbox" checked={!!quick("bill.outstanding")}
        onChange={event => setQuick("bill.outstanding", event.target.checked ? 0 : "", "gt")} /> Outstanding bills only</label>
    </div>
    <details className="report-builder-disclosure" open={years.length ? true : undefined}><summary>Compare financial years{years.length ? ` · ${years.length + 1} years` : ""}</summary>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {years.map(year => <button key={year} type="button" className="report-secondary-button" aria-label={`Remove FY ${year}`}
          onClick={() => onScope({ ...scope, years: years.filter(value => value !== year) })}>{year}<X size={13} /></button>)}
        <ReportSelect ariaLabel="Add comparison year" value="" placeholder="Add comparison year" disabled={years.length >= 10}
          onChange={year => onScope({ ...scope, years: [...years, year] })}
          options={FINANCIAL_YEARS.filter(year => year !== financialYear && !years.includes(year)).map(value => ({ value, label: value }))} />
      </div>
    </details>
    <details className="report-builder-disclosure"><summary>Advanced bill and charge conditions</summary>
      <p className="report-caption mb-3">Combine bill, charge and EPR conditions. Conditions in the same group are checked against the same charge and its parent bill.</p>
      <FilterPanel group={group} fields={billingScopeFields}
        onLogic={(id, logic) => updateGroup(id, entry => ({ ...entry, logic }))}
        onAdd={add} onAddGroup={id => add(id, true)}
        onField={(clause, fieldId) => {
          const definition = billingScopeFields.find(field => field.id === fieldId);
          if (definition) change(updateConditionInGroup(group, clause.id, { ...makeCondition(definition), id: clause.id, secondValue: undefined }));
        }}
        onUpdate={(id, patch) => change(updateConditionInGroup(group, id, patch))}
        onRemove={id => change(removeFilterNode(group, id))} />
    </details>
  </>;
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
  return <div className={depth > 0 ? "rounded-2xl border border-brand-100 bg-brand-50/40 p-4 dark:border-brand-900/50 dark:bg-brand-950/10" : ""}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2"><div className="flex rounded-lg bg-surface p-1 text-[11px] font-semibold"><button type="button" onClick={() => onLogic(group.id, "and")} className={`rounded-md px-2 py-1 ${group.logic === "and" ? "bg-card text-brand-600 shadow-sm" : "text-muted"}`}>Match ALL</button><button type="button" onClick={() => onLogic(group.id, "or")} className={`rounded-md px-2 py-1 ${group.logic === "or" ? "bg-card text-brand-600 shadow-sm" : "text-muted"}`}>Match ANY</button></div>{depth > 0 && <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">Nested group</span>}</div>
      <div className="flex gap-2"><button type="button" onClick={() => onAdd(group.id)} className="glass-btn h-9 text-xs"><Plus className="h-3.5 w-3.5" />Condition</button>{depth < 2 && <button type="button" onClick={() => onAddGroup(group.id)} className="glass-btn h-9 text-xs"><Group className="h-3.5 w-3.5" />Nested Group</button>}{depth > 0 && <button type="button" onClick={() => onRemove(group.id)} className="rounded-lg p-2 text-faint hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}</div>
    </div>
    {group.children.length === 0 ? <div className="rounded-2xl border border-dashed border-base p-6 text-center text-xs text-muted">No filters. All source records can qualify.</div> : <div className="space-y-3">{group.children.map((child, index) => child.kind === "group" ? <FilterGroupEditor key={child.id} group={child} fields={fields} depth={depth + 1} onLogic={onLogic} onAdd={onAdd} onAddGroup={onAddGroup} onField={onField} onUpdate={onUpdate} onRemove={onRemove} /> : <FilterConditionEditor key={child.id} condition={child} prefix={index === 0 ? "Where" : group.logic} fields={fields} onField={onField} onUpdate={onUpdate} onRemove={onRemove} />)}</div>}
  </div>;
}

function FilterConditionEditor({ condition, prefix, fields, onField, onUpdate, onRemove }: { condition: ReportStudioFilterClause; prefix: string; fields: ReportStudioFieldDefinition[]; onField: (condition: ReportStudioFilterClause, fieldId: string) => void; onUpdate: (id: string, patch: Partial<ReportStudioFilterClause>) => void; onRemove: (id: string) => void }) {
  const definition = fields.find((field) => field.id === condition.field) || fields[0];
  if (!definition) return null;
  const noValue = condition.operator === "empty" || condition.operator === "not_empty";
  const inputType = ["number", "quantity", "currency", "percentage"].includes(definition.type) ? "number" : definition.type === "date" ? "date" : "text";
  return <div className="grid items-center gap-3 rounded-2xl border border-base bg-card p-3 lg:grid-cols-[44px_minmax(170px,1fr)_minmax(140px,0.8fr)_minmax(160px,1fr)_auto]">
    <span className="text-left text-[10px] font-semibold uppercase text-faint lg:text-center">{prefix}</span>
    <ReportSelect value={condition.field} onChange={(value) => onField(condition, value)} ariaLabel="Filter field" searchable options={fields.map((entry) => ({ value: entry.id, label: entry.label, group: entry.group }))} buttonClassName="min-h-9 text-xs" />
    <ReportSelect value={condition.operator} onChange={(value) => onUpdate(condition.id, { operator: value as ReportStudioOperator })} ariaLabel="Filter operator" options={definition.operators.map((operator) => ({ value: operator, label: REPORT_STUDIO_OPERATOR_LABELS[operator] }))} buttonClassName="min-h-9 text-xs" />
    {noValue
      ? <span className="px-2 text-xs text-faint">No value needed</span>
      : definition.options && !["in", "not_in", "same_set"].includes(condition.operator)
        ? <ReportSelect value={String(condition.value ?? "")} onChange={(value) => onUpdate(condition.id, { value: parseFilterInput(value, definition, condition.operator) })} ariaLabel="Filter value" searchable={definition.options.length > 8} options={definition.options.map((option) => ({ value: option, label: definition.type === "boolean" ? option === "true" ? "Yes" : "No" : option }))} buttonClassName="min-h-9 text-xs" />
        : <input type={inputType} value={Array.isArray(condition.value) ? condition.value.join(", ") : String(condition.value ?? "")} onChange={(event) => onUpdate(condition.id, { value: parseFilterInput(event.target.value, definition, condition.operator) })} placeholder={condition.operator === "in" || condition.operator === "not_in" ? "Comma-separated values" : "Value"} className="input-field h-9 rounded-lg text-xs" />}
    <button type="button" onClick={() => onRemove(condition.id)} aria-label="Remove condition" className="rounded-lg p-2 text-faint hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/20"><Trash2 className="h-4 w-4" /></button>
    {condition.operator === "between" && <input type={inputType} value={String(condition.secondValue ?? "")} onChange={(event) => onUpdate(condition.id, { secondValue: parseFilterInput(event.target.value, definition, condition.operator) })} placeholder="And" className="input-field h-9 rounded-lg text-xs lg:col-start-4" />}
  </div>;
}

function SaveReportForm({ name, activeReport, loading, saving, onName, onCreate, onUpdate, onSaveCopy }: {
  name: string;
  activeReport?: SavedStudioReport;
  loading: boolean;
  saving: boolean;
  onName: (value: string) => void;
  onCreate: () => void;
  onUpdate: () => void;
  onSaveCopy: () => void;
}) {
  return <div className="report-save-form">
    {activeReport && <p className="report-caption">Editing <strong className="text-default">{activeReport.name}</strong></p>}
    <label><span className="sr-only">Report name</span><input value={name} maxLength={120} disabled={saving} onChange={(event) => onName(event.target.value)} placeholder="Name this report configuration" className="input-field h-10 w-full rounded-xl text-sm" /></label>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={saving || loading} onClick={activeReport ? onUpdate : onCreate} className="report-secondary-button"><Save size={15} />{saving ? "Saving…" : activeReport ? "Update saved report" : "Save report"}</button>
      {activeReport && <button type="button" disabled={saving || loading} onClick={onSaveCopy} className="report-text-button px-2">Save as a copy</button>}
    </div>
  </div>;
}

function SavedReportList({ reports, activeId, loading, deletingId, onLoad, onDelete }: {
  reports: SavedStudioReport[];
  activeId: string | null;
  loading: boolean;
  deletingId: string | null;
  onLoad: (report: SavedStudioReport) => void;
  onDelete: (id: string) => void;
}) {
  if (loading) return <p className="report-library-status" role="status"><Loader2 size={16} className="motion-safe:animate-spin" />Loading saved reports…</p>;
  if (!reports.length) return <p className="report-library-status"><Bookmark size={16} />Your saved reports will appear here.</p>;
  return <ul className="report-library-list" aria-label="Saved report configurations">{reports.map(report => <li key={report.id}>
    <button type="button" className="report-library-entry" onClick={() => onLoad(report)}>
      <span className="report-library-icon"><Bookmark size={16} /></span>
      <span><strong>{report.name}</strong><small>{report.config.financialYear} · {report.config.columns.length} columns{report.id === activeId ? " · Editing" : ""}</small></span>
      <ChevronRight size={15} aria-hidden="true" />
    </button>
    <button type="button" className="report-library-delete" disabled={deletingId === report.id} aria-label={`Delete ${report.name}`} onClick={() => onDelete(report.id)}><Trash2 size={15} /></button>
  </li>)}</ul>;
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
  onUpdateAnalysis: (patch: Partial<ReportStudioConfig["analysis"]>) => void;
  onDrilldownAnalysis: (bucket: ReportStudioAnalysisBucket) => void;
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
  const { report, availableFields, onRowClick, onUpdateAnalysis, onDrilldownAnalysis } = props;
  const reduceMotion = useReducedMotion();
  const view = report.config.view;
  const content = view === "analysis"
    ? <ReportStudioAnalysis report={report} availableFields={availableFields} onChange={onUpdateAnalysis} onDrilldown={onDrilldownAnalysis} />
    : view === "pivot"
    ? <PivotView report={report} onRowClick={onRowClick} />
    : view === "chart"
      ? <ReportStudioChart report={report} onRowClick={onRowClick} />
      : view === "relationships"
        ? <RelationshipCards report={report} onRowClick={onRowClick} />
        : <StudioTable {...props} />;
  return <AnimatePresence mode="wait" initial={false}><motion.div key={view} className="min-w-0" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }} transition={reduceMotion ? { duration: 0.01 } : reportSoftSpring}>{content}</motion.div></AnimatePresence>;
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
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
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
    const focusFrame = window.requestAnimationFrame(() => contextMenuRef.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus());
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
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", escape);
    };
  }, [context]);

  const openColumnMenu = (event: React.MouseEvent<HTMLButtonElement>, column: ReportStudioFieldDefinition) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setContextView("root");
    setContextSearch("");
    setContext({ x: rect.right - 8, y: rect.bottom + 6, column });
  };

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
            <span className="mt-0.5 flex items-center justify-between gap-2 text-[11px] font-semibold text-default">
              <button type="button" onClick={(event) => { event.stopPropagation(); const direction = sortIndex < 0 ? "asc" : report.config.sort[sortIndex].direction === "asc" ? "desc" : null; onSortColumn(column.id, direction); }} className="flex min-w-0 items-center gap-1 rounded-md text-left hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={`Sort by ${column.label}${sortIndex < 0 ? " ascending" : report.config.sort[sortIndex].direction === "asc" ? " descending" : ", clear sorting"}`}><span className="truncate">{column.shortLabel}</span>{sortIndex >= 0 && <span className="text-[9px] text-brand-600">{report.config.sort[sortIndex].direction === "asc" ? "▲" : "▼"}{report.config.sort.length > 1 ? sortIndex + 1 : ""}</span>}</button>
              <button type="button" onClick={(event) => openColumnMenu(event, column)} className="rounded-md p-1 text-faint hover:bg-surface hover:text-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={`Open options for ${column.label}`} aria-haspopup="menu"><Ellipsis className="h-3.5 w-3.5" /></button>
            </span>
          </th>;
        })}</tr></thead>
        <tbody className="divide-y divide-base">{report.rows.map((row) => <tr key={row.id} tabIndex={0} aria-label={`${String(row.values["client.companyName"] || row.id)}. ${grouped ? "Open underlying clients" : "Explore client relationships"}`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onRowClick(row); return; } if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); const column = displayedColumns[0]; if (!column) return; const rect = event.currentTarget.getBoundingClientRect(); setContextView("root"); setContextSearch(""); setContext({ x: rect.left + 36, y: rect.top + 30, column, row, value: row.values[column.id] ?? null }); } }} onClick={() => onRowClick(row)} className="cursor-pointer hover:bg-surface/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500" title={grouped ? "Open underlying clients" : "Explore client relationships"}>{displayedColumns.map((column) => {
          const value = row.values[column.id] ?? null;
          const numeric = typeof value === "number";
          const frozen = frozenSet.has(column.id);
          return <td key={column.id} style={frozen ? { left: frozenOffsets[column.id] || 0 } : undefined} className={`px-3 py-3 ${numeric ? "text-right font-medium tabular-nums text-default" : "text-muted"} ${frozen ? "report-studio-frozen-column" : ""} ${lastFrozenId === column.id ? "report-studio-last-frozen" : ""}`}>{column.id === "client.companyName" ? <span className="report-client-cell"><strong>{formatCell(value, column)}</strong><small>{row.clientIds[0]}</small></span> : column.id === "target.overall.progress" ? <span className="report-cell-progress">{typeof value === "number" ? <><span>{percentage(value)}</span><i><b style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></i></> : <span className="text-faint">No target</span>}</span> : formatCell(value, column)}</td>;
        })}</tr>)}</tbody>
        <tfoot className="sticky bottom-0 z-20 bg-[#245b88] text-white shadow-[0_-1px_0_rgba(255,255,255,0.18)]"><tr>{displayedColumns.map((column, index) => {
          const result = totalBarResult(column);
          const frozen = frozenSet.has(column.id);
          return <td key={column.id} title={result?.description || (index === 0 ? "Totals are calculated from all matching records, not only the current page" : undefined)} style={frozen ? { left: frozenOffsets[column.id] || 0 } : undefined} className={`whitespace-nowrap px-3 py-2.5 font-semibold ${index === 0 ? "text-left" : "text-right tabular-nums"} ${frozen ? "report-studio-frozen-column" : ""} ${lastFrozenId === column.id ? "report-studio-last-frozen" : ""}`}>{index === 0 ? <span className="flex items-center justify-between gap-3"><span className="uppercase tracking-[0.08em]">Total</span>{result && <span>{column.type === "percentage" ? "Avg " : ""}{formatResultValue(result)}</span>}</span> : result ? <span>{column.type === "percentage" ? "Avg " : ""}{formatResultValue(result)}</span> : null}</td>;
        })}</tr></tfoot>
      </table>
    </div>
    {context && <div ref={contextMenuRef} role="menu" aria-label={`Options for ${context.column.label}`} data-report-column-menu="true" onClick={(event) => event.stopPropagation()} className="fixed z-[70] max-h-[calc(100vh-16px)] w-[310px] overflow-y-auto rounded-xl border border-base bg-card py-1 text-xs shadow-2xl" style={{ left: Math.max(8, context.x), top: Math.max(8, context.y) }}>
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

function ReportSubtotals({ report, onOpen }: { report: ReportStudioResponse; onOpen: (row: ReportStudioResponse["rows"][number]) => void }) {
  const levels = report.summary.subtotals ?? [];
  const labels = new Map(report.columns.map(column => [column.id, column]));
  return <details className="report-builder-disclosure px-4 py-2">
    <summary>Group subtotals</summary>
    {levels.map(level => <div key={level.dimensions.join()} className="mb-3 overflow-x-auto">
      <table className="reports-pivot-table min-w-full text-xs">
        <caption className="report-caption text-left py-2">{level.dimensions.map(id => labels.get(id)?.label ?? id).join(" → ")}
          {level.rows.length < level.totalRows ? ` · Showing ${level.rows.length} of ${level.totalRows}. Export Excel for all subtotals.` : ""}</caption>
        <thead><tr>{[...level.dimensions, ...report.config.metrics].map(id => <th key={id} className="p-2 text-left">{labels.get(id)?.label ?? id}</th>)}</tr></thead>
        <tbody>{level.rows.map(row => <tr key={row.id}>
          {[...level.dimensions, ...report.config.metrics].map((id, index) => {
            const definition = labels.get(id);
            const value = definition ? formatCell(row.values[id] ?? null, definition) : "—";
            return <td key={id} className="p-2">{index === 0 ? <button type="button" className="report-text-button" onClick={() => onOpen(row)}>{value}</button> : value}</td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>)}
  </details>;
}

function PivotView({ report, onRowClick }: { report: ReportStudioResponse; onRowClick: (row: ReportStudioResponse["rows"][number]) => void }) {
  const [rowField, columnField] = report.config.groupBy;
  const metricFields = report.config.metrics;
  const [metricField, setMetricField] = useState(metricFields[0] || "");
  useEffect(() => {
    if (!metricFields.includes(metricField)) setMetricField(metricFields[0] || "");
  }, [metricField, metricFields]);
  if (!rowField || !columnField || !metricField) return <ViewGuidance title="Pivot needs two groupings" detail="Choose two dimensions in Group By and at least one Summary Metric, then run the report." />;
  const definitionsById = new Map(report.columns.map((definition) => [definition.id, definition]));
  const rowDefinition = definitionsById.get(rowField);
  const columnDefinition = definitionsById.get(columnField);
  const metricDefinition = definitionsById.get(metricField);
  if (!rowDefinition || !columnDefinition || !metricDefinition) return null;
  const axisLabel = (row: ReportStudioResponse["rows"][number], field: string) => {
    const label = String(row.values[field] ?? "No value");
    return field === "client.companyName" && row.clientIds.length === 1 ? `${label} (${row.clientIds[0]})` : label;
  };
  const rowKeys = Array.from(new Set(report.rows.map(row => axisLabel(row, rowField))));
  const columnKeys = Array.from(new Set(report.rows.map(row => axisLabel(row, columnField))));
  const rowMap = new Map(report.rows.map(row => [`${axisLabel(row, rowField)}\u0000${axisLabel(row, columnField)}`, row]));
  return <div className="overflow-auto p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="text-xs text-muted"><strong className="text-default">{rowDefinition.label}</strong> × <strong className="text-default">{columnDefinition.label}</strong></div>{metricFields.length > 1 && <ReportSelect variant="bare" className="w-[190px] rounded-xl border border-base bg-card" value={metricField} onChange={setMetricField} ariaLabel="Pivot metric" options={metricFields.map((fieldId) => ({ value: fieldId, label: definitionsById.get(fieldId)?.shortLabel || fieldId }))} />}</div><div className="reports-pivot-shell overflow-hidden rounded-2xl"><table className="reports-pivot-table min-w-full text-xs"><thead><tr><th className="px-3 py-2.5 text-left text-default">{rowDefinition.shortLabel}</th>{columnKeys.map((key) => <th key={key} className="px-3 py-2.5 text-right text-default">{key}</th>)}</tr></thead><tbody>{rowKeys.map((rowKey) => <tr key={rowKey}><td className="px-3 py-2.5 font-semibold text-default">{rowKey}</td>{columnKeys.map((columnKey) => { const row = rowMap.get(`${rowKey}\u0000${columnKey}`); return <td key={columnKey} tabIndex={row ? 0 : undefined} onKeyDown={(event) => { if (row && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onRowClick(row); } }} onClick={() => row && onRowClick(row)} className="cursor-pointer px-3 py-2.5 text-right font-medium text-brand-600 transition-colors hover:bg-brand-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 dark:text-[#4aa8ff] dark:hover:bg-brand-950/20">{row ? formatCell(row.values[metricField] ?? null, metricDefinition) : "–"}</td>; })}</tr>)}</tbody></table></div></div>;
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
  financial?: import("@/lib/billing-report").BillingCompanyRow | null;
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
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reports/studio/relationships/${encodeURIComponent(clientId)}?fy=${encodeURIComponent(financialYear)}`, { cache: "no-store" })
      .then(async (response) => { const body = await readJsonResponse(response); if (!response.ok) throw new Error(body?.error || "Unable to load relationships"); return body; })
      .then((body) => { if (!cancelled) setData(body); })
      .catch((requestError) => { if (!cancelled) setError(requestError instanceof Error ? requestError.message : "Unable to load relationships"); });
    return () => { cancelled = true; };
  }, [clientId, financialYear]);
  const clientName = String(data?.client?.companyName || clientId);
  const billingTotal = data?.financial?.billed || 0;
  const paid = data?.financial?.paid || 0;
  return <motion.div
    className="fixed inset-0 z-50 flex justify-end bg-black/25 backdrop-blur-[2px]"
    initial={reduceMotion ? false : { opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={reduceMotion ? { duration: 0.01 } : reportFadeTransition}
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
  >
    <motion.aside
      className="h-full w-full max-w-2xl overflow-y-auto border-l border-base bg-card shadow-2xl"
      initial={reduceMotion ? false : { x: 52 }}
      animate={{ x: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { x: 42 }}
      transition={reduceMotion ? { duration: 0.01 } : reportPanelSpring}
    >
      <div className="sticky top-0 z-10 flex items-start justify-between border-b border-base bg-card/95 p-5 backdrop-blur-xl"><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-600">Relationship Explorer · {financialYear}</p><h2 className="mt-1 text-xl font-semibold text-default">{clientName}</h2><a href={`/dashboard/clients/${encodeURIComponent(clientId)}`} className="mt-1 inline-block text-xs font-semibold text-brand-600 hover:underline">Open client profile</a></div><button type="button" onClick={onClose} className="rounded-xl p-2 text-muted hover:bg-surface"><X className="h-5 w-5" /></button></div>
      {error ? <div className="m-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : !data ? <div className="flex min-h-80 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-brand-600" /></div> : <motion.div className="space-y-4 p-5" initial={reduceMotion ? false : "hidden"} animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.025, delayChildren: 0.06 } } }}><RelationshipNode title="People" detail={`${data.contacts.length} related contact${data.contacts.length === 1 ? "" : "s"}`} tone="violet" /><RelationshipNode title={`Financial Year ${financialYear}`} detail={data.financialYearRecord ? "Financial Year record available" : "No Financial Year record"} tone="blue" /><div className="ml-5 grid gap-3 border-l border-base pl-4 sm:grid-cols-2"><RelationshipNode title="Targets / Credits" detail={data.financialYearRecord ? "Open the target columns in this report for CAT/type values" : "No target or generated-credit record"} tone="blue" /><RelationshipNode title="Annual Return" detail={String(data.annualReturn?.status || "Not recorded")} tone="indigo" /><RelationshipNode title="Invoice Tracking" detail={`${data.invoiceCoverage.sale.doneCount}/12 sale · ${data.invoiceCoverage.purchase.doneCount}/12 purchase months`} tone="teal" /><RelationshipNode title="CPCB Upload" detail={`${data.uploads.count} records · ${quantity(data.uploads.quantity)} quantity`} tone="teal" /></div><RelationshipNode title="Linked Quotations" detail={`${data.quotations.length} linked · ${data.quotations.filter((quotation) => quotation.status === "Accepted").length} accepted`} tone="emerald" /><div className="ml-5 grid gap-3 border-l border-base pl-4 sm:grid-cols-2"><RelationshipNode title="Billing" detail={data.financial?.billCount ? `${data.financial.billCount} bills · ${formatCurrency(billingTotal)} billed` : "No billing record"} tone="amber" /><RelationshipNode title="Payments" detail={`${data.payments.length} records · ${formatCurrency(paid)} received · ${formatCurrency(data.financial?.outstanding || 0)} outstanding · ${formatCurrency(data.financial?.advance || 0)} unapplied advance`} tone="amber" /></div><details className="rounded-xl border border-base p-3 text-xs text-muted"><summary className="cursor-pointer font-semibold">All underlying bills ({data.financial?.billCount || 0})</summary>{data.financial?.bills.map(bill => <p key={bill.billingId} className="mt-2 break-all">{bill.invoiceNumber || bill.title} · {bill.billingId} · {formatCurrency(bill.billed)} billed · {formatCurrency(bill.paid)} allocated · {formatCurrency(bill.outstanding)} outstanding</p>)}</details><details className="rounded-xl border border-base p-3 text-xs text-muted"><summary className="cursor-pointer font-semibold">All underlying bills ({data.financial?.billCount || 0})</summary>{data.financial?.bills.map(bill => <p key={bill.billingId} className="mt-2 break-all">{bill.invoiceNumber || bill.title} · {bill.billingId} · {formatCurrency(bill.billed)} billed · {formatCurrency(bill.paid)} allocated · {formatCurrency(bill.outstanding)} outstanding</p>)}</details><div className="grid gap-3 sm:grid-cols-3"><RelationshipNode title="Documents" detail={`${data.documents.length} recent records`} tone="slate" /><RelationshipNode title="Tasks" detail={`${data.tasks.filter((task) => task.status === "open").length} open · ${data.tasks.length} recent`} tone="slate" /><RelationshipNode title="Activity" detail={`${data.activities.length} recent events`} tone="slate" /></div><RelationshipNode title="Credit Transactions" detail={`${data.transactions.inboundCount} inbound · ${data.transactions.outboundCount} outbound`} tone="violet" /></motion.div>}
    </motion.aside>
  </motion.div>;
}

function RelationshipNode({ title, detail, tone }: { title: string; detail: string; tone: string }) {
  const tones: Record<string, string> = { blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-200", violet: "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-200", indigo: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-200", teal: "bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-200", emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200", amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200", slate: "bg-surface text-muted" };
  return <motion.div variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: reportSoftSpring } }} className={`rounded-2xl p-4 ${tones[tone] || tones.slate}`}><strong className="block text-xs">{title}</strong><span className="mt-1 block text-[11px] leading-4 opacity-80">{detail}</span></motion.div>;
}

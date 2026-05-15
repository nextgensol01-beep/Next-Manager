"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import PageHeader from "@/components/ui/PageHeader";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import EmptyState from "@/components/ui/EmptyState";
import TableWrapper from "@/components/ui/TableWrapper";
import Modal from "@/components/ui/Modal";
import FYTabBar from "@/components/ui/FYTabBar";
import { useCache, invalidate } from "@/lib/useCache";
import { useFinancialYearState } from "@/app/providers";
import { formatDate } from "@/lib/utils";
import { getCoveredInvoiceMonths, getFinancialYearMonths, type InvoiceCoverageSummary } from "@/lib/invoiceCoverage";
import { Plus, Search, X, Trash2, ChevronDown, Pencil, Eye, LayoutList, Table2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

interface Client {
  clientId: string;
  companyName: string;
}

interface Invoice {
  _id: string;
  clientId: string;
  financialYear: string;
  invoiceType?: "sale" | "purchase";
  receivedVia?: "hardcopy" | "mail" | "whatsapp";
  fromDate: string;
  toDate: string;
  createdAt: string;
}

interface ClientInvoiceSummary {
  clientId: string;
  companyName: string;
  invoiceCount: number;
  coverage: InvoiceCoverageSummary;
}

type InvoiceViewMode = "coverage" | "entries";

const EXPAND_TRANSITION = { type: "spring", stiffness: 360, damping: 34, mass: 0.9 } as const;
const FADE_TRANSITION = { duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const;

const INVOICE_TYPE_OPTIONS = [
  { id: "sale", label: "Sale Invoice" },
  { id: "purchase", label: "Purchase Invoice" },
] as const;

const RECEIVED_VIA_OPTIONS = [
  { id: "hardcopy", label: "Hardcopy" },
  { id: "mail", label: "Mail" },
  { id: "whatsapp", label: "WhatsApp" },
] as const;

const normalizeOptionValue = (value?: string) => String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");

const invoiceTypeLabel = (value?: string) => {
  const normalized = normalizeOptionValue(value);
  if (normalized === "sale" || normalized === "saleinvoice") return "Sale Invoice";
  if (normalized === "purchase" || normalized === "purchaseinvoice") return "Purchase Invoice";
  return "";
};

const receivedViaLabel = (value?: string) => {
  const normalized = normalizeOptionValue(value);
  if (normalized === "hardcopy" || normalized === "hardcopies") return "Hardcopy";
  if (normalized === "mail" || normalized === "email") return "Mail";
  if (normalized === "whatsapp") return "WhatsApp";
  return "";
};

const invoiceTypeFormValue = (value?: string) => {
  const label = invoiceTypeLabel(value);
  if (label === "Sale Invoice") return "sale";
  if (label === "Purchase Invoice") return "purchase";
  return "";
};

const receivedViaFormValue = (value?: string) => {
  const label = receivedViaLabel(value);
  if (label === "Hardcopy") return "hardcopy";
  if (label === "Mail") return "mail";
  if (label === "WhatsApp") return "whatsapp";
  return "";
};

const invoiceDuration = (invoice: Invoice) => {
  const months = getCoveredInvoiceMonths(invoice.fromDate, invoice.toDate, invoice.financialYear).length;
  if (months === 0) return "";
  return `${months} month${months === 1 ? "" : "s"}`;
};

const invoiceCoveredMonthText = (invoice: Invoice) => {
  const monthMap = new Map(getFinancialYearMonths(invoice.financialYear).map((month) => [month.key, month.label]));
  const months = getCoveredInvoiceMonths(invoice.fromDate, invoice.toDate, invoice.financialYear)
    .map((key) => monthMap.get(key))
    .filter(Boolean);
  return months.length > 0 ? months.join(", ") : "-";
};

const FY_MONTH_LABELS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

const CoverageSummaryCell = ({ label, coverage }: { label: string; coverage: InvoiceCoverageSummary["sale"] }) => {
  const doneMonths = new Set(coverage.doneMonths);

  return (
  <div className="w-full min-w-0 lg:min-w-[330px] space-y-2">
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-semibold text-default">{label}</span>
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <span className={`px-2 py-0.5 rounded-full ${
          coverage.leftCount === 0
            ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            : "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        }`}>
          {coverage.doneCount}/12
        </span>
        {coverage.leftCount > 0 && <span className="text-faint">{coverage.leftCount} left</span>}
      </div>
    </div>
    <div className="grid grid-cols-12 gap-1" aria-label={`${label} month coverage`}>
      {FY_MONTH_LABELS.map((month) => {
        const done = doneMonths.has(month);
        return (
          <span
            key={`${label}-${month}`}
            title={`${month}: ${done ? "Done" : "Left"}`}
            className={`h-7 min-w-0 rounded-md border text-[10px] font-semibold flex items-center justify-center ${
              done
                ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-900/25 dark:text-green-300"
                : "border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-500"
            }`}
          >
            {month}
          </span>
        );
      })}
    </div>
    <div className="flex items-center gap-3 text-[11px] text-faint">
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-green-500" />Done</span>
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-slate-300 dark:bg-slate-600" />Left</span>
    </div>
  </div>
  );
};

const InvoiceEntriesTable = ({
  invoices,
  clientName,
  onEdit,
  onDelete,
  reducedMotion = false,
}: {
  invoices: Invoice[];
  clientName: (clientId: string) => string;
  onEdit: (invoice: Invoice) => void;
  onDelete: (id: string) => void;
  reducedMotion?: boolean;
}) => (
  <TableWrapper>
    <table className="w-full min-w-[900px]">
      <thead>
        <tr>
          <th className="table-header">Company</th>
          <th className="table-header">FY</th>
          <th className="table-header">Invoice Type</th>
          <th className="table-header">Received Via</th>
          <th className="table-header">From Date</th>
          <th className="table-header">To Date</th>
          <th className="table-header">Duration</th>
          <th className="table-header">Covered Months</th>
          <th className="table-header">Added On</th>
          <th className="table-header"></th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((invoice, index) => {
          const duration = invoiceDuration(invoice);
          const coveredMonths = invoiceCoveredMonthText(invoice);
          return (
            <motion.tr
              key={invoice._id}
              initial={reducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reducedMotion ? FADE_TRANSITION : { ...FADE_TRANSITION, delay: Math.min(index, 8) * 0.025 }}
              className="hover:bg-hover border-t border-soft transition-colors"
            >
              <td className="table-cell font-medium whitespace-nowrap">{clientName(invoice.clientId)}</td>
              <td className="table-cell whitespace-nowrap">
                <span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 px-2 py-0.5 rounded-full font-medium">
                  {invoice.financialYear}
                </span>
              </td>
              <td className="table-cell text-sm whitespace-nowrap">{invoiceTypeLabel(invoice.invoiceType) || "-"}</td>
              <td className="table-cell text-sm whitespace-nowrap">{receivedViaLabel(invoice.receivedVia) || "-"}</td>
              <td className="table-cell font-mono text-sm whitespace-nowrap">{formatDate(invoice.fromDate)}</td>
              <td className="table-cell font-mono text-sm whitespace-nowrap">{formatDate(invoice.toDate)}</td>
              <td className="table-cell text-muted text-sm whitespace-nowrap">{duration}</td>
              <td className="table-cell text-muted text-sm">{coveredMonths}</td>
              <td className="table-cell text-muted text-sm whitespace-nowrap">{formatDate(invoice.createdAt)}</td>
              <td className="table-cell whitespace-nowrap">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onEdit(invoice)}
                    className="p-1.5 text-faint hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors"
                    title="Edit invoice tracking"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDelete(invoice._id)}
                    className="p-1.5 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Delete invoice tracking"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </td>
            </motion.tr>
          );
        })}
      </tbody>
    </table>
  </TableWrapper>
);

const InvoiceEntriesCards = ({
  invoices,
  clientName,
  expandedInvoiceId,
  setExpandedInvoiceId,
  onEdit,
  onDelete,
  reducedMotion = false,
}: {
  invoices: Invoice[];
  clientName: (clientId: string) => string;
  expandedInvoiceId: string | null;
  setExpandedInvoiceId: (id: string | null) => void;
  onEdit: (invoice: Invoice) => void;
  onDelete: (id: string) => void;
  reducedMotion?: boolean;
}) => (
  <div className="divide-y divide-soft">
    {invoices.map((invoice, index) => {
      const duration = invoiceDuration(invoice);
      const coveredMonths = invoiceCoveredMonthText(invoice);
      const typeLabel = invoiceTypeLabel(invoice.invoiceType);
      const sourceLabel = receivedViaLabel(invoice.receivedVia);
      const expanded = expandedInvoiceId === invoice._id;
      return (
        <motion.div
          key={invoice._id}
          initial={reducedMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reducedMotion ? FADE_TRANSITION : { ...FADE_TRANSITION, delay: Math.min(index, 8) * 0.025 }}
        >
          <button
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover transition-colors"
            onClick={() => setExpandedInvoiceId(expanded ? null : invoice._id)}
          >
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-default truncate">{clientName(invoice.clientId)}</p>
              <p className="text-xs text-faint mt-0.5">
                <span className="font-mono">{formatDate(invoice.fromDate)}</span> to{" "}
                <span className="font-mono">{formatDate(invoice.toDate)}</span>
              </p>
              {(typeLabel || sourceLabel) && (
                <p className="text-xs text-muted mt-1">
                  {[typeLabel, sourceLabel].filter(Boolean).join(" - ")}
                </p>
              )}
            </div>
            <span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
              {invoice.financialYear}
            </span>
            <motion.span
              animate={reducedMotion ? false : { rotate: expanded ? 180 : 0 }}
              transition={EXPAND_TRANSITION}
              className="text-faint flex-shrink-0"
            >
              <ChevronDown className="w-4 h-4" />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                animate={reducedMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }}
                exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                transition={reducedMotion ? FADE_TRANSITION : EXPAND_TRANSITION}
                className="overflow-hidden"
              >
                <motion.div
                  initial={reducedMotion ? false : { y: -6, scale: 0.99 }}
                  animate={{ y: 0, scale: 1 }}
                  exit={reducedMotion ? undefined : { y: -4, scale: 0.995 }}
                  transition={EXPAND_TRANSITION}
                  className="px-4 pb-4 border-t border-soft pt-3 space-y-2"
                >
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-faint block">Duration</span>
                      <span className="text-default">{duration}</span>
                    </div>
                    <div>
                      <span className="text-faint block">Covered Months</span>
                      <span className="text-default">{coveredMonths}</span>
                    </div>
                    <div>
                      <span className="text-faint block">Invoice Type</span>
                      <span className="text-default">{typeLabel || "-"}</span>
                    </div>
                    <div>
                      <span className="text-faint block">Received Via</span>
                      <span className="text-default">{sourceLabel || "-"}</span>
                    </div>
                    <div>
                      <span className="text-faint block">Added On</span>
                      <span className="text-default">{formatDate(invoice.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(invoice)}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-brand-200 dark:border-brand-900/40 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />Edit
                    </button>
                    <button
                      onClick={() => onDelete(invoice._id)}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/40 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />Delete
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      );
    })}
  </div>
);

export default function InvoiceTrackingPage() {
  const prefersReducedMotion = useReducedMotion();
  const [fy, setFy, financialYearLoaded] = useFinancialYearState();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeView, setActiveView] = useState<InvoiceViewMode>("coverage");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [form, setForm] = useState({
    clientId: "",
    financialYear: fy,
    invoiceType: "",
    receivedVia: "",
    fromDate: "",
    toDate: "",
  });

  const { data: rawClients } = useCache<Client[]>("/api/clients");
  const clients = useMemo(() => (Array.isArray(rawClients) ? rawClients : []), [rawClients]);

  const trimmedDebouncedSearch = debouncedSearch.trim();
  const encodedSearch = encodeURIComponent(trimmedDebouncedSearch);
  const coverageUrl = `/api/invoices/coverage?fy=${encodeURIComponent(fy)}${trimmedDebouncedSearch ? `&search=${encodedSearch}` : ""}`;
  const entriesEnabled = activeView === "entries" || Boolean(selectedClientId) || Boolean(trimmedDebouncedSearch);
  const entriesUrl = selectedClientId
    ? `/api/invoices?fy=${encodeURIComponent(fy)}&clientId=${encodeURIComponent(selectedClientId)}`
    : `/api/invoices?fy=${encodeURIComponent(fy)}${trimmedDebouncedSearch ? `&search=${encodedSearch}` : ""}`;

  const { data: rawClientSummaries, loading: coverageLoading, refetch: refetchCoverage } = useCache<ClientInvoiceSummary[]>(coverageUrl, { enabled: financialYearLoaded });
  const clientSummaries = useMemo(
    () => (Array.isArray(rawClientSummaries) ? rawClientSummaries : []),
    [rawClientSummaries]
  );

  const { data: rawInvoices, loading: entriesLoading, refetch: refetchEntries } = useCache<Invoice[]>(
    entriesUrl,
    { enabled: financialYearLoaded && entriesEnabled }
  );
  const invoices = useMemo(() => (Array.isArray(rawInvoices) ? rawInvoices : []), [rawInvoices]);
  const showEntriesPanel = activeView === "entries" || Boolean(trimmedDebouncedSearch);

  const clientName = useCallback(
    (clientId: string) => clients.find((client) => client.clientId === clientId)?.companyName || clientId,
    [clients]
  );

  const selectedClientName = selectedClientId
    ? clientSummaries.find((summary) => summary.clientId === selectedClientId)?.companyName || clientName(selectedClientId)
    : "";

  useEffect(() => {
    setSelectedClientId(null);
    setExpandedInvoiceId(null);
  }, [fy]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [search]);

  const updateSearch = (value: string) => {
    setSearch(value);
    setSelectedClientId(null);
    setExpandedInvoiceId(null);
  };

  const showClientEntries = (clientId: string) => {
    setSelectedClientId((current) => (current === clientId ? null : clientId));
    setExpandedInvoiceId(null);
  };

  const clearEntryDrilldown = () => {
    setSelectedClientId(null);
    setExpandedInvoiceId(null);
  };

  const refreshInvoiceData = () => {
    invalidate("/api/invoices", "/api/trash");
    refetchCoverage();
    if (entriesEnabled) refetchEntries();
  };

  const openModal = () => {
    setEditingInvoiceId(null);
    setForm({ clientId: "", financialYear: fy, invoiceType: "", receivedVia: "", fromDate: "", toDate: "" });
    setModalOpen(true);
  };

  const openEditModal = (invoice: Invoice) => {
    setEditingInvoiceId(invoice._id);
    setForm({
      clientId: invoice.clientId,
      financialYear: invoice.financialYear,
      invoiceType: invoiceTypeFormValue(invoice.invoiceType),
      receivedVia: receivedViaFormValue(invoice.receivedVia),
      fromDate: invoice.fromDate ? new Date(invoice.fromDate).toISOString().slice(0, 10) : "",
      toDate: invoice.toDate ? new Date(invoice.toDate).toISOString().slice(0, 10) : "",
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingInvoiceId(null);
  };

  const submitInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(editingInvoiceId ? `/api/invoices/${editingInvoiceId}` : "/api/invoices", {
        method: editingInvoiceId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        toast.error(`Error ${editingInvoiceId ? "updating" : "saving"} invoice tracking record`);
        return;
      }

      toast.success(editingInvoiceId ? "Invoice tracking updated" : "Invoice tracking added");
      closeModal();
      refreshInvoiceData();
    } finally {
      setSaving(false);
    }
  };

  const deleteInvoice = async (id: string) => {
    if (!confirm("Delete this invoice tracking record?")) return;
    await fetch(`/api/invoices/${id}`, { method: "DELETE" });
    toast.success("Deleted");
    refreshInvoiceData();
  };

  return (
    <div>
      <PageHeader
        title="Invoice Tracking"
        description="Track which invoice periods clients have shared for CPCB portal upload"
      >
        <button className="glass-btn glass-btn-primary" onClick={openModal}>
          <Plus className="w-4 h-4" /> Add Invoice Tracking
        </button>
      </PageHeader>

      <FYTabBar value={fy} onChange={setFy} />

      <div className="bg-card border border-base rounded-2xl p-3 mb-4 shadow-sm flex items-center gap-2 transition-colors">
        <Search className="w-4 h-4 text-faint flex-shrink-0 ml-1" />
        <input
          className="bg-transparent border-0 ring-0 outline-none flex-1 py-1.5 text-sm text-default placeholder:text-faint"
          placeholder="Search by client name or ID..."
          value={search}
          onChange={(e) => updateSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => updateSearch("")} className="p-1 text-faint hover:text-default rounded transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="inline-flex bg-surface border border-base rounded-xl p-1 mb-4 shadow-sm">
        <button
          type="button"
          onClick={() => {
            setActiveView("coverage");
            setExpandedInvoiceId(null);
          }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeView === "coverage" ? "bg-card text-default shadow-sm" : "text-muted hover:text-default"
          }`}
        >
          <LayoutList className="w-4 h-4" />
          Coverage
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveView("entries");
            setSelectedClientId(null);
            setExpandedInvoiceId(null);
          }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeView === "entries" ? "bg-card text-default shadow-sm" : "text-muted hover:text-default"
          }`}
        >
          <Table2 className="w-4 h-4" />
          Entries
        </button>
      </div>

      {activeView === "coverage" && (
      <div className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden transition-colors mb-4">
        <div className="px-4 py-3 border-b border-soft flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-default">Financial year coverage</h2>
            <p className="text-xs text-muted mt-0.5">Sale and purchase month coverage is counted once per calendar month.</p>
          </div>
          <span className="text-xs font-medium text-faint bg-surface px-2 py-0.5 rounded-full whitespace-nowrap">
            {clientSummaries.length} client{clientSummaries.length === 1 ? "" : "s"}
          </span>
        </div>
        {coverageLoading ? <LoadingSpinner /> : clientSummaries.length === 0 ? (
          <EmptyState
            message={search.trim() ? `No coverage results for "${search}"` : "No coverage yet"}
            description="Add invoice tracking records to see sale and purchase month status"
          />
        ) : (
          <>
            <div className="hidden lg:block">
              <TableWrapper>
                <table className="w-full min-w-[980px]">
                  <thead>
                    <tr>
                      <th className="table-header">Company</th>
                      <th className="table-header">FY</th>
                      <th className="table-header">Sale Status</th>
                      <th className="table-header">Purchase Status</th>
                      <th className="table-header text-center">Entries</th>
                      <th className="table-header"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientSummaries.map((summary) => {
                      const expanded = selectedClientId === summary.clientId;
                      return (
                        <React.Fragment key={summary.clientId}>
                          <tr className={`hover:bg-hover border-t border-soft transition-colors duration-300 ${expanded ? "bg-brand-50/40 dark:bg-brand-900/10" : ""}`}>
                            <td className="table-cell">
                              <div className="font-medium text-default whitespace-nowrap">{summary.companyName}</div>
                              <div className="text-xs text-faint font-mono mt-0.5">{summary.clientId}</div>
                            </td>
                            <td className="table-cell whitespace-nowrap">
                              <span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 px-2 py-0.5 rounded-full font-medium">
                                {fy}
                              </span>
                            </td>
                            <td className="table-cell align-top">
                              <CoverageSummaryCell label="Sale" coverage={summary.coverage.sale} />
                            </td>
                            <td className="table-cell align-top">
                              <CoverageSummaryCell label="Purchase" coverage={summary.coverage.purchase} />
                            </td>
                            <td className="table-cell text-center text-sm text-muted whitespace-nowrap">{summary.invoiceCount}</td>
                            <td className="table-cell whitespace-nowrap">
                              <motion.button
                                type="button"
                                onClick={() => showClientEntries(summary.clientId)}
                                whileTap={prefersReducedMotion ? undefined : { scale: 0.94 }}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  expanded
                                    ? "text-brand-600 bg-brand-50 dark:bg-brand-900/25"
                                    : "text-faint hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"
                                }`}
                                title={`${expanded ? "Hide" : "View"} entries for ${summary.companyName}`}
                              >
                                <Eye className="w-4 h-4" />
                              </motion.button>
                            </td>
                          </tr>
                          <AnimatePresence initial={false}>
                          {expanded && (
                            <motion.tr
                              key={`${summary.clientId}-entries`}
                              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={FADE_TRANSITION}
                              className="border-t border-soft bg-surface/40"
                            >
                              <td colSpan={6} className="p-3">
                                <motion.div
                                  initial={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0, y: -8, scale: 0.992 }}
                                  animate={prefersReducedMotion ? { opacity: 1 } : { height: "auto", opacity: 1, y: 0, scale: 1 }}
                                  exit={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0, y: -6, scale: 0.996 }}
                                  transition={prefersReducedMotion ? FADE_TRANSITION : EXPAND_TRANSITION}
                                  className="overflow-hidden"
                                >
                                  <div className="rounded-xl border border-base bg-card overflow-hidden">
                                    <div className="px-4 py-2 border-b border-soft flex items-center justify-between">
                                      <div>
                                        <h3 className="text-sm font-semibold text-default">{summary.companyName} entries</h3>
                                        <p className="text-xs text-muted">Raw invoice tracking records for this client</p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={clearEntryDrilldown}
                                        className="p-1.5 text-faint hover:text-default hover:bg-hover rounded-lg transition-colors"
                                        title="Collapse entries"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                    <div>
                                      {entriesLoading ? <LoadingSpinner /> : invoices.length === 0 ? (
                                        <EmptyState message="No invoice entries for this client" />
                                      ) : (
                                        <InvoiceEntriesTable
                                          invoices={invoices}
                                          clientName={clientName}
                                          onEdit={openEditModal}
                                          onDelete={deleteInvoice}
                                          reducedMotion={Boolean(prefersReducedMotion)}
                                        />
                                      )}
                                    </div>
                                  </div>
                                </motion.div>
                              </td>
                            </motion.tr>
                          )}
                          </AnimatePresence>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrapper>
            </div>

            <div className="lg:hidden divide-y divide-soft">
              {clientSummaries.map((summary) => {
                const expanded = selectedClientId === summary.clientId;
                return (
                  <motion.div
                    key={summary.clientId}
                    layout={prefersReducedMotion ? false : "position"}
                    transition={EXPAND_TRANSITION}
                    className={`px-4 py-3 space-y-3 transition-colors duration-300 ${expanded ? "bg-brand-50/30 dark:bg-brand-900/10" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-default truncate">{summary.companyName}</p>
                        <p className="text-xs text-faint font-mono mt-0.5">{summary.clientId}</p>
                      </div>
                      <span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                        {summary.invoiceCount} entr{summary.invoiceCount === 1 ? "y" : "ies"}
                      </span>
                      <motion.button
                        type="button"
                        onClick={() => showClientEntries(summary.clientId)}
                        whileTap={prefersReducedMotion ? undefined : { scale: 0.94 }}
                        className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                          expanded
                            ? "text-brand-600 bg-brand-50 dark:bg-brand-900/25"
                            : "text-faint hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"
                        }`}
                        title={`${expanded ? "Hide" : "View"} entries for ${summary.companyName}`}
                      >
                        <Eye className="w-4 h-4" />
                      </motion.button>
                    </div>
                    <div className="space-y-3">
                      <CoverageSummaryCell label="Sale" coverage={summary.coverage.sale} />
                      <CoverageSummaryCell label="Purchase" coverage={summary.coverage.purchase} />
                    </div>
                    <AnimatePresence initial={false}>
                      {expanded && (
                        <motion.div
                          initial={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0, y: -8, scale: 0.992 }}
                          animate={prefersReducedMotion ? { opacity: 1 } : { height: "auto", opacity: 1, y: 0, scale: 1 }}
                          exit={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0, y: -6, scale: 0.996 }}
                          transition={prefersReducedMotion ? FADE_TRANSITION : EXPAND_TRANSITION}
                          className="overflow-hidden"
                        >
                          <div className="rounded-xl border border-base bg-card overflow-hidden">
                            <div className="px-4 py-2 border-b border-soft flex items-center justify-between">
                              <div>
                                <h3 className="text-sm font-semibold text-default">Entries</h3>
                                <p className="text-xs text-muted">Raw records for this client</p>
                              </div>
                              <button
                                type="button"
                                onClick={clearEntryDrilldown}
                                className="p-1.5 text-faint hover:text-default hover:bg-hover rounded-lg transition-colors"
                                title="Collapse entries"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            <div>
                              {entriesLoading ? <LoadingSpinner /> : invoices.length === 0 ? (
                                <EmptyState message="No invoice entries for this client" />
                              ) : (
                                <InvoiceEntriesCards
                                  invoices={invoices}
                                  clientName={clientName}
                                  expandedInvoiceId={expandedInvoiceId}
                                  setExpandedInvoiceId={setExpandedInvoiceId}
                                  onEdit={openEditModal}
                                  onDelete={deleteInvoice}
                                  reducedMotion={Boolean(prefersReducedMotion)}
                                />
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </div>
      )}

      <AnimatePresence initial={false}>
      {showEntriesPanel && (
        <motion.div
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.995 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.997 }}
          transition={prefersReducedMotion ? FADE_TRANSITION : EXPAND_TRANSITION}
          className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden transition-colors"
        >
          <div className="px-4 py-3 border-b border-soft flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-default">
                {selectedClientId ? `${selectedClientName} entries` : activeView === "entries" ? "Invoice entries" : "Matching invoice entries"}
              </h2>
            <p className="text-xs text-muted mt-0.5">
                {selectedClientId
                  ? "Raw invoice tracking records for the selected client"
                  : trimmedDebouncedSearch
                    ? "Raw invoice tracking records matching the current client search"
                    : "All raw invoice tracking records for the selected FY"}
              </p>
            </div>
            {selectedClientId && (
              <button
                type="button"
                onClick={clearEntryDrilldown}
                className="p-1.5 text-faint hover:text-default hover:bg-hover rounded-lg transition-colors"
                title="Clear selected client"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="hidden lg:block">
            {entriesLoading ? <LoadingSpinner /> : invoices.length === 0 ? (
              <EmptyState
                message={trimmedDebouncedSearch ? `No entries for "${debouncedSearch}"` : "No invoice tracking records for this FY"}
                description="Track which invoice periods have been received from clients"
              />
            ) : (
              <InvoiceEntriesTable
                invoices={invoices}
                clientName={clientName}
                onEdit={openEditModal}
                onDelete={deleteInvoice}
                reducedMotion={Boolean(prefersReducedMotion)}
              />
            )}
          </div>

          <div className="lg:hidden divide-y divide-soft">
            {entriesLoading ? <LoadingSpinner /> : invoices.length === 0 ? (
              <EmptyState message={trimmedDebouncedSearch ? `No entries for "${debouncedSearch}"` : "No invoice tracking records for this FY"} />
            ) : (
              <InvoiceEntriesCards
                invoices={invoices}
                clientName={clientName}
                expandedInvoiceId={expandedInvoiceId}
                setExpandedInvoiceId={setExpandedInvoiceId}
                onEdit={openEditModal}
                onDelete={deleteInvoice}
                reducedMotion={Boolean(prefersReducedMotion)}
              />
            )}
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      <Modal open={modalOpen} onClose={closeModal} title={editingInvoiceId ? "Edit Invoice Tracking" : "Add Invoice Tracking"}>
        <form onSubmit={submitInvoice} className="space-y-4">
          <div>
            <label className="label">Client *</label>
            <select
              className="input-field"
              value={form.clientId}
              onChange={(e) => setForm((current) => ({ ...current, clientId: e.target.value }))}
              required
            >
              <option value="">Select client</option>
              {clients.map((client) => (
                <option key={client.clientId} value={client.clientId}>{client.companyName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Financial Year *</label>
            <input className="input-field bg-surface text-faint" value={form.financialYear} readOnly />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Invoice Type *</label>
              <select
                className="input-field"
                value={form.invoiceType}
                onChange={(e) => setForm((current) => ({ ...current, invoiceType: e.target.value }))}
                required
              >
                <option value="">Select type</option>
                {INVOICE_TYPE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Received Via *</label>
              <select
                className="input-field"
                value={form.receivedVia}
                onChange={(e) => setForm((current) => ({ ...current, receivedVia: e.target.value }))}
                required
              >
                <option value="">Select source</option>
                {RECEIVED_VIA_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">From Date *</label>
              <input
                type="date"
                className="input-field"
                value={form.fromDate}
                onChange={(e) => setForm((current) => ({ ...current, fromDate: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label">To Date *</label>
              <input
                type="date"
                className="input-field"
                value={form.toDate}
                onChange={(e) => setForm((current) => ({ ...current, toDate: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2 border-t border-base">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving}>
              {saving ? "Saving..." : editingInvoiceId ? "Update Invoice Tracking" : "Add Invoice Tracking"}
            </button>
            <button type="button" className="btn-secondary" onClick={closeModal}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

"use client";
import React, { useCallback, useMemo, useState } from "react";
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
import { Plus, Search, X, Trash2, ChevronDown, Pencil } from "lucide-react";

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

const invoiceDuration = (fromDate: string, toDate: string) => {
  const start = new Date(fromDate);
  const end = new Date(toDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "";
  }

  const months =
    ((end.getUTCFullYear() - start.getUTCFullYear()) * 12) +
    (end.getUTCMonth() - start.getUTCMonth()) +
    1;
  const safeMonths = Math.max(months, 1);
  const endOfEndMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  const isFullMonthCoverage = start.getUTCDate() === 1 && end.getUTCDate() === endOfEndMonth;
  const prefix = isFullMonthCoverage ? "" : "~";

  return `${prefix}${safeMonths} month${safeMonths === 1 ? "" : "s"}`;
};

export default function InvoiceTrackingPage() {
  const [fy, setFy] = useFinancialYearState();
  const [search, setSearch] = useState("");
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

  const { data: rawInvoices, loading, refetch } = useCache<Invoice[]>(`/api/invoices?fy=${fy}`);
  const invoices = useMemo(() => (Array.isArray(rawInvoices) ? rawInvoices : []), [rawInvoices]);

  const clientName = useCallback(
    (clientId: string) => clients.find((client) => client.clientId === clientId)?.companyName || clientId,
    [clients]
  );

  const filteredInvoices = useMemo(() => {
    if (!search.trim()) return invoices;
    const query = search.toLowerCase();
    return invoices.filter((invoice) =>
      clientName(invoice.clientId).toLowerCase().includes(query) ||
      invoice.clientId.toLowerCase().includes(query) ||
      invoiceTypeLabel(invoice.invoiceType).toLowerCase().includes(query) ||
      receivedViaLabel(invoice.receivedVia).toLowerCase().includes(query) ||
      formatDate(invoice.fromDate).toLowerCase().includes(query) ||
      formatDate(invoice.toDate).toLowerCase().includes(query)
    );
  }, [invoices, search, clientName]);

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
      invalidate("/api/invoices");
      closeModal();
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const deleteInvoice = async (id: string) => {
    if (!confirm("Delete this invoice tracking record?")) return;
    await fetch(`/api/invoices/${id}`, { method: "DELETE" });
    toast.success("Deleted");
    invalidate("/api/invoices");
    refetch();
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
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch("")} className="p-1 text-faint hover:text-default rounded transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="hidden lg:block bg-card border border-base rounded-2xl shadow-sm overflow-hidden transition-colors">
        {loading ? <LoadingSpinner /> : invoices.length === 0 ? (
          <EmptyState
            message="No invoice tracking records for this FY"
            description="Track which invoice periods have been received from clients"
          />
        ) : (
          <TableWrapper>
            <table className="w-full min-w-[820px]">
              <thead>
                <tr>
                  <th className="table-header">Company</th>
                  <th className="table-header">FY</th>
                  <th className="table-header">Invoice Type</th>
                  <th className="table-header">Received Via</th>
                  <th className="table-header">From Date</th>
                  <th className="table-header">To Date</th>
                  <th className="table-header">Duration</th>
                  <th className="table-header">Added On</th>
                  <th className="table-header"></th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-sm text-faint">
                      No results for &quot;{search}&quot;
                    </td>
                  </tr>
                ) : filteredInvoices.map((invoice) => {
                  const duration = invoiceDuration(invoice.fromDate, invoice.toDate);
                  return (
                    <tr key={invoice._id} className="hover:bg-hover border-t border-soft transition-colors">
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
                      <td className="table-cell text-muted text-sm whitespace-nowrap">{formatDate(invoice.createdAt)}</td>
                      <td className="table-cell whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(invoice)}
                            className="p-1.5 text-faint hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors"
                            title="Edit invoice tracking"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteInvoice(invoice._id)}
                            className="p-1.5 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title="Delete invoice tracking"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrapper>
        )}
      </div>

      <div className="lg:hidden space-y-2">
        {loading ? <LoadingSpinner /> : invoices.length === 0 ? (
          <EmptyState message="No invoice tracking records for this FY" />
        ) : filteredInvoices.length === 0 ? (
          <EmptyState message={`No results for "${search}"`} description="Try a different search term" />
        ) : filteredInvoices.map((invoice) => {
          const duration = invoiceDuration(invoice.fromDate, invoice.toDate);
          const typeLabel = invoiceTypeLabel(invoice.invoiceType);
          const sourceLabel = receivedViaLabel(invoice.receivedVia);
          const expanded = expandedInvoiceId === invoice._id;
          return (
            <div key={invoice._id} className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden">
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
                <ChevronDown className="w-4 h-4 text-faint flex-shrink-0 transition-transform duration-200" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }} />
              </button>
              {expanded && (
                <div className="card-expand px-4 pb-4 border-t border-soft pt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-faint block">Duration</span>
                      <span className="text-default">{duration}</span>
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
                      onClick={() => openEditModal(invoice)}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-brand-200 dark:border-brand-900/40 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />Edit
                    </button>
                    <button
                      onClick={() => deleteInvoice(invoice._id)}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/40 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

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

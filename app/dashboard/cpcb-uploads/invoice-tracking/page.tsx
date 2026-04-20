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
import { Plus, Search, X, Trash2, ChevronDown } from "lucide-react";

interface Client {
  clientId: string;
  companyName: string;
}

interface Invoice {
  _id: string;
  clientId: string;
  financialYear: string;
  fromDate: string;
  toDate: string;
  createdAt: string;
}

export default function InvoiceTrackingPage() {
  const [fy, setFy] = useFinancialYearState();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [form, setForm] = useState({
    clientId: "",
    financialYear: fy,
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
      formatDate(invoice.fromDate).toLowerCase().includes(query) ||
      formatDate(invoice.toDate).toLowerCase().includes(query)
    );
  }, [invoices, search, clientName]);

  const openModal = () => {
    setForm({ clientId: "", financialYear: fy, fromDate: "", toDate: "" });
    setModalOpen(true);
  };

  const submitInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        toast.error("Error saving invoice tracking record");
        return;
      }

      toast.success("Invoice tracking added");
      invalidate("/api/invoices");
      setModalOpen(false);
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
        <button className="btn-primary" onClick={openModal}>
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
            <table className="w-full min-w-[600px]">
              <thead>
                <tr>
                  <th className="table-header">Company</th>
                  <th className="table-header">FY</th>
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
                    <td colSpan={7} className="py-8 text-center text-sm text-faint">
                      No results for &quot;{search}&quot;
                    </td>
                  </tr>
                ) : filteredInvoices.map((invoice) => {
                  const days = Math.ceil((new Date(invoice.toDate).getTime() - new Date(invoice.fromDate).getTime()) / 86400000);
                  const months = Math.ceil(days / 30);
                  return (
                    <tr key={invoice._id} className="hover:bg-hover border-t border-soft transition-colors">
                      <td className="table-cell font-medium whitespace-nowrap">{clientName(invoice.clientId)}</td>
                      <td className="table-cell whitespace-nowrap">
                        <span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 px-2 py-0.5 rounded-full font-medium">
                          {invoice.financialYear}
                        </span>
                      </td>
                      <td className="table-cell font-mono text-sm whitespace-nowrap">{formatDate(invoice.fromDate)}</td>
                      <td className="table-cell font-mono text-sm whitespace-nowrap">{formatDate(invoice.toDate)}</td>
                      <td className="table-cell text-muted text-sm whitespace-nowrap">~{months} month{months !== 1 ? "s" : ""}</td>
                      <td className="table-cell text-muted text-sm whitespace-nowrap">{formatDate(invoice.createdAt)}</td>
                      <td className="table-cell whitespace-nowrap">
                        <button
                          onClick={() => deleteInvoice(invoice._id)}
                          className="p-1.5 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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
          const days = Math.ceil((new Date(invoice.toDate).getTime() - new Date(invoice.fromDate).getTime()) / 86400000);
          const months = Math.ceil(days / 30);
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
                      <span className="text-default">~{months} month{months !== 1 ? "s" : ""}</span>
                    </div>
                    <div>
                      <span className="text-faint block">Added On</span>
                      <span className="text-default">{formatDate(invoice.createdAt)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteInvoice(invoice._id)}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/40 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Invoice Tracking">
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
              {saving ? "Saving..." : "Add Invoice Tracking"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

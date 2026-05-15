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
import { Plus, Search, X, Trash2, ChevronDown, LayoutList, Table2 } from "lucide-react";

interface Client {
  clientId: string;
  companyName: string;
}

interface UploadRecord {
  _id: string;
  clientId: string;
  financialYear: string;
  uploadType?: "sale" | "purchase";
  cat1?: number;
  cat2?: number;
  cat3?: number;
  cat4?: number;
  invoiceCount?: number;
  createdAt: string;
}

type UploadViewMode = "summary" | "entries";
type UploadType = "sale" | "purchase";

type UploadTotals = {
  cat1: number;
  cat2: number;
  cat3: number;
  cat4: number;
  total: number;
  invoiceCount: number;
};

type UploadSummary = {
  clientId: string;
  companyName: string;
  entryCount: number;
  sale: UploadTotals;
  purchase: UploadTotals;
  grandTotal: number;
  grandInvoiceCount: number;
};

const UPLOAD_TYPE_OPTIONS = [
  { id: "sale", label: "Sale" },
  { id: "purchase", label: "Purchase" },
] as const;

const emptyTotals = (): UploadTotals => ({
  cat1: 0,
  cat2: 0,
  cat3: 0,
  cat4: 0,
  total: 0,
  invoiceCount: 0,
});

const uploadTypeLabel = (value?: string) => (value === "purchase" ? "Purchase" : "Sale");

const numberText = (value: number) => value.toLocaleString("en-IN");

const recordTotal = (record: UploadRecord) => (
  (record.cat1 || 0) + (record.cat2 || 0) + (record.cat3 || 0) + (record.cat4 || 0)
);

const addRecordToTotals = (totals: UploadTotals, record: UploadRecord) => {
  totals.cat1 += record.cat1 || 0;
  totals.cat2 += record.cat2 || 0;
  totals.cat3 += record.cat3 || 0;
  totals.cat4 += record.cat4 || 0;
  totals.total += recordTotal(record);
  totals.invoiceCount += record.invoiceCount || 0;
};

const TypeSummary = ({ label, totals }: { label: string; totals: UploadTotals }) => (
  <div className="min-w-[260px] space-y-2">
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-semibold text-default">{label}</span>
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">
        {numberText(totals.total)} total
      </span>
    </div>
    <div className="grid grid-cols-4 gap-1 text-center">
      {[
        ["CAT-I", totals.cat1],
        ["CAT-II", totals.cat2],
        ["CAT-III", totals.cat3],
        ["CAT-IV", totals.cat4],
      ].map(([labelText, value]) => (
        <div key={String(labelText)} className="rounded-md border border-soft bg-surface px-1.5 py-1.5">
          <div className="text-[10px] text-faint">{labelText}</div>
          <div className="font-mono text-xs font-semibold text-default">{numberText(Number(value))}</div>
        </div>
      ))}
    </div>
    <p className="text-xs text-muted">
      Invoices uploaded: <span className="font-semibold text-default">{numberText(totals.invoiceCount)}</span>
    </p>
  </div>
);

const SummaryMetric = ({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) => (
  <div className="min-w-[120px] space-y-2 text-right">
    <div className="text-sm font-semibold text-default">{label}</div>
    <div className={`font-mono text-base font-bold ${accent ? "text-teal-600" : "text-default"}`}>
      {numberText(value)}
    </div>
  </div>
);

export default function UploadRecordsPage() {
  const [fy, setFy, financialYearLoaded] = useFinancialYearState();
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState<UploadViewMode>("summary");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedUploadId, setExpandedUploadId] = useState<string | null>(null);
  const [form, setForm] = useState({
    clientId: "",
    financialYear: fy,
    uploadType: "sale" as UploadType,
    cat1: "0",
    cat2: "0",
    cat3: "0",
    cat4: "0",
    invoiceCount: "0",
  });

  const { data: rawClients } = useCache<Client[]>("/api/clients");
  const clients = useMemo(() => (Array.isArray(rawClients) ? rawClients : []), [rawClients]);

  const { data: rawUploads, loading, refetch } = useCache<UploadRecord[]>(`/api/upload-records?fy=${fy}`, { enabled: financialYearLoaded });
  const uploads = useMemo(() => (Array.isArray(rawUploads) ? rawUploads : []), [rawUploads]);

  const clientName = useCallback(
    (clientId: string) => clients.find((client) => client.clientId === clientId)?.companyName || clientId,
    [clients]
  );

  const filteredUploads = useMemo(() => {
    if (!search.trim()) return uploads;
    const query = search.toLowerCase();
    return uploads.filter((upload) =>
      clientName(upload.clientId).toLowerCase().includes(query) ||
      upload.clientId.toLowerCase().includes(query) ||
      uploadTypeLabel(upload.uploadType).toLowerCase().includes(query)
    );
  }, [uploads, search, clientName]);

  const uploadSummaries = useMemo<UploadSummary[]>(() => {
    const grouped = new Map<string, UploadRecord[]>();
    filteredUploads.forEach((upload) => {
      const existing = grouped.get(upload.clientId) || [];
      existing.push(upload);
      grouped.set(upload.clientId, existing);
    });

    return Array.from(grouped.entries())
      .map(([clientId, entries]) => {
        const sale = emptyTotals();
        const purchase = emptyTotals();
        entries.forEach((entry) => addRecordToTotals(entry.uploadType === "purchase" ? purchase : sale, entry));
        return {
          clientId,
          companyName: clientName(clientId),
          entryCount: entries.length,
          sale,
          purchase,
          grandTotal: sale.total + purchase.total,
          grandInvoiceCount: sale.invoiceCount + purchase.invoiceCount,
        };
      })
      .sort((a, b) => a.companyName.localeCompare(b.companyName));
  }, [filteredUploads, clientName]);

  const openModal = () => {
    setForm({
      clientId: "",
      financialYear: fy,
      uploadType: "sale",
      cat1: "0",
      cat2: "0",
      cat3: "0",
      cat4: "0",
      invoiceCount: "0",
    });
    setModalOpen(true);
  };

  const submitUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/upload-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          cat1: Number(form.cat1),
          cat2: Number(form.cat2),
          cat3: Number(form.cat3),
          cat4: Number(form.cat4),
          invoiceCount: Number(form.invoiceCount),
        }),
      });

      if (!response.ok) {
        toast.error("Error saving upload record");
        return;
      }

      toast.success("Upload record added");
      invalidate("/api/upload-records", "/api/trash");
      setModalOpen(false);
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const deleteUpload = async (id: string) => {
    if (!confirm("Delete this upload record?")) return;
    await fetch(`/api/upload-records/${id}`, { method: "DELETE" });
    toast.success("Deleted");
    invalidate("/api/upload-records", "/api/trash");
    refetch();
  };

  return (
    <div>
      <PageHeader
        title="Upload Records"
        description="Track sale and purchase invoice uploads on the CPCB EPR portal"
      >
        <button className="glass-btn glass-btn-primary" onClick={openModal}>
          <Plus className="w-4 h-4" /> Add Upload Record
        </button>
      </PageHeader>

      <FYTabBar value={fy} onChange={setFy} />

      <div className="bg-card border border-base rounded-2xl p-3 mb-4 shadow-sm flex items-center gap-2 transition-colors">
        <Search className="w-4 h-4 text-faint flex-shrink-0 ml-1" />
        <input
          className="bg-transparent border-0 ring-0 outline-none flex-1 py-1.5 text-sm text-default placeholder:text-faint"
          placeholder="Search by client name, ID, sale, or purchase..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch("")} className="p-1 text-faint hover:text-default rounded transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="inline-flex bg-surface border border-base rounded-xl p-1 mb-4 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveView("summary")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeView === "summary" ? "bg-card text-default shadow-sm" : "text-muted hover:text-default"
          }`}
        >
          <LayoutList className="w-4 h-4" />
          Summary
        </button>
        <button
          type="button"
          onClick={() => setActiveView("entries")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeView === "entries" ? "bg-card text-default shadow-sm" : "text-muted hover:text-default"
          }`}
        >
          <Table2 className="w-4 h-4" />
          Entries
        </button>
      </div>

      {activeView === "summary" ? (
        <div className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden transition-colors">
          <div className="px-4 py-3 border-b border-soft flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-default">Client upload summary</h2>
              <p className="text-xs text-muted mt-0.5">Multiple entries are added together per client and split by Sale/Purchase.</p>
            </div>
            <span className="text-xs font-medium text-faint bg-surface px-2 py-0.5 rounded-full whitespace-nowrap">
              {uploadSummaries.length} client{uploadSummaries.length === 1 ? "" : "s"}
            </span>
          </div>

          {loading ? <LoadingSpinner /> : uploadSummaries.length === 0 ? (
            <EmptyState
              message={search.trim() ? `No upload summary results for "${search}"` : "No upload records for this FY"}
              description="Add upload records to see sale and purchase totals"
            />
          ) : (
            <>
              <div className="hidden lg:block">
                <TableWrapper>
                  <table className="w-full min-w-[1040px]">
                    <thead>
                      <tr>
                        <th className="table-header">Company</th>
                        <th className="table-header">FY</th>
                        <th className="table-header">Sale</th>
                        <th className="table-header">Purchase</th>
                        <th className="table-header text-right">Grand Total</th>
                        <th className="table-header text-right">Total Invoices</th>
                        <th className="table-header text-center">Entries</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploadSummaries.map((summary) => (
                        <tr key={summary.clientId} className="hover:bg-hover border-t border-soft transition-colors">
                          <td className="table-cell">
                            <div className="font-medium text-default whitespace-nowrap">{summary.companyName}</div>
                            <div className="text-xs text-faint font-mono mt-0.5">{summary.clientId}</div>
                          </td>
                          <td className="table-cell whitespace-nowrap">
                            <span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 px-2 py-0.5 rounded-full font-medium">
                              {fy}
                            </span>
                          </td>
                          <td className="table-cell align-top"><TypeSummary label="Sale" totals={summary.sale} /></td>
                          <td className="table-cell align-top"><TypeSummary label="Purchase" totals={summary.purchase} /></td>
                          <td className="table-cell align-top text-right whitespace-nowrap">
                            <SummaryMetric label="Grand Total" value={summary.grandTotal} accent />
                          </td>
                          <td className="table-cell align-top text-right whitespace-nowrap">
                            <SummaryMetric label="Total Invoices" value={summary.grandInvoiceCount} />
                          </td>
                          <td className="table-cell text-center text-sm text-muted whitespace-nowrap">{summary.entryCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrapper>
              </div>

              <div className="lg:hidden divide-y divide-soft">
                {uploadSummaries.map((summary) => (
                  <div key={summary.clientId} className="px-4 py-3 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-default truncate">{summary.companyName}</p>
                        <p className="text-xs text-faint font-mono mt-0.5">{summary.clientId}</p>
                      </div>
                      <span className="text-xs bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                        {numberText(summary.grandTotal)}
                      </span>
                    </div>
                    <TypeSummary label="Sale" totals={summary.sale} />
                    <TypeSummary label="Purchase" totals={summary.purchase} />
                    <div className="flex items-center justify-between text-xs text-muted pt-2 border-t border-soft">
                      <span>{summary.entryCount} entr{summary.entryCount === 1 ? "y" : "ies"}</span>
                      <span>{numberText(summary.grandInvoiceCount)} invoices</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden transition-colors">
          {loading ? <LoadingSpinner /> : uploads.length === 0 ? (
            <EmptyState message="No upload records for this FY" />
          ) : (
            <>
              <div className="hidden lg:block">
                <TableWrapper>
                  <table className="w-full min-w-[860px]">
                    <thead>
                      <tr>
                        <th className="table-header">Company</th>
                        <th className="table-header">FY</th>
                        <th className="table-header">Type</th>
                        <th className="table-header">CAT-I</th>
                        <th className="table-header">CAT-II</th>
                        <th className="table-header">CAT-III</th>
                        <th className="table-header">CAT-IV</th>
                        <th className="table-header">Total Qty</th>
                        <th className="table-header">Invoices</th>
                        <th className="table-header">Added On</th>
                        <th className="table-header"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUploads.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="py-8 text-center text-sm text-faint">
                            No results for &quot;{search}&quot;
                          </td>
                        </tr>
                      ) : filteredUploads.map((upload) => {
                        const total = recordTotal(upload);
                        return (
                          <tr key={upload._id} className="hover:bg-hover border-t border-soft transition-colors">
                            <td className="table-cell font-medium whitespace-nowrap">{clientName(upload.clientId)}</td>
                            <td className="table-cell whitespace-nowrap">
                              <span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 px-2 py-0.5 rounded-full font-medium">
                                {upload.financialYear}
                              </span>
                            </td>
                            <td className="table-cell text-sm whitespace-nowrap">{uploadTypeLabel(upload.uploadType)}</td>
                            <td className="table-cell font-mono text-sm whitespace-nowrap">{numberText(upload.cat1 || 0)}</td>
                            <td className="table-cell font-mono text-sm whitespace-nowrap">{numberText(upload.cat2 || 0)}</td>
                            <td className="table-cell font-mono text-sm whitespace-nowrap">{numberText(upload.cat3 || 0)}</td>
                            <td className="table-cell font-mono text-sm whitespace-nowrap">{numberText(upload.cat4 || 0)}</td>
                            <td className="table-cell font-bold text-teal-600 whitespace-nowrap">{numberText(total)}</td>
                            <td className="table-cell font-mono text-sm whitespace-nowrap">{numberText(upload.invoiceCount || 0)}</td>
                            <td className="table-cell text-muted text-sm whitespace-nowrap">{formatDate(upload.createdAt)}</td>
                            <td className="table-cell whitespace-nowrap">
                              <button
                                onClick={() => deleteUpload(upload._id)}
                                className="p-1.5 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                title="Delete upload record"
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
              </div>

              <div className="lg:hidden space-y-2 p-0">
                {filteredUploads.length === 0 ? (
                  <EmptyState message={`No results for "${search}"`} description="Try a different search term" />
                ) : filteredUploads.map((upload) => {
                  const total = recordTotal(upload);
                  const expanded = expandedUploadId === upload._id;
                  return (
                    <div key={upload._id} className="bg-card border-b border-soft last:border-b-0 overflow-hidden">
                      <button
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover transition-colors"
                        onClick={() => setExpandedUploadId(expanded ? null : upload._id)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-default truncate">{clientName(upload.clientId)}</p>
                          <p className="text-xs text-faint mt-0.5">
                            {uploadTypeLabel(upload.uploadType)} - <span className="font-bold text-teal-600">{numberText(total)}</span> units - {numberText(upload.invoiceCount || 0)} invoices
                          </p>
                        </div>
                        <span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                          {upload.financialYear}
                        </span>
                        <ChevronDown className="w-4 h-4 text-faint flex-shrink-0 transition-transform duration-200" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }} />
                      </button>
                      {expanded && (
                        <div className="card-expand px-4 pb-4 border-t border-soft pt-3 space-y-2">
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {[
                              ["CAT-I", upload.cat1 || 0],
                              ["CAT-II", upload.cat2 || 0],
                              ["CAT-III", upload.cat3 || 0],
                              ["CAT-IV", upload.cat4 || 0],
                              ["Invoices", upload.invoiceCount || 0],
                            ].map(([label, value]) => (
                              <div key={String(label)}>
                                <span className="text-faint block">{label}</span>
                                <span className="font-mono font-semibold text-default">{numberText(Number(value))}</span>
                              </div>
                            ))}
                            <div>
                              <span className="text-faint block">Added On</span>
                              <span className="text-default">{formatDate(upload.createdAt)}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => deleteUpload(upload._id)}
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
            </>
          )}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Upload Record">
        <form onSubmit={submitUpload} className="space-y-4">
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
              <label className="label">Upload Type *</label>
              <select
                className="input-field"
                value={form.uploadType}
                onChange={(e) => setForm((current) => ({ ...current, uploadType: e.target.value as UploadType }))}
                required
              >
                {UPLOAD_TYPE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Number of Invoices *</label>
              <input
                type="number"
                min="0"
                className="input-field font-mono"
                value={form.invoiceCount}
                onChange={(e) => setForm((current) => ({ ...current, invoiceCount: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">CAT-I</label>
              <input type="number" min="0" className="input-field font-mono" value={form.cat1} onChange={(e) => setForm((current) => ({ ...current, cat1: e.target.value }))} />
            </div>
            <div>
              <label className="label">CAT-II</label>
              <input type="number" min="0" className="input-field font-mono" value={form.cat2} onChange={(e) => setForm((current) => ({ ...current, cat2: e.target.value }))} />
            </div>
            <div>
              <label className="label">CAT-III</label>
              <input type="number" min="0" className="input-field font-mono" value={form.cat3} onChange={(e) => setForm((current) => ({ ...current, cat3: e.target.value }))} />
            </div>
            <div>
              <label className="label">CAT-IV</label>
              <input type="number" min="0" className="input-field font-mono" value={form.cat4} onChange={(e) => setForm((current) => ({ ...current, cat4: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 pt-2 border-t border-base">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving}>
              {saving ? "Saving..." : "Add Upload Record"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

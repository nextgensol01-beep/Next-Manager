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

interface UploadRecord {
  _id: string;
  clientId: string;
  financialYear: string;
  cat1?: number;
  cat2?: number;
  cat3?: number;
  cat4?: number;
  createdAt: string;
}

export default function UploadRecordsPage() {
  const [fy, setFy] = useFinancialYearState();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedUploadId, setExpandedUploadId] = useState<string | null>(null);
  const [form, setForm] = useState({
    clientId: "",
    financialYear: fy,
    cat1: "0",
    cat2: "0",
    cat3: "0",
    cat4: "0",
  });

  const { data: rawClients } = useCache<Client[]>("/api/clients");
  const clients = useMemo(() => (Array.isArray(rawClients) ? rawClients : []), [rawClients]);

  const { data: rawUploads, loading, refetch } = useCache<UploadRecord[]>(`/api/upload-records?fy=${fy}`);
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
      upload.clientId.toLowerCase().includes(query)
    );
  }, [uploads, search, clientName]);

  const openModal = () => {
    setForm({
      clientId: "",
      financialYear: fy,
      cat1: "0",
      cat2: "0",
      cat3: "0",
      cat4: "0",
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
        }),
      });

      if (!response.ok) {
        toast.error("Error saving upload record");
        return;
      }

      toast.success("Upload record added");
      invalidate("/api/upload-records");
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
    invalidate("/api/upload-records");
    refetch();
  };

  return (
    <div>
      <PageHeader
        title="Upload Records"
        description="Track how many client invoices have been uploaded on the CPCB EPR portal"
      >
        <button className="btn-primary" onClick={openModal}>
          <Plus className="w-4 h-4" /> Add Upload Record
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
        {loading ? <LoadingSpinner /> : uploads.length === 0 ? (
          <EmptyState message="No upload records for this FY" />
        ) : (
          <TableWrapper>
            <table className="w-full min-w-[600px]">
              <thead>
                <tr>
                  <th className="table-header">Company</th>
                  <th className="table-header">FY</th>
                  <th className="table-header">CAT-I</th>
                  <th className="table-header">CAT-II</th>
                  <th className="table-header">CAT-III</th>
                  <th className="table-header">CAT-IV</th>
                  <th className="table-header">Total</th>
                  <th className="table-header">Added On</th>
                  <th className="table-header"></th>
                </tr>
              </thead>
              <tbody>
                {filteredUploads.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-sm text-faint">
                      No results for &quot;{search}&quot;
                    </td>
                  </tr>
                ) : filteredUploads.map((upload) => {
                  const total = (upload.cat1 || 0) + (upload.cat2 || 0) + (upload.cat3 || 0) + (upload.cat4 || 0);
                  return (
                    <tr key={upload._id} className="hover:bg-hover border-t border-soft transition-colors">
                      <td className="table-cell font-medium whitespace-nowrap">{clientName(upload.clientId)}</td>
                      <td className="table-cell whitespace-nowrap">
                        <span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 px-2 py-0.5 rounded-full font-medium">
                          {upload.financialYear}
                        </span>
                      </td>
                      <td className="table-cell font-mono text-sm whitespace-nowrap">{(upload.cat1 || 0).toLocaleString()}</td>
                      <td className="table-cell font-mono text-sm whitespace-nowrap">{(upload.cat2 || 0).toLocaleString()}</td>
                      <td className="table-cell font-mono text-sm whitespace-nowrap">{(upload.cat3 || 0).toLocaleString()}</td>
                      <td className="table-cell font-mono text-sm whitespace-nowrap">{(upload.cat4 || 0).toLocaleString()}</td>
                      <td className="table-cell font-bold text-teal-600 whitespace-nowrap">{total.toLocaleString()}</td>
                      <td className="table-cell text-muted text-sm whitespace-nowrap">{formatDate(upload.createdAt)}</td>
                      <td className="table-cell whitespace-nowrap">
                        <button
                          onClick={() => deleteUpload(upload._id)}
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
        {loading ? <LoadingSpinner /> : uploads.length === 0 ? (
          <EmptyState message="No upload records for this FY" />
        ) : filteredUploads.length === 0 ? (
          <EmptyState message={`No results for "${search}"`} description="Try a different search term" />
        ) : filteredUploads.map((upload) => {
          const total = (upload.cat1 || 0) + (upload.cat2 || 0) + (upload.cat3 || 0) + (upload.cat4 || 0);
          const expanded = expandedUploadId === upload._id;
          return (
            <div key={upload._id} className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden">
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover transition-colors"
                onClick={() => setExpandedUploadId(expanded ? null : upload._id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-default truncate">{clientName(upload.clientId)}</p>
                  <p className="text-xs text-faint mt-0.5">
                    Total: <span className="font-bold text-teal-600">{total.toLocaleString()}</span> units
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
                    ].map(([label, value]) => (
                      <div key={String(label)}>
                        <span className="text-faint block">{label}</span>
                        <span className="font-mono font-semibold text-default">{Number(value).toLocaleString()}</span>
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

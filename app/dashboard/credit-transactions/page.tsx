"use client";
import React, { useState } from "react";
import { useCache, invalidate } from "@/lib/useCache";
import toast from "react-hot-toast";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import TableWrapper from "@/components/ui/TableWrapper";
import EmptyState from "@/components/ui/EmptyState";
import { FINANCIAL_YEARS, CURRENT_FY, formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Trash2, FileText, Upload, ArrowLeftRight, Recycle, Leaf, ChevronDown } from "lucide-react";
import FYTabBar from "@/components/ui/FYTabBar";

interface Client { clientId: string; companyName: string; category: string; }
interface Transaction {
  _id: string; financialYear: string; creditType?: string;
  fromClientId?: string; toClientId?: string;
  cat1?: number; cat2?: number; cat3?: number; cat4?: number;
  rateCat1?: number; rateCat2?: number; rateCat3?: number; rateCat4?: number;
  totalAmount: number; date: string; notes?: string;
}
interface Invoice { _id: string; clientId: string; financialYear: string; fromDate: string; toDate: string; createdAt: string; }
interface UploadRecord { _id: string; clientId: string; financialYear: string; cat1?: number; cat2?: number; cat3?: number; cat4?: number; createdAt: string; }

const CATS = ["CAT-I", "CAT-II", "CAT-III", "CAT-IV"] as const;
const CAT_KEYS = ["cat1", "cat2", "cat3", "cat4"] as const;
type ActiveSection = "transactions" | "invoices" | "uploads";

const CREDIT_TYPES = [
  { value: "Recycling", label: "Recycling", icon: "♻️" },
  { value: "EOL", label: "End of Life (E.O.L)", icon: "🔄" },
];

export default function CreditTransactionsPage() {
  const [activeSection, setActiveSection] = useState<ActiveSection>("transactions");
  const [fy, setFy] = useState(CURRENT_FY);
  const [creditTypeFilter, setCreditTypeFilter] = useState<string>("all");

  // Transactions
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [expandedTx, setExpandedTx] = useState<Set<string>>(new Set());
  const [expandedInv, setExpandedInv] = useState<string | null>(null);
  const [expandedUpl, setExpandedUpl] = useState<string | null>(null);
  const toggleTx = (id: string) => setExpandedTx(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const [txSaving, setTxSaving] = useState(false);
  const [txForm, setTxForm] = useState({
    financialYear: CURRENT_FY, fromClientId: "", toClientId: "", creditType: "Recycling",
    cat1: "0", cat2: "0", cat3: "0", cat4: "0",
    rateCat1: "0", rateCat2: "0", rateCat3: "0", rateCat4: "0",
    date: new Date().toISOString().split("T")[0], notes: "",
  });

  // Invoices
  const [invModalOpen, setInvModalOpen] = useState(false);
  const [invSaving, setInvSaving] = useState(false);
  const [invForm, setInvForm] = useState({ clientId: "", financialYear: CURRENT_FY, fromDate: "", toDate: "" });

  // Uploads
  const [uplModalOpen, setUplModalOpen] = useState(false);
  const [uplSaving, setUplSaving] = useState(false);
  const [uplForm, setUplForm] = useState({ clientId: "", financialYear: CURRENT_FY, cat1: "0", cat2: "0", cat3: "0", cat4: "0" });

  const { data: rawClients } = useCache<Client[]>("/api/clients");
  const clients = Array.isArray(rawClients) ? rawClients : [];

  const txUrl = `/api/credit-transactions?${new URLSearchParams({ fy, ...(creditTypeFilter !== "all" ? { creditType: creditTypeFilter } : {}) })}`;
  const { data: rawTx, loading: txLoading, refetch: refetchTransactions } = useCache<Transaction[]>(txUrl);
  const transactions = Array.isArray(rawTx) ? rawTx : [];

  const { data: rawInvoices, loading: invLoading, refetch: refetchInvoices } = useCache<Invoice[]>(`/api/invoices?fy=${fy}`, { enabled: activeSection === "invoices" });
  const invoices = Array.isArray(rawInvoices) ? rawInvoices : [];

  const { data: rawUploads, loading: uplLoading, refetch: refetchUploads } = useCache<UploadRecord[]>(`/api/upload-records?fy=${fy}`, { enabled: activeSection === "uploads" });
  const uploads = Array.isArray(rawUploads) ? rawUploads : [];

  const clientName = (id?: string) => id ? (clients.find((c) => c.clientId === id)?.companyName || id) : "External";
  const pwpClients = clients.filter((c) => c.category === "PWP");
  const nonPwpClients = clients.filter((c) => c.category !== "PWP");
  const totalTxAmount = transactions.reduce((s, t) => s + t.totalAmount, 0);
  const totalTxQty = transactions.reduce((s, t) => s + (t.cat1 || 0) + (t.cat2 || 0) + (t.cat3 || 0) + (t.cat4 || 0), 0);
  const liveTxTotal = (Number(txForm.cat1) * Number(txForm.rateCat1)) + (Number(txForm.cat2) * Number(txForm.rateCat2)) + (Number(txForm.cat3) * Number(txForm.rateCat3)) + (Number(txForm.cat4) * Number(txForm.rateCat4));
  const liveTxQty = Number(txForm.cat1) + Number(txForm.cat2) + Number(txForm.cat3) + Number(txForm.cat4);

  const submitTransaction = async (e: React.FormEvent) => {
    e.preventDefault(); setTxSaving(true);
    try {
      const r = await fetch("/api/credit-transactions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          financialYear: txForm.financialYear, creditType: txForm.creditType,
          fromClientId: txForm.fromClientId || null, toClientId: txForm.toClientId || null,
          cat1: Number(txForm.cat1), cat2: Number(txForm.cat2), cat3: Number(txForm.cat3), cat4: Number(txForm.cat4),
          rateCat1: Number(txForm.rateCat1), rateCat2: Number(txForm.rateCat2), rateCat3: Number(txForm.rateCat3), rateCat4: Number(txForm.rateCat4),
          date: txForm.date, notes: txForm.notes,
        }),
      });
      if (!r.ok) { toast.error("Error saving"); return; }
      toast.success("Transaction added!"); invalidate("/api/credit-transactions", "/api/financial-year", "/api/dashboard"); setTxModalOpen(false); refetchTransactions();
    } finally { setTxSaving(false); }
  };

  const deleteTx = async (id: string) => { if (!confirm("Delete this transaction?")) return; await fetch(`/api/credit-transactions/${id}`, { method: "DELETE" }); toast.success("Deleted"); invalidate("/api/credit-transactions", "/api/financial-year", "/api/dashboard"); refetchTransactions(); };
  const submitInvoice = async (e: React.FormEvent) => {
    e.preventDefault(); setInvSaving(true);
    try { const r = await fetch("/api/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(invForm) }); if (!r.ok) { toast.error("Error"); return; } toast.success("Added!"); invalidate("/api/invoices"); setInvModalOpen(false); refetchInvoices(); } finally { setInvSaving(false); }
  };
  const deleteInvoice = async (id: string) => { if (!confirm("Delete this record?")) return; await fetch(`/api/invoices/${id}`, { method: "DELETE" }); toast.success("Deleted"); invalidate("/api/invoices"); refetchInvoices(); };
  const submitUpload = async (e: React.FormEvent) => {
    e.preventDefault(); setUplSaving(true);
    try { const r = await fetch("/api/upload-records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...uplForm, cat1: Number(uplForm.cat1), cat2: Number(uplForm.cat2), cat3: Number(uplForm.cat3), cat4: Number(uplForm.cat4) }) }); if (!r.ok) { toast.error("Error"); return; } toast.success("Added!"); invalidate("/api/upload-records"); setUplModalOpen(false); refetchUploads(); } finally { setUplSaving(false); }
  };
  const deleteUpload = async (id: string) => { if (!confirm("Delete this record?")) return; await fetch(`/api/upload-records/${id}`, { method: "DELETE" }); toast.success("Deleted"); invalidate("/api/upload-records"); refetchUploads(); };

  const NavBtn = ({ id, icon, label, count }: { id: ActiveSection; icon: React.ReactNode; label: string; count?: number }) => (
    <button onClick={() => setActiveSection(id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeSection === id ? "bg-brand-600 text-white shadow-sm" : "bg-card border border-base text-muted hover:text-default"}`}>
      {icon}{label}{count !== undefined && <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeSection === id ? "bg-white/20 text-white" : "bg-surface text-muted"}`}>{count}</span>}
    </button>
  );

  const creditTypeBadge = (type?: string) => {
    if (type === "EOL") return <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 px-2 py-0.5 rounded-full"><Leaf className="w-3 h-3" />E.O.L</span>;
    return <span className="inline-flex items-center gap-1 text-xs font-semibold bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400 px-2 py-0.5 rounded-full"><Recycle className="w-3 h-3" />Recycling</span>;
  };

  return (
    <div>
      <PageHeader title="Credit Transactions" description="Manage credit transfers, invoice tracking, and upload records">
        {activeSection === "transactions" && <button className="btn-primary" onClick={() => setTxModalOpen(true)}><Plus className="w-4 h-4" /> Add Transaction</button>}
        {activeSection === "invoices" && <button className="btn-primary" onClick={() => setInvModalOpen(true)}><Plus className="w-4 h-4" /> Add Invoice</button>}
        {activeSection === "uploads" && <button className="btn-primary" onClick={() => setUplModalOpen(true)}><Plus className="w-4 h-4" /> Add Upload</button>}
      </PageHeader>

      {/* FY */}
      <FYTabBar value={fy} onChange={setFy} />
      {/* Section tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <NavBtn id="transactions" icon={<ArrowLeftRight className="w-4 h-4" />} label="Transactions" count={transactions.length} />
        <NavBtn id="invoices" icon={<FileText className="w-4 h-4" />} label="Invoice Tracking" count={invoices.length} />
        <NavBtn id="uploads" icon={<Upload className="w-4 h-4" />} label="Upload Records" count={uploads.length} />
      </div>

      {/* ── TRANSACTIONS ── */}
      {activeSection === "transactions" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {[["Transactions", transactions.length.toString(), "text-default"], ["Total Qty", totalTxQty.toLocaleString(), "text-teal-600"], ["Total Value", formatCurrency(totalTxAmount), "text-brand-600"]].map(([label, val, cls]) => (
              <div key={label} className="bg-card border border-base rounded-xl p-4 shadow-sm text-center transition-colors">
                <p className="text-xs text-muted mb-1">{label}</p>
                <p className={`text-2xl font-bold ${cls}`}>{val}</p>
              </div>
            ))}
          </div>

          {/* Credit type filter */}
          <div className="flex gap-2 mb-4">
            {["all", "Recycling", "EOL"].map((t) => (
              <button key={t} onClick={() => setCreditTypeFilter(t)} className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${creditTypeFilter === t ? "bg-brand-600 text-white" : "bg-card border border-base text-muted hover:text-default"}`}>
                {t === "Recycling" && <Recycle className="w-3 h-3" />}
                {t === "EOL" && <Leaf className="w-3 h-3" />}
                {t === "all" ? "All Types" : t === "EOL" ? "E.O.L" : t}
              </button>
            ))}
          </div>

          {/* Desktop */}
          <div className="hidden lg:block bg-card border border-base rounded-2xl shadow-sm overflow-hidden transition-colors">
            {txLoading ? <LoadingSpinner /> : transactions.length === 0 ? <EmptyState message="No transactions for this FY" /> : (
              <TableWrapper>
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr>
                      <th className="table-header">Date</th>
                      <th className="table-header">Type</th>
                      <th className="table-header">From (PWP)</th>
                      <th className="table-header">To</th>
                      {CATS.map((c) => <th key={c} className="table-header">{c}<br /><span className="font-normal text-faint">Qty / Rate</span></th>)}
                      <th className="table-header">Total</th>
                      <th className="table-header"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr key={tx._id} className="hover:bg-hover border-t border-soft transition-colors">
                        <td className="table-cell whitespace-nowrap">{formatDate(tx.date)}</td>
                        <td className="table-cell whitespace-nowrap">{creditTypeBadge(tx.creditType)}</td>
                        <td className="table-cell whitespace-nowrap"><span className="text-xs bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 px-2 py-0.5 rounded-full font-medium">{clientName(tx.fromClientId)}</span></td>
                        <td className="table-cell font-medium text-sm whitespace-nowrap">{clientName(tx.toClientId)}</td>
                        {CAT_KEYS.map((k, i) => {
                          const qty = tx[k] || 0; const rate = (tx[`rateCat${i + 1}` as keyof Transaction] as number) || 0; return (
                            <td key={k} className="table-cell text-center">{qty > 0 ? <div><p className="font-semibold text-default">{qty.toLocaleString()}</p><p className="text-xs text-muted">@{formatCurrency(rate)}</p></div> : <span className="text-faint">—</span>}</td>
                          );
                        })}
                        <td className="table-cell font-bold text-brand-600 whitespace-nowrap">{formatCurrency(tx.totalAmount)}</td>
                        <td className="table-cell whitespace-nowrap"><button onClick={() => deleteTx(tx._id)} className="p-1.5 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrapper>
            )}
          </div>
          {/* Mobile cards */}
          <div className="lg:hidden space-y-2">
            {txLoading ? <LoadingSpinner /> : transactions.length === 0 ? <EmptyState message="No transactions for this FY" /> : (
              transactions.map((tx) => {
                const isExp = expandedTx.has(tx._id);
                return (
                  <div key={tx._id} className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden">
                    <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover transition-colors" onClick={() => toggleTx(tx._id)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-xs bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 px-2 py-0.5 rounded-full font-medium">{clientName(tx.fromClientId)}</span>
                          <span className="text-xs text-faint">→</span>
                          <span className="font-medium text-sm text-default">{clientName(tx.toClientId)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-brand-600 text-sm">{formatCurrency(tx.totalAmount)}</span>
                          <span className="text-xs text-faint">{formatDate(tx.date)}</span>
                          {creditTypeBadge(tx.creditType)}
                        </div>
                      </div>
                      <ChevronDown className="w-4 h-4 text-faint flex-shrink-0 transition-transform duration-200" style={{ transform: isExp ? "rotate(180deg)" : "rotate(0deg)" }} />
                    </button>
                    {isExp && (
                      <div className="card-expand px-4 pb-4 border-t border-soft pt-3 space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          {CAT_KEYS.map((k, i) => {
                            const qty = tx[k] || 0; const rate = (tx[`rateCat${i + 1}` as keyof Transaction] as number) || 0; return qty > 0 ? (
                              <div key={k} className="bg-surface rounded-lg px-3 py-2">
                                <p className="text-xs text-faint">{CATS[i]}</p>
                                <p className="font-semibold text-sm text-default">{qty.toLocaleString()} <span className="font-normal text-xs text-muted">@ {formatCurrency(rate)}</span></p>
                              </div>
                            ) : null;
                          })}
                        </div>
                        <button onClick={() => deleteTx(tx._id)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/40 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><Trash2 className="w-3.5 h-3.5" />Delete</button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* ── INVOICES ── */}
      {activeSection === "invoices" && (
        <>
          <div className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden transition-colors hidden lg:block">
            {invLoading ? <LoadingSpinner /> : invoices.length === 0 ? <EmptyState message="No invoice records for this FY" description="Track which periods invoices have been received" /> : (
              <TableWrapper>
                <table className="w-full min-w-[600px]">
                  <thead><tr><th className="table-header">Company</th><th className="table-header">FY</th><th className="table-header">From Date</th><th className="table-header">To Date</th><th className="table-header">Duration</th><th className="table-header">Added On</th><th className="table-header"></th></tr></thead>
                  <tbody>
                    {invoices.map((inv) => {
                      const days = Math.ceil((new Date(inv.toDate).getTime() - new Date(inv.fromDate).getTime()) / 86400000);
                      const months = Math.ceil(days / 30);
                      return (
                        <tr key={inv._id} className="hover:bg-hover border-t border-soft transition-colors">
                          <td className="table-cell font-medium whitespace-nowrap">{clientName(inv.clientId)}</td>
                          <td className="table-cell whitespace-nowrap"><span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 px-2 py-0.5 rounded-full font-medium">{inv.financialYear}</span></td>
                          <td className="table-cell font-mono text-sm whitespace-nowrap">{formatDate(inv.fromDate)}</td>
                          <td className="table-cell font-mono text-sm whitespace-nowrap">{formatDate(inv.toDate)}</td>
                          <td className="table-cell text-muted text-sm whitespace-nowrap">~{months} month{months !== 1 ? "s" : ""}</td>
                          <td className="table-cell text-muted text-sm whitespace-nowrap">{formatDate(inv.createdAt)}</td>
                          <td className="table-cell whitespace-nowrap"><button onClick={() => deleteInvoice(inv._id)} className="p-1.5 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrapper>
            )}
          </div>
          {/* Mobile cards */}
          <div className="lg:hidden space-y-2">
            {invLoading ? <LoadingSpinner /> : invoices.length === 0 ? <EmptyState message="No invoice records for this FY" /> : invoices.map((inv) => {
              const days = Math.ceil((new Date(inv.toDate).getTime() - new Date(inv.fromDate).getTime()) / 86400000);
              const months = Math.ceil(days / 30);
              const isExp = expandedInv === inv._id;
              return (
                <div key={inv._id} className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden">
                  <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover transition-colors" onClick={() => setExpandedInv(isExp ? null : inv._id)}>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-default truncate">{clientName(inv.clientId)}</p>
                      <p className="text-xs text-faint mt-0.5"><span className="font-mono">{formatDate(inv.fromDate)}</span> → <span className="font-mono">{formatDate(inv.toDate)}</span></p>
                    </div>
                    <span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 px-2 py-0.5 rounded-full font-medium flex-shrink-0">{inv.financialYear}</span>
                    <ChevronDown className="w-4 h-4 text-faint flex-shrink-0 transition-transform duration-200" style={{ transform: isExp ? "rotate(180deg)" : "rotate(0deg)" }} />
                  </button>
                  {isExp && (
                    <div className="card-expand px-4 pb-4 border-t border-soft pt-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-faint block">Duration</span><span className="text-default">~{months} month{months !== 1 ? "s" : ""}</span></div>
                        <div><span className="text-faint block">Added On</span><span className="text-default">{formatDate(inv.createdAt)}</span></div>
                      </div>
                      <button onClick={() => deleteInvoice(inv._id)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/40 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><Trash2 className="w-3.5 h-3.5" />Delete</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── UPLOADS ── */}
      {activeSection === "uploads" && (
        <>
          <div className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden transition-colors hidden lg:block">
            {uplLoading ? <LoadingSpinner /> : uploads.length === 0 ? <EmptyState message="No upload records for this FY" /> : (
              <TableWrapper>
                <table className="w-full min-w-[600px]">
                  <thead><tr><th className="table-header">Company</th><th className="table-header">FY</th><th className="table-header">CAT-I</th><th className="table-header">CAT-II</th><th className="table-header">CAT-III</th><th className="table-header">CAT-IV</th><th className="table-header">Total</th><th className="table-header">Added On</th><th className="table-header"></th></tr></thead>
                  <tbody>
                    {uploads.map((upl) => {
                      const total = (upl.cat1 || 0) + (upl.cat2 || 0) + (upl.cat3 || 0) + (upl.cat4 || 0); return (
                        <tr key={upl._id} className="hover:bg-hover border-t border-soft transition-colors">
                          <td className="table-cell font-medium whitespace-nowrap">{clientName(upl.clientId)}</td>
                          <td className="table-cell whitespace-nowrap"><span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 px-2 py-0.5 rounded-full font-medium">{upl.financialYear}</span></td>
                          <td className="table-cell font-mono text-sm whitespace-nowrap">{(upl.cat1 || 0).toLocaleString()}</td>
                          <td className="table-cell font-mono text-sm whitespace-nowrap">{(upl.cat2 || 0).toLocaleString()}</td>
                          <td className="table-cell font-mono text-sm whitespace-nowrap">{(upl.cat3 || 0).toLocaleString()}</td>
                          <td className="table-cell font-mono text-sm whitespace-nowrap">{(upl.cat4 || 0).toLocaleString()}</td>
                          <td className="table-cell font-bold text-teal-600 whitespace-nowrap">{total.toLocaleString()}</td>
                          <td className="table-cell text-muted text-sm whitespace-nowrap">{formatDate(upl.createdAt)}</td>
                          <td className="table-cell whitespace-nowrap"><button onClick={() => deleteUpload(upl._id)} className="p-1.5 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrapper>
            )}
          </div>
          {/* Mobile cards */}
          <div className="lg:hidden space-y-2">
            {uplLoading ? <LoadingSpinner /> : uploads.length === 0 ? <EmptyState message="No upload records for this FY" /> : uploads.map((upl) => {
              const total = (upl.cat1 || 0) + (upl.cat2 || 0) + (upl.cat3 || 0) + (upl.cat4 || 0);
              const isExp = expandedUpl === upl._id;
              return (
                <div key={upl._id} className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden">
                  <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover transition-colors" onClick={() => setExpandedUpl(isExp ? null : upl._id)}>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-default truncate">{clientName(upl.clientId)}</p>
                      <p className="text-xs text-faint mt-0.5">Total: <span className="font-bold text-teal-600">{total.toLocaleString()}</span> units</p>
                    </div>
                    <span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 px-2 py-0.5 rounded-full font-medium flex-shrink-0">{upl.financialYear}</span>
                    <ChevronDown className="w-4 h-4 text-faint flex-shrink-0 transition-transform duration-200" style={{ transform: isExp ? "rotate(180deg)" : "rotate(0deg)" }} />
                  </button>
                  {isExp && (
                    <div className="card-expand px-4 pb-4 border-t border-soft pt-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {[["CAT-I", upl.cat1 || 0], ["CAT-II", upl.cat2 || 0], ["CAT-III", upl.cat3 || 0], ["CAT-IV", upl.cat4 || 0]].map(([label, val]) => (
                          <div key={String(label)}><span className="text-faint block">{label}</span><span className="font-mono font-semibold text-default">{Number(val).toLocaleString()}</span></div>
                        ))}
                        <div><span className="text-faint block">Added On</span><span className="text-default">{formatDate(upl.createdAt)}</span></div>
                      </div>
                      <button onClick={() => deleteUpload(upl._id)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/40 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><Trash2 className="w-3.5 h-3.5" />Delete</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── MODAL: Transaction ── */}
      <Modal open={txModalOpen} onClose={() => setTxModalOpen(false)} title="Add Credit Transaction" size="lg">
        <form onSubmit={submitTransaction} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="label">Financial Year *</label><select className="input-field" value={txForm.financialYear} onChange={(e) => setTxForm({ ...txForm, financialYear: e.target.value })} required>{FINANCIAL_YEARS.map((y) => <option key={y}>{y}</option>)}</select></div>
            <div><label className="label">Date *</label><input type="date" className="input-field" value={txForm.date} onChange={(e) => setTxForm({ ...txForm, date: e.target.value })} required /></div>
          </div>

          {/* Credit type toggle */}
          <div>
            <label className="label mb-2">Credit Type *</label>
            <div className="flex gap-2">
              {CREDIT_TYPES.map((ct) => (
                <button key={ct.value} type="button" onClick={() => setTxForm({ ...txForm, creditType: ct.value })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${txForm.creditType === ct.value ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400" : "border-base text-muted hover:border-brand-300"}`}>
                  <span>{ct.icon}</span>{ct.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="label">From (PWP)</label><select className="input-field" value={txForm.fromClientId} onChange={(e) => setTxForm({ ...txForm, fromClientId: e.target.value })}><option value="">External</option>{pwpClients.map((c) => <option key={c.clientId} value={c.clientId}>{c.companyName}</option>)}</select></div>
            <div><label className="label">To (Client)</label><select className="input-field" value={txForm.toClientId} onChange={(e) => setTxForm({ ...txForm, toClientId: e.target.value })}><option value="">External</option>{nonPwpClients.map((c) => <option key={c.clientId} value={c.clientId}>{c.companyName} ({c.category})</option>)}</select></div>
          </div>

          <div>
            <p className="label mb-2">Category-wise Quantity & Rate</p>
            <div className="border border-base rounded-xl overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="bg-table-head border-b border-base"><th className="text-left text-xs text-muted font-semibold px-3 py-2">Category</th><th className="text-center text-xs text-muted font-semibold px-3 py-2">Quantity</th><th className="text-center text-xs text-muted font-semibold px-3 py-2">Rate (₹/unit)</th><th className="text-right text-xs text-muted font-semibold px-3 py-2">Amount</th></tr></thead>
                <tbody>
                  {CATS.map((cat, i) => {
                    const qk = `cat${i + 1}` as keyof typeof txForm;
                    const rk = `rateCat${i + 1}` as keyof typeof txForm;
                    const amt = Number(txForm[qk]) * Number(txForm[rk]);
                    return (
                      <tr key={cat} className="border-b border-soft last:border-0">
                        <td className="px-3 py-2 font-medium text-default">{cat}</td>
                        <td className="px-3 py-2"><input type="number" min="0" className="input-field !py-1.5 text-center font-mono text-sm" value={txForm[qk]} onChange={(e) => setTxForm({ ...txForm, [qk]: e.target.value })} /></td>
                        <td className="px-3 py-2"><input type="number" min="0" step="0.01" className="input-field !py-1.5 text-center font-mono text-sm" value={txForm[rk]} onChange={(e) => setTxForm({ ...txForm, [rk]: e.target.value })} /></td>
                        <td className="px-3 py-2 text-right font-medium text-default">{amt > 0 ? formatCurrency(amt) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {liveTxTotal > 0 && (
            <div className="bg-brand-50 dark:bg-brand-900/20 rounded-xl p-3 flex justify-between text-sm">
              <span className="text-muted">Total Qty: <strong className="text-default">{liveTxQty.toLocaleString()}</strong></span>
              <span className="text-brand-700 dark:text-brand-400 font-bold">Total: {formatCurrency(liveTxTotal)}</span>
            </div>
          )}

          <div><label className="label">Notes</label><textarea className="input-field" rows={2} value={txForm.notes} onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })} /></div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={txSaving}>{txSaving ? "Saving..." : "Add Transaction"}</button>
            <button type="button" className="btn-secondary" onClick={() => setTxModalOpen(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: Invoice ── */}
      <Modal open={invModalOpen} onClose={() => setInvModalOpen(false)} title="Add Invoice Record">
        <form onSubmit={submitInvoice} className="space-y-4">
          <div><label className="label">Company *</label><select className="input-field" value={invForm.clientId} onChange={(e) => setInvForm({ ...invForm, clientId: e.target.value })} required><option value="">Select Company</option>{clients.map((c) => <option key={c.clientId} value={c.clientId}>{c.companyName} ({c.category})</option>)}</select></div>
          <div><label className="label">Financial Year *</label><select className="input-field" value={invForm.financialYear} onChange={(e) => setInvForm({ ...invForm, financialYear: e.target.value })} required>{FINANCIAL_YEARS.map((y) => <option key={y}>{y}</option>)}</select></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="label">From Date *</label><input type="date" className="input-field" value={invForm.fromDate} onChange={(e) => setInvForm({ ...invForm, fromDate: e.target.value })} required /></div>
            <div><label className="label">To Date *</label><input type="date" className="input-field" value={invForm.toDate} onChange={(e) => setInvForm({ ...invForm, toDate: e.target.value })} required /></div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={invSaving}>{invSaving ? "Saving..." : "Add Record"}</button>
            <button type="button" className="btn-secondary" onClick={() => setInvModalOpen(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: Upload ── */}
      <Modal open={uplModalOpen} onClose={() => setUplModalOpen(false)} title="Add Upload Record">
        <form onSubmit={submitUpload} className="space-y-4">
          <div><label className="label">Company *</label><select className="input-field" value={uplForm.clientId} onChange={(e) => setUplForm({ ...uplForm, clientId: e.target.value })} required><option value="">Select Company</option>{clients.map((c) => <option key={c.clientId} value={c.clientId}>{c.companyName} ({c.category})</option>)}</select></div>
          <div><label className="label">Financial Year *</label><select className="input-field" value={uplForm.financialYear} onChange={(e) => setUplForm({ ...uplForm, financialYear: e.target.value })} required>{FINANCIAL_YEARS.map((y) => <option key={y}>{y}</option>)}</select></div>
          <p className="label">Category-wise Quantity</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CATS.map((cat, i) => { const key = `cat${i + 1}` as keyof typeof uplForm; return (<div key={cat}><label className="block text-xs text-muted mb-1">{cat}</label><input type="number" min="0" className="input-field font-mono text-center" value={uplForm[key]} onChange={(e) => setUplForm({ ...uplForm, [key]: e.target.value })} /></div>); })}
          </div>
          <div className="bg-teal-50 dark:bg-teal-900/20 rounded-xl p-3 flex justify-between text-sm"><span className="text-muted">Total:</span><span className="font-bold text-teal-600 dark:text-teal-400">{(Number(uplForm.cat1) + Number(uplForm.cat2) + Number(uplForm.cat3) + Number(uplForm.cat4)).toLocaleString()} units</span></div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={uplSaving}>{uplSaving ? "Saving..." : "Add Record"}</button>
            <button type="button" className="btn-secondary" onClick={() => setUplModalOpen(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

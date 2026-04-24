"use client";
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useCache, invalidate } from "@/lib/useCache";
import CreditInsightsPanel, { InsightsData } from "@/components/ui/CreditInsightsPanel";
import toast from "react-hot-toast";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import TableWrapper from "@/components/ui/TableWrapper";
import EmptyState from "@/components/ui/EmptyState";
import { FINANCIAL_YEARS, formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Trash2, Recycle, Leaf, ChevronDown, Search, X } from "lucide-react";
import FYTabBar from "@/components/ui/FYTabBar";
import { useFinancialYearPreference, useFinancialYearState } from "@/app/providers";

interface Client {
  clientId: string;
  companyName: string;
  category: string;
}

interface Transaction {
  _id: string;
  financialYear: string;
  creditType?: string;
  fromClientId?: string;
  toClientId?: string;
  cat1?: number;
  cat2?: number;
  cat3?: number;
  cat4?: number;
  rateCat1?: number;
  rateCat2?: number;
  rateCat3?: number;
  rateCat4?: number;
  totalAmount: number;
  date: string;
  notes?: string;
}

const CATS = ["CAT-I", "CAT-II", "CAT-III", "CAT-IV"] as const;
const CAT_KEYS = ["cat1", "cat2", "cat3", "cat4"] as const;

const CREDIT_TYPES = [
  { value: "Recycling", label: "Recycling", icon: "♻️" },
  { value: "EOL", label: "End of Life (E.O.L)", icon: "🔄" },
];

export default function CreditTransactionsPage() {
  const [fy, setFy] = useFinancialYearState();
  const { effectiveFinancialYear } = useFinancialYearPreference();
  const [creditTypeFilter, setCreditTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [txModalOpen, setTxModalOpen] = useState(false);
  const [expandedTx, setExpandedTx] = useState<Set<string>>(new Set());
  const [txSaving, setTxSaving] = useState(false);
  const [txForm, setTxForm] = useState({
    financialYear: effectiveFinancialYear,
    fromClientId: "",
    toClientId: "",
    creditType: "Recycling",
    cat1: "0",
    cat2: "0",
    cat3: "0",
    cat4: "0",
    rateCat1: "0",
    rateCat2: "0",
    rateCat3: "0",
    rateCat4: "0",
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const insightsFetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchInsights = useCallback(async (
    fromClientId: string,
    toClientId: string,
    financialYear: string,
    creditType: string,
  ) => {
    if (insightsFetchRef.current) clearTimeout(insightsFetchRef.current);
    insightsFetchRef.current = setTimeout(async () => {
      setInsightsLoading(true);
      try {
        const params = new URLSearchParams({ financialYear, creditType });
        if (fromClientId) params.set("fromClientId", fromClientId);
        if (toClientId) params.set("toClientId", toClientId);
        const response = await fetch(`/api/credit-transactions/insights?${params}`);
        if (response.ok) setInsights(await response.json());
      } finally {
        setInsightsLoading(false);
      }
    }, 300);
  }, []);

  useEffect(() => {
    if (!txModalOpen) {
      setInsights(null);
      return;
    }
    fetchInsights(txForm.fromClientId, txForm.toClientId, txForm.financialYear, txForm.creditType);
  }, [txModalOpen, txForm.fromClientId, txForm.toClientId, txForm.financialYear, txForm.creditType, fetchInsights]);

  const formQty = {
    cat1: Number(txForm.cat1),
    cat2: Number(txForm.cat2),
    cat3: Number(txForm.cat3),
    cat4: Number(txForm.cat4),
  };

  const hasHardError = (() => {
    if (!insights?.pwp || insights.pwp.isExternal) return false;
    const avail = (insights.pwp as Extract<InsightsData["pwp"], { isExternal: false }>).available;
    if (!avail) return false;
    return (
      (formQty.cat1 > 0 && formQty.cat1 > avail.cat1) ||
      (formQty.cat2 > 0 && formQty.cat2 > avail.cat2) ||
      (formQty.cat3 > 0 && formQty.cat3 > avail.cat3) ||
      (formQty.cat4 > 0 && formQty.cat4 > avail.cat4)
    );
  })();

  const { data: rawClients } = useCache<Client[]>("/api/clients");
  const clients = useMemo(() => (Array.isArray(rawClients) ? rawClients : []), [rawClients]);

  const txUrl = `/api/credit-transactions?${new URLSearchParams({
    fy,
    ...(creditTypeFilter !== "all" ? { creditType: creditTypeFilter } : {}),
  })}`;
  const { data: rawTx, loading: txLoading, refetch: refetchTransactions } = useCache<Transaction[]>(txUrl);
  const transactions = useMemo(() => (Array.isArray(rawTx) ? rawTx : []), [rawTx]);

  const clientName = useCallback((id?: string) => {
    if (!id) return "External";
    return clients.find((client) => client.clientId === id)?.companyName || id;
  }, [clients]);

  const filteredTransactions = useMemo(() => {
    if (!search.trim()) return transactions;
    const query = search.toLowerCase();
    return transactions.filter((tx) =>
      clientName(tx.fromClientId).toLowerCase().includes(query) ||
      clientName(tx.toClientId).toLowerCase().includes(query) ||
      (tx.fromClientId || "").toLowerCase().includes(query) ||
      (tx.toClientId || "").toLowerCase().includes(query) ||
      (tx.notes || "").toLowerCase().includes(query) ||
      (tx.creditType || "").toLowerCase().includes(query) ||
      formatDate(tx.date).toLowerCase().includes(query)
    );
  }, [transactions, search, clientName]);

  const pwpClients = clients.filter((client) => client.category === "PWP");
  const nonPwpClients = clients.filter((client) => client.category !== "PWP");
  const totalTxAmount = transactions.reduce((sum, tx) => sum + tx.totalAmount, 0);
  const totalTxQty = transactions.reduce((sum, tx) => sum + (tx.cat1 || 0) + (tx.cat2 || 0) + (tx.cat3 || 0) + (tx.cat4 || 0), 0);
  const liveTxTotal =
    (Number(txForm.cat1) * Number(txForm.rateCat1)) +
    (Number(txForm.cat2) * Number(txForm.rateCat2)) +
    (Number(txForm.cat3) * Number(txForm.rateCat3)) +
    (Number(txForm.cat4) * Number(txForm.rateCat4));
  const liveTxQty = Number(txForm.cat1) + Number(txForm.cat2) + Number(txForm.cat3) + Number(txForm.cat4);

  const toggleTx = (id: string) => {
    setExpandedTx((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openTransactionModal = () => {
    setTxForm({
      financialYear: fy,
      fromClientId: "",
      toClientId: "",
      creditType: "Recycling",
      cat1: "0",
      cat2: "0",
      cat3: "0",
      cat4: "0",
      rateCat1: "0",
      rateCat2: "0",
      rateCat3: "0",
      rateCat4: "0",
      date: new Date().toISOString().split("T")[0],
      notes: "",
    });
    setTxModalOpen(true);
  };

  const submitTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasHardError) {
      toast.error("Transaction exceeds available credits from PWP");
      return;
    }

    setTxSaving(true);
    try {
      const response = await fetch("/api/credit-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          financialYear: txForm.financialYear,
          creditType: txForm.creditType,
          fromClientId: txForm.fromClientId || null,
          toClientId: txForm.toClientId || null,
          cat1: Number(txForm.cat1),
          cat2: Number(txForm.cat2),
          cat3: Number(txForm.cat3),
          cat4: Number(txForm.cat4),
          rateCat1: Number(txForm.rateCat1),
          rateCat2: Number(txForm.rateCat2),
          rateCat3: Number(txForm.rateCat3),
          rateCat4: Number(txForm.rateCat4),
          date: txForm.date,
          notes: txForm.notes,
        }),
      });

      if (!response.ok) {
        toast.error("Error saving");
        return;
      }

      toast.success("Transaction added!");
      invalidate("/api/credit-transactions", "/api/financial-year", "/api/dashboard");
      setTxModalOpen(false);
      refetchTransactions();
    } finally {
      setTxSaving(false);
    }
  };

  const deleteTx = async (id: string) => {
    if (!confirm("Delete this transaction?")) return;
    await fetch(`/api/credit-transactions/${id}`, { method: "DELETE" });
    toast.success("Deleted");
    invalidate("/api/credit-transactions", "/api/financial-year", "/api/dashboard");
    refetchTransactions();
  };

  const creditTypeBadge = (type?: string) => {
    if (type === "EOL") {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 px-2 py-0.5 rounded-full">
          <Leaf className="w-3 h-3" />E.O.L
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400 px-2 py-0.5 rounded-full">
        <Recycle className="w-3 h-3" />Recycling
      </span>
    );
  };

  return (
    <div>
      <PageHeader title="Credit Transactions" description="Manage credit transfer records across financial years">
        <div className="hidden sm:flex items-center gap-2 rounded-xl border border-base bg-card px-3 py-2 text-sm text-muted">
          <span className="h-2 w-2 rounded-full bg-brand-500" />
          <span className="font-medium text-default">{transactions.length.toLocaleString()}</span>
          <span>recorded</span>
        </div>
        <button className="glass-btn glass-btn-primary" onClick={openTransactionModal}>
          <Plus className="w-4 h-4" /> Add Transaction
        </button>
      </PageHeader>

      <FYTabBar value={fy} onChange={setFy} />

      <div className="sm:hidden mb-4">
        <div className="inline-flex items-center gap-2 rounded-xl border border-base bg-card px-3 py-2 text-sm text-muted">
          <span className="h-2 w-2 rounded-full bg-brand-500" />
          <span className="font-medium text-default">{transactions.length.toLocaleString()}</span>
          <span>recorded</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        {[
          ["Transactions", transactions.length.toString(), "text-default"],
          ["Total Qty", totalTxQty.toLocaleString(), "text-teal-600"],
          ["Total Value", formatCurrency(totalTxAmount), "text-brand-600"],
        ].map(([label, value, className]) => (
          <div key={label} className="bg-card border border-base rounded-xl p-4 shadow-sm text-center transition-colors">
            <p className="text-xs text-muted mb-1">{label}</p>
            <p className={`text-2xl font-bold ${className}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-base rounded-2xl p-3 mb-4 shadow-sm flex items-center gap-2 transition-colors">
        <Search className="w-4 h-4 text-faint flex-shrink-0 ml-1" />
        <input
          className="bg-transparent border-0 ring-0 outline-none flex-1 py-1.5 text-sm text-default placeholder:text-faint"
          placeholder="Search by client name, ID, type, or date…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch("")} className="p-1 text-faint hover:text-default rounded transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="glass-tray mb-4">
        {["all", "Recycling", "EOL"].map((type) => (
          <button
            key={type}
            onClick={() => setCreditTypeFilter(type)}
            className={`glass-pill ${creditTypeFilter === type ? "glass-pill-active" : ""}`}
          >
            {type === "Recycling" && <Recycle className="w-3 h-3" />}
            {type === "EOL" && <Leaf className="w-3 h-3" />}
            {type === "all" ? "All Types" : type === "EOL" ? "E.O.L" : type}
          </button>
        ))}
      </div>

      <div className="hidden lg:block bg-card border border-base rounded-2xl shadow-sm overflow-hidden transition-colors">
        {txLoading ? <LoadingSpinner /> : transactions.length === 0 ? (
          <EmptyState message="No transactions for this FY" />
        ) : filteredTransactions.length === 0 ? (
          <EmptyState message={`No results for "${search}"`} description="Try a different search term" />
        ) : (
          <TableWrapper>
            <table className="w-full min-w-[700px]">
              <thead>
                <tr>
                  <th className="table-header">Date</th>
                  <th className="table-header">Type</th>
                  <th className="table-header">From (PWP)</th>
                  <th className="table-header">To</th>
                  {CATS.map((cat) => (
                    <th key={cat} className="table-header">
                      {cat}
                      <br />
                      <span className="font-normal text-faint">Qty / Rate</span>
                    </th>
                  ))}
                  <th className="table-header">Total</th>
                  <th className="table-header"></th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((tx) => (
                  <tr key={tx._id} className="hover:bg-hover border-t border-soft transition-colors">
                    <td className="table-cell whitespace-nowrap">{formatDate(tx.date)}</td>
                    <td className="table-cell whitespace-nowrap">{creditTypeBadge(tx.creditType)}</td>
                    <td className="table-cell whitespace-nowrap">
                      <span className="text-xs bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 px-2 py-0.5 rounded-full font-medium">
                        {clientName(tx.fromClientId)}
                      </span>
                    </td>
                    <td className="table-cell font-medium text-sm whitespace-nowrap">{clientName(tx.toClientId)}</td>
                    {CAT_KEYS.map((key, index) => {
                      const qty = tx[key] || 0;
                      const rate = (tx[`rateCat${index + 1}` as keyof Transaction] as number) || 0;
                      return (
                        <td key={key} className="table-cell text-center">
                          {qty > 0 ? (
                            <div>
                              <p className="font-semibold text-default">{qty.toLocaleString()}</p>
                              <p className="text-xs text-muted">@{formatCurrency(rate)}</p>
                            </div>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="table-cell font-bold text-brand-600 whitespace-nowrap">{formatCurrency(tx.totalAmount)}</td>
                    <td className="table-cell whitespace-nowrap">
                      <button onClick={() => deleteTx(tx._id)} className="p-1.5 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        )}
      </div>

      <div className="lg:hidden space-y-2">
        {txLoading ? <LoadingSpinner /> : transactions.length === 0 ? (
          <EmptyState message="No transactions for this FY" />
        ) : filteredTransactions.length === 0 ? (
          <EmptyState message={`No results for "${search}"`} description="Try a different search term" />
        ) : (
          filteredTransactions.map((tx) => {
            const expanded = expandedTx.has(tx._id);
            return (
              <div key={tx._id} className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden">
                <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover transition-colors" onClick={() => toggleTx(tx._id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-xs bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 px-2 py-0.5 rounded-full font-medium">
                        {clientName(tx.fromClientId)}
                      </span>
                      <span className="text-xs text-faint">→</span>
                      <span className="font-medium text-sm text-default">{clientName(tx.toClientId)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-brand-600 text-sm">{formatCurrency(tx.totalAmount)}</span>
                      <span className="text-xs text-faint">{formatDate(tx.date)}</span>
                      {creditTypeBadge(tx.creditType)}
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-faint flex-shrink-0 transition-transform duration-200" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }} />
                </button>
                {expanded && (
                  <div className="card-expand px-4 pb-4 border-t border-soft pt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {CAT_KEYS.map((key, index) => {
                        const qty = tx[key] || 0;
                        const rate = (tx[`rateCat${index + 1}` as keyof Transaction] as number) || 0;
                        return qty > 0 ? (
                          <div key={key} className="bg-surface rounded-lg px-3 py-2">
                            <p className="text-xs text-faint">{CATS[index]}</p>
                            <p className="font-semibold text-sm text-default">
                              {qty.toLocaleString()} <span className="font-normal text-xs text-muted">@ {formatCurrency(rate)}</span>
                            </p>
                          </div>
                        ) : null;
                      })}
                    </div>
                    <button onClick={() => deleteTx(tx._id)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/40 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <Modal open={txModalOpen} onClose={() => setTxModalOpen(false)} title="Add Credit Transaction" size="lg">
        <form onSubmit={submitTransaction} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Financial Year *</label>
              <select className="input-field" value={txForm.financialYear} onChange={(e) => setTxForm({ ...txForm, financialYear: e.target.value })} required>
                {FINANCIAL_YEARS.map((year) => <option key={year}>{year}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input-field" value={txForm.date} onChange={(e) => setTxForm({ ...txForm, date: e.target.value })} required />
            </div>
          </div>

          <div>
            <label className="label mb-2">Credit Type *</label>
            <div className="flex gap-2">
              {CREDIT_TYPES.map((creditType) => (
                <button
                  key={creditType.value}
                  type="button"
                  onClick={() => setTxForm({ ...txForm, creditType: creditType.value })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${txForm.creditType === creditType.value ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400" : "border-base text-muted hover:border-brand-300"}`}
                >
                  <span>{creditType.icon}</span>{creditType.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">From (PWP)</label>
              <select className="input-field" value={txForm.fromClientId} onChange={(e) => setTxForm({ ...txForm, fromClientId: e.target.value })}>
                <option value="">External</option>
                {pwpClients.map((client) => <option key={client.clientId} value={client.clientId}>{client.companyName}</option>)}
              </select>
            </div>
            <div>
              <label className="label">To (Client)</label>
              <select className="input-field" value={txForm.toClientId} onChange={(e) => setTxForm({ ...txForm, toClientId: e.target.value })}>
                <option value="">External</option>
                {nonPwpClients.map((client) => <option key={client.clientId} value={client.clientId}>{client.companyName} ({client.category})</option>)}
              </select>
            </div>
          </div>

          <div>
            <p className="label mb-2">Category-wise Quantity & Rate</p>
            <div className="border border-base rounded-xl overflow-hidden">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "28%" }} />
                  <col style={{ width: "28%" }} />
                  <col style={{ width: "22%" }} />
                </colgroup>
                <thead>
                  <tr className="bg-table-head border-b border-base">
                    <th className="text-left text-xs text-muted font-semibold px-3 py-2">Category</th>
                    <th className="text-center text-xs text-muted font-semibold px-3 py-2">Quantity</th>
                    <th className="text-center text-xs text-muted font-semibold px-3 py-2">Rate (Rs/unit)</th>
                    <th className="text-right text-xs text-muted font-semibold px-3 py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {CATS.map((cat, index) => {
                    const qtyKey = `cat${index + 1}` as keyof typeof txForm;
                    const rateKey = `rateCat${index + 1}` as keyof typeof txForm;
                    const amount = Number(txForm[qtyKey]) * Number(txForm[rateKey]);
                    return (
                      <tr key={cat} className="border-b border-soft last:border-0">
                        <td className="px-3 py-2.5 font-medium text-default text-sm">{cat}</td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min="0"
                            className="input-field !py-1.5 text-center font-mono text-sm w-full"
                            value={txForm[qtyKey]}
                            onChange={(e) => setTxForm({ ...txForm, [qtyKey]: e.target.value })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="input-field !py-1.5 text-center font-mono text-sm w-full"
                            value={txForm[rateKey]}
                            onChange={(e) => setTxForm({ ...txForm, [rateKey]: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-sm text-default whitespace-nowrap">
                          {amount > 0 ? formatCurrency(amount) : <span className="text-faint font-normal">—</span>}
                        </td>
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

          <div>
            <label className="label">Notes</label>
            <textarea className="input-field" rows={2} value={txForm.notes} onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })} />
          </div>

          <CreditInsightsPanel
            insights={insights}
            loading={insightsLoading}
            formQty={formQty}
            isExternalPwp={!txForm.fromClientId}
            hasPibo={!!txForm.toClientId}
          />

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="btn-primary flex-1 justify-center"
              disabled={txSaving || hasHardError}
              title={hasHardError ? "Quantity exceeds available credits - reduce quantities to proceed" : undefined}
            >
              {txSaving ? "Saving..." : "Add Transaction"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setTxModalOpen(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

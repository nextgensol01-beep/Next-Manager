"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  Plus, Search, Filter, FileText, MoreHorizontal,
  Copy, Mail, GitBranch, Trash2, Printer,
  CheckCircle, Clock, RefreshCw,
  ChevronRight, TrendingUp, Inbox, BadgeCheck
} from "lucide-react";
import { FINANCIAL_YEARS, formatCurrency } from "@/lib/utils";
import { useFinancialYearPreference } from "@/app/providers";
import { canCreateQuotationEmailDraft, canCreateQuotationRevision, type QuotationStatus } from "@/lib/quotationRules";
import Modal from "@/components/ui/Modal";
import { QUOTATION_STATUS_CONFIG, QuotationStatusPill } from "@/components/quotations/QuotationStatus";

interface QuotationRow {
  _id: string;
  quotationNumber: string;
  clientName: string;
  financialYear: string;
  status: QuotationStatus;
  currentRevisionNumber: number;
  grandTotal: number;
  itemCount: number;
  validTill?: string;
  updatedAt: string;
  createdAt: string;
}

const QUICK_FILTERS = [
  { key: "all", label: "All" },
  { key: "Draft", label: "Drafts", icon: FileText },
  { key: "awaitingResponse", label: "Awaiting Response", mobileLabel: "Awaiting", icon: Clock },
  { key: "Accepted", label: "Accepted", icon: BadgeCheck },
  { key: "RevisionRequested", label: "Needs Revision", mobileLabel: "Revision", icon: RefreshCw },
];

export default function QuotationsPage() {
  const router = useRouter();
  const { effectiveFinancialYear, isLoaded: financialYearLoaded } = useFinancialYearPreference();
  const [quotations, setQuotations] = useState<QuotationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fyFilter, setFyFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newFy, setNewFy] = useState(effectiveFinancialYear);
  const [showNewForm, setShowNewForm] = useState(false);

  // New action modal & autocomplete states
  const [selectedQuotation, setSelectedQuotation] = useState<QuotationRow | null>(null);
  const [quotationToDelete, setQuotationToDelete] = useState<QuotationRow | null>(null);
  const [clientSuggestions, setClientSuggestions] = useState<{ clientId: string; companyName: string; gstNumber?: string; address?: string; state?: string }[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedClientAddress, setSelectedClientAddress] = useState("");
  const [selectedClientGst, setSelectedClientGst] = useState("");
  const [selectedClientState, setSelectedClientState] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Client suggestions fetch
  useEffect(() => {
    if (!newClientName.trim() || !showNewForm) {
      setClientSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clients?summary=1&search=${encodeURIComponent(newClientName)}`);
        if (res.ok) {
          const data = await res.json();
          setClientSuggestions(data);
        }
      } catch (err) {
        console.error("Failed to fetch client suggestions", err);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [newClientName, showNewForm]);

  // Click outside to close client suggestions
  useEffect(() => {
    if (!showSuggestions) return;
    const handler = () => setShowSuggestions(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [showSuggestions]);

  const fetchQuotations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (fyFilter !== "all") params.set("financialYear", fyFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/quotations?${params}`);
      if (res.ok) setQuotations(await res.json());
    } finally {
      setLoading(false);
    }
  }, [statusFilter, fyFilter, debouncedSearch]);

  useEffect(() => { fetchQuotations(); }, [fetchQuotations]);

  useEffect(() => {
    if (financialYearLoaded && !showNewForm) {
      setNewFy(effectiveFinancialYear);
    }
  }, [effectiveFinancialYear, financialYearLoaded, showNewForm]);

  const openNewQuotationForm = () => {
    setNewFy(effectiveFinancialYear);
    setShowNewForm(true);
  };

  const createQuotation = async () => {
    if (!newClientName.trim()) return toast.error("Client name required");
    setCreating(true);
    try {
      const res = await fetch("/api/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: newClientName.trim(),
          clientId: selectedClientId,
          clientAddress: selectedClientAddress,
          clientGst: selectedClientGst,
          clientState: selectedClientState,
          financialYear: newFy,
          items: []
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to create quotation (${res.status})`);
      }
      const data = await res.json();
      router.push(`/dashboard/quotations/${data._id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create quotation");
    } finally {
      setCreating(false);
    }
  };

  const duplicate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await fetch(`/api/quotations/${id}/duplicate`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      toast.success("Quotation duplicated");
      router.push(`/dashboard/quotations/${data._id}`);
    } else {
      toast.error("Failed to duplicate quotation");
    }
  };

  const createRevision = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await fetch(`/api/quotations/${id}/create-revision`, { method: "POST" });
    if (res.ok) {
      toast.success("New revision created");
      router.push(`/dashboard/quotations/${id}`);
    } else {
      toast.error("Failed to create revision");
    }
  };

  const deleteQuotation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await fetch(`/api/quotations/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Deleted");
      fetchQuotations();
    } else {
      toast.error("Failed to delete quotation");
    }
  };

  // Stats
  const total = quotations.length;
  const isFiltered = statusFilter !== "all" || fyFilter !== "all" || Boolean(debouncedSearch);
  const awaitingResponse = quotations.filter(q => q.status === "Finalized" || q.status === "Sent").length;
  const accepted = quotations.filter(q => q.status === "Accepted").length;
  const totalValue = quotations.filter(q => q.status === "Accepted").reduce((s, q) => s + q.grandTotal, 0);

  function formatDaysLeft(validTill?: string) {
    if (!validTill) return null;
    const days = Math.ceil((new Date(validTill).getTime() - Date.now()) / 86400000);
    if (days < 0) return null;
    if (days === 0) return <span className="text-xs text-red-500 font-medium">Expires today</span>;
    if (days <= 5) return <span className="text-xs text-amber-500 font-medium">Expires in {days}d</span>;
    return null;
  }

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter("all");
    setFyFilter("all");
  };

  return (
    <div className="min-h-screen space-y-4 pb-6 sm:space-y-6 sm:pb-0">
      {/* ─── HEADER ─── */}
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-default sm:text-3xl">
              Quotations
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              {total} quotation{total !== 1 ? "s" : ""}
              {awaitingResponse > 0 && <span className="text-amber-500">{awaitingResponse} awaiting response</span>}
            </p>
          </div>
          <button
            onClick={openNewQuotationForm}
            className="btn-primary h-10 gap-2 self-start rounded-xl px-4 text-sm sm:h-auto sm:self-auto sm:rounded-[14px]"
          >
            <Plus className="w-4 h-4" />
            New Quotation
          </button>
        </div>

        {/* Summary stats */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-6 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
          {[
            { label: statusFilter !== "all" || fyFilter !== "all" || debouncedSearch ? "Showing" : "Total", value: total, icon: Inbox, color: "text-default" },
            { label: isFiltered ? "Showing Awaiting" : "Awaiting Response", value: awaitingResponse, icon: Clock, color: "text-amber-500" },
            { label: isFiltered ? "Showing Accepted" : "Accepted", value: accepted, icon: CheckCircle, color: "text-emerald-500" },
            { label: isFiltered ? "Showing Accepted Value" : "Accepted Value", value: formatCurrency(totalValue), icon: TrendingUp, color: "text-brand-600" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-[18px] border border-base bg-card p-3 shadow-sm sm:rounded-2xl sm:p-4">
              <div className="mb-1 flex min-w-0 items-center gap-2">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
                <span className="truncate text-[11px] text-muted sm:text-xs">{label}</span>
              </div>
              <p className={`truncate text-lg font-bold sm:text-xl ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ─── NEW QUOTATION FORM ─── */}
      {showNewForm && (
        <div className="animate-in fade-in slide-in-from-top-2 rounded-[22px] border border-base bg-card p-4 shadow-md duration-200 sm:rounded-2xl sm:p-5">
          <h3 className="mb-3 font-semibold text-default sm:mb-4">New Quotation</h3>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <input
                autoFocus
                className="input-field h-11 w-full"
                placeholder="Client name *"
                value={newClientName}
                onChange={e => {
                  setNewClientName(e.target.value);
                  setShowSuggestions(true);
                  if (!e.target.value) {
                    setSelectedClientId("");
                    setSelectedClientAddress("");
                    setSelectedClientGst("");
                    setSelectedClientState("");
                  }
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={e => e.key === "Enter" && createQuotation()}
              />
              {/* Autocomplete suggestions */}
              {showSuggestions && clientSuggestions.length > 0 && (
                <div 
                  onClick={e => e.stopPropagation()}
                  className="absolute left-0 right-0 top-full mt-1 bg-card border border-base rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto py-1"
                >
                  {clientSuggestions.map(client => (
                    <button
                      key={client.clientId}
                      type="button"
                      onClick={() => {
                        setNewClientName(client.companyName);
                        setSelectedClientId(client.clientId);
                        setSelectedClientAddress(client.address || "");
                        setSelectedClientGst(client.gstNumber || "");
                        setSelectedClientState(client.state || "");
                        setShowSuggestions(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-surface text-default font-medium border-b border-soft last:border-0"
                    >
                      <p className="font-semibold">{client.companyName}</p>
                      {client.gstNumber && <p className="text-[10px] text-muted mt-0.5">GST: {client.gstNumber} - {client.state}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <select className="input-field h-11 sm:w-44" value={newFy} onChange={e => setNewFy(e.target.value)}>
              {[...FINANCIAL_YEARS].reverse().map(y => <option key={y}>{y}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button onClick={createQuotation} disabled={creating} className="btn-primary h-11 justify-center px-5">
                {creating ? "Creating..." : "Create"}
              </button>
              <button 
                onClick={() => { 
                  setShowNewForm(false); 
                  setNewClientName(""); 
                  setSelectedClientId(""); 
                  setSelectedClientAddress("");
                  setSelectedClientGst("");
                  setSelectedClientState("");
                  setNewFy(effectiveFinancialYear);
                  setShowSuggestions(false); 
                }} 
                className="btn-secondary h-11 justify-center px-4"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── FILTERS ─── */}
      <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:gap-3">
        {/* Quick filter tabs */}
        <div className="scrollbar-none flex w-full gap-1 overflow-x-auto rounded-2xl border border-base bg-surface p-1 xl:w-auto xl:rounded-xl">
          {QUICK_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-all xl:rounded-lg xl:py-1.5 ${
                statusFilter === f.key
                  ? "bg-card shadow-sm text-default"
                  : "text-muted hover:text-default"
              }`}
            >
              {f.icon && <f.icon className="w-3 h-3" />}
              <span className="sm:hidden">{f.mobileLabel || f.label}</span>
              <span className="hidden sm:inline">{f.label}</span>
            </button>
          ))}
        </div>

        <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-[320px_140px]">
          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint" />
            <input
              className="input-field h-11 w-full text-sm sm:h-9"
              style={{ paddingLeft: "2.25rem" }}
              placeholder="Search client, quote no., FY, status..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* FY Filter */}
          <div className="relative">
            <Filter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint" />
            <select
              className="input-field h-11 w-full text-sm sm:h-9"
              style={{ paddingLeft: "2.25rem", paddingRight: "2rem" }}
              value={fyFilter}
              onChange={e => setFyFilter(e.target.value)}
            >
              <option value="all">All Years</option>
              {[...FINANCIAL_YEARS].reverse().map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ─── QUOTATIONS LIST ─── */}
      <div className="overflow-hidden rounded-[22px] border border-base bg-card shadow-sm sm:rounded-2xl">
        {loading ? (
          <div className="p-8 text-center sm:p-12">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-muted text-sm">Loading quotations...</p>
          </div>
        ) : quotations.length === 0 ? (
          <div className="min-h-[312px] p-10 sm:p-16 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-faint" />
            </div>
            <p className="font-medium text-muted">No quotations found</p>
            <p className="text-sm text-faint mt-1">
              {isFiltered ? "No quotations match these filters." : "Create your first quotation to get started."}
            </p>
            {isFiltered ? (
              <button onClick={clearFilters} className="btn-secondary mt-5 mx-auto justify-center">
                Clear filters
              </button>
            ) : (
              <button onClick={() => setShowNewForm(true)} className="btn-primary mt-5 mx-auto justify-center gap-2">
                <Plus className="w-4 h-4" /> New Quotation
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-2 p-2 md:hidden">
              {quotations.map(q => (
                <article
                  key={q._id}
                  onClick={() => router.push(`/dashboard/quotations/${q._id}`)}
                  className="rounded-[20px] border border-base bg-[#f7f7f9] p-3.5 shadow-sm transition duration-200 active:scale-[0.99] dark:bg-white/[0.035]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold leading-5 text-default">{q.clientName}</p>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                        <span className="inline-flex min-w-0 items-center gap-1 font-mono font-semibold text-default">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-faint" />
                          <span className="truncate">{q.quotationNumber || "Draft"}</span>
                        </span>
                        <span>{q.financialYear}</span>
                        <span>{q.itemCount} item{q.itemCount !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedQuotation(q);
                      }}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-base bg-card text-muted transition-colors hover:text-default active:scale-[0.96]"
                      title="More actions"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <QuotationStatusPill status={q.status} />
                    <span className="rounded-full border border-base bg-card px-2.5 py-1 text-[11px] font-mono font-medium text-muted">
                      Rev {q.currentRevisionNumber}
                    </span>
                    {formatDaysLeft(q.validTill)}
                  </div>

                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 rounded-2xl border border-base bg-card/80 p-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase text-muted">Amount</p>
                      <p className="mt-0.5 truncate text-lg font-bold text-default">{formatCurrency(q.grandTotal)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-semibold uppercase text-muted">Valid Till</p>
                      <p className="mt-0.5 text-xs font-medium text-default">
                        {q.validTill ? new Date(q.validTill).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-base pt-3">
                    <span className="text-xs text-muted">Updated {new Date(q.updatedAt || q.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
                      Open <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-black/[0.05] dark:border-white/[0.05]">
                  {["Quote No.", "Client", "FY", "Amount", "Status", "Rev", "Valid Till", ""].map((h, i) => (
                    <th key={h || `col-${i}`} className="text-left px-5 py-3.5 text-xs font-semibold text-muted uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.035]">
                {quotations.map(q => (
                  <tr
                    key={q._id}
                    onClick={() => router.push(`/dashboard/quotations/${q._id}`)}
                    className="hover:bg-surface cursor-pointer transition-colors group"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-faint shrink-0" />
                        <span className="font-mono text-xs font-semibold text-default">
                          {q.quotationNumber || <span className="text-faint italic font-sans font-normal">Draft</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-default text-sm">{q.clientName}</p>
                      <p className="text-xs text-muted mt-0.5">{q.itemCount} line item{q.itemCount !== 1 ? "s" : ""}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs font-medium text-muted bg-surface px-2 py-1 rounded-md">
                        {q.financialYear}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-semibold text-default text-sm">{formatCurrency(q.grandTotal)}</span>
                    </td>
                    <td className="px-5 py-4">
                      <QuotationStatusPill status={q.status} />
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs font-mono bg-surface border border-base px-2 py-0.5 rounded-md text-muted">
                        Rev {q.currentRevisionNumber}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-muted">
                          {q.validTill ? new Date(q.validTill).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-"}
                        </span>
                        {formatDaysLeft(q.validTill)}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/dashboard/quotations/${q._id}`);
                          }}
                          className="p-1.5 rounded-lg hover:bg-surface transition-colors text-muted hover:text-default"
                          title="Open Editor"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedQuotation(q);
                          }}
                          className="p-1.5 rounded-lg hover:bg-surface transition-colors text-muted hover:text-default"
                          title="More actions"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>

      {/* Legend */}
      <div className="scrollbar-none flex items-center gap-3 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:gap-x-4 sm:gap-y-2 sm:overflow-visible sm:pb-0">
        {(Object.entries(QUOTATION_STATUS_CONFIG) as [QuotationStatus, typeof QUOTATION_STATUS_CONFIG[QuotationStatus]][]).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
            className={`flex shrink-0 items-center gap-1.5 text-xs transition-opacity ${statusFilter !== "all" && statusFilter !== key ? "opacity-40" : "opacity-100"}`}
          >
            <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            <span className="text-muted">{cfg.label}</span>
          </button>
        ))}
      </div>

      {/* ─── ACTIONS MODAL ─── */}
      <Modal
        open={selectedQuotation !== null}
        onClose={() => setSelectedQuotation(null)}
        title={selectedQuotation?.quotationNumber || "Quotation Actions"}
        subtitle={selectedQuotation?.clientName}
      >
        {selectedQuotation && (
          <div className="space-y-3 sm:space-y-4">
            <div className="mb-2 grid grid-cols-3 gap-2 rounded-xl border border-base bg-surface p-3 sm:flex sm:items-center sm:justify-between sm:p-4">
              <div className="min-w-0">
                <p className="text-xs text-muted">Status</p>
                <div className="mt-1"><QuotationStatusPill status={selectedQuotation.status} /></div>
              </div>
              <div className="min-w-0 text-right">
                <p className="text-xs text-muted">Amount</p>
                <p className="mt-1 truncate text-sm font-bold text-default">{formatCurrency(selectedQuotation.grandTotal)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted">Revision</p>
                <p className="text-sm font-mono font-bold text-default mt-1">Rev {selectedQuotation.currentRevisionNumber}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => {
                  router.push(`/dashboard/quotations/${selectedQuotation._id}`);
                  setSelectedQuotation(null);
                }}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-base hover:bg-surface text-sm font-medium transition-colors text-default"
              >
                <span className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-muted" /> Open in Editor
                </span>
                <ChevronRight className="w-4 h-4 text-faint" />
              </button>

              <button
                onClick={async (e) => {
                  await duplicate(selectedQuotation._id, e);
                  setSelectedQuotation(null);
                }}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-base hover:bg-surface text-sm font-medium transition-colors text-default"
                title="Create a new draft from this quotation"
              >
                <span className="flex items-center gap-3">
                  <Copy className="w-4 h-4 text-muted" /> Duplicate as Draft
                </span>
                <ChevronRight className="w-4 h-4 text-faint" />
              </button>

              {canCreateQuotationRevision(selectedQuotation.status) && (
                <button
                  onClick={async (e) => {
                    await createRevision(selectedQuotation._id, e);
                    setSelectedQuotation(null);
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-base hover:bg-surface text-sm font-medium transition-colors text-default"
                >
                  <span className="flex items-center gap-3">
                    <GitBranch className="w-4 h-4 text-muted" /> Create New Revision
                  </span>
                  <ChevronRight className="w-4 h-4 text-faint" />
                </button>
              )}

              <button
                onClick={() => {
                  router.push(`/dashboard/quotations/${selectedQuotation._id}?action=print`);
                  setSelectedQuotation(null);
                }}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-base hover:bg-surface text-sm font-medium transition-colors text-default"
              >
                <span className="flex items-center gap-3">
                  <Printer className="w-4 h-4 text-muted" /> Print / Preview
                </span>
                <ChevronRight className="w-4 h-4 text-faint" />
              </button>

              {canCreateQuotationEmailDraft(selectedQuotation.status) && (
                <button
                  onClick={() => {
                    router.push(`/dashboard/quotations/${selectedQuotation._id}?action=email`);
                    setSelectedQuotation(null);
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-base hover:bg-surface text-sm font-medium transition-colors text-default"
                >
                  <span className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-muted" /> Create Email Draft
                  </span>
                  <ChevronRight className="w-4 h-4 text-faint" />
                </button>
              )}
            </div>

            <div className="border-t border-base pt-3 mt-3">
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  setQuotationToDelete(selectedQuotation);
                  setSelectedQuotation(null);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/20 text-sm font-medium transition-colors text-red-500"
              >
                <Trash2 className="w-4 h-4" /> Delete Quotation Permanently
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={quotationToDelete !== null}
        onClose={() => setQuotationToDelete(null)}
        title="Delete quotation?"
        subtitle={quotationToDelete?.quotationNumber || quotationToDelete?.clientName}
        size="sm"
      >
        {quotationToDelete && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              This will permanently delete the quotation and its revisions. This action cannot be undone.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <button className="btn-secondary justify-center px-4" onClick={() => setQuotationToDelete(null)}>
                Cancel
              </button>
              <button
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
                onClick={async (e) => {
                  await deleteQuotation(quotationToDelete._id, e);
                  setQuotationToDelete(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

"use client";
import { useClientSearch } from "@/lib/search/use-client-search";

import React, { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { CategoryBreakdown } from "@/components/ui/CategoryBreakdown";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import TableWrapper from "@/components/ui/TableWrapper";
import EmptyState from "@/components/ui/EmptyState";
import FYTabBar from "@/components/ui/FYTabBar";
import { Plus, Pencil, Trash2, BarChart2, ChevronDown, Search, X, Recycle, Leaf } from "lucide-react";
import { useCache, invalidate } from "@/lib/useCache";
import { useFinancialYearState } from "@/app/providers";
import FinancialYearInsightsModal from "./FinancialYearInsightsModal";
import FinancialYearModal from "@/components/financial-year/FinancialYearModal";

import {
  RemainingTooltip,
  TD,
  TH,
  buildEntryValueMap,
  type Client,
  type FYRecord,
} from "./FinancialYearSupport";

export default function FinancialYearPage() {
  const [fy, setFy, financialYearLoaded] = useFinancialYearState();
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<FYRecord | null>(null);
  const [breakdownRec, setBreakdownRec] = useState<FYRecord | null>(null);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [expandedFY, setExpandedFY] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const targetDeepLinkHandled = useRef(false);
  const [modalContext, setModalContext] = useState({ clientId: "", financialYear: fy });

  const { data: records, loading: recLoading, refetch: refetchRecords, mutate: mutateRecords } =
    useCache<FYRecord[]>(`/api/financial-year?fy=${fy}`, { enabled: financialYearLoaded, initialData: [] });
  const { data: clients, loading: clientsLoading } = useCache<Client[]>("/api/clients", { initialData: [] });

  const matchedClientIds = useClientSearch(clients, search);

  const clientMap = useMemo(() => new Map(clients.map((client) => [client.clientId, client])), [clients]);
  const getCategory = (id: string) => clientMap.get(id)?.category || "";
  const getClientName = (id: string) => clientMap.get(id)?.companyName || id;

  const filteredRecords = useMemo(() => records.filter((rec) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const client = clientMap.get(rec.clientId);
    const clientName = client?.companyName || rec.clientId;
    const category = client?.category || "";

    return (
      matchedClientIds.has(rec.clientId) ||
      rec.financialYear.toLowerCase().includes(q) ||
      clientName.toLowerCase().includes(q) ||
      rec.clientId.toLowerCase().includes(q) ||
      category.toLowerCase().includes(q)
    );
  }), [clientMap, records, search, matchedClientIds]);

  // -- Modal open helpers --------------------------------------------------

  const openAdd = () => {
    setEditRecord(null); setModalContext({ clientId: "", financialYear: fy }); setModalOpen(true);
  };
  const openEditFromInsights = (record: FYRecord) => { setInsightsOpen(false); openEdit(record); };
  const openEdit = (record: FYRecord) => {
    setEditRecord(record); setModalContext({ clientId: record.clientId, financialYear: record.financialYear }); setModalOpen(true);
  };

  useEffect(() => {
    if (!financialYearLoaded || targetDeepLinkHandled.current) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("open") !== "targets") {
      targetDeepLinkHandled.current = true;
      return;
    }

    const linkedClientId = params.get("clientId")?.trim();
    const linkedFy = params.get("fy")?.trim();
    if (!linkedClientId || !linkedFy) {
      targetDeepLinkHandled.current = true;
      return;
    }

    if (linkedFy !== fy) {
      setFy(linkedFy);
      return;
    }
    if (recLoading || clientsLoading) return;

    setSearch(linkedClientId);
    const record = records.find((entry) => entry.clientId === linkedClientId && entry.financialYear === linkedFy);
    if (record || clientMap.has(linkedClientId)) {
      setEditRecord(record || null); setModalContext({ clientId: linkedClientId, financialYear: linkedFy }); setModalOpen(true);
    } else toast.error("The linked client could not be found.");

    targetDeepLinkHandled.current = true;
  }, [clientMap, clientsLoading, financialYearLoaded, fy, recLoading, records, setFy]);

  // -- Delete --------------------------------------------------------------

  const handleDelete = async (rec: FYRecord) => {
    if (!confirm(`Delete FY record for ${getClientName(rec.clientId)} - ${rec.financialYear}?`)) return;
    setDeletingId(rec._id);
    try {
      const res = await fetch(`/api/financial-year/${rec._id}`, { method: "DELETE" });
      if (res.ok) { toast.success("Record deleted"); invalidate("/api/financial-year", "/api/dashboard"); refetchRecords(); }
      else toast.error("Failed to delete");
    } catch {
      toast.error("Something went wrong deleting the record");
    } finally {
      setDeletingId(null);
    }
  };

  /**
   * Build typed entries + achievedMap for the breakdown modal.
   * For PIBO: uses targets[] with per-type achieved values.
   * For PWP:  uses generated[] with per-type sold values.
   * Falls back to flat legacy rows when no typed array is present.
   */
  const makeBreakdownProps = (rec: FYRecord, cat: string) => {
    const isPWPRow = cat === "PWP";

    if (isPWPRow) {
      const entries = Array.isArray(rec.generated) && rec.generated.length > 0 ? rec.generated : null;
      if (entries) {
        const achievedMap = buildEntryValueMap(rec.soldByType);
        return { entries, achievedMap, rows: undefined };
      }
      // Legacy flat fallback
      return {
        entries: null,
        rows: [
          { label: "CAT-I",   base: rec.cat1Generated ?? 0, used: rec.soldCat1 ?? 0 },
          { label: "CAT-II",  base: rec.cat2Generated ?? 0, used: rec.soldCat2 ?? 0 },
          { label: "CAT-III", base: rec.cat3Generated ?? 0, used: rec.soldCat3 ?? 0 },
          { label: "CAT-IV",  base: rec.cat4Generated ?? 0, used: rec.soldCat4 ?? 0 },
        ],
      };
    }

    // The shared coverage engine uses the original record; never infer legacy type allocations.
    return { entries: rec.targets ?? [], achievedMap: buildEntryValueMap(rec.achievedByType), rows: undefined };
  };

  // -- Render --------------------------------------------------------------

  return (
    <div>
      <PageHeader title="Financial Year" description="Manage category-wise targets and credits per FY">
        <button className="glass-btn" onClick={() => setInsightsOpen(true)}>
          <BarChart2 className="w-3.5 h-3.5" /> Targets &amp; Credits
        </button>
        <button className="glass-btn glass-btn-primary" onClick={openAdd}><Plus className="w-3.5 h-3.5" /> Add Record</button>
      </PageHeader>

      <FYTabBar value={fy} onChange={setFy} />

      {/* Search */}
      <div className="bg-card border border-base rounded-2xl p-3 mb-4 shadow-sm transition-colors">
        <div className="flex items-center gap-2 bg-surface rounded-xl px-3">
          <Search className="w-4 h-4 text-faint flex-shrink-0" />
          <input
            type="text"
            placeholder="Search by client name, ID or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent border-0 ring-0 outline-none flex-1 py-2 text-sm text-default placeholder:text-faint"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-faint hover:text-default transition-colors flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Colour legend */}
      <div className="flex flex-wrap gap-4 mb-4 px-1 text-xs text-[var(--color-text-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
          <span><b className="text-[var(--color-text)]">PWP</b> - credits remaining (more = better)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
          <span><b className="text-[var(--color-text)]">PIBO</b> - target remaining (less = better; 0 = fully achieved)</span>
        </span>
      </div>

      {/* -- DESKTOP TABLE -- */}
      <div className="bg-card rounded-2xl shadow-sm border border-base hidden lg:block">
        {recLoading ? <LoadingSpinner /> : filteredRecords.length === 0 ? (
          <EmptyState message={search ? `No results for "${search}"` : "No records for this FY"} />
        ) : (
          <TableWrapper>
            <table className="w-full table-fixed">
              <colgroup>
                <col style={{ width: "220px" }} />
                <col style={{ width: "100px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "110px" }} />
                <col style={{ width: "160px" }} />
                <col style={{ width: "80px" }} />
              </colgroup>
              <thead>
                <tr>
                  <TH first>Client</TH><TH>Type</TH>
                  <TH right>CAT-I</TH><TH right>CAT-II</TH><TH right>CAT-III</TH><TH right>CAT-IV</TH>
                  <TH right>Total</TH><TH right>Used / Achieved</TH><TH>Remaining</TH><TH last />
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((rec) => {
                  const cat = getCategory(rec.clientId);
                  const isPWPRow = cat === "PWP";
                  const isSIMPRow = cat === "SIMP";
                  const deleting = deletingId === rec._id;
                  const cat1 = isPWPRow ? (rec.cat1Generated ?? 0) : (rec.cat1Target ?? 0);
                  const cat2 = isPWPRow ? (rec.cat2Generated ?? 0) : (rec.cat2Target ?? 0);
                  const cat3 = isPWPRow ? (rec.cat3Generated ?? 0) : (rec.cat3Target ?? 0);
                  const cat4 = isPWPRow ? (rec.cat4Generated ?? 0) : (rec.cat4Target ?? 0);
                  const total = cat1 + cat2 + cat3 + cat4;
                  const used = isPWPRow ? (rec.totalSold ?? 0) : (rec.totalAchieved ?? 0);

                  // Type-split cell renderer for both PWP (generated[]) and PIBO (targets[])
                  const hasTypedGenerated = isPWPRow && Array.isArray(rec.generated) && rec.generated.length > 0;
                  const hasTypedTargets   = !isPWPRow && Array.isArray(rec.targets) && rec.targets.length > 0;
                  const hasTypedSplit     = hasTypedGenerated || hasTypedTargets;
                  const typedCatCell = (catId: string) => {
                    if (!hasTypedSplit) return null;
                    const source = hasTypedGenerated ? rec.generated! : rec.targets!;
                    const entries = source.filter((t) => t.categoryId === catId);
                    if (entries.length === 0) return <span className="text-[var(--color-text-faint)] font-mono text-xs">-</span>;
                    return (
                      <div className="text-right space-y-0.5">
                        {entries.map((e) => (
                          <div key={e.type} className="flex items-center justify-end gap-1">
                            {e.type === "RECYCLING"
                              ? <Recycle className="w-2.5 h-2.5 text-teal-500 flex-shrink-0" />
                              : <Leaf className="w-2.5 h-2.5 text-amber-500 flex-shrink-0" />}
                            <span className="font-mono text-xs">{e.value.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    );
                  };

                  return (
                    <tr key={rec._id} className={`hover:bg-surface transition-colors ${deleting ? "opacity-30" : ""}`}>
                      <TD>
                        <p className="font-medium truncate">{getClientName(rec.clientId)}</p>
                        <p className="text-xs text-[var(--color-text-faint)] font-mono">{rec.clientId}</p>
                      </TD>
                      <TD>{cat && <CategoryBadge category={cat} />}</TD>
                      {isSIMPRow ? (
                        <td
                          colSpan={7}
                          className="px-4 py-3 text-sm border-t border-[var(--color-border-soft)] text-[var(--color-text-faint)]"
                        >
                          <span className="text-xs italic">SIMP - no targets/credits tracked</span>
                        </td>
                      ) : (
                        <>
                          <TD right mono>{hasTypedSplit ? typedCatCell("1") : cat1.toLocaleString()}</TD>
                          <TD right mono>{hasTypedSplit ? typedCatCell("2") : cat2.toLocaleString()}</TD>
                          <TD right mono>{hasTypedSplit ? typedCatCell("3") : cat3.toLocaleString()}</TD>
                          <TD right mono>{hasTypedSplit ? typedCatCell("4") : cat4.toLocaleString()}</TD>
                          <TD right><span className="font-semibold">{total.toLocaleString()}</span></TD>
                          <TD right><span className="font-semibold text-blue-500">{used.toLocaleString()}</span></TD>
                          <TD>
                            <div className="flex items-center gap-1.5">
                              <RemainingTooltip rec={rec} isPWP={isPWPRow} />
                              <button
                                onClick={() => setBreakdownRec(rec)}
                                title="Category breakdown"
                                className="p-1 text-[var(--color-text-faint)] hover:text-blue-500
                                           hover:bg-blue-500/10 rounded-lg transition-colors flex-shrink-0"
                              >
                                <BarChart2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </TD>
                        </>
                      )}
                      <TD>
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(rec)} disabled={deleting}
                            className="p-1.5 text-[var(--color-text-faint)] hover:text-amber-500
                                       hover:bg-amber-500/10 rounded-lg transition-colors">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(rec)} disabled={deleting}
                            className="p-1.5 text-[var(--color-text-faint)] hover:text-red-500
                                       hover:bg-red-500/10 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </TD>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrapper>
        )}
      </div>

      {/* -- MOBILE CARDS -- */}
      <div className="lg:hidden space-y-2">
        {recLoading ? <LoadingSpinner /> : filteredRecords.length === 0 ? (
          <EmptyState message={search ? `No results for "${search}"` : "No records for this FY"} />
        ) : filteredRecords.map((rec) => {
          const cat = getCategory(rec.clientId);
          const isPWPRow = cat === "PWP";
          const isSIMPRow = cat === "SIMP";
          const deleting = deletingId === rec._id;
          const cat1 = isPWPRow ? (rec.cat1Generated ?? 0) : (rec.cat1Target ?? 0);
          const cat2 = isPWPRow ? (rec.cat2Generated ?? 0) : (rec.cat2Target ?? 0);
          const cat3 = isPWPRow ? (rec.cat3Generated ?? 0) : (rec.cat3Target ?? 0);
          const cat4 = isPWPRow ? (rec.cat4Generated ?? 0) : (rec.cat4Target ?? 0);
          const total = cat1 + cat2 + cat3 + cat4;
          const used = isPWPRow ? (rec.totalSold ?? 0) : (rec.totalAchieved ?? 0);
          const isExp = expandedFY === rec._id;
          // Type-split display for both PWP (generated[]) and PIBO (targets[])
          const mobileHasTypedGenerated = isPWPRow && Array.isArray(rec.generated) && rec.generated.length > 0;
          const mobileHasTypedTargets   = !isPWPRow && Array.isArray(rec.targets) && rec.targets.length > 0;
          const mobileHasTypedSplit     = mobileHasTypedGenerated || mobileHasTypedTargets;
          return (
            <div key={rec._id}
              className={`bg-card border border-base rounded-2xl shadow-sm overflow-hidden
                          transition-colors ${deleting ? "opacity-40" : ""}`}>
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover transition-colors"
                onClick={() => setExpandedFY(isExp ? null : rec._id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-semibold text-sm text-default truncate">{getClientName(rec.clientId)}</span>
                    {cat && <CategoryBadge category={cat} />}
                  </div>
                  <p className="text-xs text-faint font-mono">{rec.clientId}</p>
                </div>
                {!isSIMPRow && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-faint">{isPWPRow ? "Generated" : "Target"}</p>
                    <p className="font-bold text-sm text-default">{total.toLocaleString()}</p>
                  </div>
                )}
                <ChevronDown
                  className="w-4 h-4 text-faint flex-shrink-0 transition-transform duration-200"
                  style={{ transform: isExp ? "rotate(180deg)" : "rotate(0deg)" }}
                />
              </button>
              {isExp && (
                <div className="card-expand px-4 pb-4 border-t border-soft pt-3 space-y-3">
                  {isSIMPRow ? (
                    <p className="text-xs italic text-faint">SIMP - no targets/credits tracked</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {([
                          { label: "CAT-I",   catId: "1", val: cat1 },
                          { label: "CAT-II",  catId: "2", val: cat2 },
                          { label: "CAT-III", catId: "3", val: cat3 },
                          { label: "CAT-IV",  catId: "4", val: cat4 },
                        ]).map(({ label, catId, val }) => {
                          const mobileSource = mobileHasTypedGenerated ? rec.generated! : rec.targets!;
                          const typedEntries = mobileHasTypedSplit
                            ? mobileSource.filter((t) => t.categoryId === catId)
                            : [];
                          return (
                            <div key={label} className="bg-surface rounded-lg px-3 py-2">
                              <span className="text-faint block mb-1">{label}</span>
                              {typedEntries.length > 0 ? (
                                <div className="space-y-0.5">
                                  {typedEntries.map((e) => (
                                    <div key={e.type} className="flex items-center gap-1">
                                      {e.type === "RECYCLING"
                                        ? <Recycle className="w-2.5 h-2.5 text-teal-500 flex-shrink-0" />
                                        : <Leaf className="w-2.5 h-2.5 text-amber-500 flex-shrink-0" />}
                                      <span className="font-mono font-semibold text-default">{e.value.toLocaleString()}</span>
                                      <span className="text-faint text-[10px]">{e.type === "RECYCLING" ? "R" : "E"}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="font-mono font-semibold text-default">{Number(val).toLocaleString()}</span>
                              )}
                            </div>
                          );
                        })}
                        <div className="bg-surface rounded-lg px-3 py-2">
                          <span className="text-faint block">Total</span>
                          <span className="font-mono font-bold text-default">{total.toLocaleString()}</span>
                        </div>
                        <div className="bg-surface rounded-lg px-3 py-2">
                          <span className="text-faint block">{isPWPRow ? "Sold" : "Achieved"}</span>
                          <span className="font-mono font-semibold text-blue-500">{used.toLocaleString()}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setBreakdownRec(rec)}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg
                                   border border-base hover:bg-hover transition-colors text-muted"
                      >
                        <BarChart2 className="w-3.5 h-3.5" />Breakdown
                      </button>
                    </>
                  )}
                  <div className="glass-tray" style={{ marginTop: "8px", width: "100%" }}>
                    <button onClick={() => openEdit(rec)} disabled={deleting}
                      className="glass-pill flex-1 justify-center">
                      <Pencil className="w-3.5 h-3.5" />Edit
                    </button>
                    <button onClick={() => handleDelete(rec)} disabled={deleting}
                      className="glass-pill flex-1 justify-center" style={{ color: "#ff3b30" }}>
                      <Trash2 className="w-3.5 h-3.5" />Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* -- Breakdown modal -- */}
      {breakdownRec && (() => {
        const _bCat = getCategory(breakdownRec.clientId);
        const _bProps = makeBreakdownProps(breakdownRec, _bCat);
        return (
          <Modal open={!!breakdownRec} onClose={() => setBreakdownRec(null)}
            title={`${getClientName(breakdownRec.clientId)} - FY ${breakdownRec.financialYear}`} size="lg">
            <CategoryBreakdown
              clientType={_bCat === "PWP" ? "PWP" : "PIBO"}
              entries={_bProps.entries ?? undefined}
              achievedMap={_bProps.achievedMap}
              record={breakdownRec}
              rows={_bProps.rows}
            />
          </Modal>
        );
      })()}

      <FinancialYearInsightsModal
        open={insightsOpen}
        onClose={() => setInsightsOpen(false)}
        financialYear={fy}
        loading={recLoading}
        records={records}
        clients={clients}
        onEditRecord={openEditFromInsights}
      />

      <FinancialYearModal open={modalOpen} onClose={() => setModalOpen(false)} clients={clients}
        initialClientId={modalContext.clientId} initialFinancialYear={modalContext.financialYear} initialRecord={editRecord}
        onSaved={saved => {
          invalidate("/api/financial-year", "/api/dashboard", "/api/activities");
          if (saved.financialYear === fy && saved._id) mutateRecords(current => {
            const record = saved as FYRecord;
            return current.some(item => item._id === record._id) ? current.map(item => item._id === record._id ? record : item) : [...current, record];
          });
          else setFy(saved.financialYear);
        }} />
    </div>
  );
}

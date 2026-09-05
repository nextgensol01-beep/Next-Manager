"use client";
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
import { FINANCIAL_YEARS } from "@/lib/utils";
import { Plus, Pencil, Trash2, BarChart2, ChevronDown, Search, X, Recycle, Leaf, ScanText } from "lucide-react";
import { useCache, invalidate } from "@/lib/useCache";
import { useFinancialYearPreference, useFinancialYearState } from "@/app/providers";
import FinancialYearInsightsModal from "./FinancialYearInsightsModal";
import TargetScreenshotImporter from "./TargetScreenshotImporter";

import {
  RemainingTooltip,
  CAT_IDS,
  TargetRow,
  TD,
  TH,
  buildEntryValueMap,
  createEmptyGeneratedForm,
  emptyTarget,
  type Client,
  type FYRecord,
  type GeneratedEntry,
  type TargetEntry,
} from "./FinancialYearSupport";

const CREDIT_TYPE_VALUES = ["RECYCLING", "EOL"] as const;
const ENTRY_COMBO_COUNT = CAT_IDS.length * CREDIT_TYPE_VALUES.length;

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normaliseEntry(entry: TargetEntry): TargetEntry {
  return {
    categoryId: String(entry.categoryId),
    type: entry.type === "EOL" ? "EOL" : "RECYCLING",
    value: numberValue(entry.value),
  };
}

function activeEntries<T extends TargetEntry>(entries: T[]): T[] {
  return entries
    .map((entry) => normaliseEntry(entry) as T)
    .filter((entry) => (CAT_IDS as readonly string[]).includes(entry.categoryId) && entry.value > 0);
}

function duplicateEntryIndices(entries: TargetEntry[]) {
  const firstIndex = new Map<string, number>();
  const duplicates = new Set<number>();

  entries.forEach((rawEntry, index) => {
    const entry = normaliseEntry(rawEntry);
    if (entry.value <= 0) return;

    const key = `${entry.categoryId}|${entry.type}`;
    const first = firstIndex.get(key);

    if (first === undefined) {
      firstIndex.set(key, index);
      return;
    }

    duplicates.add(first);
    duplicates.add(index);
  });

  return duplicates;
}

function entrySummary(entries: TargetEntry[]) {
  return activeEntries(entries).reduce(
    (summary, entry) => {
      summary.total += entry.value;
      if (entry.type === "EOL") summary.eol += entry.value;
      else summary.recycling += entry.value;
      return summary;
    },
    { total: 0, recycling: 0, eol: 0 }
  );
}

function selectedEntryCombos(entries: TargetEntry[]) {
  return new Set(entries.map((entry) => `${entry.categoryId}|${entry.type === "EOL" ? "EOL" : "RECYCLING"}`));
}

function nextAvailableEntry(entries: TargetEntry[]): TargetEntry {
  const selected = selectedEntryCombos(entries);

  for (const categoryId of CAT_IDS) {
    for (const type of CREDIT_TYPE_VALUES) {
      if (!selected.has(`${categoryId}|${type}`)) {
        return { categoryId, type, value: 0 };
      }
    }
  }

  return emptyTarget();
}

function ensureEditableRows<T extends TargetEntry>(entries: T[]): T[] {
  return entries.length > 0 ? entries : [emptyTarget() as T];
}

function migratedLegacyEntries(rec: FYRecord, mode: "generated" | "targets"): TargetEntry[] {
  const migrated: TargetEntry[] = [];
  const record = rec as unknown as Record<string, unknown>;

  for (const categoryId of CAT_IDS) {
    const value = mode === "generated"
      ? numberValue(record[`cat${categoryId}Generated`] ?? record[`creditsCat${categoryId}`])
      : numberValue(record[`cat${categoryId}Target`] ?? record[`targetCat${categoryId}`]);

    if (value > 0) {
      migrated.push({ categoryId, type: "RECYCLING", value });
    }
  }

  return migrated;
}

export default function FinancialYearPage() {
  const [fy, setFy, financialYearLoaded] = useFinancialYearState();
  const { effectiveFinancialYear } = useFinancialYearPreference();
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<FYRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [breakdownRec, setBreakdownRec] = useState<FYRecord | null>(null);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [expandedFY, setExpandedFY] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const targetDeepLinkHandled = useRef(false);
  const [screenshotImporterOpen, setScreenshotImporterOpen] = useState(false);
  const [screenshotImportConfirmed, setScreenshotImportConfirmed] = useState(false);

  // Form state - generated fields (PWP) + targets[] (PIBO)
  const [genForm, setGenForm] = useState(() => createEmptyGeneratedForm(effectiveFinancialYear));
  const [generated, setGenerated] = useState<GeneratedEntry[]>([]);
  const [targets, setTargets] = useState<TargetEntry[]>([]);

  const { data: records, loading: recLoading, refetch: refetchRecords } =
    useCache<FYRecord[]>(`/api/financial-year?fy=${fy}`, { enabled: financialYearLoaded, initialData: [] });
  const { data: clients, loading: clientsLoading } = useCache<Client[]>("/api/clients", { initialData: [] });

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
      clientName.toLowerCase().includes(q) ||
      rec.clientId.toLowerCase().includes(q) ||
      category.toLowerCase().includes(q)
    );
  }), [clientMap, records, search]);

  // -- Modal open helpers --------------------------------------------------

  const openAdd = () => {
    setEditRecord(null);
    setScreenshotImportConfirmed(false);
    setGenForm(createEmptyGeneratedForm(fy));
    setGenerated([emptyTarget()]);
    setTargets([emptyTarget()]);
    setModalOpen(true);
  };

  const openEditFromInsights = (rec: FYRecord) => {
    setInsightsOpen(false);
    openEdit(rec);
  };

  const openEdit = (rec: FYRecord) => {
    setEditRecord(rec);
    setScreenshotImportConfirmed(false);
    setGenForm({
      clientId: rec.clientId,
      financialYear: rec.financialYear,
    });

    // Populate generated[]: use new structure if present, migrate from legacy flat fields
    const recordGenerated = activeEntries(rec.generated ?? []);
    if (recordGenerated.length > 0) {
      setGenerated(recordGenerated.map((t) => ({ ...t })));
    } else {
      setGenerated(ensureEditableRows(migratedLegacyEntries(rec, "generated") as GeneratedEntry[]));
    }

    // Populate targets[]: use new structure if present, migrate from legacy flat fields
    const recordTargets = activeEntries(rec.targets ?? []);
    if (recordTargets.length > 0) {
      setTargets(recordTargets.map((t) => ({ ...t })));
    } else {
      setTargets(ensureEditableRows(migratedLegacyEntries(rec, "targets")));
    }

    setModalOpen(true);
  };

  const openScreenshotImporter = () => {
    if (!genForm.clientId || !genForm.financialYear) {
      toast.error("Select a client and financial year first.");
      return;
    }
    setScreenshotImportConfirmed(false);
    setModalOpen(false);
    setScreenshotImporterOpen(true);
  };

  const closeScreenshotImporter = () => {
    setScreenshotImporterOpen(false);
    setModalOpen(true);
  };

  const confirmScreenshotTargets = (reviewedTargets: TargetEntry[]) => {
    setTargets(reviewedTargets);
    setScreenshotImportConfirmed(true);
    setScreenshotImporterOpen(false);
    setModalOpen(true);
    toast.success("Verified screenshot values added to the form. Click Save Record to update the database.");
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
    if (record) {
      setEditRecord(record);
      setGenForm({ clientId: record.clientId, financialYear: record.financialYear });

      const recordGenerated = activeEntries(record.generated ?? []);
      setGenerated(recordGenerated.length > 0
        ? recordGenerated.map((entry) => ({ ...entry }))
        : ensureEditableRows(migratedLegacyEntries(record, "generated") as GeneratedEntry[]));

      const recordTargets = activeEntries(record.targets ?? []);
      setTargets(recordTargets.length > 0
        ? recordTargets.map((entry) => ({ ...entry }))
        : ensureEditableRows(migratedLegacyEntries(record, "targets")));
      setModalOpen(true);
    } else if (clientMap.has(linkedClientId)) {
      setEditRecord(null);
      setGenForm({ clientId: linkedClientId, financialYear: linkedFy });
      setGenerated([emptyTarget()]);
      setTargets([emptyTarget()]);
      setModalOpen(true);
    } else {
      toast.error("The linked client could not be found.");
    }

    targetDeepLinkHandled.current = true;
  }, [clientMap, clientsLoading, financialYearLoaded, fy, recLoading, records, setFy]);

  // -- Target row mutations ------------------------------------------------

  const handleGeneratedChange = (idx: number, updated: GeneratedEntry) => {
    setGenerated((prev) => prev.map((t, i) => (i === idx ? updated : t)));
  };
  const addGenerated = () => setGenerated((prev) => (
    selectedEntryCombos(prev).size >= ENTRY_COMBO_COUNT ? prev : [...prev, nextAvailableEntry(prev)]
  ));
  const removeGenerated = (idx: number) =>
    setGenerated((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

  const handleTargetChange = (idx: number, updated: TargetEntry) => {
    setTargets((prev) => prev.map((t, i) => (i === idx ? updated : t)));
  };

  const addTarget = () => setTargets((prev) => (
    selectedEntryCombos(prev).size >= ENTRY_COMBO_COUNT ? prev : [...prev, nextAvailableEntry(prev)]
  ));

  const removeTarget = (idx: number) =>
    setTargets((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

  const genDupeIndices = useMemo(() => duplicateEntryIndices(generated), [generated]);
  const dupeIndices = useMemo(() => duplicateEntryIndices(targets), [targets]);
  const hasGenDupes = genDupeIndices.size > 0;
  const hasTgtDupes = dupeIndices.size > 0;
  const hasDupes = hasGenDupes || hasTgtDupes;
  const canAddGenerated = useMemo(() => selectedEntryCombos(generated).size < ENTRY_COMBO_COUNT, [generated]);
  const canAddTarget = useMemo(() => selectedEntryCombos(targets).size < ENTRY_COMBO_COUNT, [targets]);

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

  // -- Submit --------------------------------------------------------------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasDupes) { toast.error("Remove duplicate category+type combinations before saving"); return; }

    try {
      const selectedCat = getCategory(genForm.clientId);
      const isPWP = selectedCat === "PWP";
      const isSIMP = selectedCat === "SIMP";

      if (!selectedCat) {
        toast.error("Select a client before saving");
        return;
      }
      if (isSIMP) {
        toast.error("SIMP clients do not need targets or credits");
        return;
      }

      const generatedToSave = activeEntries(generated);
      const targetsToSave = activeEntries(targets);
      const entriesToSave = isPWP ? generatedToSave : targetsToSave;

      if (!editRecord && entriesToSave.length === 0) {
        toast.error(`Enter at least one ${isPWP ? "generated credit" : "target"} value before saving`);
        return;
      }

      setSaving(true);

      const payload: Record<string, unknown> = {
        clientId: genForm.clientId,
        financialYear: genForm.financialYear,
      };

      if (isPWP) {
        // Include generated[] - backend derives flat cat1Generated...cat4Generated
        payload.generated = generatedToSave;
        payload.targets = [];
      } else {
        // Include targets[] - backend derives flat cat1Target...cat4Target
        payload.generated = [];
        payload.targets = targetsToSave;
        if (screenshotImportConfirmed) payload.targetImportReviewConfirmed = true;
      }

      const url = editRecord ? `/api/financial-year/${editRecord._id}` : "/api/financial-year";
      const method = editRecord ? "PUT" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) {
        const data = await r.json().catch(() => null);
        toast.error(data?.error || "Error saving");
        return;
      }
      toast.success(editRecord ? "Updated!" : "Saved!");
      invalidate("/api/financial-year", "/api/dashboard");
      setModalOpen(false);
      setScreenshotImportConfirmed(false);
      refetchRecords();
    } catch {
      toast.error("Something went wrong saving the record");
    } finally { setSaving(false); }
  };

  const selectedCat = getCategory(genForm.clientId);
  const isPWP = selectedCat === "PWP";
  const isSIMP = selectedCat === "SIMP";

  // Target totals for the summary bar
  const targetSummary = useMemo(() => entrySummary(targets), [targets]);
  const targetTotal = targetSummary.total;
  const targetTotalRecycl = targetSummary.recycling;
  const targetTotalEOL = targetSummary.eol;

  // Generated totals for PWP summary bar
  const generatedSummary = useMemo(() => entrySummary(generated), [generated]);
  const generatedTotal = generatedSummary.total;
  const generatedTotalRecycl = generatedSummary.recycling;
  const generatedTotalEOL = generatedSummary.eol;
  const hasActiveModalEntries = isPWP ? generatedTotal > 0 : targetTotal > 0;
  const saveDisabled = saving || !selectedCat || isSIMP || hasDupes || (!editRecord && !hasActiveModalEntries);

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

    // PIBO - targets with type breakdown
    const entries = Array.isArray(rec.targets) && rec.targets.length > 0 ? rec.targets : null;
    if (entries) {
      const achievedMapFromTx = buildEntryValueMap(rec.achievedByType);
      const hasTypedAchieved = Object.keys(achievedMapFromTx).length > 0;
      if (hasTypedAchieved) {
        return { entries, achievedMap: achievedMapFromTx, rows: undefined };
      }

      // Legacy fallback when typed transaction data is unavailable.
      const achievedMap: Record<string, number> = {};
      const catIds = [...new Set(entries.map((e) => e.categoryId))];
      for (const catId of catIds) {
        const catEntries = entries.filter((e) => e.categoryId === catId);
        const catTotal = catEntries.reduce((s, e) => s + e.value, 0);
        const rawAchieved =
          catId === "1" ? (rec.achievedCat1 ?? 0) :
          catId === "2" ? (rec.achievedCat2 ?? 0) :
          catId === "3" ? (rec.achievedCat3 ?? 0) :
          catId === "4" ? (rec.achievedCat4 ?? 0) : 0;
        for (const entry of catEntries) {
          const share = catTotal > 0 ? entry.value / catTotal : 1 / catEntries.length;
          achievedMap[`${catId}|${entry.type}`] = Math.round(rawAchieved * share);
        }
      }
      return { entries, achievedMap, rows: undefined };
    }

    // Legacy flat fallback
    return {
      entries: null,
      rows: [
        { label: "CAT-I",   base: rec.cat1Target ?? 0, used: rec.achievedCat1 ?? 0 },
        { label: "CAT-II",  base: rec.cat2Target ?? 0, used: rec.achievedCat2 ?? 0 },
        { label: "CAT-III", base: rec.cat3Target ?? 0, used: rec.achievedCat3 ?? 0 },
        { label: "CAT-IV",  base: rec.cat4Target ?? 0, used: rec.achievedCat4 ?? 0 },
      ],
    };
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

      {/* -- Add / Edit modal -- */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editRecord ? "Edit FY Record" : "Add FY Record"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Client + FY selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Client *</label>
              <select
                className="input-field"
                value={genForm.clientId}
                onChange={(e) => {
                  setScreenshotImportConfirmed(false);
                  setGenForm({ ...genForm, clientId: e.target.value });
                }}
                required
                disabled={!!editRecord}
              >
                <option value="">Select Client</option>
                {clients.map((c) => (
                  <option key={c.clientId} value={c.clientId}>
                    {c.companyName} ({c.category})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Financial Year *</label>
              <select
                className="input-field"
                value={genForm.financialYear}
                onChange={(e) => {
                  setScreenshotImportConfirmed(false);
                  setGenForm({ ...genForm, financialYear: e.target.value });
                }}
                required
              >
                {FINANCIAL_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* -- PWP: Credits Generated (per category + type) -- */}
          {selectedCat && isPWP && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                  Credits Generated - Category &amp; Type
                </p>
                <span className="text-[10px] text-faint">Same category can have both types</span>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[1fr_1.7fr_1fr_26px] items-center gap-2 px-2 mb-1.5
                text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-wide">
                <span>Category</span>
                <span className="text-center">Type</span>
                <span className="text-right">Generated</span>
                <span />
              </div>

              {/* Generated rows */}
              <div className="space-y-2 relative">
                {generated.map((entry, idx) => (
                  <div key={idx} className="relative">
                    <TargetRow
                      entry={entry}
                      index={idx}
                      isDupe={genDupeIndices.has(idx)}
                      canRemove={generated.length > 1}
                      onChange={handleGeneratedChange}
                      onRemove={removeGenerated}
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addGenerated}
                disabled={!canAddGenerated}
                className="mt-2 flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-brand-400
                           hover:text-brand-700 px-2 py-1 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/20
                           transition-colors disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
              >
                <Plus className="w-3.5 h-3.5" /> Add Generated Row
              </button>

              {hasGenDupes && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                  <span>Warning:</span> Remove duplicate Category + Type combinations before saving.
                </p>
              )}

              {generatedTotal > 0 && (
                <div className="mt-3 bg-surface rounded-xl p-3 text-sm">
                  <div className="flex justify-between mb-1.5">
                    <span className="text-muted">Total Generated:</span>
                    <span className="font-bold text-brand-700">{generatedTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex gap-4 text-xs text-[var(--color-text-faint)]">
                    {generatedTotalRecycl > 0 && (
                      <span className="flex items-center gap-1">
                        <Recycle className="w-3 h-3 text-teal-500" />
                        Recycling: <strong className="text-[var(--color-text)] ml-0.5">{generatedTotalRecycl.toLocaleString()}</strong>
                      </span>
                    )}
                    {generatedTotalEOL > 0 && (
                      <span className="flex items-center gap-1">
                        <Leaf className="w-3 h-3 text-amber-500" />
                        EOL: <strong className="text-[var(--color-text)] ml-0.5">{generatedTotalEOL.toLocaleString()}</strong>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* -- PIBO: EPR Targets (multi-row with type) -- */}
          {selectedCat && !isPWP && !isSIMP && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                  EPR Targets - Category &amp; Type
                </p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="text-[10px] text-faint">Same category can have both types</span>
                  <button
                    type="button"
                    onClick={openScreenshotImporter}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-2.5 text-[11px] font-semibold text-brand-600 transition-colors hover:border-brand-300 hover:bg-brand-50 dark:hover:bg-brand-900/20"
                  >
                    <ScanText className="h-3.5 w-3.5" /> Import from Screenshot
                  </button>
                </div>
              </div>

              {screenshotImportConfirmed && (
                <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                  Screenshot values were reviewed and added to this form. Nothing changes in the database until you click Save Record.
                </div>
              )}

              {/* Column headers */}
              <div className="grid grid-cols-[1fr_1.7fr_1fr_26px] items-center gap-2 px-2 mb-1.5
                    text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-wide">
                <span>Category</span>
                <span className="text-center">Type</span>
                <span className="text-right">Target</span>
                <span />
              </div>

              {/* Target rows */}
              <div className="space-y-2 relative">
                {targets.map((entry, idx) => (
                  <div key={idx} className="relative">
                    <TargetRow
                      entry={entry}
                      index={idx}
                      isDupe={dupeIndices.has(idx)}
                      canRemove={targets.length > 1}
                      onChange={handleTargetChange}
                      onRemove={removeTarget}
                    />
                  </div>
                ))}
              </div>

              {/* Add row button */}
              <button
                type="button"
                onClick={addTarget}
                disabled={!canAddTarget}
                className="mt-2 flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-brand-400
                           hover:text-brand-700 px-2 py-1 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/20
                           transition-colors disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
              >
                <Plus className="w-3.5 h-3.5" /> Add Target Row
              </button>

              {/* Duplicate warning */}
              {hasTgtDupes && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                  <span>Warning:</span> Remove duplicate Category + Type combinations before saving.
                </p>
              )}

              {/* Totals summary */}
              {targetTotal > 0 && (
                <div className="mt-3 bg-surface rounded-xl p-3 text-sm">
                  <div className="flex justify-between mb-1.5">
                    <span className="text-muted">Total Target:</span>
                    <span className="font-bold text-brand-700">{targetTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex gap-4 text-xs text-[var(--color-text-faint)]">
                    {targetTotalRecycl > 0 && (
                      <span className="flex items-center gap-1">
                        <Recycle className="w-3 h-3 text-teal-500" />
                        Recycling: <strong className="text-[var(--color-text)] ml-0.5">{targetTotalRecycl.toLocaleString()}</strong>
                      </span>
                    )}
                    {targetTotalEOL > 0 && (
                      <span className="flex items-center gap-1">
                        <Leaf className="w-3 h-3 text-amber-500" />
                        EOL: <strong className="text-[var(--color-text)] ml-0.5">{targetTotalEOL.toLocaleString()}</strong>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SIMP notice */}
          {isSIMP && (
            <div className="bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800
                            rounded-xl p-3 text-sm text-pink-700 dark:text-pink-300">
              SIMP clients are registered for compliance tracking only - no targets or credits needed.
            </div>
          )}

          {!selectedCat && (
            <p className="text-sm text-faint text-center py-4">
              Select a client to see the relevant fields
            </p>
          )}

          {selectedCat && !isSIMP && !editRecord && !hasActiveModalEntries && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Enter at least one positive {isPWP ? "generated credit" : "target"} value to save a new record.
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="btn-primary flex-1 justify-center"
              disabled={saveDisabled}
            >
              {saving ? "Saving..." : "Save Record"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <TargetScreenshotImporter
        open={screenshotImporterOpen}
        clientId={genForm.clientId}
        financialYear={genForm.financialYear}
        existingTargets={targets}
        onClose={closeScreenshotImporter}
        onConfirm={confirmScreenshotTargets}
      />
    </div>
  );
}

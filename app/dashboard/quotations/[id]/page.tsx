"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  ArrowLeft, Plus, Trash2, CheckCircle2, GitBranch,
  Mail, ChevronDown, Activity, FileText, Eye, EyeOff, Printer,
  AlertTriangle, IndianRupee, Landmark, Receipt, Building2,
  Clock, Sparkles
} from "lucide-react";
import { formatCurrency, FINANCIAL_YEARS } from "@/lib/utils";
import { buildQuotationHTML as buildHTML } from "@/utils/quotationTemplate";
import Modal from "@/components/ui/Modal";
import { QUOTATION_STATUS_CONFIG, QuotationStatusPill } from "@/components/quotations/QuotationStatus";
import {
  GST_PERCENT_OPTIONS,
  RESPONSE_ACTION_STATUSES,
  canCreateQuotationEmailDraft,
  canCreateQuotationRevision,
  canEditQuotation,
  getAllowedQuotationTransitions,
  type QuotationStatus,
} from "@/lib/quotationRules";

interface RevisionItem {
  description: string; category: string; type: string;
  quantity: number; rate: number; gstPercent: number;
  subtotal: number; gstAmount: number; totalAmount: number;
}

interface Revision {
  _id: string; revisionNumber: number;
  items: RevisionItem[]; consultationCharges: number;
  consultationGstPercent: number; consultationGstAmount: number;
  governmentFees: number; itemsSubtotal: number; itemsGst: number;
  grandTotal: number; notes: string; validityDays: number; isFinalised: boolean;
  createdAt: string;
}

interface Activity { timestamp: string; action: string; detail?: string; }

interface Quotation {
  _id: string; quotationNumber: string; clientName: string;
  clientId?: string;
  clientAddress?: string;
  clientGst?: string;
  clientState?: string;
  financialYear: string; status: QuotationStatus;
  currentRevisionNumber: number; validityDays: number;
  validTill?: string; sentAt?: string;
  activities: Activity[]; revisions: Revision[];
  createdAt: string; updatedAt: string;
}

const CATEGORIES = ["CAT-I", "CAT-II", "CAT-III", "CAT-IV"];
const TYPES = ["Recycling", "EOL", "Co-processing", "Energy Recovery", "Other"];
const GST_OPTIONS = [...GST_PERCENT_OPTIONS];

const STANDARD_SERVICES = [
  { label: "CAT-I Recycling Credit Procurement", category: "CAT-I", type: "Recycling", description: "CAT-I Recycling Credit Procurement" },
  { label: "CAT-II Recycling Credit Procurement", category: "CAT-II", type: "Recycling", description: "CAT-II Recycling Credit Procurement" },
  { label: "CAT-III Recycling Credit Procurement", category: "CAT-III", type: "Recycling", description: "CAT-III Recycling Credit Procurement" },
  { label: "CAT-IV Recycling Credit Procurement", category: "CAT-IV", type: "Recycling", description: "CAT-IV Recycling Credit Procurement" },
  { label: "EOL Co-processing Waste-to-Energy", category: "CAT-I", type: "Co-processing", description: "EOL Co-processing Waste-to-Energy" },
  { label: "EOL Road Construction Compliance", category: "CAT-I", type: "EOL", description: "EOL Road Construction Compliance" },
  { label: "Energy Recovery Compliance Services", category: "CAT-I", type: "Energy Recovery", description: "Energy Recovery Compliance Services" },
];

function fmt(n: number) { return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

// Compute diff between two revisions
function computeDiff(prev: Revision | null, curr: Revision) {
  if (!prev) return [];
  const changes: { field: string; from: string; to: string }[] = [];
  if (prev.grandTotal !== curr.grandTotal) {
    changes.push({ field: "Grand Total", from: `₹${fmt(prev.grandTotal)}`, to: `₹${fmt(curr.grandTotal)}` });
  }
  if (prev.consultationCharges !== curr.consultationCharges) {
    changes.push({ field: "Consultation Charges", from: `₹${fmt(prev.consultationCharges)}`, to: `₹${fmt(curr.consultationCharges)}` });
  }
  if (prev.governmentFees !== curr.governmentFees) {
    changes.push({ field: "Government Fees", from: `₹${fmt(prev.governmentFees)}`, to: `₹${fmt(curr.governmentFees)}` });
  }
  if (prev.items.length !== curr.items.length) {
    changes.push({ field: "Line Items", from: `${prev.items.length} items`, to: `${curr.items.length} items` });
  }
  prev.items.forEach((pItem, i) => {
    const cItem = curr.items[i];
    if (!cItem) return;
    if (pItem.rate !== cItem.rate) changes.push({ field: `${pItem.category} ${pItem.type} — Rate`, from: `₹${fmt(pItem.rate)}`, to: `₹${fmt(cItem.rate)}` });
    if (pItem.quantity !== cItem.quantity) changes.push({ field: `${pItem.category} ${pItem.type} — Quantity`, from: `${pItem.quantity} MT`, to: `${cItem.quantity} MT` });
  });
  if (prev.notes !== curr.notes) changes.push({ field: "Notes", from: prev.notes || "(none)", to: curr.notes || "(none)" });
  return changes;
}

const newItem = () => ({
  description: "EPR Credit Procurement", category: "CAT-I", type: "Recycling",
  quantity: 0, rate: 0, gstPercent: 18,
  subtotal: 0, gstAmount: 0, totalAmount: 0,
  _id: Math.random().toString(36).slice(2),
});

export default function QuotationDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedStatus, setSavedStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [activeTab, setActiveTab] = useState<"editor" | "preview" | "timeline">("editor");
  const [selectedRevNum, setSelectedRevNum] = useState<number | null>(null);

  // Form state — mirrors current editable revision
  const [clientName, setClientName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientGst, setClientGst] = useState("");
  const [clientState, setClientState] = useState("");
  const [financialYear, setFinancialYear] = useState("");
  const [validityDays, setValidityDays] = useState(30);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ReturnType<typeof newItem>[]>([newItem()]);
  const [consultationCharges, setConsultationCharges] = useState("0");
  const [consultationGstPercent, setConsultationGstPercent] = useState("18");
  const [governmentFees, setGovernmentFees] = useState("0");

  // Autocomplete and selection states
  const [clientSuggestions, setClientSuggestions] = useState<{ clientId: string; companyName: string; gstNumber?: string; address?: string; state?: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Action states
  const [finalising, setFinalising] = useState(false);
  const [creatingRevision, setCreatingRevision] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [statusDropdown, setStatusDropdown] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [markSentPrompt, setMarkSentPrompt] = useState<null | "print" | "email">(null);

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);
  const isInitialLoad = useRef(true);
  const isSwitchingRevision = useRef(false);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  // Load quotation
  const loadQuotation = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/quotations/${id}`);
      if (!res.ok) { router.push("/dashboard/quotations"); return; }
      const data: Quotation = await res.json();
      if (!isMounted.current) return;
      setQuotation(data);

      // Populate form from current (editable) revision
      const currentRev = data.revisions.find(r => r.revisionNumber === data.currentRevisionNumber);
      if (currentRev) {
        setItems(currentRev.items.map(i => ({ ...i, _id: Math.random().toString(36).slice(2) })));
        setConsultationCharges(String(currentRev.consultationCharges));
        setConsultationGstPercent(String(currentRev.consultationGstPercent));
        setGovernmentFees(String(currentRev.governmentFees));
        setNotes(currentRev.notes || "");
        setValidityDays(currentRev.validityDays || 30);
      }
      setClientName(data.clientName);
      setClientId(data.clientId || "");
      setClientAddress(data.clientAddress || "");
      setClientGst(data.clientGst || "");
      setClientState(data.clientState || "");
      setFinancialYear(data.financialYear);
      setSelectedRevNum(data.currentRevisionNumber);
      // Mark initial load done so auto-save doesn't fire immediately
      // Delay must outlast React's state batch + render cycle to prevent spurious auto-save
      setTimeout(() => { isInitialLoad.current = false; }, 300);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { loadQuotation(); }, [loadQuotation]);

  // Client suggestions fetch for autocomplete
  useEffect(() => {
    if (!clientName.trim() || loading || !quotation || !canEditQuotation(quotation.status)) {
      setClientSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clients?summary=1&search=${encodeURIComponent(clientName)}`);
        if (res.ok) {
          const data = await res.json();
          setClientSuggestions(data);
        }
      } catch (err) {
        console.error("Failed to fetch suggestions", err);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [clientName, loading, quotation]);

  // Click outside to close client suggestions
  useEffect(() => {
    if (!showSuggestions) return;
    const handler = () => setShowSuggestions(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [showSuggestions]);

  // When user clicks a different revision in the stepper, repopulate form fields
  useEffect(() => {
    if (!quotation || selectedRevNum === null) return;
    const rev = quotation.revisions.find(r => r.revisionNumber === selectedRevNum);
    if (!rev) return;
    isSwitchingRevision.current = true;
    setItems(rev.items.map(i => ({ ...i, _id: Math.random().toString(36).slice(2) })));
    setConsultationCharges(String(rev.consultationCharges));
    setConsultationGstPercent(String(rev.consultationGstPercent));
    setGovernmentFees(String(rev.governmentFees));
    setNotes(rev.notes || "");
    setValidityDays(rev.validityDays || 30);
    setTimeout(() => { isSwitchingRevision.current = false; }, 300);
  }, [selectedRevNum]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close status dropdown on outside click
  useEffect(() => {
    if (!statusDropdown) return;
    const handler = () => setStatusDropdown(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [statusDropdown]);

  const buildFormRevision = useCallback((baseRevision: Revision): Revision => {
    const calculatedItems = items.map(item => {
      const subtotal = item.quantity * item.rate;
      const gstAmount = subtotal * (item.gstPercent / 100);
      return { ...item, subtotal, gstAmount, totalAmount: subtotal + gstAmount };
    });
    const itemsSubtotal = calculatedItems.reduce((sum, item) => sum + item.subtotal, 0);
    const itemsGst = calculatedItems.reduce((sum, item) => sum + item.gstAmount, 0);
    const cc = Number(consultationCharges) || 0;
    const ccPct = Number(consultationGstPercent) || 0;
    const consultationGstAmount = cc * (ccPct / 100);
    const gf = Number(governmentFees) || 0;

    return {
      ...baseRevision,
      items: calculatedItems,
      consultationCharges: cc,
      consultationGstPercent: ccPct,
      consultationGstAmount,
      governmentFees: gf,
      itemsSubtotal,
      itemsGst,
      grandTotal: itemsSubtotal + itemsGst + cc + consultationGstAmount + gf,
      notes,
      validityDays,
    };
  }, [items, consultationCharges, consultationGstPercent, governmentFees, notes, validityDays]);

  const saveCurrentDraft = useCallback(async () => {
    if (!quotation || !canEditQuotation(quotation.status) || selectedRevNum !== quotation.currentRevisionNumber) {
      return null;
    }
    const currentRevision = quotation.revisions.find(r => r.revisionNumber === quotation.currentRevisionNumber);
    if (!currentRevision) throw new Error("Revision not found");
    const nextRevision = buildFormRevision(currentRevision);
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    }

    setSavedStatus("saving");
    const res = await fetch(`/api/quotations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName,
        clientId,
        clientAddress,
        clientGst,
        clientState,
        financialYear,
        validityDays,
        items: nextRevision.items,
        consultationCharges: nextRevision.consultationCharges,
        consultationGstPercent: nextRevision.consultationGstPercent,
        governmentFees: nextRevision.governmentFees,
        notes,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Failed to save quotation");
    }

    const nextQuotation = {
      ...quotation,
      clientName,
      clientId,
      clientAddress,
      clientGst,
      clientState,
      financialYear,
      validityDays,
      revisions: quotation.revisions.map(rev =>
        rev.revisionNumber === nextRevision.revisionNumber ? nextRevision : rev
      ),
    };
    if (isMounted.current) {
      setQuotation(nextQuotation);
      setSavedStatus("saved");
      setTimeout(() => { if (isMounted.current) setSavedStatus("idle"); }, 2000);
    }
    return { quotation: nextQuotation, revision: nextRevision };
  }, [quotation, selectedRevNum, buildFormRevision, id, clientName, clientId, clientAddress, clientGst, clientState, financialYear, validityDays, notes]);

  // Auto-save when form changes (draft only)
  const triggerAutoSave = useCallback(() => {
    if (!quotation || !canEditQuotation(quotation.status)) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setSavedStatus("saving");
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await saveCurrentDraft();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save quotation");
        if (isMounted.current) setSavedStatus("idle");
      }
    }, 1500);
  }, [quotation, saveCurrentDraft]);

  useEffect(() => {
    if (!loading && quotation && canEditQuotation(quotation.status) && !isInitialLoad.current && !isSwitchingRevision.current && selectedRevNum === quotation.currentRevisionNumber) triggerAutoSave();
  }, [clientName, clientId, clientAddress, clientGst, clientState, financialYear, validityDays, items, consultationCharges, consultationGstPercent, governmentFees, notes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live totals
  const calcItem = (item: typeof items[0]) => {
    const subtotal = item.quantity * item.rate;
    const gstAmt = subtotal * (item.gstPercent / 100);
    return { subtotal, gstAmt, total: subtotal + gstAmt };
  };
  const liveItemsSubtotal = items.reduce((s, i) => s + calcItem(i).subtotal, 0);
  const liveItemsGst = items.reduce((s, i) => s + calcItem(i).gstAmt, 0);
  const liveCC = Number(consultationCharges) || 0;
  const liveCCGst = liveCC * ((Number(consultationGstPercent) || 0) / 100);
  const liveGF = Number(governmentFees) || 0;
  const liveGrand = liveItemsSubtotal + liveItemsGst + liveCC + liveCCGst + liveGF;

  const updateItem = (idx: number, field: string, value: string | number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const isViewingCurrentRev = selectedRevNum === quotation?.currentRevisionNumber;
  const isEditable = !!quotation && canEditQuotation(quotation.status) && isViewingCurrentRev;
  const canCreateRevision = !!quotation && canCreateQuotationRevision(quotation.status) && isViewingCurrentRev;
  const canCreateEmailDraft = !!quotation && canCreateQuotationEmailDraft(quotation.status);
  const allowedResponseStatuses = quotation
    ? RESPONSE_ACTION_STATUSES.filter((status) => getAllowedQuotationTransitions(quotation.status).includes(status))
    : [];

  // Finalize
  const handleFinalize = async () => {
    setFinalising(true);
    try {
      await saveCurrentDraft();
      const res = await fetch(`/api/quotations/${id}/finalize`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || "Failed to finalise");
        return;
      }
      const data = await res.json();
      toast.success(`Finalised as ${data.quotationNumber}`);
      loadQuotation();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to finalise");
    } finally { setFinalising(false); }
  };

  // Create Revision
  const handleCreateRevision = async () => {
    if (!quotation || !canCreateRevision) return;
    setCreatingRevision(true);
    try {
      const res = await fetch(`/api/quotations/${id}/create-revision`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || "Failed to create revision");
        return;
      }
      const data = await res.json();
      toast.success(`Rev ${data.revisionNumber} created`);
      loadQuotation();
    } finally { setCreatingRevision(false); }
  };

  // Status change
  const updateStatus = async (newStatus: QuotationStatus) => {
    if (!quotation || !getAllowedQuotationTransitions(quotation.status).includes(newStatus)) return;
    setStatusDropdown(false);
    const prev = quotation?.status;
    const res = await fetch(`/api/quotations/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      toast.error(data?.error || "Failed to update status");
      return;
    }
    if (newStatus === "Sent" && prev !== "Sent") {
      toast.success("Marked as Sent");
    } else {
      toast.success(`Status changed to ${newStatus}`);
    }
    loadQuotation();
  };

  const getQuotationOutputTarget = async (revisionNumber = selectedRevNum ?? quotation?.currentRevisionNumber) => {
    if (!quotation || revisionNumber === undefined || revisionNumber === null) return null;
    const savedDraft = await saveCurrentDraft();
    const outputQuotation = savedDraft?.quotation ?? quotation;
    const outputRevision = savedDraft?.revision ??
      outputQuotation.revisions.find(r => r.revisionNumber === revisionNumber);
    if (!outputRevision) throw new Error("Revision not found");
    return { quotation: outputQuotation, revision: outputRevision };
  };

  // Print / Preview
  const handlePrintPreview = async () => {
    if (!quotation) return;
    setPdfLoading(true);
    try {
      const target = await getQuotationOutputTarget();
      if (!target) return;
      const tmplRes = await fetch("/api/quotation/template");
      if (!tmplRes.ok) throw new Error("Quotation template not found");
      const { html: template } = await tmplRes.json();
      const html = buildQuotationHTML(template, target.quotation, target.revision);
      const win = window.open("", "_blank");
      if (!win) { toast.error("Popup blocked - please allow popups"); return; }
      win.document.write(html); win.document.close(); win.focus();
      setTimeout(() => win.print(), 600);
      if (target.quotation.status === "Finalized") {
        setMarkSentPrompt("print");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open print preview");
    } finally { setPdfLoading(false); }
  };

  const openEmailDraftModal = () => {
    if (!quotation) return;
    if (!canCreateEmailDraft) {
      toast.error("Finalise the quotation before creating an email draft");
      return;
    }
    setEmailRecipient("");
    setEmailModalOpen(true);
  };

  // Email Draft
  const handleEmailDraft = async () => {
    if (!quotation) return;
    if (!canCreateEmailDraft) {
      toast.error("Finalise the quotation before creating an email draft");
      return;
    }
    const recipient = emailRecipient.trim();
    if (!recipient) {
      toast.error("Enter a recipient email");
      return;
    }
    setEmailLoading(true);
    try {
      const target = await getQuotationOutputTarget(quotation.currentRevisionNumber);
      if (!target) return;
      const tmplRes = await fetch("/api/quotation/template");
      if (!tmplRes.ok) throw new Error("Quotation template not found");
      const { html: template } = await tmplRes.json();
      const html = buildQuotationHTML(template, target.quotation, target.revision);
      const subject = `Quotation for EPR Fulfilment Services - FY ${target.quotation.financialYear}`;
      const res = await fetch("/api/email/create-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipient.trim(),
          subject,
          html,
          logType: "quotation",
          logClientName: target.quotation.clientName,
          logFy: target.quotation.financialYear,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success("Email draft created in Gmail");
        setEmailModalOpen(false);
        setEmailRecipient("");
        if (data.draftUrl) window.open(data.draftUrl, "_blank");
        if (target.quotation.status === "Finalized") setMarkSentPrompt("email");
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || "Failed to create email draft");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create email draft");
    } finally { setEmailLoading(false); }
  };

  function buildQuotationHTML(template: string, q: Quotation, rev: Revision): string {
    return buildHTML(template, {
      quoteNumber: (q.quotationNumber || "DRAFT") + (q.quotationNumber ? ` Rev ${rev.revisionNumber}` : ""),
      clientName: q.clientName,
      clientAddress: q.clientAddress || "",
      clientGst: q.clientGst || "",
      clientState: q.clientState || "",
      financialYear: q.financialYear,
      items: rev.items,
      itemsSubtotal: rev.itemsSubtotal,
      itemsGst: rev.itemsGst,
      consultationCharges: rev.consultationCharges,
      consultationGstPercent: rev.consultationGstPercent,
      consultationGstAmount: rev.consultationGstAmount,
      governmentFees: rev.governmentFees,
      grandTotal: rev.grandTotal,
      notes: rev.notes,
      generatedAt: new Date().toISOString(),
      validityDays: rev.validityDays ?? q.validityDays ?? 30,
    });
  }

  // Handle URL action param (from list page shortcuts)
  useEffect(() => {
    if (loading || !quotation) return;
    const action = searchParams.get("action");
    if (!action) return;

    if (action === "print" || action === "pdf") {
      handlePrintPreview();
    } else if (action === "email") {
      openEmailDraftModal();
    }

    // Clean query params so it doesn't trigger again on component updates or back-navigation
    const newUrl = window.location.pathname;
    window.history.replaceState({}, "", newUrl);
  }, [loading, quotation, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Viewing a past revision (read-only)
  const viewedRevision = quotation?.revisions.find(r => r.revisionNumber === selectedRevNum) ?? null;
  const prevRevision = selectedRevNum && selectedRevNum > 0
    ? (quotation?.revisions.find(r => r.revisionNumber === selectedRevNum - 1) ?? null)
    : null;
  const diffChanges = viewedRevision && prevRevision ? computeDiff(prevRevision, viewedRevision) : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!quotation) return null;

  return (
    <div className="min-h-screen pb-20">
      {/* ─── TOP BAR ─── */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard/quotations")}
            className="p-2 rounded-xl hover:bg-surface transition-colors text-muted hover:text-default"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-default tracking-tight" style={{ letterSpacing: "-0.025em" }}>
                {quotation.quotationNumber ? (
                  <span className="font-mono">{quotation.quotationNumber}</span>
                ) : (
                  <span className="text-muted">Untitled Draft</span>
                )}
              </h1>
              <QuotationStatusPill status={quotation.status} />
              {savedStatus === "saving" && <span className="text-xs text-muted animate-pulse">Saving...</span>}
              {savedStatus === "saved" && <span className="text-xs text-emerald-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Saved</span>}
            </div>
            <p className="text-xs text-muted mt-0.5">
              {quotation.clientName} · FY {quotation.financialYear}
              {quotation.validTill && ` · Valid till ${fmtDate(quotation.validTill)}`}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {isEditable && (
            <button
              onClick={handleFinalize}
              disabled={finalising}
              className="btn-primary gap-2 text-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {finalising ? "Finalising..." : "Finalise Quote"}
            </button>
          )}

          {canCreateRevision && (
            <button
              onClick={handleCreateRevision}
              disabled={creatingRevision}
              className="btn-secondary gap-2 text-sm"
            >
              <GitBranch className="w-3.5 h-3.5" />
              {creatingRevision ? "Creating..." : "Create Revision"}
            </button>
          )}

          <button onClick={handlePrintPreview} disabled={pdfLoading} className="btn-secondary gap-2 text-sm">
            <Printer className="w-3.5 h-3.5" />
            {pdfLoading ? "Opening..." : "Print / Preview"}
          </button>

          <button onClick={openEmailDraftModal} disabled={emailLoading || !canCreateEmailDraft} className="btn-secondary gap-2 text-sm">
            <Mail className="w-3.5 h-3.5" />
            {emailLoading ? "Creating..." : "Email Draft"}
          </button>

          {/* Status dropdown */}
          {allowedResponseStatuses.length > 0 && (
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setStatusDropdown(!statusDropdown); }}
              className="btn-secondary gap-1.5 text-sm"
            >
              Response <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {statusDropdown && (
              <div className="absolute right-0 top-full mt-1 bg-card border border-base rounded-xl shadow-lg py-1 z-50 min-w-52">
                <p className="px-3.5 py-2 text-xs font-semibold text-muted uppercase tracking-wide border-b border-base mb-1">Mark as</p>
                {allowedResponseStatuses.map(s => {
                  const cfg = QUOTATION_STATUS_CONFIG[s];
                  return (
                    <button
                      key={s}
                      onClick={() => updateStatus(s)}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-surface transition-colors"
                    >
                      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                      <span className="text-default">{cfg.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      {/* ─── REVISION STEPPER ─── */}
      {quotation.revisions.length > 0 && (
        <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
          {quotation.revisions.map(rev => (
            <button
              key={rev.revisionNumber}
              onClick={() => setSelectedRevNum(rev.revisionNumber)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all border whitespace-nowrap ${
                selectedRevNum === rev.revisionNumber
                  ? "bg-default text-inverse border-default shadow-sm"
                  : "bg-card border-base text-muted hover:text-default hover:border-default/30"
              }`}
            >
              <span className="font-mono text-xs">Rev {rev.revisionNumber}</span>
              {rev.isFinalised && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Finalised" />}
              {!rev.isFinalised && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Editable" />}
            </button>
          ))}
          {canCreateRevision && (
            <button
              onClick={handleCreateRevision}
              disabled={creatingRevision}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-muted hover:text-default border border-dashed border-base hover:border-default/40 transition-all"
            >
              <Plus className="w-3 h-3" /> New Revision
            </button>
          )}
        </div>
      )}

      {/* ─── DIFF BANNER ─── */}
      {diffChanges.length > 0 && selectedRevNum !== null && selectedRevNum > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 mb-5">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-3 uppercase tracking-wide">
            Changes from Rev {selectedRevNum - 1} → Rev {selectedRevNum}
          </p>
          <div className="space-y-2">
            {diffChanges.map((change, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="text-muted min-w-40 shrink-0">{change.field}</span>
                <span className="text-default line-through opacity-50">{change.from}</span>
                <span className="text-muted">→</span>
                <span className="text-default font-medium">{change.to}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── MAIN TABS ─── */}
      <div className="flex gap-1 bg-surface border border-base rounded-xl p-1 mb-5 w-fit">
        {[
          { key: "editor", label: "Editor", icon: FileText },
          { key: "preview", label: "Preview", icon: Eye },
          { key: "timeline", label: "Activity", icon: Activity },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as "editor" | "preview" | "timeline")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === key ? "bg-card shadow-sm text-default" : "text-muted hover:text-default"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ─── EDITOR TAB ─── */}
      {activeTab === "editor" && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* LEFT — FORM */}
          <div className="xl:col-span-2 space-y-4">
            {!isEditable && selectedRevNum !== quotation.currentRevisionNumber && (
              <div className="bg-slate-50 dark:bg-slate-800/40 border border-base rounded-2xl p-4 flex items-center gap-3">
                <EyeOff className="w-4 h-4 text-muted shrink-0" />
                <p className="text-sm text-muted">
                  Viewing Rev {selectedRevNum} (read-only). The current revision is Rev {quotation.currentRevisionNumber}.
                </p>
              </div>
            )}

            {/* Client + FY */}
            <div className="bg-card border border-base rounded-2xl p-5 shadow-sm">
              <h3 className="font-semibold text-default mb-4 flex items-center gap-2 text-sm">
                <Building2 className="w-4 h-4 text-muted" />Quotation Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 relative">
                  <label className="label">Client Name *</label>
                  <input
                    className="input-field w-full"
                    value={clientName}
                    onChange={e => {
                      setClientName(e.target.value);
                      setShowSuggestions(true);
                      if (!e.target.value) {
                        setClientId("");
                        setClientAddress("");
                        setClientGst("");
                        setClientState("");
                      }
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    disabled={!isEditable}
                    placeholder="Company name"
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
                            setClientName(client.companyName);
                            setClientId(client.clientId);
                            setClientAddress(client.address || "");
                            setClientGst(client.gstNumber || "");
                            setClientState(client.state || "");
                            setShowSuggestions(false);
                          }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-surface text-default font-medium border-b border-soft last:border-0"
                        >
                          <p className="font-semibold">{client.companyName}</p>
                          {client.gstNumber && <p className="text-[10px] text-muted mt-0.5">GST: {client.gstNumber} · {client.state}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="label">Financial Year</label>
                  <select className="input-field" value={financialYear} onChange={e => setFinancialYear(e.target.value)} disabled={!isEditable}>
                    {FINANCIAL_YEARS.map(y => <option key={y}>{y}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Billing Address</label>
                  <input
                    className="input-field"
                    value={clientAddress}
                    onChange={e => setClientAddress(e.target.value)}
                    disabled={!isEditable}
                    placeholder="Billing street address, state, etc."
                  />
                </div>
                <div>
                  <label className="label">Client GSTIN</label>
                  <input
                    className="input-field font-mono"
                    value={clientGst}
                    onChange={e => setClientGst(e.target.value.toUpperCase())}
                    disabled={!isEditable}
                    placeholder="GSTIN number"
                    maxLength={15}
                  />
                </div>
                <div>
                  <label className="label">State Code</label>
                  <input
                    className="input-field"
                    value={clientState}
                    onChange={e => setClientState(e.target.value)}
                    disabled={!isEditable}
                    placeholder="State e.g. Delhi, Maharashtra"
                  />
                </div>
                <div>
                  <label className="label">Valid for (days)</label>
                  <input type="number" className="input-field" value={validityDays} onChange={e => setValidityDays(Number(e.target.value))} disabled={!isEditable} min={1} />
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-base">
                <h3 className="font-semibold text-default flex items-center gap-2 text-sm">
                  <IndianRupee className="w-4 h-4 text-muted" />EPR Credit Line Items
                </h3>
                {isEditable && (
                  <button
                    onClick={() => setItems(prev => [...prev, newItem()])}
                    className="glass-btn glass-btn-primary"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Row
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      {["Description", "Category", "Type", "Qty (MT)", "Rate (₹)", "GST%", "Amount", ""].map((h, i) => (
                        <th key={h || `col-${i}`} className="table-header" style={{ minWidth: h === "Description" ? 170 : h === "Amount" ? 110 : 80 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const { gstAmt, total } = calcItem(item);
                      return (
                        <tr key={item._id} className="border-t border-soft">
                          <td className="px-3 py-2">
                            <input 
                              list={`services-list-${item._id}`}
                              className="input-field !py-1.5 text-xs" 
                              value={item.description} 
                              onChange={e => {
                                const val = e.target.value;
                                updateItem(idx, "description", val);
                                const matched = STANDARD_SERVICES.find(s => s.description === val);
                                if (matched) {
                                  updateItem(idx, "category", matched.category);
                                  updateItem(idx, "type", matched.type);
                                }
                              }} 
                              disabled={!isEditable} 
                            />
                            <datalist id={`services-list-${item._id}`}>
                              {STANDARD_SERVICES.map(s => (
                                <option key={s.label} value={s.description}>
                                  {s.category} · {s.type}
                                </option>
                              ))}
                            </datalist>
                          </td>
                          <td className="px-3 py-2">
                            <select className="input-field !py-1.5 text-xs" value={item.category} onChange={e => updateItem(idx, "category", e.target.value)} disabled={!isEditable}>
                              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <select className="input-field !py-1.5 text-xs" value={item.type} onChange={e => updateItem(idx, "type", e.target.value)} disabled={!isEditable}>
                              {TYPES.map(t => <option key={t}>{t}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min="0" className="input-field !py-1.5 text-xs font-mono text-center" value={item.quantity || ""} onChange={e => updateItem(idx, "quantity", Number(e.target.value))} disabled={!isEditable} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min="0" step="0.01" className="input-field !py-1.5 text-xs font-mono" value={item.rate || ""} onChange={e => updateItem(idx, "rate", Number(e.target.value))} disabled={!isEditable} placeholder="0.00" />
                          </td>
                          <td className="px-3 py-2">
                            <select className="input-field !py-1.5 text-xs" value={item.gstPercent} onChange={e => updateItem(idx, "gstPercent", Number(e.target.value))} disabled={!isEditable}>
                              {GST_OPTIONS.map(g => <option key={g} value={g}>{g}%</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <p className="text-sm font-semibold text-default">{formatCurrency(total)}</p>
                            {item.gstPercent > 0 && <p className="text-xs text-muted">+GST {formatCurrency(gstAmt)}</p>}
                          </td>
                          <td className="px-2 py-2">
                            {isEditable && (
                              <button
                                onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                                disabled={items.length === 1}
                                className="p-1 text-faint hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-soft px-4 py-2.5 bg-surface flex justify-end gap-6 text-xs">
                <span className="text-muted">Subtotal: <strong className="text-default">{formatCurrency(liveItemsSubtotal)}</strong></span>
                <span className="text-muted">GST: <strong className="text-default">{formatCurrency(liveItemsGst)}</strong></span>
              </div>
            </div>

            {/* Additional Charges */}
            <div className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-base flex items-center gap-2">
                <Receipt className="w-4 h-4 text-muted" />
                <h3 className="font-semibold text-default text-sm">Additional Charges</h3>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-base">
                <div className="pb-4 md:pb-0 md:pr-5 space-y-4">
                  <div>
                    <p className="text-sm font-medium text-default mb-2 flex items-center gap-2">
                      <IndianRupee className="w-3.5 h-3.5 text-muted" />Consultation Charges
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="label">Amount (₹)</label>
                        <input type="number" min="0" step="0.01" className="input-field font-mono" value={consultationCharges} onChange={e => setConsultationCharges(e.target.value)} disabled={!isEditable} />
                      </div>
                      <div>
                        <label className="label">GST %</label>
                        <select className="input-field" value={consultationGstPercent} onChange={e => setConsultationGstPercent(e.target.value)} disabled={!isEditable}>
                          {GST_OPTIONS.map(g => <option key={g} value={g}>{g}%</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-default mb-2 flex items-center gap-2">
                      <Landmark className="w-3.5 h-3.5 text-muted" />Government Fees
                    </p>
                    <input type="number" min="0" step="0.01" className="input-field font-mono" value={governmentFees} onChange={e => setGovernmentFees(e.target.value)} disabled={!isEditable} />
                    <p className="text-xs text-faint mt-1">CPCB / SPCB / portal charges (no GST)</p>
                  </div>
                </div>

                {/* Right: live totals */}
                <div className="pt-4 md:pt-0 md:pl-5">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Breakup</p>
                  <div className="space-y-2">
                    {[
                      { label: "EPR Credits (excl. GST)", value: liveItemsSubtotal },
                      { label: "GST on Credits", value: liveItemsGst, muted: true },
                      ...(liveCC > 0 ? [{ label: "Consultation Charges", value: liveCC }] : []),
                      ...(liveCCGst > 0 ? [{ label: `GST on Consultation`, value: liveCCGst, muted: true }] : []),
                      ...(liveGF > 0 ? [{ label: "Government Fees", value: liveGF }] : []),
                    ].map(({ label, value, muted }) => (
                      <div key={label} className="flex justify-between text-sm">
                        <span className="text-muted">{label}</span>
                        <span className={muted ? "text-muted font-medium" : "text-default font-medium"}>{formatCurrency(value)}</span>
                      </div>
                    ))}
                    <div className="border-t border-base pt-2 mt-2 flex justify-between items-center">
                      <span className="font-bold text-default">Grand Total</span>
                      <span className="text-2xl font-black text-brand-600 dark:text-brand-400">{formatCurrency(liveGrand)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-base p-4">
                <label className="label">Notes / Terms</label>
                <textarea className="input-field" rows={2} value={notes} onChange={e => setNotes(e.target.value)} disabled={!isEditable} placeholder="Payment terms, validity, special conditions…" />
              </div>
            </div>
          </div>

          {/* RIGHT — STATUS + QUICK SUMMARY */}
          <div className="xl:col-span-1">
            <div className="sticky top-6 space-y-4">
              {/* Summary card */}
              <div className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden">
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-4 text-white">
                  <p className="text-xs text-white/50 font-mono mb-1">
                    {quotation.quotationNumber || "DRAFT"}{quotation.quotationNumber ? ` · Rev ${quotation.currentRevisionNumber}` : ""}
                  </p>
                  <p className="font-bold text-lg">{quotation.clientName}</p>
                  <p className="text-white/60 text-sm mt-0.5">FY {quotation.financialYear}</p>
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Status</span>
                    <QuotationStatusPill status={quotation.status} />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Current Revision</span>
                    <span className="font-mono text-default font-medium">Rev {quotation.currentRevisionNumber}</span>
                  </div>
                  {quotation.validTill && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Valid Till</span>
                      <span className="text-default">{fmtDate(quotation.validTill)}</span>
                    </div>
                  )}
                  {quotation.sentAt && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Sent</span>
                      <span className="text-default">{fmtDate(quotation.sentAt)}</span>
                    </div>
                  )}
                  <div className="border-t border-base mt-3 pt-3 flex justify-between items-center">
                    <span className="font-semibold text-default">Grand Total</span>
                    <span className="text-xl font-black text-brand-600 dark:text-brand-400">{formatCurrency(liveGrand)}</span>
                  </div>
                </div>
              </div>

              {/* Response tracking */}
              <div className="bg-card border border-base rounded-2xl p-4 shadow-sm">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Client Response</p>
                {allowedResponseStatuses.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["Accepted", "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800", CheckCircle2],
                      ["RevisionRequested", "text-amber-600 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800", GitBranch],
                      ["Rejected", "text-red-500 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800", AlertTriangle],
                      ["Sent", "text-blue-600 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800", Clock],
                    ] as [QuotationStatus, string, React.ElementType][])
                      .filter(([s]) => allowedResponseStatuses.includes(s))
                      .map(([s, cls, Icon]) => (
                        <button
                          key={s}
                          onClick={() => updateStatus(s)}
                          className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all hover:opacity-80 ${
                            quotation.status === s ? cls : "border-base text-muted bg-surface hover:bg-card"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {QUOTATION_STATUS_CONFIG[s].label}
                        </button>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">No response action is available for {QUOTATION_STATUS_CONFIG[quotation.status].label} quotations.</p>
                )}
              </div>

              {/* Workflow actions */}
              <div className="space-y-2">
                {isEditable && (
                  <button onClick={handleFinalize} disabled={finalising} className="btn-primary w-full justify-center gap-2 py-3">
                    <Sparkles className="w-4 h-4" />
                    {finalising ? "Finalising..." : "Finalise Quote"}
                  </button>
                )}
                <div className="grid grid-cols-1 gap-2">
                  <button onClick={handlePrintPreview} disabled={pdfLoading} className="btn-secondary justify-center gap-1.5 text-sm py-2.5">
                    <Printer className="w-3.5 h-3.5" />Print / Preview
                  </button>
                  <button onClick={openEmailDraftModal} disabled={emailLoading || !canCreateEmailDraft} className="btn-secondary justify-center gap-1.5 text-sm py-2.5">
                    <Mail className="w-3.5 h-3.5" />Email Draft
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── PREVIEW TAB ─── */}
      {activeTab === "preview" && (
        <div className="bg-surface rounded-2xl p-6 border border-base">
          <div className="max-w-3xl mx-auto bg-card border border-base rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-slate-900 text-white p-8">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-4xl font-black tracking-tight">NEXTGEN</p>
                  <p className="text-white/40 text-sm mt-1">EPR Consultancy Solutions</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-white/60 text-xs">QUOTATION</p>
                  <p className="font-mono text-xl font-bold mt-1">{quotation.quotationNumber || "DRAFT"}</p>
                  {quotation.quotationNumber && (
                    <p className="text-white/40 text-xs mt-1">Rev {selectedRevNum ?? quotation.currentRevisionNumber}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="p-8">
              <div className="grid grid-cols-2 gap-6 mb-8">
                <div>
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Prepared for</p>
                  <p className="font-semibold text-default text-lg">{clientName}</p>
                  {clientAddress && <p className="text-muted text-xs mt-1 max-w-[280px] break-words">{clientAddress}</p>}
                  {clientGst && <p className="text-muted text-xs mt-1 font-mono">GSTIN: {clientGst}</p>}
                  <p className="text-muted text-xs mt-1">FY {financialYear}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Date</p>
                  <p className="text-default">{fmtDate(new Date().toISOString())}</p>
                  {quotation.validTill && (
                    <>
                      <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1 mt-3">Valid Till</p>
                      <p className="text-default">{fmtDate(quotation.validTill)}</p>
                    </>
                  )}
                </div>
              </div>

              {/* Items table */}
              <table className="w-full text-sm mb-6">
                <thead>
                  <tr className="border-b-2 border-base">
                    {["Description", "Cat", "Type", "Qty", "Rate", "GST", "Total"].map(h => (
                      <th key={h} className={`py-2 text-xs font-semibold text-muted uppercase tracking-wide ${h === "Total" || h === "Rate" || h === "Qty" || h === "GST" ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-base">
                  {items.map((item, i) => {
                    const { total } = calcItem(item);
                    return (
                      <tr key={i}>
                        <td className="py-3 text-default">{item.description}</td>
                        <td className="py-3 text-muted text-xs font-mono">{item.category}</td>
                        <td className="py-3 text-muted text-xs">{item.type}</td>
                        <td className="py-3 text-right text-default font-mono text-xs">{item.quantity.toLocaleString()}</td>
                        <td className="py-3 text-right text-default font-mono text-xs">₹{fmt(item.rate)}</td>
                        <td className="py-3 text-right text-muted text-xs">{item.gstPercent}%</td>
                        <td className="py-3 text-right font-semibold text-default">₹{fmt(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Totals */}
              <div className="ml-auto max-w-xs space-y-1.5">
                {[
                  { label: "EPR Credits (excl. GST)", value: liveItemsSubtotal },
                  { label: "GST on Credits", value: liveItemsGst, muted: true },
                  ...(liveCC > 0 ? [{ label: "Consultation Charges", value: liveCC }] : []),
                  ...(liveCCGst > 0 ? [{ label: `GST on Consultation`, value: liveCCGst, muted: true }] : []),
                  ...(liveGF > 0 ? [{ label: "Government Fees", value: liveGF }] : []),
                ].map(({ label, value, muted }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className={muted ? "text-faint" : "text-muted"}>{label}</span>
                    <span className={muted ? "text-muted" : "text-default"}>₹{fmt(value)}</span>
                  </div>
                ))}
                <div className="border-t-2 border-default/20 pt-2 flex justify-between items-center">
                  <span className="font-bold text-default">Grand Total</span>
                  <span className="text-xl font-black text-brand-600">₹{fmt(liveGrand)}</span>
                </div>
              </div>

              {notes && (
                <div className="mt-8 p-4 bg-surface rounded-xl border border-base">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Notes & Terms</p>
                  <p className="text-sm text-default whitespace-pre-line">{notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── TIMELINE TAB ─── */}
      {activeTab === "timeline" && (
        <div className="max-w-xl">
          <div className="space-y-1">
            {[...quotation.activities].reverse().map((activity, i) => (
              <div key={i} className="flex gap-4 group">
                <div className="flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-brand-400 mt-1.5 shrink-0" />
                  {i < quotation.activities.length - 1 && (
                    <div className="w-px flex-1 bg-base mt-1" />
                  )}
                </div>
                <div className="pb-6">
                  <p className="text-xs text-faint mb-0.5">
                    {fmtDate(activity.timestamp)} · {fmtTime(activity.timestamp)}
                  </p>
                  <p className="text-sm font-medium text-default">{activity.action}</p>
                  {activity.detail && (
                    <p className="text-xs text-muted mt-0.5">{activity.detail}</p>
                  )}
                </div>
              </div>
            ))}
            {quotation.activities.length === 0 && (
              <p className="text-muted text-sm">No activity yet.</p>
            )}
          </div>
        </div>
      )}

      <Modal
        open={emailModalOpen}
        onClose={() => {
          if (!emailLoading) setEmailModalOpen(false);
        }}
        title="Create email draft"
        subtitle={quotation.clientName}
        size="sm"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleEmailDraft();
          }}
        >
          <div>
            <label className="label">Recipient email</label>
            <input
              type="email"
              className="input-field"
              value={emailRecipient}
              onChange={(e) => setEmailRecipient(e.target.value)}
              placeholder="client@example.com"
              autoFocus
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary px-4"
              disabled={emailLoading}
              onClick={() => setEmailModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary px-4"
              disabled={emailLoading || !emailRecipient.trim()}
            >
              {emailLoading ? "Creating..." : "Create Draft"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={markSentPrompt !== null}
        onClose={() => setMarkSentPrompt(null)}
        title="Mark quotation as sent?"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {markSentPrompt === "email"
              ? "The email draft was created. Mark this quotation as Sent once you are ready to track the client response."
              : "The print preview is open. Mark this quotation as Sent if you are sharing it with the client now."}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary px-4"
              onClick={() => setMarkSentPrompt(null)}
            >
              Not now
            </button>
            <button
              type="button"
              className="btn-primary px-4"
              onClick={async () => {
                setMarkSentPrompt(null);
                await updateStatus("Sent");
              }}
            >
              Mark as Sent
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

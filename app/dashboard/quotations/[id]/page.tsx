"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  ArrowLeft, Plus, Trash2, CheckCircle2, GitBranch,
  Mail, Activity, FileText, Eye, EyeOff, Printer,
  AlertTriangle, IndianRupee, Receipt, Building2,
  Sparkles, MoreHorizontal, Copy, Send, X
} from "lucide-react";
import { FINANCIAL_YEARS } from "@/lib/utils";
import { buildQuotationHTML as buildHTML } from "@/utils/quotationTemplate";
import { escapeHtmlWithLineBreaks } from "@/utils/sanitizeHtml";
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
  finalisedAt?: string;
  createdAt: string;
  updatedAt: string;
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

interface ClientEmailOption {
  id: string;
  name: string;
  email: string;
  designation?: string;
  isPrimaryContact?: boolean;
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

const surfaceCard =
  "rounded-[32px] border border-base bg-card/90 shadow-[0_18px_60px_rgba(0,0,0,0.06)] backdrop-blur-xl";
const softInput =
  "h-12 rounded-2xl border border-base bg-surface/70 px-4 text-sm text-default transition-all duration-200 focus:border-brand-400 focus:bg-card focus:outline-none focus:ring-4 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:opacity-60";
const softTextarea =
  "rounded-[24px] border border-base bg-surface/70 px-4 py-3 text-sm text-default transition-all duration-200 focus:border-brand-400 focus:bg-card focus:outline-none focus:ring-4 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:opacity-60";
const appleButton =
  "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
const sectionEyebrow = "text-[11px] font-semibold uppercase text-muted";

function fmt(n: number) { return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function money(n: number) {
  const hasPaise = Math.round(n * 100) % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(n);
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function getEmailDraftUnavailableMessage(status: QuotationStatus) {
  switch (status) {
    case "Draft":
      return "Unfinalized quotation cannot be drafted. Finalise it before creating an email draft.";
    case "RevisionRequested":
      return "Create and finalise a new revision before drafting this quotation again.";
    case "Accepted":
      return "Accepted quotation cannot be drafted again.";
    case "Rejected":
      return "Rejected quotation cannot be drafted again.";
    case "Expired":
      return "Expired quotation cannot be drafted again. Create a new revision if needed.";
    default:
      return "";
  }
}

function cleanDocumentPart(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getQuotationDisplayNumber(q: Pick<Quotation, "quotationNumber">, rev: Pick<Revision, "revisionNumber">) {
  const base = q.quotationNumber || "DRAFT";
  return rev.revisionNumber > 0 ? `${base} Rev ${rev.revisionNumber}` : base;
}

function getQuotationDocumentTitle(q: Pick<Quotation, "quotationNumber" | "clientName" | "financialYear">, rev: Pick<Revision, "revisionNumber">) {
  return [
    getQuotationDisplayNumber(q, rev),
    cleanDocumentPart(q.clientName || "Client"),
    `FY ${cleanDocumentPart(q.financialYear || "")}`,
  ].filter(Boolean).join(" - ");
}

function getQuotationEmailSubject(q: Pick<Quotation, "clientName" | "financialYear">, rev: Pick<Revision, "revisionNumber">) {
  const prefix = rev.revisionNumber > 0 ? "Revised Quotation" : "Quotation";
  return `${prefix} for EPR Annual Return - FY ${q.financialYear} - ${q.clientName}`;
}

function getDefaultEmailMessage(q: Pick<Quotation, "clientName" | "financialYear">, rev: Pick<Revision, "revisionNumber">) {
  const quotationLabel = rev.revisionNumber > 0 ? "revised quotation" : "quotation";
  return `Dear Team,\n\nPlease find our ${quotationLabel} for ${q.clientName} for EPR Annual Return services for FY ${q.financialYear}. Kindly review it and let us know if you have any questions.\n\nRegards,\nNextgen Solutions`;
}

function prependEmailMessage(html: string, message: string) {
  const trimmedMessage = message.trim();
  if (!trimmedMessage) return html;

  const messageHtml = `
    <div style="max-width:760px; margin:0 auto 28px; padding:0 12px 24px; border-bottom:1px solid #e5e5e7; color:#1d1d1f; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size:14px; line-height:1.65;">
      ${escapeHtmlWithLineBreaks(trimmedMessage)}
    </div>
  `;

  return html.replace(/<body([^>]*)>/i, `<body$1>${messageHtml}`);
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
  const [quotationTemplate, setQuotationTemplate] = useState("");
  const [previewTemplateLoading, setPreviewTemplateLoading] = useState(false);
  const [previewTemplateError, setPreviewTemplateError] = useState("");
  const [previewHeight, setPreviewHeight] = useState(720);
  const [statusDropdown, setStatusDropdown] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [moreMenuAnchor, setMoreMenuAnchor] = useState<"header" | "summary" | null>(null);
  const [moreMenuPosition, setMoreMenuPosition] = useState({ top: 0, left: 0, maxHeight: 520 });
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [clientEmailOptions, setClientEmailOptions] = useState<ClientEmailOption[]>([]);
  const [selectedToEmails, setSelectedToEmails] = useState<string[]>([]);
  const [selectedCcEmails, setSelectedCcEmails] = useState<string[]>([]);
  const [markSentPrompt, setMarkSentPrompt] = useState<null | "print" | "email">(null);

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
  const moreMenuButtonRef = useRef<HTMLButtonElement | null>(null);
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

  const positionMoreMenu = useCallback((button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    const menuWidth = 288;
    const viewportPadding = 12;
    const maxLeft = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding);
    const preferredLeft = rect.right - menuWidth;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const preferredHeight = Math.min(520, window.innerHeight - viewportPadding * 2);
    const openAbove = spaceBelow < 360 && spaceAbove > spaceBelow;
    const availableHeight = openAbove ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(120, Math.min(preferredHeight, availableHeight));
    setMoreMenuPosition({
      top: openAbove
        ? Math.max(viewportPadding, rect.top - maxHeight - 8)
        : Math.max(viewportPadding, rect.bottom + 8),
      left: Math.min(Math.max(viewportPadding, preferredLeft), maxLeft),
      maxHeight,
    });
  }, []);

  // Close floating action menus on outside click; keep the More menu clamped during scroll/resize.
  useEffect(() => {
    if (!statusDropdown && !moreMenuOpen) return;
    const closeMenus = () => {
      setStatusDropdown(false);
      setMoreMenuOpen(false);
      setMoreMenuAnchor(null);
      moreMenuButtonRef.current = null;
    };
    const repositionMoreMenu = () => {
      if (moreMenuOpen && moreMenuButtonRef.current) positionMoreMenu(moreMenuButtonRef.current);
    };
    document.addEventListener("click", closeMenus);
    window.addEventListener("resize", repositionMoreMenu);
    window.addEventListener("scroll", repositionMoreMenu, true);
    return () => {
      document.removeEventListener("click", closeMenus);
      window.removeEventListener("resize", repositionMoreMenu);
      window.removeEventListener("scroll", repositionMoreMenu, true);
    };
  }, [statusDropdown, moreMenuOpen, positionMoreMenu]);

  const openMoreMenu = (event: React.MouseEvent<HTMLButtonElement>, anchor: "header" | "summary") => {
    event.stopPropagation();
    moreMenuButtonRef.current = event.currentTarget;
    positionMoreMenu(event.currentTarget);
    setMoreMenuOpen(open => moreMenuAnchor === anchor ? !open : true);
    setMoreMenuAnchor(anchor);
    setStatusDropdown(false);
  };

  useEffect(() => {
    if (activeTab !== "preview" || quotationTemplate || previewTemplateError) return;
    let cancelled = false;
    setPreviewTemplateLoading(true);
    setPreviewTemplateError("");
    fetch("/api/quotation/template", { cache: "no-store" })
      .then(async res => {
        if (!res.ok) throw new Error("Quotation template not found");
        return res.json() as Promise<{ html: string }>;
      })
      .then(data => {
        if (!cancelled) setQuotationTemplate(data.html);
      })
      .catch(error => {
        if (!cancelled) {
          setPreviewTemplateError(error instanceof Error ? error.message : "Failed to load quotation preview");
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewTemplateLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeTab, quotationTemplate, previewTemplateError]);

  const resizePreview = useCallback((iframe: HTMLIFrameElement) => {
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.documentElement.style.overflow = "hidden";
    doc.body.style.overflow = "hidden";
    const height = Math.max(
      doc.body?.scrollHeight || 0,
      doc.documentElement?.scrollHeight || 0,
      720
    );
    setPreviewHeight(height + 4);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (previewIframeRef.current) resizePreview(previewIframeRef.current);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [resizePreview]);

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
  const emailDraftUnavailableMessage = quotation && !canCreateEmailDraft
    ? getEmailDraftUnavailableMessage(quotation.status)
    : "";
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

  const handleDuplicate = async () => {
    if (!quotation) return;
    setMoreMenuOpen(false);
    setMoreMenuAnchor(null);
    try {
      const res = await fetch(`/api/quotations/${id}/duplicate`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || "Failed to duplicate quotation");
        return;
      }
      const data = await res.json();
      toast.success("Quotation duplicated");
      router.push(`/dashboard/quotations/${data._id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to duplicate quotation");
    }
  };

  // Status change
  const updateStatus = async (newStatus: QuotationStatus) => {
    if (!quotation || !getAllowedQuotationTransitions(quotation.status).includes(newStatus)) return;
    setStatusDropdown(false);
    setMoreMenuOpen(false);
    setMoreMenuAnchor(null);
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

  const parseEmailList = (value: string) =>
    value
      .split(/[,\n;]/)
      .map(email => email.trim().toLowerCase())
      .filter(Boolean);

  const toggleContactEmail = (email: string, field: "to" | "cc") => {
    const setSelected = field === "to" ? setSelectedToEmails : setSelectedCcEmails;
    const setOtherSelected = field === "to" ? setSelectedCcEmails : setSelectedToEmails;
    setSelected(current => current.includes(email) ? current.filter(value => value !== email) : [...current, email]);
    setOtherSelected(current => current.filter(value => value !== email));
  };

  const openEmailDraftModal = async () => {
    if (!quotation) return;
    if (!canCreateEmailDraft) {
      toast.error("Finalise the quotation before creating an email draft");
      return;
    }
    setEmailRecipient("");
    setEmailCc("");
    setEmailSubject("");
    setSelectedToEmails([]);
    setSelectedCcEmails([]);
    const currentRevision = quotation.revisions.find(revision => revision.revisionNumber === quotation.currentRevisionNumber);
    setEmailSubject(currentRevision ? getQuotationEmailSubject(quotation, currentRevision) : "");
    setEmailMessage(currentRevision ? getDefaultEmailMessage(quotation, currentRevision) : "");
    setClientEmailOptions([]);
    setEmailModalOpen(true);

    if (!quotation.clientId) return;
    try {
      const res = await fetch(`/api/client-contacts?clientId=${encodeURIComponent(quotation.clientId)}`);
      if (!res.ok) return;
      const contacts = await res.json() as Array<{
        personId?: string;
        name?: string;
        designation?: string;
        isPrimaryContact?: boolean;
        emails?: string[];
        email?: string;
      }>;
      const seen = new Set<string>();
      const options = contacts.flatMap((contact, contactIndex) =>
        [...(Array.isArray(contact.emails) ? contact.emails : []), contact.email || ""]
          .map(email => email.trim().toLowerCase())
          .filter(email => {
            if (!email || seen.has(email)) return false;
            seen.add(email);
            return true;
          })
          .map((email, emailIndex) => ({
            id: `${contact.personId || contactIndex}-${emailIndex}-${email}`,
            name: contact.name?.trim() || "Client contact",
            email,
            designation: contact.designation || "",
            isPrimaryContact: Boolean(contact.isPrimaryContact),
          }))
      );
      setClientEmailOptions(options);
      if (options[0]) setSelectedToEmails([options[0].email]);
    } catch {
      // Keep the modal editable even if contact lookup fails.
    }
  };

  // Email Draft
  const handleEmailDraft = async () => {
    if (!quotation) return;
    if (!canCreateEmailDraft) {
      toast.error("Finalise the quotation before creating an email draft");
      return;
    }
    const manualTo = parseEmailList(emailRecipient);
    const toList = Array.from(new Set([...selectedToEmails, ...manualTo]));
    if (toList.length === 0) {
      toast.error("Enter a recipient email");
      return;
    }
    const ccList = Array.from(new Set([...selectedCcEmails, ...parseEmailList(emailCc)]))
      .filter(email => !toList.includes(email));
    setEmailLoading(true);
    try {
      const target = await getQuotationOutputTarget(quotation.currentRevisionNumber);
      if (!target) return;
      const tmplRes = await fetch("/api/quotation/template");
      if (!tmplRes.ok) throw new Error("Quotation template not found");
      const { html: template } = await tmplRes.json();
      const quotationHtml = buildQuotationHTML(template, target.quotation, target.revision);
      const html = prependEmailMessage(quotationHtml, emailMessage);
      const subject = emailSubject.trim() || getQuotationEmailSubject(target.quotation, target.revision);
      const filename = `${getQuotationDocumentTitle(target.quotation, target.revision)}.pdf`;
      const pdfRes = await fetch("/api/quotation/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: quotationHtml }),
      });
      if (!pdfRes.ok) {
        const data = await pdfRes.json().catch(() => null);
        throw new Error(data?.error || "Failed to generate quotation PDF");
      }
      const { contentBase64 } = await pdfRes.json() as { contentBase64: string };
      const payload = {
        to: toList,
        ...(ccList.length > 0 ? { cc: ccList } : {}),
        subject,
        html,
        attachments: [{ filename, mimeType: "application/pdf", contentBase64 }],
        logType: "quotation",
        logClientId: target.quotation.clientId,
        logClientName: target.quotation.clientName,
        logFy: target.quotation.financialYear,
      };
      const res = await fetch("/api/email/create-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success("Email draft created in Gmail");
        setEmailModalOpen(false);
        setEmailRecipient("");
        setEmailCc("");
        setEmailSubject("");
        setEmailMessage("");
        setSelectedToEmails([]);
        setSelectedCcEmails([]);
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
    const quoteNumber = getQuotationDisplayNumber(q, rev);
    return buildHTML(template, {
      quoteNumber,
      fileTitle: getQuotationDocumentTitle(q, rev),
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
      generatedAt: rev.finalisedAt || (rev.isFinalised ? rev.updatedAt : rev.createdAt) || q.createdAt,
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
  const previewRevision = viewedRevision ? buildFormRevision(viewedRevision) : null;
  const previewQuotation = quotation ? {
    ...quotation,
    clientName,
    clientId,
    clientAddress,
    clientGst,
    clientState,
    financialYear,
    validityDays,
  } : null;
  const previewHtml = quotationTemplate && previewQuotation && previewRevision
    ? buildQuotationHTML(quotationTemplate, previewQuotation, previewRevision)
    : "";
  const emailDraftRevision = quotation?.revisions.find(revision => revision.revisionNumber === quotation.currentRevisionNumber) ?? null;
  const emailAttachmentName = quotation && emailDraftRevision
    ? `${getQuotationDocumentTitle(quotation, emailDraftRevision)}.pdf`
    : "Quotation.pdf";

  if (loading) {
    return (
      <div
        className="min-h-screen space-y-8 pb-28"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif' }}
      >
        <div className="sticky top-4 z-40 rounded-[32px] border border-white/50 bg-card/75 px-5 py-5 shadow-[0_20px_60px_rgba(0,0,0,0.08)] backdrop-blur-2xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="h-11 w-11 animate-pulse rounded-full bg-surface" />
              <div className="space-y-3">
                <div className="h-8 w-52 animate-pulse rounded-full bg-surface" />
                <div className="h-4 w-72 max-w-[70vw] animate-pulse rounded-full bg-surface" />
              </div>
            </div>
            <div className="space-y-3 lg:text-right">
              <div className="h-3 w-24 animate-pulse rounded-full bg-surface lg:ml-auto" />
              <div className="h-8 w-40 animate-pulse rounded-full bg-surface" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,7fr)_minmax(340px,3fr)]">
          <div className="space-y-6">
            {[0, 1, 2].map(i => (
              <div key={i} className={`${surfaceCard} p-6 sm:p-8`}>
                <div className="mb-6 h-5 w-44 animate-pulse rounded-full bg-surface" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="h-12 animate-pulse rounded-2xl bg-surface" />
                  <div className="h-12 animate-pulse rounded-2xl bg-surface" />
                  <div className="h-24 animate-pulse rounded-[24px] bg-surface sm:col-span-2" />
                </div>
              </div>
            ))}
          </div>
          <div className={`${surfaceCard} h-96 p-6`}>
            <div className="h-4 w-28 animate-pulse rounded-full bg-surface" />
            <div className="mt-6 h-12 w-48 animate-pulse rounded-full bg-surface" />
            <div className="mt-8 space-y-4">
              <div className="h-4 animate-pulse rounded-full bg-surface" />
              <div className="h-4 animate-pulse rounded-full bg-surface" />
              <div className="h-12 animate-pulse rounded-full bg-surface" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!quotation) return null;

  const menuItemClass = "flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-sm text-default transition hover:bg-white/70 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10";
  const moreMenu = (
    <div
      className="fixed z-50 w-72 max-w-[calc(100vw-24px)] origin-top-right overflow-y-auto rounded-[24px] border border-white/80 p-2 shadow-[0_26px_90px_rgba(0,0,0,0.22)] transition-all duration-200 dark:border-white/10"
      onClick={(event) => event.stopPropagation()}
      style={{
        top: moreMenuPosition.top,
        left: moreMenuPosition.left,
        maxHeight: moreMenuPosition.maxHeight,
        backgroundColor: "rgba(245, 245, 247, 0.58)",
        backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.48), rgba(255,255,255,0.34))",
        backdropFilter: "blur(44px) saturate(220%) contrast(0.96)",
        WebkitBackdropFilter: "blur(44px) saturate(220%) contrast(0.96)",
        boxShadow: "0 28px 96px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.72), inset 0 0 0 1px rgba(255,255,255,0.28)",
      }}
    >
      <button
        onClick={() => { setMoreMenuOpen(false); handlePrintPreview(); }}
        disabled={pdfLoading}
        className={menuItemClass}
      >
        <Printer className="h-4 w-4 text-muted" />
        <span>{pdfLoading ? "Opening preview..." : "Print / Preview"}</span>
      </button>
      <button
        onClick={() => { setMoreMenuOpen(false); openEmailDraftModal(); }}
        disabled={emailLoading || !canCreateEmailDraft}
        title={canCreateEmailDraft ? "Create email draft" : emailDraftUnavailableMessage}
        className={menuItemClass}
      >
        <Mail className="h-4 w-4 text-muted" />
        <span className="min-w-0">
          <span className="block">{emailLoading ? "Creating draft..." : "Email Draft"}</span>
          {!canCreateEmailDraft && emailDraftUnavailableMessage && (
            <span className="mt-0.5 block text-xs leading-snug text-faint">{emailDraftUnavailableMessage}</span>
          )}
        </span>
      </button>
      <button
        onClick={() => { setMoreMenuOpen(false); handleCreateRevision(); }}
        disabled={!canCreateRevision || creatingRevision}
        className={menuItemClass}
      >
        <GitBranch className="h-4 w-4 text-muted" />
        <span className="min-w-0">
          <span className="block">{creatingRevision ? "Creating revision..." : "Create Revision"}</span>
          {!canCreateRevision && (
            <span className="mt-0.5 block text-xs leading-snug text-faint">Available after client response when revision rules allow it.</span>
          )}
        </span>
      </button>
      <button
        onClick={handleDuplicate}
        className={menuItemClass}
      >
        <Copy className="h-4 w-4 text-muted" />
        <span>Duplicate</span>
      </button>
      {allowedResponseStatuses.length > 0 && (
        <div className="mt-1 border-t border-black/10 pt-2 dark:border-white/10">
          <p className="px-3.5 pb-1 pt-2 text-[11px] font-semibold uppercase text-muted">Change Status</p>
          {allowedResponseStatuses.map(s => {
            const cfg = QUOTATION_STATUS_CONFIG[s];
            return (
              <button
                key={s}
                onClick={() => updateStatus(s)}
                className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-sm text-default transition hover:bg-white/70 active:scale-[0.98] dark:hover:bg-white/10"
              >
                <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                <span>{cfg.label}</span>
              </button>
            );
          })}
        </div>
      )}
      <button
        disabled
        title="Archive workflow is not available for quotations yet"
        className="mt-1 flex w-full cursor-not-allowed items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-sm text-faint opacity-50"
      >
        <AlertTriangle className="h-4 w-4" />
        <span>
          <span className="block">Archive</span>
          <span className="mt-0.5 block text-xs">Archive workflow is not available yet.</span>
        </span>
      </button>
    </div>
  );

  return (
    <div
      className="min-h-screen pb-28"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif' }}
    >
      {/* ─── TOP BAR ─── */}
      <div className="sticky top-4 z-40 mb-8 rounded-[32px] border border-white/50 bg-card/75 px-5 py-4 shadow-[0_20px_60px_rgba(0,0,0,0.08)] backdrop-blur-2xl dark:border-white/10 dark:bg-card/80 sm:px-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <button
              onClick={() => router.push("/dashboard/quotations")}
              className="mt-1 shrink-0 rounded-full border border-base bg-surface/80 p-3 text-muted transition duration-200 hover:-translate-y-0.5 hover:bg-card hover:text-default hover:shadow-sm active:scale-[0.98]"
              title="Back to quotations"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="min-w-0 truncate text-3xl font-semibold leading-tight text-default sm:text-4xl">
                {quotation.quotationNumber ? (
                  <span>{quotation.quotationNumber}</span>
                ) : (
                  <span className="text-muted">Untitled Draft</span>
                )}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
                <span className="font-medium text-default">{quotation.clientName}</span>
                <QuotationStatusPill status={quotation.status} />
                <span className="text-faint">FY {quotation.financialYear}</span>
                {quotation.validTill && <span className="text-faint">Valid till {fmtDate(quotation.validTill)}</span>}
                {savedStatus === "saving" && <span className="animate-pulse text-xs text-muted">Saving...</span>}
                {savedStatus === "saved" && <span className="flex items-center gap-1 text-xs text-emerald-500"><CheckCircle2 className="h-3 w-3" />Saved</span>}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:justify-end">
            <div className="sm:text-right">
              <p className="text-xs font-semibold uppercase text-muted">Grand Total</p>
              <p className="mt-1 text-3xl font-semibold leading-none text-default">{money(liveGrand)}</p>
            </div>
            <div className="flex items-center gap-2">
              {isEditable && (
                <button
                  onClick={handleFinalize}
                  disabled={finalising}
                  className="btn-primary gap-2 rounded-full px-5 py-3 text-sm shadow-sm shadow-brand-600/15 transition duration-200 active:scale-[0.98]"
                >
                  <Sparkles className="h-4 w-4" />
                  {finalising ? "Finalising..." : "Finalise Quote"}
                </button>
              )}
              {!isEditable && canCreateEmailDraft && (
                <button
                  onClick={openEmailDraftModal}
                  disabled={emailLoading}
                  className="btn-primary gap-2 rounded-full px-5 py-3 text-sm shadow-sm shadow-brand-600/15 transition duration-200 active:scale-[0.98]"
                >
                  <Mail className="h-4 w-4" />
                  {emailLoading ? "Creating..." : "Email Draft"}
                </button>
              )}
              {!isEditable && !canCreateEmailDraft && (
                <div className="hidden rounded-full border border-base bg-surface/80 px-4 py-2 text-sm text-muted sm:block">
                  {QUOTATION_STATUS_CONFIG[quotation.status].label}
                </div>
              )}
              <div className="relative">
                <button
                  onClick={(e) => openMoreMenu(e, "header")}
                  className="inline-flex items-center gap-2 rounded-full border border-base bg-surface/80 px-4 py-3 text-muted transition duration-200 hover:-translate-y-0.5 hover:bg-card hover:text-default hover:shadow-sm active:scale-[0.98]"
                  title="More actions"
                >
                  <MoreHorizontal className="h-5 w-5" />
                  <span className="hidden text-sm font-medium sm:inline">More</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── REVISION STEPPER ─── */}
      {quotation.revisions.length > 0 && (
        <div className="mb-6 flex max-w-full items-center gap-2 overflow-x-auto rounded-[28px] border border-base bg-surface/70 p-2 shadow-sm backdrop-blur-xl">
          {quotation.revisions.map(rev => (
            <button
              key={rev.revisionNumber}
              onClick={() => setSelectedRevNum(rev.revisionNumber)}
              className={`flex shrink-0 items-center gap-3 rounded-full border px-4 py-2.5 text-sm font-medium transition-all duration-200 whitespace-nowrap active:scale-[0.98] ${
                selectedRevNum === rev.revisionNumber
                  ? "border-white/70 bg-card text-default shadow-[0_10px_30px_rgba(0,0,0,0.08)]"
                  : "border-transparent text-muted hover:bg-card/70 hover:text-default"
              }`}
            >
              <span className={`h-2 w-2 rounded-full shrink-0 ${rev.isFinalised ? "bg-emerald-400" : "bg-amber-400"}`} title={rev.isFinalised ? "Finalised" : "Draft"} />
              <span className="font-mono text-xs">Rev {rev.revisionNumber}</span>
              <span className="text-xs text-faint">{rev.isFinalised ? "Finalised" : "Draft"}</span>
              <span className="font-mono text-xs tabular-nums text-default">{money(rev.grandTotal)}</span>
            </button>
          ))}
          {canCreateRevision && (
            <button
              onClick={handleCreateRevision}
              disabled={creatingRevision}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-base px-4 py-2.5 text-xs text-muted transition-all duration-200 hover:bg-card hover:text-default active:scale-[0.98]"
            >
              <Plus className="w-3 h-3" /> New Revision
            </button>
          )}
        </div>
      )}

      {/* ─── DIFF BANNER ─── */}
      {diffChanges.length > 0 && selectedRevNum !== null && selectedRevNum > 0 && (
        <div className="mb-6 rounded-[28px] border border-base bg-card/80 p-4 shadow-sm backdrop-blur-xl sm:p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="rounded-full bg-amber-100/70 p-2 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              <GitBranch className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-default">Changes in this revision</p>
              <p className="text-xs text-muted">Rev {selectedRevNum - 1} to Rev {selectedRevNum}</p>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {diffChanges.map((change, i) => (
              <div key={i} className="rounded-2xl border border-base bg-surface/70 p-3.5 text-sm">
                <p className="mb-2 text-xs font-semibold uppercase text-muted">{change.field}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted line-through opacity-70">{change.from}</span>
                  <span className="text-faint">to</span>
                  <span className="font-medium text-default">{change.to}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── MAIN TABS ─── */}
      <div className="mb-8 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-base bg-surface/70 p-1.5 shadow-sm">
        {[
          { key: "editor", label: isEditable ? "Editor" : "Details", icon: FileText },
          { key: "preview", label: "Preview", icon: Eye },
          { key: "timeline", label: "Activity", icon: Activity },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as "editor" | "preview" | "timeline")}
            className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-200 active:scale-[0.98] ${
              activeTab === key ? "bg-card shadow-[0_10px_30px_rgba(0,0,0,0.08)] text-default" : "text-muted hover:bg-card/60 hover:text-default"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ─── EDITOR TAB ─── */}
      {activeTab === "editor" && (
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,7fr)_minmax(340px,3fr)]">
          {/* LEFT — FORM */}
          <div className="order-2 space-y-8 xl:order-1">
            {!isEditable && selectedRevNum !== quotation.currentRevisionNumber && (
              <div className="flex items-center gap-3 rounded-2xl border border-base bg-surface/70 p-4">
                <EyeOff className="w-4 h-4 text-muted shrink-0" />
                <p className="text-sm text-muted">
                  Viewing Rev {selectedRevNum} (read-only). The current revision is Rev {quotation.currentRevisionNumber}.
                </p>
              </div>
            )}

            {!isEditable && (
              <>
                <div className={`${surfaceCard} p-6 sm:p-8`}>
                  <div className="mb-6">
                    <h3 className="flex items-center gap-2 text-xl font-semibold text-default"><Building2 className="h-5 w-5 text-muted" />Quotation Details</h3>
                    <p className="mt-1 text-sm text-muted">Client and validity information for this quotation.</p>
                  </div>
                  <div className="divide-y divide-soft">
                    {[
                      { label: "Client Name", value: clientName, wide: true },
                      { label: "Financial Year", value: financialYear },
                      { label: "Billing Address", value: clientAddress || "Not provided", wide: true },
                      { label: "Client GSTIN", value: clientGst || "Not provided", mono: true },
                      { label: "State", value: clientState || "Not provided" },
                      { label: "Validity", value: `${validityDays} days` },
                      ...(viewedRevision?.finalisedAt ? [{ label: "Finalised", value: fmtDate(viewedRevision.finalisedAt) }] : []),
                    ].map(({ label, value, wide, mono }) => (
                      <div key={label} className={`grid gap-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[160px_minmax(0,1fr)] ${wide ? "sm:items-start" : "sm:items-center"}`}>
                        <p className={sectionEyebrow}>{label}</p>
                        <p className={`break-words text-sm leading-relaxed text-default ${mono ? "font-mono" : ""}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`${surfaceCard} p-5 sm:p-6`}>
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <h3 className="flex items-center gap-2 text-base font-semibold text-default"><IndianRupee className="h-4 w-4 text-muted" />Line Items</h3>
                    <p className="text-xs text-muted">{items.length} {items.length === 1 ? "item" : "items"}</p>
                  </div>
                  {items.length > 0 ? (
                    <div className="space-y-4">
                      {items.map((item, idx) => {
                        const { gstAmt, total } = calcItem(item);
                        return (
                          <article key={item._id} className="rounded-[24px] border border-base bg-surface/70 p-5 transition duration-200 hover:-translate-y-0.5 hover:bg-card hover:shadow-[0_18px_48px_rgba(0,0,0,0.06)] sm:p-6">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className={sectionEyebrow}>Item {idx + 1}</p>
                                <h4 className="mt-1 text-lg font-semibold leading-snug text-default">{item.description || "EPR Credit Procurement"}</h4>
                                <p className="mt-2 text-sm leading-relaxed text-muted">{item.category} credit for {item.type} compliance.</p>
                              </div>
                              <div className="shrink-0 sm:text-right">
                                <p className={sectionEyebrow}>Total</p>
                                <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-default">{money(total)}</p>
                                {item.gstPercent > 0 && <p className="mt-1 text-xs text-muted">Includes GST {money(gstAmt)}</p>}
                              </div>
                            </div>
                            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                              {[
                                { label: "Category", value: item.category },
                                { label: "Quantity", value: `${item.quantity.toLocaleString("en-IN")} MT`, mono: true },
                                { label: "Unit Price", value: money(item.rate), mono: true },
                                { label: "GST", value: `${item.gstPercent}%`, mono: true },
                              ].map(({ label, value, mono }) => (
                                <div key={label} className="rounded-2xl border border-base bg-card/70 px-4 py-3">
                                  <p className={sectionEyebrow}>{label}</p>
                                  <p className={`mt-1 text-sm font-medium text-default ${mono ? "font-mono tabular-nums" : ""}`}>{value}</p>
                                </div>
                              ))}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-base bg-surface/70 p-8 text-center text-sm text-muted">No line items in this revision.</div>
                  )}
                </div>

                <div className={`${surfaceCard} p-6 sm:p-8`}>
                  <div className="mb-6 flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-muted" />
                    <div>
                      <h3 className="text-xl font-semibold text-default">Charges</h3>
                      <p className="mt-1 text-sm text-muted">Fees and tax components in this revision.</p>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { label: "Consultation", value: money(liveCC), helper: `GST ${Number(consultationGstPercent) || 0}% - ${money(liveCCGst)}` },
                      { label: "Government Fees", value: money(liveGF), helper: "CPCB / SPCB / portal charges" },
                      { label: "Grand Total", value: money(liveGrand), emphasis: true },
                    ].map(({ label, value, helper, emphasis }) => (
                      <div key={label} className="rounded-[24px] border border-base bg-surface/70 p-5">
                        <p className={sectionEyebrow}>{label}</p>
                        <p className={`mt-2 font-mono font-semibold tabular-nums text-default ${emphasis ? "text-2xl" : "text-lg"}`}>{value}</p>
                        {helper && <p className="mt-2 text-xs text-muted">{helper}</p>}
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`${surfaceCard} p-6 sm:p-8`}>
                  <h3 className="text-xl font-semibold text-default">Notes / Terms</h3>
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-default">{notes || "No notes or special terms."}</p>
                </div>
              </>
            )}

            {isEditable && (
              <>
                <div className={`${surfaceCard} p-6 sm:p-8`}>
                  <div className="mb-6">
                    <h3 className="flex items-center gap-2 text-xl font-semibold text-default"><Building2 className="h-5 w-5 text-muted" />Client details</h3>
                    <p className="mt-1 text-sm text-muted">Who this quotation is prepared for.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="relative sm:col-span-2">
                      <label className="label">Client Name *</label>
                      <input className={`${softInput} w-full`} value={clientName} onChange={e => { setClientName(e.target.value); setShowSuggestions(true); if (!e.target.value) { setClientId(""); setClientAddress(""); setClientGst(""); setClientState(""); } }} onFocus={() => setShowSuggestions(true)} disabled={!isEditable} placeholder="Company name" />
                      {showSuggestions && clientSuggestions.length > 0 && (
                        <div onClick={e => e.stopPropagation()} className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-y-auto rounded-[24px] border border-base bg-card/95 p-2 shadow-[0_22px_70px_rgba(0,0,0,0.12)] backdrop-blur-xl">
                          {clientSuggestions.map(client => (
                            <button key={client.clientId} type="button" onClick={() => { setClientName(client.companyName); setClientId(client.clientId); setClientAddress(client.address || ""); setClientGst(client.gstNumber || ""); setClientState(client.state || ""); setShowSuggestions(false); }} className="w-full rounded-[20px] px-4 py-3 text-left text-sm text-default transition duration-200 hover:bg-surface active:scale-[0.98]">
                              <p className="font-semibold">{client.companyName}</p>
                              <p className="mt-1 text-xs text-muted">{[client.gstNumber ? `GST ${client.gstNumber}` : "", client.state].filter(Boolean).join(" - ") || "Client record"}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div><label className="label">Financial Year</label><select className={`${softInput} w-full`} value={financialYear} onChange={e => setFinancialYear(e.target.value)} disabled={!isEditable}>{FINANCIAL_YEARS.map(y => <option key={y}>{y}</option>)}</select></div>
                    <div className="sm:col-span-2"><label className="label">Billing Address</label><input className={`${softInput} w-full`} value={clientAddress} onChange={e => setClientAddress(e.target.value)} disabled={!isEditable} placeholder="Billing street address, state, etc." /></div>
                    <div><label className="label">Client GSTIN</label><input className={`${softInput} w-full font-mono`} value={clientGst} onChange={e => setClientGst(e.target.value.toUpperCase())} disabled={!isEditable} placeholder="GSTIN number" maxLength={15} /></div>
                    <div><label className="label">State Code</label><input className={`${softInput} w-full`} value={clientState} onChange={e => setClientState(e.target.value)} disabled={!isEditable} placeholder="State e.g. Delhi, Maharashtra" /></div>
                    <div><label className="label">Valid for (days)</label><input type="number" className={`${softInput} w-full`} value={validityDays} onChange={e => setValidityDays(Number(e.target.value))} disabled={!isEditable} min={1} /></div>
                  </div>
                </div>

                <div className={`${surfaceCard} p-5 sm:p-6`}>
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <h3 className="flex items-center gap-2 text-base font-semibold text-default"><IndianRupee className="h-4 w-4 text-muted" />Line Items</h3>
                    <button onClick={() => setItems(prev => [...prev, newItem()])} className="glass-btn glass-btn-primary rounded-full px-4 py-2 transition duration-200 active:scale-[0.98]"><Plus className="h-3.5 w-3.5" /> Add Item</button>
                  </div>
                  <div className="space-y-4">
                    {items.map((item, idx) => {
                      const { gstAmt, total } = calcItem(item);
                      return (
                        <article key={item._id} className="rounded-[24px] border border-base bg-surface/70 p-5 transition duration-200 hover:-translate-y-0.5 hover:bg-card hover:shadow-[0_18px_48px_rgba(0,0,0,0.06)] sm:p-6">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="mb-2 flex items-center justify-between gap-3"><label className={sectionEyebrow}>Product / Service</label><span className="text-xs text-faint">Item {idx + 1}</span></div>
                              <input list={`services-list-${item._id}`} className={`${softInput} w-full`} value={item.description} onChange={e => { const val = e.target.value; updateItem(idx, "description", val); const matched = STANDARD_SERVICES.find(s => s.description === val); if (matched) { updateItem(idx, "category", matched.category); updateItem(idx, "type", matched.type); } }} disabled={!isEditable} />
                              <datalist id={`services-list-${item._id}`}>{STANDARD_SERVICES.map(s => <option key={s.label} value={s.description}>{s.category} - {s.type}</option>)}</datalist>
                              <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">{STANDARD_SERVICES.slice(0, 4).map(service => <button key={service.label} type="button" onClick={() => { updateItem(idx, "description", service.description); updateItem(idx, "category", service.category); updateItem(idx, "type", service.type); }} disabled={!isEditable} className="shrink-0 rounded-full border border-transparent bg-card/60 px-2.5 py-1 text-[11px] font-medium text-faint transition duration-200 hover:-translate-y-0.5 hover:border-base hover:bg-surface hover:text-muted active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">{service.category} {service.type}</button>)}</div>
                            </div>
                            <div className="flex items-start justify-between gap-3 sm:block sm:min-w-40 sm:text-right">
                              <div><p className={sectionEyebrow}>Total</p><p className="mt-1 font-mono text-xl font-semibold tabular-nums text-default">{money(total)}</p>{item.gstPercent > 0 && <p className="mt-1 text-xs text-muted">GST {money(gstAmt)}</p>}</div>
                              <button onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} disabled={items.length === 1} className="rounded-full p-2 text-faint transition hover:bg-red-50 hover:text-red-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-red-900/20" title="Remove item"><Trash2 className="h-4 w-4" /></button>
                            </div>
                          </div>
                          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                            <div><label className="label">Category</label><select className={`${softInput} w-full`} value={item.category} onChange={e => updateItem(idx, "category", e.target.value)} disabled={!isEditable}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
                            <div><label className="label">Type</label><select className={`${softInput} w-full`} value={item.type} onChange={e => updateItem(idx, "type", e.target.value)} disabled={!isEditable}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                            <div><label className="label">Quantity (MT)</label><input type="number" min="0" className={`${softInput} w-full font-mono text-right tabular-nums`} value={item.quantity || ""} onChange={e => updateItem(idx, "quantity", Number(e.target.value))} disabled={!isEditable} /></div>
                            <div><label className="label">Unit Price</label><input type="number" min="0" step="0.01" className={`${softInput} w-full font-mono text-right tabular-nums`} value={item.rate || ""} onChange={e => updateItem(idx, "rate", Number(e.target.value))} disabled={!isEditable} placeholder="0.00" /></div>
                            <div><label className="label">GST</label><select className={`${softInput} w-full`} value={item.gstPercent} onChange={e => updateItem(idx, "gstPercent", Number(e.target.value))} disabled={!isEditable}>{GST_OPTIONS.map(g => <option key={g} value={g}>{g}%</option>)}</select></div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <button onClick={() => setItems(prev => [...prev, newItem()])} className={`${appleButton} mt-4 border border-base bg-surface text-default hover:bg-card`}><Plus className="mr-2 h-4 w-4" />Add Item</button>
                </div>

                <div className={`${surfaceCard} p-6 sm:p-8`}>
                  <div className="mb-6"><h3 className="flex items-center gap-2 text-xl font-semibold text-default"><Receipt className="h-5 w-5 text-muted" />Additional charges</h3><p className="mt-1 text-sm text-muted">Consultation, tax, and statutory fees.</p></div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div><label className="label">Consultation Charges</label><input type="number" min="0" step="0.01" className={`${softInput} w-full font-mono tabular-nums`} value={consultationCharges} onChange={e => setConsultationCharges(e.target.value)} disabled={!isEditable} /></div>
                    <div><label className="label">Consultation GST %</label><select className={`${softInput} w-full`} value={consultationGstPercent} onChange={e => setConsultationGstPercent(e.target.value)} disabled={!isEditable}>{GST_OPTIONS.map(g => <option key={g} value={g}>{g}%</option>)}</select></div>
                    <div><label className="label">Government Fees</label><input type="number" min="0" step="0.01" className={`${softInput} w-full font-mono tabular-nums`} value={governmentFees} onChange={e => setGovernmentFees(e.target.value)} disabled={!isEditable} /><p className="mt-2 text-xs text-faint">CPCB / SPCB / portal charges.</p></div>
                  </div>
                </div>

                <div className={`${surfaceCard} p-6 sm:p-8`}>
                  <div className="mb-5"><h3 className="text-xl font-semibold text-default">Notes / Terms</h3><p className="mt-1 text-sm text-muted">Payment terms, validity, or client-facing conditions.</p></div>
                  <textarea className={`${softTextarea} min-h-36 w-full resize-y`} rows={5} value={notes} onChange={e => setNotes(e.target.value)} disabled={!isEditable} placeholder="Payment terms, validity, special conditions..." />
                </div>
              </>
            )}
          </div>

          {/* RIGHT — STATUS + QUICK SUMMARY */}
          <div className="order-1 xl:order-2">
            <div className="xl:sticky xl:top-32">
              {/* Summary card */}
              <div className="rounded-[32px] border border-white/70 bg-card/90 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.10)] backdrop-blur-xl dark:border-white/10 dark:bg-card/80">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-faint">{quotation.quotationNumber || "DRAFT"}{quotation.quotationNumber ? ` - Rev ${quotation.currentRevisionNumber}` : ""}</p>
                    <p className="mt-2 truncate text-lg font-semibold leading-snug text-default">{quotation.clientName}</p>
                    <p className="mt-1 text-sm text-muted">FY {quotation.financialYear}</p>
                  </div>
                  <QuotationStatusPill status={quotation.status} />
                </div>

                <div className="my-6 rounded-[28px] border border-base bg-surface/70 p-5">
                  <p className="text-xs font-semibold uppercase text-muted">Grand Total</p>
                  <p className="mt-2 font-mono text-4xl font-semibold leading-none tabular-nums text-default">{money(liveGrand)}</p>
                </div>

                <div className="space-y-3 text-sm">
                  {[
                    { label: "EPR Credits", value: liveItemsSubtotal },
                    { label: "GST on Credits", value: liveItemsGst },
                    ...(liveCC > 0 ? [{ label: "Consultation", value: liveCC }] : []),
                    ...(liveCCGst > 0 ? [{ label: "GST on Consultation", value: liveCCGst }] : []),
                    ...(liveGF > 0 ? [{ label: "Government Fees", value: liveGF }] : []),
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between gap-4">
                      <span className="text-muted">{label}</span>
                      <span className="font-mono font-medium tabular-nums text-default">{money(value)}</span>
                    </div>
                  ))}
                </div>

                <div className="my-6 h-px bg-base" />

                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted">Current Revision</span>
                    <span className="font-mono font-medium text-default">Rev {quotation.currentRevisionNumber}</span>
                  </div>
                  {quotation.validTill && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted">Valid Till</span>
                      <span className="text-default">{fmtDate(quotation.validTill)}</span>
                    </div>
                  )}
                  {quotation.sentAt && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted">Sent</span>
                      <span className="text-default">{fmtDate(quotation.sentAt)}</span>
                    </div>
                  )}
                </div>

                <div className="mt-6 grid gap-2">
                  {isEditable ? (
                    <button onClick={handleFinalize} disabled={finalising} className="btn-primary w-full justify-center gap-2 rounded-full py-3 shadow-sm shadow-brand-600/15 transition duration-200 active:scale-[0.98]">
                      <Sparkles className="h-4 w-4" />
                      {finalising ? "Finalising..." : "Finalise Quote"}
                    </button>
                  ) : canCreateEmailDraft ? (
                    <button onClick={openEmailDraftModal} disabled={emailLoading} className="btn-primary w-full justify-center gap-2 rounded-full py-3 shadow-sm shadow-brand-600/15 transition duration-200 active:scale-[0.98]">
                      <Mail className="h-4 w-4" />
                      {emailLoading ? "Creating..." : "Email Draft"}
                    </button>
                  ) : null}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => openMoreMenu(e, "summary")}
                      className="btn-secondary w-full justify-center gap-2 rounded-full bg-card/90 py-3 text-sm transition duration-200 active:scale-[0.98]"
                    >
                      <MoreHorizontal className="h-4 w-4" /> More
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── PREVIEW TAB ─── */}
      {activeTab === "preview" && (
        <div className="rounded-[32px] border border-base bg-[#f5f5f7] p-4 shadow-sm sm:p-8 dark:bg-surface">
          <div className="mb-6 flex flex-col gap-4 rounded-[28px] border border-white/70 bg-card/85 p-4 shadow-sm backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
            <div>
              <p className="font-mono text-xs text-faint">{quotation.quotationNumber || "DRAFT"} - Rev {selectedRevNum ?? quotation.currentRevisionNumber}</p>
              <h3 className="mt-1 text-lg font-semibold text-default">Quotation Preview</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={handlePrintPreview} disabled={pdfLoading} className={`${appleButton} border border-base bg-card text-default hover:bg-surface`}>
                <Printer className="mr-2 h-4 w-4" />{pdfLoading ? "Opening..." : "Print"}
              </button>
              {canCreateEmailDraft && (
                <button onClick={openEmailDraftModal} disabled={emailLoading} className={`${appleButton} border border-base bg-card text-default hover:bg-surface`}>
                  <Mail className="mr-2 h-4 w-4" />Email Draft
                </button>
                  )}
                </div>
              </div>
          {previewTemplateLoading && (
            <div className="mx-auto max-w-[860px] rounded-[28px] border border-base bg-white p-8 shadow-[0_30px_90px_rgba(0,0,0,0.10)]">
              <div className="mb-6 h-5 w-44 animate-pulse rounded-full bg-surface" />
              <div className="space-y-3">
                <div className="h-4 animate-pulse rounded-full bg-surface" />
                <div className="h-4 w-5/6 animate-pulse rounded-full bg-surface" />
                <div className="h-56 animate-pulse rounded-[24px] bg-surface" />
              </div>
              <p className="mt-6 text-center text-sm text-muted">Preparing preview...</p>
            </div>
          )}
          {previewTemplateError && (
            <div className="mx-auto max-w-3xl rounded-[28px] border border-red-200 bg-card p-6 text-center shadow-sm dark:border-red-900/50">
              <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-red-500" />
              <p className="text-sm font-medium text-red-600 dark:text-red-400">{previewTemplateError}</p>
              <button onClick={() => { setPreviewTemplateError(""); setQuotationTemplate(""); }} className={`${appleButton} mt-4 border border-base bg-surface text-default hover:bg-card`}>Retry</button>
            </div>
          )}
          {previewHtml && (
            <iframe
              ref={previewIframeRef}
              title="Quotation preview"
              srcDoc={previewHtml}
              className="mx-auto block w-full max-w-[860px] rounded-2xl border border-base bg-white shadow-[0_30px_90px_rgba(0,0,0,0.12)]"
              style={{ height: previewHeight }}
              sandbox="allow-same-origin"
              scrolling="no"
              onLoad={event => {
                const iframe = event.currentTarget;
                requestAnimationFrame(() => resizePreview(iframe));
              }}
            />
          )}
        </div>
      )}

      {/* Activity tab */}
      {activeTab === "timeline" && (
        <div className={`${surfaceCard} max-w-3xl p-6 sm:p-8`}>
          <div className="mb-8">
            <h3 className="text-xl font-semibold text-default">Activity</h3>
            <p className="mt-1 text-sm text-muted">Complete history for this quotation.</p>
          </div>
          {quotation.activities.length > 0 ? (
            <div className="relative space-y-4 before:absolute before:left-5 before:top-6 before:h-[calc(100%-48px)] before:w-px before:bg-base">
              {[...quotation.activities].reverse().map((activity, i) => (
                <div key={i} className="relative flex gap-4">
                  <div className="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-base bg-card text-brand-500 shadow-sm">
                    <Activity className="h-4 w-4" />
                  </div>
                  <div className="flex-1 rounded-[24px] border border-base bg-surface/70 p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-card hover:shadow-[0_16px_44px_rgba(0,0,0,0.06)]">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-semibold text-default">{activity.action}</p>
                      <p className="text-xs text-faint">{fmtDate(activity.timestamp)} - {fmtTime(activity.timestamp)}</p>
                    </div>
                    {activity.detail && <p className="mt-2 text-sm leading-relaxed text-muted">{activity.detail}</p>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[28px] border border-dashed border-base bg-surface/70 p-8 text-center">
              <Activity className="mx-auto mb-3 h-6 w-6 text-muted" />
              <p className="text-sm font-semibold text-default">No activity yet</p>
              <p className="mt-1 text-sm text-muted">Actions like finalising, sending, and revisions will appear here.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "editor" && (isEditable || canCreateEmailDraft) && (
        <div className="fixed inset-x-3 bottom-3 z-40 rounded-[24px] border border-white/70 bg-card/90 p-2 shadow-[0_18px_60px_rgba(0,0,0,0.16)] backdrop-blur-xl xl:hidden dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 px-2">
              <p className="text-[11px] font-semibold uppercase text-muted">Grand Total</p>
              <p className="truncate font-mono text-lg font-semibold tabular-nums text-default">{money(liveGrand)}</p>
            </div>
            {isEditable ? (
              <button onClick={handleFinalize} disabled={finalising} className="btn-primary shrink-0 gap-2 rounded-[20px] px-4 py-3 transition duration-200 active:scale-[0.98]">
                <Sparkles className="h-4 w-4" />
                {finalising ? "Finalising..." : "Finalise"}
              </button>
            ) : (
              <button onClick={openEmailDraftModal} disabled={emailLoading} className="btn-primary shrink-0 gap-2 rounded-[20px] px-4 py-3 transition duration-200 active:scale-[0.98]">
                <Mail className="h-4 w-4" />
                Email
              </button>
            )}
          </div>
        </div>
      )}

      <Modal
        open={emailModalOpen}
        onClose={() => {
          if (!emailLoading) setEmailModalOpen(false);
        }}
        title="Create Email Draft"
        size="xl"
        hideHeader
        className="rounded-[36px] border-white/70 shadow-[0_34px_110px_rgba(0,0,0,0.28)] backdrop-blur-2xl dark:border-white/10"
        bgColor="rgba(232,232,235,0.86)"
      >
        <form
          className="flex max-h-[90vh] flex-col overflow-hidden bg-transparent"
          onSubmit={(e) => {
            e.preventDefault();
            handleEmailDraft();
          }}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/35 bg-white/20 px-5 py-5 backdrop-blur-2xl sm:px-6 dark:border-white/10 dark:bg-white/5">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 shadow-sm">
                <Mail className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-default">Create Email Draft</h3>
                <p className="mt-1 text-sm text-muted">{quotation.quotationNumber || "Draft quotation"} for {quotation.clientName}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { if (!emailLoading) setEmailModalOpen(false); }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/60 bg-white/55 text-muted shadow-sm backdrop-blur-xl transition duration-200 hover:bg-white/80 hover:text-default active:scale-[0.98] dark:border-white/10 dark:bg-white/10"
              aria-label="Close email draft modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto bg-[#d8d8dc]/55 px-5 py-5 backdrop-blur-2xl sm:px-6 dark:bg-surface/70">
            <section>
              <p className={sectionEyebrow}>Recipients</p>
              {clientEmailOptions.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-3">
                  {clientEmailOptions.map(option => (
                    <div key={option.id} className="flex h-14 min-w-[220px] max-w-[270px] items-center gap-2 rounded-full border border-white/80 bg-white/92 px-2.5 py-2 shadow-[0_8px_22px_rgba(0,0,0,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-white dark:border-white/10 dark:bg-card/85">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f1f1f3] text-[11px] font-semibold text-muted shadow-inner dark:bg-surface">
                        {option.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "C"}
                      </div>
                      <div className="min-w-0 flex-1 leading-none">
                        <p className="truncate text-[13px] font-semibold leading-4 text-default">{option.name}</p>
                        <p className="mt-0.5 truncate text-[11px] leading-3 text-muted">{option.email}</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <label className={`cursor-pointer rounded-full px-2.5 py-1 text-[9px] font-bold uppercase leading-none transition duration-200 ${selectedToEmails.includes(option.email) ? "bg-brand-600 text-white shadow-sm shadow-brand-600/20" : "bg-[#f1f1f3] text-faint hover:text-muted dark:bg-surface"}`}>
                          <input type="checkbox" checked={selectedToEmails.includes(option.email)} onChange={() => toggleContactEmail(option.email, "to")} className="sr-only" />
                          To
                        </label>
                        <label className={`cursor-pointer rounded-full px-2.5 py-1 text-[9px] font-bold uppercase leading-none transition duration-200 ${selectedCcEmails.includes(option.email) ? "bg-muted text-white shadow-sm" : "bg-[#f1f1f3] text-faint hover:text-muted dark:bg-surface"}`}>
                          <input type="checkbox" checked={selectedCcEmails.includes(option.email)} onChange={() => toggleContactEmail(option.email, "cc")} className="sr-only" />
                          CC
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-[24px] border border-dashed border-white/70 bg-white/60 p-4 text-sm text-muted shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-card/70">No saved client contacts found. Add recipients manually below.</div>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Additional To</label>
                  <input type="text" className={`${softInput} w-full border-white/75 bg-white/88 shadow-[0_8px_24px_rgba(0,0,0,0.06)] focus:bg-white dark:border-base dark:bg-card`} value={emailRecipient} onChange={(e) => setEmailRecipient(e.target.value)} placeholder="client@example.com" autoFocus={clientEmailOptions.length === 0} />
                  <p className="mt-1 text-xs text-faint">Separate multiple email addresses with commas.</p>
                </div>
                <div>
                  <label className="label">Additional CC</label>
                  <input type="text" className={`${softInput} w-full border-white/75 bg-white/88 shadow-[0_8px_24px_rgba(0,0,0,0.06)] focus:bg-white dark:border-base dark:bg-card`} value={emailCc} onChange={(e) => setEmailCc(e.target.value)} placeholder="accounts@example.com, owner@example.com" />
                  <p className="mt-1 text-xs text-faint">Separate multiple emails with commas.</p>
                </div>
              </div>
            </section>

            <section>
              <label className={sectionEyebrow}>Subject</label>
              <input className="mt-3 h-12 w-full rounded-full border border-white/75 bg-white/88 px-5 text-sm font-medium text-default shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-200 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10 dark:border-base dark:bg-card" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Quotation subject" />
            </section>

            <section>
              <label className={sectionEyebrow}>Message Body</label>
              <textarea className="mt-3 min-h-60 w-full resize-y rounded-[32px] border border-white/75 bg-white/92 px-5 py-5 text-sm leading-relaxed text-default shadow-[0_16px_44px_rgba(0,0,0,0.08)] transition-all duration-200 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10 dark:border-base dark:bg-card" rows={9} value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} placeholder="Add a short message for the client" />
              <p className="mt-2 text-xs text-faint">This message appears above the quotation and can be edited in Gmail after the draft is created.</p>
            </section>

            <section>
              <div className="flex items-center gap-3 rounded-[24px] border border-white/75 bg-white/88 px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.06)] dark:border-base dark:bg-card">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-default">{emailAttachmentName}</p>
                  <p className="mt-0.5 text-[11px] font-semibold uppercase text-muted">Generated automatically</p>
                </div>
              </div>
            </section>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-white/35 bg-white/45 px-5 py-4 shadow-[0_-12px_36px_rgba(0,0,0,0.04)] backdrop-blur-2xl sm:px-6 dark:border-white/10 dark:bg-card/70">
            <button type="button" className={`${appleButton} border border-white/70 bg-white/70 text-default shadow-sm hover:bg-white dark:border-base dark:bg-surface dark:hover:bg-card`} disabled={emailLoading} onClick={() => setEmailModalOpen(false)}>Cancel</button>
            <button type="submit" className={`${appleButton} bg-brand-600 text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700`} disabled={emailLoading || (selectedToEmails.length === 0 && !emailRecipient.trim())}>
              <Send className="mr-2 h-4 w-4" />
              {emailLoading ? "Creating..." : "Create Gmail Draft"}
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
        <div className="space-y-5">
          <div className="flex items-start gap-4 rounded-[28px] border border-base bg-surface/70 p-5">
            <div className="rounded-full bg-brand-500/10 p-3 text-brand-600">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-default">Mark quotation as sent?</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">This helps track client response and quotation status.</p>
            </div>
          </div>
          <p className="text-sm text-muted">
            {markSentPrompt === "email"
              ? "The email draft was created. Mark this quotation as Sent once you are ready to track the client response."
              : "The print preview is open. Mark this quotation as Sent if you are sharing it with the client now."}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={`${appleButton} border border-base bg-surface text-default hover:bg-card`}
              onClick={() => setMarkSentPrompt(null)}
            >
              Not now
            </button>
            <button
              type="button"
              className={`${appleButton} bg-brand-600 text-white hover:bg-brand-700`}
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
      {moreMenuOpen && moreMenuAnchor && typeof document !== "undefined" && createPortal(moreMenu, document.body)}
    </div>
  );
}

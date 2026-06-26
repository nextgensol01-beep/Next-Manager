"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  ArrowLeft, Plus, Trash2, CheckCircle2, GitBranch,
  Mail, Activity, FileText, Eye, EyeOff, Printer,
  AlertTriangle, IndianRupee, Receipt, Building2,
  Sparkles, MoreHorizontal, Copy, Send, X,
  Bold, Minus, Save, ChevronDown, Check, UserRound, CalendarDays
} from "lucide-react";
import { FINANCIAL_YEARS } from "@/lib/utils";
import { buildQuotationHTML as buildHTML } from "@/utils/quotationTemplate";
import { escapeHtml, escapeHtmlWithLineBreaks } from "@/utils/sanitizeHtml";
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

interface EmailMessageTemplate {
  _id: string;
  name: string;
  bodyHtml: string;
  bodyText: string;
  createdAt?: string;
  updatedAt?: string;
}

const MAX_EMAIL_MESSAGE_TEMPLATES = 10;
type EmailTemplateVariable = "clientName" | "financialYear";

const EMAIL_TEMPLATE_VARIABLES: Record<EmailTemplateVariable, { label: string; token: string }> = {
  clientName: { label: "Client Name", token: "{{clientName}}" },
  financialYear: { label: "Financial Year", token: "{{financialYear}}" },
};

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

const quoteCardSurface =
  "border border-black/[0.08] bg-white/90 shadow-[0_18px_60px_rgba(0,0,0,0.06)] dark:border-white/[0.10] dark:bg-[#1c1c1e]/90 dark:shadow-[0_22px_70px_rgba(0,0,0,0.52)]";
const quoteSubtleSurface =
  "border border-black/[0.08] bg-[#f5f5f7]/80 dark:border-white/[0.10] dark:bg-white/[0.06]";
const quoteNestedSurface =
  "border border-black/[0.08] bg-white/70 dark:border-white/[0.10] dark:bg-white/[0.05]";
const quoteControlSurface =
  "border border-black/[0.08] bg-white/[0.72] hover:bg-white dark:border-white/[0.10] dark:bg-white/[0.06] dark:hover:bg-white/[0.10]";
const quoteActiveSurface =
  "border-white/70 bg-white text-default shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-white/[0.16] dark:bg-white/[0.10] dark:shadow-[0_12px_34px_rgba(0,0,0,0.42)]";
const surfaceCard =
  `rounded-[24px] sm:rounded-[32px] ${quoteCardSurface} backdrop-blur-xl`;
const softInput =
  "h-11 rounded-xl border border-black/[0.08] bg-white/[0.72] px-3.5 text-sm text-default transition-all duration-200 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.10] dark:bg-white/[0.07] dark:focus:bg-white/[0.10] sm:h-12 sm:rounded-2xl sm:px-4";
const softTextarea =
  "rounded-[20px] border border-black/[0.08] bg-white/[0.72] px-3.5 py-3 text-sm text-default transition-all duration-200 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.10] dark:bg-white/[0.07] dark:focus:bg-white/[0.10] sm:rounded-[24px] sm:px-4";
const appleButton =
  "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:px-5 sm:py-2.5";
const sectionEyebrow = "text-[11px] font-semibold uppercase text-muted";
const liquidGlassStyle: React.CSSProperties = {
  backdropFilter: "blur(72px) saturate(240%)",
  WebkitBackdropFilter: "blur(72px) saturate(240%)",
};
const floatingGlassPanelStyle: React.CSSProperties = {
  backgroundColor: "rgba(var(--color-card-rgb),0.58)",
  backgroundImage: "linear-gradient(180deg, rgba(var(--color-card-rgb),0.70), rgba(var(--color-card-rgb),0.38))",
  backdropFilter: "blur(32px) saturate(180%)",
  WebkitBackdropFilter: "blur(32px) saturate(180%)",
  boxShadow: "0 28px 96px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.14), inset 0 0 0 1px var(--color-border-soft)",
};
const quotationCompactDockGlassStyle: React.CSSProperties = {
  backdropFilter: "blur(36px) saturate(210%)",
  WebkitBackdropFilter: "blur(36px) saturate(210%)",
  boxShadow: "0 10px 26px rgba(0,0,0,0.13), inset 0 1px 0 rgba(255,255,255,0.26), inset 0 -1px 0 rgba(255,255,255,0.08)",
};
const quotationExpandedDockGlassStyle: React.CSSProperties = {
  backdropFilter: "blur(40px) saturate(210%)",
  WebkitBackdropFilter: "blur(40px) saturate(210%)",
  boxShadow: "0 22px 64px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.18), inset 0 0 0 1px var(--color-border-soft)",
};
const quotationExpandedDockMaxHeight = "calc(100svh - 58px - env(safe-area-inset-bottom))";
const quotationExpandedDockScrollMaxHeight = "calc(100svh - 122px - env(safe-area-inset-bottom))";
const PREVIEW_DOCUMENT_WIDTH = 860;

function clampPreviewScale(value: number) {
  return Math.min(1.25, Math.max(0.32, Math.round(value * 100) / 100));
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function easeOutCubic(value: number) {
  const progress = clamp01(value);
  return 1 - Math.pow(1 - progress, 3);
}

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

function px(value: number) {
  return `${value.toFixed(2)}px`;
}

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

const messageDividerHtml = `<hr data-message-divider="true" style="border:none;border-top:1px solid #e5e5e7;margin:14px 0;" />`;

function isEmailTemplateVariable(value: string | null): value is EmailTemplateVariable {
  return value === "clientName" || value === "financialYear";
}

function getEmailVariableChipHtml(variable: EmailTemplateVariable, trailingSpace = false) {
  const { label, token } = EMAIL_TEMPLATE_VARIABLES[variable];
  const chip = `<span data-email-variable="${variable}" data-token="${token}" contenteditable="false" style="display:inline-flex;align-items:center;vertical-align:baseline;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:999px;padding:1px 8px;font-size:12px;font-weight:700;line-height:1.6;white-space:nowrap;box-shadow:inset 0 1px 0 rgba(255,255,255,0.85);">${label}</span>`;
  return trailingSpace ? `${chip}&nbsp;` : chip;
}

function getDefaultEmailMessageHtml(q: Pick<Quotation, "clientName" | "financialYear">, rev: Pick<Revision, "revisionNumber">) {
  return escapeHtmlWithLineBreaks(getDefaultEmailMessage(q, rev));
}

function htmlToPlainText(html: string) {
  if (typeof document === "undefined") {
    return html.replace(/<hr[^>]*>/gi, "\n---\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
  }
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.replace(/<hr[^>]*>/gi, "\n---\n");
  wrapper.querySelectorAll("[data-email-variable]").forEach(element => {
    const variable = element.getAttribute("data-email-variable");
    if (isEmailTemplateVariable(variable)) {
      element.replaceWith(document.createTextNode(EMAIL_TEMPLATE_VARIABLES[variable].token));
    }
  });
  return (wrapper.innerText || wrapper.textContent || "").trim();
}

function sanitizeEmailMessageHtml(html: string) {
  if (typeof document === "undefined") return escapeHtml(html);

  const source = document.createElement("div");
  source.innerHTML = html;

  const isBlockElement = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const tag = (node as HTMLElement).tagName.toLowerCase();
    return tag === "div" || tag === "p";
  };

  const cleanNodes = (nodes: Node[]): string => {
    let result = "";
    let previousWasBlock = false;

    nodes.forEach(node => {
      if (isBlockElement(node)) {
        if (result && !result.endsWith("<br/>")) result += "<br/>";
        result += cleanNodes(Array.from(node.childNodes)) || "<br/>";
        previousWasBlock = true;
        return;
      }

      const cleanHtml = cleanNode(node);
      if (!cleanHtml) return;
      if (previousWasBlock && !result.endsWith("<br/>")) result += "<br/>";
      result += cleanHtml;
      previousWasBlock = false;
    });

    return result;
  };

  const cleanNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeHtmlWithLineBreaks(node.textContent || "");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    const children = cleanNodes(Array.from(element.childNodes));

    if (tag === "span") {
      const variable = element.getAttribute("data-email-variable");
      return isEmailTemplateVariable(variable) ? getEmailVariableChipHtml(variable) : children;
    }
    if (tag === "strong" || tag === "b") return children ? `<strong>${children}</strong>` : "";
    if (tag === "br") return "<br/>";
    if (tag === "hr") return messageDividerHtml;

    return children;
  };

  return cleanNodes(Array.from(source.childNodes)).trim();
}

function applyAutoBoldToMessageHtml(html: string, boldValues: string[]) {
  if (typeof document === "undefined") {
    return boldValues.reduce((current, value) => {
      const escapedValue = escapeHtml(value);
      return current.split(escapedValue).join(`<strong>${escapedValue}</strong>`);
    }, html);
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = sanitizeEmailMessageHtml(html);

  const values = boldValues
    .map(value => value.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      const match = values
        .map(value => ({ value, index: text.indexOf(value) }))
        .filter(item => item.index >= 0)
        .sort((a, b) => a.index - b.index || b.value.length - a.value.length)[0];

      if (!match) return;

      const before = text.slice(0, match.index);
      const matchedText = text.slice(match.index, match.index + match.value.length);
      const after = text.slice(match.index + match.value.length);
      const fragment = document.createDocumentFragment();
      if (before) fragment.append(document.createTextNode(before));
      const strong = document.createElement("strong");
      strong.textContent = matchedText;
      fragment.append(strong);
      if (after) fragment.append(document.createTextNode(after));
      node.parentNode?.replaceChild(fragment, node);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    if (element.tagName.toLowerCase() === "strong") return;
    Array.from(element.childNodes).forEach(walk);
  };

  for (let i = 0; i < values.length; i += 1) {
    Array.from(wrapper.childNodes).forEach(walk);
  }

  return wrapper.innerHTML;
}

function resolveEmailMessageVariables(
  html: string,
  q: Pick<Quotation, "clientName" | "financialYear">,
) {
  const values: Record<EmailTemplateVariable, string> = {
    clientName: q.clientName || "",
    financialYear: q.financialYear ? `FY ${q.financialYear}` : "",
  };

  if (typeof document === "undefined") {
    return (Object.keys(values) as EmailTemplateVariable[]).reduce(
      (current, variable) => current.split(EMAIL_TEMPLATE_VARIABLES[variable].token).join(escapeHtml(values[variable])),
      html,
    );
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = sanitizeEmailMessageHtml(html);
  wrapper.querySelectorAll("[data-email-variable]").forEach(element => {
    const variable = element.getAttribute("data-email-variable");
    if (isEmailTemplateVariable(variable)) {
      element.replaceWith(document.createTextNode(values[variable]));
    }
  });

  const replaceTokens = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      let text = node.textContent || "";
      (Object.keys(values) as EmailTemplateVariable[]).forEach(variable => {
        text = text.split(EMAIL_TEMPLATE_VARIABLES[variable].token).join(values[variable]);
      });
      node.textContent = text;
      return;
    }
    Array.from(node.childNodes).forEach(replaceTokens);
  };
  Array.from(wrapper.childNodes).forEach(replaceTokens);
  return wrapper.innerHTML;
}

function prependEmailMessage(
  html: string,
  messageHtmlSource: string,
  q: Pick<Quotation, "clientName" | "financialYear">,
) {
  const boldValues = [
    q.clientName,
    `FY ${q.financialYear}`,
    "Nextgen Solutions",
  ].filter(Boolean);
  const resolvedMessage = resolveEmailMessageVariables(messageHtmlSource, q);
  const formattedMessage = applyAutoBoldToMessageHtml(resolvedMessage, boldValues);
  if (!htmlToPlainText(formattedMessage)) return html;

  const messageHtml = `
    <div style="max-width:760px; margin:0 auto 28px; padding:0 12px 24px; border-bottom:1px solid #e5e5e7; color:#1d1d1f; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size:14px; line-height:1.65;">
      ${formattedMessage}
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
  const [previewZoomMode, setPreviewZoomMode] = useState<"fit" | "custom">("fit");
  const [previewScale, setPreviewScale] = useState(1);
  const [previewFitScale, setPreviewFitScale] = useState(1);
  const [headerOverPreview, setHeaderOverPreview] = useState(false);
  const [isDockExpanded, setIsDockExpanded] = useState(false);
  const [statusDropdown, setStatusDropdown] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [moreMenuAnchor, setMoreMenuAnchor] = useState<"header" | "summary" | null>(null);
  const [moreMenuPosition, setMoreMenuPosition] = useState({ top: 0, left: 0, maxHeight: 520 });
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessageHtml, setEmailMessageHtml] = useState("");
  const [emailMessageTemplates, setEmailMessageTemplates] = useState<EmailMessageTemplate[]>([]);
  const [selectedEmailTemplateId, setSelectedEmailTemplateId] = useState("");
  const [emailTemplateName, setEmailTemplateName] = useState("");
  const [emailTemplateLoading, setEmailTemplateLoading] = useState(false);
  const [emailTemplateDropdownOpen, setEmailTemplateDropdownOpen] = useState(false);
  const [emailTemplateDropdownPosition, setEmailTemplateDropdownPosition] = useState({ top: 0, left: 0, width: 360 });
  const [clientEmailOptions, setClientEmailOptions] = useState<ClientEmailOption[]>([]);
  const [selectedToEmails, setSelectedToEmails] = useState<string[]>([]);
  const [selectedCcEmails, setSelectedCcEmails] = useState<string[]>([]);
  const [markSentPrompt, setMarkSentPrompt] = useState<null | "print" | "email">(null);

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quotationTemplatePromiseRef = useRef<Promise<string> | null>(null);
  const emailPdfPromiseRef = useRef<{ html: string; promise: Promise<string> } | null>(null);
  const emailEditorRef = useRef<HTMLDivElement | null>(null);
  const latestEmailEditorHtmlRef = useRef("");
  const emailTemplateDropdownRef = useRef<HTMLDivElement | null>(null);
  const emailTemplateDropdownButtonRef = useRef<HTMLButtonElement | null>(null);
  const emailTemplateDropdownPanelRef = useRef<HTMLDivElement | null>(null);
  const stickyHeaderRef = useRef<HTMLDivElement | null>(null);
  const previewPanelRef = useRef<HTMLDivElement | null>(null);
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
  const moreMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const isDockExpandedRef = useRef(false);
  const isMounted = useRef(true);
  const isInitialLoad = useRef(true);
  const isSwitchingRevision = useRef(false);
  const dockDragControls = useDragControls();
  const dockPointerStartRef = useRef<{ x: number; y: number; mode: "compact" | "expanded" } | null>(null);
  const dockDragIntentRef = useRef(false);
  const dockSuppressClickUntilRef = useRef(0);

  const startDockGesture = (event: React.PointerEvent<HTMLElement>, mode: "compact" | "expanded") => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dockPointerStartRef.current = { x: event.clientX, y: event.clientY, mode };
    dockDragIntentRef.current = false;
    dockDragControls.start(event);
  };

  const trackDockGesture = (event: React.PointerEvent<HTMLElement>) => {
    const start = dockPointerStartRef.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > 6) {
      dockDragIntentRef.current = true;
    }
  };

  const cancelDockGesture = () => {
    dockPointerStartRef.current = null;
    dockDragIntentRef.current = false;
  };

  const consumeDockClickSuppression = () => {
    const shouldSuppress = dockDragIntentRef.current || Date.now() < dockSuppressClickUntilRef.current;
    dockPointerStartRef.current = null;
    dockDragIntentRef.current = false;
    return shouldSuppress;
  };

  useEffect(() => {
    isDockExpandedRef.current = isDockExpanded;
  }, [isDockExpanded]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  useEffect(() => {
    const scrollArea = document.getElementById("dashboard-scroll-area");
    let frameId = 0;

    const updateHeaderMorph = () => {
      frameId = 0;
      const header = stickyHeaderRef.current;
      if (!header) return;

      const viewportWidth = window.innerWidth;
      const isDesktop = viewportWidth >= 1280;
      const isNativeMobileScroll = viewportWidth < 768;
      const isSmallPhone = viewportWidth < 640;
      const scrollTop = Math.max(0, isNativeMobileScroll ? window.scrollY : (scrollArea?.scrollTop ?? window.scrollY));
      const start = isDesktop ? 12 : 8;
      const end = isDesktop ? 180 : 136;
      const progress = easeOutCubic((scrollTop - start) / (end - start));
      const headerTop = isNativeMobileScroll
        ? 68
        : lerp(16, isDesktop ? 12 : 8, progress);

      header.style.setProperty("--quote-header-progress", progress.toFixed(4));
      header.style.setProperty("--quote-header-top", px(headerTop));
      header.style.setProperty("--quote-header-margin", px(lerp(isDesktop ? 32 : 22, isDesktop ? 24 : 16, progress)));
      header.style.setProperty("--quote-header-radius", px(lerp(isDesktop ? 32 : 28, isDesktop ? 28 : 24, progress)));
      header.style.setProperty("--quote-header-pad-x", px(lerp(isDesktop ? 24 : 16, isDesktop ? 20 : 12, progress)));
      header.style.setProperty("--quote-header-pad-y", px(lerp(isDesktop ? 16 : 14, isDesktop ? 12 : 10, progress)));
      header.style.setProperty("--quote-header-section-gap", px(lerp(20, isDesktop ? 14 : 12, progress)));
      header.style.setProperty("--quote-header-identity-gap", px(lerp(16, isDesktop ? 14 : 12, progress)));
      header.style.setProperty("--quote-header-back-pad", px(lerp(12, 10, progress)));
      header.style.setProperty("--quote-header-back-mt", px(lerp(4, 0, progress)));
      header.style.setProperty("--quote-header-title-size", px(lerp(isDesktop ? 36 : isSmallPhone ? 28 : 32, isDesktop ? 28 : isSmallPhone ? 20 : 23, progress)));
      header.style.setProperty("--quote-header-meta-size", px(lerp(14, 12, progress)));
      header.style.setProperty("--quote-header-meta-top", px(lerp(8, 6, progress)));
      header.style.setProperty("--quote-header-meta-row-gap", px(lerp(8, 6, progress)));
      header.style.setProperty("--quote-header-meta-col-gap", px(isDesktop ? lerp(12, 10, progress) : lerp(12, 0, progress)));
      header.style.setProperty("--quote-header-secondary-opacity", (isDesktop ? lerp(1, 0.9, progress) : clamp01(1 - progress * 1.2)).toFixed(3));
      header.style.setProperty("--quote-header-secondary-width", isDesktop ? "999px" : px(lerp(260, 0, progress)));
      header.style.setProperty("--quote-header-total-size", px(lerp(30, 24, progress)));
      header.style.setProperty("--quote-header-action-pad-x", px(lerp(20, 16, progress)));
      header.style.setProperty("--quote-header-action-pad-y", px(lerp(12, 10, progress)));
      header.style.setProperty("--quote-header-bg-alpha", lerp(0.56, isDesktop ? 0.66 : 0.72, progress).toFixed(3));
      header.style.setProperty("--quote-header-shadow-y", px(lerp(20, isDesktop ? 16 : 14, progress)));
      header.style.setProperty("--quote-header-shadow-blur", px(lerp(60, isDesktop ? 46 : 40, progress)));
      header.style.setProperty("--quote-header-shadow-alpha", lerp(0.08, isDesktop ? 0.16 : 0.18, progress).toFixed(3));
      header.style.setProperty("--quote-header-highlight-alpha", lerp(0.2, 0.32, progress).toFixed(3));

      if (isDesktop && isDockExpandedRef.current) {
        isDockExpandedRef.current = false;
        setIsDockExpanded(false);
      }
    };

    const scheduleHeaderUpdate = () => {
      if (frameId) return;
      frameId = requestAnimationFrame(updateHeaderMorph);
    };

    scheduleHeaderUpdate();
    scrollArea?.addEventListener("scroll", scheduleHeaderUpdate, { passive: true });
    window.addEventListener("scroll", scheduleHeaderUpdate, { passive: true });
    window.addEventListener("resize", scheduleHeaderUpdate);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      scrollArea?.removeEventListener("scroll", scheduleHeaderUpdate);
      window.removeEventListener("scroll", scheduleHeaderUpdate);
      window.removeEventListener("resize", scheduleHeaderUpdate);
    };
  }, []);

  useEffect(() => {
    const editor = emailEditorRef.current;
    if (!editor || document.activeElement === editor) return;
    if (editor.innerHTML !== latestEmailEditorHtmlRef.current) {
      editor.innerHTML = latestEmailEditorHtmlRef.current;
    }
  }, [emailMessageHtml]);

  const setEmailEditorRef = useCallback((node: HTMLDivElement | null) => {
    emailEditorRef.current = node;
    if (!node) return;
    const html = latestEmailEditorHtmlRef.current;
    if (node.innerHTML !== html) {
      node.innerHTML = html;
    }
  }, []);

  const positionEmailTemplateDropdown = useCallback(() => {
    const button = emailTemplateDropdownButtonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const viewportPadding = 12;
    const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
    setEmailTemplateDropdownPosition({
      top: rect.bottom + 8,
      left: Math.min(Math.max(viewportPadding, rect.left), window.innerWidth - width - viewportPadding),
      width,
    });
  }, []);

  useEffect(() => {
    if (!emailTemplateDropdownOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !emailTemplateDropdownRef.current?.contains(target) &&
        !emailTemplateDropdownPanelRef.current?.contains(target)
      ) {
        setEmailTemplateDropdownOpen(false);
      }
    };
    const reposition = () => positionEmailTemplateDropdown();
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [emailTemplateDropdownOpen, positionEmailTemplateDropdown]);

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
    const viewportPadding = 12;
    const isDockSheet = window.innerWidth < 1280;
    const menuWidth = isDockSheet ? Math.min(420, window.innerWidth - viewportPadding * 2) : 288;
    const maxLeft = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding);
    const preferredLeft = rect.right - menuWidth;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const preferredHeight = Math.min(isDockSheet ? 460 : 520, window.innerHeight - viewportPadding * 2);
    if (isDockSheet) {
      setMoreMenuPosition({
        top: Math.max(viewportPadding, window.innerHeight - preferredHeight - viewportPadding - 8),
        left: Math.max(viewportPadding, (window.innerWidth - menuWidth) / 2),
        maxHeight: preferredHeight,
      });
      return;
    }
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

  const updatePreviewFitScale = useCallback(() => {
    const viewport = previewViewportRef.current;
    if (!viewport) return;
    const nextScale = window.innerWidth >= 1280
      ? 1
      : clampPreviewScale(viewport.clientWidth / PREVIEW_DOCUMENT_WIDTH);
    setPreviewFitScale(current => Math.abs(current - nextScale) < 0.01 ? current : nextScale);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (previewIframeRef.current) resizePreview(previewIframeRef.current);
      updatePreviewFitScale();
    };
    let resizeObserver: ResizeObserver | null = null;
    if (previewViewportRef.current && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(previewViewportRef.current);
    }
    requestAnimationFrame(handleResize);
    window.addEventListener("resize", handleResize);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [activeTab, resizePreview, updatePreviewFitScale]);

  useEffect(() => {
    if (activeTab !== "preview") {
      setHeaderOverPreview(false);
      return;
    }

    const scrollArea = document.getElementById("dashboard-scroll-area");
    const header = stickyHeaderRef.current;
    const previewPanel = previewPanelRef.current;
    if (!scrollArea || !header || !previewPanel) return;

    let frameId = 0;
    const updateOverlap = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const headerRect = header.getBoundingClientRect();
        const previewRect = previewPanel.getBoundingClientRect();
        const overlaps = (
          headerRect.bottom > previewRect.top &&
          headerRect.top < previewRect.bottom
        );
        setHeaderOverPreview(current => current === overlaps ? current : overlaps);
      });
    };

    const resizeObserver = new ResizeObserver(updateOverlap);
    resizeObserver.observe(header);
    resizeObserver.observe(previewPanel);
    scrollArea.addEventListener("scroll", updateOverlap, { passive: true });
    window.addEventListener("scroll", updateOverlap, { passive: true });
    window.addEventListener("resize", updateOverlap);
    updateOverlap();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      scrollArea.removeEventListener("scroll", updateOverlap);
      window.removeEventListener("scroll", updateOverlap);
      window.removeEventListener("resize", updateOverlap);
    };
  }, [activeTab, previewHeight]);

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
  const effectivePreviewScale = previewZoomMode === "fit" ? previewFitScale : previewScale;
  const previewZoomPercent = Math.round(effectivePreviewScale * 100);
  const adjustPreviewZoom = (delta: number) => {
    setPreviewZoomMode("custom");
    setPreviewScale(clampPreviewScale(effectivePreviewScale + delta));
  };
  const primaryDockCompactLabel = isEditable
    ? (finalising ? "..." : "Finalise")
    : (emailLoading ? "..." : "Email");

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

  const loadEmailMessageTemplates = async () => {
    try {
      const response = await fetch("/api/email-message-templates", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load saved messages");
      const data = await response.json() as { templates?: EmailMessageTemplate[] };
      setEmailMessageTemplates(Array.isArray(data.templates) ? data.templates : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load saved messages");
    }
  };

  const syncEmailEditorState = () => {
    const editor = emailEditorRef.current;
    if (!editor) return;
    const cleanHtml = sanitizeEmailMessageHtml(editor.innerHTML);
    latestEmailEditorHtmlRef.current = cleanHtml;
    setEmailMessageHtml(cleanHtml);
  };

  const setEmailEditorHtml = useCallback((html: string) => {
    const cleanHtml = sanitizeEmailMessageHtml(html);
    latestEmailEditorHtmlRef.current = cleanHtml;
    setEmailMessageHtml(cleanHtml);
    const editor = emailEditorRef.current;
    if (editor && editor.innerHTML !== cleanHtml) {
      editor.innerHTML = cleanHtml;
    }
  }, []);

  const handleEmailEditorBlur = () => {
    const editor = emailEditorRef.current;
    if (!editor) return;
    const cleanHtml = sanitizeEmailMessageHtml(editor.innerHTML);
    latestEmailEditorHtmlRef.current = cleanHtml;
    setEmailMessageHtml(cleanHtml);
    if (editor.innerHTML !== cleanHtml) {
      editor.innerHTML = cleanHtml;
    }
  };

  const focusEmailEditor = () => {
    emailEditorRef.current?.focus();
  };

  const runEmailEditorCommand = (command: "bold" | "divider" | EmailTemplateVariable) => {
    focusEmailEditor();
    if (command === "bold") {
      document.execCommand("bold");
    } else if (command === "divider") {
      document.execCommand("insertHTML", false, `${messageDividerHtml}<br/>`);
    } else {
      document.execCommand("insertHTML", false, getEmailVariableChipHtml(command, true));
    }
    syncEmailEditorState();
  };

  const selectEmailMessageTemplate = (templateId: string) => {
    setSelectedEmailTemplateId(templateId);
    const template = emailMessageTemplates.find(item => item._id === templateId);
    if (!template) {
      setEmailTemplateName("");
      const currentRevision = quotation?.revisions.find(revision => revision.revisionNumber === quotation.currentRevisionNumber);
      setEmailEditorHtml(quotation && currentRevision ? getDefaultEmailMessageHtml(quotation, currentRevision) : "");
      return;
    }
    setEmailTemplateName(template.name);
    setEmailEditorHtml(template.bodyHtml);
  };

  const saveEmailMessageTemplate = async (mode: "create" | "update") => {
    const cleanHtml = sanitizeEmailMessageHtml(latestEmailEditorHtmlRef.current);
    const bodyText = htmlToPlainText(cleanHtml);
    const selectedTemplate = emailMessageTemplates.find(template => template._id === selectedEmailTemplateId);
    const name = emailTemplateName.trim() || selectedTemplate?.name || "Quotation message";

    if (!bodyText) {
      toast.error("Message body is required");
      return;
    }
    if (mode === "create" && emailMessageTemplates.length >= MAX_EMAIL_MESSAGE_TEMPLATES) {
      toast.error(`You can save up to ${MAX_EMAIL_MESSAGE_TEMPLATES} message templates.`);
      return;
    }
    if (mode === "update" && !selectedTemplate) {
      toast.error("Select a saved message to update");
      return;
    }

    setEmailTemplateLoading(true);
    try {
      const response = await fetch(
        mode === "update" ? `/api/email-message-templates/${selectedTemplate?._id}` : "/api/email-message-templates",
        {
          method: mode === "update" ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, bodyHtml: cleanHtml, bodyText }),
        }
      );
      const data = await response.json().catch(() => null) as { template?: EmailMessageTemplate; error?: string } | null;
      if (!response.ok || !data?.template) {
        throw new Error(data?.error || "Failed to save message");
      }
      setEmailEditorHtml(data.template.bodyHtml);
      setEmailTemplateName(data.template.name);
      setSelectedEmailTemplateId(data.template._id);
      await loadEmailMessageTemplates();
      toast.success(mode === "update" ? "Saved message updated" : "Message saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save message");
    } finally {
      setEmailTemplateLoading(false);
    }
  };

  const deleteEmailMessageTemplate = async () => {
    const selectedTemplate = emailMessageTemplates.find(template => template._id === selectedEmailTemplateId);
    if (!selectedTemplate) {
      toast.error("Select a saved message to delete");
      return;
    }

    setEmailTemplateLoading(true);
    try {
      const response = await fetch(`/api/email-message-templates/${selectedTemplate._id}`, { method: "DELETE" });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "Failed to delete message");
      setSelectedEmailTemplateId("");
      setEmailTemplateName("");
      await loadEmailMessageTemplates();
      toast.success("Saved message deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete message");
    } finally {
      setEmailTemplateLoading(false);
    }
  };

  const loadQuotationTemplate = async () => {
    if (quotationTemplate) return quotationTemplate;
    if (!quotationTemplatePromiseRef.current) {
      quotationTemplatePromiseRef.current = fetch("/api/quotation/template")
        .then(async response => {
          if (!response.ok) throw new Error("Quotation template not found");
          const data = await response.json() as { html: string };
          setQuotationTemplate(data.html);
          return data.html;
        })
        .finally(() => {
          quotationTemplatePromiseRef.current = null;
        });
    }
    return quotationTemplatePromiseRef.current;
  };

  const generateQuotationPdf = (html: string) => {
    if (emailPdfPromiseRef.current?.html === html) {
      return emailPdfPromiseRef.current.promise;
    }

    const promise = fetch("/api/quotation/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html }),
    })
      .then(async response => {
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error || "Failed to generate quotation PDF");
        }
        const data = await response.json() as { contentBase64: string };
        return data.contentBase64;
      })
      .catch(error => {
        if (emailPdfPromiseRef.current?.promise === promise) {
          emailPdfPromiseRef.current = null;
        }
        throw error;
      });

    emailPdfPromiseRef.current = { html, promise };
    return promise;
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
    setSelectedEmailTemplateId("");
    setEmailTemplateName("");
    const currentRevision = quotation.revisions.find(revision => revision.revisionNumber === quotation.currentRevisionNumber);
    setEmailSubject(currentRevision ? getQuotationEmailSubject(quotation, currentRevision) : "");
    setEmailEditorHtml(currentRevision ? getDefaultEmailMessageHtml(quotation, currentRevision) : "");
    setClientEmailOptions([]);
    setEmailModalOpen(true);
    void loadEmailMessageTemplates();

    if (currentRevision) {
      void loadQuotationTemplate()
        .then(template => generateQuotationPdf(buildQuotationHTML(template, quotation, currentRevision)))
        .catch(() => {
          // Submission retries and surfaces the error if preparation fails.
        });
    }

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
      const template = await loadQuotationTemplate();
      const quotationHtml = buildQuotationHTML(template, target.quotation, target.revision);
      const messageHtml = sanitizeEmailMessageHtml(latestEmailEditorHtmlRef.current);
      const html = prependEmailMessage(quotationHtml, messageHtml, target.quotation);
      const subject = emailSubject.trim() || getQuotationEmailSubject(target.quotation, target.revision);
      const filename = `${getQuotationDocumentTitle(target.quotation, target.revision)}.pdf`;
      const contentBase64 = await generateQuotationPdf(quotationHtml);
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
        setEmailEditorHtml("");
        setSelectedEmailTemplateId("");
        setEmailTemplateName("");
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
  const selectedEmailTemplate = emailMessageTemplates.find(template => template._id === selectedEmailTemplateId) ?? null;
  const emailTemplateLimitReached = emailMessageTemplates.length >= MAX_EMAIL_MESSAGE_TEMPLATES;
  const emailTemplateDropdownPanel = (
    <AnimatePresence>
      {emailTemplateDropdownOpen && (
        <motion.div
          ref={emailTemplateDropdownPanelRef}
          initial={{ opacity: 0, y: -8, scale: 0.96, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -6, scale: 0.97, filter: "blur(6px)" }}
          transition={{ type: "spring", stiffness: 430, damping: 34, mass: 0.75 }}
          className="fixed isolate z-[100] overflow-hidden rounded-[24px] border border-white/70 bg-white/[0.12] p-1.5 shadow-[0_24px_70px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.78)] dark:border-white/[0.12] dark:bg-[#1c1c1e]/[0.82] dark:shadow-[0_28px_80px_rgba(0,0,0,0.64),inset_0_1px_0_rgba(255,255,255,0.08)]"
          style={{
            top: emailTemplateDropdownPosition.top,
            left: emailTemplateDropdownPosition.left,
            width: emailTemplateDropdownPosition.width,
            backdropFilter: "blur(32px) saturate(180%)",
            WebkitBackdropFilter: "blur(32px) saturate(180%)",
          }}
        >
          <div className="pointer-events-none absolute inset-0 z-0 bg-white/20 dark:bg-white/[0.04]" />
          <div className="pointer-events-none absolute inset-x-5 top-0 z-10 h-px bg-white/90" />
          {[
            { _id: "", name: "Default / unsaved message", bodyHtml: "", bodyText: "" },
            ...emailMessageTemplates,
          ].map(template => {
            const active = selectedEmailTemplateId === template._id;
            return (
              <button
                key={template._id || "default-template"}
                type="button"
                onClick={() => {
                  selectEmailMessageTemplate(template._id);
                  setEmailTemplateDropdownOpen(false);
                }}
                className={`group/item relative z-10 flex min-h-11 w-full items-center gap-3 rounded-[18px] px-3.5 py-2.5 text-left text-sm font-semibold transition-all duration-200 active:scale-[0.99] ${
                  active
                    ? "bg-brand-600 text-white shadow-[0_10px_26px_rgba(37,99,235,0.28)]"
                    : "bg-white/10 text-default hover:bg-white/[0.45] hover:shadow-sm dark:bg-white/[0.05] dark:hover:bg-white/[0.10]"
                }`}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition duration-200 ${active ? "bg-white/[0.18] text-white" : "bg-white/[0.45] text-faint group-hover/item:text-muted dark:bg-white/[0.10]"}`}>
                  {active && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{template.name}</span>
              </button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (loading) {
    return (
      <div
        className="min-h-screen space-y-5 pb-24 sm:space-y-8 sm:pb-28"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif' }}
      >
        <div className="sticky top-[68px] z-40 rounded-[28px] border border-white/50 bg-white/[0.56] px-4 py-4 shadow-[0_20px_60px_rgba(0,0,0,0.08)] backdrop-blur-2xl sm:rounded-[32px] sm:px-5 sm:py-5 md:top-4 dark:border-white/[0.10] dark:bg-[#1c1c1e]/[0.58] dark:shadow-[0_22px_72px_rgba(0,0,0,0.56)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="h-11 w-11 animate-pulse rounded-full bg-black/[0.08] dark:bg-white/[0.08]" />
              <div className="space-y-3">
                <div className="h-8 w-52 animate-pulse rounded-full bg-black/[0.08] dark:bg-white/[0.08]" />
                <div className="h-4 w-72 max-w-[70vw] animate-pulse rounded-full bg-black/[0.08] dark:bg-white/[0.08]" />
              </div>
            </div>
            <div className="space-y-3 lg:text-right">
              <div className="h-3 w-24 animate-pulse rounded-full bg-black/[0.08] dark:bg-white/[0.08] lg:ml-auto" />
              <div className="h-8 w-40 animate-pulse rounded-full bg-black/[0.08] dark:bg-white/[0.08]" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:gap-8 xl:grid-cols-[minmax(0,7fr)_minmax(340px,3fr)]">
          <div className="space-y-6">
            {[0, 1, 2].map(i => (
              <div key={i} className={`${surfaceCard} p-4 sm:p-8`}>
                <div className="mb-6 h-5 w-44 animate-pulse rounded-full bg-black/[0.08] dark:bg-white/[0.08]" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="h-12 animate-pulse rounded-2xl bg-black/[0.08] dark:bg-white/[0.08]" />
                  <div className="h-12 animate-pulse rounded-2xl bg-black/[0.08] dark:bg-white/[0.08]" />
                  <div className="h-24 animate-pulse rounded-[24px] bg-black/[0.08] dark:bg-white/[0.08] sm:col-span-2" />
                </div>
              </div>
            ))}
          </div>
          <div className={`${surfaceCard} h-96 p-6`}>
            <div className="h-4 w-28 animate-pulse rounded-full bg-black/[0.08] dark:bg-white/[0.08]" />
            <div className="mt-6 h-12 w-48 animate-pulse rounded-full bg-black/[0.08] dark:bg-white/[0.08]" />
            <div className="mt-8 space-y-4">
              <div className="h-4 animate-pulse rounded-full bg-black/[0.08] dark:bg-white/[0.08]" />
              <div className="h-4 animate-pulse rounded-full bg-black/[0.08] dark:bg-white/[0.08]" />
              <div className="h-12 animate-pulse rounded-full bg-black/[0.08] dark:bg-white/[0.08]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!quotation) return null;

  const summaryBreakdownRows = [
    { label: "EPR Credits", value: liveItemsSubtotal },
    { label: "GST on Credits", value: liveItemsGst },
    ...(liveCC > 0 ? [{ label: "Consultation", value: liveCC }] : []),
    ...(liveCCGst > 0 ? [{ label: "GST on Consultation", value: liveCCGst }] : []),
    ...(liveGF > 0 ? [{ label: "Government Fees", value: liveGF }] : []),
  ];
  const summaryMetaRows = [
    { label: "Current Revision", value: `Rev ${quotation.currentRevisionNumber}`, mono: true },
    ...(quotation.validTill ? [{ label: "Valid Till", value: fmtDate(quotation.validTill), mono: false }] : []),
    ...(quotation.sentAt ? [{ label: "Sent", value: fmtDate(quotation.sentAt), mono: false }] : []),
  ];
  const hasPrimaryDockAction = isEditable || canCreateEmailDraft;
  const primaryDockActionDisabled = isEditable ? finalising : emailLoading;
  const handlePrimaryDockAction = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (primaryDockActionDisabled) return;
    if (isEditable) {
      handleFinalize();
      return;
    }
    openEmailDraftModal();
  };
  const renderSummaryIdentity = () => (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="font-mono text-xs text-faint">{quotation.quotationNumber || "DRAFT"}{quotation.quotationNumber ? ` - Rev ${quotation.currentRevisionNumber}` : ""}</p>
        <p className="mt-2 truncate text-lg font-semibold leading-snug text-default">{quotation.clientName}</p>
        <p className="mt-1 text-sm text-muted">FY {quotation.financialYear}</p>
      </div>
      <QuotationStatusPill status={quotation.status} />
    </div>
  );
  const renderSummaryTotal = (compact = false) => (
    <div className={`${compact ? "my-4 rounded-[24px] p-4" : "my-6 rounded-[28px] p-5"} ${quoteSubtleSurface}`}>
      <p className="text-xs font-semibold uppercase text-muted">Grand Total</p>
      <p className={`mt-2 font-mono font-semibold leading-none tabular-nums text-default ${compact ? "text-3xl sm:text-4xl" : "text-4xl"}`}>{money(liveGrand)}</p>
    </div>
  );
  const renderQuotationSummaryActions = (variant: "sidebar" | "dock") => {
    const isDock = variant === "dock";
    return (
      <div className={`${isDock ? "mt-4" : "mt-6"} grid gap-2 ${isDock ? "sm:grid-cols-2" : ""}`}>
        {isEditable ? (
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); handleFinalize(); }}
            disabled={finalising}
            className={`btn-primary w-full justify-center gap-2 rounded-full shadow-sm shadow-brand-600/[0.15] transition duration-200 active:scale-[0.98] ${isDock ? "py-2.5" : "py-3"}`}
          >
            <Sparkles className="h-4 w-4" />
            {finalising ? "Finalising..." : "Finalise Quote"}
          </button>
        ) : canCreateEmailDraft ? (
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); openEmailDraftModal(); }}
            disabled={emailLoading}
            className={`btn-primary w-full justify-center gap-2 rounded-full shadow-sm shadow-brand-600/[0.15] transition duration-200 active:scale-[0.98] ${isDock ? "py-2.5" : "py-3"}`}
          >
            <Mail className="h-4 w-4" />
            {emailLoading ? "Creating..." : "Email Draft"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openMoreMenu(event, "summary");
          }}
          className={`btn-secondary w-full justify-center gap-2 rounded-full bg-white/90 text-sm transition duration-200 active:scale-[0.98] dark:bg-white/[0.06] dark:hover:bg-white/[0.10] ${isDock ? "py-2.5" : "py-3"} ${isDock && !hasPrimaryDockAction ? "sm:col-span-2" : ""}`}
        >
          <MoreHorizontal className="h-4 w-4" /> More
        </button>
      </div>
    );
  };
  const renderQuotationSummaryDetails = (variant: "sidebar" | "dock") => {
    const isDock = variant === "dock";
    const rowClass = isDock
      ? `flex items-center justify-between gap-4 rounded-[18px] px-3 py-2.5 ${quoteNestedSurface}`
      : "flex items-center justify-between gap-4";
    const rowsClass = isDock ? "grid gap-2.5 text-sm sm:grid-cols-2" : "space-y-3 text-sm";

    return (
      <>
        <div className={rowsClass}>
          {summaryBreakdownRows.map(({ label, value }) => (
            <div key={label} className={rowClass}>
              <span className="text-muted">{label}</span>
              <span className="font-mono font-medium tabular-nums text-default">{money(value)}</span>
            </div>
          ))}
        </div>

        <div className={`${isDock ? "my-4" : "my-6"} h-px bg-base`} />

        <div className={rowsClass}>
          {summaryMetaRows.map(({ label, value, mono }) => (
            <div key={label} className={rowClass}>
              <span className="text-muted">{label}</span>
              <span className={`text-default ${mono ? "font-mono font-medium" : ""}`}>{value}</span>
            </div>
          ))}
        </div>

        {isDock && !isEditable && !canCreateEmailDraft && emailDraftUnavailableMessage && (
          <div className={`mt-5 rounded-2xl px-4 py-3 text-sm leading-relaxed text-muted ${quoteSubtleSurface}`}>
            {emailDraftUnavailableMessage}
          </div>
        )}

        {renderQuotationSummaryActions(variant)}
      </>
    );
  };

  const menuItemClass = "relative z-10 flex w-full items-center gap-3 rounded-2xl bg-white/[0.12] px-3.5 py-3 text-left text-sm text-default transition hover:bg-white/70 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-transparent dark:hover:bg-white/[0.08]";
  const moreMenu = (
    <div
      className="fixed isolate z-50 w-[min(420px,calc(100vw-24px))] origin-top-right overflow-y-auto rounded-[24px] border border-white/[0.65] p-2 shadow-[0_26px_90px_rgba(0,0,0,0.22)] transition-all duration-200 dark:border-white/10 xl:w-72 xl:max-w-[calc(100vw-24px)]"
      onClick={(event) => event.stopPropagation()}
      style={{
        top: moreMenuPosition.top,
        left: moreMenuPosition.left,
        maxHeight: moreMenuPosition.maxHeight,
        ...floatingGlassPanelStyle,
      }}
    >
      <div className="pointer-events-none absolute inset-0 z-0 bg-[#eef1f6]/[0.15] dark:bg-black/10" />
      <div className="pointer-events-none absolute inset-x-4 top-0 z-0 h-px bg-white/70 dark:bg-white/[0.12]" />
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
        <div className="relative z-10 mt-1 border-t border-black/10 pt-2 dark:border-white/10">
          <p className="px-3.5 pb-1 pt-2 text-[11px] font-semibold uppercase text-muted">Change Status</p>
          {allowedResponseStatuses.map(s => {
            const cfg = QUOTATION_STATUS_CONFIG[s];
            return (
              <button
                key={s}
                onClick={() => updateStatus(s)}
                className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.12] px-3.5 py-2.5 text-left text-sm text-default transition hover:bg-white/70 active:scale-[0.98] dark:bg-transparent dark:hover:bg-white/[0.08]"
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
        className="relative z-10 mt-1 flex w-full cursor-not-allowed items-center gap-3 rounded-2xl bg-white/10 px-3.5 py-3 text-left text-sm text-faint opacity-50 dark:bg-transparent"
      >
        <AlertTriangle className="h-4 w-4" />
        <span>
          <span className="block">Archive</span>
          <span className="mt-0.5 block text-xs">Archive workflow is not available yet.</span>
        </span>
      </button>
    </div>
  );

  const quoteHeaderStyle = {
    top: "var(--quote-header-top, 16px)",
    marginBottom: "var(--quote-header-margin, 32px)",
    borderRadius: "var(--quote-header-radius, 32px)",
    padding: "var(--quote-header-pad-y, 16px) var(--quote-header-pad-x, 20px)",
    backgroundColor: "rgba(var(--color-card-rgb), var(--quote-header-bg-alpha, 0.56))",
    backgroundImage: "linear-gradient(180deg, rgba(255,255,255,var(--quote-header-highlight-alpha, 0.20)), rgba(255,255,255,0))",
    boxShadow: headerOverPreview
      ? "0 var(--quote-header-shadow-y, 20px) calc(var(--quote-header-shadow-blur, 60px) + 16px) rgba(0,0,0,var(--quote-header-shadow-alpha, 0.08)), inset 0 1px 0 rgba(255,255,255,var(--quote-header-highlight-alpha, 0.20))"
      : "0 var(--quote-header-shadow-y, 20px) var(--quote-header-shadow-blur, 60px) rgba(0,0,0,var(--quote-header-shadow-alpha, 0.08)), inset 0 1px 0 rgba(255,255,255,var(--quote-header-highlight-alpha, 0.20))",
    willChange: "top, margin-bottom, border-radius, padding, background-color, box-shadow",
  } as React.CSSProperties;
  const quoteHeaderSecondaryStyle = {
    maxWidth: "var(--quote-header-secondary-width, 260px)",
    opacity: "var(--quote-header-secondary-opacity, 1)",
  } as React.CSSProperties;
  const quoteHeaderActionStyle = {
    padding: "var(--quote-header-action-pad-y, 12px) var(--quote-header-action-pad-x, 20px)",
  } as React.CSSProperties;

  return (
    <div
      className="min-h-screen pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:pb-[calc(7rem+env(safe-area-inset-bottom))] xl:pb-28"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif' }}
    >
      {/* ─── TOP BAR ─── */}
      <div
        ref={stickyHeaderRef}
        className={`sticky z-20 border backdrop-blur-2xl dark:!bg-none xl:z-40 ${
          headerOverPreview
            ? "border-white/75 dark:border-white/[0.16]"
            : "border-white/50 dark:border-white/[0.10]"
        }`}
        style={quoteHeaderStyle}
      >
        <div
          className="flex flex-col xl:flex-row xl:items-center xl:justify-between"
          style={{ gap: "var(--quote-header-section-gap, 20px)" }}
        >
          <div className="flex min-w-0 items-start" style={{ gap: "var(--quote-header-identity-gap, 16px)" }}>
            <button
              onClick={() => router.push("/dashboard/quotations")}
              className={`shrink-0 rounded-full text-muted transition duration-200 hover:-translate-y-0.5 hover:text-default hover:shadow-sm active:scale-[0.98] ${quoteControlSurface}`}
              title="Back to quotations"
              style={{ marginTop: "var(--quote-header-back-mt, 4px)", padding: "var(--quote-header-back-pad, 12px)" }}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1
                className="min-w-0 truncate font-semibold leading-tight text-default"
                style={{ fontSize: "var(--quote-header-title-size, clamp(30px, 7.8vw, 36px))" }}
              >
                {quotation.quotationNumber ? (
                  <span>{quotation.quotationNumber}</span>
                ) : (
                  <span className="text-muted">Untitled Draft</span>
                )}
              </h1>
              <div
                className="flex flex-wrap items-center text-muted"
                style={{
                  columnGap: "var(--quote-header-meta-col-gap, 12px)",
                  rowGap: "var(--quote-header-meta-row-gap, 8px)",
                  fontSize: "var(--quote-header-meta-size, 14px)",
                  marginTop: "var(--quote-header-meta-top, 8px)",
                }}
              >
                <span
                  className="inline-block overflow-hidden truncate whitespace-nowrap align-bottom font-medium text-default"
                  style={quoteHeaderSecondaryStyle}
                >
                  {quotation.clientName}
                </span>
                <QuotationStatusPill status={quotation.status} />
                <span
                  className="inline-block overflow-hidden whitespace-nowrap align-bottom text-faint"
                  style={quoteHeaderSecondaryStyle}
                >
                  FY {quotation.financialYear}
                </span>
                {quotation.validTill && (
                  <span
                    className="inline-block overflow-hidden whitespace-nowrap align-bottom text-faint"
                    style={quoteHeaderSecondaryStyle}
                  >
                    Valid till {fmtDate(quotation.validTill)}
                  </span>
                )}
                {savedStatus === "saving" && <span className="animate-pulse text-xs text-muted">Saving...</span>}
                {savedStatus === "saved" && <span className="flex items-center gap-1 text-xs text-emerald-500"><CheckCircle2 className="h-3 w-3" />Saved</span>}
              </div>
            </div>
          </div>

          <div
            className="hidden flex-col xl:flex xl:flex-row xl:items-center xl:justify-end"
            style={{ gap: "var(--quote-header-identity-gap, 16px)" }}
          >
            <div className="sm:text-right">
              <p className="text-xs font-semibold uppercase text-muted">Grand Total</p>
              <p className="mt-1 font-semibold leading-none text-default" style={{ fontSize: "var(--quote-header-total-size, 30px)" }}>{money(liveGrand)}</p>
            </div>
            <div className="flex items-center gap-2">
              {isEditable && (
                <button
                  onClick={handleFinalize}
                  disabled={finalising}
                  className="btn-primary gap-2 rounded-full text-sm shadow-sm shadow-brand-600/[0.15] transition duration-200 active:scale-[0.98]"
                  style={quoteHeaderActionStyle}
                >
                  <Sparkles className="h-4 w-4" />
                  {finalising ? "Finalising..." : "Finalise Quote"}
                </button>
              )}
              {!isEditable && canCreateEmailDraft && (
                <button
                  onClick={openEmailDraftModal}
                  disabled={emailLoading}
                  className="btn-primary gap-2 rounded-full text-sm shadow-sm shadow-brand-600/[0.15] transition duration-200 active:scale-[0.98]"
                  style={quoteHeaderActionStyle}
                >
                  <Mail className="h-4 w-4" />
                  {emailLoading ? "Creating..." : "Email Draft"}
                </button>
              )}
              {!isEditable && !canCreateEmailDraft && (
                <div className={`hidden rounded-full px-4 py-2 text-sm text-muted sm:block ${quoteControlSurface}`}>
                  {QUOTATION_STATUS_CONFIG[quotation.status].label}
                </div>
              )}
              <div className="relative">
                <button
                  onClick={(e) => openMoreMenu(e, "header")}
                  className={`inline-flex items-center gap-2 rounded-full text-muted transition duration-200 hover:-translate-y-0.5 hover:text-default hover:shadow-sm active:scale-[0.98] ${quoteControlSurface}`}
                  title="More actions"
                  style={quoteHeaderActionStyle}
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
        <div className={`scrollbar-none mb-4 flex max-w-full items-center gap-1.5 overflow-x-auto rounded-[22px] p-1.5 shadow-sm backdrop-blur-xl sm:mb-6 sm:gap-2 sm:rounded-[28px] sm:p-2 ${quoteSubtleSurface}`}>
          {quotation.revisions.map(rev => (
            <button
              key={rev.revisionNumber}
              onClick={() => setSelectedRevNum(rev.revisionNumber)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-all duration-200 whitespace-nowrap active:scale-[0.98] sm:gap-3 sm:px-4 sm:py-2.5 sm:text-sm ${
                selectedRevNum === rev.revisionNumber
                  ? quoteActiveSurface
                  : "border-transparent text-muted hover:bg-white/70 hover:text-default dark:hover:bg-white/[0.08]"
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
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-black/[0.12] px-3 py-2 text-xs text-muted transition-all duration-200 hover:bg-white/70 hover:text-default active:scale-[0.98] dark:border-white/[0.16] dark:hover:bg-white/[0.08] sm:px-4 sm:py-2.5"
            >
              <Plus className="w-3 h-3" /> New Revision
            </button>
          )}
        </div>
      )}

      {/* ─── DIFF BANNER ─── */}
      {diffChanges.length > 0 && selectedRevNum !== null && selectedRevNum > 0 && (
        <div className={`mb-4 rounded-[24px] p-4 shadow-sm backdrop-blur-xl sm:mb-6 sm:rounded-[28px] sm:p-5 ${quoteCardSurface}`}>
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
              <div key={i} className={`rounded-2xl p-3.5 text-sm ${quoteSubtleSurface}`}>
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
      <div className={`mb-5 grid w-full grid-cols-3 gap-1 rounded-full p-1 shadow-sm sm:scrollbar-none sm:mb-8 sm:flex sm:w-fit sm:max-w-full sm:overflow-x-auto sm:p-1.5 ${quoteSubtleSurface}`}>
        {[
          { key: "editor", label: isEditable ? "Editor" : "Details", icon: FileText },
          { key: "preview", label: "Preview", icon: Eye },
          { key: "timeline", label: "Activity", icon: Activity },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as "editor" | "preview" | "timeline")}
            className={`flex min-w-0 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-all duration-200 active:scale-[0.98] sm:gap-2 sm:px-5 sm:py-2.5 sm:text-sm ${
              activeTab === key ? quoteActiveSurface : "text-muted hover:bg-white/70 hover:text-default dark:hover:bg-white/[0.08]"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ─── EDITOR TAB ─── */}
      {activeTab === "editor" && (
        <div className="grid grid-cols-1 gap-5 sm:gap-8 xl:grid-cols-[minmax(0,7fr)_minmax(340px,3fr)]">
          {/* LEFT — FORM */}
          <div className="order-1 space-y-5 sm:space-y-8">
            {!isEditable && selectedRevNum !== quotation.currentRevisionNumber && (
              <div className={`flex items-center gap-3 rounded-2xl p-4 ${quoteSubtleSurface}`}>
                <EyeOff className="w-4 h-4 text-muted shrink-0" />
                <p className="text-sm text-muted">
                  Viewing Rev {selectedRevNum} (read-only). The current revision is Rev {quotation.currentRevisionNumber}.
                </p>
              </div>
            )}

            {!isEditable && (
              <>
                <div className={`${surfaceCard} p-4 sm:p-8`}>
                  <div className="mb-4 sm:mb-6">
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

                <div className={`${surfaceCard} p-4 sm:p-6`}>
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <h3 className="flex items-center gap-2 text-base font-semibold text-default"><IndianRupee className="h-4 w-4 text-muted" />Line Items</h3>
                    <p className="text-xs text-muted">{items.length} {items.length === 1 ? "item" : "items"}</p>
                  </div>
                  {items.length > 0 ? (
                    <div className="space-y-4">
                      {items.map((item, idx) => {
                        const { gstAmt, total } = calcItem(item);
                        return (
                          <article key={item._id} className={`rounded-[20px] p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_18px_48px_rgba(0,0,0,0.06)] dark:hover:bg-white/[0.08] dark:hover:shadow-[0_18px_52px_rgba(0,0,0,0.42)] sm:rounded-[24px] sm:p-6 ${quoteSubtleSurface}`}>
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
                                <div key={label} className={`rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 ${quoteNestedSurface}`}>
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
                    <div className="rounded-[24px] border border-dashed border-black/[0.12] bg-[#f5f5f7]/80 p-8 text-center text-sm text-muted dark:border-white/[0.16] dark:bg-white/[0.06]">No line items in this revision.</div>
                  )}
                </div>

                <div className={`${surfaceCard} p-4 sm:p-8`}>
                  <div className="mb-4 flex items-center gap-2 sm:mb-6">
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
                      <div key={label} className={`rounded-[20px] p-4 sm:rounded-[24px] sm:p-5 ${quoteSubtleSurface}`}>
                        <p className={sectionEyebrow}>{label}</p>
                        <p className={`mt-2 font-mono font-semibold tabular-nums text-default ${emphasis ? "text-2xl" : "text-lg"}`}>{value}</p>
                        {helper && <p className="mt-2 text-xs text-muted">{helper}</p>}
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`${surfaceCard} p-4 sm:p-8`}>
                  <h3 className="text-xl font-semibold text-default">Notes / Terms</h3>
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-default">{notes || "No notes or special terms."}</p>
                </div>
              </>
            )}

            {isEditable && (
              <>
                <div className={`${surfaceCard} p-4 sm:p-8`}>
                  <div className="mb-4 sm:mb-6">
                    <h3 className="flex items-center gap-2 text-xl font-semibold text-default"><Building2 className="h-5 w-5 text-muted" />Client details</h3>
                    <p className="mt-1 text-sm text-muted">Who this quotation is prepared for.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="relative sm:col-span-2">
                      <label className="label">Client Name *</label>
                      <input className={`${softInput} w-full`} value={clientName} onChange={e => { setClientName(e.target.value); setShowSuggestions(true); if (!e.target.value) { setClientId(""); setClientAddress(""); setClientGst(""); setClientState(""); } }} onFocus={() => setShowSuggestions(true)} disabled={!isEditable} placeholder="Company name" />
                      {showSuggestions && clientSuggestions.length > 0 && (
                        <div
                          onClick={e => e.stopPropagation()}
                          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 isolate overflow-y-auto rounded-[24px] border border-white/75 bg-white/[0.32] p-2 shadow-[0_22px_70px_rgba(0,0,0,0.16)] dark:border-white/[0.12] dark:bg-[#1c1c1e]/80 dark:shadow-[0_26px_80px_rgba(0,0,0,0.58)]"
                          style={liquidGlassStyle}
                        >
                          <div className="pointer-events-none absolute inset-0 z-0 bg-white/30 dark:bg-white/[0.04]" style={liquidGlassStyle} />
                          <div className="pointer-events-none absolute inset-x-4 top-0 z-0 h-px bg-white/90" />
                          {clientSuggestions.map(client => (
                            <button key={client.clientId} type="button" onClick={() => { setClientName(client.companyName); setClientId(client.clientId); setClientAddress(client.address || ""); setClientGst(client.gstNumber || ""); setClientState(client.state || ""); setShowSuggestions(false); }} className="relative z-10 w-full rounded-[20px] bg-white/[0.12] px-4 py-3 text-left text-sm text-default transition duration-200 hover:bg-white/70 active:scale-[0.98] dark:bg-white/[0.05] dark:hover:bg-white/[0.10]">
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

                <div className={`${surfaceCard} p-4 sm:p-6`}>
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <h3 className="flex items-center gap-2 text-base font-semibold text-default"><IndianRupee className="h-4 w-4 text-muted" />Line Items</h3>
                    <button onClick={() => setItems(prev => [...prev, newItem()])} className="glass-btn glass-btn-primary shrink-0 rounded-full px-3 py-2 transition duration-200 active:scale-[0.98] sm:px-4"><Plus className="h-3.5 w-3.5" /> Add Item</button>
                  </div>
                  <div className="space-y-4">
                    {items.map((item, idx) => {
                      const { gstAmt, total } = calcItem(item);
                      return (
                        <article key={item._id} className={`rounded-[20px] p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_18px_48px_rgba(0,0,0,0.06)] dark:hover:bg-white/[0.08] dark:hover:shadow-[0_18px_52px_rgba(0,0,0,0.42)] sm:rounded-[24px] sm:p-6 ${quoteSubtleSurface}`}>
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="mb-2 flex items-center justify-between gap-3"><label className={sectionEyebrow}>Product / Service</label><span className="text-xs text-faint">Item {idx + 1}</span></div>
                              <input list={`services-list-${item._id}`} className={`${softInput} w-full`} value={item.description} onChange={e => { const val = e.target.value; updateItem(idx, "description", val); const matched = STANDARD_SERVICES.find(s => s.description === val); if (matched) { updateItem(idx, "category", matched.category); updateItem(idx, "type", matched.type); } }} disabled={!isEditable} />
                              <datalist id={`services-list-${item._id}`}>{STANDARD_SERVICES.map(s => <option key={s.label} value={s.description}>{s.category} - {s.type}</option>)}</datalist>
                              <div className="scrollbar-none mt-3 flex gap-1.5 overflow-x-auto pb-1">{STANDARD_SERVICES.slice(0, 4).map(service => <button key={service.label} type="button" onClick={() => { updateItem(idx, "description", service.description); updateItem(idx, "category", service.category); updateItem(idx, "type", service.type); }} disabled={!isEditable} className="shrink-0 rounded-full border border-transparent bg-white/60 px-2.5 py-1 text-[11px] font-medium text-faint transition duration-200 hover:-translate-y-0.5 hover:border-black/[0.08] hover:bg-[#f5f5f7] hover:text-muted active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/[0.06] dark:hover:border-white/[0.12] dark:hover:bg-white/[0.10]">{service.category} {service.type}</button>)}</div>
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

                <div className={`${surfaceCard} p-4 sm:p-8`}>
                  <div className="mb-4 sm:mb-6"><h3 className="flex items-center gap-2 text-xl font-semibold text-default"><Receipt className="h-5 w-5 text-muted" />Additional charges</h3><p className="mt-1 text-sm text-muted">Consultation, tax, and statutory fees.</p></div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div><label className="label">Consultation Charges</label><input type="number" min="0" step="0.01" className={`${softInput} w-full font-mono tabular-nums`} value={consultationCharges} onChange={e => setConsultationCharges(e.target.value)} disabled={!isEditable} /></div>
                    <div><label className="label">Consultation GST %</label><select className={`${softInput} w-full`} value={consultationGstPercent} onChange={e => setConsultationGstPercent(e.target.value)} disabled={!isEditable}>{GST_OPTIONS.map(g => <option key={g} value={g}>{g}%</option>)}</select></div>
                    <div><label className="label">Government Fees</label><input type="number" min="0" step="0.01" className={`${softInput} w-full font-mono tabular-nums`} value={governmentFees} onChange={e => setGovernmentFees(e.target.value)} disabled={!isEditable} /><p className="mt-2 text-xs text-faint">CPCB / SPCB / portal charges.</p></div>
                  </div>
                </div>

                <div className={`${surfaceCard} p-4 sm:p-8`}>
                  <div className="mb-5"><h3 className="text-xl font-semibold text-default">Notes / Terms</h3><p className="mt-1 text-sm text-muted">Payment terms, validity, or client-facing conditions.</p></div>
                  <textarea className={`${softTextarea} min-h-36 w-full resize-y`} rows={5} value={notes} onChange={e => setNotes(e.target.value)} disabled={!isEditable} placeholder="Payment terms, validity, special conditions..." />
                </div>
              </>
            )}
          </div>

          {/* RIGHT — STATUS + QUICK SUMMARY */}
          <div className="hidden xl:order-2 xl:block">
            <div className="xl:sticky xl:top-32">
              {/* Summary card */}
              <div className={`rounded-[32px] p-6 backdrop-blur-xl ${quoteCardSurface}`}>
                {renderSummaryIdentity()}
                {renderSummaryTotal()}
                {renderQuotationSummaryDetails("sidebar")}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── PREVIEW TAB ─── */}
      {activeTab === "preview" && (
        <div ref={previewPanelRef} className="rounded-[24px] border border-black/[0.08] bg-[#f5f5f7] p-3 shadow-sm sm:rounded-[32px] sm:p-8 dark:border-white/[0.10] dark:bg-[#050506] dark:shadow-[0_26px_80px_rgba(0,0,0,0.58)]">
          <div className={`mb-4 flex flex-col gap-3 rounded-[24px] p-3 shadow-sm backdrop-blur-xl sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:rounded-[28px] sm:p-4 ${quoteCardSurface}`}>
            <div>
              <p className="font-mono text-xs text-faint">{quotation.quotationNumber || "DRAFT"} - Rev {selectedRevNum ?? quotation.currentRevisionNumber}</p>
              <h3 className="mt-1 text-lg font-semibold text-default">Quotation Preview</h3>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
              <div className={`col-span-2 flex w-full items-center justify-between gap-1 rounded-full p-1 sm:col-span-1 sm:w-auto ${quoteControlSurface}`}>
                <button
                  type="button"
                  onClick={() => setPreviewZoomMode("fit")}
                  className={`h-8 rounded-full px-3 text-xs font-semibold transition duration-200 active:scale-[0.98] ${previewZoomMode === "fit" ? "bg-brand-600 text-white shadow-sm shadow-brand-600/20" : "text-muted hover:bg-white/70 hover:text-default dark:hover:bg-white/[0.10]"}`}
                >
                  Fit
                </button>
                <button
                  type="button"
                  onClick={() => adjustPreviewZoom(-0.1)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition duration-200 hover:bg-white/70 hover:text-default active:scale-[0.98] dark:hover:bg-white/[0.10]"
                  aria-label="Zoom out preview"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-10 text-center font-mono text-xs font-semibold tabular-nums text-default sm:min-w-12">{previewZoomPercent}%</span>
                <button
                  type="button"
                  onClick={() => adjustPreviewZoom(0.1)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition duration-200 hover:bg-white/70 hover:text-default active:scale-[0.98] dark:hover:bg-white/[0.10]"
                  aria-label="Zoom in preview"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => { setPreviewZoomMode("custom"); setPreviewScale(1); }}
                  className={`h-8 rounded-full px-3 text-xs font-semibold transition duration-200 active:scale-[0.98] ${previewZoomMode === "custom" && Math.abs(previewScale - 1) < 0.01 ? "bg-brand-600 text-white shadow-sm shadow-brand-600/20" : "text-muted hover:bg-white/70 hover:text-default dark:hover:bg-white/[0.10]"}`}
                >
                  100%
                </button>
              </div>
              <button onClick={handlePrintPreview} disabled={pdfLoading} className={`${appleButton} ${canCreateEmailDraft ? "" : "col-span-2"} w-full border border-base bg-card text-default hover:bg-surface sm:w-auto`}>
                <Printer className="mr-2 h-4 w-4" />{pdfLoading ? "Opening..." : "Print"}
              </button>
              {canCreateEmailDraft && (
                <button onClick={openEmailDraftModal} disabled={emailLoading} className={`${appleButton} w-full border border-base bg-card text-default hover:bg-surface sm:w-auto`}>
                  <Mail className="mr-2 h-4 w-4" />Email Draft
                </button>
                  )}
                </div>
              </div>
          {previewTemplateLoading && (
            <div className="mx-auto max-w-[860px] rounded-[24px] border border-black/[0.10] bg-white p-5 text-slate-500 shadow-[0_30px_90px_rgba(0,0,0,0.10)] sm:rounded-[28px] sm:p-8 dark:border-white/[0.14] dark:shadow-[0_30px_90px_rgba(0,0,0,0.62)]">
              <div className="mb-6 h-5 w-44 animate-pulse rounded-full bg-slate-200" />
              <div className="space-y-3">
                <div className="h-4 animate-pulse rounded-full bg-slate-200" />
                <div className="h-4 w-5/6 animate-pulse rounded-full bg-slate-200" />
                <div className="h-56 animate-pulse rounded-[24px] bg-slate-100" />
              </div>
              <p className="mt-6 text-center text-sm text-slate-500">Preparing preview...</p>
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
            <div ref={previewViewportRef} className="-mx-2 overflow-auto pb-2 sm:mx-0">
              <div
                className="mx-auto"
                style={{
                  width: PREVIEW_DOCUMENT_WIDTH * effectivePreviewScale,
                  height: previewHeight * effectivePreviewScale,
                }}
              >
                <iframe
                  ref={previewIframeRef}
                  title="Quotation preview"
                  srcDoc={previewHtml}
                  className="block rounded-[14px] border border-black/[0.08] bg-white shadow-none dark:border-white/[0.12] sm:rounded-2xl sm:shadow-[0_18px_54px_rgba(0,0,0,0.10)] sm:dark:shadow-[0_24px_70px_rgba(0,0,0,0.58)]"
                  style={{
                    width: PREVIEW_DOCUMENT_WIDTH,
                    height: previewHeight,
                    transform: `scale(${effectivePreviewScale})`,
                    transformOrigin: "top left",
                  }}
                  sandbox="allow-same-origin"
                  scrolling="no"
                  onLoad={event => {
                    const iframe = event.currentTarget;
                    requestAnimationFrame(() => {
                      resizePreview(iframe);
                      updatePreviewFitScale();
                    });
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Activity tab */}
      {activeTab === "timeline" && (
        <div className={`${surfaceCard} max-w-3xl p-4 sm:p-8`}>
          <div className="mb-5 sm:mb-8">
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
                  <div className={`flex-1 rounded-[24px] p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_16px_44px_rgba(0,0,0,0.06)] dark:hover:bg-white/[0.08] dark:hover:shadow-[0_16px_44px_rgba(0,0,0,0.42)] ${quoteSubtleSurface}`}>
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
            <div className="rounded-[28px] border border-dashed border-black/[0.12] bg-[#f5f5f7]/80 p-8 text-center dark:border-white/[0.16] dark:bg-white/[0.06]">
              <Activity className="mx-auto mb-3 h-6 w-6 text-muted" />
              <p className="text-sm font-semibold text-default">No activity yet</p>
              <p className="mt-1 text-sm text-muted">Actions like finalising, sending, and revisions will appear here.</p>
            </div>
          )}
        </div>
      )}

      {!emailModalOpen && markSentPrompt === null && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] xl:hidden">
          <motion.div
            drag="y"
            dragControls={dockDragControls}
            dragConstraints={{ top: -28, bottom: 28 }}
            dragElastic={0.06}
            dragListener={false}
            dragMomentum={false}
            dragSnapToOrigin
            animate={{ y: 0 }}
            whileDrag={{ scale: 0.994 }}
            onDragEnd={(_, info) => {
              const meaningfulDrag = Math.abs(info.offset.y) > 8 || Math.abs(info.velocity.y) > 80;
              if (meaningfulDrag) {
                dockSuppressClickUntilRef.current = Date.now() + 240;
              }
              cancelDockGesture();
              const wantsExpand = info.offset.y < -20 || info.velocity.y < -220;
              const wantsCollapse = info.offset.y > 24 || info.velocity.y > 220;
              if (isDockExpanded && wantsCollapse) {
                setIsDockExpanded(false);
              } else if (!isDockExpanded && wantsExpand) {
                setIsDockExpanded(true);
              }
            }}
            transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.9 }}
            className={`pointer-events-auto mx-auto w-full max-w-[44rem] overflow-hidden border transition-colors duration-300 ${
              isDockExpanded
                ? "flex flex-col rounded-[34px] border-white/[0.42] bg-white/[0.72] px-4 pb-4 pt-3 dark:border-white/[0.12] dark:bg-[#0a0a0b]/[0.78] sm:px-5 sm:pb-5 sm:pt-4"
                : "rounded-[22px] border-black/[0.06] bg-[#f5f5f7]/[0.84] px-1.5 py-1 dark:border-white/[0.10] dark:bg-black/[0.72]"
            }`}
            style={isDockExpanded ? { ...quotationExpandedDockGlassStyle, maxHeight: quotationExpandedDockMaxHeight, touchAction: "auto" } : quotationCompactDockGlassStyle}
          >
            {isDockExpanded && (
              <button
                type="button"
                onPointerDown={(event) => startDockGesture(event, "expanded")}
                onPointerMove={trackDockGesture}
                onPointerCancel={cancelDockGesture}
                onClick={() => {
                  if (consumeDockClickSuppression()) return;
                  setIsDockExpanded(false);
                }}
                className="mb-1 flex h-5 w-full cursor-grab items-center justify-center rounded-[18px] text-muted transition duration-200 active:cursor-grabbing active:scale-[0.99]"
                aria-label="Collapse quotation summary"
                style={{ touchAction: "none" }}
              >
                <span className="h-1 w-10 rounded-full bg-black/[0.16] dark:bg-white/[0.18]" />
              </button>
            )}

            {!isDockExpanded && (
              <div className="flex h-11 items-center gap-2">
                <button
                  type="button"
                  onPointerDown={(event) => startDockGesture(event, "compact")}
                  onPointerMove={trackDockGesture}
                  onPointerCancel={cancelDockGesture}
                  onClick={() => {
                    if (consumeDockClickSuppression()) return;
                    setIsDockExpanded(true);
                  }}
                  className="flex h-full min-w-0 flex-1 flex-col items-start justify-center rounded-[18px] px-3.5 text-left outline-none transition duration-200 active:scale-[0.99] focus-visible:ring-4 focus-visible:ring-brand-500/15"
                  aria-label="Expand quotation summary"
                  style={{ touchAction: "none" }}
                >
                  <span className="text-[10px] font-semibold uppercase leading-none text-muted">Grand Total</span>
                  <span className="mt-1 truncate font-mono text-base font-semibold leading-none tabular-nums text-default">{money(liveGrand)}</span>
                </button>
                {hasPrimaryDockAction ? (
                  <button
                    type="button"
                    onClick={handlePrimaryDockAction}
                    disabled={primaryDockActionDisabled}
                    className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-[#0071e3] px-3.5 text-[13px] font-semibold text-white transition duration-200 hover:bg-[#0077ed] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={isEditable ? "Finalise quotation" : "Create email draft"}
                  >
                    {isEditable ? <Sparkles className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                    <span className="whitespace-nowrap">{primaryDockCompactLabel}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openMoreMenu(event, "summary");
                    }}
                    className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-black/[0.06] bg-white/[0.42] px-3.5 text-[13px] font-semibold text-default transition duration-200 hover:bg-white/[0.58] active:scale-[0.97] dark:border-white/[0.10] dark:bg-white/[0.08] dark:hover:bg-white/[0.12]"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                    More
                  </button>
                )}
              </div>
            )}

            <AnimatePresence initial={false}>
              {isDockExpanded && (
                <motion.div
                  key="quotation-dock-summary"
                  initial={{ opacity: 0, height: 0, y: 10 }}
                  animate={{ opacity: 1, height: "auto", y: 0 }}
                  exit={{ opacity: 0, height: 0, y: 10 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-0.5 pb-1 pt-2"
                  style={{
                    maxHeight: quotationExpandedDockScrollMaxHeight,
                    WebkitOverflowScrolling: "touch",
                    touchAction: "pan-y",
                  }}
                >
                  {renderSummaryIdentity()}
                  {renderSummaryTotal(true)}
                  {renderQuotationSummaryDetails("dock")}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
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
        className="mt-auto h-auto max-h-[94dvh] rounded-b-none rounded-t-[32px] border-white/70 shadow-[0_34px_110px_rgba(0,0,0,0.28)] backdrop-blur-2xl sm:mt-0 sm:h-full sm:max-h-[90vh] sm:rounded-[36px] dark:border-white/[0.12] dark:shadow-[0_38px_120px_rgba(0,0,0,0.74)]"
        bgColor="rgba(var(--color-card-rgb),0.92)"
      >
        <form
          className="flex max-h-[94dvh] flex-col overflow-hidden bg-transparent sm:max-h-[90vh]"
          onSubmit={(e) => {
            e.preventDefault();
            handleEmailDraft();
          }}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.35] bg-white/20 px-4 py-4 backdrop-blur-2xl sm:gap-4 sm:px-6 sm:py-5 dark:border-white/[0.10] dark:bg-white/[0.04]">
            <div className="flex min-w-0 items-start gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 shadow-sm sm:h-11 sm:w-11">
                <Mail className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-default">Create Email Draft</h3>
                <p className="mt-1 truncate text-sm text-muted">{quotation.quotationNumber || "Draft quotation"} for {quotation.clientName}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { if (!emailLoading) setEmailModalOpen(false); }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/60 bg-white/[0.55] text-muted shadow-sm backdrop-blur-xl transition duration-200 hover:bg-white/80 hover:text-default active:scale-[0.98] dark:border-white/[0.12] dark:bg-white/[0.07] dark:hover:bg-white/[0.12]"
              aria-label="Close email draft modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto bg-[#d8d8dc]/[0.55] px-4 py-4 backdrop-blur-2xl sm:space-y-6 sm:px-6 sm:py-5 dark:bg-[#0b0b0d]/[0.92]">
            <section>
              <p className={sectionEyebrow}>Recipients</p>
              {clientEmailOptions.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-3">
                  {clientEmailOptions.map(option => (
                    <div key={option.id} className="flex h-14 w-full min-w-0 items-center gap-2 rounded-full border border-white/80 bg-white/[0.92] px-2.5 py-2 shadow-[0_8px_22px_rgba(0,0,0,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-white sm:min-w-[220px] sm:max-w-[270px] dark:border-white/[0.10] dark:bg-white/[0.07] dark:hover:bg-white/[0.10] dark:shadow-[0_10px_28px_rgba(0,0,0,0.36)]">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f1f1f3] text-[11px] font-semibold text-muted shadow-inner dark:bg-white/[0.08]">
                        {option.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "C"}
                      </div>
                      <div className="min-w-0 flex-1 leading-none">
                        <p className="truncate text-[13px] font-semibold leading-4 text-default">{option.name}</p>
                        <p className="mt-0.5 truncate text-[11px] leading-3 text-muted">{option.email}</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <label className={`cursor-pointer rounded-full px-2.5 py-1 text-[9px] font-bold uppercase leading-none transition duration-200 ${selectedToEmails.includes(option.email) ? "bg-brand-600 text-white shadow-sm shadow-brand-600/20" : "bg-[#f1f1f3] text-faint hover:text-muted dark:bg-white/[0.08] dark:hover:bg-white/[0.12]"}`}>
                          <input type="checkbox" checked={selectedToEmails.includes(option.email)} onChange={() => toggleContactEmail(option.email, "to")} className="sr-only" />
                          To
                        </label>
                        <label className={`cursor-pointer rounded-full px-2.5 py-1 text-[9px] font-bold uppercase leading-none transition duration-200 ${selectedCcEmails.includes(option.email) ? "bg-muted text-white shadow-sm dark:bg-white/[0.22]" : "bg-[#f1f1f3] text-faint hover:text-muted dark:bg-white/[0.08] dark:hover:bg-white/[0.12]"}`}>
                          <input type="checkbox" checked={selectedCcEmails.includes(option.email)} onChange={() => toggleContactEmail(option.email, "cc")} className="sr-only" />
                          CC
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-[24px] border border-dashed border-white/70 bg-white/60 p-4 text-sm text-muted shadow-sm backdrop-blur-xl dark:border-white/[0.14] dark:bg-white/[0.06]">No saved client contacts found. Add recipients manually below.</div>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Additional To</label>
                  <input type="text" className={`${softInput} w-full border-white/75 bg-white/[0.88] shadow-[0_8px_24px_rgba(0,0,0,0.06)] focus:bg-white dark:border-white/[0.10] dark:bg-white/[0.07] dark:focus:bg-white/[0.10]`} value={emailRecipient} onChange={(e) => setEmailRecipient(e.target.value)} placeholder="client@example.com" autoFocus={clientEmailOptions.length === 0} />
                  <p className="mt-1 text-xs text-faint">Separate multiple email addresses with commas.</p>
                </div>
                <div>
                  <label className="label">Additional CC</label>
                  <input type="text" className={`${softInput} w-full border-white/75 bg-white/[0.88] shadow-[0_8px_24px_rgba(0,0,0,0.06)] focus:bg-white dark:border-white/[0.10] dark:bg-white/[0.07] dark:focus:bg-white/[0.10]`} value={emailCc} onChange={(e) => setEmailCc(e.target.value)} placeholder="accounts@example.com, owner@example.com" />
                  <p className="mt-1 text-xs text-faint">Separate multiple emails with commas.</p>
                </div>
              </div>
            </section>

            <section>
              <label className={sectionEyebrow}>Subject</label>
              <input className="mt-3 h-11 w-full rounded-full border border-white/75 bg-white/[0.88] px-4 text-sm font-medium text-default shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-200 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10 sm:h-12 sm:px-5 dark:border-white/[0.10] dark:bg-white/[0.07] dark:focus:bg-white/[0.10]" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Quotation subject" />
            </section>

            <section>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <label className={sectionEyebrow}>Message Body</label>
                  <p className="mt-1 text-xs text-faint">{emailMessageTemplates.length}/{MAX_EMAIL_MESSAGE_TEMPLATES} saved messages</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => saveEmailMessageTemplate("create")}
                    disabled={emailTemplateLoading || emailTemplateLimitReached}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/75 bg-white/[0.78] px-3 text-xs font-semibold text-default shadow-sm transition duration-200 hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/[0.10] dark:bg-white/[0.07] dark:hover:bg-white/[0.11]"
                    title={emailTemplateLimitReached ? `Limit reached: ${MAX_EMAIL_MESSAGE_TEMPLATES} saved messages` : "Save as a new message"}
                  >
                    <Save className="h-3.5 w-3.5" /> Save New
                  </button>
                  <button
                    type="button"
                    onClick={() => saveEmailMessageTemplate("update")}
                    disabled={emailTemplateLoading || !selectedEmailTemplate}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/75 bg-white/[0.78] px-3 text-xs font-semibold text-default shadow-sm transition duration-200 hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/[0.10] dark:bg-white/[0.07] dark:hover:bg-white/[0.11]"
                  >
                    Update
                  </button>
                  <button
                    type="button"
                    onClick={deleteEmailMessageTemplate}
                    disabled={emailTemplateLoading || !selectedEmailTemplate}
                    className="inline-flex h-9 items-center justify-center rounded-full border border-white/75 bg-white/[0.78] px-3 text-xs font-semibold text-red-500 shadow-sm transition duration-200 hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/[0.10] dark:bg-white/[0.07] dark:hover:bg-white/[0.11]"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-3 rounded-[24px] border border-white/75 bg-white/[0.72] p-2 shadow-[0_16px_44px_rgba(0,0,0,0.08)] backdrop-blur-2xl sm:rounded-[32px] sm:p-2.5 dark:border-white/[0.10] dark:bg-[#151517]/[0.92] dark:shadow-[0_18px_56px_rgba(0,0,0,0.46)]">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <div ref={emailTemplateDropdownRef} className="relative z-30">
                    <button
                      ref={emailTemplateDropdownButtonRef}
                      type="button"
                      onClick={() => {
                        positionEmailTemplateDropdown();
                        setEmailTemplateDropdownOpen(open => !open);
                      }}
                      disabled={emailTemplateLoading}
                      className={`group flex h-11 w-full items-center justify-between gap-3 rounded-full border px-4 text-left text-sm font-semibold text-default shadow-[0_10px_28px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.86)] backdrop-blur-2xl transition-all duration-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/10 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.10] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${
                        emailTemplateDropdownOpen
                          ? "border-brand-300 bg-white/[0.94] ring-4 ring-brand-500/10 dark:bg-white/[0.10]"
                          : "border-white/80 bg-white/[0.78] hover:bg-white/[0.92] dark:bg-white/[0.06] dark:hover:bg-white/[0.10]"
                      }`}
                    >
                      <span className="min-w-0 truncate">
                        {selectedEmailTemplate?.name || "Default / unsaved message"}
                      </span>
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/80 text-muted shadow-sm transition duration-300 group-hover:text-default dark:bg-white/10 ${emailTemplateDropdownOpen ? "rotate-180 text-brand-600" : ""}`}>
                        <ChevronDown className="h-4 w-4" />
                      </span>
                    </button>
                  </div>
                  <input
                    className="h-11 rounded-full border border-white/75 bg-white/[0.88] px-4 text-sm font-medium text-default shadow-sm transition duration-200 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10 dark:border-white/[0.10] dark:bg-white/[0.07] dark:focus:bg-white/[0.10]"
                    value={emailTemplateName}
                    onChange={(event) => setEmailTemplateName(event.target.value)}
                    placeholder="Saved message name"
                    maxLength={80}
                    disabled={emailTemplateLoading}
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-[20px] border border-white/[0.65] bg-white/[0.58] px-2 py-1.5 shadow-inner dark:border-white/[0.10] dark:bg-white/[0.05]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => runEmailEditorCommand("bold")}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition duration-200 hover:bg-white hover:text-default active:scale-[0.96] dark:hover:bg-white/[0.10]"
                      title="Bold selected text"
                    >
                      <Bold className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => runEmailEditorCommand("divider")}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition duration-200 hover:bg-white hover:text-default active:scale-[0.96] dark:hover:bg-white/[0.10]"
                      title="Insert separating line"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="mx-0.5 h-5 w-px bg-black/[0.08] dark:bg-white/10" aria-hidden="true" />
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => runEmailEditorCommand("clientName")}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/75 bg-white/[0.68] px-2.5 text-[11px] font-semibold text-default shadow-sm transition duration-200 hover:bg-white active:scale-[0.97] dark:border-white/[0.10] dark:bg-white/[0.07] dark:hover:bg-white/[0.11]"
                      title="Insert client name variable"
                    >
                      <UserRound className="h-3.5 w-3.5 text-brand-600" />
                      Client Name
                    </button>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => runEmailEditorCommand("financialYear")}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/75 bg-white/[0.68] px-2.5 text-[11px] font-semibold text-default shadow-sm transition duration-200 hover:bg-white active:scale-[0.97] dark:border-white/[0.10] dark:bg-white/[0.07] dark:hover:bg-white/[0.11]"
                      title="Insert financial year variable"
                    >
                      <CalendarDays className="h-3.5 w-3.5 text-brand-600" />
                      Financial Year
                    </button>
                  </div>
                  <span className="hidden pr-2 text-[11px] font-medium text-faint sm:inline">Auto-bold stays active</span>
                </div>

                <div
                  ref={setEmailEditorRef}
                  contentEditable={!emailLoading}
                  suppressContentEditableWarning
                  className="mt-2 min-h-48 w-full overflow-y-auto rounded-[22px] border border-white/70 bg-white/[0.92] px-4 py-4 text-sm leading-relaxed text-default shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-all duration-200 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10 sm:min-h-60 sm:rounded-[26px] sm:px-5 sm:py-5 dark:border-white/[0.10] dark:bg-white/[0.07] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:focus:bg-white/[0.10]"
                  onInput={syncEmailEditorState}
                  onBlur={handleEmailEditorBlur}
                  data-placeholder="Add a short message for the client"
                />
              </div>
              <p className="mt-2 text-xs text-faint">This message appears above the quotation and can be edited in Gmail after the draft is created.</p>
            </section>

            <section>
              <div className="flex items-center gap-3 rounded-[24px] border border-white/75 bg-white/[0.88] px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.06)] dark:border-white/[0.10] dark:bg-white/[0.07]">
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

          <div className="grid shrink-0 grid-cols-2 items-center gap-2 border-t border-white/[0.35] bg-white/[0.45] px-4 py-3 shadow-[0_-12px_36px_rgba(0,0,0,0.04)] backdrop-blur-2xl sm:flex sm:justify-end sm:gap-3 sm:px-6 sm:py-4 dark:border-white/[0.10] dark:bg-white/[0.05]">
            <button type="button" className={`${appleButton} w-full border border-white/70 bg-white/70 text-default shadow-sm hover:bg-white sm:w-auto dark:border-white/[0.10] dark:bg-white/[0.07] dark:hover:bg-white/[0.11]`} disabled={emailLoading} onClick={() => setEmailModalOpen(false)}>Cancel</button>
            <button type="submit" className={`${appleButton} w-full bg-brand-600 text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700 sm:w-auto`} disabled={emailLoading || (selectedToEmails.length === 0 && !emailRecipient.trim())}>
              <Send className="mr-2 h-4 w-4" />
              {emailLoading ? "Creating..." : <><span className="sm:hidden">Create Draft</span><span className="hidden sm:inline">Create Gmail Draft</span></>}
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
          <div className={`flex items-start gap-4 rounded-[28px] p-5 ${quoteSubtleSurface}`}>
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
      {typeof document !== "undefined" && createPortal(emailTemplateDropdownPanel, document.body)}
    </div>
  );
}

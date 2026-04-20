"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatCurrency, formatDate, FINANCIAL_YEARS, PAYMENT_MODES, STATES, CATEGORIES } from "@/lib/utils";
import { CategoryBadge, PaymentStatusBadge } from "@/components/ui/CategoryBadge";
import { CategoryBreakdown } from "@/components/ui/CategoryBreakdown";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { invalidate } from "@/lib/useCache";
import FYTabBar from "@/components/ui/FYTabBar";
import { useFinancialYearState } from "@/app/providers";
import {
  ArrowLeft, Building2, Phone, Mail, MapPin, Plus, ExternalLink,
  Trash2, User, Shield, FileText, Hash, Lock, Smartphone,
  ArrowUpRight, ArrowDownLeft, Target, Wallet, Zap,
  Receipt, Send, MailCheck, Activity, Pencil, X, Users, BarChart2,
  Copy, Check, ChevronDown, ChevronRight
} from "lucide-react";

interface Person {
  _id: string;
  name: string;
  phoneNumbers: string[];
  emails: string[];
}

interface Contact {
  _id: string;
  personId?: string;
  name: string;
  designation?: string;
  phoneNumbers?: string[];
  emails?: string[];
  selectedPhones?: string[];
  selectedEmails?: string[];
  allPhoneNumbers?: string[];
  allEmails?: string[];
  isPrimaryContact?: boolean;
}
interface Client {
  _id: string; clientId: string; companyName: string; category: string;
  state: string; address?: string; gstNumber?: string; registrationNumber?: string;
  cpcbLoginId?: string; cpcbPassword?: string; otpMobileNumber?: string;
  createdAt: string; updatedAt?: string; contacts?: Contact[];
}
interface FYRecord {
  _id?: string; clientId: string; financialYear: string;
  generated?: Array<{ categoryId: string; type: "RECYCLING" | "EOL"; value: number }>;
  targets?: Array<{ categoryId: string; type: "RECYCLING" | "EOL"; value: number }>;
  cat1Generated?: number; cat2Generated?: number; cat3Generated?: number; cat4Generated?: number;
  cat1Target?: number;    cat2Target?: number;    cat3Target?: number;    cat4Target?: number;
  soldCat1?: number;      soldCat2?: number;      soldCat3?: number;      soldCat4?: number;
  achievedCat1?: number;  achievedCat2?: number;  achievedCat3?: number;  achievedCat4?: number;
  remainingCat1?: number; remainingCat2?: number; remainingCat3?: number; remainingCat4?: number;
  remainingTargetCat1?: number; remainingTargetCat2?: number; remainingTargetCat3?: number; remainingTargetCat4?: number;
  totalGenerated?: number; totalSold?: number; totalRemaining?: number;
  totalTarget?: number;    totalAchieved?: number; totalRemainingTarget?: number;
  // Legacy
  creditsCat1?: number; creditsCat2?: number; creditsCat3?: number; creditsCat4?: number;
  targetCat1?: number;  targetCat2?: number;  targetCat3?: number;  targetCat4?: number;
  usedCat1?: number;    usedCat2?: number;    usedCat3?: number;    usedCat4?: number;
  totalCredits?: number; totalUsed?: number; remainingCredits?: number;
  remainingTarget?: number;
  availableCredits?: number; targetAmount?: number; usedCredits?: number; achievedAmount?: number;
  createdAt?: string;
  updatedAt?: string;
}
interface Billing { _id: string; clientId: string; financialYear: string; totalAmount: number; govtCharges: number; consultancyCharges: number; targetCharges: number; otherCharges: number; notes?: string; totalPaid: number; pendingAmount: number; paymentStatus: string; updatedAt?: string; createdAt?: string; }
interface Payment { _id: string; clientId: string; amountPaid: number; paymentType?: "billing" | "advance"; paymentDate: string; paymentMode: string; referenceNumber: string; notes?: string; financialYear?: string; }
interface Document { _id: string; documentName: string; driveLink: string; uploadedDate: string; }
type ActivityCategory = "credits" | "financial-year" | "billing" | "payments" | "emails" | "recycle-bin";
type ActivityRange = "7d" | "30d" | "year";
interface ActivityItem {
  id: string;
  category: ActivityCategory;
  type: string;
  label: string;
  detail: string;
  date: string;
  color: string;
  financialYear?: string;
  badge?: string;
  badgeColor?: string;
  entityId?: string;
  entityType?: "billing" | "payment" | "financial-year" | "email" | "trash";
  recordType?: string;
  actionSearch?: string;
}

interface ActivityResponse {
  items: ActivityItem[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
  latestEmailActivity: ActivityItem | null;
}

interface PersonEntry {
  personId?: string;
  name: string;
  phoneNumbers: string[];
  emails: string[];
  selectedPhones: string[];
  selectedEmails: string[];
  designation: string;
  isPrimaryContact: boolean;
}

interface FYEntryForm {
  categoryId: string;
  type: "RECYCLING" | "EOL";
  value: string;
}

interface EmailOption {
  label: string;
  email: string;
}

const CATS = ["CAT-I", "CAT-II", "CAT-III", "CAT-IV"] as const;
const CAT_IDS = ["1", "2", "3", "4"] as const;
const CREDIT_TYPES = ["RECYCLING", "EOL"] as const;
const ACTIVITY_FILTERS = [
  { id: "all", label: "All" },
  { id: "credits", label: "Credits" },
  { id: "financial-year", label: "FY" },
  { id: "billing", label: "Billing" },
  { id: "payments", label: "Payments" },
  { id: "emails", label: "Emails" },
  { id: "recycle-bin", label: "Recycle Bin" },
] as const;
type ActivityFilter = typeof ACTIVITY_FILTERS[number]["id"];
const ACTIVITY_RANGES = [
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last Month" },
  { id: "year", label: "Whole Year" },
] as const;
const ACTIVITY_PAGE_SIZE = 10;
const ACTIVITY_SCROLL_THRESHOLD = 120;
const normalizePhoneValue = (value: string) => value.trim();
const normalizeEmailValue = (value: string) => value.trim().toLowerCase();
const dedupe = (values: string[]) => Array.from(new Set(values));
const normalizePhoneList = (values: string[]) => dedupe(values.map(normalizePhoneValue).filter(Boolean));
const normalizeEmailList = (values: string[]) => dedupe(values.map(normalizeEmailValue).filter(Boolean));
const todayInputValue = () => new Date().toISOString().slice(0, 10);
const formatDateTime = (date?: string | Date | null) => {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
};
const getLatestTimestamp = (...values: Array<string | undefined>) => values.find((value) => typeof value === "string" && value.trim()) || "";
const getContactPhones = (contact?: Partial<Contact>) =>
  normalizePhoneList(contact?.selectedPhones?.length ? contact.selectedPhones : contact?.phoneNumbers || []);
const getContactEmails = (contact?: Partial<Contact>) =>
  normalizeEmailList(contact?.selectedEmails?.length ? contact.selectedEmails : contact?.emails || []);

const syncEntrySelections = (entry: PersonEntry): PersonEntry => {
  const phoneSet = new Set(normalizePhoneList(entry.phoneNumbers));
  const emailSet = new Set(normalizeEmailList(entry.emails));

  return {
    ...entry,
    selectedPhones: normalizePhoneList(entry.selectedPhones).filter((value) => phoneSet.has(value)),
    selectedEmails: normalizeEmailList(entry.selectedEmails).filter((value) => emailSet.has(value)),
  };
};

const createPersonEntry = (person?: Partial<Contact & Person>): PersonEntry => {
  const phoneNumbers = person?.allPhoneNumbers?.length
    ? person.allPhoneNumbers
    : person?.phoneNumbers?.length
      ? person.phoneNumbers
      : [""];

  const emails = person?.allEmails?.length
    ? person.allEmails
    : person?.emails?.length
      ? person.emails
      : [""];

  return syncEntrySelections({
    personId: person?.personId || person?._id,
    name: person?.name || "",
    phoneNumbers,
    emails,
    selectedPhones: Array.isArray(person?.selectedPhones)
      ? person.selectedPhones
      : normalizePhoneList(phoneNumbers),
    selectedEmails: Array.isArray(person?.selectedEmails)
      ? person.selectedEmails
      : normalizeEmailList(emails),
    designation: person?.designation || "",
    isPrimaryContact: person?.isPrimaryContact || false,
  });
};

const emptyPersonEntry = (): PersonEntry => ({
  name: "",
  phoneNumbers: [""],
  emails: [""],
  selectedPhones: [],
  selectedEmails: [],
  designation: "",
  isPrimaryContact: false,
});

const createEmptyFyEntries = (): FYEntryForm[] => (
  CAT_IDS.flatMap((categoryId) => CREDIT_TYPES.map((type) => ({ categoryId, type, value: "" })))
);

const buildFyEntries = (entries: Array<{ categoryId: string; type: "RECYCLING" | "EOL"; value: number }> | undefined): FYEntryForm[] => {
  const map = new Map<string, number>();
  (entries || []).forEach((entry) => {
    map.set(`${entry.categoryId}|${entry.type}`, Number(entry.value) || 0);
  });
  return CAT_IDS.flatMap((categoryId) => CREDIT_TYPES.map((type) => ({
    categoryId,
    type,
    value: map.has(`${categoryId}|${type}`) ? String(map.get(`${categoryId}|${type}`) || 0) : "",
  })));
};

const sumFyEntries = (entries: FYEntryForm[]) => entries.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0);

function restoreSuggestion(email: string, currentSuggestions: EmailOption[], catalog: EmailOption[]) {
  if (currentSuggestions.some((entry) => entry.email === email)) return currentSuggestions;

  const match = catalog.find((entry) => entry.email === email);
  if (!match) return currentSuggestions;

  const orderedSuggestions = catalog.filter((entry) =>
    entry.email === email || currentSuggestions.some((current) => current.email === entry.email)
  );

  return orderedSuggestions.map((entry) =>
    entry.email === email ? match : currentSuggestions.find((current) => current.email === entry.email) || entry
  );
}

function buildLinkedContactEmailOptions(contacts: Contact[] = []) {
  const selected: EmailOption[] = [];
  const suggestions: EmailOption[] = [];
  const selectedSet = new Set<string>();
  const suggestionSet = new Set<string>();

  contacts.forEach((contact) => {
    const selectedEmails = getContactEmails(contact);
    const allEmails = normalizeEmailList(contact.allEmails?.length ? contact.allEmails : contact.emails || []);
    const suggestedEmails = allEmails.filter((email) => !selectedEmails.includes(email));

    selectedEmails.forEach((email) => {
      if (selectedSet.has(email)) return;
      selectedSet.add(email);
      selected.push({ label: contact.name, email });
    });

    suggestedEmails.forEach((email) => {
      if (selectedSet.has(email) || suggestionSet.has(email)) return;
      suggestionSet.add(email);
      suggestions.push({ label: contact.name, email });
    });
  });

  return { selected, suggestions };
}

const activityIcon = (type: string) => {
  if (type === "credit_sold")     return <ArrowUpRight className="w-3.5 h-3.5" />;
  if (type === "target_achieved") return <ArrowDownLeft className="w-3.5 h-3.5" />;
  if (type === "target_set")      return <Target className="w-3.5 h-3.5" />;
  if (type === "credits_set")     return <Zap className="w-3.5 h-3.5" />;
  if (type === "billing_created") return <Receipt className="w-3.5 h-3.5" />;
  if (type === "payment_received" || type === "advance_payment_received") return <Wallet className="w-3.5 h-3.5" />;
  if (type === "email_draft")     return <MailCheck className="w-3.5 h-3.5" />;
  if (type === "email_sent")      return <Send className="w-3.5 h-3.5" />;
  if (type.startsWith("deleted_")) return <Trash2 className="w-3.5 h-3.5" />;
  return <Zap className="w-3.5 h-3.5" />;
};
const activityColors: Record<string, string> = {
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-900/35 dark:text-teal-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/35 dark:text-blue-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/35 dark:text-amber-300",
  brand: "bg-brand-100 text-brand-700 dark:bg-brand-900/35 dark:text-brand-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-300",
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400",
  rose: "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300",
};

function InfoRow({ icon, label, value, sub, mono }: { icon: React.ReactNode; label: string; value: string; sub?: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <div className="text-faint mt-0.5 flex-shrink-0">{icon}</div>
      <div>
        <p className="text-muted text-xs">{label}</p>
        <p className={`font-medium text-default ${mono ? "font-mono text-sm" : ""}`}>{value || "—"}</p>
        {sub && <p className="text-xs text-faint">{sub}</p>}
      </div>
    </div>
  );
}

function CopyButton({
  copied,
  label,
  onClick,
  className = "",
}: {
  copied: boolean;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border border-base bg-surface text-faint transition-colors hover:text-default ${className}`}
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function CollapsibleSectionHeader({
  title,
  subtitle,
  open,
  onToggle,
  trailing,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <button type="button" onClick={onToggle} className="flex items-start gap-2 text-left min-w-0">
        <span className="mt-0.5 text-faint">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-default">{title}</span>
          {subtitle && <span className="block text-xs text-faint mt-0.5">{subtitle}</span>}
        </span>
      </button>
      {trailing && <div className="flex items-center gap-2 flex-shrink-0">{trailing}</div>}
    </div>
  );
}

function FilterRail<T extends string>({
  label,
  value,
  options,
  onChange,
  tone = "brand",
  dense = false,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ id: T; label: string }>;
  onChange: (value: T) => void;
  tone?: "brand" | "neutral";
  dense?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const scrollStartRef = useRef(0);
  const touchStartXRef = useRef(0);
  const touchScrollStartRef = useRef(0);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const [elasticOffset, setElasticOffset] = useState(0);

  const updateFades = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    setShowLeftFade(el.scrollLeft > 4);
    setShowRightFade(el.scrollLeft < maxScroll - 4);
  }, []);

  const applyElasticFeedback = useCallback((nextScrollLeft: number) => {
    const el = scrollRef.current;
    if (!el) return;

    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    if (nextScrollLeft < 0) {
      el.scrollLeft = 0;
      setElasticOffset(Math.min(16, Math.abs(nextScrollLeft) * 0.18));
      return;
    }

    if (nextScrollLeft > maxScroll) {
      el.scrollLeft = maxScroll;
      setElasticOffset(Math.max(-16, -(nextScrollLeft - maxScroll) * 0.18));
      return;
    }

    el.scrollLeft = nextScrollLeft;
    setElasticOffset(0);
  }, []);

  const resetElastic = useCallback(() => {
    isDraggingRef.current = false;
    setElasticOffset(0);
  }, []);

  const ensureOptionVisible = useCallback((optionId: T) => {
    const el = scrollRef.current;
    if (!el) return;

    const btn = el.querySelector<HTMLElement>(`[data-filter-option="${String(optionId)}"]`);
    if (!btn) return;

    const padding = 12;
    const viewLeft = el.scrollLeft;
    const viewRight = viewLeft + el.clientWidth;
    const btnLeft = btn.offsetLeft;
    const btnRight = btnLeft + btn.offsetWidth;

    if (btnLeft >= viewLeft + padding && btnRight <= viewRight - padding) {
      return;
    }

    const targetLeft = btnLeft - padding;
    const targetRight = btnRight - el.clientWidth + padding;
    const nextLeft = btnLeft < viewLeft + padding ? targetLeft : targetRight;
    el.scrollTo({
      left: Math.max(0, Math.min(nextLeft, el.scrollWidth - el.clientWidth)),
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      ensureOptionVisible(value);
      updateFades();
    }, 40);

    return () => window.clearTimeout(timer);
  }, [value, ensureOptionVisible, updateFades]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    dragStartXRef.current = e.pageX;
    scrollStartRef.current = scrollRef.current?.scrollLeft ?? 0;
    if (scrollRef.current) {
      scrollRef.current.style.cursor = "grabbing";
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();
    const nextScrollLeft = scrollStartRef.current - (e.pageX - dragStartXRef.current);
    applyElasticFeedback(nextScrollLeft);
    updateFades();
  };

  const handleMouseUp = () => {
    resetElastic();
    if (scrollRef.current) {
      scrollRef.current.style.cursor = "grab";
    }
    updateFades();
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? 0;
    touchScrollStartRef.current = scrollRef.current?.scrollLeft ?? 0;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const touchX = e.touches[0]?.clientX ?? 0;
    const nextScrollLeft = touchScrollStartRef.current - (touchX - touchStartXRef.current);
    applyElasticFeedback(nextScrollLeft);
    updateFades();
  };

  const handleTouchEnd = () => {
    setElasticOffset(0);
    updateFades();
  };

  const handleSelect = (optionId: T) => {
    onChange(optionId);
    ensureOptionVisible(optionId);
  };

  return (
    <div className={`rounded-2xl border border-base bg-surface/70 ${dense ? "p-1.5" : "p-2"} backdrop-blur-sm`}>
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-faint flex-shrink-0">{label}</span>
        <div className="relative flex-1 min-w-0 overflow-hidden">
          <div
            className="pointer-events-none absolute left-[-6px] top-0 h-full w-8 z-10 transition-opacity duration-200"
            style={{
              background: "linear-gradient(to right, var(--color-surface) 28%, transparent)",
              opacity: showLeftFade ? 1 : 0,
            }}
          />
          <div
            className="pointer-events-none absolute right-[-6px] top-0 h-full w-8 z-10 transition-opacity duration-200"
            style={{
              background: "linear-gradient(to left, var(--color-surface) 28%, transparent)",
              opacity: showRightFade ? 1 : 0,
            }}
          />
          <div
            ref={scrollRef}
            className="overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden snap-x snap-proximity"
            style={{
              cursor: "grab",
              WebkitOverflowScrolling: "touch",
            }}
            onScroll={updateFades}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
          <div
            className="flex gap-1.5 min-w-max transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ transform: `translateX(${elasticOffset}px)` }}
          >
            {options.map((option) => {
              const active = value === option.id;
              const activeClass = tone === "brand"
                ? "bg-brand-600 text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)]"
                : "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-[0_8px_20px_rgba(15,23,42,0.2)]";

              return (
                <button
                  key={option.id}
                  type="button"
                  data-filter-option={String(option.id)}
                  onClick={() => handleSelect(option.id)}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200 ${
                    active
                      ? activeClass
                      : "bg-card/70 text-muted hover:text-default border border-transparent hover:border-base"
                  } snap-start`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PersonSearch({ value, onChange, onSelect }: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (person: Person) => void;
}) {
  const [results, setResults] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextLookupRef = useRef(false);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (skipNextLookupRef.current) {
      skipNextLookupRef.current = false;
      setResults([]);
      setOpen(false);
      return;
    }

    if (!isFocused || !value.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }

    const query = value.trim();
    timerRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/persons?search=${encodeURIComponent(query)}`);
        const data = await response.json();
        const nextResults = Array.isArray(data) ? data : [];
        setResults(nextResults);
        setOpen(nextResults.length > 0);
      } catch {
        setResults([]);
        setOpen(false);
      }
    }, 250);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, isFocused]);

  return (
    <div className="relative">
      <input
        className="input-field w-full"
        placeholder="Type name to search or create..."
        value={value}
        onChange={(event) => {
          setIsFocused(true);
          onChange(event.target.value);
        }}
        onFocus={() => {
          setIsFocused(true);
          if (results.length > 0 && value.trim()) setOpen(true);
        }}
        onBlur={() => {
          setIsFocused(false);
          setOpen(false);
        }}
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-card border border-base rounded-xl shadow-xl overflow-hidden">
          {results.map((person) => (
            <button
              key={person._id}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                skipNextLookupRef.current = true;
                setIsFocused(false);
                setResults([]);
                setOpen(false);
                onSelect(person);
              }}
              className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-hover text-left transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-default">{person.name}</p>
                <p className="text-xs text-faint truncate">
                  {[...person.phoneNumbers, ...person.emails].filter(Boolean).join(" · ")}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonEntryCard({
  entry,
  index,
  total,
  onChange,
  onRemove,
  onSetPrimary,
}: {
  entry: PersonEntry;
  index: number;
  total: number;
  onChange: (updated: PersonEntry) => void;
  onRemove: () => void;
  onSetPrimary: () => void;
}) {
  const remapSelectedValue = (
    currentSelected: string[],
    previousValue: string,
    nextValue: string,
    kind: "phone" | "email"
  ) => {
    const normalize = kind === "email" ? normalizeEmailValue : normalizePhoneValue;
    const previousNormalized = normalize(previousValue);
    const nextNormalized = normalize(nextValue);
    const normalizedSelected = kind === "email"
      ? normalizeEmailList(currentSelected)
      : normalizePhoneList(currentSelected);
    const hadPreviousSelection = previousNormalized
      ? normalizedSelected.includes(previousNormalized)
      : false;

    const withoutPrevious = previousNormalized
      ? normalizedSelected.filter((value) => value !== previousNormalized)
      : normalizedSelected;

    if (!nextNormalized) return withoutPrevious;
    if (!previousNormalized || hadPreviousSelection) return dedupe([...withoutPrevious, nextNormalized]);
    return withoutPrevious;
  };

  const updatePhone = (phoneIndex: number, value: string) => {
    const previousValue = entry.phoneNumbers[phoneIndex] || "";
    const nextPhoneNumbers = [...entry.phoneNumbers];
    nextPhoneNumbers[phoneIndex] = value;
    onChange(syncEntrySelections({
      ...entry,
      phoneNumbers: nextPhoneNumbers,
      selectedPhones: remapSelectedValue(entry.selectedPhones, previousValue, value, "phone"),
    }));
  };

  const removePhone = (phoneIndex: number) => {
    const removedValue = normalizePhoneValue(entry.phoneNumbers[phoneIndex] || "");
    onChange(syncEntrySelections({
      ...entry,
      phoneNumbers: entry.phoneNumbers.filter((_, idx) => idx !== phoneIndex),
      selectedPhones: entry.selectedPhones.filter((value) => value !== removedValue),
    }));
  };

  const updateEmail = (emailIndex: number, value: string) => {
    const previousValue = entry.emails[emailIndex] || "";
    const nextEmails = [...entry.emails];
    nextEmails[emailIndex] = value;
    onChange(syncEntrySelections({
      ...entry,
      emails: nextEmails,
      selectedEmails: remapSelectedValue(entry.selectedEmails, previousValue, value, "email"),
    }));
  };

  const removeEmail = (emailIndex: number) => {
    const removedValue = normalizeEmailValue(entry.emails[emailIndex] || "");
    onChange(syncEntrySelections({
      ...entry,
      emails: entry.emails.filter((_, idx) => idx !== emailIndex),
      selectedEmails: entry.selectedEmails.filter((value) => value !== removedValue),
    }));
  };

  const toggleSelectedPhone = (value: string) => {
    const normalizedValue = normalizePhoneValue(value);
    if (!normalizedValue) return;

    onChange(syncEntrySelections({
      ...entry,
      selectedPhones: entry.selectedPhones.includes(normalizedValue)
        ? entry.selectedPhones.filter((item) => item !== normalizedValue)
        : [...entry.selectedPhones, normalizedValue],
    }));
  };

  const toggleSelectedEmail = (value: string) => {
    const normalizedValue = normalizeEmailValue(value);
    if (!normalizedValue) return;

    onChange(syncEntrySelections({
      ...entry,
      selectedEmails: entry.selectedEmails.includes(normalizedValue)
        ? entry.selectedEmails.filter((item) => item !== normalizedValue)
        : [...entry.selectedEmails, normalizedValue],
    }));
  };

  const handleSelect = (person: Person) => {
    onChange(createPersonEntry({
      ...person,
      personId: person._id,
      designation: entry.designation,
      isPrimaryContact: entry.isPrimaryContact,
    }));
  };

  return (
    <div className="border border-base rounded-xl p-3 space-y-3 bg-surface">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted uppercase tracking-wide">
            Contact {index + 1}
            {entry.isPrimaryContact && <span className="ml-1.5 text-brand-600">(Primary)</span>}
          </span>
          {entry.personId && (
            <span className="text-[10px] bg-brand-50 dark:bg-brand-900/30 text-brand-600 px-1.5 py-0.5 rounded-full font-medium">existing</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!entry.isPrimaryContact && total > 1 && (
            <button type="button" onClick={onSetPrimary} className="text-xs text-brand-600 hover:underline">
              Set primary
            </button>
          )}
          <button type="button" onClick={onRemove} className="p-1 text-faint hover:text-red-500 rounded transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div>
        <label className="text-xs text-faint block mb-1">Name *</label>
        <PersonSearch
          value={entry.name}
          onChange={(value) => onChange({ ...entry, name: value, personId: undefined })}
          onSelect={handleSelect}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-faint flex items-center gap-1"><Phone className="w-3 h-3" />Phone Numbers</label>
          <button type="button" onClick={() => onChange({ ...entry, phoneNumbers: [...entry.phoneNumbers, ""] })} className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-0.5">
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        <p className="text-[11px] text-faint mb-2">Only checked numbers will be used for this company.</p>
        <div className="space-y-1.5">
          {entry.phoneNumbers.map((phone, phoneIndex) => (
            <div key={phoneIndex} className="flex gap-2 items-center">
              <label className="flex items-center gap-1.5 text-[11px] text-muted whitespace-nowrap">
                <input
                  type="checkbox"
                  className="rounded border-base"
                  checked={entry.selectedPhones.includes(normalizePhoneValue(phone))}
                  disabled={!normalizePhoneValue(phone)}
                  onChange={() => toggleSelectedPhone(phone)}
                />
                Use
              </label>
              <input
                className="input-field flex-1 font-mono text-sm !py-1.5"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(event) => updatePhone(phoneIndex, event.target.value)}
              />
              {entry.phoneNumbers.length > 1 && (
                <button type="button" onClick={() => removePhone(phoneIndex)} className="p-1 text-faint hover:text-red-500 rounded flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-faint flex items-center gap-1"><Mail className="w-3 h-3" />Email Addresses</label>
          <button type="button" onClick={() => onChange({ ...entry, emails: [...entry.emails, ""] })} className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-0.5">
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        <p className="text-[11px] text-faint mb-2">Only checked email addresses will be used for this company.</p>
        <div className="space-y-1.5">
          {entry.emails.map((email, emailIndex) => (
            <div key={emailIndex} className="flex gap-2 items-center">
              <label className="flex items-center gap-1.5 text-[11px] text-muted whitespace-nowrap">
                <input
                  type="checkbox"
                  className="rounded border-base"
                  checked={entry.selectedEmails.includes(normalizeEmailValue(email))}
                  disabled={!normalizeEmailValue(email)}
                  onChange={() => toggleSelectedEmail(email)}
                />
                Use
              </label>
              <input
                type="email"
                className="input-field flex-1 text-sm !py-1.5"
                placeholder="john@company.com"
                value={email}
                onChange={(event) => updateEmail(emailIndex, event.target.value)}
              />
              {entry.emails.length > 1 && (
                <button type="button" onClick={() => removeEmail(emailIndex)} className="p-1 text-faint hover:text-red-500 rounded flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-faint block mb-1">Designation</label>
        <input
          className="input-field text-sm !py-1.5"
          placeholder="e.g. Director, Manager"
          value={entry.designation}
          onChange={(event) => onChange({ ...entry, designation: event.target.value })}
        />
      </div>
    </div>
  );
}

export default function ClientProfilePage() {
  const { clientId } = useParams<{ clientId: string }>();
  const router = useRouter();
  const pageHeaderRef = useRef<HTMLDivElement | null>(null);

  const [client, setClient] = useState<Client | null>(null);
  const [fyRecords, setFyRecords] = useState<FYRecord[]>([]);
  const [allBillings, setAllBillings] = useState<Billing[]>([]);
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [activitiesTotal, setActivitiesTotal] = useState(0);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [activityOffset, setActivityOffset] = useState(0);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityRange, setActivityRange] = useState<ActivityRange>("30d");
  const [latestEmailActivity, setLatestEmailActivity] = useState<ActivityItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [selectedFy, setSelectedFy] = useFinancialYearState();
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const clientRef = useRef<Client | null>(null);
  const activityRequestIdRef = useRef(0);
  const activityTabListRef = useRef<HTMLDivElement | null>(null);
  const activityTimelineListRef = useRef<HTMLDivElement | null>(null);

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "portal" | "activity">("info");
  const [docModal, setDocModal] = useState(false);
  const [docForm, setDocForm] = useState({ documentName: "", driveLink: "" });
  const [docModalMode, setDocModalMode] = useState<"create" | "edit">("create");
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [billingModal, setBillingModal] = useState(false);
  const [editingBillingId, setEditingBillingId] = useState<string | null>(null);
  const [billingForm, setBillingForm] = useState({
    financialYear: selectedFy,
    govtCharges: "0",
    consultancyCharges: "0",
    targetCharges: "0",
    otherCharges: "0",
    notes: "",
  });
  const [paymentModal, setPaymentModal] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    financialYear: selectedFy,
    paymentType: "billing" as "billing" | "advance",
    amountPaid: "",
    paymentDate: todayInputValue(),
    paymentMode: PAYMENT_MODES[0] || "NEFT",
    referenceNumber: "",
    notes: "",
  });
  const [fyModal, setFyModal] = useState(false);
  const [fyForm, setFyForm] = useState({
    financialYear: selectedFy,
    generated: createEmptyFyEntries(),
    targets: createEmptyFyEntries(),
  });
  const [reminderModal, setReminderModal] = useState(false);
  const [activeReminderBillingId, setActiveReminderBillingId] = useState<string | null>(null);
  const [reminderRecipients, setReminderRecipients] = useState<EmailOption[]>([]);
  const [reminderSuggestions, setReminderSuggestions] = useState<EmailOption[]>([]);
  const [reminderSuggestionCatalog, setReminderSuggestionCatalog] = useState<EmailOption[]>([]);
  const [customReminderEmail, setCustomReminderEmail] = useState("");
  const [reminderForm, setReminderForm] = useState({ subject: "", message: "" });
  const [reminderPreviewHtml, setReminderPreviewHtml] = useState<string | null>(null);
  const [reminderSending, setReminderSending] = useState(false);
  const [inlineSaving, setInlineSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [headerTitleProgress, setHeaderTitleProgress] = useState(0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sectionOpen, setSectionOpen] = useState({
    contacts: true,
    portal: true,
    documents: true,
    recentActivity: true,
  });

  // Edit client state
  const [editModal, setEditModal] = useState(false);
  const [editTab, setEditTab] = useState<"basic" | "portal">("basic");
  const [saving, setSaving] = useState(false);
  const [persons, setPersons] = useState<PersonEntry[]>([emptyPersonEntry()]);
  const [removedPersonIds, setRemovedPersonIds] = useState<string[]>([]);
  const [editForm, setEditForm] = useState({
    companyName: "", category: "", state: "", address: "",
    gstNumber: "", registrationNumber: "",
    cpcbLoginId: "", cpcbPassword: "", otpMobileNumber: "",
  });
  const [showEditPassword, setShowEditPassword] = useState(false);

  // Breakdown modal
  const [breakdownRec, setBreakdownRec] = useState<FYRecord | null>(null);

  useEffect(() => {
    clientRef.current = client;
  }, [client]);

  useEffect(() => () => {
    if (copyResetRef.current) clearTimeout(copyResetRef.current);
  }, []);

  const handleCopy = useCallback(async (value: string, key: string, label: string) => {
    const trimmedValue = value.trim();
    if (!trimmedValue) return;

    try {
      await navigator.clipboard.writeText(trimmedValue);
      setCopiedKey(key);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => {
        setCopiedKey((current) => current === key ? null : current);
      }, 1600);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Couldn't copy ${label.toLowerCase()}`);
    }
  }, []);

  const toggleSection = useCallback((section: keyof typeof sectionOpen) => {
    setSectionOpen((current) => ({ ...current, [section]: !current[section] }));
  }, []);

  const readErrorMessage = useCallback(async (response: Response, fallback: string) => {
    try {
      const payload = await response.json();
      if (payload && typeof payload.error === "string" && payload.error.trim()) {
        return payload.error.trim();
      }
    } catch {
      // Ignore JSON parsing issues and use fallback.
    }
    return fallback;
  }, []);

  const fetchJson = useCallback(async <T,>(url: string, label: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      const message = await readErrorMessage(response, `Unable to load ${label}.`);
      throw new Error(message);
    }
    return response.json() as Promise<T>;
  }, [readErrorMessage]);

  const loadData = useCallback(async () => {

    const fetchClientProfile = async () => {
      const response = await fetch(`/api/clients/${clientId}`);
      if (response.status === 404) return null;
      if (!response.ok) {
        const message = await readErrorMessage(response, "Unable to load client profile.");
        throw new Error(message);
      }
      return response.json() as Promise<Client>;
    };

    setLoading(true);
    setLoadError(null);
    setLoadWarning(null);

    const results = await Promise.allSettled([
      fetchClientProfile(),
      fetchJson<FYRecord[]>(`/api/financial-year?clientId=${clientId}`, "financial years"),
      fetchJson<Document[]>(`/api/documents?clientId=${clientId}`, "documents"),
      fetchJson<Billing[]>(`/api/billing?clientId=${clientId}`, "billing"),
      fetchJson<Payment[]>(`/api/payments?clientId=${clientId}`, "payments"),
    ]);

    const [clientResult, fyResult, docsResult, billingResult, paymentsResult] = results;
    const failedSections: string[] = [];

    if (clientResult.status === "fulfilled") {
      setClient(clientResult.value);
    } else {
      failedSections.push("client profile");
    }

    if (fyResult.status === "fulfilled") {
      setFyRecords(Array.isArray(fyResult.value) ? fyResult.value : []);
    } else {
      failedSections.push("financial years");
    }

    if (docsResult.status === "fulfilled") {
      setDocuments(Array.isArray(docsResult.value) ? docsResult.value : []);
    } else {
      failedSections.push("documents");
    }

    if (billingResult.status === "fulfilled") {
      setAllBillings(Array.isArray(billingResult.value) ? billingResult.value : []);
    } else {
      failedSections.push("billing");
    }

    if (paymentsResult.status === "fulfilled") {
      setAllPayments(Array.isArray(paymentsResult.value) ? paymentsResult.value : []);
    } else {
      failedSections.push("payments");
    }

    if (clientResult.status === "rejected") {
      if (!clientRef.current) {
        setLoadError("Couldn't load this client profile right now. Please try again.");
      } else {
        setLoadWarning("The profile could not be refreshed completely. Showing the last loaded data.");
      }
    } else if (failedSections.length > 0) {
      setLoadWarning(`Some sections could not be loaded: ${failedSections.filter((section) => section !== "client profile").join(", ")}. Showing available data.`);
    }

    setLoading(false);
  }, [clientId, fetchJson, readErrorMessage]);

  useEffect(() => { loadData(); }, [loadData]);

  const fetchActivitiesPage = useCallback(async ({
    offset,
    replace,
    requestId,
  }: {
    offset: number;
    replace: boolean;
    requestId: number;
  }) => {
    const params = new URLSearchParams({
      clientId: String(clientId),
      financialYear: selectedFy,
      limit: String(ACTIVITY_PAGE_SIZE),
      offset: String(offset),
      range: activityRange,
    });

    if (activityFilter !== "all") {
      params.set("category", activityFilter);
    }

    const response = await fetch(`/api/activities?${params.toString()}`);
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Unable to load recent activity."));
    }

    const payload = await response.json() as ActivityResponse;
    if (requestId !== activityRequestIdRef.current) return;

    setActivities((current) => replace ? payload.items || [] : [...current, ...(payload.items || [])]);
    setActivitiesTotal(Number(payload.total) || 0);
    setActivityHasMore(Boolean(payload.hasMore));
    setActivityOffset(Number(payload.nextOffset) || 0);
    if (replace) {
      setLatestEmailActivity(payload.latestEmailActivity || null);
    }
    setActivityError(null);
  }, [activityFilter, activityRange, clientId, readErrorMessage, selectedFy]);

  useEffect(() => {
    const requestId = activityRequestIdRef.current + 1;
    activityRequestIdRef.current = requestId;
    setActivities([]);
    setActivitiesTotal(0);
    setActivityHasMore(false);
    setActivityOffset(0);
    setActivityError(null);
    setLatestEmailActivity(null);
    setActivityLoading(true);
    setActivityLoadingMore(false);

    void fetchActivitiesPage({ offset: 0, replace: true, requestId })
      .catch((error) => {
        if (requestId !== activityRequestIdRef.current) return;
        setActivityError(error instanceof Error ? error.message : "Unable to load recent activity.");
      })
      .finally(() => {
        if (requestId !== activityRequestIdRef.current) return;
        setActivityLoading(false);
      });
  }, [fetchActivitiesPage]);

  const loadMoreActivities = useCallback(() => {
    if (activityLoading || activityLoadingMore || !activityHasMore) return;

    const requestId = activityRequestIdRef.current;
    setActivityLoadingMore(true);

    void fetchActivitiesPage({ offset: activityOffset, replace: false, requestId })
      .catch((error) => {
        if (requestId !== activityRequestIdRef.current) return;
        setActivityError(error instanceof Error ? error.message : "Unable to load more recent activity.");
      })
      .finally(() => {
        if (requestId !== activityRequestIdRef.current) return;
        setActivityLoadingMore(false);
      });
  }, [activityHasMore, activityLoading, activityLoadingMore, activityOffset, fetchActivitiesPage]);

  const handleActivityScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceToBottom <= ACTIVITY_SCROLL_THRESHOLD) {
      loadMoreActivities();
    }
  }, [loadMoreActivities]);

  const billing  = allBillings.find((b) => b.financialYear === selectedFy) || null;
  const payments = allPayments.filter((p) => p.financialYear === selectedFy);
  const filteredActivities = activities;
  const recentPayments = React.useMemo(() => {
    const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
    return payments.filter((payment) => new Date(payment.paymentDate).getTime() >= cutoff);
  }, [payments]);
  const recentPaymentsTotal = recentPayments.reduce((sum, payment) => sum + (Number(payment.amountPaid) || 0), 0);
  const lastEmailActivity = latestEmailActivity;
  const billingFormTotal =
    Number(billingForm.govtCharges || 0) +
    Number(billingForm.consultancyCharges || 0) +
    Number(billingForm.targetCharges || 0) +
    Number(billingForm.otherCharges || 0);
  const fyGeneratedTotal = sumFyEntries(fyForm.generated);
  const fyTargetTotal = sumFyEntries(fyForm.targets);

  useEffect(() => {
    if (activityLoading || activityLoadingMore || !activityHasMore || filteredActivities.length === 0) return;

    const lists = [activityTabListRef.current, activityTimelineListRef.current].filter(Boolean) as HTMLDivElement[];
    const shouldPrefetch = lists.some((element) => element.scrollHeight <= element.clientHeight + 8);

    if (shouldPrefetch) {
      loadMoreActivities();
    }
  }, [activityHasMore, activityLoading, activityLoadingMore, filteredActivities.length, loadMoreActivities]);

  useEffect(() => {
    if (!client) return;

    const scrollContainer = document.getElementById("dashboard-scroll-area");
    const headerElement = pageHeaderRef.current;
    if (!scrollContainer || !headerElement) return;

    let frameId = 0;

    const publishContextTitle = (progress: number) => {
      const normalizedProgress = Math.max(0, Math.min(1, progress));
      setHeaderTitleProgress((current) => (
        Math.abs(current - normalizedProgress) < 0.01 ? current : normalizedProgress
      ));

      window.dispatchEvent(new CustomEvent("dashboard:context-title", {
        detail: {
          title: client.companyName,
          subtitle: `${client.clientId} • ${client.category}`,
          progress: normalizedProgress,
        },
      }));
    };

    const updateContextTitle = () => {
      const headerRect = headerElement.getBoundingClientRect();
      const revealStart = 124;
      const revealEnd = 68;
      const nextProgress = (revealStart - headerRect.bottom) / (revealStart - revealEnd);
      publishContextTitle(nextProgress);
    };

    const handleScroll = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(updateContextTitle);
    };

    updateContextTitle();
    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      scrollContainer.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      window.dispatchEvent(new CustomEvent("dashboard:context-title", { detail: null }));
    };
  }, [client]);

  const closeDocumentModal = () => {
    setDocModal(false);
    setDocModalMode("create");
    setEditingDocumentId(null);
    setDocForm({ documentName: "", driveLink: "" });
  };

  const openCreateDocument = () => {
    setDocModalMode("create");
    setEditingDocumentId(null);
    setDocForm({ documentName: "", driveLink: "" });
    setDocModal(true);
  };

  const openEditDocument = (document: Document) => {
    setDocModalMode("edit");
    setEditingDocumentId(document._id);
    setDocForm({ documentName: document.documentName, driveLink: document.driveLink });
    setDocModal(true);
  };

  const saveDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineSaving(true);
    try {
      const existingDocument = editingDocumentId
        ? documents.find((document) => document._id === editingDocumentId)
        : null;
      const response = await fetch(
        editingDocumentId ? `/api/documents/${editingDocumentId}` : "/api/documents",
        {
          method: editingDocumentId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...docForm,
            clientId,
            uploadedDate: existingDocument?.uploadedDate || new Date(),
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        toast.error(data?.error || `Failed to ${editingDocumentId ? "update" : "add"} document.`);
        return;
      }

      closeDocumentModal();
      await loadData();
      toast.success(editingDocumentId ? "Document updated!" : "Document added!");
    } finally {
      setInlineSaving(false);
    }
  };

  const deleteDocument = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    setBusyAction(`document-${id}`);
    try {
      const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!response.ok) {
        toast.error("Failed to remove document.");
        return;
      }
      await loadData();
      toast.success("Document removed");
    } finally {
      setBusyAction(null);
    }
  };

  const closeBillingModal = () => {
    setBillingModal(false);
    setEditingBillingId(null);
    setBillingForm({
      financialYear: selectedFy,
      govtCharges: "0",
      consultancyCharges: "0",
      targetCharges: "0",
      otherCharges: "0",
      notes: "",
    });
  };

  const openBillingModalForRecord = (record?: Billing | null) => {
    if (record) {
      setEditingBillingId(record._id);
      setBillingForm({
        financialYear: record.financialYear,
        govtCharges: String(record.govtCharges || 0),
        consultancyCharges: String(record.consultancyCharges || 0),
        targetCharges: String(record.targetCharges || 0),
        otherCharges: String(record.otherCharges || 0),
        notes: record.notes || "",
      });
    } else {
      setEditingBillingId(null);
      setBillingForm({
        financialYear: selectedFy,
        govtCharges: "0",
        consultancyCharges: "0",
        targetCharges: "0",
        otherCharges: "0",
        notes: "",
      });
    }
    setBillingModal(true);
  };

  const saveBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineSaving(true);
    try {
      const payload = {
        clientId,
        financialYear: billingForm.financialYear,
        govtCharges: Number(billingForm.govtCharges) || 0,
        consultancyCharges: Number(billingForm.consultancyCharges) || 0,
        targetCharges: Number(billingForm.targetCharges) || 0,
        otherCharges: Number(billingForm.otherCharges) || 0,
        notes: billingForm.notes.trim(),
      };
      const response = await fetch(
        editingBillingId ? `/api/billing/${editingBillingId}` : "/api/billing",
        {
          method: editingBillingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        toast.error(data?.error || `Failed to ${editingBillingId ? "update" : "save"} billing.`);
        return;
      }

      closeBillingModal();
      await loadData();
      setSelectedFy(payload.financialYear);
      toast.success(editingBillingId ? "Billing updated!" : "Billing saved!");
    } finally {
      setInlineSaving(false);
    }
  };

  const deleteBilling = async (record: Billing) => {
    if (!confirm(`Move billing for FY ${record.financialYear} to recycle bin?`)) return;
    setBusyAction(`billing-${record._id}`);
    try {
      const response = await fetch(`/api/billing/${record._id}`, { method: "DELETE" });
      if (!response.ok) {
        toast.error("Failed to remove billing.");
        return;
      }
      await loadData();
      toast.success("Billing moved to recycle bin");
    } finally {
      setBusyAction(null);
    }
  };

  const closePaymentModal = () => {
    setPaymentModal(false);
    setEditingPaymentId(null);
    setPaymentForm({
      financialYear: selectedFy,
      paymentType: billing ? "billing" : "advance",
      amountPaid: "",
      paymentDate: todayInputValue(),
      paymentMode: PAYMENT_MODES[0] || "NEFT",
      referenceNumber: "",
      notes: "",
    });
  };

  const openPaymentModalForRecord = (record?: Payment | null) => {
    if (record) {
      setEditingPaymentId(record._id);
      setPaymentForm({
        financialYear: record.financialYear || selectedFy,
        paymentType: record.paymentType === "advance" ? "advance" : "billing",
        amountPaid: String(record.amountPaid || ""),
        paymentDate: record.paymentDate ? new Date(record.paymentDate).toISOString().slice(0, 10) : todayInputValue(),
        paymentMode: record.paymentMode || PAYMENT_MODES[0] || "NEFT",
        referenceNumber: record.referenceNumber || "",
        notes: record.notes || "",
      });
    } else {
      setEditingPaymentId(null);
      setPaymentForm({
        financialYear: selectedFy,
        paymentType: billing ? "billing" : "advance",
        amountPaid: "",
        paymentDate: todayInputValue(),
        paymentMode: PAYMENT_MODES[0] || "NEFT",
        referenceNumber: "",
        notes: "",
      });
    }
    setPaymentModal(true);
  };

  const savePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineSaving(true);
    try {
      const payload = {
        clientId,
        financialYear: paymentForm.financialYear,
        paymentType: paymentForm.paymentType,
        amountPaid: Number(paymentForm.amountPaid),
        paymentDate: paymentForm.paymentDate,
        paymentMode: paymentForm.paymentMode,
        referenceNumber: paymentForm.referenceNumber.trim(),
        notes: paymentForm.notes.trim(),
      };
      const response = await fetch(
        editingPaymentId ? `/api/payments/${editingPaymentId}` : "/api/payments",
        {
          method: editingPaymentId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        toast.error(data?.error || `Failed to ${editingPaymentId ? "update" : "record"} payment.`);
        return;
      }

      closePaymentModal();
      await loadData();
      setSelectedFy(payload.financialYear);
      toast.success(editingPaymentId ? "Payment updated!" : "Payment recorded!");
    } finally {
      setInlineSaving(false);
    }
  };

  const deletePayment = async (paymentId: string) => {
    if (!confirm("Move this payment to recycle bin?")) return;
    setBusyAction(`payment-${paymentId}`);
    try {
      const response = await fetch(`/api/payments/${paymentId}`, { method: "DELETE" });
      if (!response.ok) {
        toast.error("Failed to remove payment.");
        return;
      }
      await loadData();
      toast.success("Payment moved to recycle bin");
    } finally {
      setBusyAction(null);
    }
  };

  const closeFyModal = () => {
    setFyModal(false);
    setFyForm({
      financialYear: selectedFy,
      generated: createEmptyFyEntries(),
      targets: createEmptyFyEntries(),
    });
  };

  const openFYModal = (record?: FYRecord | null) => {
    const targetRecord = record || fyRecords.find((entry) => entry.financialYear === selectedFy) || null;
    setFyForm({
      financialYear: targetRecord?.financialYear || selectedFy,
      generated: buildFyEntries(targetRecord?.generated),
      targets: buildFyEntries(targetRecord?.targets),
    });
    setFyModal(true);
  };

  const updateFyEntry = (section: "generated" | "targets", categoryId: string, type: "RECYCLING" | "EOL", value: string) => {
    setFyForm((current) => ({
      ...current,
      [section]: current[section].map((entry) => (
        entry.categoryId === categoryId && entry.type === type
          ? { ...entry, value }
          : entry
      )),
    }));
  };

  const saveFY = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineSaving(true);
    try {
      const payload = {
        clientId,
        financialYear: fyForm.financialYear,
        generated: isPWP
          ? fyForm.generated.map((entry) => ({ ...entry, value: Number(entry.value) || 0 }))
          : [],
        targets: !isPWP && !isSIMP
          ? fyForm.targets.map((entry) => ({ ...entry, value: Number(entry.value) || 0 }))
          : [],
      };

      const response = await fetch("/api/financial-year", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        toast.error(data?.error || "Failed to save financial year data.");
        return;
      }

      closeFyModal();
      await loadData();
      setSelectedFy(payload.financialYear);
      invalidate("/api/financial-year", "/api/dashboard", "/api/activities");
      toast.success(isPWP ? "Credit data saved!" : "FY data saved!");
    } finally {
      setInlineSaving(false);
    }
  };

  const closeReminderModal = () => {
    setReminderModal(false);
    setActiveReminderBillingId(null);
    setReminderRecipients([]);
    setReminderSuggestions([]);
    setReminderSuggestionCatalog([]);
    setCustomReminderEmail("");
    setReminderForm({ subject: "", message: "" });
    setReminderPreviewHtml(null);
  };

  const openReminderModal = async (targetBilling?: Billing | null) => {
    const reminderBilling = targetBilling || billing;
    if (!reminderBilling || !client) {
      toast.error("Create billing first before sending a reminder.");
      return;
    }

    const { selected, suggestions } = buildLinkedContactEmailOptions(client.contacts || []);
    const companyName = client.companyName || reminderBilling.clientId;

    setActiveReminderBillingId(reminderBilling._id);
    setReminderRecipients(selected);
    setReminderSuggestions(suggestions);
    setReminderSuggestionCatalog(suggestions);
    setCustomReminderEmail("");
    setReminderForm({
      subject: `Payment Reminder — ${companyName} — FY ${reminderBilling.financialYear}`,
      message: "",
    });

    try {
      const templateResponse = await fetch("/api/email/template?name=payment-reminder");
      const data = await templateResponse.json();
      const template = typeof data?.html === "string" ? data.html : "";
      if (!template) {
        setReminderPreviewHtml(null);
      } else {
        const fmt = (value: number) => value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const breakdownRows = [
          reminderBilling.govtCharges > 0 ? `<tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;">Govt Charges</td><td style="padding:8px 12px;font-size:13px;color:#374151;font-weight:600;text-align:right;">₹${fmt(reminderBilling.govtCharges)}</td></tr>` : "",
          reminderBilling.consultancyCharges > 0 ? `<tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;">Consultancy Charges</td><td style="padding:8px 12px;font-size:13px;color:#374151;font-weight:600;text-align:right;">₹${fmt(reminderBilling.consultancyCharges)}</td></tr>` : "",
          reminderBilling.targetCharges > 0 ? `<tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;">Target Charges</td><td style="padding:8px 12px;font-size:13px;color:#374151;font-weight:600;text-align:right;">₹${fmt(reminderBilling.targetCharges)}</td></tr>` : "",
          reminderBilling.otherCharges > 0 ? `<tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;">Other Charges</td><td style="padding:8px 12px;font-size:13px;color:#374151;font-weight:600;text-align:right;">₹${fmt(reminderBilling.otherCharges)}</td></tr>` : "",
        ].join("");

        setReminderPreviewHtml(
          template
            .replace(/{{clientName}}/g, companyName)
            .replace(/{{financialYear}}/g, reminderBilling.financialYear)
            .replace(/{{pendingAmount}}/g, fmt(reminderBilling.pendingAmount))
            .replace(/{{totalAmount}}/g, fmt(reminderBilling.totalAmount))
            .replace(/{{totalPaid}}/g, fmt(reminderBilling.totalPaid))
            .replace(/{{breakdownRows}}/g, breakdownRows)
        );
      }
    } catch {
      setReminderPreviewHtml(null);
    }

    setReminderModal(true);
  };

  const addCustomReminderEmail = () => {
    const email = customReminderEmail.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Invalid email address");
      return;
    }
    if (reminderRecipients.some((entry) => entry.email === email)) {
      toast.error("Already added");
      return;
    }
    setReminderRecipients((current) => [...current, { label: email, email }]);
    setCustomReminderEmail("");
  };

  const addSuggestedReminderRecipient = (suggestion: EmailOption) => {
    if (reminderRecipients.some((entry) => entry.email === suggestion.email)) return;
    setReminderRecipients((current) => [...current, suggestion]);
    setReminderSuggestions((current) => current.filter((entry) => entry.email !== suggestion.email));
  };

  const removeReminderRecipient = (email: string) => {
    setReminderRecipients((current) => current.filter((entry) => entry.email !== email));
    setReminderSuggestions((current) => restoreSuggestion(email, current, reminderSuggestionCatalog));
  };

  const sendReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reminderRecipients.length === 0) {
      toast.error("Add at least one recipient");
      return;
    }

    const reminderBilling = allBillings.find((entry) => entry._id === activeReminderBillingId) || billing;
    if (!reminderBilling || !client) {
      toast.error("Billing context is no longer available.");
      return;
    }

    setReminderSending(true);
    try {
      const results = await Promise.all(
        reminderRecipients.map((recipient) =>
          fetch("/api/email/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: recipient.email,
              subject: reminderForm.subject,
              ...(reminderPreviewHtml ? { reminderHtml: reminderPreviewHtml } : { message: reminderForm.message }),
              logType: "payment_reminder",
              logClientId: reminderBilling.clientId,
              logClientName: client.companyName,
              logFy: reminderBilling.financialYear,
            }),
          }).then((response) => response.json())
        )
      );

      const failed = results.filter((result) => !result.success);
      if (failed.length > 0) {
        toast.error(`${failed.length} email(s) failed`);
        return;
      }

      closeReminderModal();
      await loadData();
      toast.success(`Reminder sent to ${reminderRecipients.length} recipient${reminderRecipients.length === 1 ? "" : "s"}!`);
    } finally {
      setReminderSending(false);
    }
  };

  const handleActivityAction = (activity: ActivityItem) => {
    if (activity.entityType === "billing") {
      const targetBilling = allBillings.find((record) => record._id === activity.entityId);
      if (targetBilling) {
        setSelectedFy(targetBilling.financialYear);
        openBillingModalForRecord(targetBilling);
      }
      return;
    }

    if (activity.entityType === "payment") {
      const targetPayment = allPayments.find((record) => record._id === activity.entityId);
      if (targetPayment) {
        setSelectedFy(targetPayment.financialYear || selectedFy);
        openPaymentModalForRecord(targetPayment);
      }
      return;
    }

    if (activity.entityType === "email") {
      router.push(`/dashboard/email-history?clientId=${encodeURIComponent(clientId)}`);
      return;
    }

    if (activity.entityType === "financial-year") {
      openFYModal(fyRecords.find((record) => record._id === activity.entityId) || fyData || null);
      return;
    }

    if (activity.entityType === "trash") {
      const query = new URLSearchParams();
      if (activity.recordType) query.set("type", activity.recordType);
      if (activity.actionSearch) query.set("search", activity.actionSearch);
      router.push(`/dashboard/trash${query.toString() ? `?${query.toString()}` : ""}`);
    }
  };

  // Open edit modal pre-filled with current client data
  const openEdit = () => {
    if (!client) return;
    setEditForm({
      companyName: client.companyName,
      category: client.category,
      state: client.state,
      address: client.address || "",
      gstNumber: client.gstNumber || "",
      registrationNumber: client.registrationNumber || "",
      cpcbLoginId: client.cpcbLoginId || "",
      cpcbPassword: client.cpcbPassword || "",
      otpMobileNumber: client.otpMobileNumber || "",
    });
    const existingPersons = (client.contacts || []).map((contact, index) => createPersonEntry({
      ...contact,
      personId: contact.personId || contact._id,
      designation: contact.designation || "",
      isPrimaryContact: contact.isPrimaryContact || index === 0,
    }));
    setPersons(existingPersons.length > 0 ? existingPersons : [emptyPersonEntry()]);
    setRemovedPersonIds([]);
    setEditTab("basic");
    setShowEditPassword(false);
    setEditModal(true);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const validPersons: PersonEntry[] = [];

      for (const person of persons) {
        const hasAnyContent = Boolean(
          person.name.trim() ||
          person.designation.trim() ||
          person.phoneNumbers.some((phone) => phone.trim()) ||
          person.emails.some((email) => email.trim())
        );

        if (!hasAnyContent) continue;

        const prepared = syncEntrySelections({
          ...person,
          name: person.name.trim(),
          phoneNumbers: normalizePhoneList(person.phoneNumbers),
          emails: normalizeEmailList(person.emails),
          selectedPhones: person.selectedPhones,
          selectedEmails: person.selectedEmails,
        });

        if (!prepared.name) {
          toast.error("Each linked contact needs a name.");
          return;
        }

        if (prepared.phoneNumbers.length === 0 && prepared.emails.length === 0) {
          toast.error(`Contact "${prepared.name}" needs at least one phone number or email.`);
          return;
        }

        if (prepared.selectedPhones.length === 0 && prepared.selectedEmails.length === 0) {
          toast.error(`Select at least one phone or email for "${prepared.name}".`);
          return;
        }

        validPersons.push(prepared);
      }

      const r = await fetch(`/api/clients/${clientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editForm, persons: validPersons, removedPersonIds }),
      });
      if (!r.ok) { toast.error("Failed to save"); return; }
      const updated = await r.json();
      // Merge updated fields into client state — no reload needed
      setClient((prev) => prev ? { ...prev, ...updated } : prev);
      // If contacts changed, refetch full client to get populated contacts array
      const refreshed = await fetch(`/api/clients/${clientId}`).then((x) => x.json());
      setClient(refreshed);
      // Invalidate clients list cache so list page shows updated name/category
      invalidate("/api/clients");
      setEditModal(false);
      toast.success("Client updated!");
    } finally {
      setSaving(false);
    }
  };

  const addPerson = () => {
    setPersons((prev) => {
      const hasPrimary = prev.some((entry) => entry.isPrimaryContact);
      return [...prev, { ...emptyPersonEntry(), isPrimaryContact: !hasPrimary }];
    });
  };

  const removePerson = (index: number) => {
    setPersons((prev) => {
      const target = prev[index];
      if (target?.personId) {
        setRemovedPersonIds((current) => (
          current.includes(target.personId!) ? current : [...current, target.personId!]
        ));
      }

      const next = prev.filter((_, currentIndex) => currentIndex !== index);
      if (next.length === 0) return [emptyPersonEntry()];
      if (!next.some((entry) => entry.isPrimaryContact)) {
        next[0] = { ...next[0], isPrimaryContact: true };
      }
      return next;
    });
  };

  const updatePerson = (index: number, updated: PersonEntry) => {
    setPersons((prev) => prev.map((entry, currentIndex) => (
      currentIndex === index ? syncEntrySelections(updated) : entry
    )));
  };

  const setPrimary = (index: number) => {
    setPersons((prev) => prev.map((entry, currentIndex) => ({
      ...entry,
      isPrimaryContact: currentIndex === index,
    })));
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner /></div>;
  if (loadError && !client) return (
    <div className="text-center py-20 max-w-md mx-auto">
      <p className="text-default font-semibold mb-2">Unable to load client profile</p>
      <p className="text-sm text-faint mb-5">{loadError}</p>
      <div className="flex items-center justify-center gap-2">
        <button onClick={() => loadData()} className="btn-primary">Retry</button>
        <button onClick={() => router.back()} className="btn-secondary">Go Back</button>
      </div>
    </div>
  );
  if (!client) return (
    <div className="text-center py-20">
      <p className="text-faint mb-4">Client not found</p>
      <button onClick={() => router.back()} className="btn-secondary">Go Back</button>
    </div>
  );

  const isPWP  = client.category === "PWP";
  const isSIMP = client.category === "SIMP";
  const fyData = fyRecords.find((r) => r.financialYear === selectedFy);
  const fyLastUpdated = fyData ? getLatestTimestamp(fyData.updatedAt, fyData.createdAt) : "";
  const billingLastUpdated = billing ? getLatestTimestamp(billing.updatedAt, billing.createdAt) : "";
  const portalLastUpdated = getLatestTimestamp(client.updatedAt, client.createdAt);

  const primaryContact  = client.contacts?.[0] ?? null;
  const primaryContactPhones = getContactPhones(primaryContact || undefined);
  const primaryContactEmails = getContactEmails(primaryContact || undefined);
  const contactName     = primaryContact?.name || "—";
  const contactMobile   = primaryContactPhones[0] || "—";
  const contactEmail    = primaryContactEmails[0] || "—";
  const contactDesig    = primaryContact?.designation || "";

  const latestPayment = payments[0] || null;
  const hasLinkedContacts = (client.contacts?.length ?? 0) > 0;
  const emptyStateActions = [
    !isSIMP && !fyData
      ? {
          label: isPWP ? "Add Credit Data" : "Add FY Data",
          onClick: () => openFYModal(),
          tone: "secondary" as const,
        }
      : null,
    !billing
      ? {
          label: "Create Billing",
          onClick: () => openBillingModalForRecord(),
          tone: "primary" as const,
        }
      : null,
    billing && billing.pendingAmount > 0
      ? {
          label: "Send Reminder",
          onClick: () => openReminderModal(),
          tone: "secondary" as const,
        }
      : null,
    {
      label: "Add Document",
      onClick: openCreateDocument,
      tone: "secondary" as const,
    },
    !hasLinkedContacts
      ? {
          label: "Link Contact",
          onClick: openEdit,
          tone: "secondary" as const,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; onClick: () => void; tone: "primary" | "secondary" }>;
  const topStats = [
    {
      label: "Current FY Billing",
      value: formatCurrency(billing?.totalAmount || 0),
      sub: billing ? `FY ${selectedFy}` : `No billing for FY ${selectedFy}`,
      accent: "text-default",
      actionLabel: billing ? "Edit billing" : "Create billing",
      onClick: () => openBillingModalForRecord(billing),
      icon: <Receipt className="w-4 h-4" />,
    },
    {
      label: "Paid",
      value: formatCurrency(billing?.totalPaid || 0),
      sub: payments.length > 0 ? `${payments.length} payment${payments.length === 1 ? "" : "s"} in FY ${selectedFy}` : `No payments in FY ${selectedFy}`,
      accent: "text-emerald-600 dark:text-emerald-400",
      actionLabel: latestPayment ? "Open latest payment" : "Record payment",
      onClick: () => latestPayment ? openPaymentModalForRecord(latestPayment) : openPaymentModalForRecord(),
      icon: <Wallet className="w-4 h-4" />,
    },
    {
      label: "Pending",
      value: formatCurrency(billing?.pendingAmount || 0),
      sub: billing ? `${billing.paymentStatus} status` : "Waiting for first billing",
      accent: billing && billing.pendingAmount > 0 ? "text-red-500" : "text-default",
      actionLabel: billing ? "Open billing" : "Create billing",
      onClick: () => openBillingModalForRecord(billing),
      icon: <Target className="w-4 h-4" />,
    },
    {
      label: "Recent Payments",
      value: recentPayments.length.toLocaleString("en-IN"),
      sub: recentPayments.length > 0 ? `${formatCurrency(recentPaymentsTotal)} in last 30 days` : "No recent payments in selected FY",
      accent: "text-default",
      actionLabel: latestPayment ? "Open latest payment" : "Add payment",
      onClick: () => latestPayment ? openPaymentModalForRecord(latestPayment) : openPaymentModalForRecord(),
      icon: <Activity className="w-4 h-4" />,
    },
    {
      label: "Last Email Activity",
      value: lastEmailActivity ? formatDate(lastEmailActivity.date) : "No emails yet",
      sub: lastEmailActivity ? lastEmailActivity.label : "Open email history to review drafts and reminders",
      accent: "text-default",
      actionLabel: "Open email history",
      onClick: () => router.push(`/dashboard/email-history?clientId=${encodeURIComponent(clientId)}`),
      icon: <MailCheck className="w-4 h-4" />,
    },
  ];
  const getActivityActionLabel = (activity: ActivityItem) => {
    if (activity.entityType === "billing") return "Open Billing";
    if (activity.entityType === "payment") return "Open Payment";
    if (activity.entityType === "financial-year") return "Open FY";
    if (activity.entityType === "email") return "Open Emails";
    if (activity.entityType === "trash") return "Open Recycle Bin";
    return null;
  };
  const selectedActivityRangeLabel = ACTIVITY_RANGES.find((range) => range.id === activityRange)?.label || "Last Month";
  const activityWindowHelpText = activityRange === "year"
    ? `Showing the full activity history available for FY ${selectedFy}.`
    : `Showing activity from the ${selectedActivityRangeLabel.toLowerCase()} within FY ${selectedFy}.`;
  const activityEmptyText = activityRange === "year"
    ? `No activity recorded for this filter in FY ${selectedFy}`
    : `No activity recorded in the ${selectedActivityRangeLabel.toLowerCase()} for this filter`;
  const getActivityFyChip = (activity: ActivityItem) => {
    if (activity.financialYear === selectedFy) {
      return {
        label: `FY ${selectedFy}`,
        className: "bg-brand-100 text-brand-700 dark:bg-brand-900/35 dark:text-brand-300",
      };
    }

    return {
      label: "All FY",
      className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    };
  };

  const TabBtn = ({ id, label, icon }: { id: "info" | "portal" | "activity"; label: string; icon: React.ReactNode }) => (
    <button onClick={() => setActiveTab(id)}
      className={`flex-1 py-3 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${activeTab === id ? "bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 border-b-2 border-brand-600" : "text-faint hover:text-muted"}`}>
      {icon}{label}
    </button>
  );

  const ActivityFilterChips = ({ compact = false }: { compact?: boolean }) => (
    <div className={compact ? "mb-3" : "mb-4"}>
      <FilterRail
        label="Type"
        value={activityFilter}
        options={ACTIVITY_FILTERS}
        onChange={setActivityFilter}
        tone="brand"
        dense={compact}
      />
    </div>
  );

  const ActivityRangeChips = ({ compact = false }: { compact?: boolean }) => (
    <div className={compact ? "mb-3" : "mb-4"}>
      <FilterRail
        label="Window"
        value={activityRange}
        options={ACTIVITY_RANGES}
        onChange={setActivityRange}
        tone="neutral"
        dense={compact}
      />
    </div>
  );

  // Build breakdown rows from fyData
  const makeBreakdownRows = (rec: FYRecord) => {
    const pw = client.category === "PWP";
    return [
      { label: "CAT-I",   base: pw ? (rec.cat1Generated ?? rec.creditsCat1 ?? 0) : (rec.cat1Target ?? rec.targetCat1 ?? 0), used: pw ? (rec.soldCat1 ?? rec.usedCat1 ?? 0) : (rec.achievedCat1 ?? 0) },
      { label: "CAT-II",  base: pw ? (rec.cat2Generated ?? rec.creditsCat2 ?? 0) : (rec.cat2Target ?? rec.targetCat2 ?? 0), used: pw ? (rec.soldCat2 ?? rec.usedCat2 ?? 0) : (rec.achievedCat2 ?? 0) },
      { label: "CAT-III", base: pw ? (rec.cat3Generated ?? rec.creditsCat3 ?? 0) : (rec.cat3Target ?? rec.targetCat3 ?? 0), used: pw ? (rec.soldCat3 ?? rec.usedCat3 ?? 0) : (rec.achievedCat3 ?? 0) },
      { label: "CAT-IV",  base: pw ? (rec.cat4Generated ?? rec.creditsCat4 ?? 0) : (rec.cat4Target ?? rec.targetCat4 ?? 0), used: pw ? (rec.soldCat4 ?? rec.usedCat4 ?? 0) : (rec.achievedCat4 ?? 0) },
    ];
  };

  const pageTitleStyle = {
    transform: `translateY(${-6 * headerTitleProgress}px) scale(${1 - (0.08 * headerTitleProgress)})`,
    opacity: 1 - (0.45 * headerTitleProgress),
    filter: `blur(${headerTitleProgress * 2}px)`,
  } as const;

  return (
    <div>
      {loadWarning && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
          {loadWarning}
        </div>
      )}

      {/* Header */}
      <div ref={pageHeaderRef} className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="btn-secondary !px-3"><ArrowLeft className="w-4 h-4" /></button>
        <div
          className="flex-1 min-w-0 transition-[opacity,transform,filter] duration-300 ease-out will-change-transform"
          style={pageTitleStyle}
        >
          <h1 className="text-2xl font-bold text-default truncate">{client.companyName}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-flex items-center gap-1.5 font-mono text-xs bg-surface px-2 py-0.5 rounded">
              {client.clientId}
              <CopyButton
                copied={copiedKey === "client-id"}
                label="client ID"
                onClick={() => handleCopy(client.clientId, "client-id", "Client ID")}
                className="h-5 w-5 border-0 bg-transparent"
              />
            </span>
            <CategoryBadge category={client.category} />
          </div>
        </div>
        {/* Edit button in header */}
        <button onClick={openEdit} className="btn-secondary flex items-center gap-1.5">
          <Pencil className="w-4 h-4" /> Edit Client
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        {topStats.map((stat) => (
          <div key={stat.label} className="bg-card rounded-2xl border border-base p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center text-brand-600">
                {stat.icon}
              </div>
              <button type="button" onClick={stat.onClick} className="text-[11px] font-medium text-brand-600 hover:text-brand-700">
                {stat.actionLabel}
              </button>
            </div>
            <p className="text-xs text-muted mt-3">{stat.label}</p>
            <p className={`text-lg font-bold mt-1 ${stat.accent}`}>{stat.value}</p>
            <p className="text-xs text-faint mt-1 line-clamp-2">{stat.sub}</p>
          </div>
        ))}
      </div>

      {emptyStateActions.length > 0 && (
        <div className="bg-card rounded-2xl border border-base p-4 shadow-sm mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="font-semibold text-default">Quick Actions</p>
              <p className="text-sm text-muted">
                {isPWP
                  ? "Set up credits, billing, documents, and contacts for this client from here."
                  : "Set up FY data, billing, reminders, documents, and contacts for this client from here."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {emptyStateActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className={action.tone === "primary" ? "btn-primary !py-2 !text-xs" : "btn-secondary !py-2 !text-xs"}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── LEFT ── */}
        <div className="space-y-4 lg:sticky lg:top-0 lg:self-start">

          {/* Tabbed info card */}
          <div className="bg-card rounded-2xl shadow-sm border border-base overflow-hidden">
            <div className="flex border-b border-base">
              <TabBtn id="info"     label="Info"     icon={<User className="w-3.5 h-3.5" />} />
              <TabBtn id="portal"   label="Portal"   icon={<Shield className="w-3.5 h-3.5" />} />
              <TabBtn id="activity" label="Activity" icon={<Zap className="w-3.5 h-3.5" />} />
            </div>

            {activeTab === "info" && (
              <div className="p-5 space-y-3">
                <InfoRow icon={<User className="w-4 h-4" />}    label="Contact Person" value={contactName} sub={contactDesig} />
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <InfoRow icon={<Phone className="w-4 h-4" />} label="Mobile" value={contactMobile} mono />
                  </div>
                  {contactMobile !== "â€”" && (
                    <CopyButton
                      copied={copiedKey === "primary-phone"}
                      label="primary contact mobile"
                      onClick={() => handleCopy(contactMobile, "primary-phone", "Primary contact mobile")}
                    />
                  )}
                </div>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <InfoRow icon={<Mail className="w-4 h-4" />} label="Email" value={contactEmail} mono />
                  </div>
                  {contactEmail !== "â€”" && (
                    <CopyButton
                      copied={copiedKey === "primary-email"}
                      label="primary contact email"
                      onClick={() => handleCopy(contactEmail, "primary-email", "Primary contact email")}
                    />
                  )}
                </div>
                {(client.contacts?.length ?? 0) > 0 && (
                  <div className="pt-1 border-t border-soft">
                    <CollapsibleSectionHeader
                      title={`Contacts (${client.contacts!.length})`}
                      subtitle="Collapse linked contacts when you only need the company summary."
                      open={sectionOpen.contacts}
                      onToggle={() => toggleSection("contacts")}
                    />
                    {sectionOpen.contacts && (
                      <div className="space-y-2 mt-3">
                        {client.contacts!.map((c, contactIndex) => (
                          <div key={c._id} className="bg-surface rounded-xl px-3 py-2.5 border border-base/60">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold text-default">{c.name}</p>
                                {c.designation && <p className="text-xs text-faint">{c.designation}</p>}
                              </div>
                              {contactIndex === 0 && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/35 dark:text-brand-300">
                                  Primary
                                </span>
                              )}
                            </div>
                            <div className="mt-2 space-y-1.5">
                              {getContactPhones(c).map((phone, idx) => (
                                <div key={`phone-${idx}`} className="flex items-center gap-2 text-xs text-muted">
                                  <span className="font-mono flex-1 min-w-0 truncate">{phone}</span>
                                  <CopyButton
                                    copied={copiedKey === `contact-phone-${c._id}-${idx}`}
                                    label={`${c.name} phone`}
                                    onClick={() => handleCopy(phone, `contact-phone-${c._id}-${idx}`, `${c.name} phone`)}
                                  />
                                </div>
                              ))}
                              {getContactEmails(c).map((email, idx) => (
                                <div key={`email-${idx}`} className="flex items-center gap-2 text-xs text-muted">
                                  <span className="flex-1 min-w-0 truncate">{email}</span>
                                  <CopyButton
                                    copied={copiedKey === `contact-email-${c._id}-${idx}`}
                                    label={`${c.name} email`}
                                    onClick={() => handleCopy(email, `contact-email-${c._id}-${idx}`, `${c.name} email`)}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <InfoRow icon={<MapPin className="w-4 h-4" />}    label="State"           value={client.state} />
                {client.address        && <InfoRow icon={<Building2 className="w-4 h-4" />} label="Address"         value={client.address} />}
                {client.gstNumber && (
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <InfoRow icon={<Hash className="w-4 h-4" />} label="GST Number" value={client.gstNumber} mono />
                    </div>
                    <CopyButton
                      copied={copiedKey === "gst"}
                      label="GST number"
                      onClick={() => handleCopy(client.gstNumber || "", "gst", "GST number")}
                    />
                  </div>
                )}
                {client.registrationNumber && <InfoRow icon={<FileText className="w-4 h-4" />} label="Registration No." value={client.registrationNumber} mono />}
                <div className="pt-3 border-t border-soft flex items-center justify-between">
                  <div>
                    <p className="text-xs text-faint">Added {formatDate(client.createdAt)}</p>
                    <p className="text-[11px] text-faint mt-0.5">Last updated {formatDateTime(getLatestTimestamp(client.updatedAt, client.createdAt))}</p>
                  </div>
                  <button onClick={openEdit} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                </div>
              </div>
            )}

            {activeTab === "portal" && (
              <div className="p-5 space-y-3">
                <CollapsibleSectionHeader
                  title="Portal Credentials"
                  subtitle={portalLastUpdated ? `Last profile update ${formatDateTime(portalLastUpdated)}` : "Portal details are stored on the client profile."}
                  open={sectionOpen.portal}
                  onToggle={() => toggleSection("portal")}
                />
                {sectionOpen.portal && (
                  <>
                {!client.cpcbLoginId && !client.cpcbPassword && !client.otpMobileNumber ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-faint mb-3">No portal credentials saved.</p>
                    <button onClick={() => { openEdit(); setEditTab("portal"); }}
                      className="btn-secondary !text-xs">
                      <Plus className="w-3 h-3" /> Add Credentials
                    </button>
                  </div>
                ) : (
                  <>
                    {client.cpcbLoginId && (
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <InfoRow icon={<User className="w-4 h-4" />} label="CPCB Login ID" value={client.cpcbLoginId} mono />
                        </div>
                        <CopyButton
                          copied={copiedKey === "portal-login"}
                          label="CPCB login ID"
                          onClick={() => handleCopy(client.cpcbLoginId || "", "portal-login", "CPCB login ID")}
                        />
                      </div>
                    )}
                    {client.cpcbPassword  && (
                      <div className="flex items-start gap-3 text-sm">
                        <Lock className="w-4 h-4 text-faint mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-muted text-xs">CPCB Password</p>
                          <div className="flex items-center gap-2">
                            <p className="font-mono font-medium">{showPassword ? client.cpcbPassword : "••••••••"}</p>
                            <button onClick={() => setShowPassword(!showPassword)} className="text-xs text-brand-600 hover:underline">{showPassword ? "Hide" : "Show"}</button>
                          </div>
                        </div>
                      </div>
                    )}
                    {client.cpcbPassword && (
                      <div className="flex justify-end -mt-1">
                        <CopyButton
                          copied={copiedKey === "portal-password"}
                          label="portal password"
                          onClick={() => handleCopy(client.cpcbPassword || "", "portal-password", "Portal password")}
                        />
                      </div>
                    )}
                    {client.otpMobileNumber && (
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <InfoRow icon={<Smartphone className="w-4 h-4" />} label="OTP Mobile" value={client.otpMobileNumber} mono />
                        </div>
                        <CopyButton
                          copied={copiedKey === "portal-otp-mobile"}
                          label="OTP mobile"
                          onClick={() => handleCopy(client.otpMobileNumber || "", "portal-otp-mobile", "OTP mobile")}
                        />
                      </div>
                    )}
                  </>
                )}
                <div className="pt-3 border-t border-soft">
                  <button onClick={() => { openEdit(); setTimeout(() => setEditTab("portal"), 50); }}
                    className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                    <Pencil className="w-3 h-3" /> Edit credentials
                  </button>
                </div>
                  </>
                )}
              </div>
            )}

            {activeTab === "activity" && (
              <div className="p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="text-xs text-faint">
                    Showing {filteredActivities.length} of {activitiesTotal.toLocaleString("en-IN")} events
                  </p>
                </div>
                <ActivityRangeChips compact />
                <ActivityFilterChips compact />
                <p className="text-xs text-faint mb-3">{activityWindowHelpText} FY-tagged events are highlighted and all-year events are marked All FY.</p>
                {activityError ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
                    {activityError}
                  </div>
                ) : activityLoading ? (
                  <div className="py-8 flex items-center justify-center">
                    <LoadingSpinner />
                  </div>
                ) : filteredActivities.length === 0 ? (
                  <p className="text-sm text-faint text-center py-6">{activityEmptyText}</p>
                ) : (
                  <div ref={activityTabListRef} onScroll={handleActivityScroll} className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                    {filteredActivities.map((act) => (
                      <div
                        key={act.id}
                        className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${
                          act.financialYear === selectedFy
                            ? "border-brand-200 bg-brand-50/50 dark:border-brand-900/50 dark:bg-brand-900/10"
                            : "border-dashed border-base bg-surface/70"
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${activityColors[act.color] || "bg-surface text-muted"}`}>
                          {activityIcon(act.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-default">{act.label}</p>
                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${getActivityFyChip(act).className}`}>{getActivityFyChip(act).label}</span>
                              {act.badge && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${act.badgeColor || "bg-surface text-muted"}`}>{act.badge}</span>}
                            </div>
                          </div>
                          <p className="text-xs text-muted truncate">{act.detail}</p>
                          <p className="text-xs text-faint">{act.date ? formatDate(act.date) : ""}</p>
                          {getActivityActionLabel(act) && (
                            <button type="button" onClick={() => handleActivityAction(act)} className="mt-1.5 text-[11px] font-medium text-brand-600 hover:text-brand-700">
                              {getActivityActionLabel(act)}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {activityLoadingMore && (
                      <div className="py-3 flex items-center justify-center">
                        <LoadingSpinner />
                      </div>
                    )}
                    {!activityLoadingMore && !activityHasMore && filteredActivities.length > 0 && (
                      <p className="py-2 text-center text-[11px] text-faint">You&apos;ve reached the end of this activity list.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Documents */}
          <div className="bg-card rounded-2xl p-5 shadow-sm border border-base">
            <CollapsibleSectionHeader
              title="Documents"
              subtitle={documents.length > 0 ? `${documents.length} linked document${documents.length === 1 ? "" : "s"}` : "Add important certificates, registrations, and shared links here."}
              open={sectionOpen.documents}
              onToggle={() => toggleSection("documents")}
              trailing={<button className="btn-primary !py-1 !text-xs" onClick={openCreateDocument}><Plus className="w-3 h-3" /> Add</button>}
            />
            {sectionOpen.documents && (
              <div className="mt-4">
                {documents.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm font-medium text-default">No documents yet</p>
                    <p className="text-sm text-faint mt-1">Add important certificates, registrations, and shared drive links here.</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <button type="button" className="btn-primary !py-2 !text-xs" onClick={openCreateDocument}>Add Document</button>
                      {!hasLinkedContacts && (
                        <button type="button" className="btn-secondary !py-2 !text-xs" onClick={openEdit}>Link Contact</button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div key={doc._id} className="flex items-center justify-between p-2.5 rounded-xl bg-surface hover:bg-hover transition-colors">
                        <div>
                          <p className="text-sm font-medium text-default">{doc.documentName}</p>
                          <p className="text-xs text-faint">{formatDate(doc.uploadedDate)}</p>
                        </div>
                        <div className="flex gap-1">
                          <a href={doc.driveLink} target="_blank" rel="noopener noreferrer" className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg"><ExternalLink className="w-3.5 h-3.5" /></a>
                          <button type="button" onClick={() => openEditDocument(doc)} className="p-1.5 text-faint hover:text-brand-600 hover:bg-brand-50 rounded-lg"><Pencil className="w-3.5 h-3.5" /></button>
                          <button type="button" disabled={busyAction === `document-${doc._id}`} onClick={() => deleteDocument(doc._id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg disabled:opacity-60"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* FY Selector */}
          <FYTabBar value={selectedFy} onChange={setSelectedFy} />

          {/* Credits / Targets */}
          {fyData && !isSIMP && (
            <div className="bg-card rounded-2xl p-5 shadow-sm border border-base">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-default">{isPWP ? "Credits Summary" : "Target Summary"} — FY {selectedFy}</h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openFYModal(fyData)}
                    className="btn-secondary !py-1.5 !px-3 !text-xs flex items-center gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit FY
                  </button>
                  <button
                    onClick={() => setBreakdownRec(fyData)}
                    className="btn-secondary !py-1.5 !px-3 !text-xs flex items-center gap-1.5"
                  >
                    <BarChart2 className="w-3.5 h-3.5" /> Breakdown
                  </button>
                </div>
              </div>
              {fyLastUpdated && <p className="text-xs text-faint mb-4">Last updated {formatDateTime(fyLastUpdated)}</p>}
              <div className="border border-base rounded-xl overflow-hidden mb-4">
                <table className="w-full min-w-[400px] text-sm">
                  <thead>
                    <tr className="bg-surface border-b border-base">
                      <th className="text-left text-xs text-muted font-semibold px-4 py-2">Category</th>
                      <th className="text-right text-xs text-muted font-semibold px-4 py-2">{isPWP ? "Generated" : "Target"}</th>
                      <th className="text-right text-xs text-muted font-semibold px-4 py-2">{isPWP ? "Sold" : "Achieved"}</th>
                      <th className="text-right text-xs text-muted font-semibold px-4 py-2">Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CATS.map((cat, i) => {
                      const n = i + 1;
                      const base = isPWP
                        ? (fyData[`cat${n}Generated` as keyof FYRecord] as number ?? fyData[`creditsCat${n}` as keyof FYRecord] as number ?? 0)
                        : (fyData[`cat${n}Target` as keyof FYRecord] as number    ?? fyData[`targetCat${n}` as keyof FYRecord] as number ?? 0);
                      const used = isPWP
                        ? (fyData[`soldCat${n}` as keyof FYRecord] as number ?? fyData[`usedCat${n}` as keyof FYRecord] as number ?? 0)
                        : (fyData[`achievedCat${n}` as keyof FYRecord] as number ?? 0);
                      const rem = base - used;
                      const pct = base > 0 ? Math.round((used / base) * 100) : 0;
                      return (
                        <tr key={cat} className="border-b border-base last:border-0">
                          <td className="px-4 py-2.5 font-medium text-default">{cat}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{base.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={`font-mono ${isPWP ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"}`}>{used.toLocaleString()}</span>
                            {base > 0 && <span className="text-xs text-faint ml-1">({pct}%)</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={`font-mono font-semibold ${rem < 0 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>{rem.toLocaleString()}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {isPWP ? (
                  <>
                    <div className="bg-surface rounded-xl p-3 text-center"><p className="text-xs text-muted mb-1">Total Generated</p><p className="text-xl font-bold text-default">{(fyData.totalGenerated ?? fyData.totalCredits ?? fyData.availableCredits ?? 0).toLocaleString()}</p></div>
                    <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 text-center"><p className="text-xs text-muted mb-1">Total Sold</p><p className="text-xl font-bold text-red-600 dark:text-red-400">{(fyData.totalSold ?? fyData.totalUsed ?? fyData.usedCredits ?? 0).toLocaleString()}</p></div>
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-center"><p className="text-xs text-muted mb-1">Remaining</p><p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{(fyData.totalRemaining ?? fyData.remainingCredits ?? 0).toLocaleString()}</p></div>
                  </>
                ) : (
                  <>
                    <div className="bg-surface rounded-xl p-3 text-center"><p className="text-xs text-muted mb-1">Total Target</p><p className="text-xl font-bold text-default">{(fyData.totalTarget ?? fyData.targetAmount ?? 0).toLocaleString()}</p></div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center"><p className="text-xs text-muted mb-1">Achieved</p><p className="text-xl font-bold text-blue-600 dark:text-blue-400">{(fyData.totalAchieved ?? fyData.achievedAmount ?? 0).toLocaleString()}</p></div>
                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 text-center"><p className="text-xs text-muted mb-1">Remaining</p><p className="text-xl font-bold text-amber-600 dark:text-amber-400">{(fyData.totalRemainingTarget ?? fyData.remainingTarget ?? 0).toLocaleString()}</p></div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Billing */}
          {busyAction === "__legacy__" && billing && (
            <div className="bg-card rounded-2xl p-5 shadow-sm border border-base">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-default">Billing — FY {selectedFy}</h3>
                <PaymentStatusBadge status={billing.paymentStatus} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="bg-surface rounded-xl p-3"><p className="text-xs text-muted">Govt Charges</p><p className="font-semibold">{formatCurrency(billing.govtCharges)}</p></div>
                <div className="bg-surface rounded-xl p-3"><p className="text-xs text-muted">Consultancy</p><p className="font-semibold">{formatCurrency(billing.consultancyCharges)}</p></div>
                <div className="bg-surface rounded-xl p-3"><p className="text-xs text-muted">Target Charges</p><p className="font-semibold">{formatCurrency(billing.targetCharges)}</p></div>
                <div className="bg-surface rounded-xl p-3"><p className="text-xs text-muted">Other Charges</p><p className="font-semibold">{formatCurrency(billing.otherCharges)}</p></div>
              </div>
              <div className="border-t border-soft pt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="text-center"><p className="text-xs text-muted">Total Billed</p><p className="font-bold text-default">{formatCurrency(billing.totalAmount)}</p></div>
                <div className="text-center"><p className="text-xs text-muted">Paid</p><p className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(billing.totalPaid)}</p></div>
                <div className="text-center"><p className="text-xs text-muted">Pending</p><p className="font-bold text-red-500">{formatCurrency(billing.pendingAmount)}</p></div>
              </div>
            </div>
          )}

          {/* Payment History */}
          {busyAction === "__legacy__" && payments.length > 0 && (
            <div className="bg-card rounded-2xl shadow-sm border border-base overflow-hidden">
              <div className="p-4 border-b border-base"><h3 className="font-semibold text-default">Payment History — FY {selectedFy}</h3></div>
              <table className="w-full min-w-[400px]">
                <thead><tr><th className="table-header">Date</th><th className="table-header">Amount</th><th className="table-header">Type</th><th className="table-header">Mode</th><th className="table-header">Reference</th></tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p._id} className="hover:bg-surface border-t border-soft">
                      <td className="table-cell">{formatDate(p.paymentDate)}</td>
                      <td className="table-cell font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(p.amountPaid)}</td>
                      <td className="table-cell">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.paymentType === "advance" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"}`}>
                          {p.paymentType === "advance" ? "Advance" : "Billing"}
                        </span>
                      </td>
                      <td className="table-cell">{p.paymentMode}</td>
                      <td className="table-cell text-faint">{p.referenceNumber || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-card rounded-2xl p-5 shadow-sm border border-base">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-default">Billing — FY {selectedFy}</h3>
                {billing && <PaymentStatusBadge status={billing.paymentStatus} />}
              </div>
              <div className="flex items-center gap-2">
                {billing ? (
                  <>
                    {billing.pendingAmount > 0 && (
                      <button type="button" className="btn-secondary !py-1.5 !px-3 !text-xs" onClick={() => openReminderModal(billing)}>
                        <Send className="w-3.5 h-3.5" /> Reminder
                      </button>
                    )}
                    <button type="button" className="btn-secondary !py-1.5 !px-3 !text-xs" onClick={() => openBillingModalForRecord(billing)}>
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button type="button" className="btn-secondary !py-1.5 !px-3 !text-xs text-red-500" disabled={busyAction === `billing-${billing._id}`} onClick={() => deleteBilling(billing)}>
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn-primary !py-1.5 !px-3 !text-xs" onClick={() => openBillingModalForRecord()}>
                    <Plus className="w-3.5 h-3.5" /> Create Billing
                  </button>
                )}
              </div>
            </div>
            {billingLastUpdated && <p className="text-xs text-faint mb-4">Last updated {formatDateTime(billingLastUpdated)}</p>}
            {billing ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <div className="bg-surface rounded-xl p-3"><p className="text-xs text-muted">Govt Charges</p><p className="font-semibold">{formatCurrency(billing.govtCharges)}</p></div>
                  <div className="bg-surface rounded-xl p-3"><p className="text-xs text-muted">Consultancy</p><p className="font-semibold">{formatCurrency(billing.consultancyCharges)}</p></div>
                  <div className="bg-surface rounded-xl p-3"><p className="text-xs text-muted">Target Charges</p><p className="font-semibold">{formatCurrency(billing.targetCharges)}</p></div>
                  <div className="bg-surface rounded-xl p-3"><p className="text-xs text-muted">Other Charges</p><p className="font-semibold">{formatCurrency(billing.otherCharges)}</p></div>
                </div>
                {billing.notes && <div className="rounded-xl bg-surface px-3 py-2.5 text-sm text-muted mb-4">{billing.notes}</div>}
                <div className="border-t border-soft pt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="text-center"><p className="text-xs text-muted">Total Billed</p><p className="font-bold text-default">{formatCurrency(billing.totalAmount)}</p></div>
                  <div className="text-center"><p className="text-xs text-muted">Paid</p><p className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(billing.totalPaid)}</p></div>
                  <div className="text-center"><p className="text-xs text-muted">Pending</p><p className="font-bold text-red-500">{formatCurrency(billing.pendingAmount)}</p></div>
                </div>
              </>
            ) : (
              <div className="text-center py-6">
                <p className="text-sm font-medium text-default">No billing recorded for FY {selectedFy}</p>
                <p className="text-sm text-faint mt-1">Create the first billing entry here so reminders and payment tracking can start.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button type="button" className="btn-primary !py-2 !text-xs" onClick={() => openBillingModalForRecord()}>
                    Create Billing
                  </button>
                  {!fyData && (
                    <button type="button" className="btn-secondary !py-2 !text-xs" onClick={() => openFYModal()}>
                      {isPWP ? "Add Credit Data" : "Add FY Data"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="bg-card rounded-2xl shadow-sm border border-base overflow-hidden">
            <div className="p-4 border-b border-base flex items-center justify-between gap-3">
              <h3 className="font-semibold text-default">Payment History — FY {selectedFy}</h3>
              <button type="button" className="btn-primary !py-1.5 !px-3 !text-xs" onClick={() => openPaymentModalForRecord()}>
                <Plus className="w-3.5 h-3.5" /> Add Payment
              </button>
            </div>
            {payments.length > 0 ? (
              <table className="w-full min-w-[400px]">
                <thead><tr><th className="table-header">Date</th><th className="table-header">Amount</th><th className="table-header">Type</th><th className="table-header">Mode</th><th className="table-header">Reference</th><th className="table-header">Actions</th></tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p._id} className="hover:bg-surface border-t border-soft">
                      <td className="table-cell">{formatDate(p.paymentDate)}</td>
                      <td className="table-cell font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(p.amountPaid)}</td>
                      <td className="table-cell">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.paymentType === "advance" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"}`}>
                          {p.paymentType === "advance" ? "Advance" : "Billing"}
                        </span>
                      </td>
                      <td className="table-cell">{p.paymentMode}</td>
                      <td className="table-cell text-faint">{p.referenceNumber || "—"}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => openPaymentModalForRecord(p)} className="p-1.5 text-faint hover:text-brand-600 hover:bg-brand-50 rounded-lg">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" disabled={busyAction === `payment-${p._id}`} onClick={() => deletePayment(p._id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg disabled:opacity-60">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-6 text-center">
                <p className="text-sm font-medium text-default">No payments recorded for FY {selectedFy}</p>
                <p className="text-sm text-faint mt-1">Record billing or advance payments here without leaving the profile page.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button type="button" className="btn-primary !py-2 !text-xs" onClick={() => openPaymentModalForRecord()}>
                    Add Payment
                  </button>
                  {billing && billing.pendingAmount > 0 && (
                    <button type="button" className="btn-secondary !py-2 !text-xs" onClick={() => openReminderModal()}>
                      Send Reminder
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="bg-card rounded-2xl shadow-sm border border-base overflow-hidden">
            <div className="px-5 py-4 border-b border-base space-y-3">
              <CollapsibleSectionHeader
                title="Recent Activity"
                subtitle={`${activityWindowHelpText} FY-tagged events are highlighted and global events stay neutral.`}
                open={sectionOpen.recentActivity}
                onToggle={() => toggleSection("recentActivity")}
                trailing={<span className="text-xs bg-surface text-muted px-2 py-0.5 rounded-full">{activitiesTotal.toLocaleString("en-IN")} events</span>}
              />
              {sectionOpen.recentActivity && (
                <div className="space-y-3">
                  <ActivityRangeChips />
                  <ActivityFilterChips />
                </div>
              )}
            </div>

            {sectionOpen.recentActivity && (
              <>
                {activityError ? (
                  <div className="px-5 py-4">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
                      {activityError}
                    </div>
                  </div>
                ) : activityLoading ? (
                  <div className="py-10 flex items-center justify-center">
                    <LoadingSpinner />
                  </div>
                ) : filteredActivities.length === 0 ? (
                  <div className="px-5 py-10 text-center">
                    <Activity className="w-4 h-4 text-brand-600 mx-auto" />
                    <p className="font-semibold text-default mt-3 mb-1">No activity for this filter</p>
                    <p className="text-sm text-muted">{activityEmptyText}.</p>
                  </div>
                ) : (
                  <div ref={activityTimelineListRef} onScroll={handleActivityScroll} className="max-h-[440px] overflow-y-auto">
                    <div className="divide-y divide-soft">
                      {filteredActivities.map((event) => (
                        <div
                          key={event.id}
                          className={`flex items-start gap-3 px-5 py-3.5 transition-colors ${
                            event.financialYear === selectedFy
                              ? "bg-brand-50/35 dark:bg-brand-900/10"
                              : "hover:bg-surface bg-surface/40"
                          }`}
                        >
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${activityColors[event.color] || "bg-surface text-muted"}`}>{activityIcon(event.type)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium text-default leading-snug truncate">{event.label}</p>
                              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${getActivityFyChip(event).className}`}>{getActivityFyChip(event).label}</span>
                                {event.badge && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${event.badgeColor || "bg-surface text-muted"}`}>{event.badge}</span>}
                              </div>
                            </div>
                            <p className="text-xs text-muted mt-0.5 truncate">{event.detail}</p>
                            <div className="flex flex-wrap items-center justify-between gap-2 mt-0.5">
                              <p className="text-xs text-faint">{formatDate(event.date)}</p>
                              {getActivityActionLabel(event) && (
                                <button type="button" onClick={() => handleActivityAction(event)} className="text-[11px] font-medium text-brand-600 hover:text-brand-700">
                                  {getActivityActionLabel(event)}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {activityLoadingMore && (
                        <div className="py-3 flex items-center justify-center">
                          <LoadingSpinner />
                        </div>
                      )}
                      {!activityLoadingMore && !activityHasMore && filteredActivities.length > 0 && (
                        <div className="px-5 py-3 text-center">
                          <span className="text-xs text-muted">You&apos;ve reached the end of this activity list.</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {!fyData && !billing && (
            <div className="bg-card border border-base rounded-2xl p-8 shadow-sm text-center">
              <div className="w-12 h-12 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              </div>
              <p className="font-semibold text-default mb-1">No data for FY {selectedFy}</p>
              <p className="text-sm text-muted mb-4">
                {isPWP
                  ? "Start by adding credits or billing for this client, then link contacts and documents as needed."
                  : "Start by adding FY data or billing for this client, then link contacts, reminders, and documents as needed."}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {emptyStateActions.map((action) => (
                  <button
                    key={`empty-${action.label}`}
                    type="button"
                    onClick={action.onClick}
                    className={action.tone === "primary" ? "btn-primary !py-2 !text-xs" : "btn-secondary !py-2 !text-xs"}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Document Modal ── */}
      <Modal open={docModal} onClose={closeDocumentModal} title={docModalMode === "edit" ? "Edit Document" : "Add Document"}>
        <form onSubmit={saveDocument} className="space-y-4">
          <div><label className="label">Document Name *</label><input className="input-field" value={docForm.documentName} onChange={(e) => setDocForm({ ...docForm, documentName: e.target.value })} required placeholder="e.g. Registration Certificate" /></div>
          <div><label className="label">Google Drive Link *</label><input className="input-field" type="url" value={docForm.driveLink} onChange={(e) => setDocForm({ ...docForm, driveLink: e.target.value })} required placeholder="https://drive.google.com/..." /></div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={inlineSaving}>{inlineSaving ? "Saving..." : docModalMode === "edit" ? "Save Changes" : "Add Document"}</button>
            <button type="button" className="btn-secondary" onClick={closeDocumentModal}>Cancel</button>
          </div>
        </form>
      </Modal>

      {!isSIMP && (
        <Modal open={fyModal} onClose={closeFyModal} title={isPWP ? "Manage Credit Data" : "Manage FY Data"} size="lg">
          <form onSubmit={saveFY} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Client</label>
                <div className="input-field bg-surface text-muted flex items-center">{client.companyName}</div>
              </div>
              <div>
                <label className="label">Financial Year *</label>
                <select className="input-field" value={fyForm.financialYear} onChange={(e) => setFyForm((current) => ({ ...current, financialYear: e.target.value }))} required>
                  {FINANCIAL_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </div>
            </div>

            <div className="rounded-xl border border-base overflow-hidden">
              <div className="px-4 py-3 border-b border-base bg-surface">
                <p className="font-semibold text-default">{isPWP ? "Generated Credits" : "Target Entries"}</p>
                <p className="text-xs text-faint mt-1">
                  {isPWP
                    ? "Enter generated credits for each category and type."
                    : "Enter target quantities for each category and type."}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="bg-surface border-b border-base">
                      <th className="text-left text-xs text-muted font-semibold px-4 py-2.5">Category</th>
                      {CREDIT_TYPES.map((type) => (
                        <th key={type} className="text-left text-xs text-muted font-semibold px-4 py-2.5">{type === "RECYCLING" ? "Recycling" : "EOL"}</th>
                      ))}
                      <th className="text-right text-xs text-muted font-semibold px-4 py-2.5">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CAT_IDS.map((categoryId, index) => {
                      const section = isPWP ? fyForm.generated : fyForm.targets;
                      const rowEntries = section.filter((entry) => entry.categoryId === categoryId);
                      const rowTotal = rowEntries.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0);
                      return (
                        <tr key={categoryId} className="border-b border-base last:border-0">
                          <td className="px-4 py-3 font-medium text-default">{CATS[index]}</td>
                          {CREDIT_TYPES.map((type) => {
                            const entry = section.find((item) => item.categoryId === categoryId && item.type === type);
                            return (
                              <td key={type} className="px-4 py-3">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="input-field"
                                  value={entry?.value || ""}
                                  onChange={(e) => updateFyEntry(isPWP ? "generated" : "targets", categoryId, type, e.target.value)}
                                  placeholder="0"
                                />
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-right font-semibold text-default">{rowTotal.toLocaleString("en-IN")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-surface rounded-xl p-3 border border-base">
                <p className="text-xs text-muted">{isPWP ? "Total Generated" : "Total Target"}</p>
                <p className="text-lg font-bold text-default">{(isPWP ? fyGeneratedTotal : fyTargetTotal).toLocaleString("en-IN")}</p>
              </div>
              {fyData && (
                <div className="bg-surface rounded-xl p-3 border border-base">
                  <p className="text-xs text-muted">{isPWP ? "Already Sold" : "Already Achieved"}</p>
                  <p className="text-lg font-bold text-default">{((isPWP ? fyData.totalSold : fyData.totalAchieved) || 0).toLocaleString("en-IN")}</p>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button type="submit" className="btn-primary flex-1 justify-center" disabled={inlineSaving}>
                {inlineSaving ? "Saving..." : isPWP ? "Save Credit Data" : "Save FY Data"}
              </button>
              <button type="button" className="btn-secondary" onClick={closeFyModal}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      <Modal open={reminderModal} onClose={closeReminderModal} title="Send Payment Reminder" size="lg">
        <form onSubmit={sendReminder} className="space-y-4">
          <div>
            <label className="label">Recipients *</label>
            <div className={`min-h-[44px] w-full rounded-lg border px-3 py-2 flex flex-wrap gap-2 items-center transition-colors ${reminderRecipients.length === 0 ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10" : "border-base bg-card"}`}>
              {reminderRecipients.map((recipient) => (
                <span key={recipient.email} className="flex items-center gap-1.5 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 text-xs font-medium px-2.5 py-1 rounded-full">
                  <span className="max-w-[200px] truncate" title={recipient.email}>
                    {recipient.label !== recipient.email ? <><span className="font-semibold">{recipient.label}</span><span className="opacity-60 ml-1">· {recipient.email}</span></> : recipient.email}
                  </span>
                  <button type="button" onClick={() => removeReminderRecipient(recipient.email)} className="text-brand-400 hover:text-red-500 transition-colors ml-0.5 flex-shrink-0" title="Remove">✕</button>
                </span>
              ))}
              {reminderRecipients.length === 0 && <span className="text-xs text-red-400">No recipients — add an email below</span>}
            </div>
            <p className="text-xs text-faint mt-1">Auto-filled from the selected emails on linked contacts. You can still add manual recipients below.</p>
          </div>

          {reminderSuggestions.length > 0 && (
            <div>
              <label className="label">Suggestions From Linked Contacts</label>
              <div className="flex flex-wrap gap-2">
                {reminderSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.email}
                    type="button"
                    onClick={() => addSuggestedReminderRecipient(suggestion)}
                    className="rounded-full border border-base px-3 py-1 text-xs text-faint transition-colors hover:border-brand-300 hover:text-brand-700 dark:hover:text-brand-300"
                  >
                    {suggestion.label !== suggestion.email ? `${suggestion.label} - ${suggestion.email}` : suggestion.email}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="label">Add Another Recipient</label>
            <div className="flex gap-2">
              <input
                type="email"
                className="input-field flex-1"
                placeholder="any.email@domain.com"
                value={customReminderEmail}
                onChange={(e) => setCustomReminderEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomReminderEmail(); } }}
              />
              <button type="button" onClick={addCustomReminderEmail} className="btn-secondary !px-3 shrink-0">+ Add</button>
            </div>
          </div>

          <div><label className="label">Subject *</label><input className="input-field" value={reminderForm.subject} onChange={(e) => setReminderForm({ ...reminderForm, subject: e.target.value })} required /></div>

          {reminderPreviewHtml ? (
            <div className="rounded-xl border border-blue-200 dark:border-blue-800 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 dark:bg-blue-900/30">
                <Send className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">Branded reminder template will be sent</p>
              </div>
              <iframe srcDoc={reminderPreviewHtml} className="w-full border-0" style={{ height: 280 }} title="Reminder Preview" />
            </div>
          ) : (
            <div><label className="label">Message *</label><textarea className="input-field" rows={6} value={reminderForm.message} onChange={(e) => setReminderForm({ ...reminderForm, message: e.target.value })} /></div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={reminderSending || reminderRecipients.length === 0}>
              <Send className="w-4 h-4" />{reminderSending ? "Sending..." : `Send to ${reminderRecipients.length} Recipient${reminderRecipients.length === 1 ? "" : "s"}`}
            </button>
            <button type="button" className="btn-secondary" onClick={closeReminderModal}>Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal open={billingModal} onClose={closeBillingModal} title={editingBillingId ? "Edit Billing" : "Create Billing"}>
        <form onSubmit={saveBilling} className="space-y-4">
          <div>
            <label className="label">Financial Year *</label>
            <select className="input-field" value={billingForm.financialYear} onChange={(e) => setBillingForm({ ...billingForm, financialYear: e.target.value })} required>
              {FINANCIAL_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="label">Govt Charges</label><input type="number" className="input-field" value={billingForm.govtCharges} onChange={(e) => setBillingForm({ ...billingForm, govtCharges: e.target.value })} min="0" step="0.01" /></div>
            <div><label className="label">Consultancy Charges</label><input type="number" className="input-field" value={billingForm.consultancyCharges} onChange={(e) => setBillingForm({ ...billingForm, consultancyCharges: e.target.value })} min="0" step="0.01" /></div>
            <div><label className="label">Target Charges</label><input type="number" className="input-field" value={billingForm.targetCharges} onChange={(e) => setBillingForm({ ...billingForm, targetCharges: e.target.value })} min="0" step="0.01" /></div>
            <div><label className="label">Other Charges</label><input type="number" className="input-field" value={billingForm.otherCharges} onChange={(e) => setBillingForm({ ...billingForm, otherCharges: e.target.value })} min="0" step="0.01" /></div>
          </div>
          <div className="bg-surface rounded-xl p-3 border border-base text-center">
            <p className="text-xs text-muted">Total Amount</p>
            <p className="text-lg font-bold text-default">{formatCurrency(billingFormTotal)}</p>
          </div>
          <div><label className="label">Notes</label><textarea className="input-field" rows={3} value={billingForm.notes} onChange={(e) => setBillingForm({ ...billingForm, notes: e.target.value })} placeholder="Optional notes about this billing" /></div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={inlineSaving}>{inlineSaving ? "Saving..." : editingBillingId ? "Save Billing" : "Create Billing"}</button>
            <button type="button" className="btn-secondary" onClick={closeBillingModal}>Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal open={paymentModal} onClose={closePaymentModal} title={editingPaymentId ? "Edit Payment" : "Record Payment"}>
        <form onSubmit={savePayment} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Payment Type *</label>
              <select className="input-field" value={paymentForm.paymentType} onChange={(e) => setPaymentForm({ ...paymentForm, paymentType: e.target.value === "advance" ? "advance" : "billing" })}>
                <option value="billing">Billing Payment</option>
                <option value="advance">Advance Payment</option>
              </select>
            </div>
            <div>
              <label className="label">Financial Year *</label>
              <select className="input-field" value={paymentForm.financialYear} onChange={(e) => setPaymentForm({ ...paymentForm, financialYear: e.target.value })} required>
                {FINANCIAL_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="label">Amount Paid *</label><input type="number" className="input-field" value={paymentForm.amountPaid} onChange={(e) => setPaymentForm({ ...paymentForm, amountPaid: e.target.value })} required min="1" step="0.01" placeholder="0.00" /></div>
            <div><label className="label">Payment Date *</label><input type="date" className="input-field" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} required /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Payment Mode *</label>
              <select className="input-field" value={paymentForm.paymentMode} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMode: e.target.value })} required>
                {PAYMENT_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
              </select>
            </div>
            <div><label className="label">Reference Number</label><input className="input-field" value={paymentForm.referenceNumber} onChange={(e) => setPaymentForm({ ...paymentForm, referenceNumber: e.target.value })} placeholder="UTR / Cheque number" /></div>
          </div>
          <div><label className="label">Notes</label><textarea className="input-field" rows={3} value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} placeholder="Optional notes about this payment" /></div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={inlineSaving}>{inlineSaving ? "Saving..." : editingPaymentId ? "Save Payment" : "Record Payment"}</button>
            <button type="button" className="btn-secondary" onClick={closePaymentModal}>Cancel</button>
          </div>
        </form>
      </Modal>

      {breakdownRec && (
        <Modal open={!!breakdownRec} onClose={() => setBreakdownRec(null)}
          title={`${client.companyName} — FY ${breakdownRec.financialYear}`} size="lg">
          <CategoryBreakdown
            clientType={isPWP ? "PWP" : "PIBO"}
            rows={makeBreakdownRows(breakdownRec)}
          />
        </Modal>
      )}

      {/* ── Edit Client Modal ── */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Edit Client" size="lg">
        <form onSubmit={handleSaveClient} className="space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 bg-surface p-1 rounded-xl">
            {(["basic", "portal"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setEditTab(t)}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors capitalize ${editTab === t ? "bg-card shadow-sm text-brand-700 dark:text-brand-400" : "text-faint hover:text-muted"}`}>
                {t === "basic" ? "Basic Info" : "Portal Credentials"}
              </button>
            ))}
          </div>

          {editTab === "basic" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Client ID</label>
                  <input className="input-field font-mono bg-surface text-faint" value={client.clientId} disabled />
                </div>
                <div>
                  <label className="label">Category *</label>
                  <select className="input-field bg-surface text-faint cursor-not-allowed" value={editForm.category} disabled aria-readonly="true">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <p className="text-[11px] text-faint mt-1">Category is fixed after creation so the Client ID prefix stays consistent.</p>
                </div>
              </div>
              <div>
                <label className="label">Company Name *</label>
                <input className="input-field" value={editForm.companyName} onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })} required />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="label flex items-center gap-1.5"><Users className="w-3 h-3" />Contacts</label>
                  <button
                    type="button"
                    onClick={addPerson}
                    className="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add Contact
                  </button>
                </div>
                <div className="space-y-3">
                  {persons.map((entry, index) => (
                    <PersonEntryCard
                      key={`${entry.personId || "new"}-${index}`}
                      entry={entry}
                      index={index}
                      total={persons.length}
                      onChange={(updated) => updatePerson(index, updated)}
                      onRemove={() => removePerson(index)}
                      onSetPrimary={() => setPrimary(index)}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">State *</label>
                  <select className="input-field" value={editForm.state} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })} required>
                    <option value="">Select State</option>
                    {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">GST Number</label>
                  <input className="input-field font-mono text-sm" value={editForm.gstNumber} onChange={(e) => setEditForm({ ...editForm, gstNumber: e.target.value })} placeholder="22AAAAA0000A1Z5" />
                </div>
              </div>
              <div>
                <label className="label">Address</label>
                <textarea className="input-field" rows={2} value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
              </div>
              <div>
                <label className="label">Registration Number</label>
                <input className="input-field font-mono text-sm" value={editForm.registrationNumber} onChange={(e) => setEditForm({ ...editForm, registrationNumber: e.target.value })} />
              </div>
            </div>
          )}

          {editTab === "portal" && (
            <div className="space-y-3">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-400">
                ⚠️ These credentials are stored securely and only visible to admins.
              </div>
              <div>
                <label className="label">CPCB Login ID</label>
                <input className="input-field font-mono text-sm" value={editForm.cpcbLoginId} onChange={(e) => setEditForm({ ...editForm, cpcbLoginId: e.target.value })} placeholder="e.g. username@cpcb" />
              </div>
              <div>
                <label className="label">CPCB Password</label>
                <div className="relative">
                  <input type={showEditPassword ? "text" : "password"} className="input-field font-mono text-sm pr-16"
                    value={editForm.cpcbPassword} onChange={(e) => setEditForm({ ...editForm, cpcbPassword: e.target.value })} />
                  <button type="button" onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-600 font-medium">
                    {showEditPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <div>
                <label className="label">OTP Mobile Number</label>
                <input className="input-field font-mono text-sm" value={editForm.otpMobileNumber} onChange={(e) => setEditForm({ ...editForm, otpMobileNumber: e.target.value })} placeholder="+91 XXXXX XXXXX" />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t border-base">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEditModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

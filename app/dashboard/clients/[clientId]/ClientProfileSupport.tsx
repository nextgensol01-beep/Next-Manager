"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Mail,
  MailCheck,
  Phone,
  Plus,
  Receipt,
  Send,
  Target,
  Trash2,
  Wallet,
  X,
  Zap,
} from "lucide-react";

export interface Person {
  _id: string;
  name: string;
  phoneNumbers: string[];
  emails: string[];
}

export interface Contact {
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

export interface Client {
  _id: string; clientId: string; companyName: string; category: string;
  state: string; address?: string; gstNumber?: string; registrationNumber?: string;
  cpcbLoginId?: string; cpcbPassword?: string; otpMobileNumber?: string;
  createdAt: string; updatedAt?: string; contacts?: Contact[];
}

export interface FYRecord {
  _id?: string; clientId: string; financialYear: string;
  generated?: Array<{ categoryId: string; type: "RECYCLING" | "EOL"; value: number }>;
  targets?: Array<{ categoryId: string; type: "RECYCLING" | "EOL"; value: number }>;
  soldByType?: Array<{ categoryId: string; type: "RECYCLING" | "EOL"; value: number }>;
  achievedByType?: Array<{ categoryId: string; type: "RECYCLING" | "EOL"; value: number }>;
  cat1Generated?: number; cat2Generated?: number; cat3Generated?: number; cat4Generated?: number;
  cat1Target?: number;    cat2Target?: number;    cat3Target?: number;    cat4Target?: number;
  soldCat1?: number;      soldCat2?: number;      soldCat3?: number;      soldCat4?: number;
  achievedCat1?: number;  achievedCat2?: number;  achievedCat3?: number;  achievedCat4?: number;
  remainingCat1?: number; remainingCat2?: number; remainingCat3?: number; remainingCat4?: number;
  remainingTargetCat1?: number; remainingTargetCat2?: number; remainingTargetCat3?: number; remainingTargetCat4?: number;
  totalGenerated?: number; totalSold?: number; totalRemaining?: number;
  totalTarget?: number;    totalAchieved?: number; totalRemainingTarget?: number;
  creditsCat1?: number; creditsCat2?: number; creditsCat3?: number; creditsCat4?: number;
  targetCat1?: number;  targetCat2?: number;  targetCat3?: number;  targetCat4?: number;
  usedCat1?: number;    usedCat2?: number;    usedCat3?: number;    usedCat4?: number;
  totalCredits?: number; totalUsed?: number; remainingCredits?: number;
  remainingTarget?: number;
  availableCredits?: number; targetAmount?: number; usedCredits?: number; achievedAmount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Billing {
  _id: string; clientId: string; financialYear: string; totalAmount: number;
  govtCharges: number; consultancyCharges: number; targetCharges: number; otherCharges: number;
  notes?: string; totalPaid: number; pendingAmount: number; paymentStatus: string;
  updatedAt?: string; createdAt?: string;
}

export interface Payment {
  _id: string; clientId: string; amountPaid: number; paymentType?: "billing" | "advance";
  paymentDate: string; paymentMode: string; referenceNumber: string; notes?: string; financialYear?: string;
}

export interface InvoiceTrackingRecord {
  _id: string;
  clientId: string;
  financialYear: string;
  invoiceType?: "sale" | "purchase";
  receivedVia?: "hardcopy" | "mail" | "whatsapp";
  fromDate: string;
  toDate: string;
  createdAt: string;
}

export interface UploadRecord {
  _id: string;
  clientId: string;
  financialYear: string;
  cat1?: number;
  cat2?: number;
  cat3?: number;
  cat4?: number;
  createdAt: string;
}

export interface Document {
  _id: string;
  documentName: string;
  driveLink: string;
  uploadedDate: string;
}

export type ActivityCategory = "credits" | "financial-year" | "billing" | "payments" | "emails" | "recycle-bin";
export type ActivityRange = "7d" | "30d" | "year";

export interface ActivityItem {
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

export interface ActivityResponse {
  items: ActivityItem[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
  latestEmailActivity: ActivityItem | null;
}

export interface PersonEntry {
  personId?: string;
  name: string;
  phoneNumbers: string[];
  emails: string[];
  selectedPhones: string[];
  selectedEmails: string[];
  designation: string;
  isPrimaryContact: boolean;
}

export interface FYEntryForm {
  categoryId: string;
  type: "RECYCLING" | "EOL";
  value: string;
}

export interface EmailOption {
  label: string;
  email: string;
}

export const CATS = ["CAT-I", "CAT-II", "CAT-III", "CAT-IV"] as const;
export const CAT_IDS = ["1", "2", "3", "4"] as const;
export const CREDIT_TYPES = ["RECYCLING", "EOL"] as const;
export const ACTIVITY_FILTERS = [
  { id: "all", label: "All" },
  { id: "credits", label: "Credits" },
  { id: "financial-year", label: "FY" },
  { id: "billing", label: "Billing" },
  { id: "payments", label: "Payments" },
  { id: "emails", label: "Emails" },
  { id: "recycle-bin", label: "Recycle Bin" },
] as const;
export type ActivityFilter = typeof ACTIVITY_FILTERS[number]["id"];
export const ACTIVITY_RANGES = [
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last Month" },
  { id: "year", label: "Whole Year" },
] as const;
export const ACTIVITY_PAGE_SIZE = 10;
export const ACTIVITY_SCROLL_THRESHOLD = 120;

export const normalizePhoneValue = (value: string) => value.trim();
export const normalizeEmailValue = (value: string) => value.trim().toLowerCase();
export const dedupe = (values: string[]) => Array.from(new Set(values));
export const normalizePhoneList = (values: string[]) => dedupe(values.map(normalizePhoneValue).filter(Boolean));
export const normalizeEmailList = (values: string[]) => dedupe(values.map(normalizeEmailValue).filter(Boolean));
export const todayInputValue = () => new Date().toISOString().slice(0, 10);
export const formatDateTime = (date?: string | Date | null) => {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
};
export const getLatestTimestamp = (...values: Array<string | undefined>) =>
  values.find((value) => typeof value === "string" && value.trim()) || "";
export const getContactPhones = (contact?: Partial<Contact>) =>
  normalizePhoneList(contact?.selectedPhones?.length ? contact.selectedPhones : contact?.phoneNumbers || []);
export const getContactEmails = (contact?: Partial<Contact>) =>
  normalizeEmailList(contact?.selectedEmails?.length ? contact.selectedEmails : contact?.emails || []);

export const syncEntrySelections = (entry: PersonEntry): PersonEntry => {
  const phoneSet = new Set(normalizePhoneList(entry.phoneNumbers));
  const emailSet = new Set(normalizeEmailList(entry.emails));

  return {
    ...entry,
    selectedPhones: normalizePhoneList(entry.selectedPhones).filter((value) => phoneSet.has(value)),
    selectedEmails: normalizeEmailList(entry.selectedEmails).filter((value) => emailSet.has(value)),
  };
};

export const createPersonEntry = (person?: Partial<Contact & Person>): PersonEntry => {
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

export const emptyPersonEntry = (): PersonEntry => ({
  name: "",
  phoneNumbers: [""],
  emails: [""],
  selectedPhones: [],
  selectedEmails: [],
  designation: "",
  isPrimaryContact: false,
});

export const createEmptyFyEntries = (): FYEntryForm[] => (
  CAT_IDS.flatMap((categoryId) => CREDIT_TYPES.map((type) => ({ categoryId, type, value: "" })))
);

export const buildFyEntries = (
  entries: Array<{ categoryId: string; type: "RECYCLING" | "EOL"; value: number }> | undefined
): FYEntryForm[] => {
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

export const sumFyEntries = (entries: FYEntryForm[]) =>
  entries.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0);

export const buildEntryValueMap = (
  entries: Array<{ categoryId: string; type: "RECYCLING" | "EOL"; value: number }> | undefined
) => {
  const map: Record<string, number> = {};
  (entries || []).forEach((entry) => {
    const type = entry.type === "EOL" ? "EOL" : "RECYCLING";
    const key = `${entry.categoryId}|${type}`;
    map[key] = (map[key] || 0) + (Number(entry.value) || 0);
  });
  return map;
};

export function restoreSuggestion(email: string, currentSuggestions: EmailOption[], catalog: EmailOption[]) {
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

export function buildLinkedContactEmailOptions(contacts: Contact[] = []) {
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

export const activityIcon = (type: string) => {
  if (type === "credit_sold") return <ArrowUpRight className="w-3.5 h-3.5" />;
  if (type === "target_achieved") return <ArrowDownLeft className="w-3.5 h-3.5" />;
  if (type === "target_set") return <Target className="w-3.5 h-3.5" />;
  if (type === "credits_set") return <Zap className="w-3.5 h-3.5" />;
  if (type === "billing_created") return <Receipt className="w-3.5 h-3.5" />;
  if (type === "payment_received" || type === "advance_payment_received") return <Wallet className="w-3.5 h-3.5" />;
  if (type === "email_draft") return <MailCheck className="w-3.5 h-3.5" />;
  if (type === "email_sent") return <Send className="w-3.5 h-3.5" />;
  if (type.startsWith("deleted_")) return <Trash2 className="w-3.5 h-3.5" />;
  return <Zap className="w-3.5 h-3.5" />;
};

export const activityColors: Record<string, string> = {
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-900/35 dark:text-teal-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/35 dark:text-blue-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/35 dark:text-amber-300",
  brand: "bg-brand-100 text-brand-700 dark:bg-brand-900/35 dark:text-brand-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-300",
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400",
  rose: "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300",
};

export function InfoRow({
  icon,
  label,
  value,
  sub,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <div className="text-faint mt-0.5 flex-shrink-0">{icon}</div>
      <div>
        <p className="text-muted text-xs">{label}</p>
        <p className={`font-medium text-default ${mono ? "font-mono text-sm" : ""}`}>{value || "-"}</p>
        {sub && <p className="text-xs text-faint">{sub}</p>}
      </div>
    </div>
  );
}

export function CopyButton({
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

export function CollapsibleSectionHeader({
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

export function FilterRail<T extends string>({
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
    <div className="glass-tray-full" style={{ marginBottom: 0 }}>
      {/* Section label */}
      <span
        className="flex-shrink-0"
        style={{
          fontSize: "10px",
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--color-text-faint)",
        }}
      >
        {label}
      </span>

      {/* Scrollable pill strip */}
      <div className="relative flex-1 min-w-0 overflow-hidden">
        {/* Left fade */}
        <div
          className="pointer-events-none absolute left-0 top-0 h-full w-8 z-10 transition-opacity duration-200"
          style={{
            background: "linear-gradient(to right, var(--glass-tray-bg) 10%, transparent)",
            opacity: showLeftFade ? 1 : 0,
          }}
        />
        {/* Right fade */}
        <div
          className="pointer-events-none absolute right-0 top-0 h-full w-8 z-10 transition-opacity duration-200"
          style={{
            background: "linear-gradient(to left, var(--glass-tray-bg) 10%, transparent)",
            opacity: showRightFade ? 1 : 0,
          }}
        />

        <div
          ref={scrollRef}
          className="overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden snap-x snap-proximity"
          style={{ cursor: "grab", WebkitOverflowScrolling: "touch" }}
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
              /* neutral tone: use slate instead of brand blue */
              const neutralActive = tone === "neutral";
              return (
                <button
                  key={option.id}
                  type="button"
                  data-filter-option={String(option.id)}
                  onClick={() => handleSelect(option.id)}
                  className={`glass-pill snap-start ${
                    active
                      ? neutralActive
                        ? "glass-pill-neutral-active"
                        : "glass-pill-active"
                      : ""
                  }`}
                  style={
                    active && neutralActive
                      ? {
                          background: "rgba(15,23,42,0.88)",
                          borderColor: "rgba(100,116,139,0.50)",
                          color: "#ffffff",
                          boxShadow: "0 0 0 1px rgba(15,23,42,0.30), 0 4px 16px rgba(15,23,42,0.28)",
                        }
                      : undefined
                  }
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PersonSearch({
  value,
  onChange,
  onSelect,
}: {
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
                  {[...person.phoneNumbers, ...person.emails].filter(Boolean).join(" - ")}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PersonEntryCard({
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

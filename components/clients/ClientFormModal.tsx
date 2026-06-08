"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Modal from "@/components/ui/Modal";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { STATES, CATEGORIES } from "@/lib/utils";
import {
  PersonEntryCard,
  emptyPersonEntry,
  createPersonEntry,
  syncEntrySelections,
  type PersonEntry,
} from "@/app/dashboard/clients/[clientId]/ClientProfileSupport";
import type {
  ClientCustomFieldDefinition,
  ClientCustomFieldValues,
} from "@/lib/clientCustomFields";
import { customFieldValueIsEmpty } from "@/lib/clientCustomFields";
import { Wand2, RefreshCw, Lock, UserPlus, AlertCircle, X, Users, ClipboardList, CheckCircle2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClientFormData {
  companyName: string;
  legalName: string;
  category: string;
  state: string;
  address: string;
  gstNumber: string;
  registrationNumber: string;
  cpcbLoginId: string;
  cpcbPassword: string;
  otpMobileNumber: string;
  customFields: ClientCustomFieldValues;
}

export interface ExistingClient {
  clientId: string;
  companyName: string;
  legalName?: string;
  category: string;
  state: string;
  address?: string;
  gstNumber?: string;
  registrationNumber?: string;
  cpcbLoginId?: string;
  cpcbPassword?: string;
  otpMobileNumber?: string;
  customFields?: ClientCustomFieldValues;
  contacts?: Array<{
    _id: string;
    personId?: string;
    name: string;
    designation?: string;
    isPrimaryContact?: boolean;
    phoneNumbers?: string[];
    emails?: string[];
    allPhoneNumbers?: string[];
    allEmails?: string[];
    selectedPhones?: string[];
    selectedEmails?: string[];
    mobile?: string;
    email?: string;
  }>;
}

interface ClientFormModalProps {
  open: boolean;
  onClose: () => void;
  client: ExistingClient | null;
  customFieldDefinitions: ClientCustomFieldDefinition[];
  onSave: (
    data: ClientFormData,
    persons: PersonEntry[],
    removedPersonIds: string[]
  ) => Promise<void>;
  saving: boolean;
  initialTab?: "basic" | "portal";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_CLIENT_ID_PREVIEW = "Likely ID: --";

const emptyForm = (): ClientFormData => ({
  companyName: "",
  legalName: "",
  category: "PWP",
  state: "",
  address: "",
  gstNumber: "",
  registrationNumber: "",
  cpcbLoginId: "",
  cpcbPassword: "",
  otpMobileNumber: "",
  customFields: {},
});

function formFromClient(c: ExistingClient): ClientFormData {
  return {
    companyName: c.companyName,
    legalName: c.legalName || String(c.customFields?.legalName || ""),
    category: c.category,
    state: c.state,
    address: c.address || "",
    gstNumber: c.gstNumber || "",
    registrationNumber: c.registrationNumber || "",
    cpcbLoginId: c.cpcbLoginId || "",
    cpcbPassword: c.cpcbPassword || "",
    otpMobileNumber: c.otpMobileNumber || "",
    customFields: c.customFields || {},
  };
}

function personsFromClient(c: ExistingClient): PersonEntry[] {
  const entries = (c.contacts || []).map((ct, i) =>
    createPersonEntry({
      ...ct,
      personId: ct.personId || ct._id,
      designation: ct.designation || "",
      isPrimaryContact: ct.isPrimaryContact || i === 0,
    })
  );
  return entries.length > 0 ? entries : [{ ...emptyPersonEntry(), isPrimaryContact: true }];
}

function isDirty(
  form: ClientFormData,
  initialForm: ClientFormData,
  persons: PersonEntry[],
  initialPersons: PersonEntry[]
): boolean {
  return (
    JSON.stringify(form) !== JSON.stringify(initialForm) ||
    JSON.stringify(persons) !== JSON.stringify(initialPersons)
  );
}

// Which tab has dirty fields (for per-tab unsaved label)
function getDirtyTab(
  form: ClientFormData,
  initialForm: ClientFormData,
  persons: PersonEntry[],
  initialPersons: PersonEntry[]
): "basic" | "portal" | "both" | null {
  const basicDirty =
    form.companyName !== initialForm.companyName ||
    form.legalName !== initialForm.legalName ||
    form.category !== initialForm.category ||
    form.state !== initialForm.state ||
    form.address !== initialForm.address ||
    form.gstNumber !== initialForm.gstNumber ||
    form.registrationNumber !== initialForm.registrationNumber ||
    JSON.stringify(form.customFields) !== JSON.stringify(initialForm.customFields) ||
    JSON.stringify(persons) !== JSON.stringify(initialPersons);

  const portalDirty =
    form.cpcbLoginId !== initialForm.cpcbLoginId ||
    form.cpcbPassword !== initialForm.cpcbPassword ||
    form.otpMobileNumber !== initialForm.otpMobileNumber;

  if (basicDirty && portalDirty) return "both";
  if (basicDirty) return "basic";
  if (portalDirty) return "portal";
  return null;
}

// ── FieldRow ──────────────────────────────────────────────────────────────────
function FieldRow({
  label,
  hint,
  children,
  last = false,
  error = false,
  fieldId,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  last?: boolean;
  error?: boolean;
  fieldId?: string;
}) {
  return (
    <div
      id={fieldId}
      className={`flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-4 px-4 py-3 ${!last ? "border-b" : ""} ${error ? "cfm-field-error" : ""}`}
      style={{ borderColor: "var(--color-border-soft)" }}
    >
      <div className="sm:w-40 flex-shrink-0 pt-0.5">
        <span className={`text-[13px] font-medium leading-tight ${error ? "text-red-500" : "text-default"}`}>
          {label}
          {error && <span className="ml-1 text-red-500">*</span>}
        </span>
        {hint && <p className="text-[11px] text-faint mt-0.5 leading-snug">{hint}</p>}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// ── InsetGroup ────────────────────────────────────────────────────────────────
function InsetGroup({
  title,
  children,
  footer,
  animDelay = 0,
  allowOverflow = false,
  sectionRef,
}: {
  title?: string;
  children: React.ReactNode;
  footer?: string;
  animDelay?: number;
  allowOverflow?: boolean;
  sectionRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={sectionRef} className="cfm-section" style={{ animationDelay: `${animDelay}ms` }}>
      {title && (
        <p
          className="text-[11px] font-semibold uppercase tracking-wider px-1 mb-1.5"
          style={{ color: "var(--color-text-faint)" }}
        >
          {title}
        </p>
      )}
      <div
        className="rounded-2xl"
        style={{
          backgroundColor: "var(--color-card)",
          border: "1px solid var(--color-border)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          overflow: allowOverflow ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
      {footer && (
        <p className="text-[11px] px-1 mt-1.5 leading-relaxed" style={{ color: "var(--color-text-faint)" }}>
          {footer}
        </p>
      )}
    </div>
  );
}

// ── Paste import helpers ───────────────────────────────────────────────────────

/** One parsed row from a pasted spreadsheet / CSV block */
export interface ParsedContactRow {
  name: string;
  designation: string;
  phone: string;
  email: string;
}

/**
 * Accepts a raw paste string (tab-separated or comma-separated, one row per line)
 * and returns an array of ParsedContactRow objects.
 *
 * Expected column order (flexible, extra columns ignored):
 *   Name | Designation | Phone | Email
 *
 * A row is skipped when it has no recognisable name after trimming.
 */
export function parsePastedContacts(raw: string): ParsedContactRow[] {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Detect delimiter: if any line contains a tab use TSV, else CSV
  const delimiter = lines.some((l) => l.includes("\t")) ? "\t" : ",";

  // Strip a possible header row (first cell looks like "name" / "contact" etc.)
  const firstCells = lines[0].split(delimiter).map((c) => c.trim().toLowerCase());
  const hasHeader =
    firstCells[0] === "name" ||
    firstCells[0] === "contact name" ||
    firstCells[0] === "contact" ||
    firstCells[0] === "person";
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines
    .map((line): ParsedContactRow => {
      // Handle quoted CSV fields (e.g. "Smith, John")
      const cells: string[] = [];
      if (delimiter === ",") {
        let cur = "";
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            inQuote = !inQuote;
          } else if (ch === "," && !inQuote) {
            cells.push(cur.trim());
            cur = "";
          } else {
            cur += ch;
          }
        }
        cells.push(cur.trim());
      } else {
        line.split("\t").forEach((c) => cells.push(c.trim()));
      }

      const [c0 = "", c1 = "", c2 = "", c3 = ""] = cells;

      // Heuristic: if c0 looks like a phone/email, user only pasted two cols (name, phone)
      const looksLikePhone = (s: string) => /^[+\d\s\-().]{7,}$/.test(s);
      const looksLikeEmail = (s: string) => s.includes("@");

      if (looksLikePhone(c1) || looksLikeEmail(c1)) {
        // 2-col paste: Name | Phone-or-Email
        return {
          name: c0,
          designation: "",
          phone: looksLikePhone(c1) ? c1 : "",
          email: looksLikeEmail(c1) ? c1 : "",
        };
      }

      return {
        name: c0,
        designation: c1,
        phone: c2,
        email: c3,
      };
    })
    .filter((row) => row.name.trim().length > 0);
}

/** Convert a ParsedContactRow into a PersonEntry ready for the form */
function rowToPersonEntry(row: ParsedContactRow, isPrimary: boolean): PersonEntry {
  const phones = row.phone.trim() ? [row.phone.trim()] : [""];
  const emails = row.email.trim().toLowerCase() ? [row.email.trim().toLowerCase()] : [""];
  return {
    personId: undefined,
    name: row.name.trim(),
    designation: row.designation.trim(),
    phoneNumbers: phones,
    emails,
    selectedPhones: phones.filter(Boolean),
    selectedEmails: emails.filter(Boolean),
    isPrimaryContact: isPrimary,
  };
}

// ── Paste-import types ───────────────────────────────────────────────────────

/** A candidate Person found in the DB that matches a pasted row's name */
interface MatchCandidate {
  _id: string;
  name: string;
  phoneNumbers: string[];
  emails: string[];
  /** Companies this person is already linked to (from withCompanies=true) */
  companies: Array<{ clientId: string; companyName: string; category: string; state: string }>;
}

/** Resolution chosen by the user for a single pasted row */
type RowResolution =
  | { kind: "new" }                        // create a fresh Person
  | { kind: "linked"; candidate: MatchCandidate }; // link to existing Person

/** Full state of one row inside the modal */
interface PasteRow {
  parsed: ParsedContactRow;
  /** undefined = still searching, [] = no match found, 1+ = candidates */
  candidates: MatchCandidate[] | undefined;
  resolution: RowResolution | null; // null = unresolved match
  /** Which candidate card is expanded for picking */
  picking: boolean;
}

// ── PasteImportModal ──────────────────────────────────────────────────────────

function PasteImportModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  /** Called with fully-resolved PersonEntry[] ready to splice into the form */
  onImport: (entries: PersonEntry[]) => void;
}) {
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<PasteRow[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Track in-flight lookups so stale responses are discarded
  const lookupGenRef = useRef(0);

  // Reset on open/close
  useEffect(() => {
    if (!open) {
      setRaw("");
      setRows([]);
      lookupGenRef.current++;
    } else {
      setTimeout(() => textareaRef.current?.focus(), 120);
    }
  }, [open]);

  // Re-parse + re-lookup whenever raw text changes
  useEffect(() => {
    const parsed = parsePastedContacts(raw);
    const gen = ++lookupGenRef.current;

    if (parsed.length === 0) { setRows([]); return; }

    // Initialise rows with candidates=undefined (searching)
    setRows(parsed.map((p) => ({ parsed: p, candidates: undefined, resolution: null, picking: false })));

    // Fire one search per unique name
    const uniqueNames = Array.from(new Set(parsed.map((p) => p.name.trim()).filter(Boolean)));
    const resultsByName = new Map<string, MatchCandidate[]>();

    Promise.all(
      uniqueNames.map(async (name) => {
        try {
          const res = await fetch(
            `/api/contacts?search=${encodeURIComponent(name)}&withCompanies=true`
          );
          if (!res.ok) return;
          const data: MatchCandidate[] = await res.json();
          // Only keep exact name matches (case-insensitive)
          const exact = data.filter(
            (c) => c.name.trim().toLowerCase() === name.toLowerCase()
          );
          resultsByName.set(name, exact);
        } catch {
          resultsByName.set(name, []);
        }
      })
    ).then(() => {
      if (lookupGenRef.current !== gen) return; // stale, discard
      setRows((prev) =>
        prev.map((row) => {
          const candidates = resultsByName.get(row.parsed.name.trim()) ?? [];
          return {
            ...row,
            candidates,
            // Auto-resolve: no candidates → "new"; single candidate → still ask user
            resolution: candidates.length === 0 ? { kind: "new" } : null,
            picking: false,
          };
        })
      );
    });
  }, [raw]);

  if (!open) return null;

  // ── Derived state ──────────────────────────────────────────────────────
  const validRows = rows.filter((r) => r.parsed.name.trim());
  const allResolved = validRows.length > 0 && validRows.every((r) => r.resolution !== null);
  const linkedCount = validRows.filter((r) => r.resolution?.kind === "linked").length;
  const newCount    = validRows.filter((r) => r.resolution?.kind === "new").length;
  const searching   = validRows.some((r) => r.candidates === undefined);

  const resolveRow = (index: number, resolution: RowResolution) => {
    setRows((prev) =>
      prev.map((r, i) => i === index ? { ...r, resolution, picking: false } : r)
    );
  };

  const togglePicking = (index: number) => {
    setRows((prev) =>
      prev.map((r, i) => i === index ? { ...r, picking: !r.picking } : { ...r, picking: false })
    );
  };

  const handleImport = () => {
    if (!allResolved) return;
    const hasAnyPrimary = false; // will be set inside handlePasteImport
    const entries: PersonEntry[] = validRows.map((row, i) => {
      const { parsed, resolution } = row;
      const isPrimary = !hasAnyPrimary && i === 0;

      if (resolution?.kind === "linked") {
        const c = resolution.candidate;
        // Merge pasted phone/email into the existing Person's lists
        const mergedPhones = Array.from(
          new Set([
            ...c.phoneNumbers,
            ...(parsed.phone.trim() ? [parsed.phone.trim()] : []),
          ])
        );
        const mergedEmails = Array.from(
          new Set([
            ...c.emails,
            ...(parsed.email.trim().toLowerCase() ? [parsed.email.trim().toLowerCase()] : []),
          ])
        );
        return {
          personId: c._id,
          name: c.name,
          designation: parsed.designation.trim(),
          phoneNumbers: mergedPhones.length > 0 ? mergedPhones : [""],
          emails: mergedEmails.length > 0 ? mergedEmails : [""],
          selectedPhones: mergedPhones.filter(Boolean),
          selectedEmails: mergedEmails.filter(Boolean),
          isPrimaryContact: isPrimary,
        };
      }

      // kind === "new"
      return rowToPersonEntry(parsed, isPrimary);
    });

    onImport(entries);
    onClose();
  };

  // ── Row status badge ───────────────────────────────────────────────────
  const RowStatusBadge = ({ row, index }: { row: PasteRow; index: number }) => {
    if (row.candidates === undefined) {
      return (
        <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--color-text-faint)" }}>
          <RefreshCw className="w-3 h-3 animate-spin" /> Searching…
        </span>
      );
    }
    if (row.resolution?.kind === "new" && (row.candidates?.length ?? 0) === 0) {
      return (
        <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: "#22c55e" }}>
          <CheckCircle2 className="w-3 h-3" /> New contact
        </span>
      );
    }
    if (row.resolution?.kind === "new" && (row.candidates?.length ?? 0) > 0) {
      return (
        <button type="button" onClick={() => togglePicking(index)}
          className="flex items-center gap-1 text-[11px] font-medium transition-opacity hover:opacity-70"
          style={{ color: "var(--color-text-faint)" }}>
          <CheckCircle2 className="w-3 h-3" style={{ color: "#22c55e" }} /> Creating new
          <span style={{ color: "#0071e3" }}>(change?)</span>
        </button>
      );
    }
    if (row.resolution?.kind === "linked") {
      return (
        <button type="button" onClick={() => togglePicking(index)}
          className="flex items-center gap-1 text-[11px] font-medium transition-opacity hover:opacity-70"
          style={{ color: "#0071e3" }}>
          <CheckCircle2 className="w-3 h-3" /> Linked to {row.resolution.candidate.name}
          <span style={{ color: "var(--color-text-faint)" }}>(change?)</span>
        </button>
      );
    }
    // Unresolved match
    return (
      <button type="button" onClick={() => togglePicking(index)}
        className="flex items-center gap-1 text-[11px] font-medium"
        style={{ color: "#f59e0b" }}>
        <AlertCircle className="w-3 h-3" />
        {row.candidates!.length} match{row.candidates!.length > 1 ? "es" : ""} found — resolve
      </button>
    );
  };

  // ── Candidate picker panel ─────────────────────────────────────────────
  const CandidatePicker = ({ row, index }: { row: PasteRow; index: number }) => {
    const candidates = row.candidates ?? [];
    const pastedPhone = row.parsed.phone.trim();
    const pastedEmail = row.parsed.email.trim().toLowerCase();

    return (
      <div className="mt-2 rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        {/* "Create new" option always first */}
        <button type="button"
          onClick={() => resolveRow(index, { kind: "new" })}
          className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
          style={{ borderBottom: "1px solid var(--color-border-soft)" }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[12px] font-semibold"
            style={{ backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)", color: "var(--color-text-faint)" }}>
            +
          </div>
          <div>
            <p className="text-[13px] font-medium" style={{ color: "var(--color-text)" }}>Create new contact</p>
            <p className="text-[11px]" style={{ color: "var(--color-text-faint)" }}>
              A separate Person record will be created
            </p>
          </div>
          {row.resolution?.kind === "new" && (
            <CheckCircle2 className="w-4 h-4 ml-auto flex-shrink-0" style={{ color: "#0071e3" }} />
          )}
        </button>

        {/* Existing candidates */}
        {candidates.map((c) => {
          const isChosen = row.resolution?.kind === "linked" && row.resolution.candidate._id === c._id;
          const newPhone = pastedPhone && !c.phoneNumbers.includes(pastedPhone);
          const newEmail = pastedEmail && !c.emails.map((e) => e.toLowerCase()).includes(pastedEmail);

          return (
            <button key={c._id} type="button"
              onClick={() => resolveRow(index, { kind: "linked", candidate: c })}
              className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors"
              style={{ borderBottom: "1px solid var(--color-border-soft)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              {/* Avatar */}
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[12px] font-semibold"
                style={{ backgroundColor: "rgba(0,113,227,0.10)", color: "#0071e3" }}>
                {c.name.trim()[0]?.toUpperCase() ?? "?"}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium leading-tight" style={{ color: "var(--color-text)" }}>
                  {c.name}
                </p>
                {/* Existing phones */}
                {c.phoneNumbers.filter(Boolean).length > 0 && (
                  <p className="text-[11px] font-mono mt-0.5" style={{ color: "var(--color-text-faint)" }}>
                    {c.phoneNumbers.filter(Boolean).join("  ·  ")}
                  </p>
                )}
                {/* Existing emails */}
                {c.emails.filter(Boolean).length > 0 && (
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-faint)" }}>
                    {c.emails.filter(Boolean).join("  ·  ")}
                  </p>
                )}
                {/* Companies already linked to */}
                {c.companies?.length > 0 && (
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-faint)" }}>
                    {c.companies.map((co) => co.companyName).join(", ")}
                  </p>
                )}
                {/* New data that will be added */}
                {(newPhone || newEmail) && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {newPhone && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full font-mono"
                        style={{ backgroundColor: "rgba(0,113,227,0.08)", color: "#0071e3" }}>
                        + {pastedPhone}
                      </span>
                    )}
                    {newEmail && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: "rgba(0,113,227,0.08)", color: "#0071e3" }}>
                        + {pastedEmail}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {isChosen && (
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#0071e3" }} />
              )}
            </button>
          );
        })}
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.40)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex flex-col rounded-2xl shadow-2xl"
        style={{
          backgroundColor: "var(--color-card)",
          border: "1px solid var(--color-border)",
          width: "min(580px, 96vw)",
          maxHeight: "88vh",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--color-border-soft)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "rgba(0,113,227,0.10)" }}>
              <ClipboardList className="w-3.5 h-3.5" style={{ color: "#0071e3" }} />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold leading-tight" style={{ color: "var(--color-text)" }}>
                Paste contacts
              </h3>
              <p className="text-[12px]" style={{ color: "var(--color-text-faint)" }}>
                Copy rows from Excel, Google Sheets, or any CSV
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
            style={{ backgroundColor: "var(--color-surface)", color: "var(--color-text-faint)" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface)")}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Format hint */}
        <div className="px-5 py-2.5"
          style={{ backgroundColor: "rgba(0,113,227,0.04)", borderBottom: "1px solid var(--color-border-soft)" }}>
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--color-text-faint)" }}>
            <span className="font-medium" style={{ color: "var(--color-text-muted)" }}>Column order: </span>
            Name&nbsp;·&nbsp;Designation&nbsp;·&nbsp;Phone&nbsp;·&nbsp;Email
            <span className="mx-2" style={{ color: "var(--color-border)" }}>|</span>
            <span className="font-medium" style={{ color: "var(--color-text-muted)" }}>or: </span>
            Name&nbsp;·&nbsp;Phone/Email
            <span style={{ color: "var(--color-text-faint)" }}>&nbsp; (tab or comma separated)</span>
          </p>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ minHeight: 0 }}>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            className="w-full rounded-xl resize-none font-mono text-[12px] p-3 outline-none"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              minHeight: "100px",
              maxHeight: "160px",
              transition: "border-color 0.15s",
            }}
            placeholder={"Arjun Sharma\tCTO\t+91 98765 43210\tarjun@acme.com\nPriya Nair\tCFO\t+91 87654 32109\tpriya@acme.com"}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#0071e3")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
          />

          {/* Per-row resolution list */}
          {validRows.length > 0 && (
            <div className="mt-4 space-y-3">
              {rows.map((row, i) => {
                if (!row.parsed.name.trim()) return null;
                return (
                  <div key={i} className="rounded-xl overflow-visible"
                    style={{
                      border: "1px solid var(--color-border)",
                      backgroundColor: "var(--color-card)",
                    }}>
                    {/* Row summary line */}
                    <div className="flex items-start gap-3 px-4 py-3">
                      {/* Avatar */}
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[12px] font-semibold mt-0.5"
                        style={{ backgroundColor: "var(--color-surface)", color: "var(--color-text-faint)", border: "1px solid var(--color-border)" }}>
                        {row.parsed.name.trim()[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium leading-tight" style={{ color: "var(--color-text)" }}>
                          {row.parsed.name}
                          {row.parsed.designation && (
                            <span className="ml-1.5 text-[12px] font-normal" style={{ color: "var(--color-text-faint)" }}>
                              {row.parsed.designation}
                            </span>
                          )}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-0.5">
                          {row.parsed.phone && (
                            <span className="text-[11px] font-mono" style={{ color: "var(--color-text-faint)" }}>
                              {row.parsed.phone}
                            </span>
                          )}
                          {row.parsed.email && (
                            <span className="text-[11px]" style={{ color: "var(--color-text-faint)" }}>
                              {row.parsed.email}
                            </span>
                          )}
                        </div>
                        <div className="mt-1">
                          <RowStatusBadge row={row} index={i} />
                        </div>
                      </div>
                    </div>

                    {/* Candidate picker — shown when picking=true */}
                    {row.picking && (
                      <div className="px-4 pb-3">
                        <CandidatePicker row={row} index={i} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderTop: "1px solid var(--color-border-soft)" }}>
          <button type="button" onClick={onClose}
            className="text-[14px] font-medium px-1 transition-colors"
            style={{ color: "var(--color-text-faint)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-faint)")}>
            Cancel
          </button>

          <div className="flex items-center gap-3">
            {/* Summary counts once all resolved */}
            {allResolved && !searching && (
              <span className="text-[12px]" style={{ color: "var(--color-text-faint)" }}>
                {linkedCount > 0 && `${linkedCount} linked`}
                {linkedCount > 0 && newCount > 0 && " · "}
                {newCount > 0 && `${newCount} new`}
              </span>
            )}
            {searching && (
              <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--color-text-faint)" }}>
                <RefreshCw className="w-3 h-3 animate-spin" /> Searching contacts…
              </span>
            )}
            <button type="button"
              disabled={!allResolved || searching}
              onClick={handleImport}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-[14px] font-semibold transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: "#0071e3",
                color: "#fff",
                boxShadow: (!allResolved || searching) ? "none" : "0 1px 4px rgba(0,113,227,0.30)",
                letterSpacing: "-0.01em",
              }}
              onMouseEnter={(e) => { if (allResolved && !searching) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#0077ed"; }}
              onMouseLeave={(e) => { if (allResolved && !searching) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#0071e3"; }}>
              <UserPlus className="w-3.5 h-3.5" />
              {searching
                ? "Searching…"
                : !allResolved
                ? `Resolve ${validRows.filter((r) => r.resolution === null).length} match${validRows.filter((r) => r.resolution === null).length > 1 ? "es" : ""}`
                : `Import ${validRows.length} contact${validRows.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ContactsEmptyState ────────────────────────────────────────────────────────
function ContactsEmptyState({ onAdd, onPaste }: { onAdd: () => void; onPaste: () => void }) {
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: "rgba(0,113,227,0.08)" }}
        >
          <Users className="w-4 h-4" style={{ color: "#0071e3" }} />
        </div>
        <div>
          <p className="text-[13px] font-medium text-default leading-tight">No contacts yet</p>
          <p className="text-[12px] text-faint leading-tight mt-0.5">Add one at a time, or paste multiple from a spreadsheet</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAdd}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all active:scale-[0.97]"
          style={{
            color: "#0071e3",
            backgroundColor: "rgba(0,113,227,0.08)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(0,113,227,0.13)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgba(0,113,227,0.08)")}
        >
          <UserPlus className="w-3.5 h-3.5" />
          Add Contact
        </button>
        <button
          type="button"
          onClick={onPaste}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all active:scale-[0.97]"
          style={{
            color: "var(--color-text-muted)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface)")}
        >
          <ClipboardList className="w-3.5 h-3.5" />
          Paste from spreadsheet
        </button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ClientFormModal({
  open,
  onClose,
  client,
  customFieldDefinitions,
  onSave,
  saving,
  initialTab = "basic",
}: ClientFormModalProps) {
  const isEdit = client !== null;
  const visibleCustomFields = customFieldDefinitions.filter((f) => f.key !== "legalName");
  const companyCustomFields = visibleCustomFields.filter((field) => field.profilePosition === "afterCompany");
  const beforeContactCustomFields = visibleCustomFields.filter((field) => (field.profilePosition || "beforeContact") === "beforeContact");
  const afterContactCustomFields = visibleCustomFields.filter((field) => field.profilePosition === "afterContact");

  // ── Form state ──────────────────────────────────────────────────────────
  const [form, setForm] = useState<ClientFormData>(emptyForm);
  const [persons, setPersons] = useState<PersonEntry[]>([{ ...emptyPersonEntry(), isPrimaryContact: true }]);
  const [contactsStarted, setContactsStarted] = useState(false);
  const [removedPersonIds, setRemovedPersonIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"basic" | "portal">(initialTab);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [tabAnimating, setTabAnimating] = useState(false);
  const [tabDirection, setTabDirection] = useState<"left" | "right">("right");
  const [tabSwitched, setTabSwitched] = useState(false);
  const [portalVisited, setPortalVisited] = useState(initialTab === "portal");

  // ── Validation errors ───────────────────────────────────────────────────
  const [fieldErrors, setFieldErrors] = useState<{ companyName: boolean; state: boolean; customFields: Record<string, boolean> }>({
    companyName: false,
    state: false,
    customFields: {},
  });

  const formScrollRef = useRef<HTMLFormElement>(null);
  const tabScrollPos = useRef<Record<string, number>>({ basic: 0, portal: 0 });
  const initialFormRef = useRef<ClientFormData>(emptyForm());
  const initialPersonsRef = useRef<PersonEntry[]>([]);
  const addContactBtnRef = useRef<HTMLButtonElement>(null);
  const contactsSectionRef = useRef<HTMLDivElement>(null);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const companyNameRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<HTMLDivElement>(null);

  const [clientIdPreview, setClientIdPreview] = useState(DEFAULT_CLIENT_ID_PREVIEW);
  const [idGenerating, setIdGenerating] = useState(false);
  const previewRequestRef = useRef(0);

  const dirty = isDirty(form, initialFormRef.current, persons, initialPersonsRef.current);
  const dirtyTab = getDirtyTab(form, initialFormRef.current, persons, initialPersonsRef.current);

  // ── Unsaved label text ──────────────────────────────────────────────────
  const unsavedLabel =
    dirtyTab === "both"
      ? "Unsaved changes on both tabs"
      : dirtyTab === "basic"
      ? "Unsaved changes on Basic Info"
      : dirtyTab === "portal"
      ? "Unsaved changes on Portal"
      : null;

  // ── Intercept Escape key with capture so it fires before Modal's listener ──
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener("keydown", handler, true); // capture = true
    return () => window.removeEventListener("keydown", handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dirty]);

  // ── Tab switching ───────────────────────────────────────────────────────
  const switchTab = (tab: "basic" | "portal") => {
    if (tab === activeTab) return;
    if (tab === "portal") setPortalVisited(true);
    if (formScrollRef.current) tabScrollPos.current[activeTab] = formScrollRef.current.scrollTop;
    const goingRight = tab === "portal";
    setTabDirection(goingRight ? "right" : "left");
    setTabSwitched(true);
    setTabAnimating(true);
    setTimeout(() => {
      setActiveTab(tab);
      setTabAnimating(false);
    }, 120);
  };

  useEffect(() => {
    requestAnimationFrame(() => {
      if (formScrollRef.current) formScrollRef.current.scrollTop = tabScrollPos.current[activeTab] ?? 0;
    });
  }, [activeTab]);

  const handleClose = useCallback(() => {
    if (dirty) setConfirmingClose(true);
    else onClose();
  }, [dirty, onClose]);

  // ── Reset on open ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const f = client ? formFromClient(client) : emptyForm();
    const p = client ? personsFromClient(client) : [{ ...emptyPersonEntry(), isPrimaryContact: true }];
    setForm(f);
    setPersons(p);
    setRemovedPersonIds([]);
    setActiveTab(initialTab);
    setPortalVisited(isEdit || initialTab === "portal");
    setShowPassword(false);
    setConfirmingClose(false);
    // Show card view if client already has contacts, otherwise reset to empty state
    setContactsStarted(client ? (client.contacts || []).length > 0 : false);
    setFieldErrors({ companyName: false, state: false, customFields: {} });
    tabScrollPos.current = { basic: 0, portal: 0 };
    setTabSwitched(false);
    initialFormRef.current = JSON.parse(JSON.stringify(f));
    initialPersonsRef.current = JSON.parse(JSON.stringify(p));
    if (!client) { setClientIdPreview(DEFAULT_CLIENT_ID_PREVIEW); generateId(emptyForm().category); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client]);

  const generateId = async (category: string) => {
    const requestId = ++previewRequestRef.current;
    setIdGenerating(true);
    try {
      const r = await fetch(`/api/clients/generate-id?category=${encodeURIComponent(category)}`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      if (previewRequestRef.current !== requestId) return;
      setClientIdPreview(typeof d.clientId === "string" ? d.clientId : DEFAULT_CLIENT_ID_PREVIEW);
    } catch {
      if (previewRequestRef.current === requestId) setClientIdPreview(DEFAULT_CLIENT_ID_PREVIEW);
    } finally {
      if (previewRequestRef.current === requestId) setIdGenerating(false);
    }
  };

  // Focus first input after modal open
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const el = document.querySelector<HTMLElement>("[data-autofocus=\"true\"]");
      el?.focus();
    }, 260);
    return () => clearTimeout(t);
  }, [open]);

  // ── Contact handlers ────────────────────────────────────────────────────
  const addPerson = () => {
    setContactsStarted(true);
    let isFirstContact = false;
    setPersons((prev) => {
      const hasPrimary = prev.some((e) => e.isPrimaryContact);
      const hasEmpty = prev.length === 1 && !prev[0].name.trim();
      if (hasEmpty) {
        isFirstContact = true;
        return prev;
      }
      return [...prev, { ...emptyPersonEntry(), isPrimaryContact: !hasPrimary }];
    });
    setTimeout(() => {
      if (!formScrollRef.current) return;
      const form = formScrollRef.current;
      const headerHeight = stickyHeaderRef.current?.offsetHeight ?? 0;

      if (isFirstContact && contactsSectionRef.current) {
        // First contact — scroll so the Contacts section header sits just below the sticky header
        const formRect = form.getBoundingClientRect();
        const sectionRect = contactsSectionRef.current.getBoundingClientRect();
        const offset = form.scrollTop + (sectionRect.top - formRect.top) - headerHeight - 12;
        form.scrollTo({ top: offset, behavior: "smooth" });
      } else if (addContactBtnRef.current) {
        // Subsequent contact — scroll so the "Add Another Contact" button is just visible at the bottom
        const formRect = form.getBoundingClientRect();
        const btnRect = addContactBtnRef.current.getBoundingClientRect();
        const btnBottom = btnRect.bottom - formRect.top;
        const visibleBottom = formRect.height - 16;
        if (btnBottom > visibleBottom) {
          const offset = form.scrollTop + (btnBottom - visibleBottom);
          form.scrollTo({ top: offset, behavior: "smooth" });
        }
      }

      // Auto-focus the Name input of the new (last) contact card
      setTimeout(() => {
        const cards = form.querySelectorAll<HTMLInputElement>(".cfm-contact-inset input[placeholder='Type name to search or create...']");
        const lastInput = cards[cards.length - 1];
        lastInput?.focus();
      }, 120);
    }, 60);
  };

  const removePerson = (index: number) => {
    const entry = persons[index];
    if (entry.personId)
      setRemovedPersonIds((prev) =>
        prev.includes(entry.personId!) ? prev : [...prev, entry.personId!]
      );
    setPersons((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) return [];
      if (!next.some((e) => e.isPrimaryContact)) next[0].isPrimaryContact = true;
      return next;
    });
  };

  const updatePerson = (index: number, updated: PersonEntry) =>
    setPersons((prev) => prev.map((p, i) => (i === index ? syncEntrySelections(updated) : p)));

  const setPrimary = (index: number) =>
    setPersons((prev) => prev.map((p, i) => ({ ...p, isPrimaryContact: i === index })));

  // ── Paste-import state & handler ────────────────────────────────────────
  const [pasteModalOpen, setPasteModalOpen] = useState(false);

  const handlePasteImport = useCallback((incoming: PersonEntry[]) => {
    if (incoming.length === 0) return;
    setContactsStarted(true);
    setPersons((prev) => {
      // If the only existing entry is a pristine empty placeholder, replace it
      const onlyEmpty = prev.length === 1 && !prev[0].name.trim() && !prev[0].personId;
      const base = onlyEmpty ? [] : prev;
      const hasAnyPrimary = base.some((e) => e.isPrimaryContact);
      // Fix up isPrimaryContact based on actual base state
      const entries = incoming.map((entry, i) => ({
        ...entry,
        isPrimaryContact: !hasAnyPrimary && i === 0,
      }));
      return [...base, ...entries];
    });
    // Scroll contacts section into view after state flush
    setTimeout(() => {
      if (formScrollRef.current && contactsSectionRef.current) {
        const formRect = formScrollRef.current.getBoundingClientRect();
        const sectionRect = contactsSectionRef.current.getBoundingClientRect();
        const headerHeight = stickyHeaderRef.current?.offsetHeight ?? 0;
        const offset =
          formScrollRef.current.scrollTop +
          (sectionRect.top - formRect.top) -
          headerHeight - 12;
        formScrollRef.current.scrollTo({ top: offset, behavior: "smooth" });
      }
    }, 80);
  }, []);

  // ── Submit with client-side validation ─────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const customFieldErrors = visibleCustomFields.reduce<Record<string, boolean>>((acc, field) => {
      if (field.required && customFieldValueIsEmpty(field, form.customFields?.[field.key])) acc[field.key] = true;
      return acc;
    }, {});
    const errors = {
      companyName: !form.companyName.trim(),
      state: !form.state.trim(),
      customFields: customFieldErrors,
    };
    setFieldErrors(errors);
    const firstCustomFieldErrorKey = Object.keys(customFieldErrors)[0];

    if (errors.companyName || errors.state || firstCustomFieldErrorKey) {
      // Switch to basic tab if errors are there
      if (activeTab !== "basic") switchTab("basic");
      // Scroll to first error after tab switch settles
      setTimeout(() => {
        const firstError = errors.companyName
          ? companyNameRef.current
          : firstCustomFieldErrorKey
          ? document.getElementById(`cfm-custom-field-${firstCustomFieldErrorKey}`)
          : stateRef.current;
        if (firstError && formScrollRef.current) {
          const formRect = formScrollRef.current.getBoundingClientRect();
          const errRect = firstError.getBoundingClientRect();
          const offset = errRect.top - formRect.top + formScrollRef.current.scrollTop - 80;
          formScrollRef.current.scrollTo({ top: offset, behavior: "smooth" });
        }
      }, 150);
      return;
    }

    if (!isEdit && !portalVisited) {
      setPortalVisited(true);
      switchTab("portal");
      return;
    }

    await onSave(form, persons, removedPersonIds);
  };

  // Clear individual field error on change
  const clearError = (field: "companyName" | "state") =>
    setFieldErrors((prev) => ({ ...prev, [field]: false }));
  const updateCustomFieldValue = (field: ClientCustomFieldDefinition, value: ClientCustomFieldValues[string]) => {
    setForm({
      ...form,
      customFields: { ...form.customFields, [field.key]: value },
    });
    if (fieldErrors.customFields[field.key] && !customFieldValueIsEmpty(field, value)) {
      setFieldErrors((prev) => ({
        ...prev,
        customFields: { ...prev.customFields, [field.key]: false },
      }));
    }
  };

  const editSubtitle = isEdit
    ? `${client.companyName}${client.clientId ? ` · ${client.clientId}` : ""}`
    : undefined;

  const primaryActionLabel = !isEdit && !portalVisited ? "Next" : isEdit ? "Save Changes" : "Add Client";

  // Save button: disabled if saving OR (edit mode with no changes)
  const saveDisabled = saving || (isEdit && !dirty);
  const saveTitle = isEdit && !dirty && !saving ? "No changes to save" : undefined;

  // Show card view if user explicitly clicked Add Contact OR client already has contacts
  const showContactCards = contactsStarted;
  const renderCustomFieldRows = (fields: ClientCustomFieldDefinition[]) =>
    fields.map((field, idx) => (
      <FieldRow
        key={field.key}
        label={field.required ? `${field.label} *` : field.label}
        hint={field.type === "checkbox" ? "Checkbox" : undefined}
        last={idx === fields.length - 1}
        error={Boolean(fieldErrors.customFields[field.key])}
        fieldId={`cfm-custom-field-${field.key}`}
      >
        <div className={`cfm-input-row ${fieldErrors.customFields[field.key] ? "cfm-input-error" : ""}`}>
          {field.type === "checkbox" ? (
            <input
              type="checkbox"
              checked={Boolean(form.customFields?.[field.key])}
              onChange={(e) => updateCustomFieldValue(field, e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
              style={{ accentColor: "#0071e3", cursor: "pointer" }}
            />
          ) : field.type === "date" ? (
            <input
              type="date"
              value={String(form.customFields?.[field.key] || "")}
              onChange={(e) => updateCustomFieldValue(field, e.target.value)}
              className="input-field"
              style={{ fontSize: "13px" }}
            />
          ) : field.type === "number" ? (
            <input
              type="number"
              value={String(form.customFields?.[field.key] || "")}
              onChange={(e) => updateCustomFieldValue(field, e.target.value)}
              className="input-field"
              style={{ fontSize: "13px" }}
            />
          ) : (
            <input
              type="text"
              value={String(form.customFields?.[field.key] || "")}
              onChange={(e) => updateCustomFieldValue(field, e.target.value)}
              className="input-field"
              style={{ fontSize: "13px" }}
            />
          )}
        </div>
        {fieldErrors.customFields[field.key] && (
          <p className="text-[11px] text-red-500 mt-1 font-medium">{field.label} is required</p>
        )}
      </FieldRow>
    ));

  return (
    <>
      <Modal open={open} onClose={handleClose} title="" size="xl" hideHeader className="relative">
        <style>{`
          @keyframes cfm-slide-up {
            from { opacity: 0; transform: translateY(10px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes cfm-tab-in-right {
            from { opacity: 0; transform: translateX(22px); }
            to   { opacity: 1; transform: translateX(0); }
          }
          @keyframes cfm-tab-in-left {
            from { opacity: 0; transform: translateX(-22px); }
            to   { opacity: 1; transform: translateX(0); }
          }
          @keyframes cfm-contact-in {
            from { opacity: 0; transform: scale(0.97) translateY(6px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes cfm-dirty-in {
            from { opacity: 0; transform: translateX(6px); }
            to   { opacity: 1; transform: translateX(0); }
          }
          @keyframes cfm-shake {
            0%   { transform: translateX(0); }
            18%  { transform: translateX(-5px); }
            36%  { transform: translateX(5px); }
            54%  { transform: translateX(-4px); }
            72%  { transform: translateX(4px); }
            88%  { transform: translateX(-2px); }
            100% { transform: translateX(0); }
          }
          .cfm-section {
            animation: cfm-slide-up 0.28s cubic-bezier(0.4, 0, 0.2, 1) both;
          }
          .cfm-tab-enter-right {
            animation: cfm-tab-in-right 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
          }
          .cfm-tab-enter-left {
            animation: cfm-tab-in-left 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
          }
          .cfm-contact-card {
            animation: cfm-contact-in 0.22s cubic-bezier(0.34, 1.2, 0.64, 1) both;
          }
          .cfm-dirty-badge {
            animation: cfm-dirty-in 0.18s cubic-bezier(0.4, 0, 0.2, 1) both;
          }
          .cfm-seg-btn {
            transition: color 0.15s ease;
          }
          .cfm-seg-thumb {
            transition: transform 0.2s cubic-bezier(0.34, 1.3, 0.64, 1),
                        width 0.15s ease;
          }
          .cfm-input-row input:focus,
          .cfm-input-row select:focus,
          .cfm-input-row textarea:focus {
            outline: none;
            border-color: #0071e3;
            box-shadow: 0 0 0 3px rgba(0,113,227,0.15);
          }
          .cfm-input-error input,
          .cfm-input-error select,
          .cfm-input-error textarea {
            border-color: #ef4444 !important;
            box-shadow: 0 0 0 3px rgba(239,68,68,0.12) !important;
            animation: cfm-shake 0.38s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
          }
          .cfm-field-error {
            background-color: rgba(239,68,68,0.03);
          }
          .cfm-form-scroll {
            scrollbar-gutter: auto;
            -webkit-overflow-scrolling: touch;
          }
          .cfm-form-scroll::-webkit-scrollbar { width: 5px; }
          .cfm-form-scroll::-webkit-scrollbar-track { background: transparent; }
          .cfm-form-scroll::-webkit-scrollbar-thumb {
            background: rgba(128,128,128,0.35);
            border-radius: 99px;
          }
          .cfm-form-scroll::-webkit-scrollbar-thumb:hover {
            background: rgba(128,128,128,0.55);
          }
          .cfm-blur-header {
            position: sticky;
            top: 0;
            z-index: 10;
            backdrop-filter: blur(20px) saturate(1.8);
            -webkit-backdrop-filter: blur(20px) saturate(1.8);
            background-color: rgba(var(--color-card-rgb, 255,255,255), 0.60);
          }
          .cfm-blur-footer {
            position: sticky;
            bottom: 0;
            z-index: 10;
            backdrop-filter: blur(20px) saturate(1.8);
            -webkit-backdrop-filter: blur(20px) saturate(1.8);
            background-color: rgba(var(--color-card-rgb, 255,255,255), 0.60);
          }
          .cfm-tab-dot {
            display: inline-block;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            margin-left: 5px;
            vertical-align: middle;
            margin-bottom: 1px;
            background-color: #f59e0b;
          }
          .cfm-contact-inset {
            background-color: var(--color-surface);
            border-radius: 14px;
            overflow: visible;
          }
        `}</style>

        <form
          ref={formScrollRef}
          onSubmit={handleSubmit}
          className="relative flex flex-col flex-1 min-h-0 overflow-y-auto cfm-form-scroll"
        >
          {/* ── Sticky header ── */}
          <div
            ref={stickyHeaderRef}
            className="cfm-blur-header rounded-t-2xl"
            style={{ borderBottom: "1px solid var(--color-border-soft)" }}
          >
            {/* Title row */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4">
              <div>
                <h2
                  className="text-[17px] font-semibold tracking-tight leading-tight"
                  style={{ color: "var(--color-text)", letterSpacing: "-0.02em" }}
                >
                  {isEdit ? "Edit Client" : "Add New Client"}
                </h2>
                {editSubtitle && (
                  <p className="text-[13px] mt-0.5 font-normal" style={{ color: "var(--color-text-faint)" }}>
                    {editSubtitle}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                {unsavedLabel && (
                  <span
                    className="cfm-dirty-badge flex items-center gap-1.5 text-[12px] font-medium"
                    style={{ color: "var(--color-text-faint)" }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
                    {unsavedLabel}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
                  style={{
                    backgroundColor: "var(--color-surface)",
                    color: "var(--color-text-faint)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface)")}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Segmented control with per-tab dirty dots */}
            <div className="px-6 pb-4">
              <div
                className="inline-flex relative rounded-[10px] p-[3px]"
                style={{
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                }}
              >
                {/* Sliding thumb */}
                <div
                  className="cfm-seg-thumb absolute top-[3px] bottom-[3px] rounded-[7px]"
                  style={{
                    left: `calc(${activeTab === "basic" ? "3px" : "50% + 1.5px"})`,
                    width: `calc(50% - 4.5px)`,
                    backgroundColor: "var(--color-card)",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.14), 0 0 0 0.5px rgba(0,0,0,0.06)",
                  }}
                />
                {(["basic", "portal"] as const).map((tab) => {
                  const tabLabel = tab === "basic" ? "Basic Info" : "Portal Credentials";
                  const tabHasDirty =
                    (tab === "basic" && (dirtyTab === "basic" || dirtyTab === "both")) ||
                    (tab === "portal" && (dirtyTab === "portal" || dirtyTab === "both"));

                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => switchTab(tab)}
                      className="cfm-seg-btn relative z-10 px-5 py-[6px] text-[13px] font-medium rounded-[7px] w-36 text-center"
                      style={{
                        color: activeTab === tab ? "var(--color-text)" : "var(--color-text-faint)",
                      }}
                    >
                      {tabLabel}
                      {tabHasDirty && <span className="cfm-tab-dot" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Content ── */}
          <div className="flex-1 px-6 py-5" style={{ backgroundColor: "var(--color-surface)" }}>

            {/* ── BASIC TAB ── */}
            <div style={{ display: activeTab === "basic" ? "block" : "none" }}>
              <div
                className={`space-y-5 ${
                  tabAnimating
                    ? "opacity-0"
                    : tabSwitched
                    ? tabDirection === "right"
                      ? "cfm-tab-enter-right"
                      : "cfm-tab-enter-left"
                    : ""
                }`}
              >
                {/* Identity */}
                <InsetGroup title="Identity" animDelay={0}>
                  <FieldRow
                    label={isEdit ? "Client ID" : "Likely Client ID"}
                    hint={!isEdit ? "Preview — final ID assigned on save" : undefined}
                  >
                    <div className="flex gap-2 cfm-input-row">
                      <input
                        className="input-field font-mono flex-1"
                        style={{ fontSize: "13px", backgroundColor: "var(--color-surface)" }}
                        value={isEdit ? client.clientId : clientIdPreview}
                        readOnly
                      />
                      {!isEdit && (
                        <button
                          type="button"
                          onClick={() => generateId(form.category)}
                          disabled={idGenerating}
                          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all active:scale-90 disabled:opacity-50 flex-shrink-0"
                          style={{
                            backgroundColor: "var(--color-surface)",
                            border: "1px solid var(--color-border)",
                            color: "var(--color-text-faint)",
                          }}
                          title="Refresh preview"
                        >
                          {idGenerating
                            ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            : <Wand2 className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </FieldRow>

                  <FieldRow label="Category" last>
                    {isEdit ? (
                      <div
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
                        style={{
                          backgroundColor: "var(--color-surface)",
                          border: "1px solid var(--color-border)",
                          color: "var(--color-text-faint)",
                        }}
                      >
                        <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                        <CategoryBadge category={client.category} />
                        <span className="text-xs ml-auto" style={{ color: "var(--color-text-faint)" }}>locked</span>
                      </div>
                    ) : (
                      <div className="cfm-input-row">
                        <select
                          className="input-field"
                          style={{ fontSize: "13px" }}
                          value={form.category}
                          onChange={(e) => {
                            setForm({ ...form, category: e.target.value });
                            generateId(e.target.value);
                          }}
                          required
                        >
                          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    )}
                  </FieldRow>
                </InsetGroup>

                {/* Company */}
                <InsetGroup title="Company" animDelay={40}>
                  <FieldRow
                    label="Company Name"
                    error={fieldErrors.companyName}
                    fieldId="cfm-field-companyName"
                  >
                    <div ref={companyNameRef} className={`cfm-input-row ${fieldErrors.companyName ? "cfm-input-error" : ""}`}>
                      <input
                        className="input-field"
                        style={{ fontSize: "13px" }}
                        value={form.companyName}
                        onChange={(e) => {
                          setForm({ ...form, companyName: e.target.value });
                          if (fieldErrors.companyName) clearError("companyName");
                        }}
                        placeholder="Enter company name"
                        data-autofocus={!isEdit ? "true" : undefined}
                      />
                    </div>
                    {fieldErrors.companyName && (
                      <p className="text-[11px] text-red-500 mt-1 font-medium">Company name is required</p>
                    )}
                  </FieldRow>
                  <FieldRow label="Legal Name" last={companyCustomFields.length === 0}>
                    <div className="cfm-input-row">
                      <input
                        className="input-field"
                        style={{ fontSize: "13px" }}
                        value={form.legalName}
                        onChange={(e) => setForm({ ...form, legalName: e.target.value })}
                      />
                    </div>
                  </FieldRow>
                  {renderCustomFieldRows(companyCustomFields)}
                </InsetGroup>

                {beforeContactCustomFields.length > 0 && (
                  <InsetGroup title="Profile Fields" animDelay={60}>
                    {renderCustomFieldRows(beforeContactCustomFields)}
                  </InsetGroup>
                )}

                {/* Contacts */}
                <InsetGroup
                  title={`Contacts${showContactCards && persons.some(p => p.name.trim()) ? `  (${persons.length})` : ""}`}
                  animDelay={80}
                  allowOverflow
                  sectionRef={contactsSectionRef}
                >
                  {!showContactCards ? (
                    <ContactsEmptyState onAdd={addPerson} onPaste={() => setPasteModalOpen(true)} />
                  ) : (
                    <>
                      <div className="p-3 space-y-2.5">
                        {persons.map((entry, i) => (
                          <div
                            key={`${entry.personId || "new"}-${i}`}
                            className="cfm-contact-card cfm-contact-inset"
                            style={{ animationDelay: `${i * 40}ms` }}
                          >
                            <PersonEntryCard
                              entry={entry}
                              index={i}
                              total={persons.length}
                              onChange={(updated) => updatePerson(i, updated)}
                              onRemove={() => removePerson(i)}
                              onSetPrimary={() => setPrimary(i)}
                              initiallyExpanded={!entry.personId}
                            />
                          </div>
                        ))}
                      </div>
                      <div
                        className="px-4 py-3 border-t flex items-center gap-2"
                        style={{ borderColor: "var(--color-border-soft)" }}
                      >
                        <button
                          ref={addContactBtnRef}
                          type="button"
                          onClick={addPerson}
                          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[13px] font-medium transition-all active:scale-[0.98]"
                          style={{ color: "#0071e3", backgroundColor: "transparent" }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(0,113,227,0.06)")}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                        >
                          <UserPlus className="w-4 h-4" />
                          Add Another Contact
                        </button>
                        <div style={{ width: "1px", alignSelf: "stretch", backgroundColor: "var(--color-border-soft)" }} />
                        <button
                          type="button"
                          onClick={() => setPasteModalOpen(true)}
                          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-medium transition-all active:scale-[0.98]"
                          style={{ color: "var(--color-text-muted)", backgroundColor: "transparent" }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-hover)")}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                          title="Paste multiple contacts from a spreadsheet"
                        >
                          <ClipboardList className="w-4 h-4" />
                          Paste
                        </button>
                      </div>
                    </>
                  )}
                </InsetGroup>

                {afterContactCustomFields.length > 0 && (
                  <InsetGroup title="Additional Contact Details" animDelay={100}>
                    {renderCustomFieldRows(afterContactCustomFields)}
                  </InsetGroup>
                )}

                {/* Compliance */}
                <InsetGroup title="Compliance & Location" animDelay={120}>
                  <FieldRow
                    label="State"
                    error={fieldErrors.state}
                    fieldId="cfm-field-state"
                  >
                    <div ref={stateRef} className={`cfm-input-row ${fieldErrors.state ? "cfm-input-error" : ""}`}>
                      <select
                        className="input-field"
                        style={{ fontSize: "13px" }}
                        value={form.state}
                        onChange={(e) => {
                          setForm({ ...form, state: e.target.value });
                          if (fieldErrors.state) clearError("state");
                        }}
                      >
                        <option value="">Select State</option>
                        {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    {fieldErrors.state && (
                      <p className="text-[11px] text-red-500 mt-1 font-medium">State is required</p>
                    )}
                  </FieldRow>
                  <FieldRow label="GST Number">
                    <div className="cfm-input-row">
                      <input
                        className="input-field font-mono"
                        style={{ fontSize: "13px" }}
                        value={form.gstNumber}
                        onChange={(e) => setForm({ ...form, gstNumber: e.target.value })}
                        placeholder="22AAAAA0000A1Z5"
                      />
                    </div>
                  </FieldRow>
                  <FieldRow label="Address">
                    <div className="cfm-input-row">
                      <textarea
                        className="input-field"
                        style={{ fontSize: "13px" }}
                        rows={2}
                        value={form.address}
                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                      />
                    </div>
                  </FieldRow>
                  <FieldRow label="Reg. Number" last>
                    <div className="cfm-input-row">
                      <input
                        className="input-field font-mono"
                        style={{ fontSize: "13px" }}
                        value={form.registrationNumber}
                        onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
                      />
                    </div>
                  </FieldRow>
                </InsetGroup>
              </div>
            </div>

            {/* ── PORTAL TAB ── */}
            <div style={{ display: activeTab === "portal" ? "block" : "none" }}>
              <div
                className={`space-y-5 ${
                  tabAnimating
                    ? "opacity-0"
                    : tabSwitched
                    ? tabDirection === "right"
                      ? "cfm-tab-enter-right"
                      : "cfm-tab-enter-left"
                    : ""
                }`}
              >
                <InsetGroup animDelay={0}>
                  <div className="px-4 py-3.5 flex items-start gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: "rgba(245,158,11,0.12)" }}
                    >
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium" style={{ color: "var(--color-text)" }}>Admin Only</p>
                      <p className="text-[12px] mt-0.5 leading-relaxed" style={{ color: "var(--color-text-faint)" }}>
                        These credentials are stored securely and only visible to admins.
                      </p>
                    </div>
                  </div>
                </InsetGroup>

                <InsetGroup title="CPCB Portal" animDelay={40}>
                  <FieldRow label="Login ID">
                    <div className="cfm-input-row">
                      <input
                        className="input-field font-mono"
                        style={{ fontSize: "13px" }}
                        value={form.cpcbLoginId}
                        onChange={(e) => setForm({ ...form, cpcbLoginId: e.target.value })}
                        placeholder="username@cpcb"
                      />
                    </div>
                  </FieldRow>

                  <FieldRow label="Password">
                    <div className="cfm-input-row relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        className="input-field font-mono pr-16"
                        style={{ fontSize: "13px" }}
                        value={form.cpcbPassword}
                        onChange={(e) => setForm({ ...form, cpcbPassword: e.target.value })}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-medium transition-colors"
                        style={{ color: "#0071e3" }}
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                    {form.cpcbPassword && (
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(form.cpcbPassword)}
                        className="mt-1.5 text-[12px] font-medium transition-colors"
                        style={{ color: "#0071e3" }}
                      >
                        Copy password
                      </button>
                    )}
                  </FieldRow>

                  <FieldRow
                    label="OTP Mobile"
                    hint="Used to receive OTP during portal login"
                    last
                  >
                    <div className="cfm-input-row">
                      <input
                        className="input-field font-mono"
                        style={{ fontSize: "13px" }}
                        value={form.otpMobileNumber}
                        onChange={(e) => setForm({ ...form, otpMobileNumber: e.target.value })}
                        placeholder="+91 XXXXX XXXXX"
                      />
                    </div>
                  </FieldRow>
                </InsetGroup>
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div
            className="cfm-blur-footer flex items-center justify-between px-6 py-4"
            style={{ borderTop: "1px solid var(--color-border-soft)" }}
          >
            <button
              type="button"
              onClick={handleClose}
              className="text-[14px] font-medium transition-colors px-1"
              style={{ color: "var(--color-text-faint)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-faint)")}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saveDisabled}
              title={saveTitle}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-[14px] font-semibold transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: "#0071e3",
                color: "#fff",
                boxShadow: saveDisabled ? "none" : "0 1px 4px rgba(0,113,227,0.30)",
                letterSpacing: "-0.01em",
              }}
              onMouseEnter={(e) => { if (!saveDisabled) e.currentTarget.style.backgroundColor = "#0077ed"; }}
              onMouseLeave={(e) => { if (!saveDisabled) e.currentTarget.style.backgroundColor = "#0071e3"; }}
            >
              {saving
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                : primaryActionLabel
              }
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Paste-import modal ── */}
      <PasteImportModal
        open={pasteModalOpen}
        onClose={() => setPasteModalOpen(false)}
        onImport={handlePasteImport}
      />

      {/* ── Discard confirm — uses existing ConfirmModal, properly animated ── */}
      <ConfirmModal
        open={confirmingClose}
        title="Discard changes?"
        description="You have unsaved changes. If you close now they will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        variant="warning"
        onConfirm={async () => {
          setConfirmingClose(false);
          onClose();
        }}
        onClose={() => setConfirmingClose(false)}
      />
    </>
  );
}

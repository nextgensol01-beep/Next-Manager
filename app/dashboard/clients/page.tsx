"use client";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import TableWrapper from "@/components/ui/TableWrapper";
import EmptyState from "@/components/ui/EmptyState";
import { STATES, CATEGORIES, formatDate } from "@/lib/utils";
import { Plus, Search, Pencil, Trash2, Eye, UserPlus, X, Users, Wand2, RefreshCw, ChevronDown, MapPin, Calendar, Phone, Mail } from "lucide-react";
import { useCache, invalidate } from "@/lib/useCache";

const DEFAULT_CLIENT_ID_PREVIEW = "Likely ID: --";

// ── Types ────────────────────────────────────────────────────────────────────

interface Person {
  _id: string;
  name: string;
  phoneNumbers: string[];
  emails: string[];
  mobile?: string;
  email?: string;
}

interface LinkedPerson extends Person {
  personId?: string;
  allPhoneNumbers?: string[];
  allEmails?: string[];
  selectedPhones?: string[];
  selectedEmails?: string[];
  designation: string;
  isPrimaryContact: boolean;
  mobile: string;   // phoneNumbers[0] — for backward-compat display
  email:  string;   // emails[0]
}

interface Client {
  _id: string; clientId: string; companyName: string; category: string;
  state: string;
  address?: string; gstNumber?: string; registrationNumber?: string;
  cpcbLoginId?: string; cpcbPassword?: string; otpMobileNumber?: string;
  createdAt: string; contacts?: LinkedPerson[];
}

// ── Person form entry (one row in the contacts section of the modal) ─────────

interface PersonEntry {
  personId?:       string;    // set if selecting an existing person
  name:            string;
  phoneNumbers:    string[];
  emails:          string[];
  selectedPhones:  string[];
  selectedEmails:  string[];
  designation:     string;
  isPrimaryContact:boolean;
}

const normalizePhoneValue = (value: string) => value.trim();
const normalizeEmailValue = (value: string) => value.trim().toLowerCase();
const dedupe = (values: string[]) => Array.from(new Set(values));
const normalizePhoneList = (values: string[]) => dedupe(values.map(normalizePhoneValue).filter(Boolean));
const normalizeEmailList = (values: string[]) => dedupe(values.map(normalizeEmailValue).filter(Boolean));

const syncEntrySelections = (entry: PersonEntry): PersonEntry => {
  const phoneSet = new Set(normalizePhoneList(entry.phoneNumbers));
  const emailSet = new Set(normalizeEmailList(entry.emails));

  return {
    ...entry,
    selectedPhones: normalizePhoneList(entry.selectedPhones).filter((value) => phoneSet.has(value)),
    selectedEmails: normalizeEmailList(entry.selectedEmails).filter((value) => emailSet.has(value)),
  };
};

const createPersonEntry = (person?: Partial<LinkedPerson & Person>): PersonEntry => {
  const phoneNumbers = person?.allPhoneNumbers?.length
    ? person.allPhoneNumbers
    : person?.phoneNumbers?.length
      ? person.phoneNumbers
      : person?.mobile
        ? [person.mobile]
        : [""];

  const emails = person?.allEmails?.length
    ? person.allEmails
    : person?.emails?.length
      ? person.emails
      : person?.email
        ? [person.email]
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
  name: "", phoneNumbers: [""], emails: [""], selectedPhones: [], selectedEmails: [], designation: "", isPrimaryContact: false,
});

// ── Client form ───────────────────────────────────────────────────────────────

const emptyForm = {
  companyName: "", category: "PWP",
  state: "", address: "", gstNumber: "", registrationNumber: "",
  cpcbLoginId: "", cpcbPassword: "", otpMobileNumber: "",
};

// ── PersonSearch: autocomplete for existing persons ───────────────────────────

function PersonSearch({ value, onChange, onSelect }: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (p: Person) => void;
}) {
  const [results, setResults]   = useState<Person[]>([]);
  const [open,    setOpen]      = useState(false);
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
        const r = await fetch(`/api/persons?search=${encodeURIComponent(query)}`);
        const d = await r.json();
        const nextResults = Array.isArray(d) ? d : [];
        setResults(nextResults);
        setOpen(nextResults.length > 0);
      } catch {
        setResults([]);
        setOpen(false);
      }
    }, 250);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [value, isFocused]);

  return (
    <div className="relative">
      <input
        className="input-field w-full"
        placeholder="Type name to search or create…"
        value={value}
        onChange={(e) => {
          setIsFocused(true);
          onChange(e.target.value);
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
          {results.map((p) => (
            <button
              key={p._id}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                skipNextLookupRef.current = true;
                setIsFocused(false);
                setResults([]);
                setOpen(false);
                onSelect(p);
              }}
              className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-hover text-left transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-default">{p.name}</p>
                <p className="text-xs text-faint truncate">
                  {[...p.phoneNumbers, ...p.emails].filter(Boolean).join(" · ")}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── PersonEntryCard: one contact row in the modal ─────────────────────────────

function PersonEntryCard({
  entry, index, total,
  onChange, onRemove, onSetPrimary,
}: {
  entry: PersonEntry; index: number; total: number;
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

  const updatePhone = (i: number, val: string) => {
    const previousValue = entry.phoneNumbers[i] || "";
    const next = [...entry.phoneNumbers];
    next[i] = val;
    onChange(syncEntrySelections({
      ...entry,
      phoneNumbers: next,
      selectedPhones: remapSelectedValue(entry.selectedPhones, previousValue, val, "phone"),
    }));
  };
  const addPhone    = () => onChange({ ...entry, phoneNumbers: [...entry.phoneNumbers, ""] });
  const removePhone = (i: number) => {
    const removedValue = normalizePhoneValue(entry.phoneNumbers[i] || "");
    onChange(syncEntrySelections({
      ...entry,
      phoneNumbers: entry.phoneNumbers.filter((_, idx) => idx !== i),
      selectedPhones: entry.selectedPhones.filter((value) => value !== removedValue),
    }));
  };

  const updateEmail = (i: number, val: string) => {
    const previousValue = entry.emails[i] || "";
    const next = [...entry.emails];
    next[i] = val;
    onChange(syncEntrySelections({
      ...entry,
      emails: next,
      selectedEmails: remapSelectedValue(entry.selectedEmails, previousValue, val, "email"),
    }));
  };
  const addEmail    = () => onChange({ ...entry, emails: [...entry.emails, ""] });
  const removeEmail = (i: number) => {
    const removedValue = normalizeEmailValue(entry.emails[i] || "");
    onChange(syncEntrySelections({
      ...entry,
      emails: entry.emails.filter((_, idx) => idx !== i),
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

  const handleSelect = (p: Person) => {
    onChange(createPersonEntry({ ...p, personId: p._id, isPrimaryContact: entry.isPrimaryContact, designation: entry.designation }));
  };

  return (
    <div className="border border-base rounded-xl p-3 space-y-3 bg-surface">
      {/* Header */}
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

      {/* Name — with autocomplete */}
      <div>
        <label className="text-xs text-faint block mb-1">Name *</label>
        <PersonSearch
          value={entry.name}
          onChange={(v) => onChange({ ...entry, name: v, personId: undefined })}
          onSelect={handleSelect}
        />
      </div>

      {/* Phone numbers */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-faint flex items-center gap-1"><Phone className="w-3 h-3" />Phone Numbers</label>
          <button type="button" onClick={addPhone} className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-0.5">
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        <p className="text-[11px] text-faint mb-2">Only checked numbers will be used for this company.</p>
        <div className="space-y-1.5">
          {entry.phoneNumbers.map((ph, i) => (
            <div key={i} className="flex gap-2 items-center">
              <label className="flex items-center gap-1.5 text-[11px] text-muted whitespace-nowrap">
                <input
                  type="checkbox"
                  className="rounded border-base"
                  checked={entry.selectedPhones.includes(normalizePhoneValue(ph))}
                  disabled={!normalizePhoneValue(ph)}
                  onChange={() => toggleSelectedPhone(ph)}
                />
                Use
              </label>
              <input
                className="input-field flex-1 font-mono text-sm !py-1.5"
                placeholder="+91 98765 43210"
                value={ph}
                onChange={(e) => updatePhone(i, e.target.value)}
              />
              {entry.phoneNumbers.length > 1 && (
                <button type="button" onClick={() => removePhone(i)} className="p-1 text-faint hover:text-red-500 rounded flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Emails */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-faint flex items-center gap-1"><Mail className="w-3 h-3" />Email Addresses</label>
          <button type="button" onClick={addEmail} className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-0.5">
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        <p className="text-[11px] text-faint mb-2">Only checked email addresses will be used for this company.</p>
        <div className="space-y-1.5">
          {entry.emails.map((em, i) => (
            <div key={i} className="flex gap-2 items-center">
              <label className="flex items-center gap-1.5 text-[11px] text-muted whitespace-nowrap">
                <input
                  type="checkbox"
                  className="rounded border-base"
                  checked={entry.selectedEmails.includes(normalizeEmailValue(em))}
                  disabled={!normalizeEmailValue(em)}
                  onChange={() => toggleSelectedEmail(em)}
                />
                Use
              </label>
              <input
                type="email"
                className="input-field flex-1 text-sm !py-1.5"
                placeholder="john@company.com"
                value={em}
                onChange={(e) => updateEmail(i, e.target.value)}
              />
              {entry.emails.length > 1 && (
                <button type="button" onClick={() => removeEmail(i)} className="p-1 text-faint hover:text-red-500 rounded flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Designation */}
      <div>
        <label className="text-xs text-faint block mb-1">Designation</label>
        <input
          className="input-field text-sm !py-1.5"
          placeholder="e.g. Director, Manager"
          value={entry.designation}
          onChange={(e) => onChange({ ...entry, designation: e.target.value })}
        />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const router = useRouter();
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editClient,  setEditClient]  = useState<Client | null>(null);
  const [form,        setForm]        = useState(emptyForm);
  const [persons,     setPersons]     = useState<PersonEntry[]>([emptyPersonEntry()]);
  const [removedPersonIds, setRemovedPersonIds] = useState<string[]>([]);

  const [searchInput, setSearchInput] = useState("");
  const [search,      setSearch]      = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stateFilter,    setStateFilter]    = useState("all");
  const [saving,         setSaving]         = useState(false);
  const [activeTab,      setActiveTab]      = useState<"basic" | "portal">("basic");
  const [showPassword,   setShowPassword]   = useState(false);
  const [idGenerating,   setIdGenerating]   = useState(false);
  const [clientIdPreview, setClientIdPreview] = useState(DEFAULT_CLIENT_ID_PREVIEW);
  const [expandedRows,   setExpandedRows]   = useState<Set<string>>(new Set());
  const previewRequestRef = useRef(0);

  const generateId = async (category: string) => {
    const requestId = ++previewRequestRef.current;
    setIdGenerating(true);
    try {
      const r = await fetch(`/api/clients/generate-id?category=${encodeURIComponent(category)}`);
      if (!r.ok) throw new Error("Failed to load client ID preview");
      const d = await r.json();
      if (previewRequestRef.current !== requestId) return;
      setClientIdPreview(typeof d.clientId === "string" ? d.clientId : DEFAULT_CLIENT_ID_PREVIEW);
    } catch {
      if (previewRequestRef.current !== requestId) return;
      setClientIdPreview(DEFAULT_CLIENT_ID_PREVIEW);
    } finally {
      if (previewRequestRef.current === requestId) setIdGenerating(false);
    }
  };

  const clientsUrl = `/api/clients?${new URLSearchParams({
    ...(search         ? { search }                 : {}),
    ...(categoryFilter !== "all" ? { category: categoryFilter } : {}),
    ...(stateFilter    !== "all" ? { state: stateFilter }       : {}),
  })}`;
  const { data: clients, loading, refetch: refetchClients } = useCache<Client[]>(clientsUrl, { initialData: [] });

  const openAdd = () => {
    setEditClient(null); setForm(emptyForm);
    setPersons([emptyPersonEntry()]); setRemovedPersonIds([]);
    setClientIdPreview(DEFAULT_CLIENT_ID_PREVIEW);
    setActiveTab("basic"); setModalOpen(true); generateId("PWP");
  };

  const openEdit = (c: Client) => {
    setEditClient(c);
    setForm({
      companyName: c.companyName, category: c.category,
      state: c.state, address: c.address || "",
      gstNumber: c.gstNumber || "", registrationNumber: c.registrationNumber || "",
      cpcbLoginId: c.cpcbLoginId || "", cpcbPassword: c.cpcbPassword || "", otpMobileNumber: c.otpMobileNumber || "",
    });
    setClientIdPreview(c.clientId);
    const existingPersons: PersonEntry[] = (c.contacts || []).map((ct, i) => createPersonEntry({
      ...ct,
      personId: ct.personId || ct._id,
      designation: ct.designation || "",
      isPrimaryContact: ct.isPrimaryContact || i === 0,
    }));
    setPersons(existingPersons.length > 0 ? existingPersons : [emptyPersonEntry()]);
    setRemovedPersonIds([]);
    setActiveTab("basic"); setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const url    = editClient ? `/api/clients/${editClient.clientId}` : "/api/clients";
      const method = editClient ? "PUT" : "POST";
      const validPersons: PersonEntry[] = [];

      for (const person of persons) {
        const hasAnyContent = Boolean(
          person.name.trim() ||
          person.designation.trim() ||
          person.phoneNumbers.some((ph) => ph.trim()) ||
          person.emails.some((em) => em.trim())
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

      const payload = { ...form, persons: validPersons, removedPersonIds };
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) {
        let errMsg = "Something went wrong";
        try { const d = await r.json(); errMsg = d.error || errMsg; } catch { /* empty body */ }
        toast.error(errMsg); return;
      }
      const savedClient = await r.json();
      toast.success(editClient ? "Client updated!" : `Client added! ID: ${savedClient.clientId}`);
      setModalOpen(false); invalidate("/api/clients", "/api/dashboard"); refetchClients();
    } finally { setSaving(false); }
  };

  const handleDelete = async (clientId: string) => {
    if (!confirm("Delete this client?")) return;
    await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
    toast.success("Client deleted");
    invalidate("/api/clients", "/api/dashboard"); refetchClients();
  };

  const toggleExpand = (id: string) => setExpandedRows((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const addPerson = () => setPersons((prev) => [...prev, emptyPersonEntry()]);

  const removePerson = (index: number) => {
    const entry = persons[index];
    if (entry.personId) setRemovedPersonIds((prev) => [...prev, entry.personId!]);
    setPersons((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // Ensure at least one primary
      if (next.length > 0 && !next.some((p) => p.isPrimaryContact)) next[0].isPrimaryContact = true;
      return next;
    });
  };

  const updatePerson = (index: number, updated: PersonEntry) => {
    setPersons((prev) => prev.map((p, i) => i === index ? syncEntrySelections(updated) : p));
  };

  const setPrimary = (index: number) => {
    setPersons((prev) => prev.map((p, i) => ({ ...p, isPrimaryContact: i === index })));
  };

  const TabBtn = ({ id, label }: { id: "basic" | "portal"; label: string }) => (
    <button type="button" onClick={() => setActiveTab(id)}
      className={`glass-pill flex-1 justify-center ${activeTab === id ? "glass-pill-active" : ""}`}>
      {label}
    </button>
  );

  return (
    <div>
      <PageHeader title="Clients" description="Manage all client companies">
        <div className="glass-tray">
          <button className="glass-pill" onClick={() => router.push("/dashboard/contacts")}><UserPlus className="w-3.5 h-3.5" /> Contacts</button>
          <button className="glass-pill glass-pill-active" onClick={openAdd}><Plus className="w-3.5 h-3.5" /> Add Client</button>
        </div>
      </PageHeader>

      {/* Filters */}
      <div className="bg-card border border-base rounded-2xl p-3 mb-4 shadow-sm transition-colors flex flex-col sm:flex-row gap-2">
        <div className="flex items-center gap-2 flex-1 bg-surface rounded-xl px-3">
          <Search className="w-4 h-4 text-faint flex-shrink-0" />
          <input className="bg-transparent border-0 ring-0 outline-none flex-1 py-2 text-sm text-default placeholder:text-faint" placeholder="Search clients…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <select className="input-field flex-1 sm:flex-none sm:!w-auto" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">All Categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input-field flex-1 sm:flex-none sm:!w-auto" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="all">All States</option>
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* ── DESKTOP TABLE ── */}
      <div className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden transition-colors hidden lg:block">
        {loading ? <LoadingSpinner /> : clients.length === 0 ? <EmptyState message="No clients found" description="Add your first client to get started" /> : (
          <TableWrapper>
            <table className="w-full min-w-[680px]">
              <thead>
                <tr>
                  <th className="table-header">Client ID</th>
                  <th className="table-header">Company</th>
                  <th className="table-header">Category</th>
                  <th className="table-header">Contacts</th>
                  <th className="table-header">State</th>
                  <th className="table-header">Added</th>
                  <th className="table-header"></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => {
                  const clientContacts = client.contacts || [];
                  return (
                    <tr key={client._id} className="hover:bg-hover border-t border-soft transition-colors">
                      <td className="table-cell font-mono text-xs whitespace-nowrap">{client.clientId}</td>
                      <td className="table-cell font-semibold whitespace-nowrap max-w-[200px]">
                        <span className="block truncate" title={client.companyName}>{client.companyName}</span>
                      </td>
                      <td className="table-cell whitespace-nowrap"><CategoryBadge category={client.category} /></td>
                      <td className="table-cell">
                        {clientContacts.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {clientContacts.slice(0, 2).map((c) => (
                              <div key={String(c._id)} className="flex items-center gap-1.5 whitespace-nowrap">
                                <span className="text-xs font-medium text-default max-w-[90px] truncate" title={c.name}>{c.name}</span>
                                <span className="text-xs text-faint font-mono">{c.phoneNumbers?.[0] || c.mobile}</span>
                              </div>
                            ))}
                            {clientContacts.length > 2 && <span className="text-xs text-brand-600">+{clientContacts.length - 2} more</span>}
                          </div>
                        ) : <span className="text-faint text-xs">—</span>}
                      </td>
                      <td className="table-cell text-muted whitespace-nowrap">
                        <span className="max-w-[120px] truncate block" title={client.state}>{client.state}</span>
                      </td>
                      <td className="table-cell text-muted text-xs whitespace-nowrap">{formatDate(client.createdAt)}</td>
                      <td className="table-cell whitespace-nowrap">
                        <div className="flex gap-1">
                          <button onClick={() => router.push(`/dashboard/clients/${client.clientId}`)} className="p-1.5 text-faint hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors" title="View"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => openEdit(client)} className="p-1.5 text-faint hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors" title="Edit"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(client.clientId)} className="p-1.5 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrapper>
        )}
      </div>

      {/* ── MOBILE CARDS ── */}
      <div className="lg:hidden space-y-2">
        {loading ? <LoadingSpinner /> : clients.length === 0 ? <EmptyState message="No clients found" description="Add your first client to get started" /> : (
          clients.map((client) => {
            const isExpanded    = expandedRows.has(client._id);
            const clientContacts = client.contacts || [];
            return (
              <div key={client._id} className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden transition-colors">
                <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover transition-colors" onClick={() => toggleExpand(client._id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-default text-sm truncate">{client.companyName}</span>
                      <CategoryBadge category={client.category} />
                    </div>
                    <span className="text-xs text-faint font-mono mt-0.5 block">{client.clientId}</span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-faint flex-shrink-0 transition-transform duration-200" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }} />
                </button>
                {isExpanded && (
                  <div className="card-expand px-4 pb-4 border-t border-soft space-y-3 pt-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="flex items-center gap-1 text-muted"><MapPin className="w-3 h-3" />{client.state || "—"}</span>
                      <span className="flex items-center gap-1 text-muted"><Calendar className="w-3 h-3" />Added {formatDate(client.createdAt)}</span>
                    </div>
                    {clientContacts.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Contacts</p>
                        <div className="space-y-1.5">
                          {clientContacts.map((c) => (
                            <div key={String(c._id)} className="bg-surface rounded-lg px-3 py-2">
                              <p className="text-sm font-medium text-default">{c.name}</p>
                              {(c.phoneNumbers || []).filter(Boolean).map((ph, i) => (
                                <p key={i} className="text-xs text-faint font-mono flex items-center gap-1"><Phone className="w-3 h-3" />{ph}</p>
                              ))}
                              {(c.emails || []).filter(Boolean).map((em, i) => (
                                <p key={i} className="text-xs text-faint flex items-center gap-1"><Mail className="w-3 h-3" />{em}</p>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="glass-tray pt-0" style={{ marginTop: "8px", width: "100%" }}>
                      <button onClick={() => router.push(`/dashboard/clients/${client.clientId}`)} className="glass-pill flex-1 justify-center"><Eye className="w-3.5 h-3.5" /> View</button>
                      <button onClick={() => openEdit(client)} className="glass-pill flex-1 justify-center"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                      <button onClick={() => handleDelete(client.clientId)} className="glass-pill flex-1 justify-center" style={{ color: "#ff3b30" }}><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── MODAL ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editClient ? "Edit Client" : "Add New Client"} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="glass-tray" style={{ width: "100%" }}>
            <TabBtn id="basic" label="Basic Info" />
            <TabBtn id="portal" label="Portal Credentials" />
          </div>

          {activeTab === "basic" && (
            <div className="space-y-3">
              {/* Client ID + Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">{editClient ? "Client ID" : "Likely Client ID"}</label>
                  <div className="flex gap-1.5">
                    <input className="input-field font-mono flex-1" value={editClient ? editClient.clientId : clientIdPreview} readOnly placeholder="Likely ID: PWP-001" />
                    {!editClient && (
                      <button type="button" onClick={() => generateId(form.category)} disabled={idGenerating} className="w-9 h-9 flex items-center justify-center rounded-lg border border-base bg-surface hover:bg-hover text-muted hover:text-brand-600 transition-colors flex-shrink-0 disabled:cursor-not-allowed disabled:opacity-60">
                        {idGenerating ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Wand2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                  {!editClient && <p className="text-xs text-faint mt-1 flex items-center gap-1"><Wand2 className="w-2.5 h-2.5" /> Preview only. The final client ID is assigned on save.</p>}
                </div>
                <div>
                  <label className="label">Category *</label>
                  <select className="input-field" value={form.category} onChange={(e) => { setForm({ ...form, category: e.target.value }); if (!editClient) generateId(e.target.value); }} required>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Company Name */}
              <div>
                <label className="label">Company Name *</label>
                <input className="input-field" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required />
              </div>

              {/* ── Contacts section ── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0 flex items-center gap-1.5"><Users className="w-3 h-3" />Contacts</label>
                  <button type="button" onClick={addPerson} className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add Contact
                  </button>
                </div>
                <div className="space-y-3">
                  {persons.map((entry, i) => (
                    <PersonEntryCard
                      key={i}
                      entry={entry}
                      index={i}
                      total={persons.length}
                      onChange={(updated) => updatePerson(i, updated)}
                      onRemove={() => removePerson(i)}
                      onSetPrimary={() => setPrimary(i)}
                    />
                  ))}
                </div>
              </div>

              {/* State + GST */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">State *</label>
                  <select className="input-field" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} required>
                    <option value="">Select State</option>
                    {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">GST Number</label>
                  <input className="input-field font-mono text-sm" value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} placeholder="22AAAAA0000A1Z5" />
                </div>
              </div>

              <div>
                <label className="label">Address</label>
                <textarea className="input-field" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div>
                <label className="label">Registration Number</label>
                <input className="input-field font-mono text-sm" value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} />
              </div>
            </div>
          )}

          {activeTab === "portal" && (
            <div className="space-y-3">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-400">
                ⚠️ These credentials are stored securely and only visible to admins.
              </div>
              <div>
                <label className="label">CPCB Login ID</label>
                <input className="input-field font-mono text-sm" value={form.cpcbLoginId} onChange={(e) => setForm({ ...form, cpcbLoginId: e.target.value })} placeholder="e.g. username@cpcb" />
              </div>
              <div>
                <label className="label">CPCB Password</label>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} className="input-field font-mono text-sm pr-16" value={form.cpcbPassword} onChange={(e) => setForm({ ...form, cpcbPassword: e.target.value })} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-600 font-medium">{showPassword ? "Hide" : "Show"}</button>
                </div>
              </div>
              <div>
                <label className="label">OTP Mobile Number</label>
                <input className="input-field font-mono text-sm" value={form.otpMobileNumber} onChange={(e) => setForm({ ...form, otpMobileNumber: e.target.value })} placeholder="+91 XXXXX XXXXX" />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t border-base">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving}>{saving ? "Saving..." : editClient ? "Update Client" : "Add Client"}</button>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

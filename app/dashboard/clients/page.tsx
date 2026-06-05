"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import PageHeader from "@/components/ui/PageHeader";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import TableWrapper from "@/components/ui/TableWrapper";
import EmptyState from "@/components/ui/EmptyState";
import { STATES, CATEGORIES, formatDate } from "@/lib/utils";
import { Plus, Search, Pencil, Trash2, Eye, UserPlus, ChevronDown, MapPin, Calendar, Phone, Mail } from "lucide-react";
import { useCache, invalidate } from "@/lib/useCache";
import {
  normalizeEmailList,
  normalizePhoneList,
  syncEntrySelections,
  type PersonEntry,
} from "@/app/dashboard/clients/[clientId]/ClientProfileSupport";
import ClientFormModal from "@/components/clients/ClientFormModal";
import type { ClientFormData } from "@/components/clients/ClientFormModal";
import type { ClientCustomFieldDefinition, ClientCustomFieldValues } from "@/lib/clientCustomFields";

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
  _id: string; clientId: string; companyName: string; legalName?: string; category: string;
  state: string;
  address?: string; gstNumber?: string; registrationNumber?: string;
  cpcbLoginId?: string; cpcbPassword?: string; otpMobileNumber?: string;
  customFields?: ClientCustomFieldValues;
  createdAt: string; contacts?: LinkedPerson[];
}


// ── Client form ───────────────────────────────────────────────────────────────

// ── PersonSearch: autocomplete for existing persons ───────────────────────────


// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const router = useRouter();
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editClient,  setEditClient]  = useState<Client | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search,      setSearch]      = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stateFilter,    setStateFilter]    = useState("all");
  const [expandedRows,   setExpandedRows]   = useState<Set<string>>(new Set());


  const clientsUrl = `/api/clients?${new URLSearchParams({
    ...(search         ? { search }                 : {}),
    ...(categoryFilter !== "all" ? { category: categoryFilter } : {}),
    ...(stateFilter    !== "all" ? { state: stateFilter }       : {})})}`;
  const { data: clients, loading, refetch: refetchClients } = useCache<Client[]>(clientsUrl, { initialData: [] });
  const { data: customFieldDefinitions } = useCache<ClientCustomFieldDefinition[]>("/api/client-custom-fields", { initialData: [] });

  const openAdd = () => {
    setEditClient(null);
    setModalOpen(true);
  };

  const openEdit = (c: Client) => {
    setEditClient(c);
    setModalOpen(true);
  };

  const [saving, setSaving] = useState(false);

  const handleSaveClient = async (
    data: ClientFormData,
    formPersons: PersonEntry[],
    removedIds: string[]
  ) => {
    setSaving(true);
    try {
      const url    = editClient ? `/api/clients/${editClient.clientId}` : "/api/clients";
      const method = editClient ? "PUT" : "POST";
      const validPersons: PersonEntry[] = [];

      for (const person of formPersons) {
        const hasAnyContent = Boolean(
          person.name.trim() || person.designation.trim() ||
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
          selectedEmails: person.selectedEmails});

        if (!prepared.name) { toast.error("Each linked contact needs a name."); return; }
        if (prepared.phoneNumbers.length === 0 && prepared.emails.length === 0) {
          toast.error(`Contact "${prepared.name}" needs at least one phone number or email.`); return;
        }
        if (prepared.selectedPhones.length === 0 && prepared.selectedEmails.length === 0) {
          toast.error(`Select at least one phone or email for "${prepared.name}".`); return;
        }
        validPersons.push(prepared);
      }

      const payload = { ...data, persons: validPersons, removedPersonIds: removedIds };
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) {
        let errMsg = "Something went wrong";
        try { const d = await r.json(); errMsg = d.error || errMsg; } catch { /* empty */ }
        toast.error(errMsg); return;
      }
      const savedClient = await r.json();
      toast.success(editClient ? "Client updated!" : `Client added! ID: ${savedClient.clientId}`);
      setModalOpen(false);
      invalidate("/api/clients", "/api/dashboard");
      refetchClients();
    } finally {
      setSaving(false);
    }
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

      {/* ── CLIENT FORM MODAL (Add + Edit) ── */}
      <ClientFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        client={editClient}
        customFieldDefinitions={customFieldDefinitions}
        onSave={handleSaveClient}
        saving={saving}
      />
    </div>
  );
}

"use client";
import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import TableWrapper from "@/components/ui/TableWrapper";
import EmptyState from "@/components/ui/EmptyState";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { formatDate } from "@/lib/utils";
import { Plus, Search, Pencil, Trash2, ChevronDown, ChevronUp, Building2, Phone, X, Users } from "lucide-react";
import { useCache, invalidate } from "@/lib/useCache";

interface Person {
  _id: string;
  name: string;
  phoneNumbers: string[];
  emails: string[];
  createdAt: string;
  companies?: { clientId: string; companyName: string; category: string; state: string; designation?: string }[];
}

const emptyForm = { name: "", phoneNumbers: [""], emails: [""] };

export default function ContactsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const [modalOpen,    setModalOpen]    = useState(false);
  const [editPerson,   setEditPerson]   = useState<Person | null>(null);
  const [form,         setForm]         = useState(emptyForm);
  const [saving,       setSaving]       = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Fetch persons from /api/persons
  const personsUrl = `/api/persons?limit=all${search ? `&search=${encodeURIComponent(search)}` : ""}`;
  const { data: rawPersons, loading, refetch } = useCache<Person[]>(personsUrl, { initialData: [] });
  const { data: allPersons } = useCache<Person[]>("/api/persons?limit=all", { initialData: [] });
  // Fetch companies per person via /api/contacts (legacy endpoint, still works)
  const { data: contactsWithCompanies } = useCache<(Person & { companies: Person["companies"] })[]>(
    `/api/contacts?withCompanies=true${search ? `&search=${encodeURIComponent(search)}` : ""}`,
    { initialData: [] }
  );

  // Merge company data into persons
  const persons: Person[] = (rawPersons || []).map((p) => {
    const withCo = (contactsWithCompanies || []).find((c) => c._id === p._id);
    return { ...p, companies: withCo?.companies || [] };
  });
  const totalContacts = allPersons.length;
  const shownContacts = persons.length;
  const hasSearch = Boolean(search.trim());

  const openAdd = () => { setEditPerson(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (p: Person) => {
    setEditPerson(p);
    setForm({
      name:         p.name,
      phoneNumbers: p.phoneNumbers.length > 0 ? p.phoneNumbers : [""],
      emails:       p.emails.length       > 0 ? p.emails       : [""],
    });
    setModalOpen(true);
  };

  const updatePhone = (i: number, val: string) => setForm((f) => { const n = [...f.phoneNumbers]; n[i] = val; return { ...f, phoneNumbers: n }; });
  const addPhone    = () => setForm((f) => ({ ...f, phoneNumbers: [...f.phoneNumbers, ""] }));
  const removePhone = (i: number) => setForm((f) => ({ ...f, phoneNumbers: f.phoneNumbers.filter((_, idx) => idx !== i) }));

  const updateEmail = (i: number, val: string) => setForm((f) => { const n = [...f.emails]; n[i] = val; return { ...f, emails: n }; });
  const addEmail    = () => setForm((f) => ({ ...f, emails: [...f.emails, ""] }));
  const removeEmail = (i: number) => setForm((f) => ({ ...f, emails: f.emails.filter((_, idx) => idx !== i) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const phones = form.phoneNumbers.map((p) => p.trim()).filter(Boolean);
    if (phones.length === 0) { toast.error("Add at least one phone number"); return; }
    setSaving(true);
    try {
      const url    = editPerson ? `/api/persons/${editPerson._id}` : "/api/persons";
      const method = editPerson ? "PUT" : "POST";
      const payload = {
        name:         form.name.trim(),
        phoneNumbers: phones,
        emails:       form.emails.map((e) => e.trim()).filter(Boolean),
      };
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) { toast.error("Error saving"); return; }
      const data = await r.json();
      if (data.merged) toast.success("Merged with existing person");
      else toast.success(editPerson ? "Contact updated!" : "Contact added!");
      invalidate("/api/persons", "/api/contacts");
      setModalOpen(false); refetch();
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this person? They will be unlinked from all companies.")) return;
    await fetch(`/api/persons/${id}`, { method: "DELETE" });
    toast.success("Deleted");
    invalidate("/api/persons", "/api/contacts", "/api/clients"); refetch();
  };

  const toggleRow = (id: string) => {
    const next = new Set(expandedRows);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedRows(next);
  };

  return (
    <div>
      <PageHeader title="Contacts" description="Manage persons — one person can link to multiple companies">
        <button className="glass-btn glass-btn-primary" onClick={openAdd}><Plus className="w-3.5 h-3.5" /> Add Person</button>
      </PageHeader>

      <div className="bg-card rounded-2xl p-4 mb-4 shadow-sm border border-base flex gap-3">
        <div className="flex items-center gap-2 flex-1">
          <Search className="w-4 h-4 text-faint flex-shrink-0" />
          <input className="input-field !border-0 !ring-0 flex-1" placeholder="Search by name, phone, or email..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
        <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-soft flex-shrink-0">
          <Users className="w-4 h-4 text-brand-600" />
          <div className="text-right leading-tight">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Total Contacts</p>
            <p className="text-sm font-semibold text-default">
              {totalContacts} contact{totalContacts === 1 ? "" : "s"}
            </p>
            {hasSearch && (
              <p className="text-[11px] text-brand-600 font-medium">
                {shownContacts} result{shownContacts === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="sm:hidden mb-4">
        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-base shadow-sm">
          <Users className="w-4 h-4 text-brand-600" />
          <span className="text-sm font-semibold text-default">
            {totalContacts} contact{totalContacts === 1 ? "" : "s"}
          </span>
          {hasSearch && (
            <span className="text-xs font-medium text-brand-600">
              {shownContacts} result{shownContacts === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      {/* ── DESKTOP TABLE ── */}
      <div className="bg-card rounded-2xl shadow-sm border border-base overflow-hidden hidden lg:block">
        {loading ? <LoadingSpinner /> : persons.length === 0 ? <EmptyState message="No contacts found" description="Add a person to get started" /> : (
          <TableWrapper>
            <table className="w-full min-w-[620px]">
              <thead>
                <tr>
                  <th className="table-header">Name</th>
                  <th className="table-header">Phone Numbers</th>
                  <th className="table-header">Emails</th>
                  <th className="table-header">Companies</th>
                  <th className="table-header">Added</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody>
                {persons.map((p) => (
                  <React.Fragment key={p._id}>
                    <tr className="hover:bg-surface transition-colors">
                      <td className="table-cell font-medium text-default whitespace-nowrap">
                        <span className="max-w-[140px] truncate block" title={p.name}>{p.name}</span>
                      </td>
                      <td className="table-cell whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          {p.phoneNumbers.slice(0, 2).map((ph, i) => (
                            <span key={i} className="text-xs font-mono text-default flex items-center gap-1"><Phone className="w-3 h-3 text-faint" />{ph}</span>
                          ))}
                          {p.phoneNumbers.length > 2 && <span className="text-xs text-brand-600">+{p.phoneNumbers.length - 2} more</span>}
                        </div>
                      </td>
                      <td className="table-cell whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          {p.emails.slice(0, 1).map((em, i) => (
                            <span key={i} className="text-xs text-muted max-w-[160px] truncate block" title={em}>{em}</span>
                          ))}
                          {p.emails.length > 1 && <span className="text-xs text-brand-600">+{p.emails.length - 1} more</span>}
                        </div>
                      </td>
                      <td className="table-cell whitespace-nowrap">
                        {(p.companies?.length || 0) > 0 ? (
                          <button onClick={() => toggleRow(p._id)} className="flex items-center gap-1 text-brand-600 text-sm font-medium hover:text-brand-700">
                            <Building2 className="w-3.5 h-3.5" />
                            {p.companies!.length} {p.companies!.length === 1 ? "company" : "companies"}
                            {expandedRows.has(p._id) ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        ) : <span className="text-faint text-sm">None</span>}
                      </td>
                      <td className="table-cell text-faint whitespace-nowrap">{formatDate(p.createdAt)}</td>
                      <td className="table-cell whitespace-nowrap">
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(p)} className="p-1.5 text-faint hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(p._id)} className="p-1.5 text-faint hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                    {expandedRows.has(p._id) && p.companies && p.companies.length > 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 pb-3 bg-surface">
                          <div className="flex flex-wrap gap-2 pt-2">
                            {p.companies.map((co) => (
                              <div key={co.clientId} className="flex items-center gap-2 bg-card border border-base rounded-lg px-3 py-1.5">
                                <CategoryBadge category={co.category} />
                                <span className="text-sm font-medium text-default">{co.companyName}</span>
                                {co.designation && <span className="text-xs text-faint">· {co.designation}</span>}
                                <span className="text-xs text-faint">{co.state}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        )}
      </div>

      {/* ── MOBILE CARDS ── */}
      <div className="lg:hidden space-y-2">
        {loading ? <LoadingSpinner /> : persons.length === 0 ? <EmptyState message="No contacts found" /> : (
          persons.map((p) => {
            const isExpanded = expandedRows.has(p._id);
            return (
              <div key={p._id} className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden">
                <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover transition-colors" onClick={() => toggleRow(p._id)}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-default truncate">{p.name}</p>
                    <p className="text-xs text-faint font-mono mt-0.5">{p.phoneNumbers[0] || "—"}</p>
                  </div>
                  {(p.companies?.length || 0) > 0 && <span className="text-xs text-brand-600 font-medium flex-shrink-0">{p.companies!.length} co.</span>}
                  <ChevronDown className="w-4 h-4 text-faint flex-shrink-0 transition-transform duration-200" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }} />
                </button>
                {isExpanded && (
                  <div className="card-expand px-4 pb-4 border-t border-soft space-y-3 pt-3">
                    {p.phoneNumbers.length > 1 && (
                      <div>
                        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">All Numbers</p>
                        {p.phoneNumbers.map((ph, i) => <p key={i} className="text-xs font-mono text-default">{ph}</p>)}
                      </div>
                    )}
                    {p.emails.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Emails</p>
                        {p.emails.map((em, i) => <p key={i} className="text-xs text-default break-all">{em}</p>)}
                      </div>
                    )}
                    {(p.companies?.length || 0) > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Linked Companies</p>
                        <div className="space-y-1.5">
                          {p.companies!.map((co) => (
                            <div key={co.clientId} className="flex items-center gap-2 bg-surface rounded-lg px-3 py-2">
                              <CategoryBadge category={co.category} />
                              <span className="text-sm font-medium text-default truncate">{co.companyName}</span>
                              <span className="text-xs text-faint ml-auto">{co.state}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="glass-tray" style={{ marginTop: "8px", width: "100%" }}>
                      <button onClick={() => openEdit(p)} className="glass-pill flex-1 justify-center"><Pencil className="w-3.5 h-3.5" />Edit</button>
                      <button onClick={() => handleDelete(p._id)} className="glass-pill flex-1 justify-center" style={{ color: "#ff3b30" }}><Trash2 className="w-3.5 h-3.5" />Delete</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── MODAL ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editPerson ? "Edit Person" : "Add Person"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Full Name *</label>
            <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="John Doe" />
          </div>

          {/* Phone Numbers */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Phone Numbers *</label>
              <button type="button" onClick={addPhone} className="text-xs text-brand-600 font-medium flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>
            </div>
            <div className="space-y-2">
              {form.phoneNumbers.map((ph, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input className="input-field flex-1 font-mono text-sm" placeholder="+91 98765 43210" value={ph} onChange={(e) => updatePhone(i, e.target.value)} />
                  {form.phoneNumbers.length > 1 && (
                    <button type="button" onClick={() => removePhone(i)} className="p-1.5 text-faint hover:text-red-500 rounded-lg"><X className="w-4 h-4" /></button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Emails */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Email Addresses</label>
              <button type="button" onClick={addEmail} className="text-xs text-brand-600 font-medium flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>
            </div>
            <div className="space-y-2">
              {form.emails.map((em, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input type="email" className="input-field flex-1 text-sm" placeholder="john@company.com" value={em} onChange={(e) => updateEmail(i, e.target.value)} />
                  {form.emails.length > 1 && (
                    <button type="button" onClick={() => removeEmail(i)} className="p-1.5 text-faint hover:text-red-500 rounded-lg"><X className="w-4 h-4" /></button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-base">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving}>{saving ? "Saving..." : editPerson ? "Update" : "Add Person"}</button>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

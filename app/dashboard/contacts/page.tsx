"use client";
import React, { useState } from "react";
import toast from "react-hot-toast";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import TableWrapper from "@/components/ui/TableWrapper";
import EmptyState from "@/components/ui/EmptyState";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { formatDate } from "@/lib/utils";
import { Plus, Search, Pencil, Trash2, ChevronDown, ChevronUp, Building2 } from "lucide-react";
import { useCache, invalidate } from "@/lib/useCache";

interface Contact {
  _id: string;
  name: string;
  mobile: string;
  email?: string;
  designation?: string;
  notes?: string;
  createdAt: string;
  companies?: { clientId: string; companyName: string; category: string; state: string }[];
}

const emptyForm = { name: "", mobile: "", email: "", designation: "", notes: "" };

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const contactsUrl = `/api/contacts?withCompanies=true${search ? `&search=${encodeURIComponent(search)}` : ""}`;
  const { data: contacts, loading, refetch } = useCache<Contact[]>(contactsUrl, { initialData: [] });

  const openAdd = () => { setEditContact(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (c: Contact) => {
    setEditContact(c);
    setForm({ name: c.name, mobile: c.mobile, email: c.email || "", designation: c.designation || "", notes: c.notes || "" });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editContact ? `/api/contacts/${editContact._id}` : "/api/contacts";
      const method = editContact ? "PUT" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!r.ok) { toast.error("Error saving contact"); return; }
      toast.success(editContact ? "Contact updated!" : "Contact added!");
      invalidate("/api/contacts");
      setModalOpen(false);
      refetch();
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this contact? They will be unlinked from all companies.")) return;
    const r = await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Failed to delete contact"); return; }
    toast.success("Contact deleted");
    invalidate("/api/contacts", "/api/clients");
    refetch();
  };

  const toggleRow = (id: string) => {
    const s = new Set(expandedRows);
    s.has(id) ? s.delete(id) : s.add(id);
    setExpandedRows(s);
  };

  return (
    <div>
      <PageHeader title="Contacts" description="Manage contact persons — one person can link to multiple companies">
        <button className="btn-primary" onClick={openAdd}><Plus className="w-4 h-4" /> Add Contact</button>
      </PageHeader>

      <div className="bg-card rounded-2xl p-4 mb-4 shadow-sm border border-base flex gap-3">
        <div className="flex items-center gap-2 flex-1">
          <Search className="w-4 h-4 text-faint flex-shrink-0" />
          <input className="input-field !border-0 !ring-0 flex-1" placeholder="Search by name, mobile, or email..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* ── DESKTOP TABLE ── */}
      <div className="bg-card rounded-2xl shadow-sm border border-base overflow-hidden hidden lg:block">
        {loading ? <LoadingSpinner /> : contacts.length === 0 ? <EmptyState message="No contacts found" description="Add a contact person to get started" /> : (
          <TableWrapper>
            <table className="w-full min-w-[620px]">
              <thead>
                <tr>
                  <th className="table-header">Name</th>
                  <th className="table-header">Mobile</th>
                  <th className="table-header">Email</th>
                  <th className="table-header">Designation</th>
                  <th className="table-header">Companies</th>
                  <th className="table-header">Added</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <React.Fragment key={c._id}>
                    <tr className="hover:bg-surface transition-colors">
                      <td className="table-cell font-medium text-default whitespace-nowrap"><span className="max-w-[140px] truncate block" title={c.name}>{c.name}</span></td>
                      <td className="table-cell font-mono text-sm whitespace-nowrap">{c.mobile}</td>
                      <td className="table-cell text-muted whitespace-nowrap"><span className="max-w-[160px] truncate block" title={c.email || ""}>{c.email || "—"}</span></td>
                      <td className="table-cell whitespace-nowrap">{c.designation || "—"}</td>
                      <td className="table-cell whitespace-nowrap">
                        {(c.companies?.length || 0) > 0 ? (
                          <button onClick={() => toggleRow(c._id)} className="flex items-center gap-1 text-brand-600 text-sm font-medium hover:text-brand-700">
                            <Building2 className="w-3.5 h-3.5" />
                            {c.companies!.length} {c.companies!.length === 1 ? "company" : "companies"}
                            {expandedRows.has(c._id) ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        ) : <span className="text-faint text-sm">None</span>}
                      </td>
                      <td className="table-cell text-faint whitespace-nowrap">{formatDate(c.createdAt)}</td>
                      <td className="table-cell whitespace-nowrap">
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(c)} className="p-1.5 text-faint hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(c._id)} className="p-1.5 text-faint hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                    {expandedRows.has(c._id) && c.companies && c.companies.length > 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 pb-3 bg-surface">
                          <div className="flex flex-wrap gap-2 pt-2">
                            {c.companies.map((co) => (
                              <div key={co.clientId} className="flex items-center gap-2 bg-card border border-base rounded-lg px-3 py-1.5">
                                <CategoryBadge category={co.category} />
                                <span className="text-sm font-medium text-default">{co.companyName}</span>
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
        {loading ? <LoadingSpinner /> : contacts.length === 0 ? <EmptyState message="No contacts found" description="Add a contact person to get started" /> : (
          contacts.map((c) => {
            const isExpanded = expandedRows.has(c._id);
            return (
              <div key={c._id} className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden">
                <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover transition-colors" onClick={() => toggleRow(c._id)}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-default truncate">{c.name}</p>
                    <p className="text-xs text-faint font-mono mt-0.5">{c.mobile}</p>
                  </div>
                  {(c.companies?.length || 0) > 0 && (
                    <span className="text-xs text-brand-600 font-medium flex-shrink-0">{c.companies!.length} co.</span>
                  )}
                  <ChevronDown className="w-4 h-4 text-faint flex-shrink-0 transition-transform duration-200" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }} />
                </button>
                {isExpanded && (
                  <div className="card-expand px-4 pb-4 border-t border-soft space-y-3 pt-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {c.email && <div className="col-span-2"><span className="text-faint block">Email</span><span className="text-default break-all">{c.email}</span></div>}
                      {c.designation && <div><span className="text-faint block">Designation</span><span className="text-default">{c.designation}</span></div>}
                      <div><span className="text-faint block">Added</span><span className="text-default">{formatDate(c.createdAt)}</span></div>
                    </div>
                    {(c.companies?.length || 0) > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Linked Companies</p>
                        <div className="space-y-1.5">
                          {c.companies!.map((co) => (
                            <div key={co.clientId} className="flex items-center gap-2 bg-surface rounded-lg px-3 py-2">
                              <CategoryBadge category={co.category} />
                              <span className="text-sm font-medium text-default truncate">{co.companyName}</span>
                              <span className="text-xs text-faint ml-auto">{co.state}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => openEdit(c)} className="flex-1 btn-secondary justify-center text-xs py-1.5"><Pencil className="w-3.5 h-3.5" />Edit</button>
                      <button onClick={() => handleDelete(c._id)} className="flex-1 justify-center text-xs py-1.5 flex items-center gap-1.5 text-red-500 border border-red-200 dark:border-red-900/40 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors font-medium"><Trash2 className="w-3.5 h-3.5" />Delete</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editContact ? "Edit Contact" : "Add Contact"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Full Name *</label>
              <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="John Doe" />
            </div>
            <div>
              <label className="label">Mobile *</label>
              <input className="input-field" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} required placeholder="+91 98765 43210" />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input-field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@company.com" />
            </div>
            <div>
              <label className="label">Designation</label>
              <input className="input-field" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Director, Manager" />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input-field" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any additional notes..." />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving}>{saving ? "Saving..." : editContact ? "Update Contact" : "Add Contact"}</button>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

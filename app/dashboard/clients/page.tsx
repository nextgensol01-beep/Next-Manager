"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import TableWrapper from "@/components/ui/TableWrapper";
import EmptyState from "@/components/ui/EmptyState";
import { STATES, CATEGORIES, formatDate } from "@/lib/utils";
import { Plus, Search, Pencil, Trash2, Eye, UserPlus, X, Users, Wand2, RefreshCw, ChevronDown, MapPin, Calendar } from "lucide-react";
import { useCache, invalidate } from "@/lib/useCache";

interface Contact { _id: string; name: string; mobile: string; email?: string; designation?: string; }
interface Client {
  _id: string; clientId: string; companyName: string; category: string;
  contactIds?: string[]; contactId?: string; contactPerson?: string;
  email?: string; mobile?: string; state: string;
  address?: string; gstNumber?: string; registrationNumber?: string;
  cpcbLoginId?: string; cpcbPassword?: string; otpMobileNumber?: string;
  createdAt: string; contacts?: Contact[];
}

const emptyForm = {
  clientId: "", companyName: "", category: "PWP",
  contactIds: [] as string[],
  state: "", address: "", gstNumber: "", registrationNumber: "",
  cpcbLoginId: "", cpcbPassword: "", otpMobileNumber: "",
};

export default function ClientsPage() {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"basic" | "portal">("basic");
  const [showPassword, setShowPassword] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [idGenerating, setIdGenerating] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { data: contacts } = useCache<Contact[]>("/api/contacts", { initialData: [] });

  const generateId = async (category: string) => {
    setIdGenerating(true);
    try {
      const r = await fetch(`/api/clients/generate-id?category=${encodeURIComponent(category)}`);
      const d = await r.json();
      setForm((f) => ({ ...f, clientId: d.clientId }));
    } finally { setIdGenerating(false); }
  };

  const clientsUrl = `/api/clients?${new URLSearchParams({
    ...(search ? { search } : {}),
    ...(categoryFilter !== "all" ? { category: categoryFilter } : {}),
    ...(stateFilter !== "all" ? { state: stateFilter } : {}),
  })}`;
  const { data: clients, loading, refetch: refetchClients } = useCache<Client[]>(clientsUrl, { initialData: [] });

  const openAdd = () => {
    setEditClient(null); setForm(emptyForm); setActiveTab("basic");
    setContactSearch(""); setModalOpen(true); generateId("PWP");
  };
  const openEdit = (c: Client) => {
    setEditClient(c);
    setForm({
      clientId: c.clientId, companyName: c.companyName, category: c.category,
      contactIds: c.contactIds || (c.contactId ? [c.contactId] : []),
      state: c.state, address: c.address || "",
      gstNumber: c.gstNumber || "", registrationNumber: c.registrationNumber || "",
      cpcbLoginId: c.cpcbLoginId || "", cpcbPassword: c.cpcbPassword || "", otpMobileNumber: c.otpMobileNumber || "",
    });
    setActiveTab("basic"); setContactSearch(""); setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const url = editClient ? `/api/clients/${editClient.clientId}` : "/api/clients";
      const method = editClient ? "PUT" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!r.ok) { const d = await r.json(); toast.error(d.error || "Error"); return; }
      toast.success(editClient ? "Client updated!" : "Client added!");
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
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleContact = (id: string) => {
    setForm((f) => ({
      ...f,
      contactIds: f.contactIds.includes(id)
        ? f.contactIds.filter((c) => c !== id)
        : [...f.contactIds, id],
    }));
  };

  const selectedContacts = contacts.filter((c) => form.contactIds.includes(c._id));
  const filteredContacts = contacts.filter((c) =>
    contactSearch
      ? c.name.toLowerCase().includes(contactSearch.toLowerCase()) || c.mobile.includes(contactSearch)
      : true
  );

  const TabBtn = ({ id, label }: { id: "basic" | "portal"; label: string }) => (
    <button type="button" onClick={() => setActiveTab(id)}
      className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === id ? "bg-brand-600 text-white" : "text-muted hover:text-default"}`}>
      {label}
    </button>
  );

  return (
    <div>
      <PageHeader title="Clients" description="Manage all client companies">
        <button className="btn-secondary" onClick={() => router.push("/dashboard/contacts")}><UserPlus className="w-4 h-4" /> Contacts</button>
        <button className="btn-primary" onClick={openAdd}><Plus className="w-4 h-4" /> Add Client</button>
      </PageHeader>

      {/* Filters */}
      <div className="bg-card border border-base rounded-2xl p-3 mb-4 shadow-sm flex gap-2 flex-wrap transition-colors">
        <div className="flex items-center gap-2 flex-1 min-w-[180px] bg-surface rounded-xl px-3">
          <Search className="w-4 h-4 text-faint flex-shrink-0" />
          <input className="bg-transparent border-0 ring-0 outline-none flex-1 py-2 text-sm text-default placeholder:text-faint" placeholder="Search clients…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input-field !w-auto" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="all">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input-field !w-auto" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
          <option value="all">All States</option>
          {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* ── DESKTOP TABLE (lg+) ── */}
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
                              <div key={c._id} className="flex items-center gap-1.5 whitespace-nowrap">
                                <span className="text-xs font-medium text-default max-w-[90px] truncate" title={c.name}>{c.name}</span>
                                <span className="text-xs text-faint font-mono">{c.mobile}</span>
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

      {/* ── MOBILE CARDS (< lg) ── */}
      <div className="lg:hidden space-y-2">
        {loading ? <LoadingSpinner /> : clients.length === 0 ? <EmptyState message="No clients found" description="Add your first client to get started" /> : (
          clients.map((client) => {
            const isExpanded = expandedRows.has(client._id);
            const clientContacts = client.contacts || [];
            return (
              <div key={client._id} className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden transition-colors">
                {/* Always-visible row: tap to expand */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover transition-colors"
                  onClick={() => toggleExpand(client._id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-default text-sm truncate">{client.companyName}</span>
                      <CategoryBadge category={client.category} />
                    </div>
                    <span className="text-xs text-faint font-mono mt-0.5 block">{client.clientId}</span>
                  </div>
                  <ChevronDown
                    className="w-4 h-4 text-faint flex-shrink-0 transition-transform duration-200"
                    style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                  />
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="card-expand px-4 pb-4 border-t border-soft space-y-3 pt-3">
                    {/* Quick info pills */}
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="flex items-center gap-1 text-muted"><MapPin className="w-3 h-3" />{client.state || "—"}</span>
                      <span className="flex items-center gap-1 text-muted"><Calendar className="w-3 h-3" />Added {formatDate(client.createdAt)}</span>
                    </div>

                    {/* Contacts */}
                    {clientContacts.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Contacts</p>
                        <div className="space-y-1">
                          {clientContacts.map((c) => (
                            <div key={c._id} className="flex items-center justify-between bg-surface rounded-lg px-3 py-1.5">
                              <span className="text-sm font-medium text-default">{c.name}</span>
                              <span className="text-xs text-faint font-mono">{c.mobile}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => router.push(`/dashboard/clients/${client.clientId}`)} className="flex-1 btn-secondary justify-center text-xs py-1.5">
                        <Eye className="w-3.5 h-3.5" /> View
                      </button>
                      <button onClick={() => openEdit(client)} className="flex-1 btn-secondary justify-center text-xs py-1.5">
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button onClick={() => handleDelete(client.clientId)} className="flex-1 justify-center text-xs py-1.5 flex items-center gap-1.5 text-red-500 border border-red-200 dark:border-red-900/40 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors font-medium">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editClient ? "Edit Client" : "Add New Client"} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-1 bg-surface p-1 rounded-xl">
            <TabBtn id="basic" label="Basic Info" />
            <TabBtn id="portal" label="Portal Credentials" />
          </div>

          {activeTab === "basic" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Client ID *</label>
                  <div className="flex gap-1.5">
                    <input className="input-field font-mono flex-1" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} required placeholder={idGenerating ? "Generating…" : "e.g. PWP-001"} disabled={!!editClient} />
                    {!editClient && (
                      <button type="button" onClick={() => generateId(form.category)} disabled={idGenerating} title="Auto-generate ID" className="w-9 h-9 flex items-center justify-center rounded-lg border border-base bg-surface hover:bg-hover text-muted hover:text-brand-600 transition-colors flex-shrink-0">
                        {idGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                  {!editClient && <p className="text-xs text-faint mt-1 flex items-center gap-1"><Wand2 className="w-2.5 h-2.5" /> Auto-generates based on category</p>}
                </div>
                <div>
                  <label className="label">Category *</label>
                  <select className="input-field" value={form.category} onChange={(e) => { setForm({ ...form, category: e.target.value }); if (!editClient) generateId(e.target.value); }} required>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Company Name *</label>
                <input className="input-field" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required />
              </div>
              <div>
                <label className="label flex items-center gap-1.5"><Users className="w-3 h-3" />Associated Contacts</label>
                {selectedContacts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedContacts.map((c) => (
                      <div key={c._id} className="flex items-center gap-1 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 text-xs px-2 py-1 rounded-full font-medium">
                        {c.name}
                        <button type="button" onClick={() => toggleContact(c._id)} className="hover:text-red-500 ml-0.5"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="border border-base rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-3 bg-surface border-b border-base">
                    <Search className="w-3.5 h-3.5 text-faint" />
                    <input className="bg-transparent outline-none py-2 text-xs text-default placeholder:text-faint flex-1" placeholder="Search contacts…" value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} />
                  </div>
                  <div className="max-h-36 overflow-y-auto">
                    {filteredContacts.length === 0 ? (
                      <p className="text-xs text-faint text-center py-3">No contacts found</p>
                    ) : filteredContacts.map((c) => {
                      const selected = form.contactIds.includes(c._id);
                      return (
                        <button key={c._id} type="button" onClick={() => toggleContact(c._id)}
                          className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors hover:bg-hover ${selected ? "bg-brand-50 dark:bg-brand-900/20" : ""}`}>
                          <div className="flex items-center gap-2 text-left">
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${selected ? "bg-brand-600 border-brand-600" : "border-base"}`}>
                              {selected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                            </div>
                            <span className="font-medium text-default">{c.name}</span>
                            {c.designation && <span className="text-faint">· {c.designation}</span>}
                          </div>
                          <span className="font-mono text-faint">{c.mobile}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
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

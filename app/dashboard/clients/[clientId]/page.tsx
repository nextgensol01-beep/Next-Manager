"use client";
import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { formatCurrency, formatDate, FINANCIAL_YEARS, CURRENT_FY, STATES, CATEGORIES } from "@/lib/utils";
import { CategoryBadge, PaymentStatusBadge } from "@/components/ui/CategoryBadge";
import { CategoryBreakdown } from "@/components/ui/CategoryBreakdown";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { invalidate } from "@/lib/useCache";
import {
  ArrowLeft, Building2, Phone, Mail, MapPin, Plus, ExternalLink,
  Trash2, User, Shield, FileText, Hash, Lock, Smartphone,
  ArrowUpRight, ArrowDownLeft, Target, Wallet, Zap,
  Receipt, Send, MailCheck, Activity, Pencil, X, Search, Users, BarChart2
} from "lucide-react";

interface Contact { _id: string; name: string; mobile: string; email?: string; designation?: string; }
interface Client {
  _id: string; clientId: string; companyName: string; category: string;
  contactIds?: string[]; contactId?: string; contactPerson?: string; email?: string; mobile?: string;
  state: string; address?: string; gstNumber?: string; registrationNumber?: string;
  cpcbLoginId?: string; cpcbPassword?: string; otpMobileNumber?: string;
  createdAt: string; contacts?: Contact[]; contact?: Contact;
}
interface FYRecord {
  _id?: string; clientId: string; financialYear: string;
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
  totalAchieved?: number; remainingTarget?: number;
  availableCredits?: number; targetAmount?: number; usedCredits?: number; achievedAmount?: number;
}
interface Billing { clientId: string; financialYear: string; totalAmount: number; govtCharges: number; consultancyCharges: number; targetCharges: number; otherCharges: number; totalPaid: number; pendingAmount: number; paymentStatus: string; updatedAt?: string; createdAt?: string; }
interface Payment { _id: string; amountPaid: number; paymentDate: string; paymentMode: string; referenceNumber: string; financialYear?: string; }
interface Document { _id: string; documentName: string; driveLink: string; uploadedDate: string; }
interface ActivityItem { type: string; label: string; detail: string; date: string; color: string; }
interface EmailLog { _id: string; type: string; subject: string; to: string[]; sentAt: string; status: string; financialYear?: string; }
interface TimelineEvent {
  id: string; kind: string; icon: React.ReactNode; iconBg: string;
  title: string; detail: string; date: string; badge?: string; badgeColor?: string;
}

const CATS = ["CAT-I", "CAT-II", "CAT-III", "CAT-IV"] as const;

const activityIcon = (type: string) => {
  if (type === "credit_sold")     return <ArrowUpRight className="w-3.5 h-3.5" />;
  if (type === "target_achieved") return <ArrowDownLeft className="w-3.5 h-3.5" />;
  if (type === "target_set")      return <Target className="w-3.5 h-3.5" />;
  if (type === "credits_set")     return <Zap className="w-3.5 h-3.5" />;
  return <Zap className="w-3.5 h-3.5" />;
};
const activityColors: Record<string, string> = {
  teal: "bg-teal-100 text-teal-600",
  blue: "bg-blue-100 text-blue-600 dark:text-blue-400",
  amber: "bg-amber-100 text-amber-600 dark:text-amber-400",
  brand: "bg-brand-100 text-brand-600",
  emerald: "bg-emerald-100 text-emerald-600 dark:text-emerald-400",
};
const emailTypeLabel: Record<string, string> = { quotation: "Quotation", payment_reminder: "Reminder", annual_return_draft: "AR Draft", custom: "Email" };
const emailTypeBadgeColor: Record<string, string> = {
  quotation: "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300",
  payment_reminder: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  annual_return_draft: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  custom: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
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

export default function ClientProfilePage() {
  const { clientId } = useParams<{ clientId: string }>();
  const router = useRouter();

  const [client, setClient] = useState<Client | null>(null);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [fyRecords, setFyRecords] = useState<FYRecord[]>([]);
  const [allBillings, setAllBillings] = useState<Billing[]>([]);
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFy, setSelectedFy] = useState(CURRENT_FY);

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "portal" | "activity">("info");
  const [docModal, setDocModal] = useState(false);
  const [docForm, setDocForm] = useState({ documentName: "", driveLink: "" });

  // Edit client state
  const [editModal, setEditModal] = useState(false);
  const [editTab, setEditTab] = useState<"basic" | "portal">("basic");
  const [saving, setSaving] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [editForm, setEditForm] = useState({
    companyName: "", category: "", state: "", address: "",
    gstNumber: "", registrationNumber: "",
    cpcbLoginId: "", cpcbPassword: "", otpMobileNumber: "",
    contactIds: [] as string[],
  });
  const [showEditPassword, setShowEditPassword] = useState(false);

  // Breakdown modal
  const [breakdownRec, setBreakdownRec] = useState<FYRecord | null>(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      fetch(`/api/clients/${clientId}`).then((r) => r.json()),
      fetch(`/api/financial-year?clientId=${clientId}`).then((r) => r.json()),
      fetch(`/api/documents?clientId=${clientId}`).then((r) => r.json()),
      fetch(`/api/activities?clientId=${clientId}`).then((r) => r.json()),
      fetch(`/api/email-log?clientId=${clientId}`).then((r) => r.json()),
      fetch(`/api/billing?clientId=${clientId}`).then((r) => r.json()),
      fetch(`/api/payments?clientId=${clientId}`).then((r) => r.json()),
      fetch("/api/contacts").then((r) => r.json()),
    ]).then(([c, fy, docs, acts, emails, allB, allP, allC]) => {
      setClient(c);
      setFyRecords(Array.isArray(fy) ? fy : []);
      setDocuments(Array.isArray(docs) ? docs : []);
      setActivities(Array.isArray(acts) ? acts : []);
      setEmailLogs(Array.isArray(emails) ? emails : []);
      setAllBillings(Array.isArray(allB) ? allB : []);
      setAllPayments(Array.isArray(allP) ? allP : []);
      setAllContacts(Array.isArray(allC) ? allC : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [clientId]);

  const billing  = allBillings.find((b) => b.financialYear === selectedFy) || null;
  const payments = allPayments.filter((p) => p.financialYear === selectedFy);

  // Timeline
  const timeline: TimelineEvent[] = React.useMemo(() => {
    const events: TimelineEvent[] = [];
    allBillings.forEach((b) => events.push({
      id: `billing-${b.financialYear}`, kind: "billing",
      icon: <Receipt className="w-3.5 h-3.5" />,
      iconBg: "bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400",
      title: `Billing created — FY ${b.financialYear}`,
      detail: `Total: ${formatCurrency(b.totalAmount)} · Paid: ${formatCurrency(b.totalPaid)} · Pending: ${formatCurrency(b.pendingAmount)}`,
      date: b.createdAt || b.updatedAt || "",
      badge: b.paymentStatus,
      badgeColor: b.paymentStatus === "Paid" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
        : b.paymentStatus === "Partial" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    }));
    allPayments.forEach((p) => events.push({
      id: `payment-${p._id}`, kind: "payment",
      icon: <Wallet className="w-3.5 h-3.5" />,
      iconBg: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400",
      title: "Payment received",
      detail: `${formatCurrency(p.amountPaid)} via ${p.paymentMode}${p.referenceNumber ? ` · Ref: ${p.referenceNumber}` : ""}`,
      date: p.paymentDate, badge: p.financialYear,
      badgeColor: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    }));
    emailLogs.forEach((e) => events.push({
      id: `email-${e._id}`, kind: "email",
      icon: e.status === "draft" ? <MailCheck className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />,
      iconBg: "bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400",
      title: e.subject || `${emailTypeLabel[e.type] || "Email"} sent`,
      detail: `To: ${e.to.slice(0, 2).join(", ")}${e.to.length > 2 ? ` +${e.to.length - 2} more` : ""}`,
      date: e.sentAt, badge: emailTypeLabel[e.type] || "Email",
      badgeColor: emailTypeBadgeColor[e.type] || emailTypeBadgeColor.custom,
    }));
    return events.filter((e) => e.date).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allBillings, allPayments, emailLogs]);

  const addDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await fetch("/api/documents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...docForm, clientId, uploadedDate: new Date() }),
    });
    if (r.ok) {
      setDocuments([await r.json(), ...documents]);
      setDocModal(false); setDocForm({ documentName: "", driveLink: "" });
      toast.success("Document added!");
    }
  };

  const deleteDocument = async (id: string) => {
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    setDocuments(documents.filter((d) => d._id !== id));
    toast.success("Document removed");
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
      contactIds: client.contactIds || (client.contactId ? [client.contactId] : []),
    });
    setEditTab("basic");
    setContactSearch("");
    setShowEditPassword(false);
    setEditModal(true);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch(`/api/clients/${clientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
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

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner /></div>;
  if (!client) return (
    <div className="text-center py-20">
      <p className="text-faint mb-4">Client not found</p>
      <button onClick={() => router.back()} className="btn-secondary">Go Back</button>
    </div>
  );

  const isPWP  = client.category === "PWP";
  const isSIMP = client.category === "SIMP";
  const fyData = fyRecords.find((r) => r.financialYear === selectedFy);

  const primaryContact  = client.contacts?.[0] ?? client.contact ?? null;
  const contactName     = primaryContact?.name || client.contactPerson || "—";
  const contactMobile   = primaryContact?.mobile || client.mobile || "—";
  const contactEmail    = primaryContact?.email || client.email || "—";
  const contactDesig    = primaryContact?.designation || "";

  // Contacts for edit modal picker
  const filteredContacts = allContacts.filter((c) => {
    const q = contactSearch.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.mobile.includes(q);
  });
  const toggleContact = (id: string) => {
    setEditForm((f) => ({
      ...f,
      contactIds: f.contactIds.includes(id)
        ? f.contactIds.filter((x) => x !== id)
        : [...f.contactIds, id],
    }));
  };
  const selectedContacts = allContacts.filter((c) => editForm.contactIds.includes(c._id));

  const TabBtn = ({ id, label, icon }: { id: "info" | "portal" | "activity"; label: string; icon: React.ReactNode }) => (
    <button onClick={() => setActiveTab(id)}
      className={`flex-1 py-3 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${activeTab === id ? "bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 border-b-2 border-brand-600" : "text-faint hover:text-muted"}`}>
      {icon}{label}
    </button>
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

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="btn-secondary !px-3"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-default">{client.companyName}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-mono text-xs bg-surface px-2 py-0.5 rounded">{client.clientId}</span>
            <CategoryBadge category={client.category} />
          </div>
        </div>
        {/* Edit button in header */}
        <button onClick={openEdit} className="btn-secondary flex items-center gap-1.5">
          <Pencil className="w-4 h-4" /> Edit Client
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── LEFT ── */}
        <div className="space-y-4">

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
                <InfoRow icon={<Phone className="w-4 h-4" />}   label="Mobile"         value={contactMobile} />
                <InfoRow icon={<Mail className="w-4 h-4" />}    label="Email"          value={contactEmail} mono />
                {(client.contacts?.length ?? 0) > 1 && (
                  <div className="pt-1">
                    <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">All Contacts ({client.contacts!.length})</p>
                    <div className="space-y-1.5">
                      {client.contacts!.map((c) => (
                        <div key={c._id} className="flex items-center justify-between bg-surface rounded-lg px-2.5 py-1.5">
                          <div>
                            <p className="text-xs font-semibold text-default">{c.name}</p>
                            {c.designation && <p className="text-xs text-faint">{c.designation}</p>}
                          </div>
                          <span className="font-mono text-xs text-muted">{c.mobile}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <InfoRow icon={<MapPin className="w-4 h-4" />}    label="State"           value={client.state} />
                {client.address        && <InfoRow icon={<Building2 className="w-4 h-4" />} label="Address"         value={client.address} />}
                {client.gstNumber      && <InfoRow icon={<Hash className="w-4 h-4" />}      label="GST Number"      value={client.gstNumber} mono />}
                {client.registrationNumber && <InfoRow icon={<FileText className="w-4 h-4" />} label="Registration No." value={client.registrationNumber} mono />}
                <div className="pt-3 border-t border-soft flex items-center justify-between">
                  <p className="text-xs text-faint">Added {formatDate(client.createdAt)}</p>
                  <button onClick={openEdit} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                </div>
              </div>
            )}

            {activeTab === "portal" && (
              <div className="p-5 space-y-3">
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
                    {client.cpcbLoginId   && <InfoRow icon={<User className="w-4 h-4" />}       label="CPCB Login ID" value={client.cpcbLoginId} mono />}
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
                    {client.otpMobileNumber && <InfoRow icon={<Smartphone className="w-4 h-4" />} label="OTP Mobile" value={client.otpMobileNumber} mono />}
                  </>
                )}
                <div className="pt-3 border-t border-soft">
                  <button onClick={() => { openEdit(); setTimeout(() => setEditTab("portal"), 50); }}
                    className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                    <Pencil className="w-3 h-3" /> Edit credentials
                  </button>
                </div>
              </div>
            )}

            {activeTab === "activity" && (
              <div className="p-4">
                {activities.length === 0 ? (
                  <p className="text-sm text-faint text-center py-6">No activity recorded yet</p>
                ) : (
                  <div className="space-y-2">
                    {activities.map((act, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${activityColors[act.color] || "bg-surface text-muted"}`}>
                          {activityIcon(act.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-default">{act.label}</p>
                          <p className="text-xs text-muted truncate">{act.detail}</p>
                          <p className="text-xs text-faint">{act.date ? formatDate(act.date) : ""}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Documents */}
          <div className="bg-card rounded-2xl p-5 shadow-sm border border-base">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-default">Documents</h3>
              <button className="btn-primary !py-1 !text-xs" onClick={() => setDocModal(true)}><Plus className="w-3 h-3" /> Add</button>
            </div>
            {documents.length === 0 ? <p className="text-sm text-faint text-center py-4">No documents yet</p> : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div key={doc._id} className="flex items-center justify-between p-2.5 rounded-xl bg-surface hover:bg-hover transition-colors">
                    <div>
                      <p className="text-sm font-medium text-default">{doc.documentName}</p>
                      <p className="text-xs text-faint">{formatDate(doc.uploadedDate)}</p>
                    </div>
                    <div className="flex gap-1">
                      <a href={doc.driveLink} target="_blank" rel="noopener noreferrer" className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg"><ExternalLink className="w-3.5 h-3.5" /></a>
                      <button onClick={() => deleteDocument(doc._id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* FY Selector */}
          <div className="bg-card rounded-2xl p-4 shadow-sm border border-base flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-muted">Financial Year:</span>
            {FINANCIAL_YEARS.map((y) => (
              <button key={y} onClick={() => setSelectedFy(y)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${selectedFy === y ? "bg-brand-600 text-white" : "bg-surface text-muted hover:bg-hover"}`}>
                {y}
              </button>
            ))}
          </div>

          {/* Credits / Targets */}
          {fyData && !isSIMP && (
            <div className="bg-card rounded-2xl p-5 shadow-sm border border-base">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-default">{isPWP ? "Credits Summary" : "Target Summary"} — FY {selectedFy}</h3>
                <button
                  onClick={() => setBreakdownRec(fyData)}
                  className="btn-secondary !py-1.5 !px-3 !text-xs flex items-center gap-1.5"
                >
                  <BarChart2 className="w-3.5 h-3.5" /> Breakdown
                </button>
              </div>
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
          {billing && (
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
          {payments.length > 0 && (
            <div className="bg-card rounded-2xl shadow-sm border border-base overflow-hidden">
              <div className="p-4 border-b border-base"><h3 className="font-semibold text-default">Payment History — FY {selectedFy}</h3></div>
              <table className="w-full min-w-[400px]">
                <thead><tr><th className="table-header">Date</th><th className="table-header">Amount</th><th className="table-header">Mode</th><th className="table-header">Reference</th></tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p._id} className="hover:bg-surface border-t border-soft">
                      <td className="table-cell">{formatDate(p.paymentDate)}</td>
                      <td className="table-cell font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(p.amountPaid)}</td>
                      <td className="table-cell">{p.paymentMode}</td>
                      <td className="table-cell text-faint">{p.referenceNumber || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Timeline */}
          {timeline.length > 0 && (
            <div className="bg-card rounded-2xl shadow-sm border border-base overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-base">
                <Activity className="w-4 h-4 text-brand-600" />
                <h3 className="font-semibold text-default">Recent Activity</h3>
                <span className="ml-auto text-xs bg-surface text-muted px-2 py-0.5 rounded-full">{timeline.length} events</span>
              </div>
              <div className="divide-y divide-soft">
                {timeline.slice(0, 12).map((event) => (
                  <div key={event.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-surface transition-colors">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${event.iconBg}`}>{event.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-default leading-snug truncate">{event.title}</p>
                        {event.badge && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${event.badgeColor}`}>{event.badge}</span>}
                      </div>
                      <p className="text-xs text-muted mt-0.5 truncate">{event.detail}</p>
                      <p className="text-xs text-faint mt-0.5">{formatDate(event.date)}</p>
                    </div>
                  </div>
                ))}
                {timeline.length > 12 && <div className="px-5 py-3 text-center"><span className="text-xs text-muted">+ {timeline.length - 12} more events</span></div>}
              </div>
            </div>
          )}

          {!fyData && !billing && (
            <div className="bg-card border border-base rounded-2xl p-8 shadow-sm text-center">
              <div className="w-12 h-12 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              </div>
              <p className="font-semibold text-default mb-1">No data for FY {selectedFy}</p>
              <p className="text-sm text-muted mb-4">Add financial year data from the Financial Year section.</p>
              <Link href="/dashboard/financial-year" className="btn-primary inline-flex">Go to Financial Year</Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Document Modal ── */}
      <Modal open={docModal} onClose={() => setDocModal(false)} title="Add Document">
        <form onSubmit={addDocument} className="space-y-4">
          <div><label className="label">Document Name *</label><input className="input-field" value={docForm.documentName} onChange={(e) => setDocForm({ ...docForm, documentName: e.target.value })} required placeholder="e.g. Registration Certificate" /></div>
          <div><label className="label">Google Drive Link *</label><input className="input-field" type="url" value={docForm.driveLink} onChange={(e) => setDocForm({ ...docForm, driveLink: e.target.value })} required placeholder="https://drive.google.com/..." /></div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center">Add Document</button>
            <button type="button" className="btn-secondary" onClick={() => setDocModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* ── Category Breakdown Modal ── */}
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
                  <select className="input-field" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} required>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Company Name *</label>
                <input className="input-field" value={editForm.companyName} onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })} required />
              </div>

              {/* Contact picker */}
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
                    <input className="bg-transparent outline-none py-2 text-xs text-default placeholder:text-faint flex-1"
                      placeholder="Search contacts…" value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} />
                  </div>
                  <div className="max-h-36 overflow-y-auto">
                    {filteredContacts.length === 0 ? (
                      <p className="text-xs text-faint text-center py-3">No contacts found</p>
                    ) : filteredContacts.map((c) => {
                      const sel = editForm.contactIds.includes(c._id);
                      return (
                        <button key={c._id} type="button" onClick={() => toggleContact(c._id)}
                          className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors hover:bg-hover ${sel ? "bg-brand-50 dark:bg-brand-900/20" : ""}`}>
                          <div className="flex items-center gap-2 text-left">
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${sel ? "bg-brand-600 border-brand-600" : "border-base"}`}>
                              {sel && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
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

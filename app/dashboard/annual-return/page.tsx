"use client";
import React, { useState } from "react";
import { useCache, invalidate } from "@/lib/useCache";
import toast from "react-hot-toast";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { FINANCIAL_YEARS, CURRENT_FY, formatDate } from "@/lib/utils";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import TableWrapper from "@/components/ui/TableWrapper";
import { Plus, Search, Pencil, Trash2, CheckCircle2, Clock, AlertCircle, ShieldCheck, Sparkles, Mail, Send, FileEdit, ExternalLink, X, ChevronDown } from "lucide-react";

type ReturnStatus = "Pending" | "In Progress" | "Filed" | "Verified";

interface AnnualReturn {
  _id: string; clientId: string; financialYear: string; status: ReturnStatus;
  filingDate?: string; acknowledgeNumber?: string; remarks?: string; updatedAt: string;
  client?: {
    companyName: string;
    category: string;
    state: string;
    email?: string;
    contacts?: { name: string; email: string }[];
  };
}
interface Client { clientId: string; companyName: string; category: string; }

const STATUS_CONFIG: Record<ReturnStatus, { label: string; icon: React.ReactNode; badge: string; ring: string; bg: string; dot: string }> = {
  "Pending":     { label: "Pending",     icon: <AlertCircle  className="w-3.5 h-3.5" />, badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",         ring: "ring-red-300 dark:ring-red-700",     bg: "bg-red-50 dark:bg-red-900/10",     dot: "bg-red-500"     },
  "In Progress": { label: "In Progress", icon: <Clock        className="w-3.5 h-3.5" />, badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",   ring: "ring-amber-300 dark:ring-amber-700",  bg: "bg-amber-50 dark:bg-amber-900/10", dot: "bg-amber-400"   },
  "Filed":       { label: "Filed",       icon: <CheckCircle2 className="w-3.5 h-3.5" />, badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",       ring: "ring-blue-300 dark:ring-blue-700",    bg: "bg-blue-50 dark:bg-blue-900/10",   dot: "bg-blue-500"    },
  "Verified":    { label: "Verified",    icon: <ShieldCheck  className="w-3.5 h-3.5" />, badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400", ring: "ring-emerald-300 dark:ring-emerald-700", bg: "bg-emerald-50 dark:bg-emerald-900/10", dot: "bg-emerald-500" },
};
const STATUSES: ReturnStatus[] = ["Pending", "In Progress", "Filed", "Verified"];
const emptyForm = { clientId: "", financialYear: CURRENT_FY, status: "Pending" as ReturnStatus, filingDate: "", acknowledgeNumber: "", remarks: "" };

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`; if (h > 0) return `${h}h ago`; if (m > 0) return `${m}m ago`; return "just now";
}

export default function AnnualReturnPage() {
  const [fy, setFy]             = useState(CURRENT_FY);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch]     = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<AnnualReturn | null>(null);
  const [form, setForm]         = useState(emptyForm);
  const [saving, setSaving]     = useState(false);
  const [initLoading, setInitLoading] = useState(false);

  // Draft modal state
  const [draftModal, setDraftModal] = useState(false);
  const [draftRec, setDraftRec] = useState<AnnualReturn | null>(null);
  const [draftTo, setDraftTo] = useState<{ label: string; email: string }[]>([]);
  const [draftCustomEmail, setDraftCustomEmail] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftPreviewHtml, setDraftPreviewHtml] = useState<string | null>(null);
  const [draftLogging, setDraftLogging] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => setExpandedRows((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  // Email log (kept for logging outgoing emails — view history at /dashboard/email-history)

  const arUrl = `/api/annual-return?${new URLSearchParams({
    fy,
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    ...(search ? { search } : {}),
  })}`;
  const { data: rawRecords, loading, refetch: refetchRecords } = useCache<AnnualReturn[]>(arUrl);
  const records = Array.isArray(rawRecords) ? rawRecords : [];
  const { data: rawClients } = useCache<Client[]>("/api/clients");
  const clients = Array.isArray(rawClients) ? rawClients : [];

  const openAdd  = () => { setEditRecord(null); setForm({ ...emptyForm, financialYear: fy }); setModalOpen(true); };
  const openEdit = (rec: AnnualReturn) => {
    setEditRecord(rec);
    setForm({ clientId: rec.clientId, financialYear: rec.financialYear, status: rec.status,
      filingDate: rec.filingDate ? rec.filingDate.split("T")[0] : "",
      acknowledgeNumber: rec.acknowledgeNumber || "", remarks: rec.remarks || "" });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { ...form, filingDate: form.filingDate || null };
      const r = editRecord
        ? await fetch(`/api/annual-return/${editRecord._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/annual-return", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) { toast.error("Failed to save"); return; }
      toast.success(editRecord ? "Updated!" : "Record added!");
      invalidate("/api/annual-return", "/api/dashboard"); setModalOpen(false); refetchRecords();
    } finally { setSaving(false); }
  };

  const deleteRecord = async (id: string) => {
    if (!confirm("Delete this annual return record?")) return;
    await fetch(`/api/annual-return/${id}`, { method: "DELETE" });
    toast.success("Deleted"); invalidate("/api/annual-return", "/api/dashboard"); refetchRecords();
  };

  const quickStatus = async (rec: AnnualReturn, next: ReturnStatus) => {
    await fetch(`/api/annual-return/${rec._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
    toast.success(`Marked as ${next}`); invalidate("/api/annual-return", "/api/dashboard"); refetchRecords();
  };

  const bulkInit = async () => {
    if (!confirm(`Create Pending records for ALL clients in FY ${fy}? (Existing records are skipped)`)) return;
    setInitLoading(true);
    try {
      const r = await fetch("/api/annual-return/bulk-init", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ financialYear: fy }) });
      const d = await r.json();
      toast.success(d.message || "Done"); invalidate("/api/annual-return", "/api/dashboard"); refetchRecords();
    } finally { setInitLoading(false); }
  };

  // ── DRAFT FUNCTIONS ──
  const openDraftModal = async (rec: AnnualReturn) => {
    setDraftRec(rec);
    const cName = rec.client?.companyName || rec.clientId;

    // Auto-populate recipients from company email + all linked contacts
    const recipients: { label: string; email: string }[] = [];
    if (rec.client?.email) {
      recipients.push({ label: `${cName} (Company)`, email: rec.client.email });
    }
    (rec.client?.contacts || []).forEach((ct) => {
      if (ct.email && !recipients.find(r => r.email === ct.email))
        recipients.push({ label: ct.name, email: ct.email });
    });
    setDraftTo(recipients);
    setDraftCustomEmail("");
    setDraftSubject(`EPR Annual Return Filed — ${cName} — FY ${rec.financialYear}`);

    // Notify about auto-populated recipients
    if (recipients.length > 0) {
      toast.success(
        `Auto-filled ${recipients.length} recipient${recipients.length !== 1 ? "s" : ""} from client profile`,
        { duration: 3000 }
      );
    } else {
      toast("No emails linked to this client — add recipients manually", { icon: "⚠️" });
    }

    // Build confirmation HTML
    try {
      const tmplRes = await fetch("/api/email/template?name=annual-return-confirmation");
      const { html: template } = await tmplRes.json();
      const html = template
        .replace(/{{clientName}}/g, cName)
        .replace(/{{financialYear}}/g, rec.financialYear)
        .replace(/{{filingDate}}/g, rec.filingDate ? fmtDate(rec.filingDate) : "—")
        .replace(/{{acknowledgeNumber}}/g, rec.acknowledgeNumber || "—")
        .replace(/{{remarksBlock}}/g, rec.remarks
          ? `<tr><td style="padding:20px 36px 0;"><table width="100%" cellpadding="0" cellspacing="0" style="border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;background:#fffbeb;"><tr><td style="padding:14px 16px;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#92400e;margin-bottom:4px;">Remarks</div><p style="margin:0;font-size:12px;color:#78350f;line-height:1.6;">${rec.remarks}</p></td></tr></table></td></tr>`
          : "");
      setDraftPreviewHtml(html);
    } catch { setDraftPreviewHtml(null); }

    setDraftModal(true);
  };

  const addDraftEmail = () => {
    const email = draftCustomEmail.trim();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("Invalid email address"); return; }
    if (draftTo.find(r => r.email === email)) { toast.error("Already added"); return; }
    setDraftTo([...draftTo, { label: email, email }]);
    setDraftCustomEmail("");
  };

  const openGmailDraft = async () => {
    if (!draftRec || !draftPreviewHtml) return;
    setDraftLogging(true);
    try {
      const cName = draftRec.client?.companyName || draftRec.clientId;
      const toEmails = draftTo.map(r => r.email);

      const res = await fetch("/api/email/create-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: toEmails,
          subject: draftSubject,
          html: draftPreviewHtml,
          logClientId: draftRec.clientId,
          logClientName: cName,
          logFy: draftRec.financialYear,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === "INVALID_GRANT") {
          toast.error("Gmail OAuth token expired. Re-run the setup in Settings.");
        } else if (res.status === 503) {
          // OAuth not configured — fall back to mailto with plain text
          toast("Gmail OAuth not set up — opening plain-text compose instead.", { icon: "⚠️" });
          const plainBody = `Dear ${cName},\n\nWe are pleased to inform you that your EPR Annual Return for FY ${draftRec.financialYear} has been successfully filed.\n\nFiling Date: ${draftRec.filingDate ? fmtDate(draftRec.filingDate) : "—"}\nAcknowledgement No.: ${draftRec.acknowledgeNumber || "—"}\nStatus: Verified\n\nPlease find the filing screenshots and acknowledgement documents attached.\n\nBest regards,\nTeam Nextgen Solutions`;
          const primaryTo = toEmails[0] || "";
          const ccEmails  = toEmails.slice(1);
          const gmailParams = new URLSearchParams({ view: "cm", fs: "1", to: primaryTo, su: draftSubject, body: plainBody });
          if (ccEmails.length > 0) gmailParams.set("cc", ccEmails.join(","));
          const gmailUrl = `https://mail.google.com/mail/?${gmailParams.toString()}`;
          // Log the draft attempt
          await fetch("/api/email-log", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "annual_return_draft", to: toEmails, subject: draftSubject, clientId: draftRec.clientId, clientName: cName, financialYear: draftRec.financialYear, status: "draft", notes: "Fallback: plain-text mailto (OAuth not configured)" }),
          });
          window.open(gmailUrl, "_blank");
          setDraftModal(false);
        } else {
          toast.error(data.error || "Failed to create draft");
        }
        return;
      }

      // Success — open the HTML draft directly
      window.open(data.draftUrl, "_blank");
      toast.success(`HTML draft created in Gmail! Add attachments and send.`);
      setDraftModal(false);
    } finally { setDraftLogging(false); }
  };

  const counts = STATUSES.reduce((acc, s) => { acc[s] = records.filter(r => r.status === s).length; return acc; }, {} as Record<ReturnStatus, number>);
  const total = records.length;
  const pct = (n: number) => total ? Math.round((n / total) * 100) : 0;

  return (
    <div>
      <PageHeader title="EPR Annual Return" description="Track annual return filing status for all clients per financial year">
        <button className="btn-secondary" onClick={bulkInit} disabled={initLoading}>
          <Sparkles className="w-4 h-4" />{initLoading ? "Initialising…" : `Init FY ${fy}`}
        </button>
        <button className="btn-primary" onClick={openAdd}><Plus className="w-4 h-4" />Add Record</button>
      </PageHeader>

      <>
          {/* FY */}
          <div className="bg-card border border-base rounded-2xl p-4 mb-4 shadow-sm flex flex-wrap items-center gap-3 transition-colors">
            <span className="text-sm font-medium text-muted">Financial Year:</span>
            {FINANCIAL_YEARS.map((y) => (
              <button key={y} onClick={() => setFy(y)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${fy === y ? "bg-brand-600 text-white" : "bg-surface text-muted hover:bg-hover hover:text-default"}`}>
                {y}
              </button>
            ))}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {STATUSES.map((s) => {
              const cfg = STATUS_CONFIG[s];
              const active = statusFilter === s;
              return (
                <button key={s} onClick={() => setStatusFilter(active ? "all" : s)}
                  className={`text-left p-4 rounded-2xl border-2 transition-all shadow-sm ${active ? `${cfg.bg} ring-2 ${cfg.ring}` : "bg-card border-base hover:bg-hover"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                    <span className="text-xs font-semibold text-muted uppercase tracking-wide leading-tight">{cfg.label}</span>
                  </div>
                  <p className="text-3xl font-black text-default">{counts[s]}</p>
                  {total > 0 && <p className="text-xs text-muted mt-1">{pct(counts[s])}% of {total}</p>}
                </button>
              );
            })}
          </div>

          {/* Progress */}
          {total > 0 && (
            <div className="bg-card border border-base rounded-2xl p-4 mb-4 shadow-sm transition-colors">
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm font-semibold text-default">Overall Progress — FY {fy}</p>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{pct(counts.Verified + counts.Filed)}% Filed or above</span>
              </div>
              <div className="w-full h-4 bg-surface rounded-full overflow-hidden flex gap-px">
                <div className="bg-emerald-500 h-full transition-all rounded-l-full" style={{ width: `${pct(counts.Verified)}%` }} />
                <div className="bg-blue-500 h-full transition-all" style={{ width: `${pct(counts.Filed)}%` }} />
                <div className="bg-amber-400 h-full transition-all" style={{ width: `${pct(counts["In Progress"])}%` }} />
                <div className="bg-red-400 h-full transition-all rounded-r-full flex-1" style={{ minWidth: pct(counts.Pending) === 0 ? "0" : undefined }} />
              </div>
              <div className="flex flex-wrap gap-4 mt-2">
                {[["bg-emerald-500","Verified",counts.Verified],["bg-blue-500","Filed",counts.Filed],["bg-amber-400","In Progress",counts["In Progress"]],["bg-red-400","Pending",counts.Pending]].map(([dot,lbl,n])=>(
                  <div key={lbl as string} className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`}/>
                    <span className="text-xs text-muted">{lbl}: <strong className="text-default">{n as number}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search + filter */}
          <div className="bg-card border border-base rounded-2xl p-3 mb-4 shadow-sm flex gap-3 flex-wrap items-center transition-colors">
            <div className="flex items-center gap-2 flex-1 min-w-48 bg-surface rounded-xl px-3">
              <Search className="w-4 h-4 text-faint flex-shrink-0" />
              <input className="bg-transparent outline-none flex-1 py-2 text-sm text-default placeholder:text-faint"
                placeholder="Search company name…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={() => setStatusFilter("all")}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${statusFilter === "all" ? "bg-brand-600 text-white" : "bg-surface text-muted hover:text-default hover:bg-hover"}`}>
                All
              </button>
              {STATUSES.map((s) => (
                <button key={s} onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${statusFilter === s ? "bg-brand-600 text-white" : "bg-surface text-muted hover:text-default hover:bg-hover"}`}>
                  {STATUS_CONFIG[s].icon}{s}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden transition-colors">
            {loading ? <LoadingSpinner /> : records.length === 0 ? (
              <div className="text-center py-14 px-6">
                <div className="w-14 h-14 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-7 h-7 text-faint" />
                </div>
                <p className="font-semibold text-default mb-1">No records for FY {fy}</p>
                <p className="text-sm text-muted mb-5">Use <strong>Init FY {fy}</strong> to bulk-create Pending records for every client, or add them one by one.</p>
                <div className="flex gap-2 justify-center">
                  <button className="btn-secondary" onClick={bulkInit} disabled={initLoading}>
                    <Sparkles className="w-4 h-4" />{initLoading ? "Working…" : `Init FY ${fy}`}
                  </button>
                  <button className="btn-primary" onClick={openAdd}><Plus className="w-4 h-4" />Add Manually</button>
                </div>
              </div>
            ) : (
              <>
                {/* ── DESKTOP TABLE ── */}
                <div className="hidden lg:block">
                  <TableWrapper>
                    <table className="w-full min-w-[700px]">
                      <thead>
                        <tr>
                          <th className="table-header">Company</th>
                          <th className="table-header">Category</th>
                          <th className="table-header">State</th>
                          <th className="table-header">Status</th>
                          <th className="table-header">Filing Date</th>
                          <th className="table-header">Ack. No.</th>
                          <th className="table-header">Remarks</th>
                          <th className="table-header">Updated</th>
                          <th className="table-header"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((rec) => {
                          const cfg = STATUS_CONFIG[rec.status];
                          const nextStatus = STATUSES[(STATUSES.indexOf(rec.status) + 1) % STATUSES.length];
                          return (
                            <tr key={rec._id} className="border-t border-soft hover:bg-hover transition-colors">
                              <td className="table-cell whitespace-nowrap">
                                <p className="font-semibold text-default max-w-[180px] truncate" title={rec.client?.companyName || rec.clientId}>{rec.client?.companyName || rec.clientId}</p>
                                <p className="text-xs text-faint font-mono">{rec.clientId}</p>
                              </td>
                              <td className="table-cell whitespace-nowrap"><CategoryBadge category={rec.client?.category || "—"} /></td>
                              <td className="table-cell text-sm text-muted whitespace-nowrap">{rec.client?.state || "—"}</td>
                              <td className="table-cell whitespace-nowrap">
                                <div className="group relative inline-block">
                                  <button onClick={() => quickStatus(rec, nextStatus)} title={`Click to mark as ${nextStatus}`}
                                    className={`status-badge hover:opacity-80 active:scale-95 cursor-pointer ${cfg.badge} ${rec.status === "Pending" ? "badge-pulse" : ""}`}>
                                    {cfg.icon}{cfg.label}
                                  </button>
                                  <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap bg-slate-900 dark:bg-slate-700 text-white text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10">→ {nextStatus}</span>
                                </div>
                              </td>
                              <td className="table-cell text-sm font-mono whitespace-nowrap">{rec.filingDate ? formatDate(rec.filingDate) : <span className="text-faint">—</span>}</td>
                              <td className="table-cell whitespace-nowrap">
                                {rec.acknowledgeNumber ? <span className="font-mono text-xs bg-surface px-2 py-0.5 rounded border border-base">{rec.acknowledgeNumber}</span> : <span className="text-faint text-xs">—</span>}
                              </td>
                              <td className="table-cell text-sm text-muted max-w-[160px] truncate" title={rec.remarks || ""}>{rec.remarks || <span className="text-faint">—</span>}</td>
                              <td className="table-cell text-xs text-faint whitespace-nowrap">{formatDate(rec.updatedAt)}</td>
                              <td className="table-cell whitespace-nowrap">
                                <div className="flex gap-1">
                                  {rec.status === "Verified" && (<button onClick={() => openDraftModal(rec)} className="p-1.5 text-faint hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors" title="Draft confirmation email in Gmail"><FileEdit className="w-3.5 h-3.5" /></button>)}
                                  <button onClick={() => openEdit(rec)} className="p-1.5 text-faint hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => deleteRecord(rec._id)} className="p-1.5 text-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </TableWrapper>
                </div>

                {/* ── MOBILE CARDS ── */}
                <div className="lg:hidden divide-y divide-[var(--color-border-soft)]">
                  {records.map((rec) => {
                    const cfg = STATUS_CONFIG[rec.status];
                    const nextStatus = STATUSES[(STATUSES.indexOf(rec.status) + 1) % STATUSES.length];
                    const isExpanded = expandedRows.has(rec._id);
                    return (
                      <div key={rec._id}>
                        <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover transition-colors" onClick={() => toggleExpand(rec._id)}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="font-semibold text-sm text-default truncate">{rec.client?.companyName || rec.clientId}</span>
                              <span className={`status-badge text-[10px] px-2 py-0.5 ${cfg.badge} ${rec.status === "Pending" ? "badge-pulse" : ""}`}>{cfg.icon}{cfg.label}</span>
                            </div>
                            <span className="text-xs text-faint font-mono">{rec.clientId}</span>
                          </div>
                          <ChevronDown className="w-4 h-4 text-faint flex-shrink-0 transition-transform duration-200" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }} />
                        </button>
                        {isExpanded && (
                          <div className="card-expand px-4 pb-4 space-y-3 bg-surface/50">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div><span className="text-faint block">Category</span><CategoryBadge category={rec.client?.category || "—"} /></div>
                              <div><span className="text-faint block">State</span><span className="text-default font-medium">{rec.client?.state || "—"}</span></div>
                              <div><span className="text-faint block">Filing Date</span><span className="text-default font-mono">{rec.filingDate ? formatDate(rec.filingDate) : "—"}</span></div>
                              <div><span className="text-faint block">Updated</span><span className="text-default">{formatDate(rec.updatedAt)}</span></div>
                            </div>
                            {rec.acknowledgeNumber && (
                              <div><span className="text-xs text-faint block mb-1">Ack. No.</span><span className="font-mono text-xs bg-card px-2 py-1 rounded border border-base">{rec.acknowledgeNumber}</span></div>
                            )}
                            {rec.remarks && <div><span className="text-xs text-faint block mb-1">Remarks</span><p className="text-sm text-default">{rec.remarks}</p></div>}
                            <div className="flex gap-2 pt-1 flex-wrap">
                              <button onClick={() => quickStatus(rec, nextStatus)} className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${cfg.badge}`}>
                                {cfg.icon} Mark as {nextStatus}
                              </button>
                              {rec.status === "Verified" && (<button onClick={() => openDraftModal(rec)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-base hover:bg-hover transition-colors text-muted"><FileEdit className="w-3.5 h-3.5" />Draft Email</button>)}
                              <button onClick={() => openEdit(rec)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-base hover:bg-hover transition-colors text-muted"><Pencil className="w-3.5 h-3.5" />Edit</button>
                              <button onClick={() => deleteRecord(rec._id)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-500"><Trash2 className="w-3.5 h-3.5" />Delete</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
      </>

      {/* ── EDIT/ADD MODAL ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editRecord ? `Edit — ${editRecord.client?.companyName || editRecord.clientId}` : "Add Annual Return Record"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editRecord && (
            <>
              <div>
                <label className="label">Company *</label>
                <select className="input-field" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} required>
                  <option value="">Select Company</option>
                  {clients.map((c) => <option key={c.clientId} value={c.clientId}>{c.companyName} ({c.category})</option>)}
                </select>
              </div>
              <div>
                <label className="label">Financial Year *</label>
                <select className="input-field" value={form.financialYear} onChange={(e) => setForm({ ...form, financialYear: e.target.value })} required>
                  {FINANCIAL_YEARS.map((y) => <option key={y}>{y}</option>)}
                </select>
              </div>
            </>
          )}
          <div>
            <label className="label">Status *</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STATUSES.map((s) => {
                const cfg = STATUS_CONFIG[s];
                const selected = form.status === s;
                return (
                  <button key={s} type="button" onClick={() => setForm({ ...form, status: s })}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${selected ? `${cfg.bg} ring-2 ${cfg.ring} ${cfg.badge}` : "border-base text-muted hover:bg-hover"}`}>
                    {cfg.icon}{cfg.label}
                    {selected && <span className="ml-auto w-2 h-2 rounded-full bg-current opacity-70 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
          {(form.status === "Filed" || form.status === "Verified") && (
            <>
              <div>
                <label className="label">Filing Date</label>
                <input type="date" className="input-field" value={form.filingDate} onChange={(e) => setForm({ ...form, filingDate: e.target.value })} />
              </div>
              <div>
                <label className="label">Acknowledgement Number</label>
                <input className="input-field font-mono text-sm" value={form.acknowledgeNumber}
                  onChange={(e) => setForm({ ...form, acknowledgeNumber: e.target.value })}
                  placeholder="e.g. CPCB/EPR/2025/XXXXX" />
              </div>
            </>
          )}
          <div>
            <label className="label">Remarks</label>
            <textarea className="input-field" rows={2} value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              placeholder="Any notes about the filing process…" />
          </div>
          <div className="flex gap-2 pt-2 border-t border-base">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving}>
              {saving ? "Saving…" : editRecord ? "Update" : "Add Record"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* ── GMAIL DRAFT MODAL ── */}
      <Modal open={draftModal} onClose={() => setDraftModal(false)} title="Draft Confirmation Email in Gmail" size="lg">
        <div className="space-y-4">
          {/* Info banner */}
          <div className="flex items-start gap-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3.5">
            <FileEdit className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Creates a styled HTML draft directly in your Gmail Drafts folder</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">Requires Gmail OAuth setup (one-time). Opens the draft so you can attach screenshots before sending.</p>
            </div>
          </div>

          {/* Recipients */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label !mb-0">Recipients</label>
              {draftTo.length > 0 && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  ✓ {draftTo.length} auto-filled from client profile
                </span>
              )}
            </div>
            <div className={`min-h-[44px] w-full rounded-lg border px-3 py-2 flex flex-wrap gap-2 items-center ${draftTo.length === 0 ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10" : "border-base bg-card"}`}>
              {draftTo.map((r, idx) => (
                <span key={r.email} className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                  idx === 0
                    ? "bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 ring-1 ring-brand-300 dark:ring-brand-700"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                }`}>
                  <span className={`text-[10px] font-bold uppercase tracking-wide mr-0.5 ${idx === 0 ? "text-brand-500 dark:text-brand-400" : "text-slate-400"}`}>
                    {idx === 0 ? "To" : "Cc"}
                  </span>
                  <span className="max-w-[180px] truncate" title={r.email}>
                    {r.label !== r.email
                      ? <><span className="font-semibold">{r.label}</span><span className="opacity-60 ml-1">· {r.email}</span></>
                      : r.email}
                  </span>
                  {idx > 0 && (
                    <button type="button" title="Move to To:"
                      onClick={() => setDraftTo([r, ...draftTo.filter(x => x.email !== r.email)])}
                      className="text-slate-400 hover:text-brand-500 transition-colors ml-0.5 text-[10px]">↑</button>
                  )}
                  <button type="button" onClick={() => setDraftTo(draftTo.filter(x => x.email !== r.email))} className="text-slate-400 hover:text-red-500 transition-colors ml-0.5">✕</button>
                </span>
              ))}
              {draftTo.length === 0 && <span className="text-xs text-amber-500">No emails found on this client — add manually below</span>}
            </div>
            <p className="text-xs text-faint mt-1">
              First recipient is <strong className="text-default">To:</strong>, rest are <strong className="text-default">Cc:</strong>. Use ↑ on any Cc chip to promote it to To:.
            </p>
          </div>

          <div>
            <label className="label">Add Recipient</label>
            <div className="flex gap-2">
              <input type="email" className="input-field flex-1" placeholder="email@domain.com" value={draftCustomEmail}
                onChange={(e) => setDraftCustomEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDraftEmail(); } }} />
              <button type="button" onClick={addDraftEmail} className="btn-secondary !px-3 shrink-0">+ Add</button>
            </div>
          </div>

          <div>
            <label className="label">Subject</label>
            <input className="input-field" value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} />
          </div>

          {/* Template preview */}
          {draftPreviewHtml && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/30">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Email preview (template shown below)</p>
                </div>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 rounded-full">Gmail will use plain text version</span>
              </div>
              <iframe srcDoc={draftPreviewHtml} className="w-full border-0" style={{ height: 300 }} title="Draft Preview" />
            </div>
          )}

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-300">
            <strong>📎 Remember to attach:</strong> CPCB portal screenshots, acknowledgement certificate, and any other compliance documents before sending.
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={openGmailDraft} disabled={draftLogging}
              className="btn-primary flex-1 justify-center bg-emerald-600 hover:bg-emerald-700">
              <ExternalLink className="w-4 h-4" />
              {draftLogging ? "Opening…" : "Open Gmail Compose"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setDraftModal(false)}>Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

"use client";
import React, { useState } from "react";
import toast from "react-hot-toast";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import { formatCurrency, FINANCIAL_YEARS, CURRENT_FY } from "@/lib/utils";
import { FileText, Download, Send, Plus, Trash2, CheckCircle, IndianRupee, Sparkles, Building2, Receipt, Landmark } from "lucide-react";

const CATEGORIES = ["CAT-I", "CAT-II", "CAT-III", "CAT-IV"];
const TYPES = ["Recycling", "EOL", "Co-processing", "Energy Recovery", "Other"];
const GST_OPTIONS = [0, 5, 12, 18, 28];

interface QuotationItem { id: string; description: string; category: string; type: string; quantity: string; rate: string; gstPercent: string; }
interface QuotationResult {
  quoteNumber: string; clientName: string; financialYear: string;
  items: { description: string; category: string; type: string; quantity: number; rate: number; gstPercent: number; subtotal: number; gstAmount: number; totalAmount: number; }[];
  itemsSubtotal: number; itemsGst: number;
  consultationCharges: number; consultationGstPercent: number; consultationGstAmount: number;
  governmentFees: number; grandTotal: number; notes: string; generatedAt: string;
}

const newRow = (): QuotationItem => ({ id: Math.random().toString(36).slice(2), description: "EPR Credit Procurement", category: "CAT-I", type: "Recycling", quantity: "1", rate: "", gstPercent: "18" });

function fmt(n: number) { return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }

export default function QuotationPage() {
  const [clientName, setClientName] = useState("");
  const [financialYear, setFinancialYear] = useState(CURRENT_FY);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<QuotationItem[]>([newRow()]);
  const [consultationCharges, setConsultationCharges] = useState("0");
  const [consultationGst, setConsultationGst] = useState("18");
  const [governmentFees, setGovernmentFees] = useState("0");
  const [quotation, setQuotation] = useState<QuotationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [emailModal, setEmailModal] = useState(false);
  const [emailForm, setEmailForm] = useState({ to: "", subject: "", message: "" });
  const [emailSending, setEmailSending] = useState(false);
  const [builtQuotationHtml, setBuiltQuotationHtml] = useState<string | null>(null);

  const updateItem = (id: string, field: keyof QuotationItem, value: string) =>
    setItems(items.map((item) => item.id === id ? { ...item, [field]: value } : item));
  const removeItem = (id: string) => { if (items.length > 1) setItems(items.filter((i) => i.id !== id)); };

  const calcRow = (item: QuotationItem) => {
    const qty = Number(item.quantity) || 0, rate = Number(item.rate) || 0, gst = Number(item.gstPercent) || 0;
    const subtotal = qty * rate;
    return { subtotal, gstAmt: subtotal * (gst / 100), total: subtotal + subtotal * (gst / 100) };
  };

  const liveItemsSubtotal = items.reduce((s, i) => s + calcRow(i).subtotal, 0);
  const liveItemsGst = items.reduce((s, i) => s + calcRow(i).gstAmt, 0);
  const liveCC = Number(consultationCharges) || 0;
  const liveCCGst = liveCC * ((Number(consultationGst) || 0) / 100);
  const liveGF = Number(governmentFees) || 0;
  const liveGrand = liveItemsSubtotal + liveItemsGst + liveCC + liveCCGst + liveGF;

  // Shared helper — builds the filled HTML string from the quotation template
  const buildHtml = async (q: QuotationResult): Promise<string> => {
    const tmplRes = await fetch("/api/quotation/template");
    const { html: template } = await tmplRes.json();
    const rowStyle = "border-bottom:1px solid #f1f5f9;";
    const td = "padding:11px 12px; font-size:12px; color:#374151; vertical-align:middle;";
    const tdR = "padding:11px 12px; font-size:12px; color:#374151; vertical-align:middle; text-align:right;";
    const itemRows = q.items.map((item, i) => `
      <tr style="${rowStyle}${i % 2 === 1 ? "background:#f8fafc;" : ""}">
        <td style="${td}">${item.description}</td>
        <td style="${td}"><span class="cat-badge">${item.category}</span></td>
        <td style="${td}"><span class="type-tag">${item.type}</span></td>
        <td style="${tdR}">${item.quantity.toLocaleString()}</td>
        <td style="${tdR} white-space:nowrap;">₹${fmt(item.rate)}</td>
        <td style="${tdR}">${item.gstPercent}%</td>
        <td style="${tdR} font-weight:600; color:#0f172a; white-space:nowrap;">₹${fmt(item.totalAmount)}</td>
      </tr>`).join("");
    return template
      .replace(/{{quoteNumber}}/g, q.quoteNumber)
      .replace(/{{clientName}}/g, q.clientName)
      .replace(/{{financialYear}}/g, q.financialYear)
      .replace(/{{generatedDate}}/g, fmtDate(q.generatedAt))
      .replace(/{{itemRows}}/g, itemRows)
      .replace(/{{itemsSubtotal}}/g, fmt(q.itemsSubtotal))
      .replace(/{{itemsGst}}/g, fmt(q.itemsGst))
      .replace(/{{consultationRow}}/g, q.consultationCharges > 0 ? `<tr><td style="padding:8px 14px; font-size:12px; color:#64748b; border-top:1px solid #f1f5f9;">Consultation Charges</td><td style="padding:8px 14px; font-size:12px; font-weight:600; color:#0f172a; text-align:right; border-top:1px solid #f1f5f9; white-space:nowrap;">₹${fmt(q.consultationCharges)}</td></tr>` : "")
      .replace(/{{consultationGstRow}}/g, q.consultationGstAmount > 0 ? `<tr><td style="padding:8px 14px; font-size:12px; color:#64748b; border-top:1px solid #f1f5f9;">GST on Consultation (${q.consultationGstPercent}%)</td><td style="padding:8px 14px; font-size:12px; font-weight:600; color:#0f172a; text-align:right; border-top:1px solid #f1f5f9; white-space:nowrap;">₹${fmt(q.consultationGstAmount)}</td></tr>` : "")
      .replace(/{{governmentFeesRow}}/g, q.governmentFees > 0 ? `<tr><td style="padding:8px 14px; font-size:12px; color:#64748b; border-top:1px solid #f1f5f9;">Government Fees</td><td style="padding:8px 14px; font-size:12px; font-weight:600; color:#0f172a; text-align:right; border-top:1px solid #f1f5f9; white-space:nowrap;">₹${fmt(q.governmentFees)}</td></tr>` : "")
      .replace(/{{grandTotal}}/g, fmt(q.grandTotal))
      .replace(/{{notesBlock}}/g, q.notes ? `<div class="notes-box"><div class="notes-label">Notes &amp; Terms</div><p>${q.notes.replace(/\n/g, "<br/>")}</p></div>` : "");
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      const r = await fetch("/api/quotation/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, financialYear, notes,
          consultationCharges: Number(consultationCharges), consultationGst: Number(consultationGst),
          governmentFees: Number(governmentFees),
          items: items.map((i) => ({ description: i.description, category: i.category, type: i.type, quantity: Number(i.quantity), rate: Number(i.rate), gstPercent: Number(i.gstPercent) })),
        }),
      });
      setQuotation(await r.json());
      toast.success("Quotation generated!");
    } finally { setLoading(false); }
  };

  const downloadPDF = async () => {
    if (!quotation) return;
    setPdfLoading(true);
    try {
      const html = await buildHtml(quotation);
      const win = window.open("", "_blank");
      if (!win) { toast.error("Popup blocked — allow popups"); return; }
      win.document.write(html); win.document.close(); win.focus();
      setTimeout(() => { win.print(); }, 600);
      toast.success("Print dialog opened — save as PDF");
    } finally { setPdfLoading(false); }
  };

  const openEmail = async () => {
    if (!quotation) return;
    setEmailForm({ to: "", subject: `Quotation ${quotation.quoteNumber} — ${quotation.clientName} — FY ${quotation.financialYear}`, message: "" });
    try {
      const html = await buildHtml(quotation);
      setBuiltQuotationHtml(html);
    } catch {
      setBuiltQuotationHtml(null);
    }
    setEmailModal(true);
  };

  const sendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailSending(true);
    try {
      const payload: Record<string, string> = { to: emailForm.to, subject: emailForm.subject, logType: "quotation", logClientName: quotation?.clientName || "", logFy: quotation?.financialYear || "" };
      if (builtQuotationHtml) {
        payload.quotationHtml = builtQuotationHtml;
      } else {
        payload.message = emailForm.message || `Dear ${quotation?.clientName},\n\nPlease find the quotation for FY ${quotation?.financialYear}.\n\nGrand Total: ₹${fmt(quotation?.grandTotal ?? 0)}\n\nRegards,\nNextgen Solutions`;
      }
      const r = await fetch("/api/email/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || "Failed to send email"); return; }
      toast.success("Email sent successfully!"); setEmailModal(false);
    } finally { setEmailSending(false); }
  };

  return (
    <div>
      <PageHeader title="Quotation Generator" description="Build multi-line quotations with GST, consultation charges, and government fees" />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── LEFT FORM ── */}
        <div className="xl:col-span-2 space-y-4">

          {/* Client + FY */}
          <div className="bg-card border border-base rounded-2xl p-5 shadow-sm transition-colors">
            <h3 className="font-semibold text-default mb-4 flex items-center gap-2"><Building2 className="w-4 h-4 text-muted" />Quotation Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="label">Client Name *</label><input className="input-field" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Company name" /></div>
              <div><label className="label">Financial Year</label><select className="input-field" value={financialYear} onChange={(e) => setFinancialYear(e.target.value)}>{FINANCIAL_YEARS.map((y) => <option key={y}>{y}</option>)}</select></div>
            </div>
          </div>

          {/* EPR Line Items */}
          <div className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden transition-colors">
            <div className="flex items-center justify-between p-4 border-b border-base">
              <h3 className="font-semibold text-default flex items-center gap-2"><IndianRupee className="w-4 h-4 text-muted" />EPR Credit Line Items</h3>
              <button type="button" onClick={() => setItems([...items, newRow()])} className="btn-primary !py-1.5 !text-xs"><Plus className="w-3.5 h-3.5" /> Add Row</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header" style={{ minWidth: 155 }}>Description</th>
                    <th className="table-header" style={{ minWidth: 90 }}>Category</th>
                    <th className="table-header" style={{ minWidth: 110 }}>Type</th>
                    <th className="table-header" style={{ minWidth: 70 }}>Qty</th>
                    <th className="table-header" style={{ minWidth: 95 }}>Rate (₹)</th>
                    <th className="table-header" style={{ minWidth: 70 }}>GST%</th>
                    <th className="table-header" style={{ minWidth: 105 }}>Amount</th>
                    <th className="table-header" style={{ minWidth: 34 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const { subtotal, gstAmt, total } = calcRow(item);
                    return (
                      <tr key={item.id} className="border-t border-soft">
                        <td className="px-3 py-2"><input className="input-field !py-1.5 text-xs" value={item.description} onChange={(e) => updateItem(item.id, "description", e.target.value)} /></td>
                        <td className="px-3 py-2"><select className="input-field !py-1.5 text-xs" value={item.category} onChange={(e) => updateItem(item.id, "category", e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></td>
                        <td className="px-3 py-2"><select className="input-field !py-1.5 text-xs" value={item.type} onChange={(e) => updateItem(item.id, "type", e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></td>
                        <td className="px-3 py-2"><input type="number" min="0" className="input-field !py-1.5 text-xs font-mono text-center" value={item.quantity} onChange={(e) => updateItem(item.id, "quantity", e.target.value)} /></td>
                        <td className="px-3 py-2"><input type="number" min="0" step="0.01" className="input-field !py-1.5 text-xs font-mono" value={item.rate} onChange={(e) => updateItem(item.id, "rate", e.target.value)} placeholder="0.00" /></td>
                        <td className="px-3 py-2"><select className="input-field !py-1.5 text-xs" value={item.gstPercent} onChange={(e) => updateItem(item.id, "gstPercent", e.target.value)}>{GST_OPTIONS.map((g) => <option key={g} value={g}>{g}%</option>)}</select></td>
                        <td className="px-3 py-2 text-right">
                          <p className="text-sm font-semibold text-default">{formatCurrency(total)}</p>
                          {Number(item.gstPercent) > 0 && <p className="text-xs text-muted">+GST {formatCurrency(gstAmt)}</p>}
                        </td>
                        <td className="px-2 py-2"><button type="button" onClick={() => removeItem(item.id)} className="p-1 text-faint hover:text-red-500 transition-colors" disabled={items.length === 1}><Trash2 className="w-3.5 h-3.5" /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-soft px-4 py-2.5 bg-surface flex justify-end gap-6 text-sm">
              <span className="text-muted text-xs">Credits Subtotal: <strong className="text-default">{formatCurrency(liveItemsSubtotal)}</strong></span>
              <span className="text-muted text-xs">GST: <strong className="text-default">{formatCurrency(liveItemsGst)}</strong></span>
            </div>
          </div>

          {/* Additional Charges + Summary */}
          <div className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden transition-colors">
            <div className="p-4 border-b border-base flex items-center gap-2">
              <Receipt className="w-4 h-4 text-muted" />
              <h3 className="font-semibold text-default">Additional Charges & Summary</h3>
            </div>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-base">
              {/* Left: inputs */}
              <div className="pb-4 md:pb-0 md:pr-5 space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 bg-brand-50 dark:bg-brand-900/30 rounded-lg flex items-center justify-center"><IndianRupee className="w-3.5 h-3.5 text-brand-600" /></div>
                    <p className="text-sm font-semibold text-default">Consultation Charges</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="label">Amount (₹)</label>
                      <input type="number" min="0" step="0.01" className="input-field font-mono" value={consultationCharges} onChange={(e) => setConsultationCharges(e.target.value)} placeholder="0.00" />
                    </div>
                    <div>
                      <label className="label">GST %</label>
                      <select className="input-field" value={consultationGst} onChange={(e) => setConsultationGst(e.target.value)}>
                        {GST_OPTIONS.map((g) => <option key={g} value={g}>{g}%</option>)}
                      </select>
                    </div>
                  </div>
                  {liveCC > 0 && liveCCGst > 0 && (
                    <p className="text-xs text-brand-600 dark:text-brand-400 mt-1 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-brand-400 rounded-full" />
                      GST amount: {formatCurrency(liveCCGst)} · Total: {formatCurrency(liveCC + liveCCGst)}
                    </p>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 bg-amber-50 dark:bg-amber-900/30 rounded-lg flex items-center justify-center"><Landmark className="w-3.5 h-3.5 text-amber-600" /></div>
                    <p className="text-sm font-semibold text-default">Government Fees</p>
                  </div>
                  <input type="number" min="0" step="0.01" className="input-field font-mono" value={governmentFees} onChange={(e) => setGovernmentFees(e.target.value)} placeholder="0.00" />
                  <p className="text-xs text-faint mt-1">CPCB / SPCB / portal charges (no GST)</p>
                </div>
              </div>

              {/* Right: live breakup */}
              <div className="pt-4 md:pt-0 md:pl-5">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Live Breakup</p>
                <div className="space-y-2">
                  {[
                    { label: "EPR Credits (excl. GST)", value: liveItemsSubtotal, cls: "text-default" },
                    { label: "GST on Credits", value: liveItemsGst, cls: "text-muted" },
                    ...(liveCC > 0 ? [{ label: "Consultation Charges", value: liveCC, cls: "text-default" }] : []),
                    ...(liveCCGst > 0 ? [{ label: `GST on Consultation (${consultationGst}%)`, value: liveCCGst, cls: "text-muted" }] : []),
                    ...(liveGF > 0 ? [{ label: "Government Fees", value: liveGF, cls: "text-default" }] : []),
                  ].map(({ label, value, cls }) => (
                    <div key={label} className="flex justify-between items-center text-sm">
                      <span className="text-muted">{label}</span>
                      <span className={`font-medium ${cls}`}>{formatCurrency(value)}</span>
                    </div>
                  ))}
                  <div className="border-t border-base mt-2 pt-2 flex justify-between items-center">
                    <span className="font-bold text-default">Grand Total</span>
                    <span className="text-2xl font-black text-brand-600 dark:text-brand-400">{formatCurrency(liveGrand)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="border-t border-base p-4">
              <label className="label">Notes / Terms</label>
              <textarea className="input-field" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment terms, validity, special conditions…" />
            </div>
          </div>

          {/* Generate button */}
          <button onClick={handleGenerate} disabled={loading || !clientName} className="btn-primary w-full justify-center py-3.5 text-base font-semibold rounded-2xl shadow-lg shadow-brand-600/20 hover:shadow-brand-600/30 transition-all">
            <Sparkles className="w-5 h-5" />{loading ? "Generating…" : "Generate Quotation"}
          </button>
        </div>

        {/* ── RIGHT: RESULT PANEL ── */}
        <div className="xl:col-span-1">
          <div className="sticky top-6 space-y-3">
            {quotation ? (
              <>
                <div className="bg-card border border-base rounded-2xl shadow-sm overflow-hidden transition-colors">
                  <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-4 text-white">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-4 h-4" />
                      <span className="font-semibold text-sm">Quotation Ready</span>
                    </div>
                    <p className="font-mono text-xs text-white/70">{quotation.quoteNumber}</p>
                  </div>
                  <div className="px-4 py-3 border-b border-base flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-default text-sm">{quotation.clientName}</p>
                      <p className="text-xs text-muted">{fmtDate(quotation.generatedAt)}</p>
                    </div>
                    <span className="text-xs font-bold bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 px-2.5 py-1 rounded-full">FY {quotation.financialYear}</span>
                  </div>
                  <div className="px-4 py-3 space-y-1.5">
                    <p className="text-xs font-semibold text-muted uppercase tracking-wide">{quotation.items.length} Line Item{quotation.items.length !== 1 ? "s" : ""}</p>
                    {quotation.items.map((item, i) => (
                      <div key={i} className="flex justify-between items-start text-xs">
                        <div><span className="font-medium text-default">{item.category}</span><span className="text-muted"> · {item.type} · qty {item.quantity.toLocaleString()}</span></div>
                        <span className="font-semibold text-default ml-2 shrink-0">{formatCurrency(item.totalAmount)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-base px-4 py-3 bg-surface space-y-1.5">
                    {[
                      ["EPR Credits Subtotal", quotation.itemsSubtotal],
                      ["GST on Credits", quotation.itemsGst],
                      ...(quotation.consultationCharges > 0 ? [["Consultation", quotation.consultationCharges]] : []),
                      ...(quotation.consultationGstAmount > 0 ? [[`GST on Consult. (${quotation.consultationGstPercent}%)`, quotation.consultationGstAmount]] : []),
                      ...(quotation.governmentFees > 0 ? [["Government Fees", quotation.governmentFees]] : []),
                    ].map(([label, val]) => (
                      <div key={label as string} className="flex justify-between text-xs text-muted">
                        <span>{label as string}</span><span className="font-medium">{formatCurrency(val as number)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-2 border-t border-base mt-2">
                      <span className="text-sm font-bold text-default">Grand Total</span>
                      <span className="text-xl font-black text-brand-600 dark:text-brand-400">{formatCurrency(quotation.grandTotal)}</span>
                    </div>
                  </div>
                </div>
                <button onClick={downloadPDF} disabled={pdfLoading} className="btn-primary w-full justify-center py-2.5"><Download className="w-4 h-4" />{pdfLoading ? "Opening..." : "Download PDF"}</button>
                <button onClick={openEmail} className="btn-secondary w-full justify-center py-2.5"><Send className="w-4 h-4" />Send via Email</button>
                <p className="text-xs text-faint text-center">Customise PDF design: <code className="text-brand-600 bg-brand-50 dark:bg-brand-900/20 px-1 rounded">templates/quotation.html</code></p>
              </>
            ) : (
              <div className="bg-card border border-base rounded-2xl p-8 shadow-sm text-center transition-colors">
                <div className="w-16 h-16 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-4"><FileText className="w-7 h-7 text-faint" /></div>
                <p className="font-medium text-muted mb-1">No quotation yet</p>
                <p className="text-sm text-faint">Fill in line items and click Generate</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Email Modal */}
      <Modal open={emailModal} onClose={() => setEmailModal(false)} title="Send Quotation via Email" size="lg">
        <form onSubmit={sendEmail} className="space-y-4">
          <div><label className="label">To *</label><input type="email" className="input-field" value={emailForm.to} onChange={(e) => setEmailForm({ ...emailForm, to: e.target.value })} required placeholder="client@example.com" /></div>
          <div><label className="label">Subject *</label><input className="input-field" value={emailForm.subject} onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })} required /></div>

          {builtQuotationHtml ? (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/30">
                <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Full quotation will be sent as the email body</p>
              </div>
              <iframe srcDoc={builtQuotationHtml} className="w-full border-0" style={{ height: 300 }} title="Quotation Preview" />
            </div>
          ) : (
            <div>
              <label className="label">Message</label>
              <textarea className="input-field" rows={6} value={emailForm.message} onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })} placeholder={`Dear ${quotation?.clientName},\n\nPlease find the quotation…`} />
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={emailSending} className="btn-primary flex-1 justify-center">
              <Send className="w-4 h-4" />{emailSending ? "Sending…" : "Send Email"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEmailModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// Reads the HTML template and replaces placeholders with real data.
import { escapeHtml, escapeHtmlWithLineBreaks } from "@/utils/sanitizeHtml";
// To redesign the PDF, edit /templates/quotation.html — no code changes needed.

export interface QuotationResult {
  quoteNumber: string;
  clientName: string;
  clientAddress?: string;
  clientGst?: string;
  clientState?: string;
  financialYear: string;
  items: {
    description: string; category: string; type: string;
    quantity: number; rate: number; gstPercent: number;
    subtotal: number; gstAmount: number; totalAmount: number;
  }[];
  itemsSubtotal: number;
  itemsGst: number;
  consultationCharges: number;
  consultationGstPercent: number;
  consultationGstAmount: number;
  governmentFees: number;
  grandTotal: number;
  notes: string;
  generatedAt: string;
  validityDays?: number;
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function buildQuotationHTML(template: string, q: QuotationResult): string {
  const catBadgeStyle = "display:inline-block; background-color:#eff6ff; color:#2563eb; font-size:10px; font-weight:700; padding:2px 7px; border-radius:10px;";
  const typeTagStyle = "color:#64748b; font-size:11px;";

  // Build item rows with inline styling directly on td elements for email client compatibility
  const itemRows = q.items.map((item, i) => {
    const rowBg = i % 2 === 1 ? "background-color:#f8fafc;" : "background-color:#ffffff;";
    const borderB = "border-bottom:1px solid #f1f5f9;";
    const td = `padding:11px 12px; font-size:12px; color:#374151; vertical-align:middle; ${rowBg} ${borderB}`;
    const tdR = `padding:11px 12px; font-size:12px; color:#374151; vertical-align:middle; text-align:right; ${rowBg} ${borderB}`;
    
    return `
    <tr>
      <td style="${td}">${escapeHtml(item.description)}</td>
      <td style="${td}"><span style="${catBadgeStyle}">${escapeHtml(item.category)}</span></td>
      <td style="${td}"><span style="${typeTagStyle}">${escapeHtml(item.type)}</span></td>
      <td style="${tdR}">${item.quantity.toLocaleString()}</td>
      <td style="${tdR} white-space:nowrap;">₹${fmt(item.rate)}</td>
      <td style="${tdR}">${item.gstPercent}%</td>
      <td style="${tdR} font-weight:600; color:#0f172a; white-space:nowrap;">₹${fmt(item.totalAmount)}</td>
    </tr>`;
  }).join("\n");

  // Optional summary rows with inline styling
  const sumLabelStyle = "padding:8px 14px; font-size:12px; color:#64748b; border-top:1px solid #f1f5f9;";
  const sumValueStyle = "padding:8px 14px; font-size:12px; font-weight:600; color:#0f172a; text-align:right; border-top:1px solid #f1f5f9; white-space:nowrap;";

  const consultationRow = q.consultationCharges > 0
    ? `<tr><td style="${sumLabelStyle}">Consultation Charges</td><td style="${sumValueStyle}">₹${fmt(q.consultationCharges)}</td></tr>`
    : "";

  const consultationGstRow = q.consultationGstAmount > 0
    ? `<tr><td style="${sumLabelStyle}">GST on Consultation (${q.consultationGstPercent}%)</td><td style="${sumValueStyle}">₹${fmt(q.consultationGstAmount)}</td></tr>`
    : "";

  const governmentFeesRow = q.governmentFees > 0
    ? `<tr><td style="${sumLabelStyle}">Government Fees</td><td style="${sumValueStyle}">₹${fmt(q.governmentFees)}</td></tr>`
    : "";

  // Notes block with inline styles for Gmail compatibility
  const notesBlock = q.notes
    ? `<div style="background-color:#fffbeb; border-left:4px solid #f59e0b; border-radius:0 8px 8px 0; padding:14px 16px; margin-bottom:24px; margin-top:24px;">
         <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#b45309; margin-bottom:6px;">Notes &amp; Terms</div>
         <p style="color:#78350f; font-size:12px; line-height:1.6; margin:0;">${escapeHtmlWithLineBreaks(q.notes)}</p>
       </div>`
    : "";

  return template
    .replace(/{{quoteNumber}}/g, escapeHtml(q.quoteNumber))
    .replace(/{{clientName}}/g, escapeHtml(q.clientName))
    .replace(/{{clientAddress}}/g, escapeHtml(q.clientAddress || "—"))
    .replace(/{{clientGst}}/g, escapeHtml(q.clientGst || "—"))
    .replace(/{{clientState}}/g, escapeHtml(q.clientState || "—"))
    .replace(/{{financialYear}}/g, escapeHtml(q.financialYear))
    .replace(/{{generatedDate}}/g, fmtDate(q.generatedAt))
    .replace(/{{itemRows}}/g, itemRows)
    .replace(/{{itemsSubtotal}}/g, fmt(q.itemsSubtotal))
    .replace(/{{itemsGst}}/g, fmt(q.itemsGst))
    .replace(/{{consultationRow}}/g, consultationRow)
    .replace(/{{consultationGstRow}}/g, consultationGstRow)
    .replace(/{{governmentFeesRow}}/g, governmentFeesRow)
    .replace(/{{grandTotal}}/g, fmt(q.grandTotal))
    .replace(/{{notesBlock}}/g, notesBlock)
    .replace(/{{validityDays}}/g, String(q.validityDays ?? 30));
}

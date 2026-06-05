// Reads the HTML template and replaces placeholders with real data.
import { escapeHtml, escapeHtmlWithLineBreaks } from "@/utils/sanitizeHtml";
// To redesign the PDF, edit /templates/quotation.html — no code changes needed.

export interface QuotationResult {
  quoteNumber: string;
  fileTitle?: string;
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
  const categoryStyle = "color:#1d1d1f; font-size:11px; font-weight:600;";
  const typeTagStyle = "color:#6e6e73; font-size:11px;";

  // Build item rows with inline styling directly on td elements for email client compatibility
  const itemRows = q.items.map((item) => {
    const borderB = "border-bottom:1px solid #e8e8ed;";
    const td = `padding:14px 0; font-size:12px; color:#1d1d1f; vertical-align:top; ${borderB}`;
    const tdMuted = `padding:14px 0; font-size:12px; color:#6e6e73; vertical-align:top; ${borderB}`;
    const tdR = `padding:14px 0; font-size:12px; color:#1d1d1f; vertical-align:top; text-align:right; ${borderB}`;
    
    return `
    <tr>
      <td style="${td}"><div style="font-weight:600;">${escapeHtml(item.description)}</div><div style="${typeTagStyle}; margin-top:3px;">${escapeHtml(item.type)}</div></td>
      <td style="${tdMuted}"><span style="${categoryStyle}">${escapeHtml(item.category)}</span></td>
      <td style="${tdR}">${item.quantity.toLocaleString()} MT</td>
      <td style="${tdR} white-space:nowrap;">₹${fmt(item.rate)}</td>
      <td style="${tdR}">${item.gstPercent}%</td>
      <td style="${tdR} font-weight:600; white-space:nowrap;">₹${fmt(item.totalAmount)}</td>
    </tr>`;
  }).join("\n");

  const feeRows = [
    q.consultationCharges > 0
      ? {
          description: "Consultancy Charges",
          detail: "Professional fee",
          category: "Consultancy",
          qty: "—",
          rate: `₹${fmt(q.consultationCharges)}`,
          gst: `${q.consultationGstPercent}%`,
          amount: q.consultationCharges + q.consultationGstAmount,
        }
      : null,
    q.governmentFees > 0
      ? {
          description: "Government / Portal Fees",
          detail: "Statutory fee",
          category: "Government",
          qty: "—",
          rate: "—",
          gst: "0%",
          amount: q.governmentFees,
        }
      : null,
  ].filter(Boolean).map((row) => {
    const fee = row as {
      description: string; detail: string; category: string; qty: string; rate: string; gst: string; amount: number;
    };
    const borderB = "border-bottom:1px solid #e8e8ed;";
    const td = `padding:14px 0; font-size:12px; color:#1d1d1f; vertical-align:top; ${borderB}`;
    const tdMuted = `padding:14px 0; font-size:12px; color:#6e6e73; vertical-align:top; ${borderB}`;
    const tdR = `padding:14px 0; font-size:12px; color:#1d1d1f; vertical-align:top; text-align:right; ${borderB}`;

    return `
    <tr>
      <td style="${td}"><div style="font-weight:600;">${escapeHtml(fee.description)}</div><div style="${typeTagStyle}; margin-top:3px;">${escapeHtml(fee.detail)}</div></td>
      <td style="${tdMuted}"><span style="${categoryStyle}">${escapeHtml(fee.category)}</span></td>
      <td style="${tdR}">${fee.qty}</td>
      <td style="${tdR}">${fee.rate}</td>
      <td style="${tdR}">${fee.gst}</td>
      <td style="${tdR} font-weight:600; white-space:nowrap;">₹${fmt(fee.amount)}</td>
    </tr>`;
  }).join("\n");

  // Optional summary rows with inline styling
  const sumLabelStyle = "padding:7px 0; font-size:12px; color:#6e6e73;";
  const sumValueStyle = "padding:7px 0; font-size:12px; font-weight:500; color:#1d1d1f; text-align:right; white-space:nowrap;";

  const consultationRow = q.consultationCharges > 0
    ? `<tr><td style="${sumLabelStyle}">Consultancy Charges</td><td style="${sumValueStyle}">₹${fmt(q.consultationCharges)}</td></tr>`
    : "";

  const consultationGstRow = q.consultationGstAmount > 0
    ? `<tr><td style="${sumLabelStyle}">GST on Consultancy (${q.consultationGstPercent}%)</td><td style="${sumValueStyle}">₹${fmt(q.consultationGstAmount)}</td></tr>`
    : "";

  const governmentFeesRow = q.governmentFees > 0
    ? `<tr><td style="${sumLabelStyle}">Government / Portal Fees</td><td style="${sumValueStyle}">₹${fmt(q.governmentFees)}</td></tr>`
    : "";

  // Notes block with inline styles for Gmail compatibility
  const notesBlock = q.notes
    ? `<div style="border-top:1px solid #e8e8ed; padding-top:18px; margin-top:24px;">
         <div style="font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.8px; color:#86868b; margin-bottom:8px;">Notes &amp; Terms</div>
         <p style="color:#424245; font-size:12px; line-height:1.6; margin:0;">${escapeHtmlWithLineBreaks(q.notes)}</p>
       </div>`
    : "";

  return template
    .replace(/{{quoteNumber}}/g, escapeHtml(q.quoteNumber))
    .replace(/{{fileTitle}}/g, escapeHtml(q.fileTitle || q.quoteNumber))
    .replace(/{{clientName}}/g, escapeHtml(q.clientName))
    .replace(/{{clientAddress}}/g, escapeHtml(q.clientAddress || "—"))
    .replace(/{{clientGst}}/g, escapeHtml(q.clientGst || "—"))
    .replace(/{{clientState}}/g, escapeHtml(q.clientState || "—"))
    .replace(/{{financialYear}}/g, escapeHtml(q.financialYear))
    .replace(/{{generatedDate}}/g, fmtDate(q.generatedAt))
    .replace(/{{itemRows}}/g, itemRows + feeRows)
    .replace(/{{itemsSubtotal}}/g, fmt(q.itemsSubtotal))
    .replace(/{{itemsGst}}/g, fmt(q.itemsGst))
    .replace(/{{consultationRow}}/g, consultationRow)
    .replace(/{{consultationGstRow}}/g, consultationGstRow)
    .replace(/{{governmentFeesRow}}/g, governmentFeesRow)
    .replace(/{{grandTotal}}/g, fmt(q.grandTotal))
    .replace(/{{notesBlock}}/g, notesBlock)
    .replace(/{{validityDays}}/g, String(q.validityDays ?? 30));
}

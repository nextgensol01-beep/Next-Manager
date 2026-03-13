// Reads the HTML template and replaces placeholders with real data.
// To redesign the PDF, edit /templates/quotation.html — no code changes needed.

export interface QuotationResult {
  quoteNumber: string;
  clientName: string;
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
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function buildQuotationHTML(template: string, q: QuotationResult): string {
  // Build item rows
  const itemRows = q.items.map((item) => `
    <tr>
      <td>${item.description}</td>
      <td><span class="cat-badge">${item.category}</span></td>
      <td><span class="type-tag">${item.type}</span></td>
      <td class="right">${item.quantity.toLocaleString()}</td>
      <td class="right">₹${fmt(item.rate)}</td>
      <td class="right">${item.gstPercent}%</td>
      <td class="right amount-cell">₹${fmt(item.totalAmount)}</td>
    </tr>`).join("\n");

  // Optional summary rows
  const consultationRow = q.consultationCharges > 0
    ? `<tr><td class="label-col">Consultation Charges</td><td class="value-col">₹${fmt(q.consultationCharges)}</td></tr>`
    : "";

  const consultationGstRow = q.consultationGstAmount > 0
    ? `<tr><td class="label-col">GST on Consultation (${q.consultationGstPercent}%)</td><td class="value-col">₹${fmt(q.consultationGstAmount)}</td></tr>`
    : "";

  const governmentFeesRow = q.governmentFees > 0
    ? `<tr><td class="label-col">Government Fees</td><td class="value-col">₹${fmt(q.governmentFees)}</td></tr>`
    : "";

  const notesBlock = q.notes
    ? `<div class="notes-box"><div class="notes-label">Notes &amp; Terms</div><p>${q.notes.replace(/\n/g, "<br/>")}</p></div>`
    : "";

  return template
    .replace(/{{quoteNumber}}/g, q.quoteNumber)
    .replace(/{{clientName}}/g, q.clientName)
    .replace(/{{financialYear}}/g, q.financialYear)
    .replace(/{{generatedDate}}/g, fmtDate(q.generatedAt))
    .replace(/{{itemRows}}/g, itemRows)
    .replace(/{{itemsSubtotal}}/g, fmt(q.itemsSubtotal))
    .replace(/{{itemsGst}}/g, fmt(q.itemsGst))
    .replace(/{{consultationRow}}/g, consultationRow)
    .replace(/{{consultationGstRow}}/g, consultationGstRow)
    .replace(/{{governmentFeesRow}}/g, governmentFeesRow)
    .replace(/{{grandTotal}}/g, fmt(q.grandTotal))
    .replace(/{{notesBlock}}/g, notesBlock);
}

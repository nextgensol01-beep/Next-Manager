// PDF generation utilities using jsPDF
// These run client-side

export interface QuotationData {
  clientName: string
  clientEmail?: string
  financialYear: string
  govtCharges: number
  consultancyCharges: number
  targetCharges: number
  otherCharges: number
  gstPercent: number
  notes?: string
  quotationNumber?: string
  date?: string
}

export interface PaymentStatementData {
  clientName: string
  clientId: string
  financialYear: string
  govtCharges: number
  consultancyCharges: number
  targetCharges: number
  otherCharges: number
  totalBilled: number
  payments: Array<{
    date: string
    amount: number
    mode: string
    reference: string
    notes?: string
  }>
  totalPaid: number
  pendingAmount: number
  paymentStatus: string
}

export async function generateQuotationPDF(data: QuotationData): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const { autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()

  // Header background
  doc.setFillColor(30, 64, 175)
  doc.rect(0, 0, pageWidth, 45, 'F')

  // Company name
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('NEXTGEN SOLUTIONS', 14, 18)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('EPR Consultancy | www.nextgensolutions.com', 14, 27)
  doc.text(process.env.NEXT_PUBLIC_COMPANY_ADDRESS || 'Your Company Address', 14, 34)

  // Quotation title on the right
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('QUOTATION', pageWidth - 14, 22, { align: 'right' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`No: ${data.quotationNumber || 'QT-' + Date.now().toString().slice(-6)}`, pageWidth - 14, 30, { align: 'right' })
  doc.text(`Date: ${data.date || new Date().toLocaleDateString('en-IN')}`, pageWidth - 14, 37, { align: 'right' })

  // Reset text color
  doc.setTextColor(0, 0, 0)

  // Bill To
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('BILL TO:', 14, 58)
  doc.setFont('helvetica', 'normal')
  doc.text(data.clientName, 14, 65)
  if (data.clientEmail) doc.text(data.clientEmail, 14, 72)
  doc.text(`Financial Year: ${data.financialYear}`, 14, 79)

  // Charges Table
  const subtotal =
    data.govtCharges +
    data.consultancyCharges +
    data.targetCharges +
    data.otherCharges
  const gstAmount = (subtotal * data.gstPercent) / 100
  const grandTotal = subtotal + gstAmount

  const tableData = []
  if (data.govtCharges > 0)
    tableData.push(['1', 'Government Charges (EPR Registration/Filing)', '1', formatINR(data.govtCharges), formatINR(data.govtCharges)])
  if (data.consultancyCharges > 0)
    tableData.push(['2', 'Consultancy Charges', '1', formatINR(data.consultancyCharges), formatINR(data.consultancyCharges)])
  if (data.targetCharges > 0)
    tableData.push(['3', 'Target Compliance Charges', '1', formatINR(data.targetCharges), formatINR(data.targetCharges)])
  if (data.otherCharges > 0)
    tableData.push(['4', 'Other Charges', '1', formatINR(data.otherCharges), formatINR(data.otherCharges)])

  const quotationTable = autoTable(doc, {
    startY: 88,
    head: [['#', 'Description', 'Qty', 'Unit Price', 'Amount']],
    body: tableData,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 12 },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 35, halign: 'right' },
      4: { cellWidth: 35, halign: 'right' },
    },
  })

  const finalY = quotationTable.finalY + 10

  // Totals
  doc.setFontSize(9)
  doc.text('Subtotal:', pageWidth - 70, finalY)
  doc.text(formatINR(subtotal), pageWidth - 14, finalY, { align: 'right' })

  doc.text(`GST (${data.gstPercent}%):`, pageWidth - 70, finalY + 7)
  doc.text(formatINR(gstAmount), pageWidth - 14, finalY + 7, { align: 'right' })

  doc.setFillColor(30, 64, 175)
  doc.rect(pageWidth - 80, finalY + 12, 66, 10, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.text('GRAND TOTAL:', pageWidth - 70, finalY + 19)
  doc.text(formatINR(grandTotal), pageWidth - 14, finalY + 19, { align: 'right' })

  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')

  // Notes
  if (data.notes) {
    doc.text('Notes:', 14, finalY + 15)
    doc.setFontSize(8)
    const splitNotes = doc.splitTextToSize(data.notes, 130)
    doc.text(splitNotes, 14, finalY + 22)
  }

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.setFillColor(245, 245, 245)
  doc.rect(0, pageHeight - 20, pageWidth, 20, 'F')
  doc.setFontSize(8)
  doc.setTextColor(100, 100, 100)
  doc.text('Thank you for your business! | Nextgen Solutions - EPR Consultancy', pageWidth / 2, pageHeight - 10, { align: 'center' })

  doc.save(`Quotation_${data.clientName}_${data.financialYear}.pdf`)
}

export async function generatePaymentStatementPDF(data: PaymentStatementData): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const { autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()

  // Header
  doc.setFillColor(30, 64, 175)
  doc.rect(0, 0, pageWidth, 45, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('NEXTGEN SOLUTIONS', 14, 18)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('EPR Consultancy', 14, 27)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('PAYMENT STATEMENT', pageWidth - 14, 22, { align: 'right' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, pageWidth - 14, 37, { align: 'right' })

  doc.setTextColor(0, 0, 0)

  // Client info
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('CLIENT:', 14, 58)
  doc.setFont('helvetica', 'normal')
  doc.text(data.clientName, 14, 65)
  doc.text(`Client ID: ${data.clientId} | FY: ${data.financialYear}`, 14, 72)

  // Billing breakdown
  const billingTable = autoTable(doc, {
    startY: 80,
    head: [['Charge Type', 'Amount']],
    body: [
      ['Government Charges', formatINR(data.govtCharges)],
      ['Consultancy Charges', formatINR(data.consultancyCharges)],
      ['Target Charges', formatINR(data.targetCharges)],
      ['Other Charges', formatINR(data.otherCharges)],
      ['TOTAL BILLED', formatINR(data.totalBilled)],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    columnStyles: { 1: { halign: 'right' } },
    bodyStyles: { fontSize: 9 },
    didParseCell: (hookData) => {
      if (hookData.row.index === 4) {
        hookData.cell.styles.fontStyle = 'bold'
        hookData.cell.styles.fillColor = [240, 245, 255]
      }
    },
  })

  const afterBilling = billingTable.finalY + 10

  // Payments history
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Payment History', 14, afterBilling)

  const paymentsTable = autoTable(doc, {
    startY: afterBilling + 5,
    head: [['Date', 'Amount', 'Mode', 'Reference', 'Notes']],
    body: data.payments.map((p) => [
      p.date,
      formatINR(p.amount),
      p.mode,
      p.reference || '-',
      p.notes || '-',
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    columnStyles: { 1: { halign: 'right' } },
  })

  const afterPayments = paymentsTable.finalY + 10

  // Summary
  const statusColor: Record<string, [number, number, number]> = {
    Paid: [22, 163, 74],
    Partial: [234, 179, 8],
    Unpaid: [220, 38, 38],
  }
  const color = statusColor[data.paymentStatus] || [100, 100, 100]

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Total Billed:', pageWidth - 90, afterPayments)
  doc.text(formatINR(data.totalBilled), pageWidth - 14, afterPayments, { align: 'right' })
  doc.text('Total Paid:', pageWidth - 90, afterPayments + 7)
  doc.text(formatINR(data.totalPaid), pageWidth - 14, afterPayments + 7, { align: 'right' })
  doc.text('Pending Amount:', pageWidth - 90, afterPayments + 14)
  doc.text(formatINR(data.pendingAmount), pageWidth - 14, afterPayments + 14, { align: 'right' })

  doc.setFillColor(...color)
  doc.rect(pageWidth - 80, afterPayments + 18, 66, 10, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.text(`Status: ${data.paymentStatus}`, pageWidth / 2 + 20, afterPayments + 25, { align: 'center' })

  doc.save(`PaymentStatement_${data.clientName}_${data.financialYear}.pdf`)
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

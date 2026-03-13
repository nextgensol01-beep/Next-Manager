// Excel export utilities using ExcelJS (server-side)
import ExcelJS from 'exceljs'

const BRAND_COLOR = '1E40AF'
const LIGHT_BLUE = 'DBEAFE'

function applyHeaderStyle(cell: ExcelJS.Cell) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_COLOR } }
  cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 }
  cell.alignment = { vertical: 'middle', horizontal: 'center' }
  cell.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  }
}

function applyDataStyle(cell: ExcelJS.Cell, rowIndex: number) {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: rowIndex % 2 === 0 ? LIGHT_BLUE : 'FFFFFF' },
  }
  cell.border = {
    top: { style: 'thin', color: { argb: 'E2E8F0' } },
    left: { style: 'thin', color: { argb: 'E2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
    right: { style: 'thin', color: { argb: 'E2E8F0' } },
  }
  cell.alignment = { vertical: 'middle' }
}

export async function exportTargetsToExcel(
  data: Array<{
    clientId: string
    companyName: string
    category: string
    financialYear: string
    targetAmount: number
    achievedAmount: number
    remainingTarget: number
  }>,
  financialYear: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Nextgen Solutions ERP'

  const sheet = workbook.addWorksheet(`Targets ${financialYear}`)

  // Title row
  sheet.mergeCells('A1:G1')
  const titleCell = sheet.getCell('A1')
  titleCell.value = `Targets Report - Financial Year ${financialYear}`
  titleCell.font = { bold: true, size: 14, color: { argb: BRAND_COLOR } }
  titleCell.alignment = { horizontal: 'center' }

  sheet.mergeCells('A2:G2')
  const subCell = sheet.getCell('A2')
  subCell.value = `Generated on ${new Date().toLocaleDateString('en-IN')} | Nextgen Solutions`
  subCell.font = { size: 9, italic: true, color: { argb: '6B7280' } }
  subCell.alignment = { horizontal: 'center' }

  sheet.addRow([]) // Blank row

  const headers = ['Client ID', 'Company Name', 'Category', 'Financial Year', 'Target (₹)', 'Achieved (₹)', 'Remaining (₹)']
  const headerRow = sheet.addRow(headers)
  headerRow.eachCell((cell) => applyHeaderStyle(cell))
  headerRow.height = 25

  sheet.columns = [
    { key: 'clientId', width: 15 },
    { key: 'companyName', width: 30 },
    { key: 'category', width: 15 },
    { key: 'financialYear', width: 15 },
    { key: 'targetAmount', width: 18 },
    { key: 'achievedAmount', width: 18 },
    { key: 'remainingTarget', width: 18 },
  ]

  data.forEach((row, idx) => {
    const dataRow = sheet.addRow([
      row.clientId,
      row.companyName,
      row.category,
      row.financialYear,
      row.targetAmount,
      row.achievedAmount,
      row.remainingTarget,
    ])
    dataRow.height = 20
    dataRow.eachCell((cell, colNumber) => {
      applyDataStyle(cell, idx)
      if (colNumber >= 5) {
        cell.numFmt = '₹#,##0'
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
      }
    })
    // Color remaining
    const remainingCell = dataRow.getCell(7)
    if (row.remainingTarget > 0) {
      remainingCell.font = { color: { argb: 'DC2626' } }
    } else {
      remainingCell.font = { color: { argb: '16A34A' }, bold: true }
    }
  })

  // Summary row
  const totalRow = sheet.addRow([
    'TOTAL', '', '', '',
    { formula: `SUM(E4:E${data.length + 4})` },
    { formula: `SUM(F4:F${data.length + 4})` },
    { formula: `SUM(G4:G${data.length + 4})` },
  ])
  totalRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_COLOR } }
    cell.font = { bold: true, color: { argb: 'FFFFFF' } }
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
    cell.numFmt = '₹#,##0'
  })

  return workbook.xlsx.writeBuffer() as Promise<Buffer>
}

export async function exportPWPCreditsToExcel(
  data: Array<{
    clientId: string
    companyName: string
    availableCredits: number
    usedCredits: number
    remainingCredits: number
  }>,
  financialYear: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(`PWP Credits ${financialYear}`)

  sheet.mergeCells('A1:E1')
  const titleCell = sheet.getCell('A1')
  titleCell.value = `PWP Credits Summary - Financial Year ${financialYear}`
  titleCell.font = { bold: true, size: 14, color: { argb: BRAND_COLOR } }
  titleCell.alignment = { horizontal: 'center' }
  sheet.addRow([])

  const headers = ['Client ID', 'Company Name', 'Available Credits', 'Used Credits', 'Remaining Credits']
  const headerRow = sheet.addRow(headers)
  headerRow.eachCell((cell) => applyHeaderStyle(cell))
  headerRow.height = 25

  sheet.columns = [
    { width: 15 }, { width: 30 }, { width: 20 }, { width: 18 }, { width: 20 }
  ]

  data.forEach((row, idx) => {
    const dataRow = sheet.addRow([
      row.clientId, row.companyName,
      row.availableCredits, row.usedCredits, row.remainingCredits
    ])
    dataRow.eachCell((cell, colNumber) => {
      applyDataStyle(cell, idx)
      if (colNumber >= 3) {
        cell.numFmt = '#,##0'
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
      }
    })
  })

  return workbook.xlsx.writeBuffer() as Promise<Buffer>
}

export async function exportTransactionsToExcel(
  data: Array<{
    date: string
    financialYear: string
    fromClientId: string
    fromClientName: string
    toClientId: string
    toClientName: string
    quantity: number
    rate: number
    totalAmount: number
    notes: string
  }>,
  financialYear: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(`Transactions ${financialYear}`)

  sheet.mergeCells('A1:I1')
  const titleCell = sheet.getCell('A1')
  titleCell.value = `Credit Transactions - Financial Year ${financialYear}`
  titleCell.font = { bold: true, size: 14, color: { argb: BRAND_COLOR } }
  titleCell.alignment = { horizontal: 'center' }
  sheet.addRow([])

  const headers = ['Date', 'FY', 'From (PWP)', 'From ID', 'To (PIBO)', 'To ID', 'Quantity', 'Rate (₹)', 'Total (₹)', 'Notes']
  const headerRow = sheet.addRow(headers)
  headerRow.eachCell((cell) => applyHeaderStyle(cell))

  sheet.columns = [
    { width: 14 }, { width: 10 }, { width: 25 }, { width: 14 },
    { width: 25 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 16 }, { width: 25 }
  ]

  data.forEach((row, idx) => {
    const dataRow = sheet.addRow([
      row.date, row.financialYear,
      row.fromClientName || 'External',
      row.fromClientId || '-',
      row.toClientName || 'External',
      row.toClientId || '-',
      row.quantity, row.rate, row.totalAmount, row.notes || '',
    ])
    dataRow.eachCell((cell, colNumber) => {
      applyDataStyle(cell, idx)
      if (colNumber === 8 || colNumber === 9) {
        cell.numFmt = '₹#,##0'
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
      }
      if (colNumber === 7) {
        cell.numFmt = '#,##0'
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
      }
    })
  })

  return workbook.xlsx.writeBuffer() as Promise<Buffer>
}

export async function exportOutstandingPaymentsToExcel(
  data: Array<{
    clientId: string
    companyName: string
    category: string
    financialYear: string
    totalBilled: number
    totalPaid: number
    pendingAmount: number
    paymentStatus: string
    paymentPercentage: number
  }>,
  financialYear: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(`Outstanding ${financialYear}`)

  sheet.mergeCells('A1:I1')
  const titleCell = sheet.getCell('A1')
  titleCell.value = `Outstanding Payments - Financial Year ${financialYear}`
  titleCell.font = { bold: true, size: 14, color: { argb: BRAND_COLOR } }
  titleCell.alignment = { horizontal: 'center' }
  sheet.addRow([])

  const headers = ['Client ID', 'Company Name', 'Category', 'FY', 'Total Billed', 'Total Paid', 'Pending', 'Status', 'Paid %']
  const headerRow = sheet.addRow(headers)
  headerRow.eachCell((cell) => applyHeaderStyle(cell))

  sheet.columns = [
    { width: 14 }, { width: 28 }, { width: 14 }, { width: 10 },
    { width: 16 }, { width: 16 }, { width: 16 }, { width: 12 }, { width: 10 }
  ]

  data.forEach((row, idx) => {
    const dataRow = sheet.addRow([
      row.clientId, row.companyName, row.category, row.financialYear,
      row.totalBilled, row.totalPaid, row.pendingAmount,
      row.paymentStatus, row.paymentPercentage,
    ])
    dataRow.eachCell((cell, colNumber) => {
      applyDataStyle(cell, idx)
      if (colNumber >= 5 && colNumber <= 7) {
        cell.numFmt = '₹#,##0'
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
      }
      if (colNumber === 9) {
        cell.numFmt = '0.0"%"'
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      }
    })
    // Status coloring
    const statusCell = dataRow.getCell(8)
    const statusColors: Record<string, string> = {
      Paid: '16A34A', Partial: 'CA8A04', Unpaid: 'DC2626'
    }
    if (row.paymentStatus in statusColors) {
      statusCell.font = { bold: true, color: { argb: statusColors[row.paymentStatus] } }
    }
  })

  return workbook.xlsx.writeBuffer() as Promise<Buffer>
}

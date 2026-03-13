import { type ClassValue, clsx } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-IN').format(num)
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function generateClientId(category: string): string {
  const prefix = {
    PWP: 'PWP',
    Producer: 'PRD',
    Importer: 'IMP',
    'Brand Owner': 'BRD',
  }[category] || 'CLT'

  const timestamp = Date.now().toString().slice(-6)
  const random = Math.floor(Math.random() * 100).toString().padStart(2, '0')
  return `${prefix}-${timestamp}-${random}`
}

export function getCurrentFinancialYear(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth() + 1
  if (month >= 4) {
    return `${year}-${(year + 1).toString().slice(2)}`
  }
  return `${year - 1}-${year.toString().slice(2)}`
}

export function getFinancialYearOptions(count = 5): string[] {
  const currentFY = getCurrentFinancialYear()
  const [startYear] = currentFY.split('-').map(Number)
  const years: string[] = []
  for (let i = 0; i < count; i++) {
    const y = startYear - i
    years.push(`${y}-${(y + 1).toString().slice(2)}`)
  }
  return years
}

export function calculatePaymentStatus(totalAmount: number, totalPaid: number) {
  const pendingAmount = totalAmount - totalPaid
  const paymentPercentage = totalAmount > 0 ? (totalPaid / totalAmount) * 100 : 0
  let paymentStatus: 'Paid' | 'Partial' | 'Unpaid'
  if (pendingAmount <= 0) {
    paymentStatus = 'Paid'
  } else if (totalPaid > 0) {
    paymentStatus = 'Partial'
  } else {
    paymentStatus = 'Unpaid'
  }
  return { pendingAmount, paymentPercentage, paymentStatus }
}

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli',
  'Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep',
  'Puducherry'
]

export const PAYMENT_MODES = [
  'Bank Transfer / NEFT',
  'RTGS',
  'IMPS',
  'UPI',
  'Cheque',
  'Cash',
  'Demand Draft',
]

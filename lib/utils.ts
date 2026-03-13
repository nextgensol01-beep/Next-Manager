import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}


function generateFinancialYears(): string[] {
  const years: string[] = [];
  const today = new Date();
  const currentFYStart = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  for (let y = 2021; y <= currentFYStart + 1; y++) {
    const end = String(y + 1).slice(2);
    years.push(`${y}-${end}`);
  }
  return years;
}

function getCurrentFY(): string {
  const today = new Date();
  const fyStart = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return `${fyStart}-${String(fyStart + 1).slice(2)}`;
}

export const FINANCIAL_YEARS = generateFinancialYears();
export const CURRENT_FY = getCurrentFY();

export const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu & Kashmir", "Ladakh", "Chandigarh", "Puducherry",
];

export const PAYMENT_MODES = [
  "NEFT", "RTGS", "IMPS", "UPI", "Cheque", "Cash", "Demand Draft", "Other",
];

export const CATEGORIES = ["PWP", "Producer", "Importer", "Brand Owner", "SIMP"] as const;

export function getPaymentStatus(totalPaid: number, totalAmount: number) {
  const pending = totalAmount - totalPaid;
  if (pending <= 0) return "Paid";
  if (totalPaid > 0) return "Partial";
  return "Unpaid";
}

export function getPaymentPercentage(totalPaid: number, totalAmount: number): number {
  if (!totalAmount) return 0;
  return Math.min(100, (totalPaid / totalAmount) * 100);
}

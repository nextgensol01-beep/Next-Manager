"use client";

import { FileText, Upload } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { CATS, type InvoiceTrackingRecord, type UploadRecord } from "./ClientProfileSupport";

type ClientProfileCpcbRecordsProps = {
  selectedFy: string;
  invoices: InvoiceTrackingRecord[];
  uploadRecords: UploadRecord[];
  onAddInvoice: () => void;
  onAddUpload: () => void;
};

const normalizeOptionValue = (value?: string) => String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");

const invoiceTypeLabel = (value?: string) => {
  const normalized = normalizeOptionValue(value);
  if (normalized === "sale" || normalized === "saleinvoice") return "Sale Invoice";
  if (normalized === "purchase" || normalized === "purchaseinvoice") return "Purchase Invoice";
  return "";
};

const receivedViaLabel = (value?: string) => {
  const normalized = normalizeOptionValue(value);
  if (normalized === "hardcopy" || normalized === "hardcopies") return "Hardcopy";
  if (normalized === "mail" || normalized === "email") return "Mail";
  if (normalized === "whatsapp") return "WhatsApp";
  return "";
};

const invoiceDuration = (fromDate: string, toDate: string) => {
  const start = new Date(fromDate);
  const end = new Date(toDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "";
  }

  const months =
    ((end.getUTCFullYear() - start.getUTCFullYear()) * 12) +
    (end.getUTCMonth() - start.getUTCMonth()) +
    1;
  const safeMonths = Math.max(months, 1);
  const endOfEndMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  const isFullMonthCoverage = start.getUTCDate() === 1 && end.getUTCDate() === endOfEndMonth;
  const prefix = isFullMonthCoverage ? "" : "~";

  return `${prefix}${safeMonths} month${safeMonths === 1 ? "" : "s"}`;
};

const uploadTotal = (record: UploadRecord) =>
  (Number(record.cat1) || 0) +
  (Number(record.cat2) || 0) +
  (Number(record.cat3) || 0) +
  (Number(record.cat4) || 0);

export default function ClientProfileCpcbRecords({
  selectedFy,
  invoices,
  uploadRecords,
  onAddInvoice,
  onAddUpload,
}: ClientProfileCpcbRecordsProps) {
  if (invoices.length === 0 && uploadRecords.length === 0) return null;

  const sortedInvoices = [...invoices].sort((a, b) => new Date(a.fromDate).getTime() - new Date(b.fromDate).getTime());
  const sortedUploads = [...uploadRecords].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const firstInvoice = sortedInvoices[0];
  const lastInvoice = sortedInvoices[sortedInvoices.length - 1];
  const saleInvoiceCount = invoices.filter((invoice) => invoiceTypeLabel(invoice.invoiceType) === "Sale Invoice").length;
  const purchaseInvoiceCount = invoices.filter((invoice) => invoiceTypeLabel(invoice.invoiceType) === "Purchase Invoice").length;
  const unknownInvoiceTypeCount = invoices.length - saleInvoiceCount - purchaseInvoiceCount;
  const categoryTotals = [
    uploadRecords.reduce((sum, record) => sum + (Number(record.cat1) || 0), 0),
    uploadRecords.reduce((sum, record) => sum + (Number(record.cat2) || 0), 0),
    uploadRecords.reduce((sum, record) => sum + (Number(record.cat3) || 0), 0),
    uploadRecords.reduce((sum, record) => sum + (Number(record.cat4) || 0), 0),
  ];
  const totalUploaded = categoryTotals.reduce((sum, value) => sum + value, 0);

  return (
    <div className="bg-card rounded-2xl p-5 shadow-sm border border-base">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-semibold text-default">CPCB Portal Records - FY {selectedFy}</h3>
          <p className="text-xs text-faint mt-1">Invoice tracking and portal upload details linked to this client.</p>
        </div>
        <div className="glass-tray">
          <button type="button" className="glass-pill" onClick={onAddInvoice}>
            <FileText className="w-3.5 h-3.5" /> Add Invoice
          </button>
          <button type="button" className="glass-pill" onClick={onAddUpload}>
            <Upload className="w-3.5 h-3.5" /> Add Upload
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {invoices.length > 0 && (
          <div className="rounded-xl border border-base bg-surface/70 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-600" />
                <p className="text-sm font-semibold text-default">Invoice Tracking</p>
              </div>
              <span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 px-2 py-0.5 rounded-full font-medium">
                {invoices.length} period{invoices.length === 1 ? "" : "s"}
              </span>
            </div>
            {firstInvoice && lastInvoice && (
              <div className="rounded-lg bg-card border border-base px-3 py-2 mb-3">
                <p className="text-xs text-faint">Available invoice range</p>
                <p className="text-sm font-semibold text-default mt-0.5">
                  {formatDate(firstInvoice.fromDate)} to {formatDate(lastInvoice.toDate)}
                </p>
              </div>
            )}
            <div className="flex flex-wrap gap-2 mb-3">
              {saleInvoiceCount > 0 && (
                <span className="text-[11px] font-medium rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-0.5">
                  Sale Invoice: {saleInvoiceCount}
                </span>
              )}
              {purchaseInvoiceCount > 0 && (
                <span className="text-[11px] font-medium rounded-full bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 px-2 py-0.5">
                  Purchase Invoice: {purchaseInvoiceCount}
                </span>
              )}
              {unknownInvoiceTypeCount > 0 && (
                <span className="text-[11px] font-medium rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5">
                  Type not set: {unknownInvoiceTypeCount}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {sortedInvoices.map((invoice) => {
                const typeLabel = invoiceTypeLabel(invoice.invoiceType);
                const sourceLabel = receivedViaLabel(invoice.receivedVia);
                return (
                  <div key={invoice._id} className="flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-mono text-default truncate">
                        {formatDate(invoice.fromDate)} to {formatDate(invoice.toDate)}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        <span className="rounded-full bg-card border border-base px-2 py-0.5 text-[11px] text-muted">
                          Type: {typeLabel || "Not set"}
                        </span>
                        <span className="rounded-full bg-card border border-base px-2 py-0.5 text-[11px] text-muted">
                          Received: {sourceLabel || "Not set"}
                        </span>
                      </div>
                      <p className="text-faint mt-0.5">Added {formatDate(invoice.createdAt)}</p>
                    </div>
                    <span className="text-muted whitespace-nowrap">{invoiceDuration(invoice.fromDate, invoice.toDate)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {uploadRecords.length > 0 && (
          <div className="rounded-xl border border-base bg-surface/70 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-teal-600" />
                <p className="text-sm font-semibold text-default">Uploaded Records</p>
              </div>
              <span className="text-xs bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                {totalUploaded.toLocaleString("en-IN")} total
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {CATS.map((category, index) => (
                <div key={category} className="rounded-lg bg-card border border-base px-3 py-2">
                  <p className="text-[11px] text-faint">{category}</p>
                  <p className="font-mono font-semibold text-default mt-0.5">{categoryTotals[index].toLocaleString("en-IN")}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {sortedUploads.map((record) => (
                <div key={record._id} className="flex items-center justify-between gap-3 text-xs">
                  <p className="text-faint">Added {formatDate(record.createdAt)}</p>
                  <p className="font-mono font-semibold text-default">{uploadTotal(record).toLocaleString("en-IN")}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

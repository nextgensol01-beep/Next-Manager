"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Eye, FileText, Upload } from "lucide-react";
import { buildInvoiceCoverageSummary, type InvoiceTypeCoverage } from "@/lib/invoiceCoverage";
import { formatDate } from "@/lib/utils";
import { CATS, type InvoiceTrackingRecord, type UploadRecord } from "./ClientProfileSupport";

type ClientProfileCpcbRecordsProps = {
  selectedFy: string;
  invoices: InvoiceTrackingRecord[];
  uploadRecords: UploadRecord[];
  onAddInvoice: () => void;
  onAddUpload: () => void;
};

type UploadType = "sale" | "purchase";

type UploadTotals = {
  cat1: number;
  cat2: number;
  cat3: number;
  cat4: number;
  total: number;
  invoiceCount: number;
};

const EXPAND_TRANSITION = { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.8 };
const FADE_TRANSITION = { duration: 0.18, ease: "easeOut" as const };

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

const uploadTypeLabel = (value?: string) => (value === "purchase" ? "Purchase" : "Sale");
const numberText = (value: number) => value.toLocaleString("en-IN");

const emptyUploadTotals = (): UploadTotals => ({
  cat1: 0,
  cat2: 0,
  cat3: 0,
  cat4: 0,
  total: 0,
  invoiceCount: 0,
});

const uploadTotal = (record: UploadRecord) =>
  (Number(record.cat1) || 0) +
  (Number(record.cat2) || 0) +
  (Number(record.cat3) || 0) +
  (Number(record.cat4) || 0);

const addUploadRecord = (totals: UploadTotals, record: UploadRecord) => {
  totals.cat1 += Number(record.cat1) || 0;
  totals.cat2 += Number(record.cat2) || 0;
  totals.cat3 += Number(record.cat3) || 0;
  totals.cat4 += Number(record.cat4) || 0;
  totals.total += uploadTotal(record);
  totals.invoiceCount += Number(record.invoiceCount) || 0;
};

const categoryRows = (totals: UploadTotals) => [
  [CATS[0], totals.cat1],
  [CATS[1], totals.cat2],
  [CATS[2], totals.cat3],
  [CATS[3], totals.cat4],
] as const;

const CoverageTypeCard = ({ label, coverage }: { label: string; coverage: InvoiceTypeCoverage }) => {
  const percent = Math.round((coverage.doneCount / 12) * 100);

  return (
    <div className="rounded-lg bg-card border border-base p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-default">{label}</p>
        <span className="font-mono text-xs font-semibold text-brand-700 dark:text-brand-300">
          {coverage.doneCount}/12
        </span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-surface overflow-hidden">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-3 space-y-1.5">
        <p className="text-[11px] text-muted">
          Done: <span className="font-medium text-default">{coverage.doneText}</span>
        </p>
        <p className="text-[11px] text-muted">
          Left: <span className="font-medium text-default">{coverage.leftText}</span>
        </p>
      </div>
    </div>
  );
};

const UploadTypeCard = ({ label, totals }: { label: string; totals: UploadTotals }) => (
  <div className="rounded-lg bg-card border border-base p-3">
    <div className="flex items-center justify-between gap-2 mb-2">
      <p className="text-sm font-semibold text-default">{label}</p>
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        {numberText(totals.total)} total
      </span>
    </div>
    <div className="grid grid-cols-2 gap-2">
      {categoryRows(totals).map(([category, value]) => (
        <div key={category} className="rounded-md border border-soft bg-surface px-2 py-1.5">
          <p className="text-[10px] text-faint whitespace-nowrap">{category}</p>
          <p className="font-mono text-xs font-semibold text-default">{numberText(value)}</p>
        </div>
      ))}
    </div>
    <p className="text-xs text-muted mt-2">
      Invoices uploaded: <span className="font-semibold text-default">{numberText(totals.invoiceCount)}</span>
    </p>
  </div>
);

const ExpandButton = ({
  expanded,
  count,
  onClick,
}: {
  expanded: boolean;
  count: number;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-1.5 rounded-lg border border-base bg-card px-2.5 py-1.5 text-xs font-medium text-muted hover:text-default hover:bg-hover transition-colors"
  >
    <Eye className="w-3.5 h-3.5" />
    {expanded ? "Hide Entries" : "View Entries"}
    <span className="font-mono text-[11px] text-faint">({count})</span>
    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
  </button>
);

const Expandable = ({
  open,
  reducedMotion,
  children,
}: {
  open: boolean;
  reducedMotion: boolean;
  children: React.ReactNode;
}) => (
  <AnimatePresence initial={false}>
    {open && (
      <motion.div
        initial={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0, y: -6 }}
        animate={reducedMotion ? { opacity: 1 } : { height: "auto", opacity: 1, y: 0 }}
        exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0, y: -4 }}
        transition={reducedMotion ? FADE_TRANSITION : EXPAND_TRANSITION}
        className="overflow-hidden"
      >
        <div className="pt-3 mt-3 border-t border-soft">{children}</div>
      </motion.div>
    )}
  </AnimatePresence>
);

export default function ClientProfileCpcbRecords({
  selectedFy,
  invoices,
  uploadRecords,
  onAddInvoice,
  onAddUpload,
}: ClientProfileCpcbRecordsProps) {
  const prefersReducedMotion = useReducedMotion();
  const reducedMotion = Boolean(prefersReducedMotion);
  const [invoiceEntriesOpen, setInvoiceEntriesOpen] = useState(false);
  const [uploadEntriesOpen, setUploadEntriesOpen] = useState(false);

  const coverage = useMemo(() => buildInvoiceCoverageSummary(invoices, selectedFy), [invoices, selectedFy]);

  const sortedInvoices = useMemo(
    () => [...invoices].sort((a, b) => new Date(a.fromDate).getTime() - new Date(b.fromDate).getTime()),
    [invoices],
  );
  const sortedUploads = useMemo(
    () => [...uploadRecords].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [uploadRecords],
  );

  const uploadSummary = useMemo(() => {
    const summary: Record<UploadType, UploadTotals> = {
      sale: emptyUploadTotals(),
      purchase: emptyUploadTotals(),
    };

    uploadRecords.forEach((record) => {
      const type: UploadType = record.uploadType === "purchase" ? "purchase" : "sale";
      addUploadRecord(summary[type], record);
    });

    return {
      ...summary,
      grandTotal: summary.sale.total + summary.purchase.total,
      grandInvoiceCount: summary.sale.invoiceCount + summary.purchase.invoiceCount,
    };
  }, [uploadRecords]);

  if (invoices.length === 0 && uploadRecords.length === 0) return null;

  return (
    <div className="bg-card rounded-2xl p-5 shadow-sm border border-base">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="font-semibold text-default">CPCB Portal Records - FY {selectedFy}</h3>
          <p className="text-xs text-faint mt-1">Invoice coverage and portal upload details linked to this client.</p>
        </div>
        <div className="glass-tray self-start">
          <button type="button" className="glass-pill" onClick={onAddInvoice}>
            <FileText className="w-3.5 h-3.5" /> Add Invoice
          </button>
          <button type="button" className="glass-pill" onClick={onAddUpload}>
            <Upload className="w-3.5 h-3.5" /> Add Upload
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-xl border border-base bg-surface/70 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-600" />
              <p className="text-sm font-semibold text-default">Invoice Coverage</p>
            </div>
            {invoices.length > 0 && (
              <span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 px-2 py-0.5 rounded-full font-medium">
                {invoices.length} entr{invoices.length === 1 ? "y" : "ies"}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CoverageTypeCard label="Sale" coverage={coverage.sale} />
            <CoverageTypeCard label="Purchase" coverage={coverage.purchase} />
          </div>

          {invoices.length > 0 && (
            <>
              <div className="mt-3">
                <ExpandButton
                  expanded={invoiceEntriesOpen}
                  count={invoices.length}
                  onClick={() => setInvoiceEntriesOpen((open) => !open)}
                />
              </div>
              <Expandable open={invoiceEntriesOpen} reducedMotion={reducedMotion}>
                <div className="space-y-2">
                  {sortedInvoices.map((invoice) => {
                    const typeLabel = invoiceTypeLabel(invoice.invoiceType);
                    const sourceLabel = receivedViaLabel(invoice.receivedVia);
                    return (
                      <div key={invoice._id} className="rounded-lg bg-card border border-base p-3 text-xs">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-mono text-default truncate">
                              {formatDate(invoice.fromDate)} to {formatDate(invoice.toDate)}
                            </p>
                            <p className="text-faint mt-1">Added {formatDate(invoice.createdAt)}</p>
                          </div>
                          <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-muted whitespace-nowrap">
                            {typeLabel || "Not set"}
                          </span>
                        </div>
                        <p className="text-muted mt-2">Received: {sourceLabel || "Not set"}</p>
                      </div>
                    );
                  })}
                </div>
              </Expandable>
            </>
          )}
        </div>

        <div className="rounded-xl border border-base bg-surface/70 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-teal-600" />
              <p className="text-sm font-semibold text-default">Uploaded Records</p>
            </div>
            {uploadRecords.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                  {numberText(uploadSummary.grandTotal)} total
                </span>
                <span className="text-xs bg-surface text-muted px-2 py-0.5 rounded-full font-medium">
                  {numberText(uploadSummary.grandInvoiceCount)} invoices
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <UploadTypeCard label="Sale" totals={uploadSummary.sale} />
            <UploadTypeCard label="Purchase" totals={uploadSummary.purchase} />
          </div>

          {uploadRecords.length > 0 && (
            <>
              <div className="mt-3">
                <ExpandButton
                  expanded={uploadEntriesOpen}
                  count={uploadRecords.length}
                  onClick={() => setUploadEntriesOpen((open) => !open)}
                />
              </div>
              <Expandable open={uploadEntriesOpen} reducedMotion={reducedMotion}>
                <div className="space-y-2">
                  {sortedUploads.map((record) => (
                    <div key={record._id} className="rounded-lg bg-card border border-base p-3 text-xs">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-default">{uploadTypeLabel(record.uploadType)}</p>
                          <p className="text-faint mt-0.5">Added {formatDate(record.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-semibold text-default">{numberText(uploadTotal(record))}</p>
                          <p className="text-faint">{numberText(Number(record.invoiceCount) || 0)} invoices</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                        {categoryRows({
                          cat1: Number(record.cat1) || 0,
                          cat2: Number(record.cat2) || 0,
                          cat3: Number(record.cat3) || 0,
                          cat4: Number(record.cat4) || 0,
                          total: uploadTotal(record),
                          invoiceCount: Number(record.invoiceCount) || 0,
                        }).map(([category, value]) => (
                          <div key={category} className="rounded-md bg-surface px-2 py-1.5 text-center">
                            <p className="text-[10px] text-faint whitespace-nowrap">{category}</p>
                            <p className="font-mono text-xs font-semibold text-default">{numberText(value)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Expandable>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Bell,
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  FileText,
  FolderOpen,
  History,
  IndianRupee,
  LayoutDashboard,
  ListChecks,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  ShieldCheck,
  Target,
  Upload,
  Wallet,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  buildInvoiceCoverageSummary,
  getCoveredInvoiceMonths,
  getFinancialYearMonths,
} from "@/lib/invoiceCoverage";
import type { ClientCustomFieldDefinition } from "@/lib/clientCustomFields";
import type {
  Billing,
  Client,
  FYRecord,
  InvoiceTrackingRecord,
  UploadRecord,
} from "./ClientProfileSupport";

export type ClientProfileTabId = "overview" | "compliance" | "financial" | "documents" | "timeline" | "notes";
export type ComplianceSectionId =
  | "annualReturn"
  | "invoiceTracking"
  | "cpcbUpload"
  | "targetsCredits"
  | "registration"
  | "status";
export type FinancialSectionId = "quotations" | "bills" | "payments" | "outstanding" | "paymentHistory";
export type DocumentsSectionId = "all" | "compliance" | "financial" | "invoices" | "certificates" | "other";
export type TimelineSectionId = "all" | "compliance" | "financial" | "documents" | "notes";
export type NotesTasksSectionId = "notes" | "tasks" | "reminders" | "followUps" | "callsMeetings";
export type InvoiceMonthStatus = "Pending" | "Received" | "Partial / Issue" | "Nil / No Invoice";
export type InvoiceReceivedVia = "hardcopy" | "mail" | "whatsapp" | "excel" | "other";

export type ClientProfileSecondaryNavItem<T extends string> = {
  id: T;
  label: string;
  short: string;
  icon: React.ReactNode;
};

export type AnnualReturnProgressStep = {
  id: string;
  label: string;
  detail: string;
  progress: number;
};

export type AnnualReturnRecord = {
  _id: string;
  clientId: string;
  financialYear: string;
  status: "Pending" | "Not Started" | "In Progress" | "Filed" | "Verified" | "Not Required This FY";
  filingDate?: string | null;
  acknowledgeNumber?: string;
  remarks?: string;
  updatedAt?: string;
  createdAt?: string;
};

export type RegistrationSignal = {
  key: string;
  label: string;
  value: string;
  date: Date;
} | null;

export type ClientProfileAlert = {
  id: string;
  title: string;
  detail?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
};

export type QuotationSummary = {
  _id: string;
  quotationNumber?: string;
  clientId?: string;
  clientName: string;
  financialYear: string;
  status: string;
  grandTotal?: number;
  updatedAt?: string;
};

const PRIMARY_TABS: Array<{ id: ClientProfileTabId; label: string; icon: React.ReactNode }> = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "compliance", label: "Compliance", icon: <ClipboardCheck className="h-4 w-4" /> },
  { id: "financial", label: "Financial", icon: <Wallet className="h-4 w-4" /> },
  { id: "documents", label: "Documents", icon: <FolderOpen className="h-4 w-4" /> },
  { id: "timeline", label: "Timeline", icon: <History className="h-4 w-4" /> },
  { id: "notes", label: "Notes & Tasks", icon: <ListChecks className="h-4 w-4" /> },
];

const COMPLIANCE_NAV: Array<ClientProfileSecondaryNavItem<ComplianceSectionId>> = [
  { id: "annualReturn", label: "Annual Return Tracker", short: "Annual Return", icon: <CalendarCheck className="h-4 w-4" /> },
  { id: "invoiceTracking", label: "Invoice Tracking", short: "Invoice Tracking", icon: <FileText className="h-4 w-4" /> },
  { id: "cpcbUpload", label: "CPCB Upload Data", short: "CPCB Upload", icon: <Upload className="h-4 w-4" /> },
  { id: "targetsCredits", label: "FY Targets / Credits", short: "Targets", icon: <Target className="h-4 w-4" /> },
  { id: "registration", label: "Registration Details", short: "Registration", icon: <ShieldCheck className="h-4 w-4" /> },
  { id: "status", label: "Compliance Status", short: "Status", icon: <ClipboardCheck className="h-4 w-4" /> },
];

export const FINANCIAL_NAV: Array<ClientProfileSecondaryNavItem<FinancialSectionId>> = [
  { id: "quotations", label: "Quotations", short: "Quotations", icon: <Receipt className="h-4 w-4" /> },
  { id: "bills", label: "Bills", short: "Bills", icon: <IndianRupee className="h-4 w-4" /> },
  { id: "payments", label: "Payments", short: "Payments", icon: <Wallet className="h-4 w-4" /> },
  { id: "outstanding", label: "Outstanding", short: "Outstanding", icon: <AlertCircle className="h-4 w-4" /> },
  { id: "paymentHistory", label: "Payment History", short: "History", icon: <History className="h-4 w-4" /> },
];

export const DOCUMENTS_NAV: Array<ClientProfileSecondaryNavItem<DocumentsSectionId>> = [
  { id: "all", label: "All Documents", short: "All", icon: <FolderOpen className="h-4 w-4" /> },
  { id: "compliance", label: "Compliance Documents", short: "Compliance", icon: <ShieldCheck className="h-4 w-4" /> },
  { id: "financial", label: "Financial Documents", short: "Financial", icon: <Wallet className="h-4 w-4" /> },
  { id: "invoices", label: "Invoices", short: "Invoices", icon: <FileText className="h-4 w-4" /> },
  { id: "certificates", label: "Certificates", short: "Certificates", icon: <ClipboardCheck className="h-4 w-4" /> },
  { id: "other", label: "Other Documents", short: "Other", icon: <ListChecks className="h-4 w-4" /> },
];

export const TIMELINE_NAV: Array<ClientProfileSecondaryNavItem<TimelineSectionId>> = [
  { id: "all", label: "All Activity", short: "All", icon: <History className="h-4 w-4" /> },
  { id: "compliance", label: "Compliance", short: "Compliance", icon: <ClipboardCheck className="h-4 w-4" /> },
  { id: "financial", label: "Financial", short: "Financial", icon: <Wallet className="h-4 w-4" /> },
  { id: "documents", label: "Documents", short: "Documents", icon: <FolderOpen className="h-4 w-4" /> },
  { id: "notes", label: "Notes", short: "Notes", icon: <ListChecks className="h-4 w-4" /> },
];

export const NOTES_TASKS_NAV: Array<ClientProfileSecondaryNavItem<NotesTasksSectionId>> = [
  { id: "notes", label: "Notes", short: "Notes", icon: <ListChecks className="h-4 w-4" /> },
  { id: "tasks", label: "Tasks", short: "Tasks", icon: <ClipboardCheck className="h-4 w-4" /> },
  { id: "reminders", label: "Reminders", short: "Reminders", icon: <Bell className="h-4 w-4" /> },
  { id: "followUps", label: "Follow-ups", short: "Follow-ups", icon: <CalendarCheck className="h-4 w-4" /> },
  { id: "callsMeetings", label: "Calls / Meetings", short: "Calls", icon: <FileText className="h-4 w-4" /> },
];

export const INVOICE_STATUS_OPTIONS: Array<{ id: InvoiceMonthStatus; label: string }> = [
  { id: "Received", label: "Received" },
  { id: "Pending", label: "Pending" },
  { id: "Partial / Issue", label: "Partial / Issue" },
  { id: "Nil / No Invoice", label: "Nil / No Invoice" },
];

export const INVOICE_RECEIVED_VIA_OPTIONS: Array<{ id: InvoiceReceivedVia; label: string }> = [
  { id: "mail", label: "Mail" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "hardcopy", label: "Hardcopy" },
  { id: "excel", label: "Excel" },
  { id: "other", label: "Other" },
];

const statusToneClass = (tone: ClientProfileAlert["tone"] = "neutral") => {
  if (tone === "success") return "client-profile-alert-success";
  if (tone === "warning") return "client-profile-alert-warning";
  if (tone === "danger") return "client-profile-alert-danger";
  return "client-profile-alert-neutral";
};

const annualReturnLabel = (status?: AnnualReturnRecord["status"]) => {
  if (!status || status === "Pending") return "Not Started";
  return status;
};

const dateInput = (date: Date) => date.toISOString().slice(0, 10);
const numberText = (value: number, suffix = "") => `${value.toLocaleString("en-IN")}${suffix}`;

const uploadTotal = (record: UploadRecord) =>
  (Number(record.cat1) || 0) +
  (Number(record.cat2) || 0) +
  (Number(record.cat3) || 0) +
  (Number(record.cat4) || 0);

const latestTimestamp = (record: Pick<InvoiceTrackingRecord, "createdAt"> & { updatedAt?: string }) => {
  const date = new Date(record.updatedAt || record.createdAt || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

function normalizedInvoiceStatus(status?: string): InvoiceMonthStatus {
  if (status === "Pending" || status === "Partial / Issue" || status === "Nil / No Invoice") return status;
  return "Received";
}

export function getInvoiceMonthStates(
  invoices: InvoiceTrackingRecord[],
  financialYear: string,
  invoiceType: "sale" | "purchase",
) {
  const monthMap = new Map(getFinancialYearMonths(financialYear).map((month) => [
    month.key,
    {
      ...month,
      status: "Pending" as InvoiceMonthStatus,
      receivedVia: undefined as string | undefined,
      remarks: "",
      timestamp: 0,
    },
  ]));

  invoices
    .filter((invoice) => invoice.invoiceType === invoiceType)
    .forEach((invoice) => {
      const timestamp = latestTimestamp(invoice);
      getCoveredInvoiceMonths(invoice.fromDate, invoice.toDate, financialYear).forEach((key) => {
        const current = monthMap.get(key);
        if (!current || timestamp < current.timestamp) return;
        monthMap.set(key, {
          ...current,
          status: normalizedInvoiceStatus(invoice.status),
          receivedVia: invoice.receivedVia,
          remarks: invoice.remarks || "",
          timestamp,
        });
      });
    });

  return Array.from(monthMap.values());
}

export function ClientPrimaryTabs({
  activeTab,
  onChange,
}: {
  activeTab: ClientProfileTabId;
  onChange: (tab: ClientProfileTabId) => void;
}) {
  return (
    <nav className="client-profile-primary-tabs" aria-label="Client workspace tabs">
      {PRIMARY_TABS.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className="client-profile-primary-tab"
            data-active={active ? "true" : "false"}
            onClick={() => onChange(tab.id)}
          >
            {active && (
              <motion.span
                layoutId="client-profile-primary-tab-indicator"
                className="client-profile-primary-tab-indicator"
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
            <span className="relative z-[1] flex items-center gap-2">
              {tab.icon}
              <span>{tab.label}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export function ClientAlerts({ alerts }: { alerts: ClientProfileAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <section className="client-profile-alert-grid" aria-label="Important client alerts">
      <AnimatePresence initial={false}>
        {alerts.map((alert) => (
          <motion.div
            key={alert.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={`client-profile-alert ${statusToneClass(alert.tone)}`}
          >
            <span className="client-profile-alert-icon">{alert.icon || <AlertCircle className="h-4 w-4" />}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-default">{alert.title}</span>
              {alert.detail && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{alert.detail}</span>}
            </span>
            {alert.actionLabel && alert.onAction && (
              <button type="button" onClick={alert.onAction}>
                {alert.actionLabel}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </section>
  );
}

export function ClientProfileSecondaryWorkspace<T extends string>({
  activeSection,
  collapsed,
  navItems,
  onCollapsedChange,
  onSectionChange,
  sections,
  title,
}: {
  activeSection: T;
  collapsed: boolean;
  navItems: Array<ClientProfileSecondaryNavItem<T>>;
  onCollapsedChange: (collapsed: boolean) => void;
  onSectionChange: (section: T) => void;
  sections: Record<T, React.ReactNode>;
  title: string;
}) {
  return (
    <section className="client-profile-compliance-workspace">
      <div className="client-profile-secondary-mobile" aria-label={`${title} sections`}>
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            data-active={activeSection === item.id ? "true" : "false"}
            aria-current={activeSection === item.id ? "page" : undefined}
            onClick={() => onSectionChange(item.id)}
          >
            {item.short}
          </button>
        ))}
      </div>

      <motion.aside
        className="client-profile-secondary-nav"
        data-collapsed={collapsed ? "true" : "false"}
        animate={{ width: collapsed ? 68 : 238 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="client-profile-secondary-nav-header">
          {!collapsed && <span>{title}</span>}
          <button
            type="button"
            onClick={() => onCollapsedChange(!collapsed)}
            aria-label={collapsed ? `Expand ${title} navigation` : `Collapse ${title} navigation`}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className="client-profile-secondary-item"
            data-active={activeSection === item.id ? "true" : "false"}
            aria-current={activeSection === item.id ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            onClick={() => onSectionChange(item.id)}
          >
            <span className="client-profile-secondary-icon">{item.icon}</span>
            {!collapsed && <span className="truncate">{item.label}</span>}
          </button>
        ))}
      </motion.aside>

      <div className="client-profile-secondary-panel">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {sections[activeSection]}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

export function ComplianceWorkspace({
  activeSection,
  collapsed,
  onCollapsedChange,
  onSectionChange,
  sections,
}: {
  activeSection: ComplianceSectionId;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onSectionChange: (section: ComplianceSectionId) => void;
  sections: Record<ComplianceSectionId, React.ReactNode>;
}) {
  return (
    <ClientProfileSecondaryWorkspace
      activeSection={activeSection}
      collapsed={collapsed}
      navItems={COMPLIANCE_NAV}
      onCollapsedChange={onCollapsedChange}
      onSectionChange={onSectionChange}
      sections={sections}
      title="Compliance"
    />
  );
}

export function AnnualReturnProgressPanel({
  progress,
  selectedFy,
  steps,
  subtitle,
  title = "Annual Return Progress",
}: {
  progress: number;
  selectedFy: string;
  steps: AnnualReturnProgressStep[];
  subtitle?: string;
  title?: string;
}) {
  const percentage = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const completeCount = steps.filter((step) => step.progress >= 1).length;

  return (
    <section className="client-profile-card client-profile-progress-card">
      <div className="client-profile-card-header">
        <div>
          <p className="client-profile-kicker">FY {selectedFy}</p>
          <h2>{title}</h2>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <div className="client-profile-progress-value">
          <strong>{percentage}%</strong>
          <span>{completeCount}/{steps.length} complete</span>
        </div>
      </div>

      <div
        className="client-profile-progress-track"
        role="progressbar"
        aria-label={`${title}: ${percentage}% complete`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
      >
        <motion.div
          className="client-profile-progress-fill"
          initial={false}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      <div className="client-profile-progress-steps">
        {steps.map((step) => {
          const done = step.progress >= 1;
          const partial = step.progress > 0 && step.progress < 1;

          return (
            <div key={step.id} data-done={done ? "true" : "false"} data-partial={partial ? "true" : "false"}>
              <span>{done ? <CheckCircle2 className="h-4 w-4" /> : partial ? <Bell className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}</span>
              <div>
                <p>{step.label}</p>
                <small>{step.detail}</small>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function InvoiceMonthSelector({
  financialYear,
  invoiceType,
  selectedMonths,
  onSelectedMonthsChange,
  existingInvoices,
}: {
  financialYear: string;
  invoiceType: "sale" | "purchase" | "";
  selectedMonths: string[];
  onSelectedMonthsChange: (months: string[]) => void;
  existingInvoices: InvoiceTrackingRecord[];
}) {
  const states = invoiceType ? getInvoiceMonthStates(existingInvoices, financialYear, invoiceType) : [];
  const selectedSet = new Set(selectedMonths);

  const toggleMonth = (key: string) => {
    const next = selectedSet.has(key)
      ? selectedMonths.filter((month) => month !== key)
      : [...selectedMonths, key];
    onSelectedMonthsChange(next);
  };

  if (!invoiceType) {
    return (
      <div className="client-profile-month-empty">
        <FileText className="h-5 w-5" />
        <p>Select Sale or Purchase invoice type to choose FY months.</p>
      </div>
    );
  }

  return (
    <div className="client-profile-month-selector">
      {states.map((month) => {
        const selected = selectedSet.has(month.key);
        return (
          <motion.button
            key={month.key}
            type="button"
            whileTap={{ scale: 0.98 }}
            data-status={month.status}
            data-selected={selected ? "true" : "false"}
            aria-pressed={selected}
            aria-label={`${month.label}: ${selected ? "selected" : month.status}`}
            onClick={() => toggleMonth(month.key)}
          >
            <span>{month.label}</span>
            <small>{selected ? "Selected" : month.status}</small>
          </motion.button>
        );
      })}
    </div>
  );
}

export function selectedMonthsToInvoiceRanges(financialYear: string, selectedMonths: string[]) {
  const selected = new Set(selectedMonths);
  return getFinancialYearMonths(financialYear)
    .filter((month) => selected.has(month.key))
    .map((month) => ({
      monthKey: month.key,
      label: month.label,
      fromDate: dateInput(month.start),
      toDate: dateInput(month.end),
    }));
}

export function InvoiceTrackingWorkspace({
  selectedFy,
  invoices,
  onAddInvoice,
}: {
  selectedFy: string;
  invoices: InvoiceTrackingRecord[];
  onAddInvoice: () => void;
}) {
  const saleMonths = useMemo(() => getInvoiceMonthStates(invoices, selectedFy, "sale"), [invoices, selectedFy]);
  const purchaseMonths = useMemo(() => getInvoiceMonthStates(invoices, selectedFy, "purchase"), [invoices, selectedFy]);

  const statusCounts = (months: ReturnType<typeof getInvoiceMonthStates>) => ({
    received: months.filter((month) => month.status === "Received").length,
    pending: months.filter((month) => month.status === "Pending").length,
    partial: months.filter((month) => month.status === "Partial / Issue").length,
    nil: months.filter((month) => month.status === "Nil / No Invoice").length,
  });
  const saleCounts = statusCounts(saleMonths);
  const purchaseCounts = statusCounts(purchaseMonths);
  const saleCovered = saleCounts.received + saleCounts.nil;
  const purchaseCovered = purchaseCounts.received + purchaseCounts.nil;

  const renderMonthGrid = (label: string, months: typeof saleMonths) => (
    <div className="client-profile-invoice-month-card">
      <div className="flex items-center justify-between gap-3">
        <h4>{label}</h4>
        <span>
          {months.filter((month) => month.status === "Received").length} received
          {" - "}
          {months.filter((month) => month.status === "Nil / No Invoice").length} nil
        </span>
      </div>
      <div className="client-profile-month-mini-grid">
        {months.map((month) => (
          <span key={`${label}-${month.key}`} data-status={month.status} title={`${month.label}: ${month.status}`}>
            {month.label}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <section className="client-profile-card">
      <div className="client-profile-card-header">
        <div>
          <p className="client-profile-kicker">Invoice Tracking</p>
          <h2>FY {selectedFy} month coverage</h2>
        </div>
        <button type="button" className="client-profile-primary-button" onClick={onAddInvoice}>
          <FileText className="h-4 w-4" />
          <span>Update Months</span>
        </button>
      </div>

      <div className="client-profile-invoice-summary-row">
        <div>
          <span>{saleCovered}/12</span>
          <p>Sale invoice coverage</p>
          <small>{saleCounts.received} received - {saleCounts.pending} pending - {saleCounts.nil} nil - {saleCounts.partial} issue</small>
        </div>
        <div>
          <span>{purchaseCovered}/12</span>
          <p>Purchase invoice coverage</p>
          <small>{purchaseCounts.received} received - {purchaseCounts.pending} pending - {purchaseCounts.nil} nil - {purchaseCounts.partial} issue</small>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {renderMonthGrid("Sale Invoices", saleMonths)}
        {renderMonthGrid("Purchase Invoices", purchaseMonths)}
      </div>
    </section>
  );
}

export function CpcbUploadSummary({
  selectedFy,
  uploadRecords,
  onAddUpload,
}: {
  selectedFy: string;
  uploadRecords: UploadRecord[];
  onAddUpload: () => void;
}) {
  const totals = useMemo(() => {
    return uploadRecords.reduce(
      (acc, record) => {
        acc.cat1 += Number(record.cat1) || 0;
        acc.cat2 += Number(record.cat2) || 0;
        acc.cat3 += Number(record.cat3) || 0;
        acc.cat4 += Number(record.cat4) || 0;
        acc.invoiceCount += Number(record.invoiceCount) || 0;
        acc.total += uploadTotal(record);
        return acc;
      },
      { cat1: 0, cat2: 0, cat3: 0, cat4: 0, total: 0, invoiceCount: 0 },
    );
  }, [uploadRecords]);

  const latestUploads = [...uploadRecords]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  return (
    <section className="client-profile-card">
      <div className="client-profile-card-header">
        <div>
          <p className="client-profile-kicker">CPCB Upload Data</p>
          <h2>Uploaded quantity for FY {selectedFy}</h2>
        </div>
        <button type="button" className="client-profile-primary-button" onClick={onAddUpload}>
          <Upload className="h-4 w-4" />
          <span>Add Upload</span>
        </button>
      </div>

      <div className="client-profile-upload-metrics">
        <div className="client-profile-upload-total">
          <span>{numberText(totals.total, " MT")}</span>
          <p>Total Uploaded</p>
          <small>{numberText(totals.invoiceCount)} invoices uploaded</small>
        </div>
        {[
          ["CAT-I", totals.cat1],
          ["CAT-II", totals.cat2],
          ["CAT-III", totals.cat3],
          ["CAT-IV", totals.cat4],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <p>{label}</p>
            <span>{numberText(Number(value), " MT")}</span>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-base overflow-hidden">
        {latestUploads.length === 0 ? (
          <div className="client-profile-empty-inline">
            <Upload className="h-4 w-4" />
            <p>No CPCB upload quantities recorded for this FY.</p>
          </div>
        ) : (
          latestUploads.map((record) => (
            <div key={record._id} className="client-profile-upload-row">
              <div>
                <p>{record.uploadType === "purchase" ? "Purchase" : "Sale"} upload</p>
                <span>{formatDate(record.createdAt)} - FY {record.financialYear}</span>
              </div>
              <div>
                <strong>{numberText(uploadTotal(record), " MT")}</strong>
                <span>{numberText(Number(record.invoiceCount) || 0)} invoices</span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function AnnualReturnTracker({
  annualReturn,
  isRegisteredThisFy,
  onSaveStatus,
  registrationSignal,
  selectedFy,
}: {
  annualReturn: AnnualReturnRecord | null;
  isRegisteredThisFy: boolean;
  onSaveStatus: (status: AnnualReturnRecord["status"], patch?: Partial<AnnualReturnRecord>) => void;
  registrationSignal: RegistrationSignal;
  selectedFy: string;
}) {
  const status = annualReturnLabel(annualReturn?.status);
  const nextFy = selectedFy.replace(/^(\d{4})-(\d{2})$/, (_, start: string) => `${Number(start) + 1}-${String(Number(start) + 2).slice(-2)}`);
  const statusOptions: Array<AnnualReturnRecord["status"]> = ["Not Started", "In Progress", "Filed"];

  return (
    <section className="client-profile-card">
      <div className="client-profile-card-header">
        <div>
          <p className="client-profile-kicker">Annual Return Tracker</p>
          <h2>Status for FY {selectedFy}</h2>
        </div>
        <span className="client-profile-status-pill" data-status={status}>{status}</span>
      </div>

      {isRegisteredThisFy && (
        <div className="client-profile-return-decision">
          <div>
            <p>Annual Return Required This FY?</p>
            <span>
              Registration signal: {registrationSignal ? `${registrationSignal.label} - ${formatDate(registrationSignal.date.toISOString())}` : "current FY"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="client-profile-secondary-button"
              onClick={() => onSaveStatus("Not Started", { remarks: "Annual return required for current FY" })}
            >
              Yes
            </button>
            <button
              type="button"
              className="client-profile-primary-button"
              onClick={() => onSaveStatus("Not Required This FY", {
                remarks: `Registered in current FY. Reminder: file Annual Return next FY ${nextFy}.`,
              })}
            >
              No
            </button>
          </div>
        </div>
      )}

      <div className="client-profile-return-status-grid">
        {statusOptions.map((option) => (
          <button
            key={option}
            type="button"
            data-active={annualReturnLabel(option) === status ? "true" : "false"}
            onClick={() => onSaveStatus(option)}
          >
            {option === "Filed" ? <CheckCircle2 className="h-4 w-4" /> : <ClockIcon status={option} />}
            <span>{annualReturnLabel(option)}</span>
          </button>
        ))}
        <button
          type="button"
          data-active={status === "Not Required This FY" ? "true" : "false"}
          onClick={() => onSaveStatus("Not Required This FY", { remarks: "Registered in current FY. Reminder: file Annual Return next FY." })}
        >
          <ShieldCheck className="h-4 w-4" />
          <span>Not Required This FY</span>
        </button>
      </div>

      <div className="client-profile-return-meta">
        <div>
          <p>Filing Date</p>
          <span>{annualReturn?.filingDate ? formatDate(annualReturn.filingDate) : "Not filed"}</span>
        </div>
        <div>
          <p>Acknowledgement</p>
          <span>{annualReturn?.acknowledgeNumber || "Not recorded"}</span>
        </div>
        <div>
          <p>Next FY Reminder</p>
          <span>{status === "Not Required This FY" ? `File Annual Return next FY ${nextFy}` : "Follow standard FY cycle"}</span>
        </div>
      </div>

      {annualReturn?.remarks && (
        <div className="client-profile-note-body mt-4">
          <Bell className="mt-0.5 h-4 w-4 text-faint" />
          <p>{annualReturn.remarks}</p>
        </div>
      )}
    </section>
  );
}

function ClockIcon({ status }: { status: string }) {
  return status === "In Progress" ? <Bell className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />;
}

export function RegistrationDetails({
  client,
  customFieldDefinitions,
  isPWP,
  legalName,
  registrationSignal,
}: {
  client: Client;
  customFieldDefinitions: ClientCustomFieldDefinition[];
  isPWP: boolean;
  legalName: string;
  registrationSignal: RegistrationSignal;
}) {
  const registrationFieldLabels = new Set([
    registrationSignal?.key,
    "cpcbRegistrationDate",
    "cpcbApprovalDate",
    "registrationDate",
    "approvalDate",
  ].filter(Boolean));
  const relevantCustomFields = customFieldDefinitions
    .filter((field) => registrationFieldLabels.has(field.key))
    .map((field) => ({ label: field.label, value: String(client.customFields?.[field.key] || "") }))
    .filter((field) => field.value.trim());

  const fields = [
    { label: "Company Name", value: client.companyName },
    !isPWP && legalName ? { label: "Legal Name", value: legalName } : null,
    { label: "Client Type", value: client.category },
    client.gstNumber ? { label: "GST", value: client.gstNumber } : null,
    !isPWP && client.registrationNumber ? { label: "Registration Number", value: client.registrationNumber } : null,
    client.state ? { label: "State", value: client.state } : null,
    client.address ? { label: "Address", value: client.address } : null,
    registrationSignal ? { label: registrationSignal.label, value: formatDate(registrationSignal.date.toISOString()) } : null,
    ...relevantCustomFields,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <section className="client-profile-card">
      <div className="client-profile-card-header">
        <div>
          <p className="client-profile-kicker">Registration Details</p>
          <h2>{isPWP ? "PWP profile fields" : "PIBO portal identity"}</h2>
        </div>
      </div>
      <div className="client-profile-registration-grid">
        {fields.map((field) => (
          <div key={`${field.label}-${field.value}`}>
            <p>{field.label}</p>
            <span>{field.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ComplianceStatusPanel({
  annualReturn,
  billing,
  fyData,
  invoices,
  isPWP,
  selectedFy,
  uploadRecords,
}: {
  annualReturn: AnnualReturnRecord | null;
  billing: Billing | null;
  fyData?: FYRecord;
  invoices: InvoiceTrackingRecord[];
  isPWP: boolean;
  selectedFy: string;
  uploadRecords: UploadRecord[];
}) {
  const coverage = buildInvoiceCoverageSummary(invoices, selectedFy);
  const uploadedTotal = uploadRecords.reduce((sum, record) => sum + uploadTotal(record), 0);
  const checks = [
    { label: "Annual Return", value: annualReturnLabel(annualReturn?.status), done: annualReturn?.status === "Filed" || annualReturn?.status === "Verified" || annualReturn?.status === "Not Required This FY" },
    { label: "Invoice Coverage", value: `${coverage.sale.doneCount + coverage.purchase.doneCount}/24 months`, done: coverage.sale.doneCount + coverage.purchase.doneCount >= 12 },
    { label: "CPCB Upload Quantity", value: `${numberText(uploadedTotal)} MT`, done: uploadedTotal > 0 },
    { label: isPWP ? "FY Credits" : "FY Targets", value: fyData ? "Recorded" : "Missing", done: Boolean(fyData) },
    { label: "Billing", value: billing ? billing.paymentStatus : "Not generated", done: Boolean(billing) },
  ];

  return (
    <section className="client-profile-card">
      <div className="client-profile-card-header">
        <div>
          <p className="client-profile-kicker">Compliance Status</p>
          <h2>Action readiness for FY {selectedFy}</h2>
        </div>
      </div>
      <div className="client-profile-status-checks">
        {checks.map((check) => (
          <div key={check.label} data-done={check.done ? "true" : "false"}>
            <span>{check.done ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}</span>
            <div>
              <p>{check.label}</p>
              <small>{check.value}</small>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function BillingWorkflowPanel({
  acceptedQuotations,
  billing,
  clientCategory,
  onCreateDirectBill,
  onCreateFromQuotation,
  onOpenQuotations,
  selectedFy,
}: {
  acceptedQuotations: QuotationSummary[];
  billing: Billing | null;
  clientCategory: string;
  onCreateDirectBill: () => void;
  onCreateFromQuotation: (quotation: QuotationSummary) => void;
  onOpenQuotations: () => void;
  selectedFy: string;
}) {
  const isPwp = clientCategory === "PWP";
  const isProducer = clientCategory === "Producer";
  const requiresAcceptedQuotation = clientCategory === "Importer" || clientCategory === "Brand Owner";
  const hasAcceptedQuotation = acceptedQuotations.length > 0;

  return (
    <section className="client-profile-card">
      <div className="client-profile-card-header">
        <div>
          <p className="client-profile-kicker">Billing Workflow</p>
          <h2>{clientCategory} billing path - FY {selectedFy}</h2>
        </div>
        {billing && <span className="client-profile-status-pill">{billing.paymentStatus}</span>}
      </div>

      <div className="client-profile-billing-workflow">
        {requiresAcceptedQuotation && (
          <div data-locked={!hasAcceptedQuotation ? "true" : "false"}>
            <Lock className="h-4 w-4" />
            <div>
              <p>Quotation to Accepted to Bill</p>
              <span>
                {hasAcceptedQuotation
                  ? `${acceptedQuotations.length} accepted quotation${acceptedQuotations.length === 1 ? "" : "s"} available`
                  : "Bill generation is locked until a quotation is accepted."}
              </span>
            </div>
          </div>
        )}
        {isProducer && (
          <div>
            <Receipt className="h-4 w-4" />
            <div>
              <p>Quotation or Direct Bill</p>
              <span>Use an accepted quotation when available, or create a direct bill.</span>
            </div>
          </div>
        )}
        {isPwp && (
          <div>
            <IndianRupee className="h-4 w-4" />
            <div>
              <p>Direct Bill Only</p>
              <span>PWP clients do not use the quotation step for annual return billing.</span>
            </div>
          </div>
        )}
      </div>

      <div className="client-profile-billing-actions">
        {!isPwp && acceptedQuotations.slice(0, 3).map((quotation) => (
          <button key={quotation._id} type="button" className="client-profile-secondary-button" onClick={() => onCreateFromQuotation(quotation)}>
            <Receipt className="h-4 w-4" />
            <span>{quotation.quotationNumber || "Accepted Quotation"} - {formatCurrency(quotation.grandTotal || 0)}</span>
          </button>
        ))}
        {(isProducer || isPwp) && (
          <button type="button" className="client-profile-primary-button" onClick={onCreateDirectBill}>
            <IndianRupee className="h-4 w-4" />
            <span>{isPwp ? "Create Annual Return Bill" : "Create Direct Bill"}</span>
          </button>
        )}
        {requiresAcceptedQuotation && !hasAcceptedQuotation && (
          <button type="button" className="client-profile-primary-button" onClick={onOpenQuotations}>
            <ChevronLeft className="h-4 w-4 rotate-180" />
            <span>Open Quotations</span>
          </button>
        )}
      </div>
    </section>
  );
}

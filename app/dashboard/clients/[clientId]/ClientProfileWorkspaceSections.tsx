"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  Bell,
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
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
  Pencil,
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
import {
  formatDateTime,
  type Billing,
  type Client,
  type FYRecord,
  type InvoiceTrackingRecord,
  type UploadRecord,
} from "./ClientProfileSupport";

export type ClientProfileTabId = "overview" | "compliance" | "financial" | "documents" | "timeline" | "notes";
export type ComplianceSectionId =
  | "annualReturn"
  | "invoiceTracking"
  | "cpcbUpload"
  | "targetsCredits"
  | "registration"
  | "status";
export type FinancialSectionId = "overview" | "quotations" | "billing" | "payments" | "ledger";
export type DocumentsSectionId = "all" | "compliance" | "financial" | "invoices" | "certificates" | "other";
export type TimelineSectionId = "all" | "compliance" | "financial" | "communications" | "documents" | "system";
export type NotesTasksSectionId = "notes" | "tasks" | "reminders" | "followUps" | "callsMeetings";
export type InvoiceMonthStatus = "Pending" | "Received" | "Partial / Issue" | "Nil / No Invoice";
export type InvoiceReceivedVia = "hardcopy" | "mail" | "whatsapp" | "excel" | "other";

export type ClientProfileSecondaryNavItem<T extends string> = {
  id: T;
  label: string;
  short: string;
  icon: React.ReactNode;
};

export type ComplianceNavState = "complete" | "in-progress" | "action" | "recorded";

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
  status: "Pending" | "Not Started" | "In Progress" | "Ready to File" | "Filed" | "Verified" | "Not Required This FY";
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
  { id: "status", label: "Compliance Overview", short: "Overview", icon: <ClipboardCheck className="h-4 w-4" /> },
  { id: "annualReturn", label: "Annual Return Tracker", short: "Annual Return", icon: <CalendarCheck className="h-4 w-4" /> },
  { id: "invoiceTracking", label: "Invoice Tracking", short: "Invoice Tracking", icon: <FileText className="h-4 w-4" /> },
  { id: "cpcbUpload", label: "CPCB Upload Data", short: "CPCB Upload", icon: <Upload className="h-4 w-4" /> },
  { id: "targetsCredits", label: "FY Targets / Credits", short: "Targets", icon: <Target className="h-4 w-4" /> },
  { id: "registration", label: "Registration Details", short: "Registration", icon: <ShieldCheck className="h-4 w-4" /> },
];

export const FINANCIAL_NAV: Array<ClientProfileSecondaryNavItem<FinancialSectionId>> = [
  { id: "overview", label: "Financial Overview", short: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "quotations", label: "Quotations", short: "Quotations", icon: <Receipt className="h-4 w-4" /> },
  { id: "billing", label: "Billing", short: "Billing", icon: <IndianRupee className="h-4 w-4" /> },
  { id: "payments", label: "Payments & Advances", short: "Payments", icon: <Wallet className="h-4 w-4" /> },
  { id: "ledger", label: "Ledger", short: "Ledger", icon: <History className="h-4 w-4" /> },
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
  { id: "communications", label: "Communications", short: "Messages", icon: <Bell className="h-4 w-4" /> },
  { id: "documents", label: "Documents", short: "Documents", icon: <FolderOpen className="h-4 w-4" /> },
  { id: "system", label: "System Activity", short: "System", icon: <History className="h-4 w-4" /> },
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

const hasMeaningfulFyRecord = (fyData?: FYRecord) => {
  if (!fyData) return false;
  const values = [
    fyData.totalTarget,
    fyData.totalAchieved,
    fyData.totalGenerated,
    fyData.totalSold,
    fyData.targetAmount,
    fyData.achievedAmount,
    fyData.totalCredits,
    fyData.totalUsed,
  ];
  return values.some((value) => Number(value) !== 0)
    || Boolean(fyData.targets?.length || fyData.generated?.length);
};

export function getComplianceNavStates({
  annualReturn,
  fyData,
  invoices,
  selectedFy,
  uploadRecords,
}: {
  annualReturn: AnnualReturnRecord | null;
  fyData?: FYRecord;
  invoices: InvoiceTrackingRecord[];
  selectedFy: string;
  uploadRecords: UploadRecord[];
}): Partial<Record<ComplianceSectionId, ComplianceNavState>> {
  const coverage = buildInvoiceCoverageSummary(invoices, selectedFy);
  const coveredMonths = coverage.sale.doneCount + coverage.purchase.doneCount;
  const annualStatus = annualReturnLabel(annualReturn?.status);
  const annualComplete = annualReturn?.status === "Filed"
    || annualReturn?.status === "Verified"
    || annualReturn?.status === "Not Required This FY";

  return {
    status: "recorded",
    annualReturn: annualComplete
      ? "complete"
      : annualStatus === "In Progress" || annualStatus === "Ready to File"
        ? "in-progress"
        : "action",
    invoiceTracking: coveredMonths === 24 ? "complete" : coveredMonths > 0 ? "in-progress" : "action",
    cpcbUpload: uploadRecords.length > 0 ? "recorded" : "action",
    targetsCredits: hasMeaningfulFyRecord(fyData) ? "recorded" : "action",
  };
}

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
      receivedVia: undefined as InvoiceReceivedVia | undefined,
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
  navRef,
  onChange,
}: {
  activeTab: ClientProfileTabId;
  navRef?: React.Ref<HTMLElement>;
  onChange: (tab: ClientProfileTabId) => void;
}) {
  return (
    <nav ref={navRef} className="client-profile-primary-tabs" aria-label="Client workspace tabs">
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
  navStates,
  onCollapsedChange,
  onSectionChange,
  sections,
  title,
}: {
  activeSection: T;
  collapsed: boolean;
  navItems: Array<ClientProfileSecondaryNavItem<T>>;
  navStates?: Partial<Record<T, ComplianceNavState>>;
  onCollapsedChange: (collapsed: boolean) => void;
  onSectionChange: (section: T) => void;
  sections: Record<T, React.ReactNode>;
  title: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const expandedWidth = 238;
  const collapsedWidth = 68;

  return (
    <section
      className="client-profile-compliance-workspace"
      data-workspace={title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
    >
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
            {navStates?.[item.id] && <i data-state={navStates[item.id]} aria-hidden="true" />}
          </button>
        ))}
      </div>

      <motion.aside
        className="client-profile-secondary-nav"
        data-collapsed={collapsed ? "true" : "false"}
        initial={prefersReducedMotion ? false : {
          width: collapsedWidth,
          opacity: collapsed ? 1 : 0.78,
          x: collapsed ? 0 : -6,
        }}
        animate={{
          width: collapsed ? collapsedWidth : expandedWidth,
          opacity: 1,
          x: 0,
        }}
        transition={prefersReducedMotion ? { duration: 0 } : {
          width: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
          opacity: { duration: 0.2, ease: "easeOut" },
          x: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
        }}
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
            {navStates?.[item.id] && <i data-state={navStates[item.id]} aria-hidden="true" />}
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
  isPWP,
  navStates,
  onCollapsedChange,
  onSectionChange,
  sections,
}: {
  activeSection: ComplianceSectionId;
  collapsed: boolean;
  isPWP: boolean;
  navStates: Partial<Record<ComplianceSectionId, ComplianceNavState>>;
  onCollapsedChange: (collapsed: boolean) => void;
  onSectionChange: (section: ComplianceSectionId) => void;
  sections: Record<ComplianceSectionId, React.ReactNode>;
}) {
  const navItems = isPWP
    ? COMPLIANCE_NAV.filter((item) => item.id !== "registration")
    : COMPLIANCE_NAV;

  useEffect(() => {
    if (isPWP && activeSection === "registration") onSectionChange("status");
  }, [activeSection, isPWP, onSectionChange]);

  return (
    <ClientProfileSecondaryWorkspace
      activeSection={activeSection}
      collapsed={collapsed}
      navItems={navItems}
      navStates={navStates}
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
  variant = "default",
  onAction,
}: {
  progress: number;
  selectedFy: string;
  steps: AnnualReturnProgressStep[];
  subtitle?: string;
  title?: string;
  variant?: "default" | "hero";
  onAction?: () => void;
}) {
  const percentage = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const completeCount = steps.filter((step) => step.progress >= 1).length;
  const activeStep = steps.find((step) => step.progress > 0 && step.progress < 1)
    || steps.find((step) => step.progress < 1)
    || steps[steps.length - 1];

  return (
    <section className={`client-profile-card client-profile-progress-card ${variant === "hero" ? "client-profile-progress-hero" : ""}`}>
      <div className="client-profile-card-header">
        <div>
          <p className="client-profile-kicker">{variant === "hero" ? "Annual Return" : `FY ${selectedFy}`}</p>
          <h2>{title}</h2>
          {subtitle && <span>{subtitle}</span>}
          {variant === "hero" && activeStep && (
            <p className="client-profile-progress-next">
              <span>Next</span>
              {activeStep.label} · {activeStep.detail}
            </p>
          )}
        </div>
        {variant === "hero" ? (
          <div
            className="client-profile-progress-ring"
            style={{ background: `conic-gradient(#0071e3 ${percentage * 3.6}deg, rgba(120,120,128,0.14) 0deg)` }}
            role="img"
            aria-label={`${percentage}% complete`}
          >
            <div>
              <strong>{percentage}%</strong>
              <span>{completeCount}/{steps.length}</span>
            </div>
          </div>
        ) : (
          <div className="client-profile-progress-value">
            <strong>{percentage}%</strong>
            <span>{completeCount}/{steps.length} complete</span>
          </div>
        )}
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
      {variant === "hero" && onAction && (
        <div className="client-profile-progress-hero-footer">
          <span>FY {selectedFy}</span>
          <button type="button" onClick={onAction}>
            Continue workflow
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
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
  onAddInvoice: (context?: {
    invoiceType: "sale" | "purchase";
    monthKey: string;
    status: InvoiceMonthStatus;
    receivedVia?: InvoiceReceivedVia;
    remarks?: string;
  }) => void;
}) {
  const [selectedMonth, setSelectedMonth] = useState<(ReturnType<typeof getInvoiceMonthStates>[number] & {
    invoiceType: "sale" | "purchase";
  }) | null>(null);
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

  useEffect(() => {
    setSelectedMonth(null);
  }, [selectedFy]);

  const renderMonthGrid = (
    label: string,
    invoiceType: "sale" | "purchase",
    months: typeof saleMonths,
  ) => (
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
          <button
            key={`${label}-${month.key}`}
            type="button"
            data-status={month.status}
            data-selected={selectedMonth?.key === month.key && selectedMonth.invoiceType === invoiceType ? "true" : "false"}
            title={`${month.label}: ${month.status}`}
            onClick={() => setSelectedMonth((current) => (
              current?.key === month.key && current.invoiceType === invoiceType
                ? null
                : { ...month, invoiceType }
            ))}
          >
            <span>{month.label}</span>
            <small>{month.status === "Nil / No Invoice" ? "Nil" : month.status}</small>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <section className="client-profile-card client-profile-invoice-section">
      <div className="client-profile-card-header">
        <div>
          <p className="client-profile-kicker">Invoice Tracking</p>
          <h2>FY {selectedFy} month coverage</h2>
        </div>
        <button type="button" className="client-profile-primary-button" onClick={() => onAddInvoice()}>
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

      <div className="client-profile-invoice-legend" aria-label="Invoice status legend">
        {[
          ["Received", "Invoice information received"],
          ["Pending", "Still awaited"],
          ["Partial / Issue", "Incomplete or needs attention"],
          ["Nil / No Invoice", "Confirmed no invoice"],
        ].map(([label, detail]) => (
          <span key={label} data-status={label}>
            <i />
            <span><strong>{label}</strong><small>{detail}</small></span>
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {renderMonthGrid("Sale Invoices", "sale", saleMonths)}
        {renderMonthGrid("Purchase Invoices", "purchase", purchaseMonths)}
      </div>

      <AnimatePresence initial={false}>
        {selectedMonth && (
          <motion.div
            className="client-profile-invoice-detail"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            <div>
              <span className="client-profile-status-pill" data-status={selectedMonth.status}>{selectedMonth.status}</span>
              <h3>{selectedMonth.invoiceType === "sale" ? "Sale" : "Purchase"} · {selectedMonth.label}</h3>
              <p>
                {selectedMonth.receivedVia
                  ? `Received via ${selectedMonth.receivedVia}.`
                  : selectedMonth.status === "Pending"
                    ? "No receipt source has been recorded."
                    : "Receipt source not recorded."}
                {selectedMonth.remarks ? ` ${selectedMonth.remarks}` : ""}
              </p>
              {selectedMonth.timestamp > 0 && <small>Updated {formatDateTime(new Date(selectedMonth.timestamp).toISOString())}</small>}
            </div>
            <button
              type="button"
              className="client-profile-secondary-button"
              onClick={() => onAddInvoice({
                invoiceType: selectedMonth.invoiceType,
                monthKey: selectedMonth.key,
                status: selectedMonth.status,
                receivedVia: selectedMonth.receivedVia,
                remarks: selectedMonth.remarks,
              })}
            >
              Update this month
            </button>
          </motion.div>
        )}
      </AnimatePresence>
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
    <section className="client-profile-card client-profile-cpcb-section">
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
          <span className="client-profile-upload-icon"><Upload className="h-5 w-5" /></span>
          <span>{numberText(totals.total, " MT")}</span>
          <p>Total quantity recorded</p>
          <small>{numberText(totals.invoiceCount)} invoices in CPCB upload records</small>
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

      <div className="client-profile-upload-history">
        <div className="client-profile-upload-history-head">
          <div><p>Recent records</p><span>Recorded independently from invoice tracking and FY targets.</span></div>
          {latestUploads.length > 0 && <span>{latestUploads.length} shown</span>}
        </div>
        {latestUploads.length === 0 ? (
          <div className="client-profile-upload-empty">
            <span><Upload className="h-5 w-5" /></span>
            <div>
              <p>No upload records for FY {selectedFy}</p>
              <small>Record the first CPCB upload when portal quantities are available.</small>
            </div>
            <button type="button" className="client-profile-secondary-button" onClick={onAddUpload}>
              Add first upload
            </button>
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
  const statusOptions: Array<AnnualReturnRecord["status"]> = ["Not Started", "In Progress", "Ready to File", "Filed", "Verified"];
  const [filingDate, setFilingDate] = useState(annualReturn?.filingDate?.slice(0, 10) || "");
  const [acknowledgement, setAcknowledgement] = useState(annualReturn?.acknowledgeNumber || "");
  const [filingEditorStatus, setFilingEditorStatus] = useState<"Filed" | "Verified" | null>(null);

  useEffect(() => {
    setFilingDate(annualReturn?.filingDate?.slice(0, 10) || "");
    setAcknowledgement(annualReturn?.acknowledgeNumber || "");
  }, [annualReturn?.acknowledgeNumber, annualReturn?.filingDate, selectedFy]);

  const statusReason = status === "Verified"
    ? "The filed return has been reviewed and verified."
    : status === "Filed"
      ? "The annual return has been filed; verification is the next stage."
      : status === "Ready to File"
        ? "Preparation is complete and the return can proceed to filing."
        : status === "In Progress"
          ? "Activity has started for this financial year."
          : status === "Not Required This FY"
            ? `No filing is required for this FY. Continue the cycle in FY ${nextFy}.`
            : "No annual return activity has been recorded for this FY.";

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

      <div className="client-profile-return-current">
        <span><CalendarCheck className="h-5 w-5" /></span>
        <div>
          <small>Current stage</small>
          <h3>{status}</h3>
          <p>{statusReason}</p>
        </div>
      </div>

      <div className="client-profile-return-timeline" aria-label="Annual return stages">
        {statusOptions.map((option, index) => {
          const activeIndex = statusOptions.indexOf(status as AnnualReturnRecord["status"]);
          const done = activeIndex >= 0 && index < activeIndex;
          const active = option === status;
          return (
            <button
              key={option}
              type="button"
              data-active={active ? "true" : "false"}
              data-done={done ? "true" : "false"}
              onClick={() => {
                if (option === "Filed" || option === "Verified") {
                  setFilingEditorStatus(option);
                  return;
                }
                onSaveStatus(option);
              }}
            >
              <span>{done || active && (option === "Filed" || option === "Verified") ? <CheckCircle2 className="h-4 w-4" /> : <ClockIcon status={option} />}</span>
              <small>Step {index + 1}</small>
              <strong>{option}</strong>
            </button>
          );
        })}
      </div>

      {(status === "Filed" || status === "Verified") && (
        <div className="client-profile-filing-summary">
          <div>
            <p>Filing details</p>
            <span>{annualReturn?.filingDate ? formatDate(annualReturn.filingDate) : "Filing date not recorded"}</span>
          </div>
          <div>
            <p>Acknowledgement</p>
            <span>{annualReturn?.acknowledgeNumber || "Not recorded"}</span>
          </div>
          <button type="button" className="client-profile-secondary-button" onClick={() => setFilingEditorStatus(status as "Filed" | "Verified")}>
            Edit details
          </button>
        </div>
      )}

      <div className="client-profile-return-footer">
        <button
          type="button"
          data-active={status === "Not Required This FY" ? "true" : "false"}
          onClick={() => onSaveStatus("Not Required This FY", { remarks: "Registered in current FY. Reminder: file Annual Return next FY." })}
        >
          <ShieldCheck className="h-4 w-4" />
          <span><strong>Not Required This FY</strong><small>Use only when filing is not applicable for this cycle.</small></span>
        </button>
        <div>
          <span>{annualReturn?.updatedAt ? `Updated ${formatDateTime(annualReturn.updatedAt)}` : "No status update recorded"}</span>
          {annualReturn?.remarks && <p>{annualReturn.remarks}</p>}
        </div>
      </div>

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {filingEditorStatus && (
            <motion.div
              className="client-profile-action-sheet-root"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              role="dialog"
              aria-modal="true"
              aria-label={`${filingEditorStatus} annual return`}
            >
              <button
                type="button"
                className="client-profile-action-sheet-backdrop"
                onClick={() => setFilingEditorStatus(null)}
                aria-label="Close filing details"
              />
              <motion.form
                className="client-profile-filing-sheet"
                initial={{ y: "105%", scale: 0.97 }}
                animate={{ y: 0, scale: 1 }}
                exit={{ y: "105%", scale: 0.98 }}
                transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.9 }}
                onSubmit={(event) => {
                  event.preventDefault();
                  onSaveStatus(filingEditorStatus, {
                    filingDate: filingDate || null,
                    acknowledgeNumber: acknowledgement.trim(),
                  });
                  setFilingEditorStatus(null);
                }}
              >
                <div className="client-profile-filing-sheet-handle" />
                <div className="client-profile-filing-sheet-header">
                  <div>
                    <small>Annual Return · FY {selectedFy}</small>
                    <h3>Mark as {filingEditorStatus}</h3>
                    <p>Confirm the filing reference before updating this stage.</p>
                  </div>
                  <span><CalendarCheck className="h-5 w-5" /></span>
                </div>
                <div className="client-profile-filing-sheet-fields">
                  <label>
                    <span>Filing date</span>
                    <input type="date" value={filingDate} onChange={(event) => setFilingDate(event.target.value)} required={filingEditorStatus === "Filed"} />
                  </label>
                  <label>
                    <span>Acknowledgement number</span>
                    <input value={acknowledgement} onChange={(event) => setAcknowledgement(event.target.value)} placeholder="Enter acknowledgement" />
                  </label>
                </div>
                <div className="client-profile-filing-sheet-actions">
                  <button type="button" className="client-profile-secondary-button" onClick={() => setFilingEditorStatus(null)}>Cancel</button>
                  <button type="submit" className="client-profile-primary-button">Save as {filingEditorStatus}</button>
                </div>
              </motion.form>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </section>
  );
}

function ClockIcon({ status }: { status: string }) {
  if (status === "Ready to File") return <CheckCircle2 className="h-4 w-4" />;
  return status === "In Progress" ? <Bell className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />;
}

export function RegistrationDetails({
  client,
  customFieldDefinitions,
  isPWP,
  onEdit,
  registrationSignal,
}: {
  client: Client;
  customFieldDefinitions: ClientCustomFieldDefinition[];
  isPWP: boolean;
  onEdit: () => void;
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
    !isPWP && client.registrationNumber ? { label: "CPCB Registration Number", value: client.registrationNumber } : null,
    registrationSignal ? { label: registrationSignal.label, value: formatDate(registrationSignal.date.toISOString()) } : null,
    ...relevantCustomFields,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <section className="client-profile-card client-profile-registration-section">
      <div className="client-profile-card-header">
        <div>
          <p className="client-profile-kicker">Registration Details</p>
          <h2>{isPWP ? "PWP registration record" : "CPCB registration record"}</h2>
          <span>Permanent registration information and recorded approval details.</span>
        </div>
        <button type="button" className="client-profile-secondary-button" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          <span>Edit registration</span>
        </button>
      </div>
      {fields.length > 0 ? (
        <div className="client-profile-registration-record">
          <div className="client-profile-registration-emblem"><ShieldCheck className="h-6 w-6" /></div>
          <div className="client-profile-registration-grid">
            {fields.map((field, index) => (
              <div key={`${field.label}-${field.value}`} data-primary={index === 0 ? "true" : "false"}>
                <p>{field.label}</p>
                <span>{field.value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="client-profile-registration-empty">
          <ShieldCheck className="h-5 w-5" />
          <div>
            <p>No registration details recorded</p>
            <span>Add the CPCB registration number and relevant registration dates.</span>
          </div>
          <button type="button" className="client-profile-primary-button" onClick={onEdit}>Add details</button>
        </div>
      )}
    </section>
  );
}

export function ComplianceStatusPanel({
  annualReturn,
  fyData,
  invoices,
  isPWP,
  onSectionChange,
  selectedFy,
  uploadRecords,
}: {
  annualReturn: AnnualReturnRecord | null;
  fyData?: FYRecord;
  invoices: InvoiceTrackingRecord[];
  isPWP: boolean;
  onSectionChange: (section: ComplianceSectionId) => void;
  selectedFy: string;
  uploadRecords: UploadRecord[];
}) {
  const coverage = buildInvoiceCoverageSummary(invoices, selectedFy);
  const uploadedTotal = uploadRecords.reduce((sum, record) => sum + uploadTotal(record), 0);
  const coveredMonths = coverage.sale.doneCount + coverage.purchase.doneCount;
  const hasMeaningfulFyData = hasMeaningfulFyRecord(fyData);
  const checks = [
    {
      id: "annualReturn" as const,
      label: "Annual Return",
      value: annualReturnLabel(annualReturn?.status),
      detail: annualReturn?.status === "Verified" ? "Filing cycle complete" : "Open the tracker to continue the filing workflow",
      done: annualReturn?.status === "Filed" || annualReturn?.status === "Verified" || annualReturn?.status === "Not Required This FY",
      tone: annualReturn?.status === "Verified" ? "green" : "blue",
      state: annualReturn?.status === "Filed" || annualReturn?.status === "Verified" || annualReturn?.status === "Not Required This FY"
        ? "complete"
        : annualReturn?.status === "In Progress" || annualReturn?.status === "Ready to File"
          ? "in-progress"
          : "action",
      stateLabel: annualReturn?.status === "Filed" || annualReturn?.status === "Verified" || annualReturn?.status === "Not Required This FY"
        ? "Complete"
        : annualReturnLabel(annualReturn?.status),
    },
    {
      id: "invoiceTracking" as const,
      label: "Invoice Coverage",
      value: `${coveredMonths}/24 months`,
      detail: `${coverage.sale.doneCount}/12 sale · ${coverage.purchase.doneCount}/12 purchase`,
      done: coveredMonths === 24,
      tone: "amber",
      state: coveredMonths === 24 ? "complete" : coveredMonths > 0 ? "in-progress" : "action",
      stateLabel: coveredMonths === 24 ? "Complete" : coveredMonths > 0 ? "In progress" : "Action needed",
    },
    {
      id: "cpcbUpload" as const,
      label: "CPCB Upload Data",
      value: uploadRecords.length ? `${uploadRecords.length} record${uploadRecords.length === 1 ? "" : "s"}` : "Not recorded",
      detail: uploadRecords.length ? `${numberText(uploadedTotal)} MT recorded independently` : "No CPCB upload entry for this FY",
      done: uploadRecords.length > 0,
      tone: "purple",
      state: uploadRecords.length > 0 ? "recorded" : "action",
      stateLabel: uploadRecords.length > 0 ? "Recorded" : "Action needed",
    },
    {
      id: "targetsCredits" as const,
      label: isPWP ? "FY Credits" : "FY Targets",
      value: hasMeaningfulFyData ? "Recorded" : "Not recorded",
      detail: isPWP ? "Generated, sold and remaining credits" : "Target, achieved and remaining values",
      done: hasMeaningfulFyData,
      tone: "teal",
      state: hasMeaningfulFyData ? "recorded" : "action",
      stateLabel: hasMeaningfulFyData ? "Recorded" : "Action needed",
    },
  ];
  const completeCount = checks.filter((check) => check.done).length;
  const readiness = Math.round((completeCount / checks.length) * 100);
  const nextAction = checks.find((check) => !check.done);

  return (
    <section className="client-profile-card client-profile-compliance-overview">
      <div className="client-profile-overview-hero">
        <div>
          <p className="client-profile-kicker">Compliance Overview</p>
          <h2>FY {selectedFy} readiness</h2>
          <span>{completeCount} of {checks.length} areas have recorded or completed data.</span>
          {nextAction ? (
            <button type="button" onClick={() => onSectionChange(nextAction.id)}>
              <span>Recommended next</span>
              <strong>{nextAction.label}</strong>
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <p className="client-profile-overview-complete"><CheckCircle2 className="h-4 w-4" /> All compliance areas are ready.</p>
          )}
        </div>
        <div
          className="client-profile-overview-ring"
          style={{ background: `conic-gradient(#007aff ${readiness * 3.6}deg, rgba(120,120,128,0.14) 0)` }}
          role="img"
          aria-label={`${readiness}% readiness`}
        >
          <div><strong>{readiness}%</strong><span>ready</span></div>
        </div>
      </div>

      <div className="client-profile-overview-checks">
        {checks.map((check) => (
          <button
            key={check.label}
            type="button"
            data-done={check.done ? "true" : "false"}
            data-state={check.state}
            data-tone={check.tone}
            onClick={() => onSectionChange(check.id)}
          >
            <span>{check.done ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}</span>
            <div>
              <p>{check.label}</p>
              <strong>{check.value}</strong>
              <small>{check.detail}</small>
            </div>
            <em>{check.stateLabel}</em>
            <ChevronRight className="h-4 w-4" />
          </button>
        ))}
      </div>
    </section>
  );
}

export function BillingWorkflowPanel({
  acceptedQuotations,
  linkedQuotations,
  billing,
  clientCategory,
  onCreateDirectBill,
  onCreateFromQuotation,
  onOpenQuotation,
  onOpenQuotations,
  selectedFy,
}: {
  acceptedQuotations: QuotationSummary[];
  linkedQuotations: QuotationSummary[];
  billing: Billing | null;
  clientCategory: string;
  onCreateDirectBill: () => void;
  onCreateFromQuotation: (quotation: QuotationSummary) => void;
  onOpenQuotation: (quotation: QuotationSummary) => void;
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

      <div className="client-profile-financial-quotation-list">
        <div className="client-profile-financial-subhead">
          <div>
            <p>Linked quotations</p>
            <span>Only quotations explicitly linked to this client and financial year appear here.</span>
          </div>
          <button
            type="button"
            className="client-profile-secondary-button"
            onClick={() => linkedQuotations.length === 1 ? onOpenQuotation(linkedQuotations[0]) : onOpenQuotations()}
          >
            <Receipt className="h-4 w-4" />
            <span>
              {linkedQuotations.length === 0
                ? "Add Quotation"
                : linkedQuotations.length === 1
                ? `Open ${linkedQuotations[0].quotationNumber || "Quotation"}`
                : "View Linked Quotations"}
            </span>
          </button>
        </div>
        {linkedQuotations.length === 0 ? (
          <div className="client-profile-financial-empty-row">
            <AlertCircle className="h-4 w-4" />
            <span>No linked quotation for FY {selectedFy}</span>
          </div>
        ) : (
          <div className="client-profile-financial-linked-list">
            {linkedQuotations.slice(0, 6).map((quotation) => (
              <button key={quotation._id} type="button" onClick={() => onOpenQuotation(quotation)}>
                <span className="client-profile-financial-neutral-icon"><Receipt className="h-4 w-4" /></span>
                <div>
                  <strong>{quotation.quotationNumber || quotation.clientName}</strong>
                  <small>{quotation.status}</small>
                </div>
                <b>{formatCurrency(quotation.grandTotal || 0)}</b>
                <ChevronRight className="h-4 w-4" />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

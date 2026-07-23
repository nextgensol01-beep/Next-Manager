"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  animate as animateValue,
  motion,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "framer-motion";
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ExternalLink,
  FileText,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Shield,
  Smartphone,
  StickyNote,
  Trash2,
  User,
} from "lucide-react";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { formatDate } from "@/lib/utils";
import {
  CopyButton,
  formatDateTime,
  getContactEmails,
  getContactPhones,
  type Client,
  type Contact,
  type Document,
} from "./ClientProfileSupport";

export type ClientProfileMetric = {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  tone?: "neutral" | "brand" | "success" | "warning" | "danger";
  actionLabel?: string;
  onClick?: () => void;
  progress?: number;
  detailRows?: Array<{ label: string; value: string }>;
  milestones?: Array<{ label: string; value: string; state?: "done" | "partial" | "pending" }>;
};

export type ClientProfileQuickAction = {
  label: string;
  description?: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: "primary" | "neutral" | "success" | "warning" | "danger";
};

export type ClientProfileCustomField = {
  id: string;
  label: string;
  value: string;
  icon: React.ReactNode;
  mono?: boolean;
  position: "beforeContact" | "afterContact" | "afterCompany";
};

type ClientProfileHeaderProps = {
  client: Client;
  legalName: string;
  selectedFy: string;
  financialYears: string[];
  onFinancialYearChange: (financialYear: string) => void;
  registrationStatus: string;
  validityLabel: string;
  billingStatus: string;
  progress: MotionValue<number>;
  copiedKey: string | null;
  onCopyClientId: () => void;
  onBack: () => void;
  onEdit: () => void;
  primaryActions: ClientProfileQuickAction[];
};

type CompanyOverviewProps = {
  client: Client;
  isPWP: boolean;
  legalName: string;
  customFields: ClientProfileCustomField[];
  hiddenCustomCount: number;
  showAllCustomFields: boolean;
  onToggleCustomFields: () => void;
  primaryContact: Contact | null;
  contactName: string;
  contactDesig: string;
  contactMobile: string;
  contactEmail: string;
  copiedKey: string | null;
  onCopy: (value: string, key: string, label: string) => void;
  onEdit: () => void;
  onEditPortal: () => void;
  contactsOpen: boolean;
  portalOpen: boolean;
  onToggleContacts: () => void;
  onTogglePortal: () => void;
  showPassword: boolean;
  onTogglePassword: () => void;
  portalLastUpdated: string;
  passwordMask: string;
};

type DocumentsSectionProps = {
  documents: Document[];
  open: boolean;
  busyAction: string | null;
  hasLinkedContacts: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onEdit: (document: Document) => void;
  onDelete: (id: string) => void;
  onLinkContact: () => void;
};

type NotesSectionProps = {
  notes?: string;
  updatedAt: string;
  onEditBilling: () => void;
};

type EmptyProfileStateProps = {
  selectedFy: string;
  isPWP: boolean;
  actions: ClientProfileQuickAction[];
};

const getInitials = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "CL";

const toneClass = (tone: ClientProfileMetric["tone"] = "neutral") => {
  if (tone === "brand") return "client-profile-tone-brand";
  if (tone === "success") return "client-profile-tone-success";
  if (tone === "warning") return "client-profile-tone-warning";
  if (tone === "danger") return "client-profile-tone-danger";
  return "client-profile-tone-neutral";
};

const actionToneClass = (tone: ClientProfileQuickAction["tone"] = "neutral") => {
  if (tone === "primary") return "client-profile-action-primary";
  if (tone === "success") return "client-profile-action-success";
  if (tone === "warning") return "client-profile-action-warning";
  if (tone === "danger") return "client-profile-action-danger";
  return "client-profile-action-neutral";
};

function CollapsibleHeader({
  title,
  subtitle,
  open,
  onToggle,
  trailing,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="client-profile-subsection-header">
      <button type="button" onClick={onToggle} className="client-profile-subsection-trigger">
        <motion.span animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.16 }}>
          <ChevronDown className="h-4 w-4" />
        </motion.span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-default">{title}</span>
          {subtitle && <span className="block text-xs text-faint">{subtitle}</span>}
        </span>
      </button>
      {trailing}
    </div>
  );
}

function ProfileFieldRow({
  icon,
  label,
  value,
  sub,
  mono,
  copy,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  sub?: string;
  mono?: boolean;
  copy?: React.ReactNode;
}) {
  return (
    <div className="client-profile-field-row">
      <div className="client-profile-field-icon">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="client-profile-field-label">{label}</p>
        <p className={`client-profile-field-value ${mono ? "font-mono" : ""}`}>{value || "-"}</p>
        {sub && <p className="text-xs text-faint">{sub}</p>}
      </div>
      {copy}
    </div>
  );
}

function ContactList({
  contacts,
  copiedKey,
  onCopy,
}: {
  contacts: Contact[];
  copiedKey: string | null;
  onCopy: (value: string, key: string, label: string) => void;
}) {
  return (
    <div className="client-profile-contact-grid">
      {contacts.map((contact, index) => {
        const phones = getContactPhones(contact);
        const emails = getContactEmails(contact);

        return (
          <div key={contact._id} className="client-profile-contact-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-default">{contact.name}</p>
                {contact.designation && <p className="text-xs text-faint">{contact.designation}</p>}
              </div>
              {index === 0 && <span className="client-profile-soft-badge">Primary</span>}
            </div>
            <div className="mt-3 space-y-2">
              {phones.map((phone, phoneIndex) => (
                <div key={`phone-${phoneIndex}`} className="client-profile-contact-line">
                  <Phone className="h-3.5 w-3.5 text-faint" />
                  <span className="min-w-0 flex-1 truncate font-mono">{phone}</span>
                  <CopyButton
                    copied={copiedKey === `contact-phone-${contact._id}-${phoneIndex}`}
                    label={`${contact.name} phone`}
                    onClick={() => onCopy(phone, `contact-phone-${contact._id}-${phoneIndex}`, `${contact.name} phone`)}
                  />
                </div>
              ))}
              {emails.map((email, emailIndex) => (
                <div key={`email-${emailIndex}`} className="client-profile-contact-line">
                  <Mail className="h-3.5 w-3.5 text-faint" />
                  <span className="min-w-0 flex-1 truncate">{email}</span>
                  <CopyButton
                    copied={copiedKey === `contact-email-${contact._id}-${emailIndex}`}
                    label={`${contact.name} email`}
                    onClick={() => onCopy(email, `contact-email-${contact._id}-${emailIndex}`, `${contact.name} email`)}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ClientProfileHeader({
  client,
  legalName,
  selectedFy,
  financialYears,
  onFinancialYearChange,
  registrationStatus,
  validityLabel,
  billingStatus,
  progress,
  copiedKey,
  onCopyClientId,
  onBack,
  onEdit,
  primaryActions,
}: ClientProfileHeaderProps) {
  const [expandedHeaderHeight, setExpandedHeaderHeight] = useState(252);
  const [isMobileHeader, setIsMobileHeader] = useState<boolean | null>(null);
  const expandedHeaderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const syncBreakpoint = () => setIsMobileHeader(mediaQuery.matches);

    syncBreakpoint();
    mediaQuery.addEventListener("change", syncBreakpoint);
    return () => mediaQuery.removeEventListener("change", syncBreakpoint);
  }, []);

  useEffect(() => {
    const updateHeaderHeight = () => {
      const measuredHeight = expandedHeaderRef.current?.scrollHeight;
      if (measuredHeight) setExpandedHeaderHeight(Math.ceil(measuredHeight));
    };

    updateHeaderHeight();
    const frameId = requestAnimationFrame(updateHeaderHeight);
    const resizeObserver = new ResizeObserver(updateHeaderHeight);
    if (expandedHeaderRef.current) resizeObserver.observe(expandedHeaderRef.current);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, [client.companyName, financialYears.length, primaryActions.length]);

  const reducedMotion = useReducedMotion();
  const headerProgress = progress;
  const headerHeight = useTransform(headerProgress, [0, 1], [expandedHeaderHeight, 58]);
  const headerTopRadius = useTransform(headerProgress, [0, 1], [22, 0]);
  const headerBottomRadius = useTransform(headerProgress, [0, 1], [22, 14]);
  const headerMarginX = useTransform(headerProgress, [0, 1], [14, 0]);
  const headerY = useTransform(headerProgress, [0, 1], [0, -24]);
  const headerBottomMargin = useTransform(headerProgress, [0, 1], [18, -6]);
  const expandedOpacity = useTransform(headerProgress, [0, 0.42, 0.58], [1, 1, 0]);
  const expandedY = useTransform(headerProgress, [0, 1], [0, reducedMotion ? 0 : -8]);
  const compactOpacity = useTransform(headerProgress, [0.55, 0.68, 1], [0, 1, 1]);
  const compactY = useTransform(headerProgress, [0, 1], [reducedMotion ? 0 : 7, 0]);
  const expandedPointerEvents = useTransform(headerProgress, (value) => value < 0.56 ? "auto" : "none");
  const compactPointerEvents = useTransform(headerProgress, (value) => value > 0.62 ? "auto" : "none");

  const headerActions = primaryActions.slice(0, 2);

  return (
    <motion.header
      className="client-profile-header"
      aria-label={`${client.companyName} profile header`}
      style={{
        height: headerHeight,
        borderTopLeftRadius: headerTopRadius,
        borderTopRightRadius: headerTopRadius,
        borderBottomLeftRadius: headerBottomRadius,
        borderBottomRightRadius: headerBottomRadius,
        y: isMobileHeader === false ? headerY : undefined,
        marginBottom: isMobileHeader === false ? headerBottomMargin : undefined,
        marginLeft: headerMarginX,
        marginRight: headerMarginX,
      }}
    >
      <motion.div ref={expandedHeaderRef} className="client-profile-header-expanded" style={{ opacity: expandedOpacity, y: expandedY, pointerEvents: expandedPointerEvents }}>
        <div className="flex items-start justify-between gap-4">
          <button type="button" onClick={onBack} className="client-profile-icon-button" aria-label="Go back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="client-profile-id-chip">
                {client.clientId}
                <CopyButton
                  copied={copiedKey === "client-id"}
                  label="client ID"
                  onClick={onCopyClientId}
                  className="h-6 w-6 border-0 bg-transparent"
                />
              </span>
              <CategoryBadge category={client.category} />
              <span className="client-profile-soft-badge">{registrationStatus}</span>
            </div>
            <h1 className="client-profile-title">{client.companyName}</h1>
            {legalName && <p className="client-profile-legal-name">{legalName}</p>}
          </div>
          <button type="button" onClick={onEdit} className="client-profile-header-edit">
            <Pencil className="h-4 w-4" />
            <span>Edit Client</span>
          </button>
        </div>

        <div className="client-profile-header-meta">
          <span className="client-profile-fy-select-wrap">
            <Calendar className="h-3.5 w-3.5" />
            <select
              className="client-profile-fy-select"
              value={selectedFy}
              onChange={(event) => onFinancialYearChange(event.target.value)}
              aria-label="Financial year"
            >
              {financialYears.map((financialYear) => (
                <option key={financialYear} value={financialYear}>FY {financialYear}</option>
              ))}
            </select>
          </span>
          <span><Shield className="h-3.5 w-3.5" /> {billingStatus}</span>
          <span><FileText className="h-3.5 w-3.5" /> Valid until {validityLabel}</span>
        </div>

        <div className="client-profile-header-actions">
          {headerActions.map((action) => (
            <motion.button
              key={action.label}
              type="button"
              onClick={action.onClick}
              whileTap={reducedMotion ? undefined : { scale: 0.985, y: 1 }}
              transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
              className={`client-profile-quick-button ${actionToneClass(action.tone)}`}
            >
              <span className="client-profile-quick-icon">{action.icon}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{action.label}</span>
                {action.description && <span className="block truncate text-xs opacity-70">{action.description}</span>}
              </span>
            </motion.button>
          ))}
        </div>
      </motion.div>

      <motion.div className="client-profile-header-compact" style={{ opacity: compactOpacity, y: compactY, pointerEvents: compactPointerEvents }}>
        <button type="button" onClick={onBack} className="client-profile-icon-button" aria-label="Go back">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-default">{client.companyName}</p>
          <p className="truncate text-[11px] text-faint">
            {client.clientId} - FY {selectedFy} - {client.category}
          </p>
        </div>
        <button type="button" onClick={onEdit} className="client-profile-icon-button" aria-label="Edit client">
          <Pencil className="h-4 w-4" />
        </button>
      </motion.div>
    </motion.header>
  );
}

export function HealthDashboard({ metrics }: { metrics: ClientProfileMetric[] }) {
  const reducedMotion = useReducedMotion();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [responsiveReady, setResponsiveReady] = useState(false);
  const selectorRef = useRef<HTMLDivElement | null>(null);
  const selectorButtonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedMetric = metrics[Math.min(selectedIndex, Math.max(metrics.length - 1, 0))];
  const summaryMetrics = useMemo(() => (
    ["AR Progress", "Annual Return", "Outstanding"]
      .map((label) => metrics.find((metric) => metric.label === label))
      .filter(Boolean) as ClientProfileMetric[]
  ), [metrics]);

  useEffect(() => {
    if (selectedIndex > metrics.length - 1) {
      setSelectedIndex(Math.max(metrics.length - 1, 0));
    }
  }, [metrics.length, selectedIndex]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    let readyFrame = 0;

    const syncBreakpoint = () => {
      setResponsiveReady(false);
      setIsMobile(mediaQuery.matches);
      readyFrame = window.requestAnimationFrame(() => setResponsiveReady(true));
    };

    syncBreakpoint();
    mediaQuery.addEventListener("change", syncBreakpoint);

    return () => {
      mediaQuery.removeEventListener("change", syncBreakpoint);
      window.cancelAnimationFrame(readyFrame);
    };
  }, []);

  useEffect(() => {
    if (!isMobile || collapsed) return;

    const selector = selectorRef.current;
    const selectedButton = selectorButtonsRef.current[selectedIndex];
    if (!selector || !selectedButton) return;

    const targetLeft = Math.max(
      0,
      Math.min(
        selector.scrollWidth - selector.clientWidth,
        selectedButton.offsetLeft + selectedButton.offsetWidth / 2 - selector.clientWidth / 2,
      ),
    );

    if (reducedMotion) {
      selector.scrollLeft = targetLeft;
      return;
    }

    const scrollAnimation = animateValue(selector.scrollLeft, targetLeft, {
      duration: 0.48,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        selector.scrollLeft = latest;
      },
    });

    return () => scrollAnimation.stop();
  }, [collapsed, isMobile, reducedMotion, selectedIndex]);

  if (!metrics.length || !selectedMetric) return null;

  const selectMetric = (index: number) => {
    if (index === selectedIndex) return;
    setDirection(index > selectedIndex ? 1 : -1);
    setSelectedIndex(index);
  };

  const slideVariants = {
    enter: (customDirection: number) => ({
      opacity: 0,
      y: reducedMotion ? 0 : customDirection > 0 ? (isMobile ? 10 : 18) : (isMobile ? -10 : -18),
    }),
    center: { opacity: 1, y: 0 },
    exit: (customDirection: number) => ({
      opacity: 0,
      y: reducedMotion ? 0 : customDirection > 0 ? (isMobile ? -10 : -18) : (isMobile ? 10 : 18),
    }),
  };

  return (
    <motion.section
      aria-label="Client health summary"
      className="client-profile-health-panel"
      initial={reducedMotion ? false : "hidden"}
      animate="visible"
      layout
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.03 } },
      }}
    >
      <div className="client-profile-health-panel-header">
        <div>
          <p className="client-profile-kicker">Health Summary</p>
          <h2>Client health at a glance</h2>
        </div>
        <button
          type="button"
          className="client-profile-health-collapse"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand health summary" : "Collapse health summary"}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <AnimatePresence initial={false} mode="wait">
        {collapsed ? (
          <motion.div
            key="collapsed"
            className="client-profile-health-collapsed"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            {summaryMetrics.map((metric) => (
              <button key={metric.label} type="button" onClick={metric.onClick || (() => selectMetric(metrics.indexOf(metric)))} disabled={!metric.onClick}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </button>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="expanded"
            className="client-profile-health-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            <div ref={selectorRef} className="client-profile-health-selector" role="tablist" aria-label="Health metrics">
              {metrics.map((metric, index) => {
                const active = index === selectedIndex;

                return (
                  <motion.button
                    key={metric.label}
                    ref={(element) => {
                      selectorButtonsRef.current[index] = element;
                    }}
                    type="button"
                    role="tab"
                    layout="position"
                    aria-selected={active}
                    aria-controls="client-profile-health-detail"
                    data-active={active}
                    onClick={() => selectMetric(index)}
                    animate={{
                      opacity: active ? 1 : isMobile ? 0.48 : 0.5,
                      fontSize: active ? (isMobile ? 25 : 30) : (isMobile ? 14 : 15),
                      lineHeight: active ? 1.04 : 1.15,
                    }}
                    transition={{
                      duration: reducedMotion || !responsiveReady ? 0 : isMobile ? 0.48 : 0.42,
                      ease: isMobile ? [0.16, 1, 0.3, 1] : [0.16, 1, 0.3, 1],
                      layout: {
                        duration: reducedMotion || !responsiveReady ? 0 : 0.42,
                        ease: [0.16, 1, 0.3, 1],
                      },
                    }}
                  >
                    <span>{metric.label}</span>
                  </motion.button>
                );
              })}
            </div>

            <div className="client-profile-health-detail" id="client-profile-health-detail" role="tabpanel">
              <AnimatePresence custom={direction} mode="wait" initial={false}>
                <motion.div
                  key={selectedMetric.label}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    duration: reducedMotion ? 0 : isMobile ? 0.38 : 0.26,
                    ease: isMobile ? [0.16, 1, 0.3, 1] : [0.22, 1, 0.36, 1],
                  }}
                  className="client-profile-health-detail-inner"
                >
                  <div className="client-profile-health-detail-top">
                    <div className={`client-profile-health-detail-icon ${toneClass(selectedMetric.tone)}`}>{selectedMetric.icon}</div>
                    <div className="min-w-0">
                      <p>{selectedMetric.label}</p>
                      <h3>{selectedMetric.value}</h3>
                      <span>{selectedMetric.sub}</span>
                    </div>
                  </div>

                  {typeof selectedMetric.progress === "number" && (
                    <div className="client-profile-health-progress" aria-label={`${selectedMetric.label} progress`}>
                      <div className="client-profile-health-progress-row">
                        <span>Progress</span>
                        <strong>{Math.round(Math.max(0, Math.min(1, selectedMetric.progress)) * 100)}%</strong>
                      </div>
                      <div className="client-profile-health-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.max(0, Math.min(1, selectedMetric.progress)) * 100)}>
                        <motion.div
                          className="client-profile-health-progress-fill"
                          initial={false}
                          animate={{ width: `${Math.round(Math.max(0, Math.min(1, selectedMetric.progress)) * 100)}%` }}
                          transition={{ duration: reducedMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                    </div>
                  )}

                  {selectedMetric.detailRows && selectedMetric.detailRows.length > 0 && (
                    <div className="client-profile-health-detail-rows">
                      {selectedMetric.detailRows.map((row) => (
                        <div key={`${selectedMetric.label}-${row.label}`}>
                          <span>{row.label}</span>
                          <strong>{row.value}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedMetric.milestones && selectedMetric.milestones.length > 0 && (
                    <div className="client-profile-health-milestones">
                      {selectedMetric.milestones.map((milestone) => (
                        <div key={`${selectedMetric.label}-${milestone.label}`} data-state={milestone.state || "pending"}>
                          <span>{milestone.label}</span>
                          <strong>{milestone.value}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedMetric.onClick && selectedMetric.actionLabel && (
                    <button type="button" className="client-profile-health-action" onClick={selectedMetric.onClick}>
                      {selectedMetric.actionLabel}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

export function QuickActions({ actions }: { actions: ClientProfileQuickAction[] }) {
  return (
    <section className="client-profile-section">
      <div className="client-profile-section-heading">
        <div>
          <h2>Quick Actions</h2>
        </div>
      </div>
      <div className="client-profile-action-grid">
        {actions.map((action) => (
          <motion.button
            key={action.label}
            type="button"
            onClick={action.onClick}
            whileTap={{ scale: 0.98 }}
            className={`client-profile-action-card ${actionToneClass(action.tone)}`}
          >
            <span className="client-profile-action-icon">{action.icon}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{action.label}</span>
              {action.description && <span className="block truncate text-xs opacity-70">{action.description}</span>}
            </span>
          </motion.button>
        ))}
      </div>
    </section>
  );
}

export function CompanyOverview({
  client,
  isPWP,
  legalName,
  customFields,
  hiddenCustomCount,
  showAllCustomFields,
  onToggleCustomFields,
  primaryContact,
  contactName,
  contactDesig,
  contactMobile,
  contactEmail,
  copiedKey,
  onCopy,
  onEdit,
  onEditPortal,
  contactsOpen,
  portalOpen,
  onToggleContacts,
  onTogglePortal,
  showPassword,
  onTogglePassword,
  portalLastUpdated,
  passwordMask,
}: CompanyOverviewProps) {
  const beforeContact = customFields.filter((field) => field.position === "beforeContact");
  const afterContact = customFields.filter((field) => field.position === "afterContact");
  const afterCompany = customFields.filter((field) => field.position === "afterCompany");
  const contacts = client.contacts || [];
  const hasPortalDetails = Boolean(client.cpcbLoginId || client.cpcbPassword || client.otpMobileNumber);

  const renderCustomFields = (fields: ClientProfileCustomField[]) => fields.map((field) => (
    <ProfileFieldRow
      key={field.id}
      icon={field.icon}
      label={field.label}
      value={field.value}
      mono={field.mono}
    />
  ));

  return (
    <section className="client-profile-card client-profile-overview-card">
      <div className="client-profile-card-header">
        <div>
          <p className="client-profile-kicker">Company Overview</p>
          <h2>{client.companyName}</h2>
        </div>
        <button type="button" onClick={onEdit} className="client-profile-secondary-button">
          <Pencil className="h-4 w-4" />
          <span>Edit</span>
        </button>
      </div>

      <div className="client-profile-overview-grid">
        <div className="client-profile-overview-pane">
          <div className="client-profile-avatar">{getInitials(client.companyName)}</div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-default">{client.companyName}</p>
            <p className="truncate text-sm text-faint">{legalName || client.category}</p>
          </div>
        </div>

        <div className="client-profile-field-grid">
          {legalName && <ProfileFieldRow icon={<FileText className="h-4 w-4" />} label="Legal Name" value={legalName} />}
          {renderCustomFields(beforeContact)}
          <ProfileFieldRow icon={<User className="h-4 w-4" />} label="Primary Contact" value={contactName} sub={contactDesig} />
          <ProfileFieldRow
            icon={<Phone className="h-4 w-4" />}
            label="Mobile"
            value={contactMobile}
            mono
            copy={contactMobile !== "-" ? (
              <CopyButton
                copied={copiedKey === "primary-phone"}
                label="primary contact mobile"
                onClick={() => onCopy(contactMobile, "primary-phone", "Primary contact mobile")}
              />
            ) : null}
          />
          <ProfileFieldRow
            icon={<Mail className="h-4 w-4" />}
            label="Email"
            value={contactEmail}
            mono
            copy={contactEmail !== "-" ? (
              <CopyButton
                copied={copiedKey === "primary-email"}
                label="primary contact email"
                onClick={() => onCopy(contactEmail, "primary-email", "Primary contact email")}
              />
            ) : null}
          />
          {renderCustomFields(afterContact)}
          <ProfileFieldRow icon={<MapPin className="h-4 w-4" />} label="State" value={client.state} />
          {client.address && <ProfileFieldRow icon={<MapPin className="h-4 w-4" />} label="Address" value={client.address} />}
          {client.gstNumber && (
            <ProfileFieldRow
              icon={<FileText className="h-4 w-4" />}
              label="GST Number"
              value={client.gstNumber}
              mono
              copy={(
                <CopyButton
                  copied={copiedKey === "gst"}
                  label="GST number"
                  onClick={() => onCopy(client.gstNumber || "", "gst", "GST number")}
                />
              )}
            />
          )}
          {!isPWP && client.registrationNumber && (
            <ProfileFieldRow
              icon={<Shield className="h-4 w-4" />}
              label="Registration No."
              value={client.registrationNumber}
              mono
              copy={(
                <CopyButton
                  copied={copiedKey === "registration-number"}
                  label="registration number"
                  onClick={() => onCopy(client.registrationNumber || "", "registration-number", "Registration number")}
                />
              )}
            />
          )}
          {renderCustomFields(afterCompany)}
        </div>
      </div>

      {(hiddenCustomCount > 0 || showAllCustomFields) && customFields.length > 0 && (
        <button type="button" onClick={onToggleCustomFields} className="client-profile-link-button">
          {showAllCustomFields ? "Show less information" : `Show ${hiddenCustomCount} more detail${hiddenCustomCount === 1 ? "" : "s"}`}
        </button>
      )}

      {contacts.length > 0 && (
        <div className="client-profile-subsection">
          <CollapsibleHeader
            title={`Contacts (${contacts.length})`}
            subtitle={primaryContact ? `Primary: ${primaryContact.name}` : undefined}
            open={contactsOpen}
            onToggle={onToggleContacts}
          />
          <AnimatePresence initial={false}>
            {contactsOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <ContactList contacts={contacts} copiedKey={copiedKey} onCopy={onCopy} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="client-profile-subsection">
        <CollapsibleHeader
          title="Portal Access"
          subtitle={portalLastUpdated ? `Updated ${formatDateTime(portalLastUpdated)}` : "CPCB login details"}
          open={portalOpen}
          onToggle={onTogglePortal}
          trailing={(
            <button type="button" onClick={onEditPortal} className="client-profile-small-button">
              <Pencil className="h-3.5 w-3.5" />
              <span>Edit</span>
            </button>
          )}
        />
        <AnimatePresence initial={false}>
          {portalOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="client-profile-portal-grid">
                {!hasPortalDetails ? (
                  <div className="client-profile-empty-inline">
                    <Shield className="h-4 w-4" />
                    <p>No portal credentials saved.</p>
                    <button type="button" onClick={onEditPortal}>Add credentials</button>
                  </div>
                ) : (
                  <>
                    {client.cpcbLoginId && (
                      <ProfileFieldRow
                        icon={<User className="h-4 w-4" />}
                        label="CPCB Login ID"
                        value={client.cpcbLoginId}
                        mono
                        copy={(
                          <CopyButton
                            copied={copiedKey === "portal-login"}
                            label="CPCB login ID"
                            onClick={() => onCopy(client.cpcbLoginId || "", "portal-login", "CPCB login ID")}
                          />
                        )}
                      />
                    )}
                    {client.cpcbPassword && (
                      <ProfileFieldRow
                        icon={<Lock className="h-4 w-4" />}
                        label="CPCB Password"
                        value={showPassword ? client.cpcbPassword : passwordMask}
                        mono
                        copy={(
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={onTogglePassword} className="client-profile-small-button">
                              {showPassword ? "Hide" : "Show"}
                            </button>
                            <CopyButton
                              copied={copiedKey === "portal-password"}
                              label="portal password"
                              onClick={() => onCopy(client.cpcbPassword || "", "portal-password", "Portal password")}
                            />
                          </div>
                        )}
                      />
                    )}
                    {client.otpMobileNumber && (
                      <ProfileFieldRow
                        icon={<Smartphone className="h-4 w-4" />}
                        label="OTP Mobile"
                        value={client.otpMobileNumber}
                        mono
                        copy={(
                          <CopyButton
                            copied={copiedKey === "portal-otp-mobile"}
                            label="OTP mobile"
                            onClick={() => onCopy(client.otpMobileNumber || "", "portal-otp-mobile", "OTP mobile")}
                          />
                        )}
                      />
                    )}
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="client-profile-card-footer">
        <span>Added {formatDate(client.createdAt)}</span>
        <span>Last updated {formatDateTime(client.updatedAt || client.createdAt)}</span>
      </div>
    </section>
  );
}

export function DocumentsSection({
  documents,
  open,
  busyAction,
  hasLinkedContacts,
  onToggle,
  onAdd,
  onEdit,
  onDelete,
  onLinkContact,
}: DocumentsSectionProps) {
  const [search, setSearch] = useState("");
  const filteredDocuments = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return documents;
    return documents.filter((document) => document.documentName.toLowerCase().includes(query));
  }, [documents, search]);

  return (
    <section className="client-profile-card">
      <div className="client-profile-card-header">
        <div>
          <p className="client-profile-kicker">Documents</p>
          <h2>{documents.length} linked document{documents.length === 1 ? "" : "s"}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onAdd} className="client-profile-primary-button">
            <Plus className="h-4 w-4" />
            <span>Add</span>
          </button>
          <button type="button" onClick={onToggle} className="client-profile-icon-button" aria-label={open ? "Collapse documents" : "Expand documents"}>
            <motion.span animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.16 }}>
              <ChevronDown className="h-4 w-4" />
            </motion.span>
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {documents.length > 3 && (
              <div className="client-profile-search">
                <Search className="h-4 w-4" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search documents"
                />
              </div>
            )}

            {documents.length === 0 ? (
              <div className="client-profile-document-empty">
                <span className="client-profile-empty-icon">
                  <FileText className="h-5 w-5" />
                </span>
                <p className="font-semibold text-default">No documents yet</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button type="button" className="client-profile-primary-button" onClick={onAdd}>
                    <Plus className="h-4 w-4" />
                    <span>Add Document</span>
                  </button>
                  {!hasLinkedContacts && (
                    <button type="button" className="client-profile-secondary-button" onClick={onLinkContact}>
                      <User className="h-4 w-4" />
                      <span>Link Contact</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="client-profile-document-grid">
                {filteredDocuments.map((document) => (
                  <article key={document._id} className="client-profile-document-card">
                    <div className="client-profile-document-preview">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-default">{document.documentName}</p>
                      <p className="text-xs text-faint">{formatDate(document.uploadedDate)}</p>
                    </div>
                    <div className="client-profile-document-actions">
                      <a
                        href={document.driveLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="client-profile-icon-button"
                        aria-label={`Open ${document.documentName}`}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <button type="button" onClick={() => onEdit(document)} className="client-profile-icon-button" aria-label={`Edit ${document.documentName}`}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={busyAction === `document-${document._id}`}
                        onClick={() => onDelete(document._id)}
                        className="client-profile-icon-button client-profile-danger-icon"
                        aria-label={`Delete ${document.documentName}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </article>
                ))}
                {filteredDocuments.length === 0 && (
                  <p className="col-span-full py-6 text-center text-sm text-faint">No documents match this search.</p>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export function NotesSection({ notes, updatedAt, onEditBilling }: NotesSectionProps) {
  return (
    <section className="client-profile-card client-profile-notes-card">
      <div className="client-profile-card-header">
        <div>
          <p className="client-profile-kicker">Support</p>
          <h2>Internal Notes</h2>
        </div>
        <button type="button" onClick={onEditBilling} className="client-profile-secondary-button">
          <Pencil className="h-4 w-4" />
          <span>Edit Billing Notes</span>
        </button>
      </div>
      {notes ? (
        <div className="client-profile-note-body">
          <StickyNote className="mt-0.5 h-4 w-4 text-faint" />
          <p>{notes}</p>
        </div>
      ) : (
        <div className="client-profile-empty-inline">
          <StickyNote className="h-4 w-4" />
          <p>No internal billing notes for this financial year.</p>
        </div>
      )}
      {updatedAt && <p className="mt-4 text-xs text-faint">Last profile update {formatDateTime(updatedAt)}</p>}
    </section>
  );
}

export function FloatingActionBar({ actions }: { actions: ClientProfileQuickAction[] }) {
  const compactActions = actions.slice(0, 3);
  if (compactActions.length === 0) return null;

  return (
    <div className="client-profile-floating-actions" aria-label="Quick actions">
      {compactActions.map((action) => (
        <button key={action.label} type="button" onClick={action.onClick} className={actionToneClass(action.tone)}>
          {action.icon}
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}

export function EmptyProfileState({ selectedFy, isPWP, actions }: EmptyProfileStateProps) {
  return (
    <section className="client-profile-card client-profile-empty-state">
      <span className="client-profile-empty-icon">
        <Calendar className="h-5 w-5" />
      </span>
      <p className="font-semibold text-default">No data for FY {selectedFy}</p>
      <p className="text-sm text-muted">
        {isPWP
          ? "Start with credits or billing for this client."
          : "Start with FY data or billing for this client."}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {actions.map((action) => (
          <button
            key={`empty-${action.label}`}
            type="button"
            onClick={action.onClick}
            className={`client-profile-action-card ${actionToneClass(action.tone)}`}
          >
            <span className="client-profile-action-icon">{action.icon}</span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

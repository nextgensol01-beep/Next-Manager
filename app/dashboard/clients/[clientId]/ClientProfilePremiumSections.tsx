"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  animate as animateValue,
  motion,
  useReducedMotion,
  useTransform,
  type MotionValue,
  type PanInfo,
} from "framer-motion";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Lock,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Smartphone,
  StickyNote,
  Target,
  Trash2,
  UploadCloud,
  User,
} from "lucide-react";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { FINANCIAL_YEARS, formatDate } from "@/lib/utils";
import {
  CopyButton,
  formatDateTime,
  getContactEmails,
  getContactPhones,
  type Client,
  type ClientNote,
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
  type?: string;
  profileDisplay: "inline" | "subsection" | "card";
  profileCluster: "company" | "contact" | "compliance" | "additional";
  groupId?: string;
};

export type ClientProfileCustomFieldGroup = {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  profileDisplay: "subsection" | "card";
  profileCluster: "company" | "contact" | "compliance" | "additional";
  collapsible?: boolean;
  defaultExpanded?: boolean;
};

type MobileTitleFit = {
  fontSize: number;
  lines: 1 | 2 | 3;
};

const MOBILE_TITLE_FIT_OPTIONS: ReadonlyArray<MobileTitleFit> = [
  ...[22, 21, 20, 19, 18].map((fontSize) => ({ fontSize, lines: 1 as const })),
  ...[20, 19, 18, 17].map((fontSize) => ({ fontSize, lines: 2 as const })),
  ...[18, 17, 16].map((fontSize) => ({ fontSize, lines: 3 as const })),
];

function AdaptiveMobileClientTitle({ children }: { children: string }) {
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const [fit, setFit] = useState<MobileTitleFit | null>(null);

  useLayoutEffect(() => {
    const title = titleRef.current;
    if (!title) return;

    const mobileQuery = window.matchMedia("(max-width: 767px)");

    const measure = () => {
      if (!mobileQuery.matches) {
        setFit(null);
        return;
      }

      const availableWidth = title.clientWidth;
      if (!availableWidth) return;

      const computed = window.getComputedStyle(title);
      const probe = title.cloneNode(true) as HTMLHeadingElement;
      probe.removeAttribute("data-fit-ready");
      probe.style.position = "fixed";
      probe.style.inset = "0 auto auto -10000px";
      probe.style.display = "block";
      probe.style.width = `${availableWidth}px`;
      probe.style.height = "auto";
      probe.style.margin = "0";
      probe.style.padding = "0";
      probe.style.visibility = "hidden";
      probe.style.pointerEvents = "none";
      probe.style.overflow = "visible";
      probe.style.fontFamily = computed.fontFamily;
      probe.style.fontWeight = computed.fontWeight;
      probe.style.letterSpacing = computed.letterSpacing;
      probe.style.textAlign = "center";
      probe.style.webkitLineClamp = "unset";
      probe.style.webkitBoxOrient = "unset";
      document.body.appendChild(probe);

      let nextFit = MOBILE_TITLE_FIT_OPTIONS[MOBILE_TITLE_FIT_OPTIONS.length - 1];

      for (const option of MOBILE_TITLE_FIT_OPTIONS) {
        const lineHeight = option.fontSize * (option.lines === 1 ? 1.08 : 1.12);
        probe.style.fontSize = `${option.fontSize}px`;
        probe.style.lineHeight = `${lineHeight}px`;
        probe.style.whiteSpace = option.lines === 1 ? "nowrap" : "normal";

        const fits = option.lines === 1
          ? probe.scrollWidth <= availableWidth + 0.5
          : probe.scrollHeight <= (lineHeight * option.lines) + 1;

        if (fits) {
          nextFit = option;
          break;
        }
      }

      probe.remove();
      setFit((current) => (
        current?.fontSize === nextFit.fontSize && current.lines === nextFit.lines
          ? current
          : nextFit
      ));
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(title);
    mobileQuery.addEventListener("change", measure);

    return () => {
      resizeObserver.disconnect();
      mobileQuery.removeEventListener("change", measure);
    };
  }, [children]);

  return (
    <h1
      ref={titleRef}
      className="client-profile-title"
      data-fit-ready={fit ? "true" : undefined}
      data-lines={fit?.lines}
      style={fit ? { "--mobile-title-size": `${fit.fontSize}px` } as React.CSSProperties : undefined}
      title={children}
    >
      {children}
    </h1>
  );
}

function ClientHeaderActionSheet({
  selectedFy,
  financialYears,
  onFinancialYearChange,
  onEdit,
  onClose,
}: {
  selectedFy: string;
  financialYears: string[];
  onFinancialYearChange: (financialYear: string) => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <motion.div
      id="client-profile-mobile-header-menu"
      className="client-profile-action-sheet-root"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.24 }}
      role="dialog"
      aria-modal="true"
      aria-label="Client actions"
    >
      <button
        type="button"
        className="client-profile-action-sheet-backdrop"
        onClick={onClose}
        aria-label="Close client actions"
      />
      <motion.div
        className="client-profile-action-sheet"
        initial={reducedMotion ? false : { y: "110%", scale: 0.96 }}
        animate={{ y: 0, scale: 1 }}
        exit={reducedMotion ? { opacity: 0 } : { y: "110%", scale: 0.97 }}
        transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38, mass: 0.9 }}
      >
        <div className="client-profile-action-sheet-card">
          <label className="client-profile-action-sheet-row">
            <span><Calendar className="h-[19px] w-[19px]" /> Financial year</span>
            <span className="client-profile-action-sheet-select">
              <select
                value={selectedFy}
                onChange={(event) => {
                  onFinancialYearChange(event.target.value);
                  onClose();
                }}
                aria-label="Financial year"
              >
                {financialYears.map((financialYear) => (
                  <option key={financialYear} value={financialYear}>FY {financialYear}</option>
                ))}
              </select>
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </span>
          </label>
          <button
            type="button"
            className="client-profile-action-sheet-row"
            onClick={() => {
              onClose();
              onEdit();
            }}
          >
            <span><Pencil className="h-[19px] w-[19px]" /> Edit client</span>
          </button>
        </div>

        <button type="button" className="client-profile-action-sheet-cancel" onClick={onClose}>
          Cancel
        </button>
      </motion.div>
    </motion.div>,
    document.body
  );
}

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
  customFieldGroups: ClientProfileCustomFieldGroup[];
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
  showRequirementSummary: boolean;
  open: boolean;
  busyAction: string | null;
  hasLinkedContacts: boolean;
  canManageDocuments: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onUpload: () => void;
  onEdit: (document: Document) => void;
  onDelete: (document: Document) => void;
  onMigrate: (document: Document) => void;
  onLinkContact: () => void;
  selectedFy: string;
  hasEprCertificate: boolean;
  targetDataAdded: boolean;
  hasTargetScreenshot: boolean;
  onUploadTargetScreenshot: () => void;
};

type NotesSectionProps = {
  notes: ClientNote[];
  onAdd: () => void;
  onDelete: (note: ClientNote) => void;
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
  icon,
  open,
  onToggle,
  trailing,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
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
        {icon && <span className="client-profile-field-icon">{icon}</span>}
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
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  sub?: string;
  mono?: boolean;
  copy?: React.ReactNode;
  href?: string;
}) {
  return (
    <div className="client-profile-field-row">
      <div className="client-profile-field-icon">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="client-profile-field-label">{label}</p>
        {href ? (
          <a className={`client-profile-field-value inline-flex items-center gap-1 hover:underline ${mono ? "font-mono" : ""}`} href={href} target="_blank" rel="noreferrer">
            {value || "-"}<ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <p className={`client-profile-field-value ${mono ? "font-mono" : ""}`}>{value || "-"}</p>
        )}
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
    <div className="client-profile-contact-list">
      {contacts.map((contact, index) => {
        const phones = getContactPhones(contact);
        const emails = getContactEmails(contact);
        const primaryPhone = phones[0];
        const primaryEmail = emails[0];

        return (
          <div key={contact._id} className="client-profile-contact-card">
            <div className="client-profile-contact-person">
              <div className="client-profile-contact-avatar" aria-hidden="true">{getInitials(contact.name)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-[15px] font-semibold text-default">{contact.name}</p>
                  {index === 0 && <span className="client-profile-contact-primary">Primary</span>}
                </div>
                <p className="truncate text-xs text-faint">{contact.designation || "Contact"}</p>
              </div>
              <div className="client-profile-contact-actions">
                {primaryPhone && (
                  <a href={`tel:${primaryPhone.replace(/[^\d+]/g, "")}`} aria-label={`Call ${contact.name}`} title={`Call ${contact.name}`}>
                    <Phone className="h-4 w-4" />
                  </a>
                )}
                {primaryEmail && (
                  <a href={`mailto:${primaryEmail}`} aria-label={`Email ${contact.name}`} title={`Email ${contact.name}`}>
                    <Mail className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>

            {(phones.length > 0 || emails.length > 0) && (
              <div className="client-profile-contact-details">
              {phones.map((phone, phoneIndex) => (
                <div key={`phone-${phoneIndex}`} className="client-profile-contact-line">
                  <span>mobile</span>
                  <span className="min-w-0 flex-1 truncate font-mono">{phone}</span>
                  <CopyButton
                    copied={copiedKey === `contact-phone-${contact._id}-${phoneIndex}`}
                    label={`${contact.name} phone`}
                    onClick={() => onCopy(phone, `contact-phone-${contact._id}-${phoneIndex}`, `${contact.name} phone`)}
                    className="client-profile-contact-copy"
                  />
                </div>
              ))}
              {emails.map((email, emailIndex) => (
                <div key={`email-${emailIndex}`} className="client-profile-contact-line">
                  <span>email</span>
                  <span className="min-w-0 flex-1 truncate">{email}</span>
                  <CopyButton
                    copied={copiedKey === `contact-email-${contact._id}-${emailIndex}`}
                    label={`${contact.name} email`}
                    onClick={() => onCopy(email, `contact-email-${contact._id}-${emailIndex}`, `${contact.name} email`)}
                    className="client-profile-contact-copy"
                  />
                </div>
              ))}
              </div>
            )}
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const expandedHeaderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const syncBreakpoint = () => setIsMobileHeader(mediaQuery.matches);

    syncBreakpoint();
    mediaQuery.addEventListener("change", syncBreakpoint);
    return () => mediaQuery.removeEventListener("change", syncBreakpoint);
  }, []);

  useEffect(() => {
    if (isMobileHeader === false) setMobileMenuOpen(false);
  }, [isMobileHeader]);

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
                  className="client-profile-header-copy h-6 w-6 border-0 bg-transparent"
                />
              </span>
              <CategoryBadge category={client.category} />
              <span className="client-profile-soft-badge">{registrationStatus}</span>
            </div>
            <AdaptiveMobileClientTitle>{client.companyName}</AdaptiveMobileClientTitle>
            {legalName && <p className="client-profile-legal-name">{legalName}</p>}
          </div>
          {isMobileHeader ? (
            <button
              type="button"
              onClick={() => setMobileMenuOpen((isOpen) => !isOpen)}
              className="client-profile-header-edit"
              aria-label="More client actions"
              aria-expanded={mobileMenuOpen}
              aria-controls="client-profile-mobile-header-menu"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          ) : (
            <button type="button" onClick={onEdit} className="client-profile-header-edit">
              <Pencil className="h-4 w-4" />
              <span>Edit Client</span>
            </button>
          )}
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

      <AnimatePresence>
        {isMobileHeader && mobileMenuOpen && (
          <ClientHeaderActionSheet
            selectedFy={selectedFy}
            financialYears={financialYears}
            onFinancialYearChange={onFinancialYearChange}
            onEdit={onEdit}
            onClose={() => setMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

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
  const [detailHeight, setDetailHeight] = useState<number | null>(null);
  const [detailHeightReady, setDetailHeightReady] = useState(false);
  const selectorRef = useRef<HTMLDivElement | null>(null);
  const selectorButtonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const detailContentRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (isMobile) {
      setDetailHeight(null);
      setDetailHeightReady(false);
      return;
    }

    const detailContent = detailContentRef.current;
    if (!detailContent) return;

    let readyFrame = 0;
    const updateDetailHeight = () => {
      const nextHeight = Math.max(232, Math.ceil(detailContent.scrollHeight));
      setDetailHeight((currentHeight) => currentHeight === nextHeight ? currentHeight : nextHeight);

      if (!detailHeightReady && !readyFrame) {
        readyFrame = window.requestAnimationFrame(() => setDetailHeightReady(true));
      }
    };

    updateDetailHeight();
    const resizeObserver = new ResizeObserver(updateDetailHeight);
    resizeObserver.observe(detailContent);

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(readyFrame);
    };
  }, [detailHeightReady, isMobile, selectedMetric.label]);

  if (!metrics.length || !selectedMetric) return null;

  const selectMetric = (index: number) => {
    if (index === selectedIndex) return;
    setDirection(index > selectedIndex ? 1 : -1);
    setSelectedIndex(index);
  };

  const handleMetricSwipe = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (!isMobile) return;

    const passedDistanceThreshold = Math.abs(info.offset.x) >= 46;
    const passedVelocityThreshold = Math.abs(info.velocity.x) >= 420;
    if (!passedDistanceThreshold && !passedVelocityThreshold) return;

    const nextIndex = info.offset.x < 0 || info.velocity.x < -420
      ? selectedIndex + 1
      : selectedIndex - 1;

    if (nextIndex < 0 || nextIndex >= metrics.length) return;
    selectMetric(nextIndex);
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
              <motion.div
                className="client-profile-health-detail-height"
                initial={false}
                animate={{
                  height: isMobile || detailHeight === null ? "auto" : detailHeight,
                }}
                transition={{
                  duration: reducedMotion || isMobile || !detailHeightReady ? 0 : 0.42,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
              <AnimatePresence custom={direction} mode={isMobile ? "wait" : "popLayout"} initial={false}>
                <motion.div
                  ref={detailContentRef}
                  key={selectedMetric.label}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  drag={isMobile ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.07}
                  dragMomentum={false}
                  onDragEnd={handleMetricSwipe}
                  whileDrag={reducedMotion ? undefined : { scale: 0.995 }}
                  style={{ touchAction: isMobile ? "pan-y" : "auto" }}
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
              </motion.div>
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
  customFieldGroups,
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
  const [revealedCustomFields, setRevealedCustomFields] = useState<Set<string>>(() => new Set());
  const [openCustomGroups, setOpenCustomGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(customFieldGroups.map((group) => [group.id, group.defaultExpanded !== false]))
  );
  const inlineFields = customFields.filter((field) => field.profileDisplay === "inline" && !field.groupId);
  const companyFields = inlineFields.filter((field) => field.profileCluster === "company");
  const contactFields = inlineFields.filter((field) => field.profileCluster === "contact");
  const complianceFields = inlineFields.filter((field) => field.profileCluster === "compliance");
  const additionalFields = inlineFields.filter((field) => field.profileCluster === "additional");
  const subsectionGroups = customFieldGroups.filter((group) =>
    group.profileDisplay === "subsection" && customFields.some((field) => field.groupId === group.id)
  );
  const cardGroups = customFieldGroups.filter((group) =>
    group.profileDisplay === "card" && customFields.some((field) => field.groupId === group.id)
  );
  const standaloneSubsectionFields = customFields.filter((field) => !field.groupId && field.profileDisplay === "subsection");
  const standaloneCardFields = customFields.filter((field) => !field.groupId && field.profileDisplay === "card");
  const subsectionGroupsAt = (cluster: ClientProfileCustomFieldGroup["profileCluster"]) => subsectionGroups.filter((group) => group.profileCluster === cluster);
  const contacts = client.contacts || [];
  const hasPortalDetails = Boolean(client.cpcbLoginId || client.cpcbPassword || client.otpMobileNumber);

  const renderCustomFields = (fields: ClientProfileCustomField[]) => fields.map((field) => (
    <ProfileFieldRow
      key={field.id}
      icon={field.icon}
      label={field.label}
      value={field.type === "password" && field.value && !revealedCustomFields.has(field.id) ? "••••••••" : field.value}
      mono={field.mono}
      href={field.type === "url" ? field.value : undefined}
      copy={field.value ? (
        <div className="flex items-center gap-1">
          {field.type === "password" && (
            <button
              type="button"
              onClick={() => setRevealedCustomFields((current) => {
                const next = new Set(current);
                if (next.has(field.id)) next.delete(field.id);
                else next.add(field.id);
                return next;
              })}
              className="client-profile-small-button"
            >
              {revealedCustomFields.has(field.id) ? "Hide" : "Show"}
            </button>
          )}
          <CopyButton
            copied={copiedKey === `custom-${field.id}`}
            label={field.label}
            onClick={() => onCopy(field.value, `custom-${field.id}`, field.label)}
          />
        </div>
      ) : null}
    />
  ));

  const renderCustomGroup = (group: ClientProfileCustomFieldGroup, asCard = false) => {
    const fields = customFields.filter((field) => field.groupId === group.id);
    if (fields.length === 0) return null;
    const open = group.collapsible === false ? true : (openCustomGroups[group.id] ?? group.defaultExpanded !== false);
    const content = (
      <div className={`client-profile-field-grid ${asCard ? "" : "client-profile-custom-group-fields"}`}>
        {renderCustomFields(fields)}
      </div>
    );
    if (asCard) {
      return (
        <section key={group.id} className="client-profile-card">
          <div className="client-profile-card-header">
            <div className="flex min-w-0 items-center gap-3">
              {group.icon && <span className="client-profile-field-icon">{group.icon}</span>}
              <div className="min-w-0"><p className="client-profile-kicker">Custom section</p><h2>{group.label}</h2>{group.description && <p className="text-xs text-faint">{group.description}</p>}</div>
            </div>
            {group.collapsible !== false && (
              <button type="button" onClick={() => setOpenCustomGroups((current) => ({ ...current, [group.id]: !open }))} className="client-profile-small-button" aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${group.label}`}>
                <motion.span animate={{ rotate: open ? 0 : -90 }}><ChevronDown className="h-4 w-4" /></motion.span>
              </button>
            )}
          </div>
          <AnimatePresence initial={false}>{open && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">{content}</motion.div>}</AnimatePresence>
        </section>
      );
    }
    return (
      <div key={group.id} className="client-profile-subsection">
        <CollapsibleHeader icon={group.icon} title={group.label} subtitle={group.description} open={open} onToggle={() => group.collapsible !== false && setOpenCustomGroups((current) => ({ ...current, [group.id]: !open }))} />
        <AnimatePresence initial={false}>{open && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">{content}</motion.div>}</AnimatePresence>
      </div>
    );
  };
  const renderStandaloneSubsections = (cluster: ClientProfileCustomField["profileCluster"]) => standaloneSubsectionFields
    .filter((field) => field.profileCluster === cluster)
    .map((field) => (
      <div key={field.id} className="client-profile-subsection">
        <div className="client-profile-subsection-header"><div className="flex items-center gap-2"><span className="client-profile-field-icon">{field.icon}</span><span className="text-sm font-semibold text-default">{field.label}</span></div></div>
        <div className="client-profile-field-grid">{renderCustomFields([field])}</div>
      </div>
    ));

  return (
    <>
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
          {renderCustomFields(companyFields)}
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
          {renderCustomFields(contactFields)}
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
          {renderCustomFields(complianceFields)}
          {renderCustomFields(additionalFields)}
        </div>
      </div>

      {(hiddenCustomCount > 0 || showAllCustomFields) && customFields.length > 0 && (
        <button type="button" onClick={onToggleCustomFields} className="client-profile-link-button">
          {showAllCustomFields ? "Show less information" : `Show ${hiddenCustomCount} more detail${hiddenCustomCount === 1 ? "" : "s"}`}
        </button>
      )}

      {subsectionGroupsAt("company").map((group) => renderCustomGroup(group))}
      {renderStandaloneSubsections("company")}

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
      {subsectionGroupsAt("contact").map((group) => renderCustomGroup(group))}
      {renderStandaloneSubsections("contact")}
      {subsectionGroupsAt("compliance").map((group) => renderCustomGroup(group))}
      {renderStandaloneSubsections("compliance")}

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

      {subsectionGroupsAt("additional").map((group) => renderCustomGroup(group))}
      {renderStandaloneSubsections("additional")}

      <div className="client-profile-card-footer">
        <span>Added {formatDate(client.createdAt)}</span>
        <span>Last updated {formatDateTime(client.updatedAt || client.createdAt)}</span>
      </div>
    </section>
    {cardGroups.map((group) => renderCustomGroup(group, true))}
    {standaloneCardFields.map((field) => (
      <section key={field.id} className="client-profile-card">
        <div className="client-profile-card-header"><div><p className="client-profile-kicker">Custom section</p><h2>{field.label}</h2></div></div>
        <div className="client-profile-field-grid">{renderCustomFields([field])}</div>
      </section>
    ))}
    </>
  );
}

type DocumentCardProps = Pick<
  DocumentsSectionProps,
  "busyAction" | "canManageDocuments" | "onEdit" | "onDelete" | "onMigrate"
> & {
  document: Document;
};

function DocumentCard({
  document,
  busyAction,
  canManageDocuments,
  onEdit,
  onDelete,
  onMigrate,
}: DocumentCardProps) {
  return (
    <article className="client-profile-document-card">
      <div className="client-profile-document-preview">
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-default">{document.documentName}</p>
        <div className="client-profile-document-meta">
          <span>{document.category || "Other"}</span>
          {document.documentKind === "target-screenshot" && document.financialYear ? <span>FY {document.financialYear}</span> : null}
          {document.fileSize ? <span>{document.fileSize < 1048576 ? `${Math.round(document.fileSize / 1024)} KB` : `${(document.fileSize / 1048576).toFixed(1)} MB`}</span> : null}
          <span>{formatDate(document.uploadedDate)}</span>
        </div>
        {document.driveRelativePath && document.driveRelativePath !== document.documentName && (
          <p className="client-profile-document-path" title={document.driveRelativePath}>{document.driveRelativePath}</p>
        )}
      </div>
      <div className="client-profile-document-actions">
        {canManageDocuments && document.storageType !== "google-drive" && (
          <button
            type="button"
            disabled={busyAction === `document-migrate-${document._id}`}
            onClick={() => onMigrate(document)}
            className="client-profile-icon-button"
            title="Copy into managed Drive storage"
            aria-label={`Migrate ${document.documentName}`}
          >
            <RefreshCw className={`h-4 w-4 ${busyAction === `document-migrate-${document._id}` ? "animate-spin" : ""}`} />
          </button>
        )}
        <a
          href={document.driveLink}
          target="_blank"
          rel="noopener noreferrer"
          className="client-profile-icon-button"
          aria-label={`Open ${document.documentName}`}
        >
          <ExternalLink className="h-4 w-4" />
        </a>
        {canManageDocuments && (
          <>
            <button type="button" onClick={() => onEdit(document)} className="client-profile-icon-button" aria-label={`Edit ${document.documentName}`}>
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={busyAction === `document-${document._id}`}
              onClick={() => onDelete(document)}
              className="client-profile-icon-button client-profile-danger-icon"
              aria-label={`Delete ${document.documentName}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function TargetScreenshotCard({
  document,
  busyAction,
  canManageDocuments,
  onEdit,
  onDelete,
  onMigrate,
}: DocumentCardProps) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const canPreview = document.storageType === "google-drive"
    && Boolean(document.driveFileId)
    && Boolean(document.mimeType?.startsWith("image/"))
    && !previewFailed;

  return (
    <article className="client-profile-target-card">
      <a
        href={document.driveLink}
        target="_blank"
        rel="noopener noreferrer"
        className="client-profile-target-thumbnail"
        aria-label={`Open ${document.documentName}`}
      >
        {canPreview ? (
          <img
            src={`/api/documents/${document._id}/preview`}
            alt=""
            loading="lazy"
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          <span><ImageIcon className="h-5 w-5" /></span>
        )}
        <i><ExternalLink className="h-3 w-3" /> View</i>
      </a>

      {canManageDocuments && (
        <div className="client-profile-target-card-actions">
          {document.storageType !== "google-drive" && (
            <button
              type="button"
              disabled={busyAction === `document-migrate-${document._id}`}
              onClick={() => onMigrate(document)}
              aria-label={`Migrate ${document.documentName}`}
              title="Copy into managed Drive storage"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busyAction === `document-migrate-${document._id}` ? "animate-spin" : ""}`} />
            </button>
          )}
          <button type="button" onClick={() => onEdit(document)} aria-label={`Edit ${document.documentName}`}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={busyAction === `document-${document._id}`}
            onClick={() => onDelete(document)}
            aria-label={`Delete ${document.documentName}`}
            data-danger="true"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="client-profile-target-card-copy">
        <p title={document.documentName}>{document.documentName}</p>
        <span>
          {formatDate(document.uploadedDate)}
          {document.fileSize ? ` · ${document.fileSize < 1048576 ? `${Math.round(document.fileSize / 1024)} KB` : `${(document.fileSize / 1048576).toFixed(1)} MB`}` : ""}
        </span>
      </div>
    </article>
  );
}

export function DocumentsSection({
  documents,
  showRequirementSummary,
  open,
  busyAction,
  hasLinkedContacts,
  canManageDocuments,
  onToggle,
  onAdd,
  onUpload,
  onEdit,
  onDelete,
  onMigrate,
  onLinkContact,
  selectedFy,
  hasEprCertificate,
  targetDataAdded,
  hasTargetScreenshot,
  onUploadTargetScreenshot,
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
          {canManageDocuments && (
            <>
              <button type="button" onClick={onAdd} className="client-profile-primary-button">
                <Plus className="h-4 w-4" />
                <span>Add link</span>
              </button>
              <button type="button" onClick={onUpload} className="client-profile-primary-button">
                <UploadCloud className="h-4 w-4" />
                <span>Upload</span>
              </button>
            </>
          )}
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
            {showRequirementSummary && (
            <div className="mb-4 grid gap-2 md:grid-cols-2">
              <div className="rounded-xl border border-base bg-surface/60 p-3">
                <div className="flex items-start gap-3">
                  {hasEprCertificate ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> : <CircleAlert className="mt-0.5 h-4 w-4 text-amber-600" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-default">EPR Certificate</p>
                    <p className="text-xs text-muted">{hasEprCertificate ? "Required document added" : "Required for every client"}</p>
                  </div>
                </div>
              </div>
              {targetDataAdded && (
                <div className="rounded-xl border border-base bg-surface/60 p-3">
                  <div className="flex items-start gap-3">
                    {hasTargetScreenshot ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> : <CircleAlert className="mt-0.5 h-4 w-4 text-amber-600" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-default">Target screenshot · FY {selectedFy}</p>
                      <p className="text-xs text-muted">{hasTargetScreenshot ? "Screenshot added for this FY" : "Required because target data is recorded"}</p>
                      {!hasTargetScreenshot && canManageDocuments && (
                        <button type="button" className="mt-2 text-xs font-semibold text-brand-600" onClick={onUploadTargetScreenshot}>Upload screenshot</button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            )}

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
                  {canManageDocuments && (
                    <>
                  <button type="button" className="client-profile-primary-button" onClick={onAdd}>
                    <Plus className="h-4 w-4" />
                    <span>Add Drive link</span>
                  </button>
                  <button type="button" className="client-profile-primary-button" onClick={onUpload}>
                    <UploadCloud className="h-4 w-4" />
                    <span>Upload files</span>
                  </button>
                    </>
                  )}
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
                  <DocumentCard
                    key={document._id}
                    document={document}
                    busyAction={busyAction}
                    canManageDocuments={canManageDocuments}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onMigrate={onMigrate}
                  />
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

type TargetScreenshotsSectionProps = Pick<
  DocumentsSectionProps,
  "busyAction" | "canManageDocuments" | "onEdit" | "onDelete" | "onMigrate"
> & {
  documents: Document[];
  selectedFy: string;
  onUpload: (financialYear: string) => void;
  targetsHref: (financialYear: string) => string;
};

const financialYearStart = (financialYear: string) => {
  const match = financialYear.match(/^(\d{4})/);
  return match ? Number(match[1]) : -1;
};

export function TargetScreenshotsSection({
  documents,
  selectedFy,
  busyAction,
  canManageDocuments,
  onUpload,
  targetsHref,
  onEdit,
  onDelete,
  onMigrate,
}: TargetScreenshotsSectionProps) {
  const groups = useMemo(() => {
    const byFinancialYear = new Map<string, Document[]>();
    documents
      .filter((document) => document.documentKind === "target-screenshot")
      .forEach((document) => {
        const financialYear = document.financialYear || "Unassigned";
        byFinancialYear.set(financialYear, [...(byFinancialYear.get(financialYear) || []), document]);
      });

    return Array.from(byFinancialYear.entries())
      .map(([financialYear, entries]) => ({
        financialYear,
        documents: [...entries].sort((left, right) => (
          new Date(right.uploadedDate).getTime() - new Date(left.uploadedDate).getTime()
        )),
      }))
      .sort((left, right) => (
        financialYearStart(right.financialYear) - financialYearStart(left.financialYear)
        || right.financialYear.localeCompare(left.financialYear)
      ));
  }, [documents]);
  const screenshotCount = groups.reduce((total, group) => total + group.documents.length, 0);
  const latestFy = groups[0]?.financialYear;
  const availableUploadYears = useMemo(() => {
    const existingYears = new Set(groups.map((group) => group.financialYear));
    const selectedStart = financialYearStart(selectedFy);
    return FINANCIAL_YEARS
      .filter((financialYear) => !existingYears.has(financialYear))
      .sort((left, right) => {
        const leftStart = financialYearStart(left);
        const rightStart = financialYearStart(right);
        const leftIsFuture = leftStart > selectedStart;
        const rightIsFuture = rightStart > selectedStart;
        if (leftIsFuture !== rightIsFuture) return leftIsFuture ? 1 : -1;
        return leftIsFuture ? leftStart - rightStart : rightStart - leftStart;
      });
  }, [groups, selectedFy]);
  const [uploadFy, setUploadFy] = useState(selectedFy);

  useEffect(() => {
    setUploadFy((current) => {
      if (availableUploadYears.includes(current)) return current;
      if (availableUploadYears.includes(selectedFy)) return selectedFy;
      return availableUploadYears[0] || "";
    });
  }, [availableUploadYears, selectedFy]);

  return (
    <section className="client-profile-card client-profile-targets-card">
      <div className="client-profile-card-header">
        <div>
          <p className="client-profile-kicker">Documents</p>
          <h2>Target Screenshots</h2>
          <p className="mt-1 text-xs text-faint">
            {screenshotCount === 0
              ? "Screenshots are organized here by financial year."
              : `${screenshotCount} screenshot${screenshotCount === 1 ? "" : "s"} across ${groups.length} financial year${groups.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {canManageDocuments && (
          availableUploadYears.length > 0 ? (
            <div className="client-profile-target-upload-controls">
              <label>
                <span className="sr-only">Financial year for target screenshot</span>
                <select value={uploadFy} onChange={(event) => setUploadFy(event.target.value)}>
                  {availableUploadYears.map((financialYear) => (
                    <option key={financialYear} value={financialYear}>FY {financialYear}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => onUpload(uploadFy)}
                className="client-profile-primary-button"
                disabled={!uploadFy}
              >
                <UploadCloud className="h-4 w-4" />
                <span>Upload</span>
              </button>
            </div>
          ) : (
            <span className="client-profile-target-all-added"><CheckCircle2 className="h-3.5 w-3.5" /> All FYs added</span>
          )
        )}
      </div>

      {groups.length === 0 ? (
        <div className="client-profile-document-empty">
          <span className="client-profile-empty-icon"><Target className="h-5 w-5" /></span>
          <p className="font-semibold text-default">No target screenshots yet</p>
          <p className="text-xs text-faint">Choose a financial year and upload its screenshot to start the timeline.</p>
          {canManageDocuments && (
            <button type="button" className="client-profile-primary-button" onClick={() => onUpload(uploadFy || selectedFy)}>
              <UploadCloud className="h-4 w-4" />
              <span>Upload FY {uploadFy || selectedFy}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="client-profile-target-year-list">
          {groups.map((group) => (
            <section key={group.financialYear} className="client-profile-target-year">
              <div className="client-profile-target-year-header">
                <div>
                  <span className="client-profile-target-year-icon"><Calendar className="h-4 w-4" /></span>
                  <div>
                    <h3>{group.financialYear === "Unassigned" ? "Financial year unassigned" : `FY ${group.financialYear}`}</h3>
                    <p>{group.documents.length} target screenshot{group.documents.length === 1 ? "" : "s"}</p>
                  </div>
                </div>
                {group.financialYear !== "Unassigned" && (
                  <div className="client-profile-target-year-actions">
                    {group.financialYear === latestFy && (
                      <span className="client-profile-target-latest">Latest FY</span>
                    )}
                    <a href={targetsHref(group.financialYear)} className="client-profile-target-open-fy">
                      <Target className="h-3.5 w-3.5" />
                      <span>FY Targets</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
              <div className="client-profile-target-gallery">
                {group.documents.map((document) => (
                  <TargetScreenshotCard
                    key={document._id}
                    document={document}
                    busyAction={busyAction}
                    canManageDocuments={canManageDocuments}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onMigrate={onMigrate}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

export function NotesSection({ notes, onAdd, onDelete }: NotesSectionProps) {
  return (
    <section className="client-profile-card client-profile-notes-card">
      <div className="client-profile-card-header">
        <div>
          <p className="client-profile-kicker">Support</p>
          <h2>Internal Notes</h2>
        </div>
        <button type="button" onClick={onAdd} className="client-profile-secondary-button">
          <Plus className="h-4 w-4" />
          <span>Add note</span>
        </button>
      </div>
      {notes.length > 0 ? (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note._id} className="client-profile-note-body">
              <StickyNote className="mt-0.5 h-4 w-4 text-faint" />
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap">{note.body}</p>
                <p className="mt-2 text-xs text-faint">
                  {note.createdBy || "Team member"} · {formatDateTime(note.createdAt)}{note.financialYear ? ` · FY ${note.financialYear}` : ""}
                </p>
              </div>
              <button type="button" className="client-profile-icon-button client-profile-danger-icon" onClick={() => onDelete(note)} aria-label="Delete note">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="client-profile-empty-inline">
          <StickyNote className="h-4 w-4" />
          <p>No internal notes yet.</p>
        </div>
      )}
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

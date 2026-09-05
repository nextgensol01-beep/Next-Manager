"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import useSWRInfinite from "swr/infinite";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionStyle, type MotionValue } from "framer-motion";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import ConfirmModal from "@/components/ui/ConfirmModal";
import LiquidGlassButton, { type LiquidGlassButtonProps } from "@/components/ui/LiquidGlassButton";
import LiquidGlassDropdown from "@/components/ui/LiquidGlassDropdown";
import { CATEGORIES, STATES, cn, formatDate } from "@/lib/utils";
import {
  Building2,
  Check,
  CircleAlert,
  Eye,
  Filter,
  FileCheck2,
  FileX2,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { invalidate, useCache } from "@/lib/useCache";
import { fetchClientDirectoryPage } from "@/lib/clientDirectoryCache";
import { prefetchClientWorkspace } from "@/lib/clientWorkspaceCache";
import { useFinancialYearState } from "@/app/providers";
import {
  normalizeEmailList,
  normalizePhoneList,
} from "@/lib/clientContactSelections";
import type { PersonEntry } from "@/app/dashboard/clients/[clientId]/ClientProfileSupport";
import type { ClientFormData } from "@/components/clients/ClientFormModal";
import type { ClientCustomFieldDefinition, ClientCustomFieldGroupDefinition, ClientCustomFieldValues } from "@/lib/clientCustomFields";

const ClientFormModal = dynamic(() => import("@/components/clients/ClientFormModal"), {
  ssr: false,
});

interface Person {
  _id: string;
  name: string;
  phoneNumbers: string[];
  emails: string[];
  mobile?: string;
  email?: string;
}

interface LinkedPerson extends Person {
  personId?: string;
  allPhoneNumbers?: string[];
  allEmails?: string[];
  selectedPhones?: string[];
  selectedEmails?: string[];
  designation: string;
  isPrimaryContact: boolean;
  mobile: string;
  email: string;
}

interface Client {
  _id: string;
  clientId: string;
  companyName: string;
  legalName?: string;
  category: string;
  state: string;
  address?: string;
  gstNumber?: string;
  registrationNumber?: string;
  cpcbLoginId?: string;
  cpcbPassword?: string;
  otpMobileNumber?: string;
  customFields?: ClientCustomFieldValues;
  createdAt: string;
  contacts?: LinkedPerson[];
  documentSummary?: {
    count: number;
    latestName?: string;
    latestDate?: string;
    categories?: string[];
  };
}

interface ClientsPageResponse {
  items: Client[];
  total: number;
  nextOffset: number;
  hasMore: boolean;
}

const CLIENT_PAGE_SIZE = 30;
const CLIENT_HEADER_MORPH_START = 18;
const CLIENT_HEADER_MORPH_END = 202;
const CLIENT_HEADER_MORPH_RANGE = CLIENT_HEADER_MORPH_END - CLIENT_HEADER_MORPH_START;
const CLIENT_HEADER_SNAP_SPLIT = 112;
const CATEGORY_FILTERS = [
  { value: "all", label: "All Categories" },
  ...CATEGORIES.map((category) => ({ value: category, label: category })),
];
const STATE_FILTERS = [
  { value: "all", label: "All States" },
  ...STATES.map((state) => ({ value: state, label: state })),
];

const useInterpolatedPx = (progress: MotionValue<number>, from: number, to: number) => useTransform(
  progress,
  (value) => `${from + (to - from) * value}px`
);

const ClientControlButton = React.forwardRef<HTMLButtonElement, LiquidGlassButtonProps>(
  function ClientControlButton({ children, className, ...props }, ref) {
    return (
      <LiquidGlassButton
        ref={ref}
        {...props}
        className={cn("clients-liquid-button", className)}
      >
        {children}
      </LiquidGlassButton>
    );
  }
);

function ClientMobileSheet({
  ariaLabel,
  children,
  className,
  onClose,
}: {
  ariaLabel: string;
  children: (close: (afterClose?: () => void) => void) => React.ReactNode;
  className?: string;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"entering" | "open" | "closing">("entering");
  const closingRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback((afterClose?: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setPhase("closing");
    document.getElementById("dashboard-scroll-area")?.removeAttribute("data-client-sheet-open");
    closeTimerRef.current = setTimeout(() => {
      onClose();
      afterClose?.();
    }, 320);
  }, [onClose]);

  useEffect(() => {
    const scrollArea = document.getElementById("dashboard-scroll-area");
    scrollArea?.setAttribute("data-client-sheet-open", "true");
    const openTimer = setTimeout(() => setPhase("open"), 520);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(openTimer);
      window.removeEventListener("keydown", handleKeyDown);
      scrollArea?.removeAttribute("data-client-sheet-open");
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [close]);

  return createPortal(
    <div className={cn("clients-action-sheet-root", className, phase === "closing" && "is-closing")}>
      <button
        type="button"
        className="clients-action-sheet-backdrop"
        onClick={() => close()}
        aria-label="Close client actions"
      />
      <div
        className="clients-action-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        {children(close)}
      </div>
    </div>,
    document.body
  );
}

function ActiveFilterChips({
  compact,
  categoryFilter,
  registeredThisFyFilter,
  stateFilter,
  clearFilters,
  setCategoryFilter,
  setRegisteredThisFyFilter,
  setStateFilter,
}: {
  compact: boolean;
  categoryFilter: string;
  registeredThisFyFilter: boolean;
  stateFilter: string;
  clearFilters: () => void;
  setCategoryFilter: (value: string) => void;
  setRegisteredThisFyFilter: (value: boolean) => void;
  setStateFilter: (value: string) => void;
}) {
  if (categoryFilter === "all" && stateFilter === "all" && !registeredThisFyFilter) return null;

  return (
    <div className="clients-filter-chip-layer" data-compact={compact ? "true" : "false"}>
      <div className="clients-active-filters">
        {categoryFilter !== "all" && (
          <button type="button" onClick={() => setCategoryFilter("all")}>
            {categoryFilter}
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {stateFilter !== "all" && (
          <button type="button" onClick={() => setStateFilter("all")}>
            {stateFilter}
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {registeredThisFyFilter && (
          <button type="button" onClick={() => setRegisteredThisFyFilter(false)}>
            Current FY Registration
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <button type="button" className="clients-clear-all" onClick={clearFilters}>
          Clear all
        </button>
      </div>
    </div>
  );
}

function SearchField({
  compact,
  id,
  onChange,
  onClear,
  placeholder = "Search clients, contacts, GST or ID",
  value,
  variant,
}: {
  compact?: boolean;
  id: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder?: string;
  value: string;
  variant: "header" | "dock";
}) {
  return (
    <label
      className="clients-premium-search"
      data-compact={compact ? "true" : "false"}
      data-variant={variant}
      htmlFor={id}
    >
      <Search className="h-[17px] w-[17px] shrink-0" />
      <input
        id={id}
        className="min-w-0 flex-1 bg-transparent text-[14px] text-default outline-none placeholder:text-faint"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button
          type="button"
          className="clients-search-clear"
          onClick={onClear}
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </label>
  );
}

type FilterPanelProps = {
  activeFilterCount: number;
  applyFilters: () => void;
  cancelFilters: () => void;
  className?: string;
  draftCategoryFilter: string;
  draftRegisteredThisFyFilter: boolean;
  draftStateFilter: string;
  financialYear: string;
  panelRef?: React.Ref<HTMLDivElement>;
  setDraftCategoryFilter: (value: string) => void;
  setDraftRegisteredThisFyFilter: (value: boolean) => void;
  setDraftStateFilter: (value: string) => void;
  style?: React.CSSProperties;
};

function FilterPanel({
  activeFilterCount,
  applyFilters,
  cancelFilters,
  className,
  draftCategoryFilter,
  draftRegisteredThisFyFilter,
  draftStateFilter,
  financialYear,
  panelRef,
  setDraftCategoryFilter,
  setDraftRegisteredThisFyFilter,
  setDraftStateFilter,
  style,
}: FilterPanelProps) {
  return (
    <div
      ref={panelRef}
      className={cn("clients-filter-panel", className)}
      style={style}
      role="dialog"
      aria-modal="true"
      aria-label="Filter clients"
    >
      <div className="clients-filter-panel-header">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-default">Filters</p>
          <p className="mt-0.5 text-xs text-faint">
            {activeFilterCount > 0 ? `${activeFilterCount} active` : "Category, state, and registration"}
          </p>
        </div>
        <button type="button" className="clients-filter-close" onClick={cancelFilters} aria-label="Close filters">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="clients-filter-grid">
        <LiquidGlassDropdown
          label="Category"
          options={CATEGORY_FILTERS}
          portal
          value={draftCategoryFilter}
          onChange={setDraftCategoryFilter}
          icon={<Filter className="h-4 w-4" />}
        />
        <LiquidGlassDropdown
          label="State"
          options={STATE_FILTERS}
          portal
          value={draftStateFilter}
          onChange={setDraftStateFilter}
          icon={<MapPin className="h-4 w-4" />}
        />
      </div>

      <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-base bg-card px-3 py-3 text-left transition-colors hover:bg-hover">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-base accent-[var(--brand)]"
          checked={draftRegisteredThisFyFilter}
          onChange={(event) => setDraftRegisteredThisFyFilter(event.target.checked)}
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-default">Current FY Registration</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-faint">
            CPCB registration or approval date falls in FY {financialYear}
          </span>
        </span>
      </label>

      <div className="clients-filter-panel-actions">
        <button
          type="button"
          className="clients-text-button"
          onClick={() => {
            setDraftCategoryFilter("all");
            setDraftStateFilter("all");
            setDraftRegisteredThisFyFilter(false);
          }}
        >
          Clear
        </button>
        <div className="clients-filter-action-buttons">
          <ClientControlButton type="button" size="sm" onClick={cancelFilters}>
            Cancel
          </ClientControlButton>
          <ClientControlButton type="button" size="sm" variant="primary" onClick={applyFilters}>
            <Check className="h-4 w-4" />
            Apply
          </ClientControlButton>
        </div>
      </div>
    </div>
  );
}

function DesktopFilterPopover({
  anchorRef,
  panelRef,
  ...filterPanelProps
}: FilterPanelProps & {
  anchorRef: React.RefObject<HTMLDivElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties | null>(null);

  const updatePanelPosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor || typeof window === "undefined") return;

    const anchorRect = anchor.getBoundingClientRect();
    const gutter = 17;
    const panelWidth = Math.min(372, window.innerWidth - gutter * 2);
    const left = Math.min(
      Math.max(anchorRect.right - panelWidth, gutter),
      window.innerWidth - panelWidth - gutter
    );

    setPanelStyle({
      "--clients-filter-menu-left": `${left}px`,
      "--clients-filter-menu-top": `${anchorRect.bottom + 12}px`,
      "--clients-filter-menu-width": `${panelWidth}px`,
    } as React.CSSProperties);
  }, [anchorRef]);

  useEffect(() => {
    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);

    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [updatePanelPosition]);

  if (!panelStyle || typeof document === "undefined") return null;

  return createPortal(
    <>
      <button
        type="button"
        className="clients-filter-backdrop clients-filter-backdrop--portal"
        onClick={filterPanelProps.cancelFilters}
        aria-label="Close filters"
      />
      <FilterPanel
        {...filterPanelProps}
        className="clients-filter-panel--portal"
        panelRef={panelRef}
        style={panelStyle}
      />
    </>,
    document.body
  );
}

function MobileFilterLayer(filterPanelProps: FilterPanelProps) {
  const [phase, setPhase] = useState<"entering" | "open" | "closing">("entering");
  const closingRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback((afterClose: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setPhase("closing");
    closeTimerRef.current = setTimeout(afterClose, 180);
  }, []);

  useEffect(() => {
    const scrollArea = document.getElementById("dashboard-scroll-area");
    scrollArea?.setAttribute("data-client-sheet-open", "true");
    openTimerRef.current = setTimeout(() => setPhase("open"), 30);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(filterPanelProps.cancelFilters);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      scrollArea?.removeAttribute("data-client-sheet-open");
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [close, filterPanelProps.cancelFilters]);

  return (
    <div className={cn("clients-mobile-filter-root", phase === "closing" && "is-closing")} data-state={phase}>
      <button
        type="button"
        className="clients-mobile-filter-backdrop"
        onClick={() => close(filterPanelProps.cancelFilters)}
        aria-label="Close filters"
      />
      <div className="clients-mobile-filter-shell">
        <div className="clients-mobile-filter-blur" aria-hidden="true" />
        <FilterPanel
          {...filterPanelProps}
          applyFilters={() => close(filterPanelProps.applyFilters)}
          cancelFilters={() => close(filterPanelProps.cancelFilters)}
          className="clients-filter-panel--mobile-portal"
        />
      </div>
    </div>
  );
}

function MorphingClientHeader({
  activeFilterCount,
  activeFilterLabel,
  applyFilters,
  cancelFilters,
  clearSearch,
  compact,
  draftCategoryFilter,
  draftRegisteredThisFyFilter,
  draftStateFilter,
  financialYear,
  filterOpen,
  filterPanelRef,
  filterPopoverRef,
  isFiltered,
  isMobileViewport,
  loading,
  loadedClients,
  morphProgress,
  onAddClient,
  onSearchInputChange,
  openFilters,
  searchInput,
  setDraftCategoryFilter,
  setDraftRegisteredThisFyFilter,
  setDraftStateFilter,
  totalClients,
}: {
  activeFilterCount: number;
  activeFilterLabel: string;
  applyFilters: () => void;
  cancelFilters: () => void;
  clearSearch: () => void;
  compact: boolean;
  draftCategoryFilter: string;
  draftRegisteredThisFyFilter: boolean;
  draftStateFilter: string;
  financialYear: string;
  filterOpen: boolean;
  filterPanelRef: React.RefObject<HTMLDivElement | null>;
  filterPopoverRef: React.RefObject<HTMLDivElement | null>;
  isFiltered: boolean;
  isMobileViewport: boolean;
  loading: boolean;
  loadedClients: number;
  morphProgress: MotionValue<number>;
  onAddClient: () => void;
  onSearchInputChange: (value: string) => void;
  openFilters: () => void;
  searchInput: string;
  setDraftCategoryFilter: (value: string) => void;
  setDraftRegisteredThisFyFilter: (value: boolean) => void;
  setDraftStateFilter: (value: string) => void;
  totalClients: number;
}) {
  const headerRef = useRef<HTMLElement | null>(null);
  const [headerWidth, setHeaderWidth] = useState(1480);

  useLayoutEffect(() => {
    const node = headerRef.current;
    if (!node) return;

    const updateWidth = () => setHeaderWidth(Math.max(320, Math.round(node.getBoundingClientRect().width)));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const narrowDesktop = headerWidth <= 1080;
  const compactHeaderWidth = Math.min(headerWidth, narrowDesktop ? 920 : 980);
  const expandedSearchWidth = Math.min(680, Math.max(360, headerWidth * 0.5));
  const compactSearchWidth = Math.min(
    narrowDesktop ? 420 : 540,
    Math.max(230, compactHeaderWidth - (narrowDesktop ? 330 : 420))
  );
  const compactSearchLeft = narrowDesktop ? 160 : 182;

  const innerWidth = useInterpolatedPx(morphProgress, headerWidth, compactHeaderWidth);
  const innerHeight = useInterpolatedPx(morphProgress, narrowDesktop ? 154 : 168, 70);
  const innerRadius = useInterpolatedPx(morphProgress, 30, 35);
  const copyLeft = useInterpolatedPx(morphProgress, narrowDesktop ? 20 : 24, 18);
  const copyTop = useInterpolatedPx(morphProgress, narrowDesktop ? 20 : 24, 25);
  const titleScale = useTransform(morphProgress, (value) => 1 - value * 0.5);
  const searchTop = useInterpolatedPx(morphProgress, narrowDesktop ? 86 : 92, 13);
  const searchWidth = useInterpolatedPx(morphProgress, expandedSearchWidth, compactSearchWidth);
  const searchTranslateX = useInterpolatedPx(morphProgress, -expandedSearchWidth / 2, compactSearchLeft - compactHeaderWidth / 2);
  const searchHeight = useInterpolatedPx(morphProgress, 52, 44);
  const searchRadius = useInterpolatedPx(morphProgress, 20, 24);
  const actionsTop = useInterpolatedPx(morphProgress, narrowDesktop ? 20 : 24, 14);
  const actionsRight = useInterpolatedPx(morphProgress, narrowDesktop ? 20 : 24, 12);
  const controlHeight = useInterpolatedPx(morphProgress, 46, 42);
  const supportingOpacity = useTransform(morphProgress, [0, 0.46, 0.78, 1], [1, 0.8, 0, 0]);
  const supportingShift = useInterpolatedPx(morphProgress, 0, -10);

  const morphStyle = {
    "--clients-morph-inner-width": innerWidth,
    "--clients-morph-inner-height": innerHeight,
    "--clients-morph-inner-radius": innerRadius,
    "--clients-morph-copy-left": copyLeft,
    "--clients-morph-copy-top": copyTop,
    "--clients-morph-title-scale": titleScale,
    "--clients-morph-search-top": searchTop,
    "--clients-morph-search-width": searchWidth,
    "--clients-morph-search-x": searchTranslateX,
    "--clients-morph-search-height": searchHeight,
    "--clients-morph-search-radius": searchRadius,
    "--clients-morph-actions-top": actionsTop,
    "--clients-morph-actions-right": actionsRight,
    "--clients-morph-control-height": controlHeight,
    "--clients-morph-support-opacity": supportingOpacity,
    "--clients-morph-support-y": supportingShift,
  } as unknown as MotionStyle;

  const totalLabel = loading
    ? "Loading clients"
    : `${totalClients.toLocaleString("en-IN")} ${isFiltered ? "matching" : "total"}`;
  const loadedLabel = loading
    ? "Preparing table"
    : `${loadedClients.toLocaleString("en-IN")} loaded`;

  const filterButton = (variant: "header" | "dock") => (
    <ClientControlButton
      type="button"
      size={variant === "dock" ? "sm" : "md"}
      shape={variant === "dock" ? "circle" : "pill"}
      className="clients-filter-trigger"
      data-variant={variant}
      aria-label={activeFilterCount > 0 ? `Filter clients, ${activeFilterCount} active` : "Filter clients"}
      aria-expanded={filterOpen}
      aria-haspopup="dialog"
      onClick={() => (filterOpen ? cancelFilters() : openFilters())}
    >
      <Filter className="h-4 w-4" />
      <span className="clients-button-label">Filter</span>
      {activeFilterCount > 0 && <span className="clients-filter-count">{activeFilterCount}</span>}
    </ClientControlButton>
  );

  return (
    <motion.section
      ref={headerRef}
      className="clients-floating-header"
      data-compact={compact ? "true" : "false"}
      data-scroll-morph="true"
      style={morphStyle}
      aria-label="Client directory controls"
    >
      <div className="clients-floating-header-inner">
        <div className="clients-header-copy">
          <h1 className="clients-page-title text-default">Clients</h1>
          <p className="clients-page-subtitle">
            <span>{totalLabel}</span>
            <span>{loadedLabel}</span>
          </p>
          <div className="clients-header-metrics" aria-live="polite">
            <span>{activeFilterLabel}</span>
            <span>{CLIENT_PAGE_SIZE} per fetch</span>
          </div>
        </div>

        <div className="clients-header-search-slot">
          <SearchField
            compact={compact}
            id="clients-header-search"
            value={searchInput}
            onChange={onSearchInputChange}
            onClear={clearSearch}
            variant="header"
          />
        </div>

        <div className="clients-header-actions">
          <div className="clients-filter-anchor" ref={filterPanelRef}>
            {filterButton("header")}
            {filterOpen && !isMobileViewport && (
              <DesktopFilterPopover
                activeFilterCount={activeFilterCount}
                anchorRef={filterPanelRef}
                applyFilters={applyFilters}
                cancelFilters={cancelFilters}
                draftCategoryFilter={draftCategoryFilter}
                draftRegisteredThisFyFilter={draftRegisteredThisFyFilter}
                draftStateFilter={draftStateFilter}
                financialYear={financialYear}
                panelRef={filterPopoverRef}
                setDraftCategoryFilter={setDraftCategoryFilter}
                setDraftRegisteredThisFyFilter={setDraftRegisteredThisFyFilter}
                setDraftStateFilter={setDraftStateFilter}
              />
            )}
          </div>

          <ClientControlButton
            type="button"
            variant="primary"
            size="md"
            className="clients-add-button"
            onClick={onAddClient}
          >
            <Plus className="h-4 w-4" />
            <span>Add Client</span>
          </ClientControlButton>
        </div>
      </div>

      <div className="clients-mobile-dock" aria-label="Client quick controls">
        <SearchField
          id="clients-dock-search"
          value={searchInput}
          onChange={onSearchInputChange}
          onClear={clearSearch}
          placeholder="Search"
          variant="dock"
        />
        {filterButton("dock")}
        <ClientControlButton
          type="button"
          variant="primary"
          size="sm"
          shape="circle"
          className="clients-mobile-add"
          onClick={onAddClient}
          aria-label="Add Client"
        >
          <Plus className="h-5 w-5" />
        </ClientControlButton>
      </div>
    </motion.section>
  );
}

const getPrimaryContact = (client: Client) => {
  const contacts = client.contacts || [];
  return contacts.find((contact) => contact.isPrimaryContact) || contacts[0] || null;
};

const getPrimaryPhone = (contact: LinkedPerson | null) =>
  contact?.phoneNumbers?.[0] || contact?.mobile || "";

const getPrimaryEmail = (contact: LinkedPerson | null) =>
  contact?.emails?.[0] || contact?.email || "";

function ClientsTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="clients-skeleton-list" aria-label="Loading clients">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="clients-skeleton-row" style={{ animationDelay: `${index * 45}ms` }}>
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

const ClientsDesktopTable = React.memo(function ClientsDesktopTable({
  clients,
  onDelete,
  onEdit,
  onPrefetch,
  onView,
}: {
  clients: Client[];
  onDelete: (client: Client) => void;
  onEdit: (client: Client) => void;
  onPrefetch: (clientId: string) => void;
  onView: (clientId: string) => void;
}) {
  return (
    <div className="clients-table-wrap">
      <div className="clients-scan-table" role="table" aria-label="Clients">
        <div className="clients-table-head" role="row">
          <span className="clients-col-id">Client ID</span>
          <span>Company</span>
          <span>Category</span>
          <span className="clients-col-state">State</span>
          <span>Primary contact</span>
          <span>Documents</span>
          <span className="clients-col-created">Created</span>
          <span>Actions</span>
        </div>

        <div className="clients-table-body">
          {clients.map((client, index) => {
            const primaryContact = getPrimaryContact(client);
            const primaryPhone = getPrimaryPhone(primaryContact);
            const primaryEmail = getPrimaryEmail(primaryContact);
            const contactLine = primaryPhone || primaryEmail || "No contact detail";
            const documentSummary = client.documentSummary;
            const documentCount = Number(documentSummary?.count || 0);
            const documentCategories = (documentSummary?.categories || [])
              .map((category) => category.charAt(0).toUpperCase() + category.slice(1))
              .join(", ");

            return (
              <div
                key={client._id}
                role="row"
                tabIndex={0}
                className="clients-table-row"
                style={{ animationDelay: `${Math.min(index, 12) * 18}ms` }}
                onMouseEnter={() => onPrefetch(client.clientId)}
                onFocus={() => onPrefetch(client.clientId)}
                onClick={() => onView(client.clientId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onView(client.clientId);
                  }
                }}
              >
                <span className="clients-id-cell clients-col-id" title={client.clientId}>{client.clientId}</span>
                <span className="clients-company-cell">
                  <span className="clients-company-avatar">
                    <Building2 className="h-[17px] w-[17px]" />
                  </span>
                  <span className="min-w-0">
                    <strong title={client.companyName}>{client.companyName}</strong>
                    <small title={`${client.clientId} · ${client.legalName || `${(client.contacts || []).length} linked contacts`}`}>
                      {client.clientId} · {client.legalName || `${(client.contacts || []).length} linked contacts`}
                    </small>
                  </span>
                </span>
                <span><CategoryBadge category={client.category} /></span>
                <span className="clients-state-cell clients-col-state" title={client.state || "-"}>{client.state || "-"}</span>
                <span className="clients-contact-cell">
                  {primaryContact ? (
                    <>
                      <strong title={primaryContact.name}>{primaryContact.name}</strong>
                      <small className="clients-contact-detail" title={`${primaryContact.designation || "Primary contact"} · ${contactLine}`}>
                        <span>{primaryContact.designation || "Primary contact"}</span>
                        <span aria-hidden="true">·</span>
                        <span>{contactLine}</span>
                      </small>
                    </>
                  ) : (
                    <span className="clients-muted-inline">
                      <UserPlus className="h-3.5 w-3.5" />
                      No contact
                    </span>
                  )}
                </span>
                <span className="clients-document-cell">
                  <span
                    className={`clients-document-indicator ${documentCount > 0 ? "has-documents" : "has-no-documents"}`}
                    tabIndex={0}
                    aria-label={documentCount > 0 ? `${documentCount} linked documents` : "No linked documents"}
                  >
                    {documentCount > 0 ? <FileCheck2 className="h-4 w-4" /> : <FileX2 className="h-4 w-4" />}
                    <span>{documentCount > 0 ? `${documentCount} linked` : "None"}</span>
                    <span className="clients-document-popover" role="tooltip">
                      <strong>{documentCount > 0 ? `${documentCount} linked document${documentCount === 1 ? "" : "s"}` : "No documents linked"}</strong>
                      {documentCount > 0 ? (
                        <>
                          <small>Latest: {documentSummary?.latestName || "Document"}</small>
                          {documentSummary?.latestDate && <small>Added {formatDate(documentSummary.latestDate)}</small>}
                          {documentCategories && <small>{documentCategories}</small>}
                        </>
                      ) : (
                        <small>Open the client profile to add a document.</small>
                      )}
                    </span>
                  </span>
                </span>
                <span className="clients-date-cell clients-col-created">{formatDate(client.createdAt)}</span>
                <span className="clients-row-actions">
                  <ClientControlButton
                    type="button"
                    size="sm"
                    shape="circle"
                    className="clients-row-action-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onView(client.clientId);
                    }}
                    aria-label={`View ${client.companyName}`}
                    title="View profile"
                  >
                    <Eye className="h-4 w-4" />
                  </ClientControlButton>
                  <ClientControlButton
                    type="button"
                    size="sm"
                    shape="circle"
                    className="clients-row-action-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEdit(client);
                    }}
                    aria-label={`Edit ${client.companyName}`}
                    title="Edit client"
                  >
                    <Pencil className="h-4 w-4" />
                  </ClientControlButton>
                  <ClientControlButton
                    type="button"
                    size="sm"
                    shape="circle"
                    variant="danger"
                    className="clients-row-action-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(client);
                    }}
                    aria-label={`Delete ${client.companyName}`}
                    title="Delete client"
                  >
                    <Trash2 className="h-4 w-4" />
                  </ClientControlButton>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

const ClientsMobileList = React.memo(function ClientsMobileList({
  activeClientId,
  clients,
  onMore,
  onPrefetch,
  onView,
}: {
  activeClientId?: string;
  clients: Client[];
  onMore: (client: Client) => void;
  onPrefetch: (clientId: string) => void;
  onView: (clientId: string) => void;
}) {
  return (
    <div className="clients-mobile-list">
      {clients.map((client, index) => {
        const primaryContact = getPrimaryContact(client);
        const primaryPhone = getPrimaryPhone(primaryContact);
        const primaryEmail = getPrimaryEmail(primaryContact);

        return (
          <article key={client._id} className="clients-mobile-card" style={{ animationDelay: `${Math.min(index, 10) * 24}ms` }}>
            <button
              type="button"
              className="clients-mobile-card-main"
              onPointerDown={() => onPrefetch(client.clientId)}
              onFocus={() => onPrefetch(client.clientId)}
              onClick={() => onView(client.clientId)}
            >
              <span className="clients-mobile-card-top">
                <span className="clients-id-cell">{client.clientId}</span>
                <CategoryBadge category={client.category} />
              </span>
              <strong title={client.companyName}>{client.companyName}</strong>
              <span className="clients-mobile-card-meta">
                <span><MapPin className="h-3.5 w-3.5" />{client.state || "-"}</span>
                <span>{formatDate(client.createdAt)}</span>
              </span>
              <span className="clients-mobile-card-contact">
                {primaryContact ? primaryContact.name : "No primary contact"}
                {(primaryPhone || primaryEmail) && <span>{primaryPhone || primaryEmail}</span>}
              </span>
            </button>
            <ClientControlButton
              type="button"
              size="sm"
              shape="circle"
              className="clients-mobile-more"
              aria-label={`More actions for ${client.companyName}`}
              aria-expanded={activeClientId === client.clientId}
              onClick={() => onMore(client)}
            >
              <MoreHorizontal className="h-5 w-5" />
            </ClientControlButton>
          </article>
        );
      })}
    </div>
  );
});

const syncEntrySelections = (entry: PersonEntry): PersonEntry => {
  const phoneSet = new Set(normalizePhoneList(entry.phoneNumbers));
  const emailSet = new Set(normalizeEmailList(entry.emails));

  return {
    ...entry,
    selectedPhones: normalizePhoneList(entry.selectedPhones).filter((value) => phoneSet.has(value)),
    selectedEmails: normalizeEmailList(entry.selectedEmails).filter((value) => emailSet.has(value)),
  };
};

export default function ClientsPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get("search") || "";
  const initialCategory = searchParams.get("category") || "all";
  const initialState = searchParams.get("state") || "all";
  const initialRegisteredThisFy = searchParams.get("registeredThisFy") === "1";
  const [financialYear] = useFinancialYearState();
  const [modalOpen, setModalOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);

  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const [categoryFilter, setCategoryFilter] = useState(initialCategory);
  const [stateFilter, setStateFilter] = useState(initialState);
  const [registeredThisFyFilter, setRegisteredThisFyFilter] = useState(initialRegisteredThisFy);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftCategoryFilter, setDraftCategoryFilter] = useState(initialCategory);
  const [draftStateFilter, setDraftStateFilter] = useState(initialState);
  const [draftRegisteredThisFyFilter, setDraftRegisteredThisFyFilter] = useState(initialRegisteredThisFy);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [toolbarCompact, setToolbarCompact] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const headerMorphTarget = useMotionValue(0);
  const headerMorphProgress = useSpring(headerMorphTarget, {
    stiffness: 390,
    damping: 44,
    mass: 0.82,
    restDelta: 0.001,
    restSpeed: 0.001,
  });
  const [mobileActionsClient, setMobileActionsClient] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteClient, setDeleteClient] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const filterPanelRef = useRef<HTMLDivElement | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);
  const filterOpenRef = useRef(filterOpen);

  useEffect(() => {
    filterOpenRef.current = filterOpen;
  }, [filterOpen]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobileViewport(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("dashboard:context-title", {
      detail: toolbarCompact
        ? {
            title: "Clients",
            subtitle: "Directory controls",
            progress: 1,
          }
        : null,
    }));

    return () => {
      window.dispatchEvent(new CustomEvent("dashboard:context-title", { detail: null }));
    };
  }, [toolbarCompact]);

  useEffect(() => {
    const scrollArea = document.getElementById("dashboard-scroll-area");
    if (!scrollArea) return;

    let frame = 0;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let releaseTimer: ReturnType<typeof setTimeout> | null = null;
    let snapActive = false;
    const mobileMedia = window.matchMedia("(max-width: 767px)");
    const supportsNativeScrollEnd = "onscrollend" in scrollArea;
    const isNativeMobileScroll = () => mobileMedia.matches;
    const getScrollTop = () => isNativeMobileScroll() ? window.scrollY : scrollArea.scrollTop;
    let compact = getScrollTop() >= CLIENT_HEADER_MORPH_END - 14;
    setToolbarCompact(compact);

    const clearSettleTimer = () => {
      if (!settleTimer) return;
      clearTimeout(settleTimer);
      settleTimer = null;
    };

    const releaseSnap = () => {
      snapActive = false;
      scrollArea.removeEventListener("scrollend", releaseSnap);
      if (releaseTimer) {
        clearTimeout(releaseTimer);
        releaseTimer = null;
      }
    };

    const settleMorphingHeader = () => {
      settleTimer = null;
      if (snapActive || filterOpenRef.current || isNativeMobileScroll()) return;

      const currentScrollTop = scrollArea.scrollTop;

      // Settle only while the header itself is morphing. Scroll positions
      // below the transition continue to behave like ordinary page scroll.
      if (currentScrollTop <= 1.5 || currentScrollTop >= CLIENT_HEADER_MORPH_END - 1.5) return;

      const targetScrollTop = currentScrollTop <= CLIENT_HEADER_SNAP_SPLIT
        ? 0
        : CLIENT_HEADER_MORPH_END;

      snapActive = true;
      scrollArea.addEventListener("scrollend", releaseSnap, { once: true });
      scrollArea.scrollTo({
        top: targetScrollTop,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });

      if (prefersReducedMotion) {
        releaseSnap();
      } else {
        releaseTimer = setTimeout(releaseSnap, 900);
      }
    };

    const scheduleHeaderSettle = () => {
      if (snapActive || isNativeMobileScroll()) return;
      clearSettleTimer();
      settleTimer = setTimeout(settleMorphingHeader, 120);
    };

    const updateMorphState = () => {
      frame = 0;
      const nextScrollTop = getScrollTop();
      const mobile = isNativeMobileScroll();
      const rawProgress = mobile
        ? (nextScrollTop >= 118 ? 1 : nextScrollTop <= 34 ? 0 : compact ? 1 : 0)
        : Math.max(0, Math.min(1, (nextScrollTop - CLIENT_HEADER_MORPH_START) / CLIENT_HEADER_MORPH_RANGE));
      const nextProgress = prefersReducedMotion ? (rawProgress >= 0.5 ? 1 : 0) : rawProgress;
      if (Math.abs(headerMorphTarget.get() - nextProgress) > 0.001) {
        headerMorphTarget.set(nextProgress);
      }

      const nextCompact = compact
        ? nextProgress > 0.08
        : nextProgress >= 0.94;

      if (nextCompact !== compact) {
        compact = nextCompact;
        setToolbarCompact(nextCompact);
      }
    };
    const handleScroll = () => {
      if (!frame) {
        frame = window.requestAnimationFrame(updateMorphState);
      }
      scheduleHeaderSettle();
    };
    const handleResize = () => {
      clearSettleTimer();
      if (frame) return;
      frame = window.requestAnimationFrame(updateMorphState);
    };
    const handleScrollEnd = () => {
      clearSettleTimer();
      if (!snapActive) settleMorphingHeader();
    };
    const handleDirectInput = () => {
      clearSettleTimer();
      if (snapActive) releaseSnap();
    };

    updateMorphState();
    scrollArea.addEventListener("scroll", handleScroll, { passive: true });
    if (supportsNativeScrollEnd) {
      scrollArea.addEventListener("scrollend", handleScrollEnd);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize, { passive: true });
    mobileMedia.addEventListener("change", handleResize);
    scrollArea.addEventListener("wheel", handleDirectInput, { passive: true });
    scrollArea.addEventListener("touchstart", handleDirectInput, { passive: true });
    return () => {
      clearSettleTimer();
      releaseSnap();
      scrollArea.removeEventListener("scroll", handleScroll);
      scrollArea.removeEventListener("scrollend", handleScrollEnd);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      mobileMedia.removeEventListener("change", handleResize);
      scrollArea.removeEventListener("wheel", handleDirectInput);
      scrollArea.removeEventListener("touchstart", handleDirectInput);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [headerMorphTarget, prefersReducedMotion]);

  const { data: customFieldDefinitions } = useCache<ClientCustomFieldDefinition[]>(
    "/api/client-custom-fields",
    { enabled: modalOpen, initialData: [] }
  );
  const { data: customFieldGroups } = useCache<ClientCustomFieldGroupDefinition[]>(
    "/api/client-custom-field-groups",
    { enabled: modalOpen, initialData: [] }
  );

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    if (stateFilter !== "all") params.set("state", stateFilter);
    if (registeredThisFyFilter) {
      params.set("registeredThisFy", "1");
      params.set("fy", financialYear);
    }
    return params;
  }, [categoryFilter, financialYear, registeredThisFyFilter, search, stateFilter]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (search) params.set("search", search); else params.delete("search");
    if (categoryFilter !== "all") params.set("category", categoryFilter); else params.delete("category");
    if (stateFilter !== "all") params.set("state", stateFilter); else params.delete("state");
    if (registeredThisFyFilter) params.set("registeredThisFy", "1"); else params.delete("registeredThisFy");
    params.delete("limit");
    params.delete("offset");
    const nextQuery = params.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [categoryFilter, pathname, registeredThisFyFilter, router, search, searchParams, stateFilter]);

  const readErrorMessage = useCallback(async (response: Response, fallback: string) => {
    try {
      const payload = await response.json();
      if (payload && typeof payload.error === "string" && payload.error.trim()) {
        return payload.error.trim();
      }
    } catch {
      // Use fallback below.
    }
    return fallback;
  }, []);

  const directorySessionScope = String(
    session?.user?.email ||
    (session?.user as { id?: string } | undefined)?.id ||
    ""
  );
  const getClientPageKey = useCallback((
    pageIndex: number,
    previousPageData: ClientsPageResponse | null
  ) => {
    if (sessionStatus !== "authenticated" || !directorySessionScope) return null;
    if (previousPageData && !previousPageData.hasMore) return null;

    const params = new URLSearchParams(queryParams);
    params.set("limit", String(CLIENT_PAGE_SIZE));
    params.set(
      "offset",
      String(pageIndex === 0 ? 0 : Number(previousPageData?.nextOffset) || pageIndex * CLIENT_PAGE_SIZE)
    );
    return [`/api/clients?${params.toString()}`, directorySessionScope] as const;
  }, [directorySessionScope, queryParams, sessionStatus]);
  const {
    data: clientPages,
    error: clientPagesError,
    isLoading: firstPageLoading,
    size: clientPageCount,
    setSize: setClientPageCount,
    mutate: mutateClientPages,
  } = useSWRInfinite<ClientsPageResponse>(
    getClientPageKey,
    fetchClientDirectoryPage,
    {
      dedupingInterval: 10_000,
      persistSize: false,
      revalidateAll: false,
      revalidateFirstPage: true,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  );
  const clients = useMemo(() => {
    const seen = new Set<string>();
    return (clientPages || []).flatMap((page) => page.items || []).filter((client) => {
      if (seen.has(client.clientId)) return false;
      seen.add(client.clientId);
      return true;
    });
  }, [clientPages]);
  const lastClientPage = clientPages?.[clientPages.length - 1];
  const totalClients = Number(clientPages?.[0]?.total) || 0;
  const nextOffset = Number(lastClientPage?.nextOffset) || clients.length;
  const hasMore = Boolean(lastClientPage?.hasMore);
  const loading = (sessionStatus === "loading" || firstPageLoading) && !clientPages?.length;
  const loadingMore = Boolean(clientPages && clientPageCount > clientPages.length);
  const clientPageErrorMessage = clientPagesError instanceof Error
    ? clientPagesError.message
    : clientPagesError
      ? "Unable to load clients."
      : null;
  const loadError = clients.length === 0 ? clientPageErrorMessage : null;
  const loadMoreError = clients.length > 0 ? clientPageErrorMessage : null;

  const refreshClients = useCallback(() => {
    void mutateClientPages().catch(() => undefined);
  }, [mutateClientPages]);

  const loadClientsPage = useCallback((_offset: number, replace: boolean) => {
    if (replace) {
      refreshClients();
      return;
    }
    if (clientPagesError) {
      void setClientPageCount(clientPageCount);
      return;
    }
    if (loadingMore || !hasMore) return;
    void setClientPageCount((current) => current + 1);
  }, [
    clientPageCount,
    clientPagesError,
    hasMore,
    loadingMore,
    refreshClients,
    setClientPageCount,
  ]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || loading || loadingMore || !hasMore || loadError) return;

    const root = window.matchMedia("(max-width: 767px)").matches
      ? null
      : document.getElementById("dashboard-scroll-area");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !loadingMore && hasMore) {
          void loadClientsPage(nextOffset, false);
        }
      },
      { root, rootMargin: "240px 0px", threshold: 0.01 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadClientsPage, loadError, loading, loadingMore, nextOffset]);

  useEffect(() => {
    if (!filterOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const isInsideFilterTrigger = filterPanelRef.current?.contains(target);
      const isInsideFilterPopover = filterPopoverRef.current?.contains(target);
      const isInsideDropdownPortal =
        target instanceof Element && Boolean(target.closest(".clients-filter-dropdown-portal"));

      if (
        filterOpen &&
        !isMobileViewport &&
        !isInsideFilterTrigger &&
        !isInsideFilterPopover &&
        !isInsideDropdownPortal
      ) {
        setFilterOpen(false);
        setDraftCategoryFilter(categoryFilter);
        setDraftStateFilter(stateFilter);
        setDraftRegisteredThisFyFilter(registeredThisFyFilter);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setFilterOpen(false);
      setDraftCategoryFilter(categoryFilter);
      setDraftStateFilter(stateFilter);
      setDraftRegisteredThisFyFilter(registeredThisFyFilter);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [categoryFilter, filterOpen, isMobileViewport, registeredThisFyFilter, stateFilter]);

  useEffect(() => {
    if (!mobileActionsClient) return;
    const selectedStillExists = clients.some((client) => client.clientId === mobileActionsClient.clientId);
    if (!selectedStillExists) setMobileActionsClient(null);
  }, [clients, mobileActionsClient]);

  const openAdd = useCallback(() => {
    setEditClient(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((client: Client) => {
    setEditClient(client);
    setModalOpen(true);
  }, []);

  const viewClient = useCallback((clientId: string) => {
    setMobileActionsClient(null);
    const sessionScope = String(
      session?.user?.email ||
      (session?.user as { id?: string } | undefined)?.id ||
      ""
    );
    router.prefetch(`/dashboard/clients/${clientId}`);
    prefetchClientWorkspace(clientId, sessionScope);
    router.push(`/dashboard/clients/${clientId}`);
  }, [router, session]);

  const prefetchClient = useCallback((clientId: string) => {
    const sessionScope = String(
      session?.user?.email ||
      (session?.user as { id?: string } | undefined)?.id ||
      ""
    );
    router.prefetch(`/dashboard/clients/${clientId}`);
    prefetchClientWorkspace(clientId, sessionScope);
  }, [router, session]);

  const requestDeleteClient = useCallback((client: Client) => {
    setDeleteClient(client);
  }, []);

  const showMobileActions = useCallback((client: Client) => {
    setMobileActionsClient(client);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchInput("");
    setSearch("");
  }, []);

  const handleSaveClient = async (
    data: ClientFormData,
    formPersons: PersonEntry[],
    removedIds: string[]
  ) => {
    setSaving(true);
    try {
      const url = editClient ? `/api/clients/${editClient.clientId}` : "/api/clients";
      const method = editClient ? "PUT" : "POST";
      const validPersons: PersonEntry[] = [];

      for (const person of formPersons) {
        const hasAnyContent = Boolean(
          person.name.trim() || person.designation.trim() ||
          person.phoneNumbers.some((phone) => phone.trim()) ||
          person.emails.some((email) => email.trim())
        );
        if (!hasAnyContent) continue;

        const prepared = syncEntrySelections({
          ...person,
          name: person.name.trim(),
          phoneNumbers: normalizePhoneList(person.phoneNumbers),
          emails: normalizeEmailList(person.emails),
          selectedPhones: person.selectedPhones,
          selectedEmails: person.selectedEmails,
        });

        if (!prepared.name) { toast.error("Each linked contact needs a name."); return; }
        if (prepared.phoneNumbers.length === 0 && prepared.emails.length === 0) {
          toast.error(`Contact "${prepared.name}" needs at least one phone number or email.`); return;
        }
        if (prepared.selectedPhones.length === 0 && prepared.selectedEmails.length === 0) {
          toast.error(`Select at least one phone or email for "${prepared.name}".`); return;
        }
        validPersons.push(prepared);
      }

      const payload = { ...data, persons: validPersons, removedPersonIds: removedIds };
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) {
        toast.error(await readErrorMessage(response, "Something went wrong"));
        return;
      }
      const savedClient = await response.json() as Client;
      await mutateClientPages((pages) => {
        if (!pages?.length) return pages;
        const exists = pages.some((page) => (
          (page.items || []).some((client) => client.clientId === savedClient.clientId)
        ));
        const canInsertIntoCurrentView = (
          !search &&
          categoryFilter === "all" &&
          stateFilter === "all" &&
          !registeredThisFyFilter
        );
        const normalizedSavedClient: Client = {
          ...savedClient,
          contacts: savedClient.contacts || [],
          documentSummary: savedClient.documentSummary || {
            count: 0,
            latestName: "",
            categories: [],
          },
        };

        return pages.map((page, pageIndex) => {
          const updatedItems = (page.items || []).map((client) => (
            client.clientId === savedClient.clientId
              ? { ...client, ...normalizedSavedClient }
              : client
          ));
          if (!exists && canInsertIntoCurrentView && pageIndex === 0) {
            updatedItems.unshift(normalizedSavedClient);
            if (updatedItems.length > CLIENT_PAGE_SIZE) updatedItems.pop();
          }
          return {
            ...page,
            items: updatedItems,
            total: !exists && canInsertIntoCurrentView ? page.total + 1 : page.total,
          };
        });
      }, { revalidate: false });
      toast.success(editClient ? "Client updated!" : `Client added! ID: ${savedClient.clientId}`);
      setModalOpen(false);
      invalidate("/api/clients", "/api/dashboard");
      refreshClients();
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteClient = async () => {
    if (!deleteClient) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/clients/${deleteClient.clientId}`, { method: "DELETE" });
      if (!response.ok) {
        toast.error(await readErrorMessage(response, "Unable to delete client."));
        return;
      }

      const deletedClientId = deleteClient.clientId;
      await mutateClientPages((pages) => pages?.map((page) => ({
        ...page,
        items: (page.items || []).filter((client) => client.clientId !== deletedClientId),
        total: Math.max(0, page.total - 1),
        nextOffset: Math.max(0, page.nextOffset - 1),
      })), { revalidate: false });
      setDeleteClient(null);
      toast.success("Client deleted");
      invalidate("/api/clients", "/api/dashboard");
      refreshClients();
    } finally {
      setDeleting(false);
    }
  };

  const clearFilters = useCallback(() => {
    setSearchInput("");
    setSearch("");
    setCategoryFilter("all");
    setStateFilter("all");
    setRegisteredThisFyFilter(false);
    setDraftCategoryFilter("all");
    setDraftStateFilter("all");
    setDraftRegisteredThisFyFilter(false);
    setFilterOpen(false);
  }, []);

  const openFilters = useCallback(() => {
    setDraftCategoryFilter(categoryFilter);
    setDraftStateFilter(stateFilter);
    setDraftRegisteredThisFyFilter(registeredThisFyFilter);
    setFilterOpen(true);
  }, [categoryFilter, registeredThisFyFilter, stateFilter]);

  const cancelFilters = useCallback(() => {
    setDraftCategoryFilter(categoryFilter);
    setDraftStateFilter(stateFilter);
    setDraftRegisteredThisFyFilter(registeredThisFyFilter);
    setFilterOpen(false);
  }, [categoryFilter, registeredThisFyFilter, stateFilter]);

  const applyFilters = useCallback(() => {
    setCategoryFilter(draftCategoryFilter);
    setStateFilter(draftStateFilter);
    setRegisteredThisFyFilter(draftRegisteredThisFyFilter);
    setFilterOpen(false);
  }, [draftCategoryFilter, draftRegisteredThisFyFilter, draftStateFilter]);

  const isFiltered = Boolean(search || searchInput || categoryFilter !== "all" || stateFilter !== "all" || registeredThisFyFilter);
  const activeFilterCount = Number(categoryFilter !== "all") + Number(stateFilter !== "all") + Number(registeredThisFyFilter);
  const activeFilterLabel = activeFilterCount === 0
    ? "No filters"
    : `${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}`;
  const showingLabel = loading
    ? "Loading clients"
    : `Showing ${clients.length.toLocaleString("en-IN")} of ${totalClients.toLocaleString("en-IN")} clients`;

  const renderBottomState = () => {
    if (loading || loadError || clients.length === 0) return null;

    if (loadingMore) {
      return (
        <div className="clients-bottom-loader" aria-live="polite">
          <span className="clients-bottom-shimmer" />
          <span>Loading more clients</span>
        </div>
      );
    }

    if (loadMoreError) {
      return (
        <div className="clients-bottom-error">
          <p>{loadMoreError}</p>
          <ClientControlButton
            type="button"
            size="sm"
            onClick={() => loadClientsPage(nextOffset, false)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </ClientControlButton>
        </div>
      );
    }

    if (!hasMore) {
      return (
        <p className="clients-end-state">
          All clients loaded
        </p>
      );
    }

    return <div ref={sentinelRef} className="h-8" aria-hidden="true" />;
  };

  return (
    <div className="clients-page min-h-screen">
      <div className="clients-directory">
        <MorphingClientHeader
          activeFilterCount={activeFilterCount}
          activeFilterLabel={activeFilterLabel}
          applyFilters={applyFilters}
          cancelFilters={cancelFilters}
          clearSearch={clearSearch}
          compact={toolbarCompact}
          draftCategoryFilter={draftCategoryFilter}
          draftRegisteredThisFyFilter={draftRegisteredThisFyFilter}
          draftStateFilter={draftStateFilter}
          financialYear={financialYear}
          filterOpen={filterOpen}
          filterPanelRef={filterPanelRef}
          filterPopoverRef={filterPopoverRef}
          isFiltered={isFiltered}
          isMobileViewport={isMobileViewport}
          loading={loading}
          loadedClients={clients.length}
          morphProgress={headerMorphProgress}
          onAddClient={openAdd}
          onSearchInputChange={setSearchInput}
          openFilters={openFilters}
          searchInput={searchInput}
          setDraftCategoryFilter={setDraftCategoryFilter}
          setDraftRegisteredThisFyFilter={setDraftRegisteredThisFyFilter}
          setDraftStateFilter={setDraftStateFilter}
          totalClients={totalClients}
        />

        <ActiveFilterChips
          compact={toolbarCompact}
          categoryFilter={categoryFilter}
          registeredThisFyFilter={registeredThisFyFilter}
          stateFilter={stateFilter}
          clearFilters={clearFilters}
          setCategoryFilter={setCategoryFilter}
          setRegisteredThisFyFilter={setRegisteredThisFyFilter}
          setStateFilter={setStateFilter}
        />

        <section className="clients-directory-surface" aria-label="Client directory">
          <div className="clients-table-statusbar">
            <span>{showingLabel}</span>
            <span>{activeFilterLabel}</span>
          </div>

          {loading ? (
            <>
              <div className="clients-desktop-only">
                <ClientsTableSkeleton />
              </div>
              <div className="clients-mobile-only">
                <ClientsTableSkeleton rows={5} />
              </div>
            </>
          ) : loadError ? (
            <div className="clients-directory-state">
              <span className="clients-state-symbol clients-state-symbol-error">
                <CircleAlert className="h-5 w-5" />
              </span>
              <p className="font-semibold text-default">Unable to load clients</p>
              <span>{loadError}</span>
              <ClientControlButton type="button" size="sm" onClick={refreshClients}>
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </ClientControlButton>
            </div>
          ) : clients.length === 0 ? (
            <div className="clients-directory-state">
              <span className="clients-state-symbol">
                <Building2 className="h-5 w-5" />
              </span>
              <p className="font-semibold text-default">No clients found</p>
              <span>{isFiltered ? "Try adjusting your search or filters." : "Add your first client to begin."}</span>
              {isFiltered ? (
                <ClientControlButton type="button" size="sm" onClick={clearFilters}>
                  <X className="h-3.5 w-3.5" />
                  Clear filters
                </ClientControlButton>
              ) : (
                <ClientControlButton type="button" size="sm" variant="primary" onClick={openAdd}>
                  <Plus className="h-4 w-4" />
                  Add Client
                </ClientControlButton>
              )}
            </div>
          ) : (
            <>
              <div className="clients-desktop-only">
                <ClientsDesktopTable
                  clients={clients}
                  onDelete={requestDeleteClient}
                  onEdit={openEdit}
                  onPrefetch={prefetchClient}
                  onView={viewClient}
                />
              </div>
              <div className="clients-mobile-only">
                <ClientsMobileList
                  activeClientId={mobileActionsClient?.clientId}
                  clients={clients}
                  onMore={showMobileActions}
                  onPrefetch={prefetchClient}
                  onView={viewClient}
                />
              </div>
            </>
          )}
        </section>

        {renderBottomState()}

        {mobileActionsClient && (
          <ClientMobileSheet
            ariaLabel={`Actions for ${mobileActionsClient.companyName}`}
            className="clients-action-sheet-root--actions"
            onClose={() => setMobileActionsClient(null)}
          >
            {(close) => (
              <>
                <div className="clients-action-sheet-card">
                  <button
                    type="button"
                    className="clients-sheet-action-button"
                    style={{ animationDelay: "60ms" }}
                    onClick={() => close(() => viewClient(mobileActionsClient.clientId))}
                  >
                    <Eye className="h-5 w-5" />
                    View Profile
                  </button>
                  <button
                    type="button"
                    className="clients-sheet-action-button"
                    style={{ animationDelay: "90ms" }}
                    onClick={() => close(() => openEdit(mobileActionsClient))}
                  >
                    <Pencil className="h-5 w-5" />
                    Edit Client
                  </button>
                  <button
                    type="button"
                    className="clients-sheet-action-button danger"
                    style={{ animationDelay: "120ms" }}
                    onClick={() => close(() => setDeleteClient(mobileActionsClient))}
                  >
                    <Trash2 className="h-5 w-5" />
                    Delete Client
                  </button>
                </div>
                <div className="clients-action-sheet-card clients-action-sheet-cancel-card" style={{ animationDelay: "170ms" }}>
                  <button type="button" className="clients-sheet-action-button cancel" onClick={() => close()}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </ClientMobileSheet>
        )}

        {filterOpen && isMobileViewport && (
          <MobileFilterLayer
            activeFilterCount={activeFilterCount}
            applyFilters={applyFilters}
            cancelFilters={cancelFilters}
            draftCategoryFilter={draftCategoryFilter}
            draftRegisteredThisFyFilter={draftRegisteredThisFyFilter}
            draftStateFilter={draftStateFilter}
            financialYear={financialYear}
            setDraftCategoryFilter={setDraftCategoryFilter}
            setDraftRegisteredThisFyFilter={setDraftRegisteredThisFyFilter}
            setDraftStateFilter={setDraftStateFilter}
          />
        )}

        <ClientFormModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          client={editClient}
          customFieldDefinitions={customFieldDefinitions}
          customFieldGroups={customFieldGroups}
          onSave={handleSaveClient}
          saving={saving}
        />

        <ConfirmModal
          open={Boolean(deleteClient)}
          onClose={() => {
            if (!deleting) setDeleteClient(null);
          }}
          onConfirm={confirmDeleteClient}
          title="Delete client?"
          description={deleteClient ? `This will move ${deleteClient.companyName} and related records into trash.` : undefined}
          note="Billing, payments, financial year data, documents, uploads, invoices, email logs, and client contacts are included in the trash snapshot."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          loading={deleting}
          confirmText={deleteClient?.clientId}
        />
      </div>
    </div>
  );
}

"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
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
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { invalidate, useCache } from "@/lib/useCache";
import {
  normalizeEmailList,
  normalizePhoneList,
} from "@/lib/clientContactSelections";
import type { PersonEntry } from "@/app/dashboard/clients/[clientId]/ClientProfileSupport";
import type { ClientFormData } from "@/components/clients/ClientFormModal";
import type { ClientCustomFieldDefinition, ClientCustomFieldValues } from "@/lib/clientCustomFields";

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
}

interface ClientsPageResponse {
  items: Client[];
  total: number;
  nextOffset: number;
  hasMore: boolean;
}

const CLIENT_PAGE_SIZE = 30;
const CATEGORY_FILTERS = [
  { value: "all", label: "All Categories" },
  ...CATEGORIES.map((category) => ({ value: category, label: category })),
];
const STATE_FILTERS = [
  { value: "all", label: "All States" },
  ...STATES.map((state) => ({ value: state, label: state })),
];

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
  onClose,
}: {
  ariaLabel: string;
  children: (close: (afterClose?: () => void) => void) => React.ReactNode;
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
    <div className={`clients-action-sheet-root ${phase === "closing" ? "is-closing" : ""}`}>
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
  stateFilter,
  clearFilters,
  setCategoryFilter,
  setStateFilter,
}: {
  compact: boolean;
  categoryFilter: string;
  stateFilter: string;
  clearFilters: () => void;
  setCategoryFilter: (value: string) => void;
  setStateFilter: (value: string) => void;
}) {
  if (categoryFilter === "all" && stateFilter === "all") return null;

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

function FilterPanel({
  activeFilterCount,
  applyFilters,
  cancelFilters,
  draftCategoryFilter,
  draftStateFilter,
  setDraftCategoryFilter,
  setDraftStateFilter,
}: {
  activeFilterCount: number;
  applyFilters: () => void;
  cancelFilters: () => void;
  draftCategoryFilter: string;
  draftStateFilter: string;
  setDraftCategoryFilter: (value: string) => void;
  setDraftStateFilter: (value: string) => void;
}) {
  return (
    <div className="clients-filter-panel" role="dialog" aria-modal="true" aria-label="Filter clients">
      <div className="clients-filter-panel-header">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-default">Filters</p>
          <p className="mt-0.5 text-xs text-faint">
            {activeFilterCount > 0 ? `${activeFilterCount} active` : "Category and state"}
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
          value={draftCategoryFilter}
          onChange={setDraftCategoryFilter}
          icon={<Filter className="h-4 w-4" />}
        />
        <LiquidGlassDropdown
          label="State"
          options={STATE_FILTERS}
          value={draftStateFilter}
          onChange={setDraftStateFilter}
          icon={<MapPin className="h-4 w-4" />}
        />
      </div>

      <div className="clients-filter-panel-actions">
        <button
          type="button"
          className="clients-text-button"
          onClick={() => {
            setDraftCategoryFilter("all");
            setDraftStateFilter("all");
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

function MorphingClientHeader({
  activeFilterCount,
  activeFilterLabel,
  applyFilters,
  cancelFilters,
  clearSearch,
  compact,
  draftCategoryFilter,
  draftStateFilter,
  filterOpen,
  filterPanelRef,
  isFiltered,
  isMobileViewport,
  loading,
  loadedClients,
  onAddClient,
  onSearchInputChange,
  openFilters,
  searchInput,
  setDraftCategoryFilter,
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
  draftStateFilter: string;
  filterOpen: boolean;
  filterPanelRef: React.RefObject<HTMLDivElement | null>;
  isFiltered: boolean;
  isMobileViewport: boolean;
  loading: boolean;
  loadedClients: number;
  onAddClient: () => void;
  onSearchInputChange: (value: string) => void;
  openFilters: () => void;
  searchInput: string;
  setDraftCategoryFilter: (value: string) => void;
  setDraftStateFilter: (value: string) => void;
  totalClients: number;
}) {
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
    <section
      className="clients-floating-header"
      data-compact={compact ? "true" : "false"}
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
              <>
                <button
                  type="button"
                  className="clients-filter-backdrop"
                  onClick={cancelFilters}
                  aria-label="Close filters"
                />
                <FilterPanel
                  activeFilterCount={activeFilterCount}
                  applyFilters={applyFilters}
                  cancelFilters={cancelFilters}
                  draftCategoryFilter={draftCategoryFilter}
                  draftStateFilter={draftStateFilter}
                  setDraftCategoryFilter={setDraftCategoryFilter}
                  setDraftStateFilter={setDraftStateFilter}
                />
              </>
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
    </section>
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
  onView,
}: {
  clients: Client[];
  onDelete: (client: Client) => void;
  onEdit: (client: Client) => void;
  onView: (clientId: string) => void;
}) {
  return (
    <div className="clients-table-wrap">
      <div className="clients-scan-table" role="table" aria-label="Clients">
        <div className="clients-table-head" role="row">
          <span>Client ID</span>
          <span>Company</span>
          <span>Category</span>
          <span>State</span>
          <span>Primary contact</span>
          <span>Phone / Email</span>
          <span>Created</span>
          <span>Actions</span>
        </div>

        <div className="clients-table-body">
          {clients.map((client, index) => {
            const primaryContact = getPrimaryContact(client);
            const primaryPhone = getPrimaryPhone(primaryContact);
            const primaryEmail = getPrimaryEmail(primaryContact);
            const contactLine = primaryPhone || primaryEmail || "No contact detail";

            return (
              <div
                key={client._id}
                role="row"
                tabIndex={0}
                className="clients-table-row"
                style={{ animationDelay: `${Math.min(index, 12) * 18}ms` }}
                onClick={() => onView(client.clientId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onView(client.clientId);
                  }
                }}
              >
                <span className="clients-id-cell" title={client.clientId}>{client.clientId}</span>
                <span className="clients-company-cell">
                  <span className="clients-company-avatar">
                    <Building2 className="h-[17px] w-[17px]" />
                  </span>
                  <span className="min-w-0">
                    <strong title={client.companyName}>{client.companyName}</strong>
                    <small title={client.legalName || `${(client.contacts || []).length} linked contacts`}>
                      {client.legalName || `${(client.contacts || []).length} linked contacts`}
                    </small>
                  </span>
                </span>
                <span><CategoryBadge category={client.category} /></span>
                <span className="clients-state-cell" title={client.state || "-"}>{client.state || "-"}</span>
                <span className="clients-contact-cell">
                  {primaryContact ? (
                    <>
                      <strong title={primaryContact.name}>{primaryContact.name}</strong>
                      <small title={primaryContact.designation || "Primary contact"}>
                        {primaryContact.designation || "Primary contact"}
                      </small>
                    </>
                  ) : (
                    <span className="clients-muted-inline">
                      <UserPlus className="h-3.5 w-3.5" />
                      No contact
                    </span>
                  )}
                </span>
                <span className="clients-contact-line" title={contactLine}>
                  {primaryPhone ? <Phone className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                  <span>{contactLine}</span>
                </span>
                <span className="clients-date-cell">{formatDate(client.createdAt)}</span>
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
  onView,
}: {
  activeClientId?: string;
  clients: Client[];
  onMore: (client: Client) => void;
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
  const [modalOpen, setModalOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftCategoryFilter, setDraftCategoryFilter] = useState("all");
  const [draftStateFilter, setDraftStateFilter] = useState("all");
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [toolbarCompact, setToolbarCompact] = useState(false);
  const [mobileActionsClient, setMobileActionsClient] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [totalClients, setTotalClients] = useState(0);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteClient, setDeleteClient] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const filterPanelRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

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
    const getThresholds = () => window.matchMedia("(max-width: 767px)").matches
      ? { compactAt: 118, expandBelow: 34 }
      : { compactAt: 190, expandBelow: 82 };
    let thresholds = getThresholds();
    let compact = scrollArea.scrollTop >= thresholds.compactAt;
    let lastScrollTop = scrollArea.scrollTop;
    setToolbarCompact(compact);

    const updateCompactState = () => {
      frame = 0;
      thresholds = getThresholds();
      const nextScrollTop = scrollArea.scrollTop;
      const scrollingDown = nextScrollTop >= lastScrollTop;
      lastScrollTop = nextScrollTop;
      const nextCompact = compact
        ? !(nextScrollTop <= thresholds.expandBelow && !scrollingDown)
        : nextScrollTop >= thresholds.compactAt && scrollingDown;

      if (nextCompact !== compact) {
        compact = nextCompact;
        setToolbarCompact(nextCompact);
      }
    };
    const handleScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateCompactState);
    };

    updateCompactState();
    scrollArea.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    return () => {
      scrollArea.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const { data: customFieldDefinitions } = useCache<ClientCustomFieldDefinition[]>(
    "/api/client-custom-fields",
    { enabled: modalOpen, initialData: [] }
  );

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    if (stateFilter !== "all") params.set("state", stateFilter);
    return params;
  }, [categoryFilter, search, stateFilter]);

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

  const loadClientsPage = useCallback(async (offset: number, replace: boolean) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    const params = new URLSearchParams(queryParams);
    params.set("limit", String(CLIENT_PAGE_SIZE));
    params.set("offset", String(offset));

    if (replace) {
      setLoading(true);
      setLoadError(null);
      setLoadMoreError(null);
    } else {
      setLoadingMore(true);
      setLoadMoreError(null);
    }

    try {
      const response = await fetch(`/api/clients?${params.toString()}`, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, replace ? "Unable to load clients." : "Unable to load more clients."));
      }

      const payload = await response.json() as ClientsPageResponse;
      if (requestId !== requestIdRef.current) return;

      setClients((current) => {
        if (replace) return payload.items || [];
        const seen = new Set(current.map((client) => client.clientId));
        return [...current, ...(payload.items || []).filter((client) => !seen.has(client.clientId))];
      });
      setTotalClients(Number(payload.total) || 0);
      setNextOffset(Number(payload.nextOffset) || 0);
      setHasMore(Boolean(payload.hasMore));
      setLoadError(null);
      setLoadMoreError(null);
    } catch (error) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      const message = error instanceof Error ? error.message : "Unable to load clients.";
      if (replace) setLoadError(message);
      else setLoadMoreError(message);
    } finally {
      if (requestId !== requestIdRef.current) return;
      if (replace) setLoading(false);
      else setLoadingMore(false);
    }
  }, [queryParams, readErrorMessage]);

  const refreshClients = useCallback(() => {
    void loadClientsPage(0, true);
  }, [loadClientsPage]);

  useEffect(() => {
    refreshClients();
    return () => abortRef.current?.abort();
  }, [refreshClients]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || loading || loadingMore || !hasMore || loadError) return;

    const root = document.getElementById("dashboard-scroll-area");
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
      if (filterOpen && !isMobileViewport && !filterPanelRef.current?.contains(target)) {
        setFilterOpen(false);
        setDraftCategoryFilter(categoryFilter);
        setDraftStateFilter(stateFilter);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setFilterOpen(false);
      setDraftCategoryFilter(categoryFilter);
      setDraftStateFilter(stateFilter);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [categoryFilter, filterOpen, isMobileViewport, stateFilter]);

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
    router.push(`/dashboard/clients/${clientId}`);
  }, [router]);

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
      const savedClient = await response.json();
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
      setClients((current) => current.filter((client) => client.clientId !== deletedClientId));
      setTotalClients((current) => Math.max(0, current - 1));
      setDeleteClient(null);
      toast.success("Client deleted");
      invalidate("/api/clients", "/api/dashboard");
    } finally {
      setDeleting(false);
    }
  };

  const clearFilters = useCallback(() => {
    setSearchInput("");
    setSearch("");
    setCategoryFilter("all");
    setStateFilter("all");
    setDraftCategoryFilter("all");
    setDraftStateFilter("all");
    setFilterOpen(false);
  }, []);

  const openFilters = useCallback(() => {
    setDraftCategoryFilter(categoryFilter);
    setDraftStateFilter(stateFilter);
    setFilterOpen(true);
  }, [categoryFilter, stateFilter]);

  const cancelFilters = useCallback(() => {
    setDraftCategoryFilter(categoryFilter);
    setDraftStateFilter(stateFilter);
    setFilterOpen(false);
  }, [categoryFilter, stateFilter]);

  const applyFilters = useCallback(() => {
    setCategoryFilter(draftCategoryFilter);
    setStateFilter(draftStateFilter);
    setFilterOpen(false);
  }, [draftCategoryFilter, draftStateFilter]);

  const isFiltered = Boolean(search || searchInput || categoryFilter !== "all" || stateFilter !== "all");
  const activeFilterCount = Number(categoryFilter !== "all") + Number(stateFilter !== "all");
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
          draftStateFilter={draftStateFilter}
          filterOpen={filterOpen}
          filterPanelRef={filterPanelRef}
          isFiltered={isFiltered}
          isMobileViewport={isMobileViewport}
          loading={loading}
          loadedClients={clients.length}
          onAddClient={openAdd}
          onSearchInputChange={setSearchInput}
          openFilters={openFilters}
          searchInput={searchInput}
          setDraftCategoryFilter={setDraftCategoryFilter}
          setDraftStateFilter={setDraftStateFilter}
          totalClients={totalClients}
        />

        <ActiveFilterChips
          compact={toolbarCompact}
          categoryFilter={categoryFilter}
          stateFilter={stateFilter}
          clearFilters={clearFilters}
          setCategoryFilter={setCategoryFilter}
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
                  onView={viewClient}
                />
              </div>
              <div className="clients-mobile-only">
                <ClientsMobileList
                  activeClientId={mobileActionsClient?.clientId}
                  clients={clients}
                  onMore={showMobileActions}
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
          <ClientMobileSheet ariaLabel="Filter clients" onClose={cancelFilters}>
            {(close) => (
              <>
                <div className="clients-action-sheet-card clients-filter-sheet-card">
                  <FilterPanel
                    activeFilterCount={activeFilterCount}
                    applyFilters={() => close(applyFilters)}
                    cancelFilters={() => close(cancelFilters)}
                    draftCategoryFilter={draftCategoryFilter}
                    draftStateFilter={draftStateFilter}
                    setDraftCategoryFilter={setDraftCategoryFilter}
                    setDraftStateFilter={setDraftStateFilter}
                  />
                </div>
                <div className="clients-action-sheet-card clients-action-sheet-cancel-card" style={{ animationDelay: "200ms" }}>
                  <button type="button" className="clients-sheet-action-button cancel" onClick={() => close(cancelFilters)}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </ClientMobileSheet>
        )}

        <ClientFormModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          client={editClient}
          customFieldDefinitions={customFieldDefinitions}
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

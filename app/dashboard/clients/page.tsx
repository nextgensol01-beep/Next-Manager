"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import ConfirmModal from "@/components/ui/ConfirmModal";
import LiquidGlassButton from "@/components/ui/LiquidGlassButton";
import { STATES, CATEGORIES, formatDate } from "@/lib/utils";
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
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useCache, invalidate } from "@/lib/useCache";
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
const clientButtonClass = "clients-apple-button";

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
  return (
    <AnimatePresence>
      {(categoryFilter !== "all" || stateFilter !== "all") && (
        <motion.div
          className="clients-filter-chip-layer"
          data-compact={compact ? "true" : "false"}
          initial={{ opacity: 0, y: 28, scale: 0.96, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: 18, scale: 0.97, filter: "blur(6px)" }}
          transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.8 }}
        >
          <motion.div
            className="clients-active-filters"
            initial="hidden"
            animate="show"
            exit="hidden"
            variants={{
              hidden: {},
              show: {
                transition: {
                  staggerChildren: 0.035,
                  delayChildren: 0.08,
                },
              },
            }}
          >
            {categoryFilter !== "all" && (
              <motion.button
                type="button"
                onClick={() => setCategoryFilter("all")}
                variants={{
                  hidden: { opacity: 0, y: 14, scale: 0.96 },
                  show: { opacity: 1, y: 0, scale: 1 },
                }}
                transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.8 }}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
              >
                {categoryFilter}<X className="h-3.5 w-3.5" />
              </motion.button>
            )}
            {stateFilter !== "all" && (
              <motion.button
                type="button"
                onClick={() => setStateFilter("all")}
                variants={{
                  hidden: { opacity: 0, y: 14, scale: 0.96 },
                  show: { opacity: 1, y: 0, scale: 1 },
                }}
                transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.8 }}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
              >
                {stateFilter}<X className="h-3.5 w-3.5" />
              </motion.button>
            )}
            <motion.button
              type="button"
              className="clients-clear-all"
              onClick={clearFilters}
              variants={{
                hidden: { opacity: 0, y: 14, scale: 0.96 },
                show: { opacity: 1, y: 0, scale: 1 },
              }}
              transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.8 }}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
            >
              Clear all
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MorphingClientToolbar({
  compact,
  loading,
  totalClients,
  loadedClients,
  loadedContacts,
  isFiltered,
  activeFilterCount,
  activeFilterLabel,
  searchInput,
  onSearchInputChange,
  onClearSearch,
  filterOpen,
  isMobileViewport,
  filterPanelRef,
  openFilters,
  cancelFilters,
  applyFilters,
  draftCategoryFilter,
  draftStateFilter,
  setDraftCategoryFilter,
  setDraftStateFilter,
  onContacts,
  onAddClient,
}: {
  compact: boolean;
  loading: boolean;
  totalClients: number;
  loadedClients: number;
  loadedContacts: number;
  isFiltered: boolean;
  activeFilterCount: number;
  activeFilterLabel: string;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onClearSearch: () => void;
  filterOpen: boolean;
  isMobileViewport: boolean;
  filterPanelRef: React.RefObject<HTMLDivElement | null>;
  openFilters: () => void;
  cancelFilters: () => void;
  applyFilters: () => void;
  draftCategoryFilter: string;
  draftStateFilter: string;
  setDraftCategoryFilter: (value: string) => void;
  setDraftStateFilter: (value: string) => void;
  onContacts: () => void;
  onAddClient: () => void;
}) {
  const summaryLabel = loading
    ? "Loading directory"
    : `${totalClients.toLocaleString("en-IN")} ${isFiltered ? "matching" : "total"}`;

  const searchControl = (variant: "main" | "dock") => (
    <label className={`clients-search-field clients-search-field-${variant}`}>
      <Search className="h-[18px] w-[18px] shrink-0" />
      <input
        className="min-w-0 flex-1 bg-transparent text-[15px] text-default outline-none placeholder:text-faint"
        placeholder={variant === "dock" ? "Search" : "Search clients, contacts, GST or ID"}
        value={searchInput}
        onChange={(event) => onSearchInputChange(event.target.value)}
      />
      {searchInput && (
        <button
          type="button"
          className="clients-search-clear"
          onClick={onClearSearch}
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </label>
  );

  const filterButton = (variant: "toolbar" | "dock") => (
    <button
      type="button"
      className={`clients-filter-button clients-filter-button-${variant}`}
      aria-label={activeFilterCount > 0 ? `Filter clients, ${activeFilterCount} active` : "Filter clients"}
      aria-expanded={filterOpen}
      aria-haspopup="dialog"
      onClick={() => filterOpen ? cancelFilters() : openFilters()}
    >
      <Filter className="h-4 w-4" />
      <span>Filter</span>
      {activeFilterCount > 0 && <span className="clients-filter-count">{activeFilterCount}</span>}
    </button>
  );

  return (
    <section
      className="clients-morph-toolbar"
      data-compact={compact ? "true" : "false"}
      aria-label="Client directory controls"
    >
      <div className="clients-morph-toolbar-inner">
        <div className="clients-toolbar-copy">
          <p className="clients-eyebrow">Directory</p>
          <h1 className="clients-page-title text-default">Clients</h1>
          <p className="clients-page-subtitle">Manage and organize client relationships</p>
          <div className="clients-toolbar-metrics" aria-live="polite">
            <span>{summaryLabel}</span>
            {!loading && <span>{loadedClients.toLocaleString("en-IN")} loaded</span>}
            {!loading && <span>{loadedContacts.toLocaleString("en-IN")} linked contacts</span>}
            <span>{activeFilterLabel}</span>
          </div>
        </div>

        <div className="clients-toolbar-controls">
          <div className="clients-toolbar-search-slot">
            {searchControl("main")}
          </div>

          <div className="clients-toolbar-actions">
            <div className="clients-filter-anchor" ref={filterPanelRef}>
              {filterButton("toolbar")}

              {filterOpen && !isMobileViewport && (
                <>
                  <button type="button" className="clients-filter-backdrop" onClick={cancelFilters} aria-label="Close filters" />
                  <div className="clients-filter-panel" role="dialog" aria-modal="true" aria-label="Filter clients">
                    <div className="clients-filter-panel-header">
                      <div>
                        <p className="text-base font-semibold text-default">Filter clients</p>
                        <p className="mt-0.5 text-xs text-faint">Narrow the directory by category and state.</p>
                      </div>
                      <button type="button" className="clients-icon-control" onClick={cancelFilters} aria-label="Close filters">
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <label className="clients-filter-field">
                      <span>Category</span>
                      <select value={draftCategoryFilter} onChange={(event) => setDraftCategoryFilter(event.target.value)}>
                        {CATEGORY_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>

                    <label className="clients-filter-field">
                      <span>State</span>
                      <select value={draftStateFilter} onChange={(event) => setDraftStateFilter(event.target.value)}>
                        {STATE_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>

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
                      <div className="flex gap-2">
                        <button type="button" className="clients-secondary-button" onClick={cancelFilters}>Cancel</button>
                        <button type="button" className="clients-primary-button" onClick={applyFilters}>
                          <Check className="h-4 w-4" />
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <button type="button" className="clients-contact-button" onClick={onContacts}>
              <UserPlus className="h-4 w-4" />
              <span>Contacts</span>
            </button>

            <button type="button" className="clients-add-button" onClick={onAddClient}>
              <Plus className="h-4 w-4" />
              <span>Add Client</span>
            </button>
          </div>
        </div>
      </div>

      <div className="clients-mobile-dock" aria-label="Client quick controls">
        {searchControl("dock")}
        {filterButton("dock")}
        <button type="button" className="clients-mobile-add" onClick={onAddClient} aria-label="Add Client">
          <Plus className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
}

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
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobileViewport(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const scrollArea = document.getElementById("dashboard-scroll-area");
    if (!scrollArea) return;

    let frame = 0;
    const updateCompactState = () => {
      frame = 0;
      setToolbarCompact(scrollArea.scrollTop >= 128);
    };
    const handleScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateCompactState);
    };

    updateCompactState();
    scrollArea.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      scrollArea.removeEventListener("scroll", handleScroll);
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

  const openAdd = () => {
    setEditClient(null);
    setModalOpen(true);
  };

  const openEdit = (client: Client) => {
    setEditClient(client);
    setModalOpen(true);
  };

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

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setCategoryFilter("all");
    setStateFilter("all");
    setDraftCategoryFilter("all");
    setDraftStateFilter("all");
    setFilterOpen(false);
  };

  const openFilters = () => {
    setDraftCategoryFilter(categoryFilter);
    setDraftStateFilter(stateFilter);
    setFilterOpen(true);
  };

  const cancelFilters = () => {
    setDraftCategoryFilter(categoryFilter);
    setDraftStateFilter(stateFilter);
    setFilterOpen(false);
  };

  const applyFilters = () => {
    setCategoryFilter(draftCategoryFilter);
    setStateFilter(draftStateFilter);
    setFilterOpen(false);
  };

  const isFiltered = Boolean(search || searchInput || categoryFilter !== "all" || stateFilter !== "all");
  const loadedContacts = clients.reduce((sum, client) => sum + (client.contacts?.length ?? 0), 0);
  const activeFilterCount = Number(categoryFilter !== "all") + Number(stateFilter !== "all");
  const activeFilterLabel = activeFilterCount === 0
    ? "No filters"
    : `${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}`;

  const renderBottomState = () => {
    if (loading || loadError || clients.length === 0) return null;

    if (loadingMore) {
      return (
        <div className="py-5 flex items-center justify-center">
          <LoadingSpinner />
        </div>
      );
    }

    if (loadMoreError) {
      return (
        <div className="py-5 flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-amber-700 dark:text-amber-300">{loadMoreError}</p>
          <LiquidGlassButton
            type="button"
            size="sm"
            className={clientButtonClass}
            onClick={() => loadClientsPage(nextOffset, false)}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </LiquidGlassButton>
        </div>
      );
    }

    if (!hasMore) {
      return (
        <p className="py-5 text-center text-xs text-faint">
          Showing all {totalClients.toLocaleString("en-IN")} client{totalClients === 1 ? "" : "s"}.
        </p>
      );
    }

    return <div ref={sentinelRef} className="h-8" aria-hidden="true" />;
  };

  return (
    <div className="clients-page min-h-screen">
      <div className="clients-directory">
        <MorphingClientToolbar
          compact={toolbarCompact}
          loading={loading}
          totalClients={totalClients}
          loadedClients={clients.length}
          loadedContacts={loadedContacts}
          isFiltered={isFiltered}
          activeFilterCount={activeFilterCount}
          activeFilterLabel={activeFilterLabel}
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          onClearSearch={() => {
            setSearchInput("");
            setSearch("");
          }}
          filterOpen={filterOpen}
          isMobileViewport={isMobileViewport}
          filterPanelRef={filterPanelRef}
          openFilters={openFilters}
          cancelFilters={cancelFilters}
          applyFilters={applyFilters}
          draftCategoryFilter={draftCategoryFilter}
          draftStateFilter={draftStateFilter}
          setDraftCategoryFilter={setDraftCategoryFilter}
          setDraftStateFilter={setDraftStateFilter}
          onContacts={() => router.push("/dashboard/contacts")}
          onAddClient={openAdd}
        />
        <ActiveFilterChips
          compact={toolbarCompact}
          categoryFilter={categoryFilter}
          stateFilter={stateFilter}
          clearFilters={clearFilters}
          setCategoryFilter={setCategoryFilter}
          setStateFilter={setStateFilter}
        />
        <header className="clients-directory-header">
          <div className="clients-title-block min-w-0">
            <p className="clients-eyebrow">Directory</p>
            <h1 className="clients-page-title text-default">Clients</h1>
            <p className="clients-page-subtitle">
              A refined command centre for company profiles, linked contacts, registration details, and quick client actions.
            </p>
          </div>

          <div className="clients-header-actions">
            <LiquidGlassButton
              type="button"
              onClick={() => router.push("/dashboard/contacts")}
              size="sm"
              className={clientButtonClass}
            >
              <UserPlus className="w-4 h-4" />
              <span>Contacts</span>
            </LiquidGlassButton>
            <LiquidGlassButton
              type="button"
              onClick={openAdd}
              variant="primary"
              size="sm"
              className={clientButtonClass}
            >
              <Plus className="w-4 h-4" />
              <span>Add Client</span>
            </LiquidGlassButton>
          </div>
        </header>

        <section className="clients-overview-grid" aria-label="Client directory overview">
          <div className="clients-overview-card clients-overview-card-primary">
            <div className="clients-overview-icon"><Building2 className="h-4 w-4" /></div>
            <div>
              <span>Total directory</span>
              <strong>{loading ? "—" : totalClients.toLocaleString("en-IN")}</strong>
              <p>{isFiltered ? "matching current search" : "client records"}</p>
            </div>
          </div>
          <div className="clients-overview-card">
            <div className="clients-overview-icon"><Users className="h-4 w-4" /></div>
            <div>
              <span>Loaded now</span>
              <strong>{loading ? "—" : clients.length.toLocaleString("en-IN")}</strong>
              <p>visible in this view</p>
            </div>
          </div>
          <div className="clients-overview-card">
            <div className="clients-overview-icon"><Phone className="h-4 w-4" /></div>
            <div>
              <span>Linked contacts</span>
              <strong>{loading ? "—" : loadedContacts.toLocaleString("en-IN")}</strong>
              <p>available contact points</p>
            </div>
          </div>
          <div className="clients-overview-card clients-overview-card-filter">
            <div className="clients-overview-icon"><Sparkles className="h-4 w-4" /></div>
            <div>
              <span>View state</span>
              <strong>{activeFilterLabel}</strong>
              <p>{searchInput || search ? "search is active" : "ready to browse"}</p>
            </div>
          </div>
        </section>

        <section className="clients-directory-surface">
          <div className="clients-toolbar">
            <label className="clients-search-field">
              <Search className="h-[18px] w-[18px] shrink-0" />
              <input
            className="min-w-0 flex-1 bg-transparent text-[15px] text-default outline-none placeholder:text-faint"
            placeholder="Search clients, contacts, GST or ID"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          {searchInput && (
            <button
              type="button"
              className="clients-search-clear"
              onClick={() => {
                setSearchInput("");
                setSearch("");
              }}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </label>

        <div className="clients-filter-anchor">
          <button
            type="button"
            className="clients-filter-button"
            aria-label={activeFilterCount > 0 ? `Filter clients, ${activeFilterCount} active` : "Filter clients"}
            aria-expanded={filterOpen}
            aria-haspopup="dialog"
            onClick={() => filterOpen ? cancelFilters() : openFilters()}
          >
            <Filter className="h-4 w-4" />
            <span>Filter</span>
            {activeFilterCount > 0 && <span className="clients-filter-count">{activeFilterCount}</span>}
          </button>

          {filterOpen && !isMobileViewport && (
            <>
              <button type="button" className="clients-filter-backdrop" onClick={cancelFilters} aria-label="Close filters" />
              <div className="clients-filter-panel" role="dialog" aria-modal="true" aria-label="Filter clients">
                <div className="clients-filter-panel-header">
                  <div>
                    <p className="text-base font-semibold text-default">Filter clients</p>
                    <p className="mt-0.5 text-xs text-faint">Narrow the directory by category and state.</p>
                  </div>
                  <button type="button" className="clients-icon-control" onClick={cancelFilters} aria-label="Close filters">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <label className="clients-filter-field">
                  <span>Category</span>
                  <select value={draftCategoryFilter} onChange={(event) => setDraftCategoryFilter(event.target.value)}>
                    {CATEGORY_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>

                <label className="clients-filter-field">
                  <span>State</span>
                  <select value={draftStateFilter} onChange={(event) => setDraftStateFilter(event.target.value)}>
                    {STATE_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>

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
                  <div className="flex gap-2">
                    <button type="button" className="clients-secondary-button" onClick={cancelFilters}>Cancel</button>
                    <button type="button" className="clients-primary-button" onClick={applyFilters}>
                      <Check className="h-4 w-4" />
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="clients-directory-state">
          <LoadingSpinner />
          <p>Loading clients...</p>
        </div>
      ) : loadError ? (
        <div className="clients-directory-state">
          <span className="clients-state-symbol clients-state-symbol-error"><CircleAlert className="h-5 w-5" /></span>
          <p className="font-semibold text-default">Unable to load clients</p>
          <span>{loadError}</span>
          <LiquidGlassButton type="button" size="sm" className={clientButtonClass} onClick={refreshClients}>
            <RefreshCw className="h-3.5 w-3.5" />Retry
          </LiquidGlassButton>
        </div>
      ) : clients.length === 0 ? (
        <div className="clients-directory-state">
          <span className="clients-state-symbol"><Building2 className="h-5 w-5" /></span>
          <p className="font-semibold text-default">No clients found</p>
          <span>{isFiltered ? "Try adjusting your search or filters." : "Add your first client to begin."}</span>
          {isFiltered ? (
            <button type="button" className="clients-secondary-button" onClick={clearFilters}>Clear filters</button>
          ) : (
            <button type="button" className="clients-primary-button" onClick={openAdd}><Plus className="h-4 w-4" />Add Client</button>
          )}
        </div>
      ) : (
        <>
          <div className="clients-list-heading" aria-hidden="true">
            <span>Company</span><span>Category</span><span>Primary contact</span><span>State</span><span>Added</span><span />
          </div>

          <div className="clients-desktop-list">
            {clients.map((client) => {
              const contacts = client.contacts || [];
              const primaryContact = contacts[0] || null;
              const primaryPhone = primaryContact?.phoneNumbers?.[0] || primaryContact?.mobile || "";
              const primaryEmail = primaryContact?.emails?.[0] || primaryContact?.email || "";
              return (
                <div
                  key={client._id}
                  role="link"
                  tabIndex={0}
                  className="clients-list-row"
                  onClick={() => router.push(`/dashboard/clients/${client.clientId}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/dashboard/clients/${client.clientId}`);
                    }
                  }}
                >
                  <div className="clients-company-cell">
                    <span className="clients-company-avatar"><Building2 className="h-[18px] w-[18px]" /></span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-default">{client.companyName}</p>
                      <div className="clients-company-meta">
                        <span>{client.clientId}</span>
                        <span>{client.legalName || client.gstNumber || `${contacts.length} contact${contacts.length === 1 ? "" : "s"}`}</span>
                      </div>
                    </div>
                  </div>
                  <div><CategoryBadge category={client.category} /></div>
                  <div className="clients-contact-cell">
                    {primaryContact ? (
                      <>
                        <p className="truncate font-medium text-default">{primaryContact.name}</p>
                        <span>{primaryPhone ? <Phone className="h-3 w-3" /> : <Mail className="h-3 w-3" />}{primaryPhone || primaryEmail || "Contact linked"}</span>
                      </>
                    ) : <span className="clients-no-contact"><UserPlus className="h-3.5 w-3.5" />No contact</span>}
                  </div>
                  <span className="clients-location"><MapPin className="h-3.5 w-3.5" />{client.state || "-"}</span>
                  <span className="clients-added-date">{formatDate(client.createdAt)}</span>
                  <div className="clients-row-actions">
                    <button type="button" onClick={(event) => { event.stopPropagation(); router.push(`/dashboard/clients/${client.clientId}`); }} aria-label={`View ${client.companyName}`} title="View profile"><Eye className="h-4 w-4" /></button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); openEdit(client); }} aria-label={`Edit ${client.companyName}`} title="Edit client"><Pencil className="h-4 w-4" /></button>
                    <button type="button" className="clients-danger-action" onClick={(event) => { event.stopPropagation(); setDeleteClient(client); }} aria-label={`Delete ${client.companyName}`} title="Delete client"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="clients-mobile-list">
            {clients.map((client) => {
              const contacts = client.contacts || [];
              const primaryContact = contacts[0] || null;
              const primaryPhone = primaryContact?.phoneNumbers?.[0] || primaryContact?.mobile || "";
              return (
                <article key={client._id} className="clients-mobile-row">
                  <button
                    type="button"
                    className="clients-mobile-row-main"
                    onClick={() => {
                      setMobileActionsClient(null);
                      router.push(`/dashboard/clients/${client.clientId}`);
                    }}
                  >
                    <span className="min-w-0 flex-1 text-left">
                      <span className="clients-mobile-title-line">
                        <strong className="truncate">{client.companyName}</strong>
                        <CategoryBadge category={client.category} />
                      </span>
                      <span className="clients-mobile-meta">
                        <span>{client.clientId}</span>
                        <span><MapPin className="h-3 w-3" />{client.state || "-"}</span>
                      </span>
                      <span className="clients-mobile-contact">
                        {primaryContact ? `${primaryContact.name}${primaryPhone ? ` - ${primaryPhone}` : ""}` : "No linked contact"}
                      </span>
                    </span>
                  </button>

                  <div className="clients-mobile-actions-wrap">
                    <button
                      type="button"
                      className="clients-mobile-more"
                      aria-label={`More actions for ${client.companyName}`}
                      aria-expanded={mobileActionsClient?.clientId === client.clientId}
                      onClick={() => setMobileActionsClient(client)}
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                  </div>
                </article>
              );
            })}
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
                <button type="button" className="clients-sheet-action-button" style={{ animationDelay: "60ms" }} onClick={() => close(() => openEdit(mobileActionsClient))}>
                  <Pencil className="h-5 w-5" />
                  Edit Client
                </button>
                <button type="button" className="clients-sheet-action-button danger" style={{ animationDelay: "90ms" }} onClick={() => close(() => setDeleteClient(mobileActionsClient))}>
                  <Trash2 className="h-5 w-5" />
                  Delete Client
                </button>
              </div>
              <div className="clients-action-sheet-card clients-action-sheet-cancel-card" style={{ animationDelay: "140ms" }}>
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
                <div className="clients-filter-sheet-header" style={{ animationDelay: "60ms" }}>
                  <div>
                    <p className="text-base font-semibold text-default">Filter clients</p>
                    <p className="mt-0.5 text-xs text-faint">Narrow the directory by category and state.</p>
                  </div>
                  <button type="button" className="clients-filter-sheet-close" onClick={() => close(cancelFilters)} aria-label="Close filters">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <label className="clients-filter-field clients-filter-sheet-row" style={{ animationDelay: "90ms" }}>
                  <span>Category</span>
                  <select value={draftCategoryFilter} onChange={(event) => setDraftCategoryFilter(event.target.value)}>
                    {CATEGORY_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="clients-filter-field clients-filter-sheet-row" style={{ animationDelay: "120ms" }}>
                  <span>State</span>
                  <select value={draftStateFilter} onChange={(event) => setDraftStateFilter(event.target.value)}>
                    {STATE_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <div className="clients-filter-sheet-actions clients-filter-sheet-row" style={{ animationDelay: "150ms" }}>
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
                  <button type="button" className="clients-primary-button" onClick={() => close(applyFilters)}>
                    <Check className="h-4 w-4" />
                    Apply
                  </button>
                </div>
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

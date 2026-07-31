"use client";
import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import { useMotionValue, useReducedMotion, useScroll, useSpring } from "framer-motion";
import { FINANCIAL_YEARS, formatCurrency, formatDate, PAYMENT_MODES } from "@/lib/utils";
import { buildInvoiceCoverageSummary } from "@/lib/invoiceCoverage";
import { findCpcbRegistrationDate, isDateInFinancialYear } from "@/lib/currentFyRegistration";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { invalidate, useCache } from "@/lib/useCache";
import ClientFormModal from "@/components/clients/ClientFormModal";
import type { ClientFormData } from "@/components/clients/ClientFormModal";
import { usePendingList } from "@/lib/usePendingList";
import {
  clientWorkspaceKey,
  fetchClientWorkspace,
} from "@/lib/clientWorkspaceCache";
import type { ClientCustomFieldDefinition } from "@/lib/clientCustomFields";
import FYTabBar from "@/components/ui/FYTabBar";
import { useFinancialYearState } from "@/app/providers";
import ClientProfileActivityTimeline from "./ClientProfileActivityTimeline";
import ClientProfileBillingPayments, { FinancialOverviewPanel } from "./ClientProfileBillingPayments";
import ClientProfileFinancialSummary from "./ClientProfileFinancialSummary";
import ClientProfileModals from "./ClientProfileModals";
import DocumentUploadModal from "./DocumentUploadModal";
import {
  ClientProfileHeader,
  CompanyOverview,
  DocumentsSection,
  EmptyProfileState,
  FloatingActionBar,
  HealthDashboard,
  NotesSection,
  QuickActions,
  type ClientProfileCustomField,
  type ClientProfileMetric,
  type ClientProfileQuickAction,
} from "./ClientProfilePremiumSections";
import {
  AnnualReturnTracker,
  AnnualReturnProgressPanel,
  BillingWorkflowPanel,
  ClientAlerts,
  ClientProfileSecondaryWorkspace,
  ClientPrimaryTabs,
  ComplianceStatusPanel,
  ComplianceWorkspace,
  CpcbUploadSummary,
  DOCUMENTS_NAV,
  FINANCIAL_NAV,
  INVOICE_RECEIVED_VIA_OPTIONS,
  INVOICE_STATUS_OPTIONS,
  InvoiceMonthSelector,
  InvoiceTrackingWorkspace,
  getComplianceNavStates,
  NOTES_TASKS_NAV,
  RegistrationDetails,
  TIMELINE_NAV,
  selectedMonthsToInvoiceRanges,
  type AnnualReturnRecord,
  type AnnualReturnProgressStep,
  type ClientProfileAlert,
  type ClientProfileTabId,
  type ComplianceSectionId,
  type DocumentsSectionId,
  type FinancialSectionId,
  type InvoiceMonthStatus,
  type InvoiceReceivedVia,
  type NotesTasksSectionId,
  type QuotationSummary,
  type RegistrationSignal,
  type TimelineSectionId,
} from "./ClientProfileWorkspaceSections";
import {
  AlertCircle, BarChart2, Building2, Calendar, CheckCircle2, ClipboardCheck, FileText, FileUp,
  Hash, Mail, MapPin, Pencil, Phone, Receipt, Send,
  Shield, Target, Trash2, Upload, User, Wallet, Zap
} from "lucide-react";
import {
  ACTIVITY_PAGE_SIZE,
  ACTIVITY_RANGES,
  buildEntryValueMap,
  buildFyEntries,
  buildLinkedContactEmailOptions,
  CAT_IDS,
  CATS,
  createEmptyFyEntries,
  CREDIT_TYPES,
  getContactEmails,
  getContactPhones,
  getLatestTimestamp,
  normalizeEmailList,
  normalizePhoneList,
  restoreSuggestion,
  sumFyEntries,
  syncEntrySelections,
  todayInputValue,
  type ActivityFilter,
  type ActivityItem,
  type ActivityRange,
  type ActivityResponse,
  type Billing,
  type Client,
  type Document,
  type DocumentCategory,
  type EmailOption,
  type FYRecord,
  type InvoiceTrackingRecord,
  type Payment,
  type PersonEntry,
  type UploadRecord,
} from "./ClientProfileSupport";

const INVOICE_TYPE_OPTIONS = [
  { id: "sale", label: "Sale Invoice" },
  { id: "purchase", label: "Purchase Invoice" },
] as const;

const RECEIVED_VIA_OPTIONS = INVOICE_RECEIVED_VIA_OPTIONS;

type InvoiceType = (typeof INVOICE_TYPE_OPTIONS)[number]["id"];
type ReceivedVia = InvoiceReceivedVia;
type InvoiceStatus = InvoiceMonthStatus;

type ClientWorkspacePayload = {
  client: Client;
  financialYears: FYRecord[];
  documents: Document[];
  billings: Billing[];
  payments: Payment[];
  invoices: InvoiceTrackingRecord[];
  uploadRecords: UploadRecord[];
  annualReturns: AnnualReturnRecord[];
  failedSections: string[];
  fetchedAt: string;
};

type ClientSectionDestination =
  | { primary: "overview" }
  | { primary: "compliance"; secondary: ComplianceSectionId }
  | { primary: "financial"; secondary: FinancialSectionId }
  | { primary: "documents"; secondary: DocumentsSectionId }
  | { primary: "timeline"; secondary: TimelineSectionId }
  | { primary: "notes"; secondary: NotesTasksSectionId };

const CUSTOM_FIELD_ICON_COMPONENTS = {
  fileText: FileText,
  building: Building2,
  hash: Hash,
  user: User,
  mapPin: MapPin,
  phone: Phone,
  mail: Mail,
  calendar: Calendar,
  shield: Shield,
} as const;

export default function ClientProfilePage() {
  const { data: session, status: sessionStatus } = useSession();
  const canManageDocuments = (session?.user as { role?: string } | undefined)?.role === "admin";
  const { clientId } = useParams<{ clientId: string }>();
  const router = useRouter();
  const profileScrollY = useMotionValue(0);
  const { scrollY: viewportScrollY } = useScroll();
  const headerProgressTarget = useMotionValue(0);
  const headerProgress = useSpring(headerProgressTarget, {
    stiffness: 360,
    damping: 42,
    mass: 0.8,
    restDelta: 0.001,
    restSpeed: 0.001,
  });
  const dashboardScrollRef = useRef<HTMLElement | null>(null);
  const headerCollapsedRef = useRef(false);
  const workspaceNavigationLockRef = useRef(false);
  const workspaceTabScrollOffsetsRef = useRef<Partial<Record<ClientProfileTabId, number>>>({});
  const primaryTabsRef = useRef<HTMLElement | null>(null);
  const workspaceHeadRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const navigationFrameRef = useRef<number | null>(null);
  const navigationHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationScrollCleanupRef = useRef<(() => void) | null>(null);
  const workspaceSnapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspaceSnapActiveRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();

  const [client, setClient] = useState<Client | null>(null);
  const [fyRecords, setFyRecords] = useState<FYRecord[]>([]);
  const { items: allBillings, setAll: setAllBillings, addItem: addBillingItem, editItem: editBillingItem, deleteItem: deleteBillingItem } = usePendingList<Billing>();
  const { items: allPayments, setAll: setAllPayments, addItem: addPaymentItem, editItem: editPaymentItem, deleteItem: deletePaymentItem } = usePendingList<Payment>();
  const { items: allInvoices, setAll: setAllInvoices, addItem: addInvoiceItem } = usePendingList<InvoiceTrackingRecord>();
  const { items: allUploadRecords, setAll: setAllUploadRecords, addItem: addUploadItem } = usePendingList<UploadRecord>();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [annualReturns, setAnnualReturns] = useState<AnnualReturnRecord[]>([]);
  const [linkedQuotations, setLinkedQuotations] = useState<QuotationSummary[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [activitiesTotal, setActivitiesTotal] = useState(0);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [activityOffset, setActivityOffset] = useState(0);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityRange, setActivityRange] = useState<ActivityRange>("30d");
  const [latestEmailActivity, setLatestEmailActivity] = useState<ActivityItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [selectedFy, setSelectedFy] = useFinancialYearState();
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const clientRef = useRef<Client | null>(null);
  const activityRequestIdRef = useRef(0);
  const sessionScope = String(
    session?.user?.email ||
    (session?.user as { id?: string } | undefined)?.id ||
    ""
  );
  const workspaceKey = clientWorkspaceKey(clientId, sessionScope);
  const {
    data: workspaceData,
    error: workspaceError,
    isLoading: workspaceLoading,
    mutate: mutateWorkspace,
  } = useSWR<ClientWorkspacePayload>(
    sessionStatus === "authenticated" ? workspaceKey : null,
    fetchClientWorkspace,
    {
      dedupingInterval: 10_000,
      keepPreviousData: false,
      revalidateIfStale: true,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  );

  // UI state
  const [activePrimaryTab, setActivePrimaryTab] = useState<ClientProfileTabId>("overview");
  const [activeComplianceSection, setActiveComplianceSection] = useState<ComplianceSectionId>("status");
  const [activeFinancialSection, setActiveFinancialSection] = useState<FinancialSectionId>("overview");
  const [activeDocumentsSection, setActiveDocumentsSection] = useState<DocumentsSectionId>("all");
  const [activeTimelineSection, setActiveTimelineSection] = useState<TimelineSectionId>("all");
  const [activeNotesSection, setActiveNotesSection] = useState<NotesTasksSectionId>("notes");
  const [workspacePinned, setWorkspacePinned] = useState(false);
  const [workspaceMinHeight, setWorkspaceMinHeight] = useState(0);
  const [workspaceHighlighted, setWorkspaceHighlighted] = useState(false);
  const [secondaryNavCollapsed, setSecondaryNavCollapsed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [docModal, setDocModal] = useState(false);
  const [docForm, setDocForm] = useState({ documentName: "", driveLink: "", category: "other" as DocumentCategory });
  const [documentUploadOpen, setDocumentUploadOpen] = useState(false);
  const [docModalMode, setDocModalMode] = useState<"create" | "edit">("create");
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [documentPendingDelete, setDocumentPendingDelete] = useState<Document | null>(null);
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState<{
    financialYear: string;
    invoiceType: InvoiceType | "";
    status: InvoiceStatus;
    receivedVia: ReceivedVia | "";
    selectedMonths: string[];
    remarks: string;
  }>({
    financialYear: selectedFy,
    invoiceType: "",
    status: "Received",
    receivedVia: "",
    selectedMonths: [],
    remarks: "",
  });
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    financialYear: selectedFy,
    uploadType: "sale" as "sale" | "purchase",
    cat1: "0",
    cat2: "0",
    cat3: "0",
    cat4: "0",
    invoiceCount: "0",
  });
  const [billingModal, setBillingModal] = useState(false);
  const [editingBillingId, setEditingBillingId] = useState<string | null>(null);
  const [billingForm, setBillingForm] = useState({
    financialYear: selectedFy,
    govtCharges: "0",
    consultancyCharges: "0",
    targetCharges: "0",
    otherCharges: "0",
    notes: "",
  });
  const [paymentModal, setPaymentModal] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    financialYear: selectedFy,
    paymentType: "billing" as "billing" | "advance",
    amountPaid: "",
    paymentDate: todayInputValue(),
    paymentMode: PAYMENT_MODES[0] || "NEFT",
    referenceNumber: "",
    notes: "",
  });
  const [fyModal, setFyModal] = useState(false);
  const [fyForm, setFyForm] = useState({
    financialYear: selectedFy,
    generated: createEmptyFyEntries(),
    targets: createEmptyFyEntries(),
  });
  const [reminderModal, setReminderModal] = useState(false);
  const [activeReminderBillingId, setActiveReminderBillingId] = useState<string | null>(null);
  const [reminderRecipients, setReminderRecipients] = useState<EmailOption[]>([]);
  const [reminderSuggestions, setReminderSuggestions] = useState<EmailOption[]>([]);
  const [reminderSuggestionCatalog, setReminderSuggestionCatalog] = useState<EmailOption[]>([]);
  const [customReminderEmail, setCustomReminderEmail] = useState("");
  const [reminderForm, setReminderForm] = useState({ subject: "", message: "" });
  const [reminderPreviewHtml, setReminderPreviewHtml] = useState<string | null>(null);
  const [reminderSending, setReminderSending] = useState(false);
  const [inlineSaving, setInlineSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showAllCustomProfileInfo, setShowAllCustomProfileInfo] = useState(false);
  const { data: customFieldDefinitions } = useCache<ClientCustomFieldDefinition[]>("/api/client-custom-fields", { initialData: [] });
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sectionOpen, setSectionOpen] = useState({
    contacts: true,
    portal: false,
    documents: true,
    recentActivity: true,
  });

  // Edit client modal
  const [editModal, setEditModal] = useState(false);
  const [editInitialTab, setEditInitialTab] = useState<"basic" | "portal">("basic");
  const [saving, setSaving] = useState(false);

  // Breakdown modal
  const [breakdownRec, setBreakdownRec] = useState<FYRecord | null>(null);

  useEffect(() => {
    clientRef.current = client;
  }, [client]);

  useEffect(() => () => {
    if (copyResetRef.current) clearTimeout(copyResetRef.current);
  }, []);

  const handleCopy = useCallback(async (value: string, key: string, label: string) => {
    const trimmedValue = value.trim();
    if (!trimmedValue) return;

    try {
      await navigator.clipboard.writeText(trimmedValue);
      setCopiedKey(key);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => {
        setCopiedKey((current) => current === key ? null : current);
      }, 1600);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Couldn't copy ${label.toLowerCase()}`);
    }
  }, []);

  const toggleSection = useCallback((section: keyof typeof sectionOpen) => {
    setSectionOpen((current) => ({ ...current, [section]: !current[section] }));
  }, []);

  const readErrorMessage = useCallback(async (response: Response, fallback: string) => {
    try {
      const payload = await response.json();
      if (payload && typeof payload.error === "string" && payload.error.trim()) {
        return payload.error.trim();
      }
    } catch {
      // Ignore JSON parsing issues and use fallback.
    }
    return fallback;
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setLoadWarning(null);
    try {
      await mutateWorkspace();
    } catch {
      // The SWR error effect below preserves cached data and presents the error.
    }
  }, [mutateWorkspace]);

  const refreshWorkspaceSilently = useCallback(() => {
    void mutateWorkspace().catch(() => undefined);
  }, [mutateWorkspace]);

  useEffect(() => {
    if (!workspaceData) return;

    const failed = new Set(workspaceData.failedSections);
    setClient(workspaceData.client || null);
    if (!failed.has("financial years")) {
      setFyRecords(Array.isArray(workspaceData.financialYears) ? workspaceData.financialYears : []);
    }
    if (!failed.has("documents")) {
      setDocuments(Array.isArray(workspaceData.documents) ? workspaceData.documents : []);
    }
    if (!failed.has("billing")) {
      setAllBillings(Array.isArray(workspaceData.billings) ? workspaceData.billings : []);
    }
    if (!failed.has("payments")) {
      setAllPayments(Array.isArray(workspaceData.payments) ? workspaceData.payments : []);
    }
    if (!failed.has("invoice tracking")) {
      setAllInvoices(Array.isArray(workspaceData.invoices) ? workspaceData.invoices : []);
    }
    if (!failed.has("uploaded records")) {
      setAllUploadRecords(Array.isArray(workspaceData.uploadRecords) ? workspaceData.uploadRecords : []);
    }
    if (!failed.has("annual returns")) {
      setAnnualReturns(Array.isArray(workspaceData.annualReturns) ? workspaceData.annualReturns : []);
    }
    setLoadError(null);
    setLoadWarning(
      workspaceData.failedSections.length > 0
        ? `Some sections could not be loaded: ${workspaceData.failedSections.join(", ")}. Showing available data.`
        : null
    );
    setLoading(false);
  }, [
    setAllBillings,
    setAllInvoices,
    setAllPayments,
    setAllUploadRecords,
    workspaceData,
  ]);

  useEffect(() => {
    if (!workspaceError) return;
    if (!clientRef.current) {
      setLoadError(
        workspaceError instanceof Error
          ? workspaceError.message
          : "Couldn't load this client profile right now. Please try again."
      );
    } else {
      setLoadWarning("The profile could not be refreshed completely. Showing the last loaded data.");
    }
    setLoading(false);
  }, [workspaceError]);

  useEffect(() => {
    if (workspaceLoading && !workspaceData) setLoading(true);
  }, [workspaceData, workspaceLoading]);

  useEffect(() => {
    if (!client) return;

    let cancelled = false;
    const params = new URLSearchParams({
      financialYear: selectedFy,
      clientId: client.clientId,
    });

    void fetch(`/api/quotations?${params.toString()}`)
      .then((response) => response.ok ? response.json() : [])
      .then((payload: QuotationSummary[]) => {
        if (cancelled) return;
        const records = Array.isArray(payload) ? payload : [];
        setLinkedQuotations(records.filter((quotation) => (
          quotation.clientId === client.clientId &&
          quotation.financialYear === selectedFy
        )));
      })
      .catch(() => {
        if (!cancelled) setLinkedQuotations([]);
      });

    return () => {
      cancelled = true;
    };
  }, [client, selectedFy]);

  const fetchActivitiesPage = useCallback(async ({
    offset,
    replace,
    requestId,
  }: {
    offset: number;
    replace: boolean;
    requestId: number;
  }) => {
    const params = new URLSearchParams({
      clientId: String(clientId),
      financialYear: selectedFy,
      limit: String(ACTIVITY_PAGE_SIZE),
      offset: String(offset),
      range: activityRange,
    });

    if (activityFilter !== "all") {
      params.set("category", activityFilter);
    }

    const response = await fetch(`/api/activities?${params.toString()}`);
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Unable to load recent activity."));
    }

    const payload = await response.json() as ActivityResponse;
    if (requestId !== activityRequestIdRef.current) return;

    setActivities((current) => replace ? payload.items || [] : [...current, ...(payload.items || [])]);
    setActivitiesTotal(Number(payload.total) || 0);
    setActivityHasMore(Boolean(payload.hasMore));
    setActivityOffset(Number(payload.nextOffset) || 0);
    if (replace) {
      setLatestEmailActivity(payload.latestEmailActivity || null);
    }
    setActivityError(null);
  }, [activityFilter, activityRange, clientId, readErrorMessage, selectedFy]);

  useEffect(() => {
    const requestId = activityRequestIdRef.current + 1;
    activityRequestIdRef.current = requestId;
    setActivities([]);
    setActivitiesTotal(0);
    setActivityHasMore(false);
    setActivityOffset(0);
    setActivityError(null);
    setLatestEmailActivity(null);
    setActivityLoading(true);
    setActivityLoadingMore(false);

    void fetchActivitiesPage({ offset: 0, replace: true, requestId })
      .catch((error) => {
        if (requestId !== activityRequestIdRef.current) return;
        setActivityError(error instanceof Error ? error.message : "Unable to load recent activity.");
      })
      .finally(() => {
        if (requestId !== activityRequestIdRef.current) return;
        setActivityLoading(false);
      });
  }, [fetchActivitiesPage]);

  const loadMoreActivities = useCallback(() => {
    if (activityLoading || activityLoadingMore || !activityHasMore) return;

    const requestId = activityRequestIdRef.current;
    setActivityLoadingMore(true);

    void fetchActivitiesPage({ offset: activityOffset, replace: false, requestId })
      .catch((error) => {
        if (requestId !== activityRequestIdRef.current) return;
        setActivityError(error instanceof Error ? error.message : "Unable to load more recent activity.");
      })
      .finally(() => {
        if (requestId !== activityRequestIdRef.current) return;
        setActivityLoadingMore(false);
      });
  }, [activityHasMore, activityLoading, activityLoadingMore, activityOffset, fetchActivitiesPage]);

  const refreshActivities = useCallback(async () => {
    const requestId = activityRequestIdRef.current + 1;
    activityRequestIdRef.current = requestId;
    try {
      await fetchActivitiesPage({ offset: 0, replace: true, requestId });
    } catch (error) {
      if (requestId !== activityRequestIdRef.current) return;
      setActivityError(error instanceof Error ? error.message : "Unable to refresh recent activity.");
    }
  }, [fetchActivitiesPage]);

  const activityRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleActivityRefresh = useCallback(() => {
    if (activityRefreshTimerRef.current) clearTimeout(activityRefreshTimerRef.current);
    activityRefreshTimerRef.current = setTimeout(() => {
      activityRefreshTimerRef.current = null;
      void refreshActivities();
    }, 250);
  }, [refreshActivities]);

  useEffect(() => () => {
    if (activityRefreshTimerRef.current) clearTimeout(activityRefreshTimerRef.current);
  }, []);

  const billing  = allBillings.find((b) => b.financialYear === selectedFy) || null;
  const payments = allPayments.filter((p) => p.financialYear === selectedFy);
  const invoices = allInvoices.filter((invoice) => invoice.financialYear === selectedFy);
  const uploadRecords = allUploadRecords.filter((record) => record.financialYear === selectedFy);
  const fyLinkedQuotations = linkedQuotations.filter((quotation) => quotation.financialYear === selectedFy);
  const acceptedQuotations = fyLinkedQuotations.filter((quotation) => quotation.status === "Accepted");
  const hasSentLinkedQuotation = linkedQuotations.some((quotation) => (
    quotation.financialYear === selectedFy &&
    (quotation.status === "Sent" || quotation.status === "Accepted")
  ));
  const filteredActivities = activities;
  const lastEmailActivity = latestEmailActivity;
  const billingFormTotal =
    Number(billingForm.govtCharges || 0) +
    Number(billingForm.consultancyCharges || 0) +
    Number(billingForm.targetCharges || 0) +
    Number(billingForm.otherCharges || 0);
  const fyGeneratedTotal = sumFyEntries(fyForm.generated);
  const fyTargetTotal = sumFyEntries(fyForm.targets);

  useEffect(() => {
    const scrollContainer = document.getElementById("dashboard-scroll-area");
    dashboardScrollRef.current = scrollContainer;
    let frameId = 0;

    const readScroll = () => {
      const useDashboardScroller = window.matchMedia("(min-width: 768px)").matches && scrollContainer;
      profileScrollY.set(useDashboardScroller ? scrollContainer.scrollTop : window.scrollY);
    };

    const scheduleRead = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(readScroll);
    };

    readScroll();
    scrollContainer?.addEventListener("scroll", scheduleRead, { passive: true });
    window.addEventListener("scroll", scheduleRead, { passive: true });
    window.addEventListener("resize", scheduleRead);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      scrollContainer?.removeEventListener("scroll", scheduleRead);
      window.removeEventListener("scroll", scheduleRead);
      window.removeEventListener("resize", scheduleRead);
    };
  }, [profileScrollY]);

  useEffect(() => {
    return viewportScrollY.on("change", (latest) => {
      const useDashboardScroller = window.matchMedia("(min-width: 768px)").matches && dashboardScrollRef.current;
      if (!useDashboardScroller) profileScrollY.set(latest);
    });
  }, [profileScrollY, viewportScrollY]);

  const getWorkspaceGeometry = useCallback(() => {
    const nav = primaryTabsRef.current;
    if (!nav) return null;

    const desktop = window.matchMedia("(min-width: 768px)").matches;
    const scrollContainer = desktop ? dashboardScrollRef.current : null;
    const scrollportTop = scrollContainer?.getBoundingClientRect().top ?? 0;
    const scrollportHeight = scrollContainer?.clientHeight ?? window.innerHeight;
    const scrollportPaddingTop = scrollContainer
      ? Number.parseFloat(window.getComputedStyle(scrollContainer).paddingTop) || 0
      : 0;
    const navStyles = window.getComputedStyle(nav);
    const stickyTop = Number.parseFloat(navStyles.top) || 0;
    const marginBottom = Number.parseFloat(navStyles.marginBottom) || 0;
    const navRect = nav.getBoundingClientRect();
    const effectiveStickyTop = stickyTop + scrollportPaddingTop;
    const stickyLine = scrollportTop + effectiveStickyTop;
    const naturallyPinned = (
      profileScrollY.get() > 0 &&
      navRect.top <= stickyLine + 2
    );

    return {
      desktop,
      marginBottom,
      naturallyPinned,
      navHeight: navRect.height,
      navTop: navRect.top,
      scrollContainer,
      scrollportHeight,
      effectiveStickyTop,
      stickyLine,
    };
  }, [profileScrollY]);

  const updateWorkspaceReserve = useCallback((forcePinned = false) => {
    const geometry = getWorkspaceGeometry();
    if (!geometry) return;

    const {
      effectiveStickyTop,
      marginBottom,
      naturallyPinned,
      navHeight,
      scrollportHeight,
    } = geometry;
    if (naturallyPinned) workspaceNavigationLockRef.current = false;
    const pinned = forcePinned || workspaceNavigationLockRef.current || naturallyPinned;

    const nextMinHeight = pinned
      ? Math.max(0, Math.ceil(scrollportHeight - effectiveStickyTop - navHeight - marginBottom))
      : 0;

    setWorkspacePinned((current) => current === pinned ? current : pinned);
    setWorkspaceMinHeight((current) => current === nextMinHeight ? current : nextMinHeight);
  }, [getWorkspaceGeometry]);

  useLayoutEffect(() => {
    const nav = primaryTabsRef.current;
    const workspace = workspaceRef.current;
    const scrollContainer = dashboardScrollRef.current;
    if (!nav || !workspace) return;

    let frameId = 0;
    const scheduleMeasurement = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => updateWorkspaceReserve());
    };

    scheduleMeasurement();
    scrollContainer?.addEventListener("scroll", scheduleMeasurement, { passive: true });
    window.addEventListener("scroll", scheduleMeasurement, { passive: true });
    window.addEventListener("resize", scheduleMeasurement);

    const resizeObserver = new ResizeObserver(scheduleMeasurement);
    resizeObserver.observe(nav);
    resizeObserver.observe(workspace);
    if (scrollContainer) resizeObserver.observe(scrollContainer);
    const profileHeader = document.querySelector<HTMLElement>(".client-profile-header");
    if (profileHeader) resizeObserver.observe(profileHeader);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      scrollContainer?.removeEventListener("scroll", scheduleMeasurement);
      window.removeEventListener("scroll", scheduleMeasurement);
      window.removeEventListener("resize", scheduleMeasurement);
    };
  }, [
    activeComplianceSection,
    activeDocumentsSection,
    activeFinancialSection,
    activeNotesSection,
    activePrimaryTab,
    activeTimelineSection,
    loading,
    secondaryNavCollapsed,
    updateWorkspaceReserve,
  ]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    const scrollTarget: HTMLElement | Window = desktop && dashboardScrollRef.current
      ? dashboardScrollRef.current
      : window;

    const clearSnapTimer = () => {
      if (!workspaceSnapTimerRef.current) return;
      clearTimeout(workspaceSnapTimerRef.current);
      workspaceSnapTimerRef.current = null;
    };

    const settleWorkspaceHead = () => {
      workspaceSnapTimerRef.current = null;
      if (workspaceSnapActiveRef.current || workspaceNavigationLockRef.current) return;

      const geometry = getWorkspaceGeometry();
      const workspaceHead = workspaceHeadRef.current;
      if (!geometry || !workspaceHead || (!geometry.naturallyPinned && !workspacePinned)) return;

      const contentTop = geometry.stickyLine + geometry.navHeight + geometry.marginBottom;
      const scrollDelta = workspaceHead.getBoundingClientRect().top - contentTop;

      // This is intentionally a small magnetic zone. Strong upward scrolling
      // crosses it normally and exits focused workspace mode.
      if (Math.abs(scrollDelta) <= 1.5 || Math.abs(scrollDelta) > 52) return;

      workspaceSnapActiveRef.current = true;
      const releaseSnap = () => {
        workspaceSnapActiveRef.current = false;
        scrollTarget.removeEventListener("scrollend", releaseSnap);
      };

      scrollTarget.addEventListener("scrollend", releaseSnap, { once: true });
      if (geometry.desktop && geometry.scrollContainer) {
        geometry.scrollContainer.scrollBy({
          top: scrollDelta,
          behavior: prefersReducedMotion ? "auto" : "smooth",
        });
      } else {
        window.scrollBy({
          top: scrollDelta,
          behavior: prefersReducedMotion ? "auto" : "smooth",
        });
      }

      if (prefersReducedMotion) {
        releaseSnap();
      } else {
        window.setTimeout(releaseSnap, 480);
      }
    };

    const scheduleWorkspaceSettle = () => {
      if (workspaceSnapActiveRef.current || workspaceNavigationLockRef.current) return;
      clearSnapTimer();
      workspaceSnapTimerRef.current = setTimeout(settleWorkspaceHead, 110);
    };

    scrollTarget.addEventListener("scroll", scheduleWorkspaceSettle, { passive: true });
    return () => {
      clearSnapTimer();
      workspaceSnapActiveRef.current = false;
      scrollTarget.removeEventListener("scroll", scheduleWorkspaceSettle);
    };
  }, [getWorkspaceGeometry, prefersReducedMotion, workspacePinned]);

  useEffect(() => {
    const scrollContainer = dashboardScrollRef.current;
    let previousScrollTop = profileScrollY.get();
    let compensationFrame = 0;
    let isCompensating = false;
    let collapseGestureLocked = false;
    let collapseGestureTimer = 0;

    const setCollapsed = (collapsed: boolean) => {
      if (collapsed === headerCollapsedRef.current) return;
      headerCollapsedRef.current = collapsed;
      headerProgressTarget.set(collapsed ? 1 : 0);
    };

    const compensateFirstGesture = () => {
      isCompensating = true;
      cancelAnimationFrame(compensationFrame);
      compensationFrame = requestAnimationFrame(() => {
        if (window.matchMedia("(min-width: 768px)").matches && scrollContainer) {
          scrollContainer.scrollTop = 0;
        } else {
          window.scrollTo({ top: 0, behavior: "auto" });
        }
        previousScrollTop = 0;
        requestAnimationFrame(() => {
          isCompensating = false;
        });
      });
    };

    const currentScrollTop = profileScrollY.get();
    if (currentScrollTop >= 88) {
      headerCollapsedRef.current = true;
      headerProgressTarget.set(1);
    }

    const unsubscribe = profileScrollY.on("change", (scrollTop) => {
      const delta = scrollTop - previousScrollTop;
      previousScrollTop = scrollTop;

      if (isCompensating) return;

      if (!headerCollapsedRef.current && delta > 0 && scrollTop >= 24) {
        setCollapsed(true);
        compensateFirstGesture();
      } else if (headerCollapsedRef.current && delta < 0 && scrollTop <= 36) {
        setCollapsed(false);
      }
    });

    const wheelTarget: HTMLElement | Window = window.matchMedia("(min-width: 768px)").matches && scrollContainer
      ? scrollContainer
      : window;
    const handleWheel = (nativeEvent: Event) => {
      const event = nativeEvent as WheelEvent;
      if (collapseGestureLocked && event.deltaY > 0) {
        event.preventDefault();
        return;
      }

      if (event.deltaY > 0 && !headerCollapsedRef.current && profileScrollY.get() <= 36) {
        event.preventDefault();
        setCollapsed(true);
        collapseGestureLocked = true;
        window.clearTimeout(collapseGestureTimer);
        collapseGestureTimer = window.setTimeout(() => {
          collapseGestureLocked = false;
        }, 460);
        return;
      }

      if (event.deltaY < 0 && headerCollapsedRef.current && profileScrollY.get() <= 36 && !isCompensating) {
        setCollapsed(false);
      }
    };

    wheelTarget.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      unsubscribe();
      cancelAnimationFrame(compensationFrame);
      window.clearTimeout(collapseGestureTimer);
      wheelTarget.removeEventListener("wheel", handleWheel);
    };
  }, [headerProgressTarget, profileScrollY]);

  const enterWorkspaceMode = useCallback((
    destination: ClientSectionDestination,
    options: { restoreTabPosition?: boolean } = {}
  ) => {
    headerCollapsedRef.current = true;
    workspaceNavigationLockRef.current = true;
    headerProgressTarget.set(1);
    headerProgress.jump(1);
    updateWorkspaceReserve(true);
    setActivePrimaryTab(destination.primary);

    if (destination.primary === "compliance") setActiveComplianceSection(destination.secondary);
    if (destination.primary === "financial") setActiveFinancialSection(destination.secondary);
    if (destination.primary === "documents") setActiveDocumentsSection(destination.secondary);
    if (destination.primary === "timeline") setActiveTimelineSection(destination.secondary);
    if (destination.primary === "notes") setActiveNotesSection(destination.secondary);

    if (navigationFrameRef.current !== null) cancelAnimationFrame(navigationFrameRef.current);
    if (navigationHighlightTimerRef.current) clearTimeout(navigationHighlightTimerRef.current);
    navigationScrollCleanupRef.current?.();
    navigationScrollCleanupRef.current = null;
    setWorkspaceHighlighted(false);

    navigationFrameRef.current = requestAnimationFrame(() => {
      navigationFrameRef.current = requestAnimationFrame(() => {
        const geometry = getWorkspaceGeometry();
        if (!geometry || !workspaceHeadRef.current) {
          navigationFrameRef.current = null;
          return;
        }

        const contentTop = geometry.stickyLine + geometry.navHeight + geometry.marginBottom;
        const restoredOffset = options.restoreTabPosition
          ? workspaceTabScrollOffsetsRef.current[destination.primary] ?? 0
          : 0;
        const desiredHeadTop = contentTop - restoredOffset;
        const scrollDelta = workspaceHeadRef.current.getBoundingClientRect().top - desiredHeadTop;
        const behavior: ScrollBehavior = prefersReducedMotion ? "auto" : "smooth";

        const showArrivalCue = () => {
          navigationScrollCleanupRef.current?.();
          navigationScrollCleanupRef.current = null;
          if (navigationHighlightTimerRef.current) clearTimeout(navigationHighlightTimerRef.current);
          workspaceNavigationLockRef.current = false;
          updateWorkspaceReserve();
          setWorkspaceHighlighted(true);
          navigationHighlightTimerRef.current = setTimeout(() => {
            setWorkspaceHighlighted(false);
            navigationHighlightTimerRef.current = null;
          }, prefersReducedMotion ? 500 : 1100);
        };

        if (Math.abs(scrollDelta) <= 1) {
          showArrivalCue();
        } else {
          const scrollTarget: EventTarget = geometry.scrollContainer ?? window;
          const handleScrollEnd = () => showArrivalCue();
          scrollTarget.addEventListener("scrollend", handleScrollEnd, { once: true });
          navigationScrollCleanupRef.current = () => {
            scrollTarget.removeEventListener("scrollend", handleScrollEnd);
          };

          if (geometry.desktop && geometry.scrollContainer) {
            geometry.scrollContainer.scrollTo({
              top: geometry.scrollContainer.scrollTop + scrollDelta,
              behavior,
            });
          } else {
            window.scrollTo({
              top: window.scrollY + scrollDelta,
              behavior,
            });
          }

          if (prefersReducedMotion) {
            showArrivalCue();
          } else {
            navigationHighlightTimerRef.current = setTimeout(showArrivalCue, 700);
          }
        }
        navigationFrameRef.current = null;
      });
    });
  }, [
    getWorkspaceGeometry,
    headerProgress,
    headerProgressTarget,
    prefersReducedMotion,
    updateWorkspaceReserve,
  ]);

  const handlePrimaryTabChange = useCallback((tab: ClientProfileTabId) => {
    if (tab === activePrimaryTab) return;

    const geometry = getWorkspaceGeometry();
    const workspaceHead = workspaceHeadRef.current;
    if (geometry && workspaceHead && (geometry.naturallyPinned || workspacePinned)) {
      const contentTop = geometry.stickyLine + geometry.navHeight + geometry.marginBottom;
      workspaceTabScrollOffsetsRef.current[activePrimaryTab] = Math.max(
        0,
        Math.round(contentTop - workspaceHead.getBoundingClientRect().top)
      );
    } else {
      workspaceTabScrollOffsetsRef.current[activePrimaryTab] = 0;
    }

    if (tab === "compliance") {
      enterWorkspaceMode(
        { primary: tab, secondary: activeComplianceSection },
        { restoreTabPosition: true }
      );
    } else if (tab === "financial") {
      enterWorkspaceMode(
        { primary: tab, secondary: activeFinancialSection },
        { restoreTabPosition: true }
      );
    } else if (tab === "documents") {
      enterWorkspaceMode(
        { primary: tab, secondary: activeDocumentsSection },
        { restoreTabPosition: true }
      );
    } else if (tab === "timeline") {
      enterWorkspaceMode(
        { primary: tab, secondary: activeTimelineSection },
        { restoreTabPosition: true }
      );
    } else if (tab === "notes") {
      enterWorkspaceMode(
        { primary: tab, secondary: activeNotesSection },
        { restoreTabPosition: true }
      );
    } else {
      enterWorkspaceMode({ primary: "overview" }, { restoreTabPosition: true });
    }
  }, [
    activeComplianceSection,
    activeDocumentsSection,
    activeFinancialSection,
    activeNotesSection,
    activePrimaryTab,
    activeTimelineSection,
    enterWorkspaceMode,
    getWorkspaceGeometry,
    workspacePinned,
  ]);

  const navigateToClientSection = enterWorkspaceMode;

  useEffect(() => () => {
    if (navigationFrameRef.current !== null) cancelAnimationFrame(navigationFrameRef.current);
    if (navigationHighlightTimerRef.current) clearTimeout(navigationHighlightTimerRef.current);
    if (workspaceSnapTimerRef.current) clearTimeout(workspaceSnapTimerRef.current);
    navigationScrollCleanupRef.current?.();
  }, []);

  const closeDocumentModal = () => {
    setDocModal(false);
    setDocModalMode("create");
    setEditingDocumentId(null);
    setDocForm({ documentName: "", driveLink: "", category: "other" });
  };

  const openCreateDocument = () => {
    setDocModalMode("create");
    setEditingDocumentId(null);
    setDocForm({ documentName: "", driveLink: "", category: "other" });
    setDocModal(true);
  };

  const openEditDocument = (document: Document) => {
    setDocModalMode("edit");
    setEditingDocumentId(document._id);
    setDocForm({ documentName: document.documentName, driveLink: document.driveLink, category: document.category || "other" });
    setDocModal(true);
  };

  const saveDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineSaving(true);
    try {
      const existingDocument = editingDocumentId
        ? documents.find((document) => document._id === editingDocumentId)
        : null;
      const response = await fetch(
        editingDocumentId ? `/api/documents/${editingDocumentId}` : "/api/documents",
        {
          method: editingDocumentId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...docForm,
            clientId,
            uploadedDate: existingDocument?.uploadedDate || new Date(),
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        toast.error(data?.error || `Failed to ${editingDocumentId ? "update" : "add"} document.`);
        return;
      }

      const saved = await response.json();
      setDocuments((prev) => {
        if (editingDocumentId) {
          return prev.map((d) => d._id === editingDocumentId ? saved : d);
        }
        return [...prev, saved];
      });
      refreshWorkspaceSilently();
      closeDocumentModal();
      scheduleActivityRefresh();
      toast.success(editingDocumentId ? "Document updated!" : "Document added!");
      navigateToClientSection({ primary: "documents", secondary: "all" });
    } finally {
      setInlineSaving(false);
    }
  };

  const deleteDocument = async () => {
    if (!documentPendingDelete) return;
    const documentToDelete = documentPendingDelete;
    setBusyAction(`document-${documentToDelete._id}`);
    try {
      const response = await fetch(`/api/documents/${documentToDelete._id}`, { method: "DELETE" });
      if (!response.ok) {
        toast.error("Failed to remove document.");
        return;
      }
      setDocuments((prev) => prev.filter((d) => d._id !== documentToDelete._id));
      setDocumentPendingDelete(null);
      invalidate("/api/trash", "/api/documents");
      refreshWorkspaceSilently();
      scheduleActivityRefresh();
      toast.success("Document moved to recycle bin");
    } finally {
      setBusyAction(null);
    }
  };

  const migrateDocument = async (document: Document) => {
    setBusyAction(`document-migrate-${document._id}`);
    try {
      const response = await fetch(`/api/documents/${document._id}/migrate`, { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(data?.error || "Could not migrate this Drive link.");
        return;
      }
      const migrated = Array.isArray(data?.documents) ? data.documents as Document[] : [];
      setDocuments((current) => [
        ...migrated,
        ...current.filter((entry) => entry._id !== document._id),
      ]);
      invalidate("/api/documents", "/api/activities");
      refreshWorkspaceSilently();
      scheduleActivityRefresh();
      toast.success(migrated.length > 1 ? `${migrated.length} files migrated to managed Drive storage.` : "Document migrated to managed Drive storage.");
    } finally {
      setBusyAction(null);
    }
  };

  const closeInvoiceModal = () => {
    setInvoiceModal(false);
    setInvoiceForm({
      financialYear: selectedFy,
      invoiceType: "",
      status: "Received",
      receivedVia: "",
      selectedMonths: [],
      remarks: "",
    });
  };

  const openInvoiceModal = (context?: {
    invoiceType: "sale" | "purchase";
    monthKey: string;
    status: InvoiceStatus;
    receivedVia?: ReceivedVia;
    remarks?: string;
  }) => {
    setInvoiceForm({
      financialYear: selectedFy,
      invoiceType: context?.invoiceType || "",
      status: context?.status || "Received",
      receivedVia: context?.receivedVia || "",
      selectedMonths: context?.monthKey ? [context.monthKey] : [],
      remarks: context?.remarks || "",
    });
    setInvoiceModal(true);
  };

  const refreshAnnualReturnForFy = async (financialYear: string) => {
    try {
      const response = await fetch(
        `/api/annual-return?clientId=${encodeURIComponent(clientId)}&fy=${encodeURIComponent(financialYear)}`,
        { cache: "no-store" },
      );
      if (!response.ok) return;
      const records = await response.json() as AnnualReturnRecord[];
      const refreshed = records.find((record) => record.financialYear === financialYear);
      if (!refreshed) return;
      setAnnualReturns((current) => {
        const exists = current.some((record) => record.financialYear === financialYear);
        return exists
          ? current.map((record) => record.financialYear === financialYear ? refreshed : record)
          : [...current, refreshed];
      });
    } catch {
      // The workflow write already succeeded; a later page refresh will retrieve
      // the synchronized status if this best-effort UI refresh is interrupted.
    }
  };

  const saveInvoiceTracking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceForm.invoiceType) {
      toast.error("Please select invoice type.");
      return;
    }
    if (invoiceForm.selectedMonths.length === 0) {
      toast.error("Select at least one month.");
      return;
    }
    const sourceRequired = invoiceForm.status === "Received" || invoiceForm.status === "Partial / Issue";
    if (sourceRequired && !invoiceForm.receivedVia) {
      toast.error("Please select how the invoice data was received.");
      return;
    }

    const monthRanges = selectedMonthsToInvoiceRanges(invoiceForm.financialYear, invoiceForm.selectedMonths);
    if (monthRanges.length === 0) {
      toast.error("Selected months are not valid for this FY.");
      return;
    }

    const invoiceType: "sale" | "purchase" = invoiceForm.invoiceType;
    setInlineSaving(true);
    const payloads: Array<Omit<InvoiceTrackingRecord, "_id" | "createdAt">> = monthRanges.map((range) => ({
      clientId,
      financialYear: invoiceForm.financialYear,
      invoiceType,
      status: invoiceForm.status,
      receivedVia: invoiceForm.receivedVia || undefined,
      remarks: invoiceForm.remarks.trim(),
      fromDate: range.fromDate,
      toDate: range.toDate,
    }));

    const optimisticOps = payloads.map((payload) =>
      addInvoiceItem({ ...payload, _id: "", createdAt: new Date().toISOString() })
    );
    closeInvoiceModal();
    setSelectedFy(invoiceForm.financialYear);

    try {
      const responses = await Promise.all(payloads.map((payload) => (
        fetch("/api/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      )));

      const failed = responses.find((response) => !response.ok);
      if (failed) {
        optimisticOps.forEach((ops) => ops.rollback());
        toast.error(await readErrorMessage(failed, "Failed to save invoice month status."));
        return;
      }

      const savedRecords = await Promise.all(responses.map((response) => response.json() as Promise<InvoiceTrackingRecord>));
      savedRecords.forEach((saved, index) => optimisticOps[index]?.commit(saved));
      invalidate("/api/invoices");
      await refreshAnnualReturnForFy(invoiceForm.financialYear);
      refreshWorkspaceSilently();
      toast.success(`${savedRecords.length} month${savedRecords.length === 1 ? "" : "s"} updated.`);
      navigateToClientSection({ primary: "compliance", secondary: "invoiceTracking" });
    } catch {
      optimisticOps.forEach((ops) => ops.rollback());
      toast.error("Something went wrong saving invoice.");
    } finally {
      setInlineSaving(false);
    }
  };

  const closeUploadModal = () => {
    setUploadModal(false);
    setUploadForm({
      financialYear: selectedFy,
      uploadType: "sale",
      cat1: "0",
      cat2: "0",
      cat3: "0",
      cat4: "0",
      invoiceCount: "0",
    });
  };

  const openUploadModal = () => {
    setUploadForm({
      financialYear: selectedFy,
      uploadType: "sale",
      cat1: "0",
      cat2: "0",
      cat3: "0",
      cat4: "0",
      invoiceCount: "0",
    });
    setUploadModal(true);
  };

  const saveUploadRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineSaving(true);
    const payload = {
      clientId,
      financialYear: uploadForm.financialYear,
      uploadType: uploadForm.uploadType,
      cat1: Number(uploadForm.cat1) || 0,
      cat2: Number(uploadForm.cat2) || 0,
      cat3: Number(uploadForm.cat3) || 0,
      cat4: Number(uploadForm.cat4) || 0,
      invoiceCount: Number(uploadForm.invoiceCount) || 0,
    };

    const { commit, rollback } = addUploadItem({ ...payload, _id: "", createdAt: new Date().toISOString() });
    closeUploadModal();
    setSelectedFy(payload.financialYear);

    try {
      const response = await fetch("/api/upload-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        rollback();
        toast.error(data?.error || "Failed to add upload record.");
        return;
      }

      const saved = await response.json();
      commit(saved);
      invalidate("/api/upload-records");
      await refreshAnnualReturnForFy(payload.financialYear);
      refreshWorkspaceSilently();
      toast.success("Upload record added!");
      navigateToClientSection({ primary: "compliance", secondary: "cpcbUpload" });
    } catch {
      rollback();
      toast.error("Something went wrong saving upload record.");
    } finally {
      setInlineSaving(false);
    }
  };

  const closeBillingModal = () => {
    setBillingModal(false);
    setEditingBillingId(null);
    setBillingForm({
      financialYear: selectedFy,
      govtCharges: "0",
      consultancyCharges: "0",
      targetCharges: "0",
      otherCharges: "0",
      notes: "",
    });
  };

  const openBillingModalForRecord = (record?: Billing | null) => {
    if (!record && client && (client.category === "Importer" || client.category === "Brand Owner")) {
      if (acceptedQuotations.length === 0) {
        toast.error("Accept a quotation before generating a bill for this client type.");
        navigateToClientSection({ primary: "financial", secondary: "quotations" });
        return;
      }
      if (acceptedQuotations.length === 1) {
        void openBillingFromQuotation(acceptedQuotations[0]);
        return;
      }
      toast("Use an accepted quotation to generate this bill.");
      navigateToClientSection({ primary: "financial", secondary: "quotations" });
      return;
    }

    if (record) {
      setEditingBillingId(record._id);
      setBillingForm({
        financialYear: record.financialYear,
        govtCharges: String(record.govtCharges || 0),
        consultancyCharges: String(record.consultancyCharges || 0),
        targetCharges: String(record.targetCharges || 0),
        otherCharges: String(record.otherCharges || 0),
        notes: record.notes || "",
      });
    } else {
      setEditingBillingId(null);
      setBillingForm({
        financialYear: selectedFy,
        govtCharges: "0",
        consultancyCharges: "0",
        targetCharges: "0",
        otherCharges: "0",
        notes: "",
      });
    }
    setBillingModal(true);
  };

  const openBillingFromQuotation = async (quotation: QuotationSummary) => {
    if (client?.category === "PWP") {
      toast.error("PWP clients use direct annual return billing only.");
      return;
    }
    if (!client || quotation.clientId !== client.clientId || quotation.status !== "Accepted") {
      toast.error("Only accepted quotations linked to this client profile can generate a bill.");
      return;
    }

    setInlineSaving(true);
    try {
      const response = await fetch(`/api/quotations/${quotation._id}`);
      if (!response.ok) {
        toast.error(await readErrorMessage(response, "Unable to load quotation details."));
        return;
      }

      const details = await response.json() as {
        quotationNumber?: string;
        clientId?: string;
        financialYear?: string;
        status?: string;
        revisions?: Array<{
          revisionNumber?: number;
          itemsSubtotal?: number;
          itemsGst?: number;
          consultationCharges?: number;
          consultationGstAmount?: number;
          governmentFees?: number;
          grandTotal?: number;
        }>;
      };
      if (details.clientId !== client.clientId || details.status !== "Accepted") {
        toast.error("This quotation is not an accepted linked quotation for this client.");
        return;
      }
      const latestRevision = [...(details.revisions || [])]
        .sort((a, b) => Number(b.revisionNumber || 0) - Number(a.revisionNumber || 0))[0];

      if (!latestRevision) {
        toast.error("This quotation has no revision totals to copy.");
        return;
      }

      setEditingBillingId(null);
      setBillingForm({
        financialYear: details.financialYear || quotation.financialYear || selectedFy,
        govtCharges: String(Number(latestRevision.governmentFees || 0)),
        consultancyCharges: String(Number(latestRevision.consultationCharges || 0) + Number(latestRevision.consultationGstAmount || 0)),
        targetCharges: String(Number(latestRevision.itemsSubtotal || 0) + Number(latestRevision.itemsGst || 0)),
        otherCharges: "0",
        notes: `Generated from accepted quotation ${details.quotationNumber || quotation.quotationNumber || quotation._id}. Final quotation amount: ${formatCurrency(Number(latestRevision.grandTotal || quotation.grandTotal || 0))}.`,
      });
      setBillingModal(true);
    } finally {
      setInlineSaving(false);
    }
  };

  const saveBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineSaving(true);
    const payload = {
      clientId,
      financialYear: billingForm.financialYear,
      govtCharges: Number(billingForm.govtCharges) || 0,
      consultancyCharges: Number(billingForm.consultancyCharges) || 0,
      targetCharges: Number(billingForm.targetCharges) || 0,
      otherCharges: Number(billingForm.otherCharges) || 0,
      notes: billingForm.notes.trim(),
    };

    // Optimistically update UI before API call
    const optimisticBilling = {
      ...payload,
      _id: editingBillingId || "",
      totalAmount: payload.govtCharges + payload.consultancyCharges + payload.targetCharges + payload.otherCharges,
      totalPaid: editingBillingId ? (allBillings.find((b) => b._id === editingBillingId)?.totalPaid ?? 0) : 0,
      pendingAmount: editingBillingId ? (allBillings.find((b) => b._id === editingBillingId)?.pendingAmount ?? 0) : 0,
      paymentStatus: (editingBillingId ? (allBillings.find((b) => b._id === editingBillingId)?.paymentStatus) : "pending") as Billing["paymentStatus"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    let ops: ReturnType<typeof editBillingItem> | ReturnType<typeof addBillingItem> | null = null;

    if (editingBillingId) {
      ops = editBillingItem(editingBillingId, optimisticBilling);
    } else {
      ops = addBillingItem(optimisticBilling);
    }

    closeBillingModal();
    setSelectedFy(payload.financialYear);

    try {
      const response = await fetch(
        editingBillingId ? `/api/billing/${editingBillingId}` : "/api/billing",
        {
          method: editingBillingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        ops?.rollback?.();
        toast.error(data?.error || `Failed to ${editingBillingId ? "update" : "save"} billing.`);
        return;
      }

      const saved = await response.json();
      // Defensive merge: ensure totalPaid / pendingAmount / paymentStatus are always
      // numbers even if the API ever returns a partial document (prevents ₹NaN).
      const safeCommit = {
        ...saved,
        totalPaid:     typeof saved.totalPaid     === "number" ? saved.totalPaid     : 0,
        pendingAmount: typeof saved.pendingAmount === "number" ? saved.pendingAmount : (saved.totalAmount ?? optimisticBilling.totalAmount) - 0,
        paymentStatus: saved.paymentStatus ?? "Unpaid",
      };
      ops?.commit?.(safeCommit);
      await refreshAnnualReturnForFy(payload.financialYear);
      refreshWorkspaceSilently();
      toast.success(editingBillingId ? "Billing updated!" : "Billing saved!");
      navigateToClientSection({ primary: "financial", secondary: "billing" });
    } catch {
      ops?.rollback?.();
      toast.error("Something went wrong saving billing.");
    } finally {
      setInlineSaving(false);
    }
  };

  const deleteBilling = async (record: Billing) => {
    if (!confirm(`Move billing for FY ${record.financialYear} to recycle bin?`)) return;
    const { commit, rollback } = deleteBillingItem(record._id);
    try {
      const response = await fetch(`/api/billing/${record._id}`, { method: "DELETE" });
      if (!response.ok) {
        rollback();
        toast.error("Failed to remove billing.");
        return;
      }
      commit();
      refreshWorkspaceSilently();
      toast.success("Billing moved to recycle bin");
    } catch {
      rollback();
      toast.error("Something went wrong deleting billing.");
    }
  };

  const closePaymentModal = () => {
    setPaymentModal(false);
    setEditingPaymentId(null);
    setPaymentForm({
      financialYear: selectedFy,
      paymentType: billing ? "billing" : "advance",
      amountPaid: "",
      paymentDate: todayInputValue(),
      paymentMode: PAYMENT_MODES[0] || "NEFT",
      referenceNumber: "",
      notes: "",
    });
  };

  const openPaymentModalForRecord = (record?: Payment | null) => {
    if (record) {
      setEditingPaymentId(record._id);
      setPaymentForm({
        financialYear: record.financialYear || selectedFy,
        paymentType: record.paymentType === "advance" ? "advance" : "billing",
        amountPaid: String(record.amountPaid || ""),
        paymentDate: record.paymentDate ? new Date(record.paymentDate).toISOString().slice(0, 10) : todayInputValue(),
        paymentMode: record.paymentMode || PAYMENT_MODES[0] || "NEFT",
        referenceNumber: record.referenceNumber || "",
        notes: record.notes || "",
      });
    } else {
      setEditingPaymentId(null);
      setPaymentForm({
        financialYear: selectedFy,
        paymentType: billing ? "billing" : "advance",
        amountPaid: "",
        paymentDate: todayInputValue(),
        paymentMode: PAYMENT_MODES[0] || "NEFT",
        referenceNumber: "",
        notes: "",
      });
    }
    setPaymentModal(true);
  };

  const savePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineSaving(true);
    const payload = {
      clientId,
      financialYear: paymentForm.financialYear,
      paymentType: paymentForm.paymentType,
      amountPaid: Number(paymentForm.amountPaid),
      paymentDate: paymentForm.paymentDate,
      paymentMode: paymentForm.paymentMode,
      referenceNumber: paymentForm.referenceNumber.trim(),
      notes: paymentForm.notes.trim(),
    };

    const optimisticPayment = {
      ...payload,
      _id: editingPaymentId || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    let ops: ReturnType<typeof editPaymentItem> | ReturnType<typeof addPaymentItem> | null = null;

    if (editingPaymentId) {
      ops = editPaymentItem(editingPaymentId, optimisticPayment);
    } else {
      ops = addPaymentItem(optimisticPayment);
    }

    closePaymentModal();
    setSelectedFy(payload.financialYear);

    try {
      const response = await fetch(
        editingPaymentId ? `/api/payments/${editingPaymentId}` : "/api/payments",
        {
          method: editingPaymentId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        ops?.rollback?.();
        toast.error(data?.error || `Failed to ${editingPaymentId ? "update" : "record"} payment.`);
        return;
      }

      const saved = await response.json();
      ops?.commit?.(saved);
      refreshWorkspaceSilently();
      toast.success(editingPaymentId ? "Payment updated!" : "Payment recorded!");
      navigateToClientSection({ primary: "financial", secondary: "payments" });
    } catch {
      ops?.rollback?.();
      toast.error("Something went wrong saving payment.");
    } finally {
      setInlineSaving(false);
    }
  };

  const deletePayment = async (paymentId: string) => {
    if (!confirm("Move this payment to recycle bin?")) return;
    const { commit, rollback } = deletePaymentItem(paymentId);
    try {
      const response = await fetch(`/api/payments/${paymentId}`, { method: "DELETE" });
      if (!response.ok) {
        rollback();
        toast.error("Failed to remove payment.");
        return;
      }
      commit();
      refreshWorkspaceSilently();
      toast.success("Payment moved to recycle bin");
    } catch {
      rollback();
      toast.error("Something went wrong deleting payment.");
    }
  };

  const closeFyModal = () => {
    setFyModal(false);
    setFyForm({
      financialYear: selectedFy,
      generated: createEmptyFyEntries(),
      targets: createEmptyFyEntries(),
    });
  };

  const openFYModal = (record?: FYRecord | null) => {
    const targetRecord = record || fyRecords.find((entry) => entry.financialYear === selectedFy) || null;
    setFyForm({
      financialYear: targetRecord?.financialYear || selectedFy,
      generated: buildFyEntries(targetRecord?.generated),
      targets: buildFyEntries(targetRecord?.targets),
    });
    setFyModal(true);
  };

  const updateFyEntry = (section: "generated" | "targets", categoryId: string, type: "RECYCLING" | "EOL", value: string) => {
    setFyForm((current) => ({
      ...current,
      [section]: current[section].map((entry) => (
        entry.categoryId === categoryId && entry.type === type
          ? { ...entry, value }
          : entry
      )),
    }));
  };

  const saveFY = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineSaving(true);
    try {
      const payload = {
        clientId,
        financialYear: fyForm.financialYear,
        generated: isPWP
          ? fyForm.generated.map((entry) => ({ ...entry, value: Number(entry.value) || 0 }))
          : [],
        targets: !isPWP && !isSIMP
          ? fyForm.targets.map((entry) => ({ ...entry, value: Number(entry.value) || 0 }))
          : [],
      };

      const response = await fetch("/api/financial-year", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        toast.error(data?.error || "Failed to save financial year data.");
        return;
      }

      const saved = await response.json();
      // Update only fyRecords in state — no full page reload
      setFyRecords((prev) => {
        const exists = prev.some((r) => r.financialYear === saved.financialYear);
        return exists
          ? prev.map((r) => r.financialYear === saved.financialYear ? saved : r)
          : [...prev, saved];
      });
      closeFyModal();
      setSelectedFy(payload.financialYear);
      invalidate("/api/financial-year", "/api/dashboard", "/api/activities");
      refreshWorkspaceSilently();
      toast.success(isPWP ? "Credit data saved!" : "FY data saved!");
      navigateToClientSection({ primary: "compliance", secondary: "targetsCredits" });
    } finally {
      setInlineSaving(false);
    }
  };

  const saveAnnualReturnStatus = async (
    status: AnnualReturnRecord["status"],
    patch: Partial<AnnualReturnRecord> = {},
  ) => {
    setInlineSaving(true);
    try {
      const payload = {
        clientId,
        financialYear: selectedFy,
        status,
        remarks: patch.remarks || "",
        filingDate: patch.filingDate || null,
        acknowledgeNumber: patch.acknowledgeNumber || "",
      };

      const response = await fetch("/api/annual-return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        toast.error(await readErrorMessage(response, "Failed to save annual return status."));
        return;
      }

      const saved = await response.json() as AnnualReturnRecord;
      setAnnualReturns((current) => {
        const exists = current.some((record) => record.financialYear === saved.financialYear);
        return exists
          ? current.map((record) => record.financialYear === saved.financialYear ? saved : record)
          : [...current, saved];
      });
      invalidate("/api/annual-return", "/api/dashboard", "/api/activities");
      refreshWorkspaceSilently();
      const displayedStatus = saved.status === "Pending" ? "Not Started" : saved.status;
      toast.success(
        displayedStatus === status
          ? `Annual return marked as ${displayedStatus}.`
          : `Annual return is ${displayedStatus} based on the current workflow.`,
      );
    } finally {
      setInlineSaving(false);
    }
  };

  const closeReminderModal = () => {
    setReminderModal(false);
    setActiveReminderBillingId(null);
    setReminderRecipients([]);
    setReminderSuggestions([]);
    setReminderSuggestionCatalog([]);
    setCustomReminderEmail("");
    setReminderForm({ subject: "", message: "" });
    setReminderPreviewHtml(null);
  };

  const openReminderModal = async (targetBilling?: Billing | null) => {
    const reminderBilling = targetBilling || billing;
    if (!reminderBilling || !client) {
      toast.error("Create billing first before sending a reminder.");
      return;
    }

    const { selected, suggestions } = buildLinkedContactEmailOptions(client.contacts || []);
    const companyName = client.companyName || reminderBilling.clientId;

    setActiveReminderBillingId(reminderBilling._id);
    setReminderRecipients(selected);
    setReminderSuggestions(suggestions);
    setReminderSuggestionCatalog(suggestions);
    setCustomReminderEmail("");
    setReminderForm({
      subject: `Payment Reminder - ${companyName} - FY ${reminderBilling.financialYear}`,
      message: "",
    });

    try {
      const templateResponse = await fetch("/api/email/template?name=payment-reminder");
      const data = await templateResponse.json();
      const template = typeof data?.html === "string" ? data.html : "";
      if (!template) {
        setReminderPreviewHtml(null);
      } else {
        const fmt = (value: number) => value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const breakdownRows = [
          reminderBilling.govtCharges > 0 ? `<tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;">Govt Charges</td><td style="padding:8px 12px;font-size:13px;color:#374151;font-weight:600;text-align:right;">Rs. ${fmt(reminderBilling.govtCharges)}</td></tr>` : "",
          reminderBilling.consultancyCharges > 0 ? `<tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;">Consultancy Charges</td><td style="padding:8px 12px;font-size:13px;color:#374151;font-weight:600;text-align:right;">Rs. ${fmt(reminderBilling.consultancyCharges)}</td></tr>` : "",
          reminderBilling.targetCharges > 0 ? `<tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;">Target Charges</td><td style="padding:8px 12px;font-size:13px;color:#374151;font-weight:600;text-align:right;">Rs. ${fmt(reminderBilling.targetCharges)}</td></tr>` : "",
          reminderBilling.otherCharges > 0 ? `<tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;">Other Charges</td><td style="padding:8px 12px;font-size:13px;color:#374151;font-weight:600;text-align:right;">Rs. ${fmt(reminderBilling.otherCharges)}</td></tr>` : "",
        ].join("");

        setReminderPreviewHtml(
          template
            .replace(/{{clientName}}/g, companyName)
            .replace(/{{financialYear}}/g, reminderBilling.financialYear)
            .replace(/{{pendingAmount}}/g, fmt(reminderBilling.pendingAmount))
            .replace(/{{totalAmount}}/g, fmt(reminderBilling.totalAmount))
            .replace(/{{totalPaid}}/g, fmt(reminderBilling.totalPaid))
            .replace(/{{breakdownRows}}/g, breakdownRows)
        );
      }
    } catch {
      setReminderPreviewHtml(null);
    }

    setReminderModal(true);
  };

  const addCustomReminderEmail = () => {
    const email = customReminderEmail.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Invalid email address");
      return;
    }
    if (reminderRecipients.some((entry) => entry.email === email)) {
      toast.error("Already added");
      return;
    }
    setReminderRecipients((current) => [...current, { label: email, email }]);
    setCustomReminderEmail("");
  };

  const addSuggestedReminderRecipient = (suggestion: EmailOption) => {
    if (reminderRecipients.some((entry) => entry.email === suggestion.email)) return;
    setReminderRecipients((current) => [...current, suggestion]);
    setReminderSuggestions((current) => current.filter((entry) => entry.email !== suggestion.email));
  };

  const removeReminderRecipient = (email: string) => {
    setReminderRecipients((current) => current.filter((entry) => entry.email !== email));
    setReminderSuggestions((current) => restoreSuggestion(email, current, reminderSuggestionCatalog));
  };

  const sendReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reminderRecipients.length === 0) {
      toast.error("Add at least one recipient");
      return;
    }

    const reminderBilling = allBillings.find((entry) => entry._id === activeReminderBillingId) || billing;
    if (!reminderBilling || !client) {
      toast.error("Billing context is no longer available.");
      return;
    }

    setReminderSending(true);
    try {
      const results = await Promise.all(
        reminderRecipients.map((recipient) =>
          fetch("/api/email/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: recipient.email,
              subject: reminderForm.subject,
              ...(reminderPreviewHtml ? { reminderHtml: reminderPreviewHtml } : { message: reminderForm.message }),
              logType: "payment_reminder",
              logClientId: reminderBilling.clientId,
              logClientName: client.companyName,
              logFy: reminderBilling.financialYear,
            }),
          }).then((response) => response.json())
        )
      );

      const failed = results.filter((result) => !result.success);
      if (failed.length > 0) {
        toast.error(`${failed.length} email(s) failed`);
        return;
      }

      closeReminderModal();
      toast.success(`Reminder sent to ${reminderRecipients.length} recipient${reminderRecipients.length === 1 ? "" : "s"}!`);
      navigateToClientSection({ primary: "financial", secondary: "billing" });
    } finally {
      setReminderSending(false);
    }
  };

  const handleActivityAction = (activity: ActivityItem) => {
    if (activity.entityType === "billing") {
      const targetBilling = allBillings.find((record) => record._id === activity.entityId);
      if (targetBilling) {
        setSelectedFy(targetBilling.financialYear);
        openBillingModalForRecord(targetBilling);
      }
      return;
    }

    if (activity.entityType === "payment") {
      const targetPayment = allPayments.find((record) => record._id === activity.entityId);
      if (targetPayment) {
        setSelectedFy(targetPayment.financialYear || selectedFy);
        openPaymentModalForRecord(targetPayment);
      }
      return;
    }

    if (activity.entityType === "email") {
      router.push(`/dashboard/email-history?clientId=${encodeURIComponent(clientId)}`);
      return;
    }

    if (activity.entityType === "financial-year") {
      openFYModal(fyRecords.find((record) => record._id === activity.entityId) || fyData || null);
      return;
    }

    if (activity.entityType === "annual-return") {
      navigateToClientSection({ primary: "compliance", secondary: "annualReturn" });
      return;
    }

    if (activity.entityType === "invoice") {
      navigateToClientSection({ primary: "compliance", secondary: "invoiceTracking" });
      return;
    }

    if (activity.entityType === "upload") {
      navigateToClientSection({ primary: "compliance", secondary: "cpcbUpload" });
      return;
    }

    if (activity.entityType === "quotation" && activity.entityId) {
      router.push(`/dashboard/quotations/${activity.entityId}`);
      return;
    }

    if (activity.entityType === "document") {
      const targetDocument = documents.find((record) => record._id === activity.entityId);
      if (targetDocument?.driveLink) window.open(targetDocument.driveLink, "_blank", "noopener,noreferrer");
      else navigateToClientSection({ primary: "documents", secondary: "all" });
      return;
    }

    if (activity.entityType === "trash") {
      const query = new URLSearchParams();
      if (activity.recordType) query.set("type", activity.recordType);
      if (activity.actionSearch) query.set("search", activity.actionSearch);
      router.push(`/dashboard/trash${query.toString() ? `?${query.toString()}` : ""}`);
    }
  };

  // Open edit modal pre-filled with current client data
  const openEdit = (tab: "basic" | "portal" = "basic") => {
    if (!client) return;
    setEditInitialTab(tab);
    setEditModal(true);
  };
  const openBasicEdit = () => openEdit();

  const handleSaveClient = async (
    data: ClientFormData,
    formPersons: PersonEntry[],
    removedIds: string[]
  ) => {
    setSaving(true);
    try {
      const validPersons: PersonEntry[] = [];

      for (const person of formPersons) {
        const hasAnyContent = Boolean(
          person.name.trim() ||
          person.designation.trim() ||
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

      const r = await fetch(`/api/clients/${clientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, persons: validPersons, removedPersonIds: removedIds }),
      });
      if (!r.ok) { toast.error("Failed to save"); return; }
      const refreshed = await r.json() as Client;
      setClient(refreshed);
      await mutateWorkspace(
        (current) => current ? { ...current, client: refreshed } : current,
        { revalidate: false }
      );
      refreshWorkspaceSilently();
      invalidate("/api/clients");
      setEditModal(false);
      toast.success("Client updated!");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="client-profile-page">
      <div className="client-profile-shell">
        <div className="client-profile-loading-state" role="status" aria-live="polite">
          <LoadingSpinner />
          <div>
            <p>Loading client workspace</p>
            <span>Preparing profile, compliance, financial, and activity records.</span>
          </div>
        </div>
      </div>
    </div>
  );
  if (loadError && !client) return (
    <div className="text-center py-20 max-w-md mx-auto">
      <p className="text-default font-semibold mb-2">Unable to load client profile</p>
      <p className="text-sm text-faint mb-5">{loadError}</p>
      <div className="flex items-center justify-center gap-2">
        <button onClick={() => loadData()} className="glass-btn glass-btn-primary">Retry</button>
        <button onClick={() => router.back()} className="glass-btn">Go Back</button>
      </div>
    </div>
  );
  if (!client) return (
    <div className="text-center py-20">
      <p className="text-faint mb-4">Client not found</p>
      <button onClick={() => router.back()} className="glass-btn">Go Back</button>
    </div>
  );

  const isPWP  = client.category === "PWP";
  const isSIMP = client.category === "SIMP";
  const fyData = fyRecords.find((r) => r.financialYear === selectedFy);
  const fyLastUpdated = fyData ? getLatestTimestamp(fyData.updatedAt, fyData.createdAt) : "";
  const billingLastUpdated = billing ? getLatestTimestamp(billing.updatedAt, billing.createdAt) : "";
  const portalLastUpdated = getLatestTimestamp(client.updatedAt, client.createdAt);

  const primaryContact  = client.contacts?.[0] ?? null;
  const primaryContactPhones = getContactPhones(primaryContact || undefined);
  const primaryContactEmails = getContactEmails(primaryContact || undefined);
  const contactName     = primaryContact?.name || "-";
  const contactMobile   = primaryContactPhones[0] || "-";
  const contactEmail    = primaryContactEmails[0] || "-";
  const contactDesig    = primaryContact?.designation || "";
  const passwordMask = "\u2022".repeat(8);

  const latestPayment = payments[0] || null;
  const hasLinkedContacts = (client.contacts?.length ?? 0) > 0;
  const getActivityActionLabel = (activity: ActivityItem) => {
    if (activity.entityType === "billing") return "Open Billing";
    if (activity.entityType === "payment") return "Open Payment";
    if (activity.entityType === "financial-year") return "Open FY";
    if (activity.entityType === "annual-return") return "Open Annual Return";
    if (activity.entityType === "invoice") return "Open Invoice Tracking";
    if (activity.entityType === "upload") return "Open CPCB Upload";
    if (activity.entityType === "quotation") return "Open Quotation";
    if (activity.entityType === "document") return "Open Document";
    if (activity.entityType === "email") return "Open Emails";
    if (activity.entityType === "trash") return "Open Recycle Bin";
    return null;
  };
  const selectedActivityRangeLabel = ACTIVITY_RANGES.find((range) => range.id === activityRange)?.label || "Last Month";
  const activityWindowHelpText = activityFilter === "documents"
    ? `${selectedActivityRangeLabel}: uploads, links, edits, migrations, deletions, and restores across this client.`
    : activityRange === "year"
      ? `All available FY ${selectedFy} activity plus client-wide events.`
      : `${selectedActivityRangeLabel} for FY ${selectedFy}, including client-wide events.`;
  const activityEmptyText = activityFilter === "documents"
    ? `No document events recorded for ${selectedActivityRangeLabel.toLowerCase()}`
    : `No ${activityFilter === "all" ? "" : `${activityFilter} `}activity recorded for ${selectedActivityRangeLabel.toLowerCase()}`;
  const getActivityFyChip = (activity: ActivityItem) => {
    if (activity.financialYear === selectedFy) {
      return {
        label: `FY ${selectedFy}`,
        className: "bg-brand-100 text-brand-700 dark:bg-neutral-800 dark:text-neutral-200",
      };
    }

    return {
      label: "All FY",
      className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    };
  };

  // Build breakdown rows from fyData
  const makeBreakdownRows = (rec: FYRecord) => {
    const pw = client.category === "PWP";
    return [
      { label: "CAT-I",   base: pw ? (rec.cat1Generated ?? rec.creditsCat1 ?? 0) : (rec.cat1Target ?? rec.targetCat1 ?? 0), used: pw ? (rec.soldCat1 ?? rec.usedCat1 ?? 0) : (rec.achievedCat1 ?? 0) },
      { label: "CAT-II",  base: pw ? (rec.cat2Generated ?? rec.creditsCat2 ?? 0) : (rec.cat2Target ?? rec.targetCat2 ?? 0), used: pw ? (rec.soldCat2 ?? rec.usedCat2 ?? 0) : (rec.achievedCat2 ?? 0) },
      { label: "CAT-III", base: pw ? (rec.cat3Generated ?? rec.creditsCat3 ?? 0) : (rec.cat3Target ?? rec.targetCat3 ?? 0), used: pw ? (rec.soldCat3 ?? rec.usedCat3 ?? 0) : (rec.achievedCat3 ?? 0) },
      { label: "CAT-IV",  base: pw ? (rec.cat4Generated ?? rec.creditsCat4 ?? 0) : (rec.cat4Target ?? rec.targetCat4 ?? 0), used: pw ? (rec.soldCat4 ?? rec.usedCat4 ?? 0) : (rec.achievedCat4 ?? 0) },
    ];
  };
  const makeBreakdownProps = (rec: FYRecord) => {
    const entries = isPWP ? rec.generated : rec.targets;
    if (Array.isArray(entries) && entries.length > 0) {
      return {
        entries,
        achievedMap: buildEntryValueMap(isPWP ? rec.soldByType : rec.achievedByType),
        rows: undefined,
      };
    }

    return {
      entries: undefined,
      achievedMap: undefined,
      rows: makeBreakdownRows(rec),
    };
  };
  const fyBaseEntries = fyData ? (isPWP ? fyData.generated : fyData.targets) : undefined;
  const fyUsageEntries = fyData ? (isPWP ? fyData.soldByType : fyData.achievedByType) : undefined;
  const fyHasTypedSplit = Array.isArray(fyBaseEntries) && fyBaseEntries.length > 0;
  const fyBaseMap = buildEntryValueMap(fyBaseEntries);
  const fyUsageMap = buildEntryValueMap(fyUsageEntries);
  const fyCategoryRows = fyData ? CATS.map((cat, index) => {
    const categoryId = CAT_IDS[index];
    const n = index + 1;
    const fallbackBase = isPWP
      ? (fyData[`cat${n}Generated` as keyof FYRecord] as number ?? fyData[`creditsCat${n}` as keyof FYRecord] as number ?? 0)
      : (fyData[`cat${n}Target` as keyof FYRecord] as number ?? fyData[`targetCat${n}` as keyof FYRecord] as number ?? 0);
    const fallbackUsed = isPWP
      ? (fyData[`soldCat${n}` as keyof FYRecord] as number ?? fyData[`usedCat${n}` as keyof FYRecord] as number ?? 0)
      : (fyData[`achievedCat${n}` as keyof FYRecord] as number ?? 0);
    const typedRows = CREDIT_TYPES.map((type) => {
      const key = `${categoryId}|${type}`;
      const base = fyBaseMap[key] ?? 0;
      const used = fyUsageMap[key] ?? 0;
      return { type, base, used, remaining: base - used };
    });
    const typedBase = typedRows.reduce((sum, row) => sum + row.base, 0);
    const typedUsed = typedRows.reduce((sum, row) => sum + row.used, 0);

    return {
      label: cat,
      categoryId,
      base: fyHasTypedSplit ? typedBase : fallbackBase,
      used: fyHasTypedSplit ? typedUsed : fallbackUsed,
      remaining: fyHasTypedSplit ? typedBase - typedUsed : fallbackBase - fallbackUsed,
      typedRows,
    };
  }) : [];
  const fyTypeTotals = CREDIT_TYPES.map((type) => {
    const base = CAT_IDS.reduce((sum, categoryId) => sum + (fyBaseMap[`${categoryId}|${type}`] ?? 0), 0);
    const used = CAT_IDS.reduce((sum, categoryId) => sum + (fyUsageMap[`${categoryId}|${type}`] ?? 0), 0);
    return { type, base, used, remaining: base - used };
  });
  const visibleCustomFields = customFieldDefinitions
    .filter((field) => {
      if (field.key === "legalName") return false;
      if (field.showInProfile === false) return false;
      const value = client.customFields?.[field.key];
      return field.type === "checkbox" ? Boolean(value) : String(value ?? "").trim().length > 0;
    })
    .sort((left, right) => (left.order || 0) - (right.order || 0) || left.label.localeCompare(right.label));
  const displayedCustomFields = showAllCustomProfileInfo ? visibleCustomFields : visibleCustomFields.slice(0, 3);
  const displayCustomFieldValue = (field: ClientCustomFieldDefinition) => {
    const value = client.customFields?.[field.key];
    if (field.type === "checkbox") return value ? "Yes" : "No";
    return String(value ?? "");
  };
  const renderCustomFieldIcon = (field: ClientCustomFieldDefinition) => {
    const Icon = CUSTOM_FIELD_ICON_COMPONENTS[field.icon || "fileText"] || FileText;
    return <Icon className="w-4 h-4" />;
  };
  const rawLegalName = client.legalName || String(client.customFields?.legalName || "");
  const legalName = isPWP ? "" : rawLegalName;
  const registrationDateMatch = findCpcbRegistrationDate(client, customFieldDefinitions);
  const registrationSignal: RegistrationSignal = registrationDateMatch
    ? {
        key: registrationDateMatch.key,
        label: customFieldDefinitions.find((field) => field.key === registrationDateMatch.key)?.label || "CPCB Registration Date",
        value: registrationDateMatch.value,
        date: registrationDateMatch.date,
      }
    : null;
  const registeredThisFy = registrationSignal ? isDateInFinancialYear(registrationSignal.date, selectedFy) : false;
  const annualReturn = annualReturns.find((record) => record.financialYear === selectedFy) || null;
  const complianceNavStates = getComplianceNavStates({
    annualReturn,
    fyData,
    invoices,
    selectedFy,
    uploadRecords,
  });
  const annualReturnStatus = annualReturn?.status === "Pending" || !annualReturn?.status
    ? "Not Started"
    : annualReturn.status;
  const invoiceCoverage = buildInvoiceCoverageSummary(invoices, selectedFy);
  const invoiceReceivedMonths = invoiceCoverage.sale.doneCount + invoiceCoverage.purchase.doneCount;
  const invoicePendingMonths = (12 - invoiceCoverage.sale.doneCount) + (12 - invoiceCoverage.purchase.doneCount);
  const cpcbUploadedTotal = uploadRecords.reduce((sum, record) => (
    sum +
    (Number(record.cat1) || 0) +
    (Number(record.cat2) || 0) +
    (Number(record.cat3) || 0) +
    (Number(record.cat4) || 0)
  ), 0);
  const cpcbUploadedCategoryTotals = [
    { label: "CAT-I", value: uploadRecords.reduce((sum, record) => sum + (Number(record.cat1) || 0), 0) },
    { label: "CAT-II", value: uploadRecords.reduce((sum, record) => sum + (Number(record.cat2) || 0), 0) },
    { label: "CAT-III", value: uploadRecords.reduce((sum, record) => sum + (Number(record.cat3) || 0), 0) },
    { label: "CAT-IV", value: uploadRecords.reduce((sum, record) => sum + (Number(record.cat4) || 0), 0) },
  ];
  const cpcbUploadedInvoiceCount = uploadRecords.reduce((sum, record) => sum + (Number(record.invoiceCount) || 0), 0);
  const requiresAcceptedQuotation = client.category === "Importer" || client.category === "Brand Owner";
  const quotationAccepted = acceptedQuotations.length > 0;
  const invoiceCoverageProgress = Math.min(1, invoiceReceivedMonths / 24);
  const hasCpcbUploadRecords = uploadRecords.length > 0;
  const cpcbUploadProgress = !hasCpcbUploadRecords
    ? 0
    : invoicePendingMonths === 0
      ? 1
      : uploadRecords.length > 1
        ? 0.6
        : 0.3;
  const cpcbUploadStatus = cpcbUploadProgress >= 1
    ? "Completed"
    : cpcbUploadProgress >= 0.6
      ? "In Progress"
      : cpcbUploadProgress > 0
        ? "Started"
        : "Not Started";
  const annualReturnComplete = annualReturnStatus === "Filed" || annualReturnStatus === "Verified" || annualReturnStatus === "Not Required This FY";
  const annualReturnProgressSteps: AnnualReturnProgressStep[] = [
    requiresAcceptedQuotation ? {
      id: "quotation",
      label: "Quotation",
      detail: quotationAccepted
        ? `${acceptedQuotations.length} accepted linked quotation${acceptedQuotations.length === 1 ? "" : "s"}`
        : hasSentLinkedQuotation
          ? "Linked quotation sent, awaiting acceptance"
          : "No accepted linked quotation for this FY",
      progress: quotationAccepted ? 1 : hasSentLinkedQuotation ? 0.5 : 0,
    } : (!isPWP && linkedQuotations.length > 0 ? {
      id: "quotation",
      label: "Quotation",
      detail: quotationAccepted ? "Accepted linked quotation available" : "Quotation is optional for this client type",
      progress: quotationAccepted ? 1 : hasSentLinkedQuotation ? 0.5 : 0.25,
    } : null),
    {
      id: "invoice-coverage",
      label: "Invoice Coverage",
      detail: `${invoiceReceivedMonths}/24 sale/purchase months complete`,
      progress: invoiceCoverageProgress,
    },
    {
      id: "cpcb-upload",
      label: "CPCB Upload",
      detail: `${cpcbUploadStatus} - ${cpcbUploadedTotal.toLocaleString("en-IN")} MT uploaded`,
      progress: cpcbUploadProgress,
    },
    {
      id: "billing",
      label: "Bill Created",
      detail: billing ? `${billing.paymentStatus} - ${formatCurrency(billing.totalAmount)}` : `No bill for FY ${selectedFy}`,
      progress: billing ? 1 : 0,
    },
    {
      id: "annual-return",
      label: "Annual Return Filed",
      detail: annualReturnComplete ? annualReturnStatus : `Current status: ${annualReturnStatus}`,
      progress: annualReturnComplete ? 1 : annualReturnStatus === "Ready to File" ? 0.9 : annualReturnStatus === "In Progress" ? 0.5 : 0,
    },
  ].filter(Boolean) as AnnualReturnProgressStep[];
  const annualReturnProgress = annualReturnProgressSteps.length > 0
    ? annualReturnProgressSteps.reduce((sum, step) => sum + Math.max(0, Math.min(1, step.progress)), 0) / annualReturnProgressSteps.length
    : 0;

  const customProfileFields: ClientProfileCustomField[] = displayedCustomFields.map((field) => ({
    id: field.key,
    label: field.label,
    value: displayCustomFieldValue(field),
    icon: renderCustomFieldIcon(field),
    mono: field.type === "number",
    position: (field.profilePosition || "beforeContact") as ClientProfileCustomField["position"],
  }));

  const validityField = visibleCustomFields.find((field) =>
    /valid|validity|expiry|expire/i.test(`${field.key} ${field.label}`)
  );
  const registrationStatus = isPWP ? "PWP" : client.registrationNumber ? "Registered" : "Registration not recorded";
  const validityLabel = validityField ? displayCustomFieldValue(validityField) : "not recorded";
  const billingStatus = billing?.paymentStatus || "No billing";

  const contactClient = () => {
    if (contactEmail !== "-") {
      window.location.href = `mailto:${contactEmail}`;
      return;
    }
    if (contactMobile !== "-") {
      window.location.href = `tel:${contactMobile}`;
      return;
    }
    openBasicEdit();
  };

  const quickActions: ClientProfileQuickAction[] = [
    {
      label: billing
        ? "Edit Billing"
        : isPWP
          ? "Annual Return Bill"
          : (client.category === "Importer" || client.category === "Brand Owner")
            ? "Quotation Bill"
            : "Add Billing",
      description: `FY ${selectedFy}`,
      icon: <Receipt className="w-4 h-4" />,
      onClick: () => openBillingModalForRecord(billing),
      tone: billing ? "neutral" : "primary",
    },
    {
      label: "Record Payment",
      description: latestPayment ? "Update latest or add new" : "Billing or advance",
      icon: <Wallet className="w-4 h-4" />,
      onClick: () => latestPayment ? openPaymentModalForRecord(latestPayment) : openPaymentModalForRecord(),
      tone: "success",
    },
    !isSIMP ? {
      label: isPWP ? "Credit Data" : "FY Data",
      description: fyData ? "Review quantities" : "Add current year",
      icon: <Target className="w-4 h-4" />,
      onClick: () => openFYModal(fyData || null),
      tone: fyData ? "neutral" : "warning",
    } : null,
    {
      label: "Upload Document",
      description: `${documents.length} saved`,
      icon: <FileUp className="w-4 h-4" />,
      onClick: openCreateDocument,
      tone: "neutral",
    },
    {
      label: "Invoice Tracking",
      description: `${invoices.length} entr${invoices.length === 1 ? "y" : "ies"}`,
      icon: <FileText className="w-4 h-4" />,
      onClick: () => openInvoiceModal(),
      tone: "neutral",
    },
    {
      label: "Upload Record",
      description: `${uploadRecords.length} portal upload${uploadRecords.length === 1 ? "" : "s"}`,
      icon: <Upload className="w-4 h-4" />,
      onClick: openUploadModal,
      tone: "neutral",
    },
    billing && billing.pendingAmount > 0 ? {
      label: "Send Reminder",
      description: formatCurrency(billing.pendingAmount),
      icon: <Send className="w-4 h-4" />,
      onClick: () => openReminderModal(),
      tone: "danger",
    } : null,
    {
      label: "Contact Client",
      description: contactEmail !== "-" ? contactEmail : contactMobile !== "-" ? contactMobile : "Link a contact",
      icon: <Phone className="w-4 h-4" />,
      onClick: contactClient,
      tone: hasLinkedContacts ? "neutral" : "warning",
    },
    {
      label: "Generate Report",
      description: "Open reports",
      icon: <BarChart2 className="w-4 h-4" />,
      onClick: () => router.push("/dashboard/reports"),
      tone: "neutral",
    },
  ].filter(Boolean) as ClientProfileQuickAction[];

  const emptyStateActions = quickActions.filter((action) => (
    action.label === "Add Billing" ||
    action.label === "Annual Return Bill" ||
    action.label === "Quotation Bill" ||
    action.label === "Credit Data" ||
    action.label === "FY Data" ||
    action.label === "Upload Document"
  ));

  const healthMetrics: ClientProfileMetric[] = [
    {
      label: "Annual Return",
      value: annualReturnStatus,
      sub: annualReturn?.remarks || (registeredThisFy ? "Registered in current FY" : `FY ${selectedFy}`),
      icon: <ClipboardCheck className="w-4 h-4" />,
      tone: annualReturnStatus === "Filed" || annualReturnStatus === "Verified" || annualReturnStatus === "Not Required This FY" ? "success" : "warning",
      actionLabel: "Open",
      detailRows: [
        { label: "Financial Year", value: selectedFy },
        { label: "Filing State", value: annualReturnStatus },
        { label: "Registration", value: registeredThisFy ? "Registered this FY" : registrationStatus },
      ],
      onClick: () => navigateToClientSection({ primary: "compliance", secondary: "annualReturn" }),
    },
    {
      label: "AR Progress",
      value: `${Math.round(annualReturnProgress * 100)}%`,
      sub: `${annualReturnProgressSteps.filter((step) => step.progress >= 1).length}/${annualReturnProgressSteps.length} workflow milestones complete`,
      icon: <Target className="w-4 h-4" />,
      tone: annualReturnProgress >= 1 ? "success" : annualReturnProgress > 0.45 ? "warning" : "neutral",
      actionLabel: "Review",
      progress: annualReturnProgress,
      detailRows: [
        { label: "Completed", value: `${annualReturnProgressSteps.filter((step) => step.progress >= 1).length}/${annualReturnProgressSteps.length}` },
        { label: "Pending", value: `${annualReturnProgressSteps.filter((step) => step.progress < 1).length}` },
      ],
      milestones: annualReturnProgressSteps.map((step) => ({
        label: step.label,
        value: step.progress >= 1 ? "Complete" : step.progress > 0 ? "In progress" : "Pending",
        state: step.progress >= 1 ? "done" : step.progress > 0 ? "partial" : "pending",
      })),
      onClick: () => navigateToClientSection({ primary: "compliance", secondary: "annualReturn" }),
    },
    {
      label: "Invoice Coverage",
      value: `${invoiceReceivedMonths}/24`,
      sub: `${invoicePendingMonths} month${invoicePendingMonths === 1 ? "" : "s"} pending across sale/purchase`,
      icon: <FileText className="w-4 h-4" />,
      tone: invoicePendingMonths === 0 ? "success" : invoiceReceivedMonths > 0 ? "warning" : "neutral",
      actionLabel: "Update",
      progress: invoiceCoverageProgress,
      detailRows: [
        { label: "Received", value: `${invoiceReceivedMonths}/24` },
        { label: "Pending", value: `${invoicePendingMonths}` },
        { label: "Sale Months", value: `${invoiceCoverage.sale.doneCount}/12` },
        { label: "Purchase Months", value: `${invoiceCoverage.purchase.doneCount}/12` },
      ],
      onClick: () => navigateToClientSection({ primary: "compliance", secondary: "invoiceTracking" }),
    },
    {
      label: "CPCB Uploaded",
      value: `${cpcbUploadedTotal.toLocaleString("en-IN")} MT`,
      sub: `${uploadRecords.length} upload record${uploadRecords.length === 1 ? "" : "s"}`,
      icon: <Upload className="w-4 h-4" />,
      tone: hasCpcbUploadRecords ? "success" : "neutral",
      actionLabel: "Open",
      progress: cpcbUploadProgress,
      detailRows: [
        ...cpcbUploadedCategoryTotals.map((item) => ({ label: item.label, value: `${item.value.toLocaleString("en-IN")} MT` })),
        { label: "Invoices Uploaded", value: cpcbUploadedInvoiceCount.toLocaleString("en-IN") },
      ],
      onClick: () => navigateToClientSection({ primary: "compliance", secondary: "cpcbUpload" }),
    },
    {
      label: "Outstanding",
      value: formatCurrency(billing?.pendingAmount || 0),
      sub: billing ? billing.paymentStatus : `No billing for FY ${selectedFy}`,
      icon: <Target className="w-4 h-4" />,
      tone: billing && billing.pendingAmount > 0 ? "danger" : "success",
      actionLabel: billing ? "Open" : "Create",
      detailRows: [
        { label: "Billing Status", value: billing?.paymentStatus || "No billing" },
        { label: "Total Billed", value: formatCurrency(billing?.totalAmount || 0) },
        { label: "Paid", value: formatCurrency(billing?.totalPaid || 0) },
      ],
      onClick: () => billing
        ? navigateToClientSection({ primary: "financial", secondary: "billing" })
        : openBillingModalForRecord(),
    },
    {
      label: "Payment Status",
      value: billing?.paymentStatus || "No billing",
      sub: payments.length > 0 ? `${formatCurrency(billing?.totalPaid || 0)} paid in FY ${selectedFy}` : "No payments recorded",
      icon: <Wallet className="w-4 h-4" />,
      tone: billing && billing.pendingAmount <= 0 ? "success" : billing && billing.totalPaid > 0 ? "warning" : "neutral",
      actionLabel: latestPayment ? "Latest" : "Add",
      detailRows: [
        { label: "Payment State", value: billing?.paymentStatus || "No billing" },
        { label: "Paid", value: formatCurrency(billing?.totalPaid || 0) },
        { label: "Last Payment", value: latestPayment ? `${formatCurrency(latestPayment.amountPaid)} on ${formatDate(latestPayment.paymentDate)}` : "Not recorded" },
      ],
      onClick: () => latestPayment
        ? navigateToClientSection({ primary: "financial", secondary: "ledger" })
        : openPaymentModalForRecord(),
    },
    {
      label: "Documents",
      value: documents.length.toLocaleString("en-IN"),
      sub: documents.length > 0 ? "Linked files and drive URLs" : "No files linked",
      icon: <FileText className="w-4 h-4" />,
      tone: documents.length > 0 ? "brand" : "neutral",
      actionLabel: "Add",
      detailRows: [
        { label: "Linked Documents", value: documents.length.toLocaleString("en-IN") },
        { label: "Recent", value: documents[0]?.documentName || "No document linked" },
      ],
      onClick: openCreateDocument,
    },
    {
      label: "Last Activity",
      value: lastEmailActivity ? formatDate(lastEmailActivity.date) : activitiesTotal.toLocaleString("en-IN"),
      sub: lastEmailActivity ? lastEmailActivity.label : "No email activity yet",
      icon: <Zap className="w-4 h-4" />,
      tone: activitiesTotal > 0 ? "brand" : "neutral",
      actionLabel: "Review",
      detailRows: [
        { label: "Latest", value: lastEmailActivity ? lastEmailActivity.label : "No email activity yet" },
        { label: "Date", value: lastEmailActivity ? formatDate(lastEmailActivity.date) : "-" },
        { label: "Total Activity", value: activitiesTotal.toLocaleString("en-IN") },
      ],
      onClick: () => navigateToClientSection({ primary: "timeline", secondary: "all" }),
    },
  ];

  const profileAlerts: ClientProfileAlert[] = [
    annualReturnStatus !== "Filed" && annualReturnStatus !== "Verified" && annualReturnStatus !== "Not Required This FY" ? {
      id: "annual-return",
      title: annualReturnStatus === "Ready to File"
        ? "Annual Return Ready to File"
        : annualReturnStatus === "In Progress"
          ? "Annual Return In Progress"
          : "Annual Return Pending",
      detail: `FY ${selectedFy} filing status is ${annualReturnStatus}.`,
      tone: "warning",
      icon: <AlertCircle className="h-4 w-4" />,
      actionLabel: "Open",
      onAction: () => navigateToClientSection({ primary: "compliance", secondary: "annualReturn" }),
    } : null,
    invoicePendingMonths > 0 ? {
      id: "invoice-data",
      title: "Invoice Data Missing",
      detail: `${invoicePendingMonths} sale/purchase month${invoicePendingMonths === 1 ? "" : "s"} still pending for FY ${selectedFy}.`,
      tone: "warning",
      icon: <FileText className="h-4 w-4" />,
      actionLabel: "Update",
      onAction: () => navigateToClientSection({ primary: "compliance", secondary: "invoiceTracking" }),
    } : null,
    requiresAcceptedQuotation && !quotationAccepted ? {
      id: "quotation-not-accepted",
      title: "Quotation Not Accepted",
      detail: hasSentLinkedQuotation
        ? "A linked quotation exists, but billing stays locked until it is accepted."
        : `Create and accept a linked quotation for ${client.category} billing.`,
      tone: "warning",
      icon: <Receipt className="h-4 w-4" />,
      actionLabel: "Open",
      onAction: () => navigateToClientSection({ primary: "financial", secondary: "quotations" }),
    } : null,
    billing && billing.pendingAmount > 0 ? {
      id: "payment-pending",
      title: "Payment Pending",
      detail: `${formatCurrency(billing.pendingAmount)} outstanding.`,
      tone: "danger",
      icon: <Wallet className="h-4 w-4" />,
      actionLabel: "Reminder",
      onAction: () => openReminderModal(billing),
    } : null,
    !billing ? {
      id: "bill-not-generated",
      title: "Bill Not Generated",
      detail: client.category === "PWP" ? "Create Annual Return Bill for this FY." : `No billing entry for FY ${selectedFy}.`,
      tone: "neutral",
      icon: <Receipt className="h-4 w-4" />,
      actionLabel: "Open",
      onAction: () => navigateToClientSection({
        primary: "financial",
        secondary: client.category === "PWP" ? "billing" : "quotations",
      }),
    } : null,
    registeredThisFy && annualReturnStatus === "Not Required This FY" ? {
      id: "registered-current-fy",
      title: "Registered This FY - Return Not Required",
      detail: `Reminder due next FY for ${client.companyName}.`,
      tone: "success",
      icon: <CheckCircle2 className="h-4 w-4" />,
      actionLabel: "Review",
      onAction: () => navigateToClientSection({ primary: "compliance", secondary: "annualReturn" }),
    } : null,
  ].filter(Boolean) as ClientProfileAlert[];

  const renderFySummary = () => (
    fyData && !isSIMP ? (
      <ClientProfileFinancialSummary
        fyData={fyData}
        selectedFy={selectedFy}
        isPWP={isPWP}
        fyLastUpdated={fyLastUpdated}
        fyCategoryRows={fyCategoryRows}
        fyHasTypedSplit={fyHasTypedSplit}
        fyTypeTotals={fyTypeTotals}
        openFYModal={openFYModal}
        setBreakdownRec={setBreakdownRec}
      />
    ) : (
      <EmptyProfileState
        selectedFy={selectedFy}
        isPWP={isPWP}
        actions={emptyStateActions}
      />
    )
  );

  const complianceSections: Record<ComplianceSectionId, React.ReactNode> = {
    annualReturn: (
      <AnnualReturnTracker
        annualReturn={annualReturn}
        isRegisteredThisFy={registeredThisFy}
        onSaveStatus={saveAnnualReturnStatus}
        registrationSignal={registrationSignal}
        selectedFy={selectedFy}
      />
    ),
    invoiceTracking: (
      <InvoiceTrackingWorkspace
        selectedFy={selectedFy}
        invoices={invoices}
        onAddInvoice={openInvoiceModal}
      />
    ),
    cpcbUpload: (
      <CpcbUploadSummary
        selectedFy={selectedFy}
        uploadRecords={uploadRecords}
        onAddUpload={openUploadModal}
      />
    ),
    targetsCredits: renderFySummary(),
    registration: (
      <RegistrationDetails
        client={client}
        customFieldDefinitions={customFieldDefinitions}
        isPWP={isPWP}
        onEdit={openBasicEdit}
        registrationSignal={registrationSignal}
      />
    ),
    status: (
      <ComplianceStatusPanel
        annualReturn={annualReturn}
        fyData={fyData}
        invoices={invoices}
        isPWP={isPWP}
        onSectionChange={setActiveComplianceSection}
        selectedFy={selectedFy}
        uploadRecords={uploadRecords}
      />
    ),
  };

  const renderBillingPayments = (view: "all" | "billing" | "payments" | "ledger" = "all") => (
    <ClientProfileBillingPayments
      selectedFy={selectedFy}
      billing={billing}
      payments={payments}
      billingLastUpdated={billingLastUpdated}
      hasFyData={Boolean(fyData)}
      isPWP={isPWP}
      openReminderModal={openReminderModal}
      openBillingModalForRecord={openBillingModalForRecord}
      deleteBilling={deleteBilling}
      openFYModal={openFYModal}
      openPaymentModalForRecord={openPaymentModalForRecord}
      deletePayment={deletePayment}
      view={view}
    />
  );

  const financialSections: Record<FinancialSectionId, React.ReactNode> = {
    overview: (
      <FinancialOverviewPanel
        acceptedQuotationCount={acceptedQuotations.length}
        billing={billing}
        isPWP={isPWP}
        onAddPayment={() => openPaymentModalForRecord()}
        onCreateBilling={() => openBillingModalForRecord()}
        onOpenSection={setActiveFinancialSection}
        onSendReminder={() => openReminderModal(billing || undefined)}
        payments={payments}
        selectedFy={selectedFy}
      />
    ),
    quotations: (
      <BillingWorkflowPanel
        acceptedQuotations={acceptedQuotations}
        billing={billing}
        clientCategory={client.category}
        linkedQuotations={fyLinkedQuotations}
        onCreateDirectBill={() => openBillingModalForRecord()}
        onCreateFromQuotation={(quotation) => void openBillingFromQuotation(quotation)}
        onOpenQuotation={(quotation) => router.push(`/dashboard/quotations/${quotation._id}`)}
        onOpenQuotations={() => router.push(`/dashboard/quotations?clientId=${encodeURIComponent(client.clientId)}&financialYear=${encodeURIComponent(selectedFy)}`)}
        selectedFy={selectedFy}
      />
    ),
    billing: renderBillingPayments("billing"),
    payments: renderBillingPayments("payments"),
    ledger: renderBillingPayments("ledger"),
  };
  const financialNavItems = isPWP
    ? FINANCIAL_NAV.filter((item) => item.id !== "quotations")
    : FINANCIAL_NAV;

  const matchesDocument = (document: Document, category: DocumentCategory, pattern: RegExp) => (
    document.category === category || pattern.test(document.documentName)
  );
  const complianceDocumentPattern = /(annual|return|cpcb|compliance|registration|approval|certificate|epr|portal)/i;
  const financialDocumentPattern = /(bill|billing|payment|receipt|quotation|quote|financial|ledger)/i;
  const invoiceDocumentPattern = /(invoice|sale|purchase)/i;
  const certificateDocumentPattern = /(certificate|certification|approval|registration)/i;
  const documentGroups: Record<DocumentsSectionId, Document[]> = {
    all: documents,
    compliance: documents.filter((document) => matchesDocument(document, "compliance", complianceDocumentPattern)),
    financial: documents.filter((document) => matchesDocument(document, "financial", financialDocumentPattern)),
    invoices: documents.filter((document) => matchesDocument(document, "invoices", invoiceDocumentPattern)),
    certificates: documents.filter((document) => matchesDocument(document, "certificates", certificateDocumentPattern)),
    other: documents.filter((document) => ![
      matchesDocument(document, "compliance", complianceDocumentPattern),
      matchesDocument(document, "financial", financialDocumentPattern),
      matchesDocument(document, "invoices", invoiceDocumentPattern),
      matchesDocument(document, "certificates", certificateDocumentPattern),
    ].some(Boolean)),
  };
  const renderDocumentsPanel = (documentsForSection: Document[]) => (
    <DocumentsSection
      documents={documentsForSection}
      canManageDocuments={canManageDocuments}
      open={sectionOpen.documents}
      busyAction={busyAction}
      hasLinkedContacts={hasLinkedContacts}
      onToggle={() => toggleSection("documents")}
      onAdd={openCreateDocument}
      onUpload={() => setDocumentUploadOpen(true)}
      onEdit={openEditDocument}
      onDelete={setDocumentPendingDelete}
      onMigrate={(document) => void migrateDocument(document)}
      onLinkContact={openBasicEdit}
    />
  );
  const documentsSections: Record<DocumentsSectionId, React.ReactNode> = {
    all: renderDocumentsPanel(documentGroups.all),
    compliance: renderDocumentsPanel(documentGroups.compliance),
    financial: renderDocumentsPanel(documentGroups.financial),
    invoices: renderDocumentsPanel(documentGroups.invoices),
    certificates: renderDocumentsPanel(documentGroups.certificates),
    other: renderDocumentsPanel(documentGroups.other),
  };

  const renderTimelinePanel = () => (
    <ClientProfileActivityTimeline
      activityWindowHelpText={activityWindowHelpText}
      activityEmptyText={activityEmptyText}
      activitiesTotal={activitiesTotal}
      activityRange={activityRange}
      setActivityRange={setActivityRange}
      activityFilter={activityFilter}
      setActivityFilter={(filter) => {
        setActivityFilter(filter);
        setActiveTimelineSection(filter === "all" ? "all" : filter);
      }}
      activityError={activityError}
      activityLoading={activityLoading}
      activityLoadingMore={activityLoadingMore}
      activityHasMore={activityHasMore}
      filteredActivities={filteredActivities}
      loadMoreActivities={loadMoreActivities}
      getActivityFyChip={getActivityFyChip}
      getActivityActionLabel={getActivityActionLabel}
      handleActivityAction={handleActivityAction}
    />
  );
  const timelineSections: Record<TimelineSectionId, React.ReactNode> = {
    all: renderTimelinePanel(),
    compliance: renderTimelinePanel(),
    financial: renderTimelinePanel(),
    communications: renderTimelinePanel(),
    documents: renderTimelinePanel(),
    system: renderTimelinePanel(),
  };
  const timelineFilterMap: Partial<Record<TimelineSectionId, ActivityFilter>> = {
    all: "all",
    compliance: "compliance",
    financial: "financial",
    communications: "communications",
    documents: "documents",
    system: "system",
  };
  const handleTimelineSectionChange = (section: TimelineSectionId) => {
    setActiveTimelineSection(section);
    const nextFilter = timelineFilterMap[section];
    if (nextFilter) setActivityFilter(nextFilter);
  };

  const renderActionPanel = (kicker: string, title: string, alerts: ClientProfileAlert[], emptyText: string) => (
    <section className="client-profile-card">
      <div className="client-profile-card-header">
        <div>
          <p className="client-profile-kicker">{kicker}</p>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="client-profile-status-checks">
        {alerts.length === 0 ? (
          <div data-done="true">
            <span><CheckCircle2 className="h-4 w-4" /></span>
            <div>
              <p>No immediate action</p>
              <small>{emptyText}</small>
            </div>
          </div>
        ) : alerts.map((alert) => (
          <button key={`${kicker}-${alert.id}`} type="button" onClick={alert.onAction} data-done="false">
            <span>{alert.icon || <AlertCircle className="h-4 w-4" />}</span>
            <div>
              <p>{alert.title}</p>
              <small>{alert.detail || "Review this item"}</small>
            </div>
          </button>
        ))}
      </div>
    </section>
  );

  const notesSections: Record<NotesTasksSectionId, React.ReactNode> = {
    notes: (
      <NotesSection
        notes={billing?.notes}
        updatedAt={getLatestTimestamp(client.updatedAt, client.createdAt)}
        onEditBilling={() => openBillingModalForRecord(billing)}
      />
    ),
    tasks: renderActionPanel("Tasks", "Next team actions", profileAlerts, "The current FY profile looks clear."),
    reminders: renderActionPanel(
      "Reminders",
      "Due reminders",
      profileAlerts.filter((alert) => alert.id === "payment-pending" || alert.id === "registered-current-fy"),
      "No payment or next-FY reminder is due."
    ),
    followUps: renderActionPanel(
      "Follow-ups",
      "Client follow-ups",
      profileAlerts.filter((alert) => alert.id === "invoice-data" || alert.id === "annual-return" || alert.id === "quotation-not-accepted"),
      "No compliance or quotation follow-up is pending."
    ),
    callsMeetings: renderActionPanel(
      "Calls / Meetings",
      "Contact actions",
      hasLinkedContacts ? [] : [{
        id: "link-contact",
        title: "No linked contact",
        detail: "Add a primary contact before logging calls or meetings.",
        tone: "warning",
        icon: <Phone className="h-4 w-4" />,
        onAction: openBasicEdit,
      }],
      "No call or meeting action is pending."
    ),
  };

  return (
    <div className="client-profile-page">
      <div className="client-profile-shell">
        {loadWarning && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
            {loadWarning}
          </div>
        )}

        <ClientProfileHeader
          client={client}
          legalName={legalName}
          selectedFy={selectedFy}
          financialYears={FINANCIAL_YEARS}
          onFinancialYearChange={setSelectedFy}
          registrationStatus={registrationStatus}
          validityLabel={validityLabel}
          billingStatus={billingStatus}
          progress={headerProgress}
          copiedKey={copiedKey}
          onCopyClientId={() => handleCopy(client.clientId, "client-id", "Client ID")}
          onBack={() => router.back()}
          onEdit={openBasicEdit}
          primaryActions={quickActions}
        />

        <HealthDashboard metrics={healthMetrics} />
        <ClientAlerts alerts={profileAlerts} />
        <QuickActions actions={quickActions} />
        <ClientPrimaryTabs
          activeTab={activePrimaryTab}
          navRef={primaryTabsRef}
          onChange={handlePrimaryTabChange}
        />
        <div
          ref={workspaceHeadRef}
          className="client-profile-workspace-head"
          aria-hidden="true"
        />

        <div
          ref={workspaceRef}
          className="client-profile-content-stack"
          data-shortcut-focus={workspaceHighlighted ? "true" : undefined}
          data-workspace-pinned={workspacePinned ? "true" : undefined}
          style={workspacePinned && workspaceMinHeight > 0 ? { minHeight: workspaceMinHeight } : undefined}
        >
          {activePrimaryTab === "overview" && (
            <>
              <section className="client-profile-overview-intro">
                <div>
                  <p className="client-profile-kicker">Overview</p>
                  <h2>Client workspace</h2>
                  <span>Identity, compliance progress, contacts, and account essentials.</span>
                </div>
                <div className="client-profile-overview-intro-actions">
                  <span><Calendar className="h-4 w-4" /> FY {selectedFy}</span>
                  <button type="button" onClick={openBasicEdit}>
                    <Pencil className="h-4 w-4" />
                    Edit client
                  </button>
                </div>
              </section>
              <AnnualReturnProgressPanel
                progress={annualReturnProgress}
                selectedFy={selectedFy}
                steps={annualReturnProgressSteps}
                subtitle={isPWP ? "PWP annual return workflow" : `${client.category} annual return workflow`}
                variant="hero"
                onAction={() => navigateToClientSection({ primary: "compliance", secondary: "annualReturn" })}
              />
              <CompanyOverview
                client={client}
                isPWP={isPWP}
                legalName={legalName}
                customFields={customProfileFields}
                hiddenCustomCount={visibleCustomFields.length - displayedCustomFields.length}
                showAllCustomFields={showAllCustomProfileInfo}
                onToggleCustomFields={() => setShowAllCustomProfileInfo((current) => !current)}
                primaryContact={primaryContact}
                contactName={contactName}
                contactDesig={contactDesig}
                contactMobile={contactMobile}
                contactEmail={contactEmail}
                copiedKey={copiedKey}
                onCopy={handleCopy}
                onEdit={openBasicEdit}
                onEditPortal={() => openEdit("portal")}
                contactsOpen={sectionOpen.contacts}
                portalOpen={sectionOpen.portal}
                onToggleContacts={() => toggleSection("contacts")}
                onTogglePortal={() => toggleSection("portal")}
                showPassword={showPassword}
                onTogglePassword={() => setShowPassword((current) => !current)}
                portalLastUpdated={portalLastUpdated}
                passwordMask={passwordMask}
              />
              {!fyData && !billing && (
                <EmptyProfileState
                  selectedFy={selectedFy}
                  isPWP={isPWP}
                  actions={emptyStateActions}
                />
              )}
            </>
          )}

          {activePrimaryTab === "compliance" && (
            <>
              <FYTabBar value={selectedFy} onChange={setSelectedFy} />
              <AnnualReturnProgressPanel
                progress={annualReturnProgress}
                selectedFy={selectedFy}
                steps={annualReturnProgressSteps}
                subtitle="Milestones are based on linked profile records only"
              />
              <ComplianceWorkspace
                activeSection={activeComplianceSection}
                collapsed={secondaryNavCollapsed}
                isPWP={isPWP}
                navStates={complianceNavStates}
                onCollapsedChange={setSecondaryNavCollapsed}
                onSectionChange={setActiveComplianceSection}
                sections={complianceSections}
              />
            </>
          )}

          {activePrimaryTab === "financial" && (
            <>
              <FYTabBar value={selectedFy} onChange={setSelectedFy} />
              <ClientProfileSecondaryWorkspace
                activeSection={activeFinancialSection}
                collapsed={secondaryNavCollapsed}
                navItems={financialNavItems}
                onCollapsedChange={setSecondaryNavCollapsed}
                onSectionChange={setActiveFinancialSection}
                sections={financialSections}
                title="Financial"
              />
            </>
          )}

          {activePrimaryTab === "documents" && (
            <ClientProfileSecondaryWorkspace
              activeSection={activeDocumentsSection}
              collapsed={secondaryNavCollapsed}
              navItems={DOCUMENTS_NAV}
              onCollapsedChange={setSecondaryNavCollapsed}
              onSectionChange={setActiveDocumentsSection}
              sections={documentsSections}
              title="Documents"
            />
          )}

          {activePrimaryTab === "timeline" && (
            <ClientProfileSecondaryWorkspace
              activeSection={activeTimelineSection}
              collapsed={secondaryNavCollapsed}
              navItems={TIMELINE_NAV}
              onCollapsedChange={setSecondaryNavCollapsed}
              onSectionChange={handleTimelineSectionChange}
              sections={timelineSections}
              title="Timeline"
            />
          )}

          {activePrimaryTab === "notes" && (
            <ClientProfileSecondaryWorkspace
              activeSection={activeNotesSection}
              collapsed={secondaryNavCollapsed}
              navItems={NOTES_TASKS_NAV}
              onCollapsedChange={setSecondaryNavCollapsed}
              onSectionChange={setActiveNotesSection}
              sections={notesSections}
              title="Notes & Tasks"
            />
          )}
        </div>
      </div>

      <FloatingActionBar actions={quickActions} />
      {canManageDocuments && (
        <DocumentUploadModal
          open={documentUploadOpen}
          clientId={clientId}
          onClose={() => setDocumentUploadOpen(false)}
          onUploaded={(uploaded) => {
            setDocuments((current) => [...uploaded, ...current]);
            invalidate("/api/documents", "/api/activities");
            refreshWorkspaceSilently();
            scheduleActivityRefresh();
          }}
        />
      )}
      <Modal
        open={Boolean(documentPendingDelete)}
        onClose={() => {
          if (!busyAction?.startsWith("document-")) setDocumentPendingDelete(null);
        }}
        title="Move document to recycle bin?"
        subtitle={documentPendingDelete?.documentName}
        size="sm"
      >
        <div className="client-profile-delete-confirmation">
          <span className="client-profile-delete-confirmation-icon">
            <Trash2 className="h-5 w-5" />
          </span>
          <div>
            <p>This document link will be removed from the client profile.</p>
            <span>You can restore it later from the recycle bin.</span>
          </div>
        </div>
        <div className="mt-5 flex gap-2 border-t border-base pt-4">
          <button
            type="button"
            className="btn-secondary flex-1 justify-center"
            disabled={Boolean(busyAction?.startsWith("document-"))}
            onClick={() => setDocumentPendingDelete(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="client-profile-delete-confirmation-button flex-1"
            disabled={Boolean(busyAction?.startsWith("document-"))}
            onClick={() => void deleteDocument()}
          >
            <Trash2 className="h-4 w-4" />
            <span>{busyAction?.startsWith("document-") ? "Moving..." : "Move to Bin"}</span>
          </button>
        </div>
      </Modal>
      <Modal open={invoiceModal} onClose={closeInvoiceModal} title="Add Invoice Tracking">
        <form onSubmit={saveInvoiceTracking} className="space-y-4">
          <div>
            <label className="label">Financial Year</label>
            <input className="input-field bg-surface text-faint" value={invoiceForm.financialYear} readOnly />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Invoice Type *</label>
              <select
                className="input-field"
                value={invoiceForm.invoiceType}
                onChange={(e) => setInvoiceForm((current) => ({ ...current, invoiceType: e.target.value as InvoiceType | "" }))}
                required
              >
                <option value="">Select type</option>
                {INVOICE_TYPE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Month Status *</label>
              <select
                className="input-field"
                value={invoiceForm.status}
                onChange={(e) => setInvoiceForm((current) => ({ ...current, status: e.target.value as InvoiceStatus }))}
                required
              >
                {INVOICE_STATUS_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Received Via {invoiceForm.status === "Pending" || invoiceForm.status === "Nil / No Invoice" ? "" : "*"}</label>
              <select
                className="input-field"
                value={invoiceForm.receivedVia}
                onChange={(e) => setInvoiceForm((current) => ({ ...current, receivedVia: e.target.value as ReceivedVia | "" }))}
                required={invoiceForm.status === "Received" || invoiceForm.status === "Partial / Issue"}
              >
                <option value="">Select source</option>
                {RECEIVED_VIA_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <label className="label !mb-0">Select FY Months *</label>
              <span className="text-xs text-faint">
                {invoiceForm.selectedMonths.length} selected
              </span>
            </div>
            <InvoiceMonthSelector
              financialYear={invoiceForm.financialYear}
              invoiceType={invoiceForm.invoiceType}
              selectedMonths={invoiceForm.selectedMonths}
              onSelectedMonthsChange={(months) => setInvoiceForm((current) => ({ ...current, selectedMonths: months }))}
              existingInvoices={invoices}
            />
          </div>

          <div>
            <label className="label">Remarks</label>
            <textarea
              className="input-field"
              rows={3}
              value={invoiceForm.remarks}
              onChange={(e) => setInvoiceForm((current) => ({ ...current, remarks: e.target.value }))}
              placeholder="Optional note about partial data, nil month, or source details"
            />
          </div>

          <div className="rounded-2xl border border-base bg-surface/70 px-3 py-2 text-xs text-muted">
            Quantity is tracked separately in CPCB Upload Data. This selector only updates month-wise invoice coverage.
          </div>
          <div className="flex gap-2 pt-2 border-t border-base">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={inlineSaving}>
              {inlineSaving ? "Saving..." : "Save Month Status"}
            </button>
            <button type="button" className="btn-secondary" onClick={closeInvoiceModal}>Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal open={uploadModal} onClose={closeUploadModal} title="Add Upload Record">
        <form onSubmit={saveUploadRecord} className="space-y-4">
          <div>
            <label className="label">Financial Year</label>
            <input className="input-field bg-surface text-faint" value={uploadForm.financialYear} readOnly />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Upload Type</label>
              <select
                className="input-field"
                value={uploadForm.uploadType}
                onChange={(e) => setUploadForm((current) => ({ ...current, uploadType: e.target.value as "sale" | "purchase" }))}
              >
                <option value="sale">Sale</option>
                <option value="purchase">Purchase</option>
              </select>
            </div>
            <div>
              <label className="label">Number of Invoices</label>
              <input
                type="number"
                min="0"
                className="input-field font-mono"
                value={uploadForm.invoiceCount}
                onChange={(e) => setUploadForm((current) => ({ ...current, invoiceCount: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {CATS.map((category, index) => {
              const field = `cat${index + 1}` as "cat1" | "cat2" | "cat3" | "cat4";
              return (
                <div key={category}>
                  <label className="label">{category}</label>
                  <input
                    type="number"
                    min="0"
                    className="input-field font-mono"
                    value={uploadForm[field]}
                    onChange={(e) => setUploadForm((current) => ({ ...current, [field]: e.target.value }))}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 pt-2 border-t border-base">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={inlineSaving}>
              {inlineSaving ? "Saving..." : "Add Upload Record"}
            </button>
            <button type="button" className="btn-secondary" onClick={closeUploadModal}>Cancel</button>
          </div>
        </form>
      </Modal>

      <ClientProfileModals
        client={client}
        isPWP={isPWP}
        isSIMP={isSIMP}
        docModal={docModal}
        docModalMode={docModalMode}
        docForm={docForm}
        setDocForm={setDocForm}
        closeDocumentModal={closeDocumentModal}
        saveDocument={saveDocument}
        fyModal={fyModal}
        fyForm={fyForm}
        setFyForm={setFyForm}
        closeFyModal={closeFyModal}
        saveFY={saveFY}
        updateFyEntry={updateFyEntry}
        fyGeneratedTotal={fyGeneratedTotal}
        fyTargetTotal={fyTargetTotal}
        fyData={fyData}
        reminderModal={reminderModal}
        closeReminderModal={closeReminderModal}
        sendReminder={sendReminder}
        reminderRecipients={reminderRecipients}
        reminderSuggestions={reminderSuggestions}
        removeReminderRecipient={removeReminderRecipient}
        addSuggestedReminderRecipient={addSuggestedReminderRecipient}
        customReminderEmail={customReminderEmail}
        setCustomReminderEmail={setCustomReminderEmail}
        addCustomReminderEmail={addCustomReminderEmail}
        reminderForm={reminderForm}
        setReminderForm={setReminderForm}
        reminderPreviewHtml={reminderPreviewHtml}
        reminderSending={reminderSending}
        billingModal={billingModal}
        closeBillingModal={closeBillingModal}
        editingBillingId={editingBillingId}
        saveBilling={saveBilling}
        billingForm={billingForm}
        setBillingForm={setBillingForm}
        billingFormTotal={billingFormTotal}
        paymentModal={paymentModal}
        closePaymentModal={closePaymentModal}
        editingPaymentId={editingPaymentId}
        savePayment={savePayment}
        paymentForm={paymentForm}
        setPaymentForm={setPaymentForm}
        breakdownRec={breakdownRec}
        setBreakdownRec={setBreakdownRec}
        makeBreakdownProps={makeBreakdownProps}
        saving={saving}
        inlineSaving={inlineSaving}
      />

      {/* ── Unified Add/Edit Client Modal ── */}
      <ClientFormModal
        open={editModal}
        onClose={() => setEditModal(false)}
        client={client}
        customFieldDefinitions={customFieldDefinitions}
        onSave={handleSaveClient}
        saving={saving}
        initialTab={editInitialTab}
      />
    </div>
  );
}

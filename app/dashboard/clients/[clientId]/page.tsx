"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMotionValue, useScroll, useSpring } from "framer-motion";
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
import type { ClientCustomFieldDefinition } from "@/lib/clientCustomFields";
import FYTabBar from "@/components/ui/FYTabBar";
import { useFinancialYearState } from "@/app/providers";
import ClientProfileActivityTimeline from "./ClientProfileActivityTimeline";
import ClientProfileBillingPayments from "./ClientProfileBillingPayments";
import ClientProfileFinancialSummary from "./ClientProfileFinancialSummary";
import ClientProfileModals from "./ClientProfileModals";
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
  Hash, Mail, MapPin, Phone, Receipt, Send,
  Shield, Target, Upload, User, Wallet, Zap
} from "lucide-react";
import {
  ACTIVITY_PAGE_SIZE,
  ACTIVITY_RANGES,
  ACTIVITY_SCROLL_THRESHOLD,
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
  const activityTimelineListRef = useRef<HTMLDivElement | null>(null);

  // UI state
  const [activePrimaryTab, setActivePrimaryTab] = useState<ClientProfileTabId>("overview");
  const [activeComplianceSection, setActiveComplianceSection] = useState<ComplianceSectionId>("annualReturn");
  const [activeFinancialSection, setActiveFinancialSection] = useState<FinancialSectionId>("quotations");
  const [activeDocumentsSection, setActiveDocumentsSection] = useState<DocumentsSectionId>("all");
  const [activeTimelineSection, setActiveTimelineSection] = useState<TimelineSectionId>("all");
  const [activeNotesSection, setActiveNotesSection] = useState<NotesTasksSectionId>("notes");
  const [secondaryNavCollapsed, setSecondaryNavCollapsed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [docModal, setDocModal] = useState(false);
  const [docForm, setDocForm] = useState({ documentName: "", driveLink: "" });
  const [docModalMode, setDocModalMode] = useState<"create" | "edit">("create");
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
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
    portal: true,
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

  const fetchJson = useCallback(async <T,>(url: string, label: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      const message = await readErrorMessage(response, `Unable to load ${label}.`);
      throw new Error(message);
    }
    return response.json() as Promise<T>;
  }, [readErrorMessage]);

  const loadData = useCallback(async () => {

    const fetchClientProfile = async () => {
      const response = await fetch(`/api/clients/${clientId}`);
      if (response.status === 404) return null;
      if (!response.ok) {
        const message = await readErrorMessage(response, "Unable to load client profile.");
        throw new Error(message);
      }
      return response.json() as Promise<Client>;
    };

    setLoading(true);
    setLoadError(null);
    setLoadWarning(null);

    const results = await Promise.allSettled([
      fetchClientProfile(),
      fetchJson<FYRecord[]>(`/api/financial-year?clientId=${clientId}`, "financial years"),
      fetchJson<Document[]>(`/api/documents?clientId=${clientId}`, "documents"),
      fetchJson<Billing[]>(`/api/billing?clientId=${clientId}`, "billing"),
      fetchJson<Payment[]>(`/api/payments?clientId=${clientId}`, "payments"),
      fetchJson<InvoiceTrackingRecord[]>(`/api/invoices?clientId=${clientId}`, "invoice tracking"),
      fetchJson<UploadRecord[]>(`/api/upload-records?clientId=${clientId}`, "uploaded records"),
      fetchJson<AnnualReturnRecord[]>(`/api/annual-return?clientId=${clientId}`, "annual returns"),
    ]);

    const [clientResult, fyResult, docsResult, billingResult, paymentsResult, invoicesResult, uploadsResult, annualReturnResult] = results;
    const failedSections: string[] = [];

    if (clientResult.status === "fulfilled") {
      setClient(clientResult.value);
    } else {
      failedSections.push("client profile");
    }

    if (fyResult.status === "fulfilled") {
      setFyRecords(Array.isArray(fyResult.value) ? fyResult.value : []);
    } else {
      failedSections.push("financial years");
    }

    if (docsResult.status === "fulfilled") {
      setDocuments(Array.isArray(docsResult.value) ? docsResult.value : []);
    } else {
      failedSections.push("documents");
    }

    if (billingResult.status === "fulfilled") {
      setAllBillings(Array.isArray(billingResult.value) ? billingResult.value : []);
    } else {
      failedSections.push("billing");
    }

    if (paymentsResult.status === "fulfilled") {
      setAllPayments(Array.isArray(paymentsResult.value) ? paymentsResult.value : []);
    } else {
      failedSections.push("payments");
    }

    if (invoicesResult.status === "fulfilled") {
      setAllInvoices(Array.isArray(invoicesResult.value) ? invoicesResult.value : []);
    } else {
      failedSections.push("invoice tracking");
    }

    if (uploadsResult.status === "fulfilled") {
      setAllUploadRecords(Array.isArray(uploadsResult.value) ? uploadsResult.value : []);
    } else {
      failedSections.push("uploaded records");
    }

    if (annualReturnResult.status === "fulfilled") {
      setAnnualReturns(Array.isArray(annualReturnResult.value) ? annualReturnResult.value : []);
    } else {
      failedSections.push("annual returns");
    }

    if (clientResult.status === "rejected") {
      if (!clientRef.current) {
        setLoadError("Couldn't load this client profile right now. Please try again.");
      } else {
        setLoadWarning("The profile could not be refreshed completely. Showing the last loaded data.");
      }
    } else if (failedSections.length > 0) {
      setLoadWarning(`Some sections could not be loaded: ${failedSections.filter((section) => section !== "client profile").join(", ")}. Showing available data.`);
    }

    setLoading(false);
  }, [clientId, fetchJson, readErrorMessage, setAllBillings, setAllInvoices, setAllPayments, setAllUploadRecords]);

  useEffect(() => { loadData(); }, [loadData]);

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

  const handleActivityScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceToBottom <= ACTIVITY_SCROLL_THRESHOLD) {
      loadMoreActivities();
    }
  }, [loadMoreActivities]);

  const billing  = allBillings.find((b) => b.financialYear === selectedFy) || null;
  const payments = allPayments.filter((p) => p.financialYear === selectedFy);
  const invoices = allInvoices.filter((invoice) => invoice.financialYear === selectedFy);
  const uploadRecords = allUploadRecords.filter((record) => record.financialYear === selectedFy);
  const acceptedQuotations = linkedQuotations.filter((quotation) => quotation.status === "Accepted" && quotation.financialYear === selectedFy);
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
    if (activityLoading || activityLoadingMore || !activityHasMore || filteredActivities.length === 0) return;

    const lists = [activityTimelineListRef.current].filter(Boolean) as HTMLDivElement[];
    const shouldPrefetch = lists.some((element) => element.scrollHeight <= element.clientHeight + 8);

    if (shouldPrefetch) {
      loadMoreActivities();
    }
  }, [activityHasMore, activityLoading, activityLoadingMore, filteredActivities.length, loadMoreActivities]);

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

  useEffect(() => {
    if (!client) return;

    const publishContextTitle = (progress: number) => {
      const normalizedProgress = Math.max(0, Math.min(1, progress));
      window.dispatchEvent(new CustomEvent("dashboard:context-title", {
        detail: {
          title: client.companyName,
          subtitle: `${client.clientId} - ${client.category}`,
          progress: normalizedProgress,
        },
      }));
    };

    publishContextTitle(headerProgress.get());
    const unsubscribe = headerProgress.on("change", publishContextTitle);

    return () => {
      unsubscribe();
      window.dispatchEvent(new CustomEvent("dashboard:context-title", { detail: null }));
    };
  }, [client, headerProgress]);

  const closeDocumentModal = () => {
    setDocModal(false);
    setDocModalMode("create");
    setEditingDocumentId(null);
    setDocForm({ documentName: "", driveLink: "" });
  };

  const openCreateDocument = () => {
    setDocModalMode("create");
    setEditingDocumentId(null);
    setDocForm({ documentName: "", driveLink: "" });
    setDocModal(true);
  };

  const openEditDocument = (document: Document) => {
    setDocModalMode("edit");
    setEditingDocumentId(document._id);
    setDocForm({ documentName: document.documentName, driveLink: document.driveLink });
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
      closeDocumentModal();
      toast.success(editingDocumentId ? "Document updated!" : "Document added!");
    } finally {
      setInlineSaving(false);
    }
  };

  const deleteDocument = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    setBusyAction(`document-${id}`);
    try {
      const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!response.ok) {
        toast.error("Failed to remove document.");
        return;
      }
      setDocuments((prev) => prev.filter((d) => d._id !== id));
      invalidate("/api/trash", "/api/documents");
      toast.success("Document moved to recycle bin");
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

  const openInvoiceModal = () => {
    setInvoiceForm({
      financialYear: selectedFy,
      invoiceType: "",
      status: "Received",
      receivedVia: "",
      selectedMonths: [],
      remarks: "",
    });
    setInvoiceModal(true);
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
      toast.success(`${savedRecords.length} month${savedRecords.length === 1 ? "" : "s"} updated.`);
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
      toast.success("Upload record added!");
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
      setActivePrimaryTab("financial");
      if (acceptedQuotations.length === 0) {
        toast.error("Accept a quotation before generating a bill for this client type.");
        return;
      }
      if (acceptedQuotations.length === 1) {
        void openBillingFromQuotation(acceptedQuotations[0]);
        return;
      }
      toast("Use an accepted quotation to generate this bill.");
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
      toast.success(editingBillingId ? "Billing updated!" : "Billing saved!");
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
      toast.success(editingPaymentId ? "Payment updated!" : "Payment recorded!");
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
      toast.success(isPWP ? "Credit data saved!" : "FY data saved!");
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
      toast.success(`Annual return marked as ${status === "Pending" ? "Not Started" : status}.`);
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
      const refreshed = await fetch(`/api/clients/${clientId}`).then((x) => x.json());
      setClient(refreshed);
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
    if (activity.entityType === "email") return "Open Emails";
    if (activity.entityType === "trash") return "Open Recycle Bin";
    return null;
  };
  const selectedActivityRangeLabel = ACTIVITY_RANGES.find((range) => range.id === activityRange)?.label || "Last Month";
  const activityWindowHelpText = activityRange === "year"
    ? `Showing the full activity history available for FY ${selectedFy}.`
    : `Showing activity from the ${selectedActivityRangeLabel.toLowerCase()} within FY ${selectedFy}.`;
  const activityEmptyText = activityRange === "year"
    ? `No activity recorded for this filter in FY ${selectedFy}`
    : `No activity recorded in the ${selectedActivityRangeLabel.toLowerCase()} for this filter`;
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
      progress: annualReturnComplete ? 1 : annualReturnStatus === "In Progress" ? 0.5 : 0,
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
      onClick: openInvoiceModal,
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
      onClick: () => {
        setActivePrimaryTab("compliance");
        setActiveComplianceSection("annualReturn");
      },
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
      onClick: () => {
        setActivePrimaryTab("compliance");
        setActiveComplianceSection("annualReturn");
      },
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
      onClick: () => {
        setActivePrimaryTab("compliance");
        setActiveComplianceSection("invoiceTracking");
      },
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
      onClick: () => {
        setActivePrimaryTab("compliance");
        setActiveComplianceSection("cpcbUpload");
      },
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
      onClick: () => openBillingModalForRecord(billing),
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
      onClick: () => latestPayment ? openPaymentModalForRecord(latestPayment) : openPaymentModalForRecord(),
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
      onClick: () => setActivePrimaryTab("timeline"),
    },
  ];

  const profileAlerts: ClientProfileAlert[] = [
    annualReturnStatus !== "Filed" && annualReturnStatus !== "Verified" && annualReturnStatus !== "Not Required This FY" ? {
      id: "annual-return",
      title: annualReturnStatus === "In Progress" ? "Annual Return In Progress" : "Annual Return Pending",
      detail: `FY ${selectedFy} filing status is ${annualReturnStatus}.`,
      tone: "warning",
      icon: <AlertCircle className="h-4 w-4" />,
      actionLabel: "Open",
      onAction: () => {
        setActivePrimaryTab("compliance");
        setActiveComplianceSection("annualReturn");
      },
    } : null,
    invoicePendingMonths > 0 ? {
      id: "invoice-data",
      title: "Invoice Data Missing",
      detail: `${invoicePendingMonths} sale/purchase month${invoicePendingMonths === 1 ? "" : "s"} still pending for FY ${selectedFy}.`,
      tone: "warning",
      icon: <FileText className="h-4 w-4" />,
      actionLabel: "Update",
      onAction: () => {
        setActivePrimaryTab("compliance");
        setActiveComplianceSection("invoiceTracking");
      },
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
      onAction: () => {
        setActivePrimaryTab("financial");
        setActiveFinancialSection("quotations");
      },
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
      onAction: () => {
        setActivePrimaryTab("financial");
        setActiveFinancialSection(client.category === "PWP" ? "bills" : "quotations");
      },
    } : null,
    registeredThisFy && annualReturnStatus === "Not Required This FY" ? {
      id: "registered-current-fy",
      title: "Registered This FY - Return Not Required",
      detail: `Reminder due next FY for ${client.companyName}.`,
      tone: "success",
      icon: <CheckCircle2 className="h-4 w-4" />,
      actionLabel: "Review",
      onAction: () => {
        setActivePrimaryTab("compliance");
        setActiveComplianceSection("annualReturn");
      },
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
        legalName={legalName}
        registrationSignal={registrationSignal}
      />
    ),
    status: (
      <ComplianceStatusPanel
        annualReturn={annualReturn}
        billing={billing}
        fyData={fyData}
        invoices={invoices}
        isPWP={isPWP}
        selectedFy={selectedFy}
        uploadRecords={uploadRecords}
      />
    ),
  };

  const renderBillingPayments = (view: "all" | "billing" | "payments" = "all") => (
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

  const quotationStatusPanel = (
    <section className="client-profile-card">
      <div className="client-profile-card-header">
        <div>
          <p className="client-profile-kicker">Linked Quotations</p>
          <h2>Linked quotations only</h2>
        </div>
        <button type="button" className="client-profile-secondary-button" onClick={() => router.push(`/dashboard/quotations?clientId=${encodeURIComponent(client.clientId)}&financialYear=${encodeURIComponent(selectedFy)}`)}>
          <Receipt className="h-4 w-4" />
          <span>Open Quotations</span>
        </button>
      </div>
      <div className="client-profile-status-checks">
        {linkedQuotations.length === 0 ? (
          <div data-done="false">
            <span><AlertCircle className="h-4 w-4" /></span>
            <div>
              <p>No linked quotation</p>
              <small>Standalone quotations stay separate until they are explicitly linked to this client ID.</small>
            </div>
          </div>
        ) : linkedQuotations.slice(0, 6).map((quotation) => (
          <div key={quotation._id} data-done={quotation.status === "Accepted" ? "true" : "false"}>
            <span>{quotation.status === "Accepted" ? <CheckCircle2 className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}</span>
            <div>
              <p>{quotation.quotationNumber || quotation.clientName}</p>
              <small>{quotation.status} - {formatCurrency(quotation.grandTotal || 0)}</small>
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  const outstandingPanel = (
    <section className="client-profile-card">
      <div className="client-profile-card-header">
        <div>
          <p className="client-profile-kicker">Outstanding</p>
          <h2>Payment readiness for FY {selectedFy}</h2>
        </div>
        {billing && billing.pendingAmount > 0 && (
          <button type="button" className="client-profile-primary-button" onClick={() => openReminderModal(billing)}>
            <Send className="h-4 w-4" />
            <span>Send Reminder</span>
          </button>
        )}
      </div>
      <div className="client-profile-invoice-summary-row">
        <div>
          <span>{formatCurrency(billing?.totalAmount || 0)}</span>
          <p>Total billed</p>
          <small>{billing ? billing.paymentStatus : "No billing created"}</small>
        </div>
        <div>
          <span>{formatCurrency(billing?.totalPaid || 0)}</span>
          <p>Paid</p>
          <small>{payments.length} payment record{payments.length === 1 ? "" : "s"}</small>
        </div>
        <div>
          <span>{formatCurrency(billing?.pendingAmount || 0)}</span>
          <p>Outstanding</p>
          <small>{billing?.pendingAmount ? "Action required" : "No pending amount"}</small>
        </div>
      </div>
    </section>
  );

  const financialSections: Record<FinancialSectionId, React.ReactNode> = {
    quotations: (
      <>
        <BillingWorkflowPanel
          acceptedQuotations={acceptedQuotations}
          billing={billing}
          clientCategory={client.category}
          onCreateDirectBill={() => openBillingModalForRecord()}
          onCreateFromQuotation={(quotation) => void openBillingFromQuotation(quotation)}
          onOpenQuotations={() => router.push(`/dashboard/quotations?clientId=${encodeURIComponent(client.clientId)}&financialYear=${encodeURIComponent(selectedFy)}`)}
          selectedFy={selectedFy}
        />
        {quotationStatusPanel}
      </>
    ),
    bills: (
      <>
        {renderFySummary()}
        {renderBillingPayments("billing")}
      </>
    ),
    payments: renderBillingPayments("payments"),
    outstanding: outstandingPanel,
    paymentHistory: renderBillingPayments("payments"),
  };

  const matchesDocument = (document: Document, pattern: RegExp) => pattern.test(document.documentName);
  const complianceDocumentPattern = /(annual|return|cpcb|compliance|registration|approval|certificate|epr|portal)/i;
  const financialDocumentPattern = /(bill|billing|payment|receipt|quotation|quote|financial|ledger)/i;
  const invoiceDocumentPattern = /(invoice|sale|purchase)/i;
  const certificateDocumentPattern = /(certificate|certification|approval|registration)/i;
  const documentGroups: Record<DocumentsSectionId, Document[]> = {
    all: documents,
    compliance: documents.filter((document) => matchesDocument(document, complianceDocumentPattern)),
    financial: documents.filter((document) => matchesDocument(document, financialDocumentPattern)),
    invoices: documents.filter((document) => matchesDocument(document, invoiceDocumentPattern)),
    certificates: documents.filter((document) => matchesDocument(document, certificateDocumentPattern)),
    other: documents.filter((document) => ![
      complianceDocumentPattern,
      financialDocumentPattern,
      invoiceDocumentPattern,
      certificateDocumentPattern,
    ].some((pattern) => matchesDocument(document, pattern))),
  };
  const renderDocumentsPanel = (documentsForSection: Document[]) => (
    <DocumentsSection
      documents={documentsForSection}
      open={sectionOpen.documents}
      busyAction={busyAction}
      hasLinkedContacts={hasLinkedContacts}
      onToggle={() => toggleSection("documents")}
      onAdd={openCreateDocument}
      onEdit={openEditDocument}
      onDelete={deleteDocument}
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
      selectedFy={selectedFy}
      open={sectionOpen.recentActivity}
      onToggle={() => toggleSection("recentActivity")}
      activityWindowHelpText={activityWindowHelpText}
      activityEmptyText={activityEmptyText}
      activitiesTotal={activitiesTotal}
      activityRange={activityRange}
      setActivityRange={setActivityRange}
      activityFilter={activityFilter}
      setActivityFilter={setActivityFilter}
      activityError={activityError}
      activityLoading={activityLoading}
      activityLoadingMore={activityLoadingMore}
      activityHasMore={activityHasMore}
      filteredActivities={filteredActivities}
      listRef={activityTimelineListRef}
      handleActivityScroll={handleActivityScroll}
      getActivityFyChip={getActivityFyChip}
      getActivityActionLabel={getActivityActionLabel}
      handleActivityAction={handleActivityAction}
    />
  );
  const timelineSections: Record<TimelineSectionId, React.ReactNode> = {
    all: renderTimelinePanel(),
    compliance: renderTimelinePanel(),
    financial: renderTimelinePanel(),
    documents: renderTimelinePanel(),
    notes: renderTimelinePanel(),
  };
  const timelineFilterMap: Partial<Record<TimelineSectionId, ActivityFilter>> = {
    all: "all",
    compliance: "financial-year",
    financial: "billing",
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
        <ClientPrimaryTabs activeTab={activePrimaryTab} onChange={setActivePrimaryTab} />

        <div className="client-profile-content-stack">
          {activePrimaryTab === "overview" && (
            <>
              <AnnualReturnProgressPanel
                progress={annualReturnProgress}
                selectedFy={selectedFy}
                steps={annualReturnProgressSteps}
                subtitle={isPWP ? "PWP annual return workflow" : `${client.category} annual return workflow`}
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
                navItems={FINANCIAL_NAV}
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

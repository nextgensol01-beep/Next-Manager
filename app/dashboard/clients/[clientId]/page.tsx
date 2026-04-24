"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatCurrency, formatDate, PAYMENT_MODES } from "@/lib/utils";
import { CategoryBadge, PaymentStatusBadge } from "@/components/ui/CategoryBadge";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { invalidate } from "@/lib/useCache";
import FYTabBar from "@/components/ui/FYTabBar";
import { useFinancialYearState } from "@/app/providers";
import ClientProfileActivityTimeline from "./ClientProfileActivityTimeline";
import ClientProfileCpcbRecords from "./ClientProfileCpcbRecords";
import ClientProfileFinancialSummary from "./ClientProfileFinancialSummary";
import ClientProfileModals from "./ClientProfileModals";
import {
  ArrowLeft, Building2, Phone, Mail, MapPin, Plus, ExternalLink,
  Trash2, User, Shield, FileText, Hash, Lock, Smartphone,
  Target, Wallet, Zap,
  Receipt, Send, MailCheck, Activity, Pencil
} from "lucide-react";
import {
  ACTIVITY_FILTERS,
  ACTIVITY_PAGE_SIZE,
  ACTIVITY_RANGES,
  ACTIVITY_SCROLL_THRESHOLD,
  activityColors,
  activityIcon,
  buildEntryValueMap,
  buildFyEntries,
  buildLinkedContactEmailOptions,
  CAT_IDS,
  CATS,
  CollapsibleSectionHeader,
  CopyButton,
  createEmptyFyEntries,
  createPersonEntry,
  CREDIT_TYPES,
  emptyPersonEntry,
  FilterRail,
  formatDateTime,
  getContactEmails,
  getContactPhones,
  getLatestTimestamp,
  InfoRow,
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

const RECEIVED_VIA_OPTIONS = [
  { id: "hardcopy", label: "Hardcopy" },
  { id: "mail", label: "Mail" },
  { id: "whatsapp", label: "WhatsApp" },
] as const;

export default function ClientProfilePage() {
  const { clientId } = useParams<{ clientId: string }>();
  const router = useRouter();
  const pageHeaderRef = useRef<HTMLDivElement | null>(null);

  const [client, setClient] = useState<Client | null>(null);
  const [fyRecords, setFyRecords] = useState<FYRecord[]>([]);
  const [allBillings, setAllBillings] = useState<Billing[]>([]);
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [allInvoices, setAllInvoices] = useState<InvoiceTrackingRecord[]>([]);
  const [allUploadRecords, setAllUploadRecords] = useState<UploadRecord[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
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
  const activityTabListRef = useRef<HTMLDivElement | null>(null);
  const activityTimelineListRef = useRef<HTMLDivElement | null>(null);

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "portal" | "activity">("info");
  const [docModal, setDocModal] = useState(false);
  const [docForm, setDocForm] = useState({ documentName: "", driveLink: "" });
  const [docModalMode, setDocModalMode] = useState<"create" | "edit">("create");
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    financialYear: selectedFy,
    invoiceType: "",
    receivedVia: "",
    fromDate: "",
    toDate: "",
  });
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    financialYear: selectedFy,
    cat1: "0",
    cat2: "0",
    cat3: "0",
    cat4: "0",
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
  const [headerTitleProgress, setHeaderTitleProgress] = useState(0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sectionOpen, setSectionOpen] = useState({
    contacts: true,
    portal: true,
    documents: true,
    recentActivity: true,
  });

  // Edit client state
  const [editModal, setEditModal] = useState(false);
  const [editTab, setEditTab] = useState<"basic" | "portal">("basic");
  const [saving, setSaving] = useState(false);
  const [persons, setPersons] = useState<PersonEntry[]>([emptyPersonEntry()]);
  const [removedPersonIds, setRemovedPersonIds] = useState<string[]>([]);
  const [editForm, setEditForm] = useState({
    companyName: "", category: "", state: "", address: "",
    gstNumber: "", registrationNumber: "",
    cpcbLoginId: "", cpcbPassword: "", otpMobileNumber: "",
  });
  const [showEditPassword, setShowEditPassword] = useState(false);

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
    ]);

    const [clientResult, fyResult, docsResult, billingResult, paymentsResult, invoicesResult, uploadsResult] = results;
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
  }, [clientId, fetchJson, readErrorMessage]);

  useEffect(() => { loadData(); }, [loadData]);

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
  const filteredActivities = activities;
  const recentPayments = React.useMemo(() => {
    const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
    return payments.filter((payment) => new Date(payment.paymentDate).getTime() >= cutoff);
  }, [payments]);
  const recentPaymentsTotal = recentPayments.reduce((sum, payment) => sum + (Number(payment.amountPaid) || 0), 0);
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

    const lists = [activityTabListRef.current, activityTimelineListRef.current].filter(Boolean) as HTMLDivElement[];
    const shouldPrefetch = lists.some((element) => element.scrollHeight <= element.clientHeight + 8);

    if (shouldPrefetch) {
      loadMoreActivities();
    }
  }, [activityHasMore, activityLoading, activityLoadingMore, filteredActivities.length, loadMoreActivities]);

  useEffect(() => {
    if (!client) return;

    const scrollContainer = document.getElementById("dashboard-scroll-area");
    const headerElement = pageHeaderRef.current;
    if (!scrollContainer || !headerElement) return;

    let frameId = 0;

    const publishContextTitle = (progress: number) => {
      const normalizedProgress = Math.max(0, Math.min(1, progress));
      setHeaderTitleProgress((current) => (
        Math.abs(current - normalizedProgress) < 0.01 ? current : normalizedProgress
      ));

      window.dispatchEvent(new CustomEvent("dashboard:context-title", {
        detail: {
          title: client.companyName,
          subtitle: `${client.clientId} - ${client.category}`,
          progress: normalizedProgress,
        },
      }));
    };

    const updateContextTitle = () => {
      const headerRect = headerElement.getBoundingClientRect();
      const revealStart = 124;
      const revealEnd = 68;
      const nextProgress = (revealStart - headerRect.bottom) / (revealStart - revealEnd);
      publishContextTitle(nextProgress);
    };

    const handleScroll = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(updateContextTitle);
    };

    updateContextTitle();
    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      scrollContainer.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      window.dispatchEvent(new CustomEvent("dashboard:context-title", { detail: null }));
    };
  }, [client]);

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

      closeDocumentModal();
      await loadData();
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
      await loadData();
      toast.success("Document removed");
    } finally {
      setBusyAction(null);
    }
  };

  const closeInvoiceModal = () => {
    setInvoiceModal(false);
    setInvoiceForm({
      financialYear: selectedFy,
      invoiceType: "",
      receivedVia: "",
      fromDate: "",
      toDate: "",
    });
  };

  const openInvoiceModal = () => {
    setInvoiceForm({
      financialYear: selectedFy,
      invoiceType: "",
      receivedVia: "",
      fromDate: "",
      toDate: "",
    });
    setInvoiceModal(true);
  };

  const saveInvoiceTracking = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineSaving(true);
    try {
      const payload = {
        clientId,
        financialYear: invoiceForm.financialYear,
        invoiceType: invoiceForm.invoiceType,
        receivedVia: invoiceForm.receivedVia,
        fromDate: invoiceForm.fromDate,
        toDate: invoiceForm.toDate,
      };
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        toast.error(data?.error || "Failed to add invoice tracking.");
        return;
      }

      closeInvoiceModal();
      invalidate("/api/invoices");
      await loadData();
      setSelectedFy(payload.financialYear);
      toast.success("Invoice tracking added!");
    } finally {
      setInlineSaving(false);
    }
  };

  const closeUploadModal = () => {
    setUploadModal(false);
    setUploadForm({
      financialYear: selectedFy,
      cat1: "0",
      cat2: "0",
      cat3: "0",
      cat4: "0",
    });
  };

  const openUploadModal = () => {
    setUploadForm({
      financialYear: selectedFy,
      cat1: "0",
      cat2: "0",
      cat3: "0",
      cat4: "0",
    });
    setUploadModal(true);
  };

  const saveUploadRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineSaving(true);
    try {
      const payload = {
        clientId,
        financialYear: uploadForm.financialYear,
        cat1: Number(uploadForm.cat1) || 0,
        cat2: Number(uploadForm.cat2) || 0,
        cat3: Number(uploadForm.cat3) || 0,
        cat4: Number(uploadForm.cat4) || 0,
      };
      const response = await fetch("/api/upload-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        toast.error(data?.error || "Failed to add upload record.");
        return;
      }

      closeUploadModal();
      invalidate("/api/upload-records");
      await loadData();
      setSelectedFy(payload.financialYear);
      toast.success("Upload record added!");
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

  const saveBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineSaving(true);
    try {
      const payload = {
        clientId,
        financialYear: billingForm.financialYear,
        govtCharges: Number(billingForm.govtCharges) || 0,
        consultancyCharges: Number(billingForm.consultancyCharges) || 0,
        targetCharges: Number(billingForm.targetCharges) || 0,
        otherCharges: Number(billingForm.otherCharges) || 0,
        notes: billingForm.notes.trim(),
      };
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
        toast.error(data?.error || `Failed to ${editingBillingId ? "update" : "save"} billing.`);
        return;
      }

      closeBillingModal();
      await loadData();
      setSelectedFy(payload.financialYear);
      toast.success(editingBillingId ? "Billing updated!" : "Billing saved!");
    } finally {
      setInlineSaving(false);
    }
  };

  const deleteBilling = async (record: Billing) => {
    if (!confirm(`Move billing for FY ${record.financialYear} to recycle bin?`)) return;
    setBusyAction(`billing-${record._id}`);
    try {
      const response = await fetch(`/api/billing/${record._id}`, { method: "DELETE" });
      if (!response.ok) {
        toast.error("Failed to remove billing.");
        return;
      }
      await loadData();
      toast.success("Billing moved to recycle bin");
    } finally {
      setBusyAction(null);
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
    try {
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
        toast.error(data?.error || `Failed to ${editingPaymentId ? "update" : "record"} payment.`);
        return;
      }

      closePaymentModal();
      await loadData();
      setSelectedFy(payload.financialYear);
      toast.success(editingPaymentId ? "Payment updated!" : "Payment recorded!");
    } finally {
      setInlineSaving(false);
    }
  };

  const deletePayment = async (paymentId: string) => {
    if (!confirm("Move this payment to recycle bin?")) return;
    setBusyAction(`payment-${paymentId}`);
    try {
      const response = await fetch(`/api/payments/${paymentId}`, { method: "DELETE" });
      if (!response.ok) {
        toast.error("Failed to remove payment.");
        return;
      }
      await loadData();
      toast.success("Payment moved to recycle bin");
    } finally {
      setBusyAction(null);
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

      closeFyModal();
      await loadData();
      setSelectedFy(payload.financialYear);
      invalidate("/api/financial-year", "/api/dashboard", "/api/activities");
      toast.success(isPWP ? "Credit data saved!" : "FY data saved!");
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
      await loadData();
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
  const openEdit = () => {
    if (!client) return;
    setEditForm({
      companyName: client.companyName,
      category: client.category,
      state: client.state,
      address: client.address || "",
      gstNumber: client.gstNumber || "",
      registrationNumber: client.registrationNumber || "",
      cpcbLoginId: client.cpcbLoginId || "",
      cpcbPassword: client.cpcbPassword || "",
      otpMobileNumber: client.otpMobileNumber || "",
    });
    const existingPersons = (client.contacts || []).map((contact, index) => createPersonEntry({
      ...contact,
      personId: contact.personId || contact._id,
      designation: contact.designation || "",
      isPrimaryContact: contact.isPrimaryContact || index === 0,
    }));
    setPersons(existingPersons.length > 0 ? existingPersons : [emptyPersonEntry()]);
    setRemovedPersonIds([]);
    setEditTab("basic");
    setShowEditPassword(false);
    setEditModal(true);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const validPersons: PersonEntry[] = [];

      for (const person of persons) {
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

        if (!prepared.name) {
          toast.error("Each linked contact needs a name.");
          return;
        }

        if (prepared.phoneNumbers.length === 0 && prepared.emails.length === 0) {
          toast.error(`Contact "${prepared.name}" needs at least one phone number or email.`);
          return;
        }

        if (prepared.selectedPhones.length === 0 && prepared.selectedEmails.length === 0) {
          toast.error(`Select at least one phone or email for "${prepared.name}".`);
          return;
        }

        validPersons.push(prepared);
      }

      const r = await fetch(`/api/clients/${clientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editForm, persons: validPersons, removedPersonIds }),
      });
      if (!r.ok) { toast.error("Failed to save"); return; }
      const updated = await r.json();
      // Merge updated fields into client state - no reload needed
      setClient((prev) => prev ? { ...prev, ...updated } : prev);
      // If contacts changed, refetch full client to get populated contacts array
      const refreshed = await fetch(`/api/clients/${clientId}`).then((x) => x.json());
      setClient(refreshed);
      // Invalidate clients list cache so list page shows updated name/category
      invalidate("/api/clients");
      setEditModal(false);
      toast.success("Client updated!");
    } finally {
      setSaving(false);
    }
  };

  const addPerson = () => {
    setPersons((prev) => {
      const hasPrimary = prev.some((entry) => entry.isPrimaryContact);
      return [...prev, { ...emptyPersonEntry(), isPrimaryContact: !hasPrimary }];
    });
  };

  const removePerson = (index: number) => {
    setPersons((prev) => {
      const target = prev[index];
      if (target?.personId) {
        setRemovedPersonIds((current) => (
          current.includes(target.personId!) ? current : [...current, target.personId!]
        ));
      }

      const next = prev.filter((_, currentIndex) => currentIndex !== index);
      if (next.length === 0) return [emptyPersonEntry()];
      if (!next.some((entry) => entry.isPrimaryContact)) {
        next[0] = { ...next[0], isPrimaryContact: true };
      }
      return next;
    });
  };

  const updatePerson = (index: number, updated: PersonEntry) => {
    setPersons((prev) => prev.map((entry, currentIndex) => (
      currentIndex === index ? syncEntrySelections(updated) : entry
    )));
  };

  const setPrimary = (index: number) => {
    setPersons((prev) => prev.map((entry, currentIndex) => ({
      ...entry,
      isPrimaryContact: currentIndex === index,
    })));
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner /></div>;
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
  const emptyStateActions = [
    !isSIMP && !fyData
      ? {
          label: isPWP ? "Add Credit Data" : "Add FY Data",
          onClick: () => openFYModal(),
          tone: "secondary" as const,
        }
      : null,
    !billing
      ? {
          label: "Create Billing",
          onClick: () => openBillingModalForRecord(),
          tone: "primary" as const,
        }
      : null,
    billing && billing.pendingAmount > 0
      ? {
          label: "Send Reminder",
          onClick: () => openReminderModal(),
          tone: "secondary" as const,
        }
      : null,
    {
      label: "Add Document",
      onClick: openCreateDocument,
      tone: "secondary" as const,
    },
    {
      label: "Add Invoice Tracking",
      onClick: openInvoiceModal,
      tone: "secondary" as const,
    },
    {
      label: "Add Upload Record",
      onClick: openUploadModal,
      tone: "secondary" as const,
    },
    !hasLinkedContacts
      ? {
          label: "Link Contact",
          onClick: openEdit,
          tone: "secondary" as const,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; onClick: () => void; tone: "primary" | "secondary" }>;
  const topStats = [
    {
      label: "Current FY Billing",
      value: formatCurrency(billing?.totalAmount || 0),
      sub: billing ? `FY ${selectedFy}` : `No billing for FY ${selectedFy}`,
      accent: "text-default",
      actionLabel: billing ? "Edit billing" : "Create billing",
      onClick: () => openBillingModalForRecord(billing),
      icon: <Receipt className="w-4 h-4" />,
    },
    {
      label: "Paid",
      value: formatCurrency(billing?.totalPaid || 0),
      sub: payments.length > 0 ? `${payments.length} payment${payments.length === 1 ? "" : "s"} in FY ${selectedFy}` : `No payments in FY ${selectedFy}`,
      accent: "text-emerald-600 dark:text-emerald-400",
      actionLabel: latestPayment ? "Open latest payment" : "Record payment",
      onClick: () => latestPayment ? openPaymentModalForRecord(latestPayment) : openPaymentModalForRecord(),
      icon: <Wallet className="w-4 h-4" />,
    },
    {
      label: "Pending",
      value: formatCurrency(billing?.pendingAmount || 0),
      sub: billing ? `${billing.paymentStatus} status` : "Waiting for first billing",
      accent: billing && billing.pendingAmount > 0 ? "text-red-500" : "text-default",
      actionLabel: billing ? "Open billing" : "Create billing",
      onClick: () => openBillingModalForRecord(billing),
      icon: <Target className="w-4 h-4" />,
    },
    {
      label: "Recent Payments",
      value: recentPayments.length.toLocaleString("en-IN"),
      sub: recentPayments.length > 0 ? `${formatCurrency(recentPaymentsTotal)} in last 30 days` : "No recent payments in selected FY",
      accent: "text-default",
      actionLabel: latestPayment ? "Open latest payment" : "Add payment",
      onClick: () => latestPayment ? openPaymentModalForRecord(latestPayment) : openPaymentModalForRecord(),
      icon: <Activity className="w-4 h-4" />,
    },
    {
      label: "Last Email Activity",
      value: lastEmailActivity ? formatDate(lastEmailActivity.date) : "No emails yet",
      sub: lastEmailActivity ? lastEmailActivity.label : "Open email history to review drafts and reminders",
      accent: "text-default",
      actionLabel: "Open email history",
      onClick: () => router.push(`/dashboard/email-history?clientId=${encodeURIComponent(clientId)}`),
      icon: <MailCheck className="w-4 h-4" />,
    },
  ];
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
        className: "bg-brand-100 text-brand-700 dark:bg-brand-900/35 dark:text-brand-300",
      };
    }

    return {
      label: "All FY",
      className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    };
  };

  const TabBtn = ({ id, label, icon }: { id: "info" | "portal" | "activity"; label: string; icon: React.ReactNode }) => (
    <button onClick={() => setActiveTab(id)}
      className={`flex-1 py-3 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${activeTab === id ? "bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 border-b-2 border-brand-600" : "text-faint hover:text-muted"}`}>
      {icon}{label}
    </button>
  );

  const ActivityFilterChips = ({ compact = false }: { compact?: boolean }) => (
    <div className={compact ? "mb-3" : "mb-4"}>
      <FilterRail
        label="Type"
        value={activityFilter}
        options={ACTIVITY_FILTERS}
        onChange={setActivityFilter}
        tone="brand"
        dense={compact}
      />
    </div>
  );

  const ActivityRangeChips = ({ compact = false }: { compact?: boolean }) => (
    <div className={compact ? "mb-3" : "mb-4"}>
      <FilterRail
        label="Window"
        value={activityRange}
        options={ACTIVITY_RANGES}
        onChange={setActivityRange}
        tone="neutral"
        dense={compact}
      />
    </div>
  );

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

  const pageTitleStyle = {
    transform: `translateY(${-6 * headerTitleProgress}px) scale(${1 - (0.08 * headerTitleProgress)})`,
    opacity: 1 - (0.45 * headerTitleProgress),
    filter: `blur(${headerTitleProgress * 2}px)`,
  } as const;

  return (
    <div>
      {loadWarning && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
          {loadWarning}
        </div>
      )}

      {/* Header */}
      <div ref={pageHeaderRef} className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="glass-btn" style={{padding:"7px"}}><ArrowLeft className="w-4 h-4" /></button>
        <div
          className="flex-1 min-w-0 transition-[opacity,transform,filter] duration-300 ease-out will-change-transform"
          style={pageTitleStyle}
        >
          <h1 className="text-2xl font-bold text-default truncate">{client.companyName}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-flex items-center gap-1.5 font-mono text-xs bg-surface px-2 py-0.5 rounded">
              {client.clientId}
              <CopyButton
                copied={copiedKey === "client-id"}
                label="client ID"
                onClick={() => handleCopy(client.clientId, "client-id", "Client ID")}
                className="h-5 w-5 border-0 bg-transparent"
              />
            </span>
            <CategoryBadge category={client.category} />
          </div>
        </div>
        {/* Edit button in header */}
        <button onClick={openEdit} className="glass-btn">
          <Pencil className="w-4 h-4" /> Edit Client
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        {topStats.map((stat) => (
          <div key={stat.label} className="bg-card rounded-2xl border border-base p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center text-brand-600">
                {stat.icon}
              </div>
              <button type="button" onClick={stat.onClick} className="text-[11px] font-medium text-brand-600 hover:text-brand-700">
                {stat.actionLabel}
              </button>
            </div>
            <p className="text-xs text-muted mt-3">{stat.label}</p>
            <p className={`text-lg font-bold mt-1 ${stat.accent}`}>{stat.value}</p>
            <p className="text-xs text-faint mt-1 line-clamp-2">{stat.sub}</p>
          </div>
        ))}
      </div>

      {emptyStateActions.length > 0 && (
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-faint mb-1">Quick Actions</p>
              <p className="text-sm text-muted">
                {isPWP
                  ? "Set up credits, billing, CPCB records, documents, and contacts for this client from here."
                  : "Set up FY data, billing, CPCB records, reminders, documents, and contacts for this client from here."}
              </p>
            </div>
            <div className="glass-tray flex-wrap" style={{ flexWrap: "wrap", gap: "4px" }}>
              {emptyStateActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className={`glass-pill${action.tone === "primary" ? " glass-pill-active" : ""}`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT */}
        <div className="space-y-4 lg:sticky lg:top-0 lg:self-start">

          {/* Tabbed info card */}
          <div className="bg-card rounded-2xl shadow-sm border border-base overflow-hidden">
            <div className="flex border-b border-base">
              <TabBtn id="info"     label="Info"     icon={<User className="w-3.5 h-3.5" />} />
              <TabBtn id="portal"   label="Portal"   icon={<Shield className="w-3.5 h-3.5" />} />
              <TabBtn id="activity" label="Activity" icon={<Zap className="w-3.5 h-3.5" />} />
            </div>

            {activeTab === "info" && (
              <div className="p-5 space-y-3">
                <InfoRow icon={<User className="w-4 h-4" />}    label="Contact Person" value={contactName} sub={contactDesig} />
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <InfoRow icon={<Phone className="w-4 h-4" />} label="Mobile" value={contactMobile} mono />
                  </div>
                  {contactMobile !== "-" && (
                    <CopyButton
                      copied={copiedKey === "primary-phone"}
                      label="primary contact mobile"
                      onClick={() => handleCopy(contactMobile, "primary-phone", "Primary contact mobile")}
                    />
                  )}
                </div>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <InfoRow icon={<Mail className="w-4 h-4" />} label="Email" value={contactEmail} mono />
                  </div>
                  {contactEmail !== "-" && (
                    <CopyButton
                      copied={copiedKey === "primary-email"}
                      label="primary contact email"
                      onClick={() => handleCopy(contactEmail, "primary-email", "Primary contact email")}
                    />
                  )}
                </div>
                {(client.contacts?.length ?? 0) > 0 && (
                  <div className="pt-1 border-t border-soft">
                    <CollapsibleSectionHeader
                      title={`Contacts (${client.contacts!.length})`}
                      subtitle="Collapse linked contacts when you only need the company summary."
                      open={sectionOpen.contacts}
                      onToggle={() => toggleSection("contacts")}
                    />
                    {sectionOpen.contacts && (
                      <div className="space-y-2 mt-3">
                        {client.contacts!.map((c, contactIndex) => (
                          <div key={c._id} className="bg-surface rounded-xl px-3 py-2.5 border border-base/60">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold text-default">{c.name}</p>
                                {c.designation && <p className="text-xs text-faint">{c.designation}</p>}
                              </div>
                              {contactIndex === 0 && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/35 dark:text-brand-300">
                                  Primary
                                </span>
                              )}
                            </div>
                            <div className="mt-2 space-y-1.5">
                              {getContactPhones(c).map((phone, idx) => (
                                <div key={`phone-${idx}`} className="flex items-center gap-2 text-xs text-muted">
                                  <span className="font-mono flex-1 min-w-0 truncate">{phone}</span>
                                  <CopyButton
                                    copied={copiedKey === `contact-phone-${c._id}-${idx}`}
                                    label={`${c.name} phone`}
                                    onClick={() => handleCopy(phone, `contact-phone-${c._id}-${idx}`, `${c.name} phone`)}
                                  />
                                </div>
                              ))}
                              {getContactEmails(c).map((email, idx) => (
                                <div key={`email-${idx}`} className="flex items-center gap-2 text-xs text-muted">
                                  <span className="flex-1 min-w-0 truncate">{email}</span>
                                  <CopyButton
                                    copied={copiedKey === `contact-email-${c._id}-${idx}`}
                                    label={`${c.name} email`}
                                    onClick={() => handleCopy(email, `contact-email-${c._id}-${idx}`, `${c.name} email`)}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <InfoRow icon={<MapPin className="w-4 h-4" />}    label="State"           value={client.state} />
                {client.address        && <InfoRow icon={<Building2 className="w-4 h-4" />} label="Address"         value={client.address} />}
                {client.gstNumber && (
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <InfoRow icon={<Hash className="w-4 h-4" />} label="GST Number" value={client.gstNumber} mono />
                    </div>
                    <CopyButton
                      copied={copiedKey === "gst"}
                      label="GST number"
                      onClick={() => handleCopy(client.gstNumber || "", "gst", "GST number")}
                    />
                  </div>
                )}
                {client.registrationNumber && <InfoRow icon={<FileText className="w-4 h-4" />} label="Registration No." value={client.registrationNumber} mono />}
                <div className="pt-3 border-t border-soft flex items-center justify-between">
                  <div>
                    <p className="text-xs text-faint">Added {formatDate(client.createdAt)}</p>
                    <p className="text-[11px] text-faint mt-0.5">Last updated {formatDateTime(getLatestTimestamp(client.updatedAt, client.createdAt))}</p>
                  </div>
                  <button onClick={openEdit} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                </div>
              </div>
            )}

            {activeTab === "portal" && (
              <div className="p-5 space-y-3">
                <CollapsibleSectionHeader
                  title="Portal Credentials"
                  subtitle={portalLastUpdated ? `Last profile update ${formatDateTime(portalLastUpdated)}` : "Portal details are stored on the client profile."}
                  open={sectionOpen.portal}
                  onToggle={() => toggleSection("portal")}
                />
                {sectionOpen.portal && (
                  <>
                {!client.cpcbLoginId && !client.cpcbPassword && !client.otpMobileNumber ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-faint mb-3">No portal credentials saved.</p>
                    <button onClick={() => { openEdit(); setEditTab("portal"); }}
                      className="glass-btn">
                      <Plus className="w-3 h-3" /> Add Credentials
                    </button>
                  </div>
                ) : (
                  <>
                    {client.cpcbLoginId && (
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <InfoRow icon={<User className="w-4 h-4" />} label="CPCB Login ID" value={client.cpcbLoginId} mono />
                        </div>
                        <CopyButton
                          copied={copiedKey === "portal-login"}
                          label="CPCB login ID"
                          onClick={() => handleCopy(client.cpcbLoginId || "", "portal-login", "CPCB login ID")}
                        />
                      </div>
                    )}
                    {client.cpcbPassword  && (
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-3 text-sm">
                            <Lock className="w-4 h-4 text-faint mt-0.5 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-muted text-xs">CPCB Password</p>
                              <div className="flex items-center gap-2">
                                <p className="font-mono font-medium min-w-0 truncate">{showPassword ? client.cpcbPassword : passwordMask}</p>
                                <button onClick={() => setShowPassword(!showPassword)} className="text-xs text-brand-600 hover:underline">{showPassword ? "Hide" : "Show"}</button>
                              </div>
                            </div>
                          </div>
                        </div>
                        <CopyButton
                          copied={copiedKey === "portal-password"}
                          label="portal password"
                          onClick={() => handleCopy(client.cpcbPassword || "", "portal-password", "Portal password")}
                        />
                      </div>
                    )}
                    {client.otpMobileNumber && (
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <InfoRow icon={<Smartphone className="w-4 h-4" />} label="OTP Mobile" value={client.otpMobileNumber} mono />
                        </div>
                        <CopyButton
                          copied={copiedKey === "portal-otp-mobile"}
                          label="OTP mobile"
                          onClick={() => handleCopy(client.otpMobileNumber || "", "portal-otp-mobile", "OTP mobile")}
                        />
                      </div>
                    )}
                  </>
                )}
                <div className="pt-3 border-t border-soft">
                  <button onClick={() => { openEdit(); setTimeout(() => setEditTab("portal"), 50); }}
                    className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                    <Pencil className="w-3 h-3" /> Edit credentials
                  </button>
                </div>
                  </>
                )}
              </div>
            )}

            {activeTab === "activity" && (
              <div className="p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="text-xs text-faint">
                    Showing {filteredActivities.length} of {activitiesTotal.toLocaleString("en-IN")} events
                  </p>
                </div>
                <ActivityRangeChips compact />
                <ActivityFilterChips compact />
                <p className="text-xs text-faint mb-3">{activityWindowHelpText} FY-tagged events are highlighted and all-year events are marked All FY.</p>
                {activityError ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
                    {activityError}
                  </div>
                ) : activityLoading ? (
                  <div className="py-8 flex items-center justify-center">
                    <LoadingSpinner />
                  </div>
                ) : filteredActivities.length === 0 ? (
                  <p className="text-sm text-faint text-center py-6">{activityEmptyText}</p>
                ) : (
                  <div ref={activityTabListRef} onScroll={handleActivityScroll} className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                    {filteredActivities.map((act) => (
                      <div
                        key={act.id}
                        className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${
                          act.financialYear === selectedFy
                            ? "border-brand-200 bg-brand-50/50 dark:border-brand-900/50 dark:bg-brand-900/10"
                            : "border-dashed border-base bg-surface/70"
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${activityColors[act.color] || "bg-surface text-muted"}`}>
                          {activityIcon(act.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-default">{act.label}</p>
                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${getActivityFyChip(act).className}`}>{getActivityFyChip(act).label}</span>
                              {act.badge && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${act.badgeColor || "bg-surface text-muted"}`}>{act.badge}</span>}
                            </div>
                          </div>
                          <p className="text-xs text-muted truncate">{act.detail}</p>
                          <p className="text-xs text-faint">{act.date ? formatDate(act.date) : ""}</p>
                          {getActivityActionLabel(act) && (
                            <button type="button" onClick={() => handleActivityAction(act)} className="mt-1.5 text-[11px] font-medium text-brand-600 hover:text-brand-700">
                              {getActivityActionLabel(act)}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {activityLoadingMore && (
                      <div className="py-3 flex items-center justify-center">
                        <LoadingSpinner />
                      </div>
                    )}
                    {!activityLoadingMore && !activityHasMore && filteredActivities.length > 0 && (
                      <p className="py-2 text-center text-[11px] text-faint">You&apos;ve reached the end of this activity list.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Documents */}
          <div className="bg-card rounded-2xl p-5 shadow-sm border border-base">
            <CollapsibleSectionHeader
              title="Documents"
              subtitle={documents.length > 0 ? `${documents.length} linked document${documents.length === 1 ? "" : "s"}` : "Add important certificates, registrations, and shared links here."}
              open={sectionOpen.documents}
              onToggle={() => toggleSection("documents")}
              trailing={<button className="glass-btn glass-btn-primary" style={{padding:"5px 10px",fontSize:"11px"}} onClick={openCreateDocument}><Plus className="w-3 h-3" /> Add</button>}
            />
            {sectionOpen.documents && (
              <div className="mt-4">
                {documents.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm font-medium text-default">No documents yet</p>
                    <p className="text-sm text-faint mt-1">Add important certificates, registrations, and shared drive links here.</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                      <div className="glass-tray">
                        <button type="button" className="glass-pill glass-pill-active" onClick={openCreateDocument}>Add Document</button>
                        {!hasLinkedContacts && (
                          <button type="button" className="glass-pill" onClick={openEdit}>Link Contact</button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div key={doc._id} className="flex items-center justify-between p-2.5 rounded-xl bg-surface hover:bg-hover transition-colors">
                        <div>
                          <p className="text-sm font-medium text-default">{doc.documentName}</p>
                          <p className="text-xs text-faint">{formatDate(doc.uploadedDate)}</p>
                        </div>
                        <div className="flex gap-1">
                          <a href={doc.driveLink} target="_blank" rel="noopener noreferrer" className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg"><ExternalLink className="w-3.5 h-3.5" /></a>
                          <button type="button" onClick={() => openEditDocument(doc)} className="p-1.5 text-faint hover:text-brand-600 hover:bg-brand-50 rounded-lg"><Pencil className="w-3.5 h-3.5" /></button>
                          <button type="button" disabled={busyAction === `document-${doc._id}`} onClick={() => deleteDocument(doc._id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg disabled:opacity-60"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div className="lg:col-span-2 space-y-4">
          {/* FY Selector */}
          <FYTabBar value={selectedFy} onChange={setSelectedFy} />

          {/* Credits / Targets */}
          {fyData && !isSIMP && (
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
          )}

          <ClientProfileCpcbRecords
            selectedFy={selectedFy}
            invoices={invoices}
            uploadRecords={uploadRecords}
            onAddInvoice={openInvoiceModal}
            onAddUpload={openUploadModal}
          />

          <div className="bg-card rounded-2xl p-5 shadow-sm border border-base">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-default">Billing - FY {selectedFy}</h3>
                {billing && <PaymentStatusBadge status={billing.paymentStatus} />}
              </div>
              <div className="flex items-center gap-2">
                {billing ? (
                  <div className="glass-tray" style={{ gap: "3px" }}>
                    {billing.pendingAmount > 0 && (
                      <button type="button" className="glass-pill" onClick={() => openReminderModal(billing)}>
                        <Send className="w-3 h-3" /> Reminder
                      </button>
                    )}
                    <button type="button" className="glass-pill" onClick={() => openBillingModalForRecord(billing)}>
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                    <button type="button" className="glass-pill" style={{ color: "#ff3b30" }} disabled={busyAction === `billing-${billing._id}`} onClick={() => deleteBilling(billing)}>
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                ) : (
                  <button type="button" className="glass-btn glass-btn-primary" onClick={() => openBillingModalForRecord()}>
                    <Plus className="w-3.5 h-3.5" /> Create Billing
                  </button>
                )}
              </div>
            </div>
            {billingLastUpdated && <p className="text-xs text-faint mb-4">Last updated {formatDateTime(billingLastUpdated)}</p>}
            {billing ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <div className="bg-surface rounded-xl p-3"><p className="text-xs text-muted">Govt Charges</p><p className="font-semibold">{formatCurrency(billing.govtCharges)}</p></div>
                  <div className="bg-surface rounded-xl p-3"><p className="text-xs text-muted">Consultancy</p><p className="font-semibold">{formatCurrency(billing.consultancyCharges)}</p></div>
                  <div className="bg-surface rounded-xl p-3"><p className="text-xs text-muted">Target Charges</p><p className="font-semibold">{formatCurrency(billing.targetCharges)}</p></div>
                  <div className="bg-surface rounded-xl p-3"><p className="text-xs text-muted">Other Charges</p><p className="font-semibold">{formatCurrency(billing.otherCharges)}</p></div>
                </div>
                {billing.notes && <div className="rounded-xl bg-surface px-3 py-2.5 text-sm text-muted mb-4">{billing.notes}</div>}
                <div className="border-t border-soft pt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="text-center"><p className="text-xs text-muted">Total Billed</p><p className="font-bold text-default">{formatCurrency(billing.totalAmount)}</p></div>
                  <div className="text-center"><p className="text-xs text-muted">Paid</p><p className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(billing.totalPaid)}</p></div>
                  <div className="text-center"><p className="text-xs text-muted">Pending</p><p className="font-bold text-red-500">{formatCurrency(billing.pendingAmount)}</p></div>
                </div>
              </>
            ) : (
              <div className="text-center py-6">
                <p className="text-sm font-medium text-default">No billing recorded for FY {selectedFy}</p>
                <p className="text-sm text-faint mt-1">Create the first billing entry here so reminders and payment tracking can start.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  <div className="glass-tray">
                    <button type="button" className="glass-pill glass-pill-active" onClick={() => openBillingModalForRecord()}>
                      Create Billing
                    </button>
                    {!fyData && (
                      <button type="button" className="glass-pill" onClick={() => openFYModal()}>
                        {isPWP ? "Add Credit Data" : "Add FY Data"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-card rounded-2xl shadow-sm border border-base overflow-hidden">
            <div className="p-4 border-b border-base flex items-center justify-between gap-3">
              <h3 className="font-semibold text-default">Payment History - FY {selectedFy}</h3>
              <button type="button" className="glass-btn glass-btn-primary" onClick={() => openPaymentModalForRecord()}>
                <Plus className="w-3.5 h-3.5" /> Add Payment
              </button>
            </div>
            {payments.length > 0 ? (
              <table className="w-full min-w-[400px]">
                <thead><tr><th className="table-header">Date</th><th className="table-header">Amount</th><th className="table-header">Type</th><th className="table-header">Mode</th><th className="table-header">Reference</th><th className="table-header">Actions</th></tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p._id} className="hover:bg-surface border-t border-soft">
                      <td className="table-cell">{formatDate(p.paymentDate)}</td>
                      <td className="table-cell font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(p.amountPaid)}</td>
                      <td className="table-cell">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.paymentType === "advance" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"}`}>
                          {p.paymentType === "advance" ? "Advance" : "Billing"}
                        </span>
                      </td>
                      <td className="table-cell">{p.paymentMode}</td>
                      <td className="table-cell text-faint">{p.referenceNumber || "-"}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => openPaymentModalForRecord(p)} className="p-1.5 text-faint hover:text-brand-600 hover:bg-brand-50 rounded-lg">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" disabled={busyAction === `payment-${p._id}`} onClick={() => deletePayment(p._id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg disabled:opacity-60">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-6 text-center">
                <p className="text-sm font-medium text-default">No payments recorded for FY {selectedFy}</p>
                <p className="text-sm text-faint mt-1">Record billing or advance payments here without leaving the profile page.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  <div className="glass-tray">
                    <button type="button" className="glass-pill glass-pill-active" onClick={() => openPaymentModalForRecord()}>
                      Add Payment
                    </button>
                    {billing && billing.pendingAmount > 0 && (
                      <button type="button" className="glass-pill" onClick={() => openReminderModal()}>
                        Send Reminder
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Timeline */}
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

          {!fyData && !billing && (
            <div className="bg-card border border-base rounded-2xl p-8 shadow-sm text-center">
              <div className="w-12 h-12 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              </div>
              <p className="font-semibold text-default mb-1">No data for FY {selectedFy}</p>
              <p className="text-sm text-muted mb-4">
                {isPWP
                  ? "Start by adding credits or billing for this client, then link contacts and documents as needed."
                  : "Start by adding FY data or billing for this client, then link contacts, reminders, and documents as needed."}
              </p>
              <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                <div className="glass-tray" style={{ flexWrap: "wrap", justifyContent: "center" }}>
                  {emptyStateActions.map((action) => (
                    <button
                      key={`empty-${action.label}`}
                      type="button"
                      onClick={action.onClick}
                      className={`glass-pill${action.tone === "primary" ? " glass-pill-active" : ""}`}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

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
                onChange={(e) => setInvoiceForm((current) => ({ ...current, invoiceType: e.target.value }))}
                required
              >
                <option value="">Select type</option>
                {INVOICE_TYPE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Received Via *</label>
              <select
                className="input-field"
                value={invoiceForm.receivedVia}
                onChange={(e) => setInvoiceForm((current) => ({ ...current, receivedVia: e.target.value }))}
                required
              >
                <option value="">Select source</option>
                {RECEIVED_VIA_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">From Date *</label>
              <input
                type="date"
                className="input-field"
                value={invoiceForm.fromDate}
                onChange={(e) => setInvoiceForm((current) => ({ ...current, fromDate: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label">To Date *</label>
              <input
                type="date"
                className="input-field"
                value={invoiceForm.toDate}
                onChange={(e) => setInvoiceForm((current) => ({ ...current, toDate: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2 border-t border-base">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={inlineSaving}>
              {inlineSaving ? "Saving..." : "Add Invoice Tracking"}
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
        editModal={editModal}
        setEditModal={setEditModal}
        handleSaveClient={handleSaveClient}
        editTab={editTab}
        setEditTab={setEditTab}
        editForm={editForm}
        setEditForm={setEditForm}
        persons={persons}
        addPerson={addPerson}
        updatePerson={updatePerson}
        removePerson={removePerson}
        setPrimary={setPrimary}
        showEditPassword={showEditPassword}
        setShowEditPassword={setShowEditPassword}
        saving={saving}
        inlineSaving={inlineSaving}
      />
    </div>
  );
}

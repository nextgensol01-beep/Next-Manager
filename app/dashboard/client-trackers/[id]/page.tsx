"use client";

import { addDraftRule, moveDraftRule, removeDraftRule, restoreDraftRule, updateDraftRule, type DraftRuleChange, type WorkflowDraftChange } from "@/lib/tracker-email-draft-rules";
import type { DraftScenarioAnalysis } from "@/components/client-trackers/WorkflowTrackerClientPreview";

import { emailEditorVariables } from "@/lib/tracker-email-renderer";

import { readJsonResponse } from "@/lib/http-response";

import Link from "next/link";
import dynamic from "next/dynamic";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  CircleAlert,
  Check,
  LoaderCircle,
  Download,
  FileText,
  Filter,
  List,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings2,
  Trash2,
  Users,
} from "lucide-react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import EmailDeliveryReviewWorkspace from "@/components/client-trackers/EmailDeliveryReviewWorkspace";
import { useOptionalEmailDeliveryActions } from "@/components/client-trackers/EmailDeliveryActivityProvider";
import type { DeliveryJobAcceptance, DeliveryJobSummary } from "@/lib/email-delivery-jobs";
import { canonicalDeliveryBatch, type DeliveryBatch } from "@/lib/email-delivery-security";
import { buildDeliveryMessages, validateRecipientDrafts, SecurityRequestError } from "@/lib/email-delivery-security-client";
import { previewWithGmailSignature, type EmailPreview, type RecipientDraft, type EmailPreparationPhase } from "@/lib/tracker-email-delivery-review";
import Modal from "@/components/client-trackers/TrackerModal";
import { WorkflowStepNavigationDock, WorkflowStepContentStage, useWorkflowStepNavigation } from "@/components/client-trackers/WorkflowStepNavigation";
import WorkflowSendRuleComposer from "@/components/client-trackers/WorkflowSendRuleComposer";
import WorkflowEmailStyleChooser from "@/components/client-trackers/WorkflowEmailStyleChooser";
import StyleToStepperHandoff from "@/components/client-trackers/StyleToStepperHandoff";
import { handoffReceive } from "@/lib/workflow-style-handoff";
import { emailOperatorsForField, emailWorkflowValidationIssues, validateEmailWorkflowDrafts, type EmailWorkflowIssue } from "@/lib/tracker-email-validation";
import TrackerPageLoading from "@/components/client-trackers/TrackerPageLoading";
import { TrackerTransitionLink, useTrackerNavigation } from "@/components/client-trackers/TrackerNavigationTransition";
import { useFreshTrackerData } from "@/lib/useFreshTrackerData";
import { draftField, type TrackerDraftField } from "@/lib/tracker-create";
import { configurationChanges, configurationFields, configurationSnapshot, configurationNeedsFinancialYear, configurationSyncDraft, type TrackerConfiguration } from "@/lib/tracker-configuration";
import type { TrackerClientScope, TrackerSyncDraft } from "@/lib/tracker-sync";
import type { ClientTrackerCategory } from "@/lib/clientTrackers";
import ConfirmModal from "@/components/client-trackers/TrackerConfirmModal";
import { GlassToggle } from "@/components/ui/liquid-glass";
import { invalidate, useCache } from "@/lib/useCache";
import { useTrackerQuery } from "@/lib/useTrackerQuery";
import { adjustTrackerOverview, sameTrackerValue } from "@/lib/tracker-editing";
import { trackerMarkRevision } from "@/lib/tracker-revisions";
import {
  CLIENT_TRACKER_CATEGORIES,
  CLIENT_TRACKER_DETAIL_OPTIONS,
  type ClientTrackerDetailKey,
  type TrackerConditionGroup,
  type TrackerEmailAttachment,
  type TrackerEmailContentRule,
  type TrackerEmailWorkflow,
  type TrackerField,
  type TrackerRuleOperator,
  type TrackerSavedView,
  type TrackerValue,
  type TrackerValues,
} from "@/lib/clientTrackers";
import { TRACKER_OPTION_PALETTE, trackerHasOptionColors, trackerOptionColor, trackerOptionTone } from "@/lib/tracker-option-colors";

const ConfigureTrackerWorkspace = dynamic(() => import("@/components/client-trackers/configure/ConfigureTrackerWorkspace"), { loading: () => <LoadingSpinner /> });
const EmailDeliveryAuthorizationModal = dynamic(() => import("@/components/client-trackers/EmailDeliveryAuthorizationModal"), { loading: () => <LoadingSpinner /> });
const WorkflowTemplateWorkspace = dynamic(() => import("@/components/client-trackers/WorkflowTemplateWorkspace"), { loading: () => <LoadingSpinner /> });
const WorkflowDeliveryWorkspace = dynamic(() => import("@/components/client-trackers/WorkflowDeliveryWorkspace"), { loading: () => <LoadingSpinner /> });
const WorkflowReviewWorkspace = dynamic(() => import("@/components/client-trackers/WorkflowReviewWorkspace"), { loading: () => <LoadingSpinner /> });
const WorkflowMessagesWorkspace = dynamic(() => import("@/components/client-trackers/WorkflowMessagesWorkspace"), { loading: () => <LoadingSpinner /> });
const WorkflowCombinationPreview = dynamic(() => import("@/components/client-trackers/WorkflowCombinationPreview"), { loading: () => <LoadingSpinner /> });
const WorkflowTrackerClientPreview = dynamic(() => import("@/components/client-trackers/WorkflowTrackerClientPreview"), { loading: () => <LoadingSpinner /> });

type Client = {
  clientId: string;
  companyName: string;
  category: string;
  state: string;
  legalName?: string;
  gstNumber?: string;
  registrationNumber?: string;
  address?: string;
};
type ManagedDocumentOption = {
  _id: string;
  clientId: string;
  documentName: string;
  storageType?: string;
  driveFileId?: string;
  mimeType?: string;
  fileSize?: number;
};
type Entry = {
  _id: string;
  clientId: string;
  values: TrackerValues;
  fieldRevisions?: Record<string, number>;
  updatedAt: string;
  client: Client | null;
};
type SaveTrackerValue = (entry: Entry, field: TrackerField, value: TrackerValue, options?: { expectedRevision?: number; undo?: boolean; retry?: boolean }) => void;
type CellFeedback = "saved" | "failed" | "conflict";
function navigateTrackerSwitch(event: React.KeyboardEvent<HTMLTableSectionElement>) {
  const target = event.target as HTMLElement;
  if (target.getAttribute("role") !== "switch" || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
  const cell = target.closest<HTMLTableCellElement>("td[data-tracker-field]"), row = cell?.parentElement;
  if (!cell || !row) return;
  let destination: Element | undefined | null;
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    const sibling = event.key === "ArrowUp" ? row.previousElementSibling : row.nextElementSibling;
    destination = [...(sibling?.querySelectorAll<HTMLTableCellElement>("td[data-tracker-field]") || [])].find(item => item.dataset.trackerField === cell.dataset.trackerField);
  } else destination = event.key === "ArrowLeft" ? cell.previousElementSibling : cell.nextElementSibling;
  const control = destination?.querySelector<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),textarea:not(:disabled)');
  if (control) {
    event.preventDefault();
    const focus = () => { control.focus({ preventScroll: true }); control.scrollIntoView({ block: "nearest", inline: "nearest" }); };
    const disclosure = control.closest("tr")?.querySelector<HTMLButtonElement>('.tracker-mobile-toggle[aria-expanded="false"]');
    // The same keyboard path must reveal a collapsed phone row before focusing
    // its existing editor. Desktop controls keep their immediate focus behavior.
    if (disclosure?.getClientRects().length) { disclosure.click(); requestAnimationFrame(focus); }
    else focus();
  }
}
type TrackerDetail = {
  _id: string;
  name: string;
  description?: string;
  financialYear?: string;
  status: "active" | "archived";
  fields: TrackerField[];
  clientColumns?: ClientTrackerDetailKey[];
  savedViews?: TrackerSavedView[];
  entries: Entry[];
  clientIds: string[];
  clientMembershipMode?: "snapshot" | "categorySync";
  clientCategories?: ClientTrackerCategory[];
  clientScope?: TrackerClientScope;
  entryCount?: number;
  totalEntryCount?: number;
  offset?: number;
  nextOffset?: number | null;
  liveDataAsOf?: string;
  hasMore?: boolean;
  overviewCounts?: Array<{ key: string; value: TrackerValue; count: number }>;
  emailEnabled?: boolean;
  emailWorkflows?: TrackerEmailWorkflow[];
};
type TrackerEmailActivity = {
  summary?: Record<string, number>;
  logs?: Array<{
    _id: string;
    status: "draft" | "sent" | "failed";
    communicationStatus?: "sent" | "replied";
    mailKind?: "initial" | "reminder";
    sentAt: string;
    clientId?: string;
    clientName?: string;
    subject?: string;
    to?: string[];
    cc?: string[];
    renderedHtml?: string;
    campaignId?: string;
    gmailMessageId?: string;
    attachments?: Array<{
      documentId: string;
      filename: string;
      mimeType: string;
      fileSize: number;
    }>;
    gmailThreadId?: string;
    notes?: string;
  }>;
};
type TrackerActivity = {
  events?: Array<{
    _id: string;
    clientId: string;
    label: string;
    detail: string;
    badge?: string;
    actorEmail?: string;
    occurredAt: string;
  }>;
};
const ALL_FILTER = "__all_tracker_values__";

function valueText(value: TrackerValue | undefined) {
  if (Array.isArray(value)) return value.join(", ");
  return value === true ? "Yes" : value === false ? "No" : String(value ?? "");
}
function clientDetailValue(client: Client | null, key: ClientTrackerDetailKey) {
  return client?.[key] || "—";
}
function emailId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function emailConfigSnapshot(emailEnabled: boolean, workflows: TrackerEmailWorkflow[]) {
  return JSON.stringify({ emailEnabled, workflows });
}

function newWorkflow(fields: TrackerField[]): TrackerEmailWorkflow {
  const main = fields[0];
  return {
    id: emailId(),
    name: "New email workflow",
    mainFieldKey: main?.key || "status",
    mainValue: main?.type === "toggle" ? "No" : main?.options?.[0] || "",
    subject: "Update for {{client.companyName}} · {{tracker.financialYear}}",
    body: "Dear Team,\n\n{{points}}\n\nRegards,\nNextgen Solutions",
    points: [],
    contentMode: "points",
    combinationMatchingMode: "first",
    signatureGap: 2,
    recipientStrategy: "selected",
  };
}

/** Older workflows did not store a chosen style, so infer it from their rules. */
function emailWorkflowContentMode(
  workflow: TrackerEmailWorkflow,
): NonNullable<TrackerEmailWorkflow["contentMode"]> {
  if (workflow.contentMode) return workflow.contentMode;
  if (workflow.contentRules?.some((rule) => rule.type === "combination"))
    return "combinations";
  if (
    workflow.contentRules?.some((rule) => rule.type === "statement") ||
    workflow.points.some((point) => point.format === "statement")
  )
    return "statements";
  return "points";
}

/** Converts the former one-field message format into the richer rule format. */
function migrateLegacyMatchingMessages(workflows: TrackerEmailWorkflow[]) {
  return workflows.map((workflow) => {
    if (!workflow.points.length) return workflow;
    const contentRules = workflow.contentRules || [];
    return {
      ...workflow,
      points: [],
      contentRules: [
        ...contentRules,
        ...workflow.points.map((point, index) => ({
          id: `legacy-point-${point.id}`,
          legacyPoint: true as const,
          type: (point.format === "statement"
            ? "statement"
            : "point") as TrackerEmailContentRule["type"],
          action: "include" as const,
          content: point.statement,
          order: contentRules.length + index,
          conditionGroup: {
            mode: "ALL" as const,
            conditions: [
              {
                fieldKey: point.fieldKey,
                operator: "equals" as const,
                value: point.value,
              },
            ],
          },
        })),
      ],
    };
  });
}


export default function ClientTrackerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { data: session } = useSession();
  const isAdmin =
    session?.user && (session.user as { role?: string }).role === "admin";
  const resolved = React.use(params);
  const trackerNavigation = useTrackerNavigation();
  const entryLimit = 100;
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL_FILTER);
  const [fieldFilter, setFieldFilter] = useState(ALL_FILTER);
  const [valueFilter, setValueFilter] = useState(ALL_FILTER);
  const [savedViewId, setSavedViewId] = useState("");
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [savedViewEditorOpen, setSavedViewEditorOpen] = useState(false);
  const [savedViewDraft, setSavedViewDraft] = useState<TrackerSavedView | null>(
    null,
  );
  const [savingSavedView, setSavingSavedView] = useState(false);
  const { url, entryOffset, setEntryOffset, filtersPending } = useTrackerQuery({
    trackerId: resolved.id, search, category: categoryFilter,
    field: fieldFilter, value: valueFilter, view: savedViewId, limit: entryLimit,
  });
  const pendingCells = useRef(new Set<string>());
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [emailHistoryOpen, setEmailHistoryOpen] = useState(false);
  const writesPending = savingCells.size > 0 || bulkSaving;
  const { data, loading, refreshing, error, backgroundError, refetch: refetchCurrentPage, mutate } =
    useFreshTrackerData<TrackerDetail>(url, resolved.id, { paused: writesPending, retainCached: true, revalidateOnResume: false });
  const { data: overview, loading: overviewLoading, refreshing: overviewRefreshing, error: overviewError, refetch: refetchOverview, mutate: mutateOverview } =
    useFreshTrackerData<Pick<TrackerDetail, "overviewCounts" | "totalEntryCount">>(
      `/api/client-trackers/${resolved.id}?overviewOnly=1`, resolved.id,
      // A cached shell is not a validated membership snapshot. Start totals only
      // after the opening table read has finished its database reconciliation.
      { enabled: Boolean(data) && !loading, paused: writesPending, retainCached: true, revalidateOnResume: false },
    );
  const refetch = useCallback(() => {
    invalidate(`/api/client-trackers/${resolved.id}`);
    void refetchCurrentPage();
    void refetchOverview();
  }, [resolved.id, refetchCurrentPage, refetchOverview]);
  const emailSummaryUrl = `/api/client-trackers/${resolved.id}/email?compact=1&clientIds=${encodeURIComponent(JSON.stringify((data?.entries || []).map(entry => entry.clientId)))}`;
  const { data: emailActivity, loading: emailSummaryLoading, refreshing: emailSummaryRefreshing, error: emailSummaryError, refetch: refetchEmailSummary } =
    useFreshTrackerData<TrackerEmailActivity>(emailSummaryUrl, resolved.id, { enabled: data?.emailEnabled === true && !loading, retainCached: true });
  const { data: emailHistory, loading: emailHistoryLoading, error: emailHistoryError, refetch: refetchEmailHistory } =
    useFreshTrackerData<TrackerEmailActivity>(`/api/client-trackers/${resolved.id}/email`, resolved.id, { enabled: emailHistoryOpen });
  const refetchEmailActivity = useCallback(() => { void refetchEmailSummary(); void refetchEmailHistory(); }, [refetchEmailSummary, refetchEmailHistory]);
  const { data: trackerActivity, refetch: refetchTrackerActivity } =
    useCache<TrackerActivity>(`/api/client-trackers/${resolved.id}/activity`);
  const tracker = data;
  const trackerReady = Boolean(tracker);
  useLayoutEffect(() => { if (trackerReady) trackerNavigation?.workspaceReady(); }, [trackerNavigation, trackerReady, resolved.id]);
  const overviewCounts = overview?.overviewCounts;
  const summaryMembershipMismatch = overview?.totalEntryCount !== undefined && data?.totalEntryCount !== undefined && overview.totalEntryCount !== data.totalEntryCount;
  const [archiving, setArchiving] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(
    new Set(),
  );
  const selectedMarkRevisions = useRef(new Map<string, Record<string, number>>());
  useEffect(() => {
    for (const id of selectedMarkRevisions.current.keys()) if (!selectedEntries.has(id)) selectedMarkRevisions.current.delete(id);
    for (const entry of data?.entries || []) if (selectedEntries.has(entry._id)) selectedMarkRevisions.current.set(entry._id, { ...entry.fieldRevisions });
  }, [selectedEntries, data?.entries]);
  const [bulkField, setBulkField] = useState("status");
  const [bulkValue, setBulkValue] = useState("Done");
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [configurationBaseline, setConfigurationBaseline] = useState<TrackerConfiguration | null>(null);
  const [configurationSession, setConfigurationSession] = useState(0);
  const [configurationCompact, setConfigurationCompact] = useState(false);
  const [configurationNestedDialog, setConfigurationNestedDialog] = useState(false);
  const [configurationDiscardOpen, setConfigurationDiscardOpen] = useState(false);
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [configurationSaved, setConfigurationSaved] = useState(false);
  const configurationSaving = useRef(false);
  const [fieldDraft, setFieldDraft] = useState<TrackerDraftField[]>([]);
  const [columnDraft, setColumnDraft] = useState<ClientTrackerDetailKey[]>([]);
  const [savingConfiguration, setSavingConfiguration] = useState(false);
  const [participantDraft, setParticipantDraft] = useState<string[]>([]);
  const [syncDraft, setSyncDraft] = useState<TrackerSyncDraft>({ clientScope: "selected", clientCategories: [], clientMembershipMode: "snapshot" });
  const [basicDraft, setBasicDraft] = useState({
    name: "",
    description: "",
    financialYear: "",
  });
  const configurationDiff = useMemo(() => configurationBaseline ? configurationChanges(configurationBaseline, {
    fields: fieldDraft, clientColumns: columnDraft, clientIds: participantDraft, financialYear: basicDraft.financialYear, ...syncDraft,
  }) : [], [configurationBaseline, fieldDraft, columnDraft, participantDraft, basicDraft.financialYear, syncDraft]);
  const [basicsOpen, setBasicsOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<
    "archive" | "delete" | "configuration" | "bulk" | null
  >(null);
  const [lastBulkChange, setLastBulkChange] = useState<{
    key: string;
    values: Array<{ id: string; value: TrackerValue; revision: number }>;
  } | null>(null);
  const [emailConfigOpen, setEmailConfigOpen] = useState(false);
  const [emailComposeOpen, setEmailComposeOpen] = useState(false);
  const [emailEnabledDraft, setEmailEnabledDraft] = useState(false);
  const [workflowDraft, setWorkflowDraft] = useState<TrackerEmailWorkflow[]>(
    [],
  );
  const [emailConfigInitialSnapshot, setEmailConfigInitialSnapshot] =
    useState("");
  const [emailConfigError, setEmailConfigError] = useState<string | null>(null);
  const [emailConfigDiscardOpen, setEmailConfigDiscardOpen] = useState(false);
  const [activeWorkflowId, setActiveWorkflowId] = useState("");
  const [emailSetupScreen, setEmailSetupScreen] = useState<
    "library" | "new-details" | "builder"
  >("library");
  const [newWorkflowDetails, setNewWorkflowDetails] = useState({
    name: "",
    description: "",
  });
  const [builderStartPage, setBuilderStartPage] = useState(0);
  const [emailPreview, setEmailPreview] = useState<EmailPreview | null>(null);
  const [emailKind, setEmailKind] = useState<"initial" | "reminder">("initial");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailPreparationPhase, setEmailPreparationPhase] = useState<EmailPreparationPhase>(null);
  const [emailPreparationError, setEmailPreparationError] = useState<string | null>(null);
  const [emailDeliveryMode, setEmailDeliveryMode] = useState<"draft" | "send" | null>(null);
  const emailExpandFocusRef = useRef<HTMLElement | null>(null);
  const [combinationPreviewOpen, setCombinationPreviewOpen] = useState(false);
  const [trackerPreviewOpen, setTrackerPreviewOpen] = useState(false);
  const [trackerPreviewRuleId, setTrackerPreviewRuleId] = useState("");
  const [scenarioAnalysis, setScenarioAnalysis] = useState<DraftScenarioAnalysis | null>(null);
  const [scenarioValidationTarget, setScenarioValidationTarget] = useState<{ workflowId: string; ruleId: string; conditionIndex?: number; request: number } | null>(null);
  const [authorizationBatch, setAuthorizationBatch] = useState<{ batch: DeliveryBatch; revision: string } | null>(null);
  const emailDeliveryActivity = useOptionalEmailDeliveryActions();
  const emailOperationRef = useRef<{ batch: DeliveryBatch; revision: string; attempted: boolean; approvalId?: string } | null>(null);
  const emailDeliveryInFlight = useRef(false);
  const [recipientDrafts, setRecipientDrafts] = useState<
    Record<string, RecipientDraft>
  >({});
  const [previewMessage, setPreviewMessage] = useState<
    EmailPreview["messages"][number] | null
  >(null);
  const [gmailSignature, setGmailSignature] = useState<string | null>(null);
  const [gmailSignatureLoading, setGmailSignatureLoading] = useState(false);
  const [exportingTracker, setExportingTracker] = useState(false);
  const [exportingEmailHistory, setExportingEmailHistory] = useState(false);
  const { data: rawClients, loading: clientsLoading, error: clientsError } =
    useCache<Client[]>("/api/clients", { enabled: configurationOpen });
  const { data: rawDocuments } = useCache<ManagedDocumentOption[]>(
    "/api/documents", { enabled: emailConfigOpen },
  );
  const allClients = Array.isArray(rawClients) ? rawClients : [];
  const managedDocuments = useMemo(() => (rawDocuments || []).filter(
    document => document.storageType === "google-drive" && Boolean(document.driveFileId) && Boolean(document.mimeType),
  ), [rawDocuments]);
  const resultsUpdating = loading || filtersPending;
  const resultsUnavailable = resultsUpdating || Boolean(error && !backgroundError);

  const signaturePreviewOpen = Boolean((emailComposeOpen && emailPreview) || previewMessage);
  const emailClientCategories = useMemo(() => Object.fromEntries((tracker?.entries || []).map(entry => [entry.clientId, entry.client?.category || ""])), [tracker?.entries]);
  useEffect(() => {
    if (!signaturePreviewOpen) {
      setGmailSignature(null);
      setGmailSignatureLoading(false);
      return;
    }
    let cancelled = false;
    setGmailSignature(null);
    setGmailSignatureLoading(true);
    void fetch("/api/email/default-signature")
      .then(async (response) => {
        if (!response.ok) return { signature: "" };
        return (await readJsonResponse(response)) as { signature?: string };
      })
      .then((result) => {
        if (!cancelled) setGmailSignature(result.signature || "");
      })
      .catch(() => {
        if (!cancelled) setGmailSignature("");
      })
      .finally(() => {
        if (!cancelled) setGmailSignatureLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signaturePreviewOpen]);

  const filterField = tracker?.fields.find(
    (field) => field.key === fieldFilter,
  );
  const filterOptions =
    filterField?.type === "toggle" ? ["Yes", "No"] : filterField?.options || [];
  const activeSavedView = tracker?.savedViews?.find(
    (view) => view.id === savedViewId,
  );
  // The API filters the complete tracker before pagination; do not re-filter a
  // stale page locally while a new search is still loading.
  const visibleEntries = tracker?.entries || [];
  useEffect(() => {
    if (!loading && !writesPending && !error && tracker?.entryCount !== undefined && entryOffset > 0 && entryOffset >= tracker.entryCount)
      setEntryOffset(Math.max(0, Math.floor((tracker.entryCount - 1) / entryLimit) * entryLimit));
  }, [loading, writesPending, error, tracker?.entryCount, entryOffset, setEntryOffset]);
  const deleteActiveSavedView = async () => {
    if (!tracker || !activeSavedView) return;
    try {
      const response = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          savedViews: (tracker.savedViews || []).filter(
            (view) => view.id !== activeSavedView.id,
          ),
        }),
      });
      const result = await readJsonResponse(response);
      if (!response.ok) {
        toast.error(result.error || "Unable to delete view.");
        return;
      }
      setSavedViewId("");
      await refetch();
      void refetchTrackerActivity();
      toast.success("Saved view deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete view.");
    }
  };
  const overviewFields = (tracker?.fields || []).filter(
    (field) =>
      field.type === "status" ||
      field.type === "select" ||
      field.type === "toggle",
  );
  const bulkFields = (tracker?.fields || []).filter(
    (field) =>
      !field.dataLink &&
      !field.computed &&
      (field.type === "status" ||
        field.type === "select" ||
        field.type === "toggle"),
  );
  const categories = CLIENT_TRACKER_CATEGORIES;
  const selectedBulkField =
    tracker?.fields.find((field) => field.key === bulkField) ||
    tracker?.fields[0];
  const bulkOptions =
    selectedBulkField?.type === "toggle"
      ? ["Yes", "No"]
      : selectedBulkField?.options || [];
  const activeWorkflow = workflowDraft.find(
    (workflow) => workflow.id === activeWorkflowId,
  );
  const communicationByClient = useMemo(() => {
    const status = new Map<
      string,
      | "Not Contacted"
      | "Draft Created"
      | "Sent"
      | "Reminder Sent"
      | "Replied"
      | "Failed"
    >();
    for (const log of emailActivity?.logs || []) {
      if (!log.clientId || status.has(log.clientId)) continue;
      status.set(
        log.clientId,
        log.communicationStatus === "replied"
          ? "Replied"
          : log.status === "draft"
            ? "Draft Created"
            : log.status === "failed"
              ? "Failed"
              : log.mailKind === "reminder"
                ? "Reminder Sent"
                : "Sent",
      );
    }
    return status;
  }, [emailActivity?.logs]);
  const basicsFooter = (
    <div className="tracker-modal-footer flex justify-end gap-3">
      <button
        type="button"
        onClick={() => setBasicsOpen(false)}
        disabled={savingConfiguration}
        className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted hover:bg-black/[0.04] disabled:opacity-60 dark:hover:bg-white/[0.06]"
      >
        Cancel
      </button>
      <button
        disabled={savingConfiguration}
        onClick={() => void saveBasics()}
        className="tracker-modal-primary rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {savingConfiguration ? "Saving…" : "Save details"}
      </button>
    </div>
  );
  const emailConfigFooter = (
    <div className="tracker-modal-footer tracker-email-footer flex justify-end gap-3">
      <button
        type="button"
        onClick={requestCloseEmailConfig}
        disabled={emailLoading}
        className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted hover:bg-black/[0.04] disabled:opacity-60 dark:hover:bg-white/[0.06]"
      >
        Cancel
      </button>
      <button
        disabled={emailLoading}
        onClick={() => void saveEmailConfig()}
        className="tracker-modal-primary rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {emailLoading ? "Saving…" : "Save email updates"}
      </button>
    </div>
  );
  const requestConfigurationClose = () => {
    if (savingConfiguration || configurationNestedDialog || configurationDiscardOpen || confirmation !== null) return;
    if (configurationDiff.length) setConfigurationDiscardOpen(true);
    else setConfigurationOpen(false);
  };
  const configurationFooter = (
    <div className="tracker-modal-footer configure-footer flex items-center gap-3">
      <span className={"configure-unsaved " + (configurationDiff.length ? "has-changes" : "")} role="status">
        {configurationSaved ? "Saved" : configurationDiff.length ? configurationDiff.length + " unsaved change" + (configurationDiff.length === 1 ? "" : "s") : "No unsaved changes"}
      </span>
      <button
        type="button"
        onClick={requestConfigurationClose}
        disabled={savingConfiguration}
        className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted hover:bg-black/[0.04] disabled:opacity-60 dark:hover:bg-white/[0.06]"
      >
        Cancel
      </button>
      <button
        disabled={savingConfiguration || !configurationDiff.length}
        onClick={() => void saveConfiguration()}
        className="tracker-modal-primary rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {savingConfiguration ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
  React.useEffect(() => {
    if (
      tracker?.fields &&
      fieldFilter !== ALL_FILTER &&
      !tracker?.fields.some((field) => field.key === fieldFilter)
    ) {
      setFieldFilter(ALL_FILTER);
      setValueFilter(ALL_FILTER);
    }
  }, [fieldFilter, tracker?.fields]);

  React.useEffect(() => {
    setSelectedEntries(new Set());
  }, [search, categoryFilter, fieldFilter, valueFilter, savedViewId]);

  React.useEffect(() => {
    setSelectedEntries(new Set());
  }, [entryOffset]);

  const cellQueues = useRef(new Map<string, { confirmed: TrackerValue | undefined; desired: TrackerValue; revision: number; serverRevision: number }>());
  const editingAlive = useRef(true);
  const [cellFeedback, setCellFeedback] = useState<Map<string, CellFeedback>>(new Map());
  const feedbackTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const showCellFeedback = useCallback((id: string, status?: CellFeedback) => {
    clearTimeout(feedbackTimers.current.get(id)); feedbackTimers.current.delete(id);
    setCellFeedback(previous => {
      if (!status && !previous.has(id)) return previous;
      const next = new Map(previous); next.delete(id);
      if (status) next.set(id, status);
      while (next.size > 64) next.delete(next.keys().next().value!);
      return next;
    });
    if (status === "saved") feedbackTimers.current.set(id, setTimeout(() => {
      feedbackTimers.current.delete(id);
      if (editingAlive.current) setCellFeedback(previous => { const next = new Map(previous); next.delete(id); return next; });
    }, 1400));
    while (feedbackTimers.current.size > 64) { const key = feedbackTimers.current.keys().next().value!; clearTimeout(feedbackTimers.current.get(key)); feedbackTimers.current.delete(key); }
  }, []);
  const reconcileNeeded = useRef({ overview: false, table: false, activity: false });
  const reconcilingTable = useRef(false);
  const mismatchAttempts = useRef({ at: 0, count: 0 });
  const editingContext = useRef({ data, url, bulkSaving, scope: resolved.id });
  editingContext.current = { data, url, bulkSaving, scope: resolved.id };
  const reconcileEdits = useCallback(() => {
    if (!editingAlive.current || pendingCells.current.size || editingContext.current.bulkSaving) return;
    const flags = reconcileNeeded.current;
    const refreshTotals = () => {
      if (!flags.overview) return;
      flags.overview = false;
      // A full snapshot also observes other employees' changes to different
      // fields; never merge counters confirmed against different revisions.
      void refetchOverview();
    };
    // Let the employee finish a text draft before replacing a filtered page.
    const typing = document.activeElement?.matches('tbody input:not([type="checkbox"]), tbody textarea');
    if (flags.table) {
      if (typing || reconcilingTable.current) return;
      flags.table = false; reconcilingTable.current = true;
      const { scope, url: requestUrl } = editingContext.current;
      void refetchCurrentPage().then(() => {
        if (editingAlive.current && editingContext.current.scope === scope && editingContext.current.url === requestUrl && !pendingCells.current.size && !editingContext.current.bulkSaving) refreshTotals();
      }).finally(() => { reconcilingTable.current = false; });
    } else refreshTotals();
    if (flags.activity) { flags.activity = false; void refetchTrackerActivity(); }
  }, [refetchOverview, refetchCurrentPage, refetchTrackerActivity]);
  useEffect(() => { if (!writesPending) reconcileEdits(); }, [writesPending, reconcileEdits]);
  useEffect(() => {
    if (!summaryMembershipMismatch) { mismatchAttempts.current.count = 0; return; }
    if (!summaryMembershipMismatch || loading || overviewLoading || overviewRefreshing) return;
    if (Date.now() - mismatchAttempts.current.at > 30000) mismatchAttempts.current = { at: Date.now(), count: 0 };
    if (mismatchAttempts.current.count >= 2) return; // The regular visible-page reconciliation remains the fallback.
    mismatchAttempts.current.count += 1;
    reconcileNeeded.current.table = true; reconcileNeeded.current.overview = true;
    reconcileEdits();
  }, [summaryMembershipMismatch, loading, overviewLoading, overviewRefreshing, reconcileEdits]);
  useEffect(() => {
    editingAlive.current = true;
    setSavingCells(new Set()); setBulkSaving(false);
    setSelectedEntries(new Set()); setLastBulkChange(null);
    setCellFeedback(new Map());
    reconcileNeeded.current = { overview: false, table: false, activity: false };
    const queues = cellQueues.current, pending = pendingCells.current, timers = feedbackTimers.current;
    // Authoritative periodic/focus reads also pick up other employees' edits.
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      reconcileNeeded.current.overview = true;
      reconcileNeeded.current.table = true;
      reconcileNeeded.current.activity = true;
      refetchEmailActivity();
      reconcileEdits();
    };
    const afterBlur = () => { queueMicrotask(reconcileEdits); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    document.addEventListener("focusout", afterBlur);
    return () => {
      editingAlive.current = false;
      toast.dismiss("tracker-edit-undo");
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      queues.clear(); pending.clear();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
      document.removeEventListener("focusout", afterBlur);
    };
  }, [resolved.id, reconcileEdits, refetchEmailActivity]);
  useEffect(() => {
    if (overviewError) toast.error("Totals could not be refreshed. Showing the last known counts; refresh the tracker to retry.", { id: `tracker-totals-${resolved.id}` });
  }, [overviewError, resolved.id]);
  useEffect(() => {
    if (emailSummaryError) toast.error("Email statistics could not be refreshed. Please retry when the server is available.", { id: `tracker-email-${resolved.id}` });
  }, [emailSummaryError, resolved.id]);

  const saveValue = useCallback(async function saveCell(
    entry: Entry,
    field: TrackerField,
    value: TrackerValue,
    options?: { expectedRevision?: number; undo?: boolean; retry?: boolean },
  ): Promise<void> {
    const cellId = `${entry._id}-${field.key}`;
    if (!editingAlive.current || editingContext.current.scope !== resolved.id) return;
    if (editingContext.current.bulkSaving) return;
    const existing = cellQueues.current.get(cellId);
    if (existing && (options?.undo || options?.retry)) { toast.error("This field is still saving. Wait for it to finish before Undo or Retry."); return; }
    const previous = existing?.desired ?? editingContext.current.data?.entries.find(item => item._id === entry._id)?.values[field.key] ?? entry.values[field.key];
    if (sameTrackerValue(previous, value)) return;
    const latest = editingContext.current.data?.entries.find(item => item._id === entry._id) || entry;
    const queue = existing || { confirmed: previous, desired: value, revision: 0, serverRevision: options?.expectedRevision ?? trackerMarkRevision(latest.fieldRevisions, field.key) };
    queue.desired = value; queue.revision++;
    cellQueues.current.set(cellId, queue);
    const apply = (oldValue: TrackerValue | undefined, newValue: TrackerValue | undefined, updatedAt?: string, serverRevision?: number) => {
      mutate(current => current ? { ...current, entries: current.entries.map(item => item._id === entry._id
        ? { ...item, updatedAt: updatedAt || item.updatedAt, values: { ...item.values, [field.key]: newValue ?? "" },
          ...(serverRevision !== undefined ? { fieldRevisions: { ...item.fieldRevisions, [field.key]: serverRevision } } : {}) } : item) } : current);
      // This also cancels pre-write overview reads, even for a non-summary field.
      mutateOverview(current => current ? { ...current, overviewCounts: adjustTrackerOverview(current.overviewCounts, field, oldValue, newValue) } : current);
    };
    apply(previous, value);
    showCellFeedback(cellId);
    const currentData = editingContext.current.data;
    for (const summary of currentData?.fields || []) if (["status", "select", "toggle"].includes(summary.type) && (summary.key === field.key || summary.computed)) {
      reconcileNeeded.current.overview = true;
    }
    const query = new URL(editingContext.current.url, window.location.origin).searchParams;
    if (query.has("field") || query.has("view") || currentData?.fields.some(item => item.computed)) reconcileNeeded.current.table = true;
    if (existing) return; // Its worker will submit the latest intent after the in-flight PATCH.
    pendingCells.current.add(cellId);
    setSavingCells(new Set(pendingCells.current));
    while (editingAlive.current && cellQueues.current.get(cellId) === queue) {
      const revision = queue.revision, requested = queue.desired;
      try {
        const response = await fetch(`/api/client-trackers/${resolved.id}/entries/${entry._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: field.key, value: requested, expectedRevision: queue.serverRevision }),
        });
        const saved = await readJsonResponse(response);
        if (!editingAlive.current || cellQueues.current.get(cellId) !== queue) return;
        if (!response.ok) {
          if (saved.code === "MARK_CONFLICT" && saved.current) {
            apply(queue.desired, saved.current.value, saved.current.updatedAt, saved.current.revision);
            showCellFeedback(cellId, "conflict");
            toast.error(`${field.label} · ${entry.client?.companyName || entry.clientId}: ${saved.error}`);
            reconcileNeeded.current.table = true; reconcileNeeded.current.overview = true;
            break; // A conflict cancels queued intent; never retry it against a newer employee's revision.
          }
          throw new Error(saved.error || "Unable to save change.");
        }
        queue.confirmed = saved.values[field.key];
        queue.serverRevision = trackerMarkRevision(saved.fieldRevisions, field.key);
        reconcileNeeded.current.activity = true;
        if (revision === queue.revision) {
          apply(queue.desired, queue.confirmed, saved.updatedAt, queue.serverRevision);
          showCellFeedback(cellId, "saved");
          if (!options?.undo) toast(notice => <span>{field.label} updated <button className="ml-2 font-semibold underline"
            aria-label={`Undo ${field.label} for ${entry.client?.companyName || entry.clientId}`}
            onClick={() => { toast.dismiss(notice.id); void saveCell({ ...entry, values: { ...entry.values, [field.key]: saved.values[field.key] } }, field, saved.previousValue ?? "", { expectedRevision: queue.serverRevision, undo: true }); }}>Undo</button></span>,
            { id: "tracker-edit-undo", duration: 5000, ariaProps: { role: "status", "aria-live": "off" } });
        }
      } catch (error) {
        if (!editingAlive.current || cellQueues.current.get(cellId) !== queue) return;
        const desired = queue.desired, expectedRevision = queue.serverRevision;
        toast.error(notice => <span>{field.label} · {entry.client?.companyName || entry.clientId}: {error instanceof Error ? error.message : "Unable to save change."}
          <button className="ml-2 font-semibold underline" onClick={() => { toast.dismiss(notice.id); void saveCell(entry, field, desired, { expectedRevision, retry: true }); }}>Retry</button></span>);
        apply(queue.desired, queue.confirmed, undefined, queue.serverRevision);
        showCellFeedback(cellId, "failed");
        // A network failure can follow a committed write; resolve that ambiguity by reading.
        reconcileNeeded.current.table = true;
        reconcileNeeded.current.overview = true;
        break;
      }
      if (revision === queue.revision) break;
    }
    if (cellQueues.current.get(cellId) !== queue) return;
    cellQueues.current.delete(cellId); pendingCells.current.delete(cellId);
    setSavingCells(new Set(pendingCells.current));
    invalidate(`/api/client-trackers/${resolved.id}?`);
  }, [resolved.id, mutate, mutateOverview, showCellFeedback]);
  const archive = async () => {
    if (!tracker) return;
    const restoring = tracker.status === "archived";
    setArchiving(true);
    try {
      const response = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: restoring ? "active" : "archived" }),
      });
      if (!response.ok) throw new Error();
      invalidate("/api/client-trackers");
      toast.success(restoring ? "Tracker restored." : "Tracker archived.");
      window.location.assign("/dashboard/client-trackers");
    } catch {
      toast.error("Unable to archive tracker.");
      setArchiving(false);
    }
  };
  const deleteTracker = async () => {
    if (!tracker) return;
    setArchiving(true);
    try {
      const response = await fetch(url, { method: "DELETE" });
      if (!response.ok) throw new Error();
      invalidate("/api/client-trackers");
      toast.success("Tracker permanently deleted.");
      window.location.assign("/dashboard/client-trackers");
    } catch {
      toast.error("Unable to delete tracker.");
      setArchiving(false);
    }
  };
  const openConfiguration = () => {
    if (!tracker) return;
    if (tracker.status !== "active") {
      toast.error("Restore this tracker before changing its configuration.");
      return;
    }
    const openingFields = tracker.fields.map((field) => draftField({ ...structuredClone(field), optionInput: field.options?.join(", ") || "" }));
    setFieldDraft(openingFields);
    setColumnDraft([...(tracker.clientColumns || ["state"])]);
    setParticipantDraft([...tracker.clientIds]);
    setSyncDraft(configurationSyncDraft(tracker));
    setBasicDraft({
      name: tracker.name,
      description: tracker.description || "",
      financialYear: tracker.financialYear || "",
    });
    setConfigurationBaseline(configurationSnapshot({ ...tracker, fields: openingFields }));
    setConfigurationSession(session => session + 1);
    setConfigurationError(null); setConfigurationSaved(false); setConfigurationCompact(false);
    setConfigurationNestedDialog(false); setConfigurationDiscardOpen(false);
    setConfigurationOpen(true);
  };
  const openBasics = () => {
    if (!tracker) return;
    if (tracker.status !== "active") {
      toast.error("Restore this tracker before editing its details.");
      return;
    }
    setBasicDraft({
      name: tracker.name,
      description: tracker.description || "",
      financialYear: tracker.financialYear || "",
    });
    setBasicsOpen(true);
  };
  const openSavedViewEditor = (view?: TrackerSavedView) => {
    if (!tracker || tracker.status !== "active") {
      toast.error("Restore this tracker before changing saved views.");
      return;
    }
    const firstField = tracker.fields[0]?.key;
    if (!view && !firstField) {
      toast.error("Add a tracker column before creating a saved view.");
      return;
    }
    setSavedViewDraft(
      view
        ? {
            ...view,
            conditionGroup: {
              ...view.conditionGroup,
              conditions: view.conditionGroup.conditions.map((condition) => ({
                ...condition,
              })),
            },
          }
        : {
            id: emailId(),
            name: "",
            conditionGroup: {
              mode: "ALL",
              conditions: [
                {
                  fieldKey: firstField as string,
                  operator: "equals",
                  value: "",
                },
              ],
            },
          },
    );
    setSavedViewEditorOpen(true);
  };
  const saveSavedView = async () => {
    if (!tracker || !savedViewDraft) return;
    const draft = {
      ...savedViewDraft,
      name: savedViewDraft.name.trim(),
    };
    const needsValue = (operator: TrackerRuleOperator) =>
      !["is_empty", "is_not_empty"].includes(operator);
    if (!draft.name) {
      toast.error("Give this saved view a name.");
      return;
    }
    if (
      !draft.conditionGroup.conditions.length ||
      draft.conditionGroup.conditions.some(
        (condition) =>
          !tracker.fields.some((field) => field.key === condition.fieldKey) ||
          (needsValue(condition.operator) &&
            String(condition.value ?? "").trim() === ""),
      )
    ) {
      toast.error("Complete every condition before saving this view.");
      return;
    }
    setSavingSavedView(true);
    try {
      const existing = tracker.savedViews || [];
      const savedViews = existing.some((view) => view.id === draft.id)
        ? existing.map((view) => (view.id === draft.id ? draft : view))
        : [...existing, draft];
      const response = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedViews }),
      });
      const result = await readJsonResponse(response);
      if (!response.ok) throw new Error(result.error || "Unable to save view.");
      setSavedViewId(draft.id);
      setSearch("");
      setCategoryFilter(ALL_FILTER);
      setFieldFilter(ALL_FILTER);
      setValueFilter(ALL_FILTER);
      setEntryOffset(0);
      setSavedViewEditorOpen(false);
      await refetch();
      void refetchTrackerActivity();
      toast.success(
        existing.some((view) => view.id === draft.id)
          ? "Saved view updated."
          : "Saved view created.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to save view.",
      );
    } finally {
      setSavingSavedView(false);
    }
  };
  const openEmailConfig = () => {
    if (!tracker || tracker.status !== "active") return;
    const workflows = migrateLegacyMatchingMessages(tracker.emailWorkflows || []);
    setEmailEnabledDraft(Boolean(tracker.emailEnabled));
    setWorkflowDraft(workflows);
    setEmailConfigInitialSnapshot(
      emailConfigSnapshot(Boolean(tracker.emailEnabled), workflows),
    );
    setEmailConfigError(null);
    setScenarioValidationTarget(null);
    setScenarioAnalysis(null);
    setActiveWorkflowId(workflows[0]?.id || "");
    setEmailSetupScreen("library");
    setNewWorkflowDetails({ name: "", description: "" });
    setBuilderStartPage(0);
    setEmailConfigOpen(true);
  };
  const hasUnsavedEmailConfigChanges =
    emailConfigSnapshot(emailEnabledDraft, workflowDraft) !==
    emailConfigInitialSnapshot;
  function requestCloseEmailConfig() {
    if (emailLoading) return;
    if (hasUnsavedEmailConfigChanges) {
      setEmailConfigDiscardOpen(true);
      return;
    }
    setEmailConfigOpen(false);
  }
  const saveEmailConfig = async () => {
    if (!tracker) return;
    const validationError = validateEmailWorkflowDrafts(
      workflowDraft,
      tracker.fields,
    );
    if (validationError) {
      setEmailConfigError(validationError);
      for (const workflow of workflowDraft) {
        const issue = emailWorkflowValidationIssues(workflow, tracker.fields).find(item => item.message === validationError);
        if (issue?.ruleId) { setActiveWorkflowId(workflow.id); setEmailSetupScreen("builder"); setBuilderStartPage(3); setScenarioValidationTarget({ workflowId: workflow.id, ruleId: issue.ruleId, conditionIndex: issue.conditionIndex, request: Date.now() }); break; }
      }
      return;
    }
    setEmailConfigError(null);
    setEmailLoading(true);
    try {
      const response = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailEnabled: emailEnabledDraft,
          emailWorkflows: workflowDraft,
        }),
      });
      const result = await readJsonResponse(response);
      if (!response.ok)
        throw new Error(result.error || "Unable to save email settings.");
      await refetch();
      void refetchTrackerActivity();
      setEmailConfigInitialSnapshot(
        emailConfigSnapshot(emailEnabledDraft, workflowDraft),
      );
      setEmailConfigOpen(false);
      toast.success(
        emailEnabledDraft
          ? "Tracker email updates enabled."
          : "Tracker email updates disabled.",
      );
    } catch (error) {
      setEmailConfigError(
        error instanceof Error ? error.message : "Unable to save email settings.",
      );
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to save email settings.",
      );
    } finally {
      setEmailLoading(false);
    }
  };
  const updateWorkflow = (id: string, patch: WorkflowDraftChange) => {
    setEmailConfigError(null);
    setWorkflowDraft((current) =>
      current.map((workflow) =>
        workflow.id === id ? { ...workflow, ...(typeof patch === "function" ? patch(workflow) : patch) } : workflow,
      ),
    );
  };
  const downloadExcel = async (
    endpoint: string,
    fallbackName: string,
    setLoading: (loading: boolean) => void,
  ) => {
    setLoading(true);
    try {
      const response = await fetch(endpoint);
      if (!response.ok) {
        const result = await readJsonResponse(response).catch(() => ({}));
        throw new Error(result.error || "Unable to prepare the Excel file.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const filename =
        disposition.match(/filename="?([^";]+)"?/i)?.[1] || fallbackName;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to export Excel.",
      );
    } finally {
      setLoading(false);
    }
  };
  const exportCurrentTracker = () => {
    const query = new URLSearchParams();
    if (search.trim()) query.set("search", search.trim());
    if (categoryFilter !== ALL_FILTER) query.set("category", categoryFilter);
    if (fieldFilter !== ALL_FILTER && valueFilter !== ALL_FILTER) {
      query.set("field", fieldFilter);
      query.set("value", valueFilter);
    }
    if (savedViewId) query.set("view", savedViewId);
    const suffix = query.size ? `?${query.toString()}` : "";
    void downloadExcel(
      `/api/client-trackers/${resolved.id}/export${suffix}`,
      "client-tracker-current-state.xlsx",
      setExportingTracker,
    );
  };
  const exportEmailHistory = () =>
    void downloadExcel(
      `/api/client-trackers/${resolved.id}/email/export`,
      "client-tracker-email-history.xlsx",
      setExportingEmailHistory,
    );
  const openEmailComposer = () => {
    // Warm the optional authorization UI only after explicit email intent.
    void import("@/components/client-trackers/EmailDeliveryAuthorizationModal");
    if (!tracker?.emailEnabled || !tracker.emailWorkflows?.length) {
      toast.error("Set up an email workflow first.");
      return;
    }
    setActiveWorkflowId(tracker.emailWorkflows[0].id);
    setEmailPreview(null);
    setPreviewMessage(null);
    setRecipientDrafts({});
    emailOperationRef.current = null;
    setAuthorizationBatch(null);
    setEmailKind("initial");
    setEmailPreparationError(null);
    setEmailPreparationPhase(null);
    setEmailDeliveryMode(null);
    setEmailComposeOpen(true);
  };
  const previewEmails = async () => {
    if (!activeWorkflowId) return;
    setEmailLoading(true);
    setEmailPreparationError(null);
    setEmailPreparationPhase(emailKind === "reminder" ? "replies" : "recipients");
    try {
      if (emailKind === "reminder") {
        const replyResponse = await fetch(
          `/api/client-trackers/${resolved.id}/email/replies`,
          { method: "POST" },
        );
        if (!replyResponse.ok) {
          const replyResult = await readJsonResponse(replyResponse);
          toast(
            replyResult.error ||
              "Could not refresh Gmail replies. Saved reply status will still be checked.",
            { duration: 7000 },
          );
        }
        void refetchEmailActivity();
      }
      setEmailPreparationPhase("recipients");
      const response = await fetch(
        `/api/client-trackers/${resolved.id}/email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workflowId: activeWorkflowId,
            kind: emailKind,
            entryIds: selectedEntries.size ? [...selectedEntries] : undefined,
          }),
        },
      );
      const result = await readJsonResponse(response);
      if (!response.ok)
        throw new Error(result.error || "Unable to prepare email preview.");
      setEmailPreview(result);
      setRecipientDrafts(
        Object.fromEntries(
          (result.messages || []).map(
            (message: EmailPreview["messages"][number]) => [
              message.entryId,
              {
                to: message.suggestedTo?.length
                  ? message.suggestedTo
                  : [message.to],
                cc: [],
                additionalTo: "",
                additionalCc: "",
              },
            ],
          ),
        ),
      );
    } catch (error) {
      setEmailPreparationError(error instanceof Error ? error.message : "Unable to prepare email preview.");
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to prepare email preview.",
      );
    } finally {
      setEmailLoading(false);
      setEmailPreparationPhase(null);
    }
  };
  const prepareDeliveryBatch = (mode: "draft" | "send") => {
    if (!emailPreview) return;
    try {
      validateRecipientDrafts(emailPreview, recipientDrafts);
      const payload = { workflowId: activeWorkflowId, kind: emailKind, mode, messages: buildDeliveryMessages(emailPreview, recipientDrafts) };
      const revision = canonicalDeliveryBatch(resolved.id, { ...payload, campaignId: "client-batch-revision" });
      if (emailOperationRef.current?.revision !== revision) emailOperationRef.current = { batch: { ...payload, campaignId: crypto.randomUUID() }, revision, attempted: false };
      setAuthorizationBatch({ batch: emailOperationRef.current.batch, revision });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Check the recipients before continuing.");
    }
  };
  const deliverPreparedBatch = async (batch: DeliveryBatch, approvalId?: string): Promise<DeliveryJobAcceptance> => {
    const operation = emailOperationRef.current;
    if (!operation || operation.batch.campaignId !== batch.campaignId || emailDeliveryInFlight.current) throw new Error("This delivery changed or is already processing.");
    emailDeliveryInFlight.current = true;
    const resume = operation.attempted;
    operation.attempted = true; operation.approvalId = approvalId;
    setEmailLoading(true); setEmailDeliveryMode(batch.mode);
    let ambiguous = false;
    try {
      let response: Response;
      try {
        response = await fetch('/api/client-trackers/' + resolved.id + '/email/deliver', {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...batch, approvalId, resume, confirmed: true }), signal: AbortSignal.timeout(20000),
        });
      } catch (failure) { ambiguous = true; throw failure; }
      let result: DeliveryJobAcceptance & { error?: string; code?: string };
      try { result = await readJsonResponse(response); }
      catch (failure) { ambiguous = true; throw failure; }
      if (!response.ok) { ambiguous = response.status >= 500; throw new SecurityRequestError(result.error || 'Unable to start email delivery.', result.code); }
      if (!['accepted', 'already_accepted'].includes(result.outcome) || result.campaignId !== batch.campaignId || result.job?.executionMode !== "browser")
        throw new Error('The server did not confirm campaign acceptance. Retry this same campaign.');
      return result;
    } catch (failure) {
      if (ambiguous) {
        try {
          const response = await fetch('/api/email-delivery/jobs/' + encodeURIComponent(batch.campaignId), { cache: 'no-store', signal: AbortSignal.timeout(10000) });
          const known = await readJsonResponse<{ job?: DeliveryJobSummary }>(response);
          if (response.ok && known.job?.executionMode === "browser" && known.job.campaignId === batch.campaignId) return { outcome: 'already_accepted', campaignId: batch.campaignId, job: known.job };
        } catch { /* Keep the same operation ID for an explicit safe retry. */ }
      }
      throw failure;
    } finally { setEmailLoading(false); setEmailDeliveryMode(null); emailDeliveryInFlight.current = false; }
  };
  const deliveryAccepted = (result: DeliveryJobAcceptance) => {
    emailDeliveryActivity?.watch(result.job);
    emailOperationRef.current = null;
    void refetchEmailActivity(); void refetchTrackerActivity();
  };
  const deliveryHandoffComplete = () => {
    setAuthorizationBatch(null); setEmailComposeOpen(false); setSelectedEntries(new Set());
  };
  useEffect(() => {
    const operation = emailOperationRef.current;
    if (!operation) return;
    const revision = emailPreview ? canonicalDeliveryBatch(resolved.id, { campaignId: "client-batch-revision", workflowId: activeWorkflowId, kind: emailKind, mode: operation.batch.mode, messages: buildDeliveryMessages(emailPreview, recipientDrafts) }) : null;
    if (revision === operation.revision) return;
    emailOperationRef.current = null;
    if (authorizationBatch) toast("Delivery changed. Please verify the updated batch again.");
    setAuthorizationBatch(null);
  }, [emailPreview, recipientDrafts, activeWorkflowId, emailKind, resolved.id, authorizationBatch]);
  const saveBasics = async () => {
    if (!basicDraft.name.trim()) {
      toast.error("Tracker name is required.");
      return;
    }
    setSavingConfiguration(true);
    try {
      const response = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(basicDraft),
      });
      const result = await readJsonResponse(response);
      if (!response.ok)
        throw new Error(result.error || "Unable to save tracker details.");
      await refetch();
      setBasicsOpen(false);
      toast.success("Tracker details updated.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to save tracker details.",
      );
    } finally {
      setSavingConfiguration(false);
    }
  };
  const saveConfiguration = async (confirmed = false) => {
    if (configurationSaving.current) return;
    setConfigurationError(null);
    if (!fieldDraft.length) {
      setConfigurationError("Keep at least one tracker column.");
      toast.error("Keep at least one tracker column.");
      return;
    }
    if (configurationNeedsFinancialYear(fieldDraft) && !basicDraft.financialYear) {
      setConfigurationError("Choose a financial year for CPCB upload data.");
      toast.error("Choose a financial year for CPCB upload data."); return;
    }
    if (!participantDraft.length) {
      setConfigurationError("Keep at least one client in this tracker."); return;
    }
    if (syncDraft.clientScope === "categories" && !syncDraft.clientCategories.length) {
      setConfigurationError("Choose at least one client category."); return;
    }
    const enablingAuto = syncDraft.clientMembershipMode === "categorySync" &&
      (configurationBaseline?.clientMembershipMode !== "categorySync" || configurationBaseline?.clientScope !== syncDraft.clientScope ||
        JSON.stringify([...(configurationBaseline?.clientCategories || [])].sort()) !== JSON.stringify([...syncDraft.clientCategories].sort()));
    if (enablingAuto && !syncDraft.syncPreviewToken) {
      setConfigurationError("Preview sync and confirm the eligible additions before saving Auto Sync."); return;
    }
    const removedFields =
      tracker?.fields.filter(
        (field) => !fieldDraft.some((draft) => draft.key === field.key),
      ) || [];
    const removedClients =
      tracker?.clientIds.filter(
        (clientId) => !participantDraft.includes(clientId),
      ) || [];
    if (!confirmed && (removedFields.length || removedClients.length)) {
      setConfirmation("configuration");
      return;
    }
    configurationSaving.current = true;
    setSavingConfiguration(true);
    try {
      const response = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...basicDraft,
          fields: configurationFields(fieldDraft),
          includeStatus: fieldDraft.some((field) => field.type === "status"),
          clientColumns: columnDraft,
          clientIds: participantDraft,
          clientIdsBaseline: configurationBaseline?.clientIds,
          ...syncDraft,
        }),
      });
      const result = await readJsonResponse(response);
      if (!response.ok)
        throw new Error(result.error || "Unable to update tracker.");
      setConfigurationSaved(true);
      setConfigurationBaseline({ financialYear: basicDraft.financialYear, fields: configurationFields(fieldDraft), clientColumns: [...columnDraft], clientIds: [...participantDraft], ...syncDraft, syncRequested: false });
      setConfigurationOpen(false);
      await refetch();
      toast.success(typeof result.syncAddedCount === "number" ? `${enablingAuto ? "Auto Sync enabled. " : ""}${result.syncAddedCount ? `${result.syncAddedCount} clients added to this tracker.` : "Tracker is already up to date."}` : "Tracker columns updated.");
    } catch (error) {
      setConfigurationError(error instanceof Error ? error.message : "Unable to update tracker.");
      toast.error(
        error instanceof Error ? error.message : "Unable to update tracker.",
      );
    } finally {
      configurationSaving.current = false;
      setSavingConfiguration(false);
    }
  };
  const toggleEntry = useCallback((entryId: string) =>
    setSelectedEntries((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    }), []);
  const selectVisible = () =>
    setSelectedEntries((current) => {
      const allVisibleSelected =
        visibleEntries.length > 0 &&
        visibleEntries.every((entry) => current.has(entry._id));
      const next = new Set(current);
      visibleEntries.forEach((entry) =>
        allVisibleSelected ? next.delete(entry._id) : next.add(entry._id),
      );
      return next;
    });
  const bulkUpdate = async (
    confirmed = false,
    replacement?: { ids: string[]; value: TrackerValue; revisions: Record<string, number> },
  ) => {
    if (!editingAlive.current || editingContext.current.scope !== resolved.id) return false;
    if (pendingCells.current.size > 0) { if (replacement) toast.error("Wait for the pending cell saves before Undo."); return false; }
    if (!selectedBulkField || (!replacement && selectedEntries.size === 0))
      return;
    if (!confirmed) {
      setConfirmation("bulk");
      return;
    }
    if (editingContext.current.bulkSaving) return false;
    editingContext.current.bulkSaving = true;
    setBulkSaving(true);
    const entryIds = replacement?.ids || [...selectedEntries];
    const field = selectedBulkField;
    const bulkScope = resolved.id;
    const value: TrackerValue =
      replacement?.value ??
      (field.type === "toggle" ? bulkValue === "Yes" : bulkValue);
    const known = (editingContext.current.data?.entries || []).filter(entry => entryIds.includes(entry._id));
    const previousValues = new Map(known.map(entry => [entry._id, entry.values[field.key]]));
    const expectedRevisions = replacement?.revisions || Object.fromEntries(entryIds.filter(id => selectedMarkRevisions.current.has(id)).map(id =>
      [id, trackerMarkRevision(selectedMarkRevisions.current.get(id), field.key)]));
    const allKnown = known.length === entryIds.length;
    const applyBulk = (nextValue: (id: string) => TrackerValue, ids: Set<string>, oldValue: (id: string) => TrackerValue, adjustCounts: boolean) => {
      mutate(current => current ? { ...current, entries: current.entries.map(entry => ids.has(entry._id)
        ? { ...entry, values: { ...entry.values, [field.key]: nextValue(entry._id) } } : entry) } : current);
      mutateOverview(current => {
        if (!current) return current;
        let counts = current.overviewCounts;
        if (adjustCounts) for (const id of ids) counts = adjustTrackerOverview(counts, field, oldValue(id), nextValue(id));
        return { ...current, overviewCounts: counts };
      });
    };
    applyBulk(() => value, new Set(previousValues.keys()), id => previousValues.get(id)!, allKnown);
    reconcileNeeded.current.overview = true;
    // Includes partial writes, filters, pagination, live/computed dependencies, and other employees.
    reconcileNeeded.current.table = true;
    try {
      const response = await fetch(
        `/api/client-trackers/${resolved.id}/entries/bulk`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entryIds, key: field.key, value, expectedRevisions }),
        },
      );
      const result = await readJsonResponse(response);
      if (!editingAlive.current || editingContext.current.scope !== bulkScope) return false;
      if (!response.ok)
        throw new Error(result.error || "Unable to apply update.");
      const appliedIds = Array.isArray(result.appliedIds) ? new Set<string>(result.appliedIds) : new Set<string>();
      const persisted = Object.prototype.hasOwnProperty.call(result, "value") ? result.value as TrackerValue : value;
      applyBulk(id => appliedIds.has(id) ? persisted : previousValues.get(id)!, new Set(previousValues.keys()), () => value, allKnown);
      mutate(current => current ? { ...current, entries: current.entries.map(entry => appliedIds.has(entry._id)
        ? { ...entry, fieldRevisions: { ...entry.fieldRevisions, [field.key]: result.revisions?.[entry._id] ?? expectedRevisions[entry._id] + 1 } } : entry) } : current);
      if (result.complete === false || appliedIds.size !== entryIds.length) toast.error(result.conflicts?.length
        ? "Some fields changed elsewhere and were left untouched. Refreshing saved results." : "Some clients could not be updated. Refreshing the saved results.");
      if (!replacement && appliedIds.size > 0) {
        const previous = Array.isArray(result.previous)
          ? (result.previous as Array<{ id: string; value: TrackerValue; revision: number }>)
          : [];
        setLastBulkChange({ key: field.key, values: previous });
        toast(
          (notice) => (
            <span>
              Updated {result.updated} client{result.updated === 1 ? "" : "s"}.{" "}
              <button
                className="ml-2 font-semibold underline"
                onClick={() => {
                  toast.dismiss(notice.id);
                  void undoBulk({ key: field.key, values: previous });
                }}
              >
                Undo
              </button>
            </span>
          ),
          { id: "tracker-edit-undo", duration: 10000, ariaProps: { role: "status", "aria-live": "off" } },
        );
      } else if (replacement && appliedIds.size > 0)
        toast.success(
          `Restored ${result.updated} client${result.updated === 1 ? "" : "s"}.`,
        );
      if (!replacement) setSelectedEntries(new Set(entryIds.filter(id => !appliedIds.has(id))));
      reconcileNeeded.current.activity = true;
      return { complete: result.complete !== false && appliedIds.size === entryIds.length, appliedIds: [...appliedIds] };
    } catch (error) {
      if (!editingAlive.current || editingContext.current.scope !== bulkScope) return false;
      toast.error(
        error instanceof Error ? error.message : "Unable to apply update.",
      );
      applyBulk(id => previousValues.get(id)!, new Set(previousValues.keys()), () => value, allKnown);
      return false;
    } finally {
      if (editingAlive.current && editingContext.current.scope === bulkScope) {
        editingContext.current.bulkSaving = false;
        invalidate(`/api/client-trackers/${resolved.id}?`);
        setBulkSaving(false);
      }
    }
  };
  const undoBulk = async (change = lastBulkChange) => {
    if (
      !change ||
      !selectedBulkField ||
      change.key !== selectedBulkField.key
    )
      return;
    const groups = new Map<string, { value: TrackerValue; ids: string[]; revisions: Record<string, number> }>();
    change.values.forEach(({ id, value, revision }) => {
      const groupKey = JSON.stringify(value);
      const group = groups.get(groupKey) || { value, ids: [], revisions: {} };
      group.ids.push(id);
      group.revisions[id] = revision;
      groups.set(groupKey, group);
    });
    try {
      const remaining = [...change.values];
      for (const group of groups.values()) {
        const result = await bulkUpdate(true, group);
        if (result) for (let i = remaining.length - 1; i >= 0; i--) if (result.appliedIds.includes(remaining[i].id)) remaining.splice(i, 1);
        if (!result || !result.complete) { setLastBulkChange({ ...change, values: remaining }); return; }
      }
      setLastBulkChange(null);
    } catch {
      toast.error("Unable to undo this bulk update.");
    }
  };

  if (loading && !tracker) return <TrackerPageLoading trackerId={resolved.id} hasActivity={Boolean(trackerActivity?.events?.length)} />;
  if (!tracker)
    return (
      <div data-tracker-route-error className="rounded-2xl border border-base bg-card p-8 text-center">
        <CircleAlert className="mx-auto mb-2 h-7 w-7 text-rose-500" />
        <p className="font-semibold text-default">
          {error ? "Unable to load tracker" : "Tracker not found"}
        </p>
        {error && <button onClick={() => void refetchCurrentPage()} className="mt-3 mr-4 text-sm text-blue-600">Retry</button>}
        <Link
          href="/dashboard/client-trackers"
          className="mt-3 inline-block text-sm text-blue-600"
        >
          Back to trackers
        </Link>
      </div>
    );

  return (
    <>
      <Modal
        open={savedViewEditorOpen}
        onClose={() => !savingSavedView && setSavedViewEditorOpen(false)}
        title={
          savedViewDraft &&
          (tracker?.savedViews || []).some(
            (view) => view.id === savedViewDraft.id,
          )
            ? "Edit saved view"
            : "Create saved view"
        }
        subtitle="Choose the tracker conditions that define this group of clients."
        size="lg"
        footer={
          <div className="tracker-modal-footer flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setSavedViewEditorOpen(false)}
              disabled={savingSavedView}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted hover:bg-black/[0.04] disabled:opacity-60 dark:hover:bg-white/[0.06]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveSavedView()}
              disabled={savingSavedView || !savedViewDraft}
              className="tracker-modal-primary rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {savingSavedView ? "Saving…" : "Save view"}
            </button>
          </div>
        }
      >
        {savedViewDraft && (
          <SavedViewEditor
            fields={tracker.fields}
            draft={savedViewDraft}
            onChange={setSavedViewDraft}
          />
        )}
      </Modal>
      <Modal
        open={basicsOpen}
        onClose={() => !savingConfiguration && setBasicsOpen(false)}
        title="Edit tracker details"
        subtitle="Name, description, and financial year"
        size="lg"
        footer={basicsFooter}
      >
        <div className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-default">
              Tracker name
            </span>
            <input
              autoFocus
              value={basicDraft.name}
              onChange={(event) =>
                setBasicDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              className="w-full rounded-xl border border-base bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-default">
              Description
            </span>
            <textarea
              value={basicDraft.description}
              onChange={(event) =>
                setBasicDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              rows={3}
              className="w-full resize-none rounded-xl border border-base bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-default">
              Financial year{" "}
              <span className="font-normal text-faint">optional</span>
            </span>
            <input
              value={basicDraft.financialYear}
              onChange={(event) =>
                setBasicDraft((current) => ({
                  ...current,
                  financialYear: event.target.value,
                }))
              }
              className="w-full rounded-xl border border-base bg-surface px-3 py-2 text-sm"
            />
          </label>
        </div>
      </Modal>
      <div className="client-trackers-page space-y-5" data-tracker-workspace-shell={resolved.id}>
        <header className="tracker-page-header" data-tracker-detail-heading={resolved.id}>
          <div className="min-w-0">
            <TrackerTransitionLink trackerId={resolved.id} direction="close" href="/dashboard/client-trackers" className="tracker-back-link">
              <ArrowLeft className="h-3.5 w-3.5" /> All trackers
            </TrackerTransitionLink>
            <h1 data-tracker-title tabIndex={-1}>{tracker.name}</h1>
            <p data-tracker-description>{tracker.description || "Client task worklist"}</p>
          </div>
          {isAdmin && (
            <div className="tracker-header-actions">
              {tracker.status === "active" && tracker.emailEnabled && (
                <button onClick={openEmailComposer} className="tracker-header-primary">
                  <Send className="h-4 w-4" /> Email clients
                </button>
              )}
              <details className="tracker-header-menu">
                <summary aria-label="More tracker actions">
                  <MoreHorizontal className="h-5 w-5" />
                </summary>
                <div className="tracker-header-menu-content">
                  {tracker.status === "active" && (
                    <>
                      <button onClick={openBasics}>Edit details</button>
                      <button onClick={openConfiguration}>
                        <Settings2 className="h-4 w-4" /> Configure
                      </button>
                      <button onClick={openEmailConfig}>
                        <Mail className="h-4 w-4" /> Email updates
                      </button>
                    </>
                  )}
                  <button onClick={() => setEmailHistoryOpen(true)}>
                    <FileText className="h-4 w-4" /> Email history
                  </button>
                  <span className="tracker-menu-divider" />
                  <button
                    onClick={() => setConfirmation("archive")}
                    disabled={archiving}
                  >
                    <Archive className="h-4 w-4" />
                    {archiving
                      ? "Working…"
                      : tracker.status === "archived"
                        ? "Restore tracker"
                        : "Archive tracker"}
                  </button>
                  <button
                    onClick={() => setConfirmation("delete")}
                    disabled={archiving}
                    className="is-destructive"
                  >
                    <Trash2 className="h-4 w-4" /> Delete tracker
                  </button>
                </div>
              </details>
            </div>
          )}
        </header>
        <section className="tracker-premium-summary" data-tracker-reveal="1">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4" />{" "}
              {tracker.totalEntryCount ??
                tracker.entryCount ??
                tracker.entries.length}{" "}
              clients
            </span>
            {tracker.financialYear && (
              <span>
                Financial year:{" "}
                <strong className="text-default">
                  {tracker.financialYear}
                </strong>
              </span>
            )}
            <span>{tracker.fields.length} tracker columns</span>
            {tracker.liveDataAsOf && (
              <span>
                Live data checked{" "}
                {new Date(tracker.liveDataAsOf).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            {tracker.emailEnabled && (
              <span className="inline-flex items-center gap-1.5" aria-busy={emailSummaryLoading || emailSummaryRefreshing} title={emailSummaryError ? "Email statistics may be out of date." : undefined}>
                <Mail className="h-4 w-4" />{" "}
                {emailActivity?.summary?.draft || 0} drafts ·{" "}
                {emailActivity?.summary?.sent || 0} sent
                {(emailActivity?.summary?.sent || 0) > 0 &&
                  ` · ${emailActivity?.summary?.reminders ?? (emailActivity?.logs || []).filter((log) => log.mailKind === "reminder").length} reminders`}
              </span>
            )}
            {tracker.status === "archived" && (
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                Archived · read only
              </span>
            )}
          </div>
        </section>
        {(trackerActivity?.events || []).length > 0 && (
          <section className="tracker-activity-panel" data-tracker-reveal="2">
            <button
              type="button"
              className="tracker-activity-trigger"
              onClick={() => setActivityExpanded((expanded) => !expanded)}
              aria-expanded={activityExpanded}
              aria-controls="tracker-recent-activity"
            >
              <span>
                <strong>Recent activity</strong>
                <small>Latest tracker updates</small>
              </span>
              <span className="tracker-activity-trigger-meta">
                {(trackerActivity?.events || []).length} recent
                <ChevronDown className="h-4 w-4" />
              </span>
            </button>
            <div
              id="tracker-recent-activity"
              className={`tracker-activity-content ${activityExpanded ? "is-open" : ""}`}
            >
              <div className="tracker-activity-inner">
                <p className="tracker-activity-description">
                  Manual and bulk marks retain the previous and new value.
                </p>
                <div className="tracker-activity-list">
                  {trackerActivity?.events?.slice(0, 5).map((event) => (
                    <div key={event._id} className="tracker-activity-event">
                      <div>
                        <strong>{event.label}</strong>
                        <span>{event.detail}</span>
                      </div>
                      <time>
                        {event.actorEmail || "System"} ·{" "}
                        {new Date(event.occurredAt).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="tracker-status-strip" data-tracker-reveal="3" aria-busy={loading || refreshing || overviewLoading || overviewRefreshing || writesPending || summaryMembershipMismatch}>
          {overviewFields.map((field) => {
            const values =
              field.type === "toggle" ? ["Yes", "No"] : field.options || [];
            return (
              <article key={field.key} className="tracker-status-card" title={overviewError ? "Totals may be out of date. Reconciliation failed; the last known counts are shown." : undefined}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {field.label}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {values.map((value) => {
                    const count =
                      !overviewCounts ? "—" : overviewCounts.find(
                        (item) =>
                          item.key === field.key &&
                          valueText(item.value) === value,
                      )?.count ?? 0;
                    return (
                      <button
                        key={value}
                        onClick={() => {
                          setFieldFilter(field.key);
                          setValueFilter(value);
                        }}
                        className={`tracker-status-value ${trackerHasOptionColors(field) ? trackerOptionTone(field, value) : "bg-surface text-default"}`}
                      >
                        <span className="block text-lg font-bold">{count}</span>
                        <span className="text-xs">{value}</span>
                      </button>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </section>

        <section className="tracker-marks-panel overflow-hidden rounded-2xl border border-base bg-card" data-tracker-reveal="4">
          <div className="flex flex-col gap-3 border-b border-base p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-semibold text-default">Client marks</h2>
              <p className="text-sm text-muted">
                {resultsUpdating ? "Updating results… " : ""}
                {tracker.entryCount !== undefined
                  ? `Showing ${visibleEntries.length ? (tracker.offset || 0) + 1 : 0}–${(tracker.offset || 0) + visibleEntries.length} of ${tracker.entryCount} matching clients`
                  : `Showing ${visibleEntries.length} matching clients on this page`}
                {tracker.totalEntryCount !== tracker.entryCount
                  ? ` · ${tracker.totalEntryCount || 0} total`
                  : ""}
              </p>
            </div>
            <div className="tracker-marks-actions flex flex-wrap gap-2">
              <details className="tracker-views-menu">
                <summary>
                  <List className="h-3.5 w-3.5" />
                  {activeSavedView?.name || "All clients"}
                  <ChevronDown className="h-3.5 w-3.5" />
                </summary>
                <div className="tracker-views-menu-content">
                  <span>Saved views</span>
                  <select
                    value={savedViewId}
                    onChange={(event) => {
                      setSavedViewId(event.target.value);
                      if (event.target.value) {
                        setSearch("");
                        setCategoryFilter(ALL_FILTER);
                        setFieldFilter(ALL_FILTER);
                        setValueFilter(ALL_FILTER);
                        setEntryOffset(0);
                      }
                    }}
                  >
                    <option value="">All clients</option>
                    {(tracker.savedViews || []).map((view) => (
                      <option key={view.id} value={view.id}>
                        {view.name}
                      </option>
                    ))}
                  </select>
                  <div>
                    <button
                      type="button"
                      onClick={() => openSavedViewEditor()}
                      disabled={tracker.status !== "active"}
                    >
                      New view
                    </button>
                    {activeSavedView && (
                      <>
                        <button
                          type="button"
                          onClick={() => openSavedViewEditor(activeSavedView)}
                          disabled={tracker.status !== "active"}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteActiveSavedView()}
                          disabled={tracker.status !== "active"}
                          className="is-destructive"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </details>
              {isAdmin && (
                <button
                  type="button"
                  disabled={exportingTracker || resultsUnavailable}
                  onClick={exportCurrentTracker}
                  className="tracker-table-control"
                >
                  <Download className="mr-1 inline h-3.5 w-3.5" />
                  {exportingTracker ? "Preparing Excel…" : "Export current view"}
                </button>
              )}
              {isAdmin && tracker.emailEnabled && (
                <button
                  type="button"
                  disabled={
                    tracker.status !== "active" || selectedEntries.size === 0 || resultsUnavailable
                  }
                  onClick={openEmailComposer}
                  className="tracker-table-primary"
                >
                  <Send className="mr-1 inline h-3.5 w-3.5" />
                  Email selected
                  {selectedEntries.size ? ` (${selectedEntries.size})` : ""}
                </button>
              )}
              <label className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
                <input
                  value={search}
                  aria-label="Find client"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find client"
                  className="w-44 rounded-lg border border-base bg-surface py-2 pl-8 pr-2 text-sm"
                />
              </label>
              <select
                aria-label="Client category"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="rounded-lg border border-base bg-surface px-2 py-2 text-sm"
              >
                <option value={ALL_FILTER}>All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <select
                aria-label="Tracker marker"
                value={fieldFilter}
                onChange={(event) => {
                  setFieldFilter(event.target.value);
                  setValueFilter(ALL_FILTER);
                }}
                className="rounded-lg border border-base bg-surface px-2 py-2 text-sm"
              >
                <option value={ALL_FILTER}>All markers</option>
                {tracker.fields.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                ))}
              </select>
              {fieldFilter !== ALL_FILTER &&
                (["text", "longText", "tags"].includes(filterField?.type || "") ? (
                  <input
                    aria-label="Marker value"
                    value={valueFilter === ALL_FILTER ? "" : valueFilter}
                    onChange={(event) =>
                      setValueFilter(event.target.value || ALL_FILTER)
                    }
                    placeholder={`Find ${filterField?.label.toLowerCase() || "value"}`}
                    className="w-40 rounded-lg border border-base bg-surface px-2 py-2 text-sm"
                  />
                ) : filterField?.type === "date" ? (
                  <input
                    aria-label="Marker value"
                    type="date"
                    value={valueFilter === ALL_FILTER ? "" : valueFilter}
                    onChange={(event) =>
                      setValueFilter(event.target.value || ALL_FILTER)
                    }
                    className="rounded-lg border border-base bg-surface px-2 py-2 text-sm"
                  />
                ) : [
                    "number",
                    "percentage",
                    "quantity",
                    "currency",
                    "progress",
                  ].includes(filterField?.type || "") ? (
                  <input
                    aria-label="Marker value"
                    type="number"
                    value={valueFilter === ALL_FILTER ? "" : valueFilter}
                    onChange={(event) =>
                      setValueFilter(event.target.value || ALL_FILTER)
                    }
                    placeholder={filterField?.label || "Value"}
                    className="w-28 rounded-lg border border-base bg-surface px-2 py-2 text-sm"
                  />
                ) : (
                  <select
                    aria-label="Marker value"
                    value={valueFilter}
                    onChange={(event) => setValueFilter(event.target.value)}
                    data-option-color={filterField && trackerHasOptionColors(filterField) && valueFilter !== ALL_FILTER ? trackerOptionColor(filterField, valueFilter) : undefined}
                    className={`rounded-lg border border-base px-2 py-2 text-sm ${filterField && trackerHasOptionColors(filterField) && valueFilter !== ALL_FILTER ? trackerOptionTone(filterField, valueFilter) : "bg-surface"}`}
                  >
                    <option value={ALL_FILTER}>All results</option>
                    {filterOptions.map((value) => (
                      <option key={value} value={value} className={filterField && trackerHasOptionColors(filterField) ? trackerOptionTone(filterField, value) : undefined}>
                        {value}
                      </option>
                    ))}
                  </select>
                ))}
            </div>
          </div>
          {tracker.status === "active" &&
            selectedEntries.size > 0 &&
            bulkFields.length > 0 && (
              <div className="tracker-bulk-actions flex flex-wrap items-center gap-2 border-b border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-900/50 dark:bg-blue-950/30">
                <strong className="text-blue-800 dark:text-blue-200">
                  {selectedEntries.size} selected
                </strong>
                <span className="text-blue-700 dark:text-blue-300">Set</span>
                <select
                  value={bulkField}
                  aria-label="Bulk marker"
                  onChange={(event) => {
                    const next = tracker.fields.find(
                      (field) => field.key === event.target.value,
                    );
                    setBulkField(event.target.value);
                    setBulkValue(
                      next?.type === "toggle"
                        ? "Yes"
                        : next?.options?.[0] || "",
                    );
                  }}
                  className="rounded-lg border border-blue-200 bg-white px-2 py-1.5 dark:bg-slate-900"
                >
                  {bulkFields.map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}
                    </option>
                  ))}
                </select>
                <select
                  value={bulkValue}
                  onChange={(event) => setBulkValue(event.target.value)}
                  aria-label="Bulk marker value"
                  data-option-color={selectedBulkField && trackerHasOptionColors(selectedBulkField) ? trackerOptionColor(selectedBulkField, bulkValue) : undefined}
                  className={`rounded-lg border border-blue-200 px-2 py-1.5 ${selectedBulkField && trackerHasOptionColors(selectedBulkField) ? trackerOptionTone(selectedBulkField, bulkValue) : "bg-white dark:bg-slate-900"}`}
                >
                  {bulkOptions.map((value) => (
                    <option key={value} value={value} className={selectedBulkField && trackerHasOptionColors(selectedBulkField) ? trackerOptionTone(selectedBulkField, value) : undefined}>
                      {value}
                    </option>
                  ))}
                </select>
                <button
                  disabled={bulkSaving || savingCells.size > 0 || resultsUnavailable}
                  onClick={() => void bulkUpdate()}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white disabled:opacity-60"
                >
                  {bulkSaving ? "Applying…" : "Apply"}
                </button>
                <button
                  onClick={() => setSelectedEntries(new Set())}
                  className="px-2 py-1.5 text-blue-700 dark:text-blue-300"
                >
                  Clear
                </button>
              </div>
            )}
          {error && !resultsUpdating && (
            <div role="alert" className="flex items-center justify-between gap-3 border-b border-base px-4 py-3 text-sm text-rose-600">
              <span>Unable to update results. {error}</span>
              <button type="button" onClick={() => refetch()} className="font-semibold">Retry</button>
            </div>
          )}
          <fieldset disabled={resultsUnavailable} aria-busy={resultsUpdating}>
          <div className="overflow-x-auto">
            <table role="table" className="tracker-marks-table min-w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input
                      disabled={
                        tracker.status !== "active" ||
                        (bulkFields.length === 0 && !tracker.emailEnabled)
                      }
                      type="checkbox"
                      checked={
                        visibleEntries.length > 0 &&
                        visibleEntries.every((entry) =>
                          selectedEntries.has(entry._id),
                        )
                      }
                      onChange={selectVisible}
                      aria-label="Select displayed clients"
                    />
                    <span className="tracker-mobile-only hidden">Select page</span>
                  </th>
                  <th className="sticky left-0 z-10 bg-surface px-4 py-3 font-semibold">
                    Client
                  </th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  {tracker.emailEnabled && (
                    <th className="min-w-32 px-4 py-3 font-semibold">
                      Communication
                    </th>
                  )}
                  {(tracker.clientColumns || ["state"]).map((column) => (
                    <th
                      key={column}
                      className="min-w-32 px-4 py-3 font-semibold"
                    >
                      {CLIENT_TRACKER_DETAIL_OPTIONS.find(
                        (option) => option.key === column,
                      )?.label || column}
                    </th>
                  ))}
                  {tracker.fields.map((field) => (
                    <th
                      key={field.key}
                      className="min-w-36 px-4 py-3 font-semibold"
                    >
                      {field.label}
                      {(field.dataLink || field.computed) && (
                        <span
                          className={`ml-1 text-[9px] font-semibold tracking-wide ${field.computed ? "text-violet-600" : "text-blue-600"}`}
                        >
                          {field.computed ? "COMPUTED" : "LIVE"}
                        </span>
                      )}
                    </th>
                  ))}
                  <th className="px-4 py-3 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base" aria-busy={bulkSaving} onKeyDown={navigateTrackerSwitch}>
                {visibleEntries.map(entry => <TrackerRow key={entry._id}
                  entry={entry} fields={tracker.fields} clientColumns={tracker.clientColumns}
                  active={tracker.status === "active"} bulkSaving={bulkSaving}
                  canSelect={bulkFields.length > 0 || Boolean(tracker.emailEnabled)} selected={selectedEntries.has(entry._id)}
                  emailEnabled={tracker.emailEnabled} communicationStatus={communicationByClient.get(entry.clientId) || "Not Contacted"}
                  savingCells={savingCells} feedback={cellFeedback} onDraftStart={showCellFeedback} onToggle={toggleEntry} onSave={saveValue} />)}
                {visibleEntries.length === 0 && (
                  <tr>
                    <td
                      colSpan={
                        tracker.fields.length +
                        (tracker.clientColumns || ["state"]).length +
                        4 +
                        (tracker.emailEnabled ? 1 : 0)
                      }
                      className="px-4 py-12 text-center text-muted"
                    >
                      <Filter className="mx-auto mb-2 h-5 w-5 text-faint" />
                      {resultsUpdating ? "Updating results…" : error ? "Results could not be updated." : "No clients match these filters."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {((tracker.offset || 0) > 0 || tracker.hasMore) && (
            <div className="flex items-center justify-center gap-2 border-t border-base p-3 text-center">
              <button
                disabled={(tracker.offset || 0) === 0 || resultsUnavailable}
                onClick={() =>
                  setEntryOffset((current) => Math.max(0, current - entryLimit))
                }
                className="rounded-lg border border-base px-3 py-2 text-sm font-medium text-default disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-muted">
                Page {Math.floor((tracker.offset || 0) / entryLimit) + 1}
              </span>
              <button
                disabled={!tracker.hasMore || resultsUnavailable}
                onClick={() =>
                  setEntryOffset(
                    tracker.nextOffset ?? (tracker.offset || 0) + entryLimit,
                  )
                }
                className="rounded-lg border border-base px-3 py-2 text-sm font-medium text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
          </fieldset>
        </section>
        <Modal
          open={emailConfigOpen}
          inert={trackerPreviewOpen}
          onClose={requestCloseEmailConfig}
          title="Email updates"
          subtitle="Create and manage reusable client-email workflows"
          icon={Mail}
          size="2xl"
          fixedHeight
          scrollable={false}
          footer={emailConfigFooter}
          className={`tracker-email-modal ${emailSetupScreen === "builder" ? "is-workflow-editing" : ""}`}
        >
          <div className={`tracker-email-workspace h-full min-h-0 p-5 ${emailSetupScreen === "builder" ? "is-editing overflow-hidden flex flex-col" : "overflow-y-auto"}`}>
            {emailConfigError && (
              <div
                role="alert"
                className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100"
              >
                {emailConfigError}
              </div>
            )}
            <LayoutGroup id="email-workflow-workspace">
              <AnimatePresence initial={false} mode="popLayout">
            {emailSetupScreen === "library" && (
              <motion.div
                key="workflow-library"
                className="tracker-email-library space-y-6"
                initial={{ opacity: 0, y: 7, filter: "blur(2px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: 4, scale: 0.992, filter: "blur(2px)" }}
                transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
              >
                <motion.div
                  className="tracker-email-setting-row"
                  initial={{ opacity: 0, y: 5, filter: "blur(2px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.32, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div>
                    <p className="text-[15px] font-semibold tracking-[-0.01em] text-default">Email updates</p>
                    <p className="mt-0.5 text-[13px] leading-5 text-muted">Prepare, review, and send client emails.</p>
                    <p className="mt-1 text-xs text-muted">Only admins can prepare, draft, or send emails.</p>
                  </div>
                  <div className="tracker-email-toggle flex shrink-0 items-center gap-2.5 text-sm">
                    <GlassToggle
                      checked={emailEnabledDraft}
                      onCheckedChange={() => {
                        setEmailConfigError(null);
                        setEmailEnabledDraft((enabled) => !enabled);
                      }}
                      aria-label={`Email updates ${emailEnabledDraft ? "enabled" : "disabled"}`}
                      className="tracker-email-switch relative inline-flex h-[29px] w-[53px] items-center rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#202023]"
                      thumbClassName="tracker-email-switch-thumb"
                    />
                    <span className="hidden font-medium text-default sm:inline">Enable updates</span>
                  </div>
                </motion.div>

                <div className="flex items-end justify-between gap-4 px-1">
                  <div>
                    <h4 className="text-[17px] font-semibold tracking-[-0.02em] text-default">Your workflows</h4>
                    <p className="mt-0.5 text-[13px] text-muted">Create and manage reusable email workflows.</p>
                  </div>
                  <button
                    type="button"
                    disabled={workflowDraft.length >= 8}
                    onClick={() => {
                      setEmailConfigError(null);
                      setNewWorkflowDetails({ name: "", description: "" });
                      setEmailSetupScreen("new-details");
                    }}
                    className="tracker-email-new-workflow inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" /> New workflow
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {workflowDraft.map((workflow, index) => {
                    const mode = emailWorkflowContentMode(workflow);
                    const modeLabel = mode === "combinations" ? "Combination" : mode === "statements" ? "Statements" : "Bullet points";
                    return (
                      <motion.button
                        layoutId={`email-workflow-surface-${workflow.id}`}
                        key={workflow.id}
                        type="button"
                        onPointerMove={(event) => {
                          const bounds = event.currentTarget.getBoundingClientRect();
                          event.currentTarget.style.setProperty("--workflow-pointer-x", `${((event.clientX - bounds.left) / bounds.width) * 100}%`);
                          event.currentTarget.style.setProperty("--workflow-pointer-y", `${((event.clientY - bounds.top) / bounds.height) * 100}%`);
                        }}
                        onClick={() => {
                          setActiveWorkflowId(workflow.id);
                          setBuilderStartPage(0);
                          setEmailSetupScreen("builder");
                        }}
                        initial={{ opacity: 0, y: 7, scale: 0.985 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.985, filter: "blur(2px)" }}
                        whileHover={{ y: -2, scale: 1.007 }}
                        whileTap={{ scale: 0.985, y: 0 }}
                        transition={{ type: "spring", stiffness: 310, damping: 28, mass: 0.85, delay: index * 0.045 }}
                        className="tracker-email-workflow-card"
                        aria-label={`Open ${workflow.name || "email workflow"}`}
                      >
                        <span className="tracker-email-card-highlight" aria-hidden="true" />
                        <div className="relative flex h-full flex-col">
                          <motion.span layoutId={`email-workflow-icon-${workflow.id}`} className="tracker-email-workflow-icon"><Mail className="h-4 w-4" /></motion.span>
                          <div className="mt-auto flex items-end justify-between gap-3">
                            <div className="min-w-0">
                              <motion.p layoutId={`email-workflow-title-${workflow.id}`} className="truncate text-[15px] font-semibold tracking-[-0.01em] text-default">{workflow.name}</motion.p>
                              <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-muted">{workflow.description || "No description added yet."}</p>
                            </div>
                            <ArrowRight className="tracker-email-card-arrow h-4 w-4 shrink-0 text-muted" />
                          </div>
                          <motion.span layoutId={`email-workflow-badge-${workflow.id}`} className="tracker-email-workflow-badge">{modeLabel}</motion.span>
                        </div>
                      </motion.button>
                    );
                  })}
                  <motion.button
                    layout
                    type="button"
                    disabled={workflowDraft.length >= 8}
                    onClick={() => {
                      setEmailConfigError(null);
                      setNewWorkflowDetails({ name: "", description: "" });
                      setEmailSetupScreen("new-details");
                    }}
                    initial={{ opacity: 0, y: 7, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.985, filter: "blur(2px)" }}
                    whileHover={{ y: -2, scale: 1.004 }}
                    whileTap={{ scale: 0.985 }}
                    transition={{ type: "spring", stiffness: 310, damping: 28, mass: 0.85, delay: workflowDraft.length * 0.045 }}
                    className="tracker-email-create-card"
                  >
                    <Plus className="tracker-email-create-plus mb-2 h-5 w-5" />
                    <span className="font-semibold">New workflow</span>
                    <span className="mt-1 text-xs text-muted">Create a reusable email workflow</span>
                  </motion.button>
                </div>
              </motion.div>
            )}
            {emailSetupScreen === "new-details" && (
              <motion.div
                key="new-workflow-details"
                className="mx-auto max-w-xl space-y-6 py-3"
                initial={{ opacity: 0, y: 8, filter: "blur(2px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: 4, scale: 0.992, filter: "blur(2px)" }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              >
                <button
                  type="button"
                  onClick={() => setEmailSetupScreen("library")}
                  className="inline-flex items-center gap-1 text-sm font-medium text-blue-600"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to workflows
                </button>
                <div>
                  <h3 className="text-xl font-semibold text-default">What is this workflow for?</h3>
                  <p className="mt-1 text-sm text-muted">Use a name your team will recognise at a glance.</p>
                </div>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-default">Workflow name</span>
                  <input
                    autoFocus
                    value={newWorkflowDetails.name}
                    onChange={(event) => setNewWorkflowDetails((current) => ({ ...current, name: event.target.value }))}
                    placeholder="For example, GST document reminder"
                    className="w-full rounded-xl border border-base bg-card px-3.5 py-3 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-default">Short description <span className="font-normal text-muted">(optional)</span></span>
                  <textarea
                    rows={3}
                    value={newWorkflowDetails.description}
                    onChange={(event) => setNewWorkflowDetails((current) => ({ ...current, description: event.target.value }))}
                    placeholder="For example, Ask clients for missing GST documents."
                    className="w-full resize-none rounded-xl border border-base bg-card px-3.5 py-3 text-sm"
                  />
                </label>
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={!newWorkflowDetails.name.trim()}
                    onClick={() => {
                      const workflow = {
                        ...newWorkflow(tracker.fields),
                        name: newWorkflowDetails.name.trim(),
                        ...(newWorkflowDetails.description.trim()
                          ? { description: newWorkflowDetails.description.trim() }
                          : {}),
                      };
                      setWorkflowDraft((current) => [...current, workflow]);
                      setActiveWorkflowId(workflow.id);
                      setBuilderStartPage(1);
                      setEmailSetupScreen("builder");
                    }}
                    className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Continue
                  </button>
                </div>
              </motion.div>
            )}
            {emailSetupScreen === "builder" && activeWorkflow && (
              <motion.div
                key={`workflow-editor-${activeWorkflow.id}`}
                className="tracker-email-editor-viewport"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 3, scale: 0.994, filter: "blur(2px)" }}
                transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
              >
                <TrackerEmailWorkflowEditor
                  workflow={activeWorkflow}
                  reviewIssues={emailWorkflowValidationIssues(activeWorkflow, tracker.fields, workflowDraft.indexOf(activeWorkflow))}
                  otherReviewWorkflows={workflowDraft.flatMap((item, index) => {
                    if (item.id === activeWorkflow.id) return [];
                    const count = emailWorkflowValidationIssues(item, tracker.fields, index).length;
                    return count ? [{ name: item.name.trim() || `Workflow ${index + 1}`, issues: count }] : [];
                  })}
                  fields={tracker.fields}
                  managedDocuments={managedDocuments}
                  startPage={builderStartPage}
                  onBack={() => setEmailSetupScreen("library")}
                  onPreviewCombinations={() => setCombinationPreviewOpen(true)}
                  analysis={scenarioAnalysis}
                  analysisCurrent={scenarioAnalysis?.fingerprint === JSON.stringify([activeWorkflow, tracker.fields])}
                  validationTarget={scenarioValidationTarget?.workflowId === activeWorkflow.id ? scenarioValidationTarget : null}
                  onTestClients={ruleId => {
                    const issue = emailWorkflowValidationIssues(activeWorkflow, tracker.fields)[0];
                    if (issue) { setEmailConfigError(issue.message); if (issue.ruleId) setScenarioValidationTarget({ workflowId: activeWorkflow.id, ruleId: issue.ruleId, conditionIndex: issue.conditionIndex, request: Date.now() }); return; }
                    setTrackerPreviewRuleId(ruleId || ""); setTrackerPreviewOpen(true);
                  }}
                  onChange={(patch) => updateWorkflow(activeWorkflow.id, patch)}
                  onRemove={() => {
                    if (workflowDraft.length < 2) return;
                    const remaining = workflowDraft.filter(
                      (workflow) => workflow.id !== activeWorkflow.id,
                    );
                    setEmailConfigError(null);
                    setWorkflowDraft(remaining);
                    setActiveWorkflowId(remaining[0].id);
                    setEmailSetupScreen("library");
                  }}
                />
              </motion.div>
            )}
              </AnimatePresence>
            </LayoutGroup>
          </div>
        </Modal>
        <ConfirmModal
          open={emailConfigDiscardOpen}
          onClose={() => setEmailConfigDiscardOpen(false)}
          onConfirm={() => {
            setEmailConfigDiscardOpen(false);
            setEmailConfigOpen(false);
            setEmailConfigError(null);
          }}
          title="Discard email workflow changes?"
          description="Your unsaved email-update settings will be lost."
          confirmLabel="Discard changes"
          variant="warning"
        />
        <WorkflowCombinationPreview
          open={combinationPreviewOpen}
          onClose={() => setCombinationPreviewOpen(false)}
          workflow={activeWorkflow || null}
          fields={tracker.fields}
        />
        {activeWorkflow && <WorkflowTrackerClientPreview open={trackerPreviewOpen} onClose={() => setTrackerPreviewOpen(false)} trackerId={String(tracker._id)} workflow={activeWorkflow}
          fingerprint={JSON.stringify([activeWorkflow, tracker.fields])} analysis={scenarioAnalysis} onAnalysis={setScenarioAnalysis} initialRuleId={trackerPreviewRuleId} />}
        <EmailDeliveryReviewWorkspace
          open={emailComposeOpen}
          onClose={() => !emailLoading && !previewMessage && !authorizationBatch && setEmailComposeOpen(false)}
          interactionLocked={Boolean(authorizationBatch)}
          workflows={tracker.emailWorkflows || []} workflowId={activeWorkflowId} kind={emailKind}
          onWorkflow={id => { setActiveWorkflowId(id); setEmailPreview(null); setEmailPreparationError(null); }}
          onKind={kind => { setEmailKind(kind); setEmailPreview(null); setEmailPreparationError(null); }}
          selectedCount={selectedEntries.size} clientCategories={emailClientCategories}
          preview={emailPreview} drafts={recipientDrafts}
          onDraft={(id, draft) => setRecipientDrafts(current => ({ ...current, [id]: draft }))}
          busy={emailLoading} phase={emailPreparationPhase} deliveryMode={emailDeliveryMode}
          error={emailPreparationError} onPrepare={() => void previewEmails()}
          onDrafts={() => prepareDeliveryBatch("draft")} onSend={() => prepareDeliveryBatch("send")}
          signature={gmailSignature} signatureLoading={gmailSignatureLoading}
          onExpand={message => { emailExpandFocusRef.current = document.activeElement as HTMLElement; setPreviewMessage(message); }}
        />
        <Modal
          open={Boolean(previewMessage)}
          onClose={() => { setPreviewMessage(null); requestAnimationFrame(() => emailExpandFocusRef.current?.focus({ preventScroll: true })); }}
          title="Email preview"
          subtitle={previewMessage?.subject || "Personalised client update"}
          icon={FileText}
          size="2xl"
        >
          <div className="bg-surface p-4 sm:p-5">
            <div className="w-full overflow-hidden rounded-xl border border-base bg-card shadow-sm">
              <iframe
                title="Tracker email preview"
                srcDoc={previewWithGmailSignature(
                  previewMessage?.html || "",
                  gmailSignature,
                  emailPreview?.workflow.signatureGap ?? 2,
                )}
                sandbox=""
                className="h-[72vh] min-h-[620px] w-full border-0 bg-white"
              />
            </div>
            <p className="mt-3 text-xs text-muted">
              {gmailSignatureLoading
                ? "Loading the configured Gmail signature…"
                : gmailSignature
                  ? `The configured Gmail signature is shown after ${emailPreview?.workflow.signatureGap ?? 2} blank line${(emailPreview?.workflow.signatureGap ?? 2) === 1 ? "" : "s"}, matching the draft or sent email.`
                  : "The email body fills the available width. A Gmail signature will appear here when one is configured."}
            </p>
          </div>
        </Modal>
        <Modal
          open={emailHistoryOpen}
          onClose={() => setEmailHistoryOpen(false)}
          title="Email history"
          subtitle="Exact draft and sent-email snapshots"
          size="2xl"
          fixedHeight
          scrollable={false}
        >
          <div className="max-h-[70vh] space-y-2 overflow-y-auto p-5">
            <div className="mb-2 flex flex-wrap gap-2">
              {emailDeliveryActivity && <button type="button" className="rounded-lg border border-base px-3 py-2 text-sm text-blue-600"
                onClick={() => { setEmailHistoryOpen(false); emailDeliveryActivity.showHistory(); }}>Delivery campaigns</button>}
              <button
                onClick={async () => {
                  try {
                    const response = await fetch(
                      `/api/client-trackers/${resolved.id}/email/replies`,
                      { method: "POST" },
                    );
                    const result = await readJsonResponse(response);
                    response.ok
                      ? toast.success(
                          `Checked ${result.checked} emails; ${result.replied} replies found.`,
                        )
                      : toast.error(result.error || "Unable to check replies.");
                    void refetchEmailActivity();
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Unable to check replies.");
                  }
                }}
                className="rounded-lg border border-base px-3 py-2 text-sm text-blue-600"
              >
                Check Gmail replies
              </button>
              <button
                type="button"
                disabled={exportingEmailHistory}
                onClick={exportEmailHistory}
                className="rounded-lg border border-base px-3 py-2 text-sm font-medium text-default hover:border-blue-300 hover:text-blue-600 disabled:opacity-50"
              >
                <Download className="mr-1 inline h-3.5 w-3.5" />
                {exportingEmailHistory ? "Preparing Excel…" : "Export Excel"}
              </button>
            </div>
            {emailHistoryLoading && !emailHistory ? <LoadingSpinner /> : emailHistoryError ? <p className="py-10 text-center text-sm text-muted">Unable to load email history. Close and reopen to retry.</p> : emailHistory?.logs?.length ? (
              emailHistory.logs.map((log) => (
                <details
                  key={log._id}
                  className="rounded-xl border border-base bg-surface p-3"
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-default">
                        {log.clientName || "Client"} ·{" "}
                        {log.subject || "Untitled email"}
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${log.communicationStatus === "replied" ? "bg-violet-100 text-violet-700" : log.status === "sent" ? "bg-emerald-100 text-emerald-700" : log.status === "failed" ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700"}`}
                      >
                        {log.communicationStatus === "replied"
                          ? "replied"
                          : log.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {log.mailKind === "reminder" ? "Reminder" : "Initial"} ·{" "}
                      {(log.to || []).join(", ")} ·{" "}
                      {new Date(log.sentAt).toLocaleString("en-IN")}
                    </p>
                  </summary>
                  <div className="mt-3 space-y-2 border-t border-base pt-3 text-sm">
                    <p>
                      <strong>To:</strong> {(log.to || []).join(", ") || "—"}
                    </p>
                    {(log.cc || []).length > 0 && (
                      <p>
                        <strong>CC:</strong> {log.cc?.join(", ")}
                      </p>
                    )}
                    {(log.attachments || []).length > 0 && (
                      <p>
                        <strong>Attachments:</strong>{" "}
                        {log.attachments
                          ?.map((attachment) => attachment.filename)
                          .join(", ")}
                      </p>
                    )}
                    <p>
                      <strong>Campaign:</strong>{" "}
                      {log.campaignId || "Legacy delivery"}
                    </p>
                    {log.gmailMessageId && (
                      <p>
                        <strong>Gmail message:</strong> {log.gmailMessageId}
                      </p>
                    )}
                    {log.renderedHtml ? (
                      <iframe
                        title={`Email snapshot ${log._id}`}
                        srcDoc={log.renderedHtml}
                        sandbox=""
                        className="h-72 w-full rounded-lg border border-base bg-white"
                      />
                    ) : (
                      <p className="text-xs text-faint">
                        This legacy email was sent before snapshots were stored.
                      </p>
                    )}
                  </div>
                </details>
              ))
            ) : (
              <p className="py-10 text-center text-sm text-muted">
                No tracker email history yet.
              </p>
            )}
          </div>
        </Modal>
        {authorizationBatch && <EmailDeliveryAuthorizationModal key={authorizationBatch.batch.campaignId} trackerId={resolved.id} batch={authorizationBatch.batch} workflowName={activeWorkflow?.name || "Workflow"} resuming={emailOperationRef.current?.attempted}
          onClose={() => setAuthorizationBatch(null)} onCommit={deliverPreparedBatch} onAccepted={deliveryAccepted} onHandoffComplete={deliveryHandoffComplete} />}
        <Modal
          open={configurationOpen}
          onClose={requestConfigurationClose}
          title="Configure tracker"
          subtitle="Change structure, audience, and client information"
          size="2xl" fixedHeight scrollable={false}
          className="tracker-create-modal tracker-configure-modal"
          compactHeader={configurationCompact}
          footer={configurationFooter}
        >
          {configurationBaseline && <ConfigureTrackerWorkspace key={configurationSession}
            trackerId={resolved.id} syncDraft={syncDraft} onSyncChange={setSyncDraft}
            baseline={configurationBaseline} fields={fieldDraft} clientColumns={columnDraft}
            clientIds={participantDraft} financialYear={basicDraft.financialYear}
            clients={allClients} entries={tracker.entries} saving={savingConfiguration}
            saved={configurationSaved} serverError={configurationError}
            clientsLoading={clientsLoading} clientsError={clientsError}
            categorySync={tracker.clientMembershipMode === "categorySync" ? tracker.clientCategories?.join(", ") : undefined}
            onFieldsChange={setFieldDraft} onColumnsChange={setColumnDraft} onClientsChange={setParticipantDraft}
            onFinancialYearChange={financialYear => setBasicDraft(current => ({ ...current, financialYear }))}
            onCompactChange={setConfigurationCompact} onNestedDialogChange={setConfigurationNestedDialog}
          />}
        </Modal>
        <ConfirmModal open={configurationDiscardOpen} title="Discard unsaved changes?"
          description="Your tracker structure and client selections will stay as saved."
          confirmLabel="Discard changes" variant="warning"
          onClose={() => setConfigurationDiscardOpen(false)} onConfirm={() => { setConfigurationDiscardOpen(false); setConfigurationOpen(false); }} />
        <ConfirmModal
          open={confirmation !== null}
          onClose={() => setConfirmation(null)}
          onConfirm={async () => {
            const action = confirmation;
            setConfirmation(null);
            if (action === "archive") await archive();
            if (action === "delete") await deleteTracker();
            if (action === "configuration") await saveConfiguration(true);
            if (action === "bulk") await bulkUpdate(true);
          }}
          title={
            confirmation === "delete"
              ? "Delete tracker permanently?"
              : confirmation === "configuration"
                ? "Apply tracker removals?"
                : confirmation === "bulk"
                  ? `Update ${selectedEntries.size} client marks?`
                  : tracker.status === "archived"
                    ? "Restore tracker?"
                    : "Archive tracker?"
          }
          description={
            confirmation === "delete"
              ? `Delete “${tracker.name}” and all of its client marks permanently.`
              : confirmation === "configuration"
                ? "Removed columns lose their saved values for clients currently in this tracker. Removed clients leave this worklist; their saved marks are kept for re-adding."
                : confirmation === "bulk"
                  ? `Set ${selectedBulkField?.label || "this field"} to “${bulkValue}” for the selected clients. You can undo this after it is applied.`
                  : tracker.status === "archived"
                    ? `Restore “${tracker.name}” to the active tracker list.`
                    : `Archive “${tracker.name}”. Its client marks will be kept and can be restored later.`
          }
          note={
            confirmation === "delete"
              ? "This cannot be undone."
              : confirmation === "configuration"
                ? "Client Master and activity history are kept. Changes apply only to this tracker."
                : undefined
          }
          confirmLabel={
            confirmation === "delete"
              ? "Delete permanently"
              : confirmation === "configuration"
                ? "Remove data"
                : confirmation === "bulk"
                  ? "Apply to selected"
                  : tracker.status === "archived"
                    ? "Restore tracker"
                    : "Archive tracker"
          }
          variant={
            confirmation === "delete" || confirmation === "configuration"
              ? "danger"
              : "warning"
          }
          confirmText={confirmation === "delete" ? "DELETE" : undefined}
        />
      </div>
    </>
  );
}

type WorkflowSetupPage = { title: string; description: string };

type FluidLayerHandle = {
  disturb: (x: number, y: number, velocityX: number, velocityY: number) => void;
};

type FluidDyeCloud = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  aspect: number;
  phase: number;
  hue: [number, number, number];
  spin: number;
};

/** A deliberately tiny canvas: independent dye clouds, not a cursor-driven gradient. */
const InteractiveFluidLayer = React.forwardRef<FluidLayerHandle, {
  active: boolean;
  reduceMotion: boolean | null;
}>(function InteractiveFluidLayer({ active, reduceMotion }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeRef = useRef(active);
  const settlingRef = useRef(false);
  const resumeRef = useRef<() => void>(() => undefined);
  const simulationRef = useRef<{
    width: number;
    height: number;
    clouds: FluidDyeCloud[];
    lastFrame: number;
    lastInput: number;
  } | null>(null);
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    activeRef.current = active;
    if (active) {
      settlingRef.current = true;
      setSettling(true);
      resumeRef.current();
    }
  }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let frame = 0;
    let running = false;
    let destroyed = false;
    const now = () => performance.now();

    const createClouds = (width: number, height: number): FluidDyeCloud[] => {
      const colors: [number, number, number][] = [
        [137, 92, 246],
        [62, 130, 246],
        [44, 199, 232],
        [220, 99, 212],
        [104, 114, 255],
        [173, 93, 238],
      ];
      const positions = [
        [0.16, 0.68], [0.34, 0.31], [0.57, 0.72],
        [0.78, 0.34], [0.90, 0.66], [0.49, 0.46],
      ];
      return colors.map((hue, index) => ({
        x: width * positions[index][0],
        y: height * positions[index][1],
        vx: 0,
        vy: 0,
        radius: Math.max(height * (0.64 + (index % 3) * 0.1), 24),
        aspect: 0.82 + (index % 3) * 0.16,
        phase: index * 1.71,
        hue,
        spin: index % 2 ? 1 : -1,
      }));
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      simulationRef.current = {
        width: rect.width,
        height: rect.height,
        clouds: createClouds(rect.width, rect.height),
        lastFrame: now(),
        lastInput: 0,
      };
      draw(0, true);
    };

    const draw = (timestamp: number, isStatic = false) => {
      const simulation = simulationRef.current;
      if (!simulation) return;
      const { width, height, clouds } = simulation;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "screen";

      clouds.forEach((cloud) => {
        const speed = Math.min(1.8, Math.hypot(cloud.vx, cloud.vy));
        const stretch = 1 + speed * 0.4;
        const angle = Math.atan2(cloud.vy, cloud.vx || 0.0001) + cloud.spin * 0.12;
        const radius = cloud.radius * stretch;
        const alpha = isStatic ? 0.12 : 0.15 + Math.min(0.09, speed * 0.06);
        const gradient = context.createRadialGradient(cloud.x, cloud.y, radius * 0.08, cloud.x, cloud.y, radius);
        gradient.addColorStop(0, `rgba(${cloud.hue[0]}, ${cloud.hue[1]}, ${cloud.hue[2]}, ${alpha})`);
        gradient.addColorStop(0.46, `rgba(${cloud.hue[0]}, ${cloud.hue[1]}, ${cloud.hue[2]}, ${alpha * 0.52})`);
        gradient.addColorStop(1, `rgba(${cloud.hue[0]}, ${cloud.hue[1]}, ${cloud.hue[2]}, 0)`);
        context.save();
        context.translate(cloud.x, cloud.y);
        context.rotate(angle);
        context.scale(1, cloud.aspect);
        context.translate(-cloud.x, -cloud.y);
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(cloud.x, cloud.y, radius, 0, Math.PI * 2);
        context.fill();
        context.restore();
      });
      context.globalCompositeOperation = "source-over";
    };

    const advance = (timestamp: number) => {
      const simulation = simulationRef.current;
      if (!simulation || destroyed) return;
      const elapsed = Math.min(34, Math.max(8, timestamp - simulation.lastFrame));
      simulation.lastFrame = timestamp;
      const step = elapsed / 16.67;
      const ambient = activeRef.current ? 1 : 0;
      let energy = 0;

      simulation.clouds.forEach((cloud, index) => {
        const ambientX = Math.sin(timestamp * 0.00075 + cloud.phase) * 0.010 * ambient;
        const ambientY = Math.cos(timestamp * 0.00062 + cloud.phase * 1.34) * 0.008 * ambient;
        const centerX = simulation.width * (0.48 + Math.sin(cloud.phase) * 0.16);
        const centerY = simulation.height * (0.5 + Math.cos(cloud.phase * 1.4) * 0.12);
        const curl = Math.sin(timestamp * 0.0011 + index * 1.9) * 0.003 * cloud.spin;
        const recovery = activeRef.current ? 1 : 0.12;
        cloud.vx += (ambientX + (centerX - cloud.x) * 0.00018 * recovery - cloud.vy * curl) * step;
        cloud.vy += (ambientY + (centerY - cloud.y) * 0.00024 * recovery + cloud.vx * curl) * step;
        const drag = Math.pow(activeRef.current ? 0.975 : 0.93, step);
        cloud.vx *= drag;
        cloud.vy *= drag;
        cloud.x += cloud.vx * step;
        cloud.y += cloud.vy * step;
        energy += Math.abs(cloud.vx) + Math.abs(cloud.vy);
      });

      draw(timestamp);
      const shouldContinue = activeRef.current || timestamp - simulation.lastInput < 980 || energy > 0.065;
      if (shouldContinue) {
        frame = requestAnimationFrame(advance);
      } else {
        running = false;
        if (settlingRef.current) {
          settlingRef.current = false;
          setSettling(false);
        }
      }
    };

    const resume = () => {
      if (!running && !destroyed && !reduceMotion) {
        running = true;
        frame = requestAnimationFrame(advance);
      }
    };
    resumeRef.current = resume;

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    if (active && !reduceMotion) resume();

    return () => {
      destroyed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      resumeRef.current = () => undefined;
    };
  }, [reduceMotion]);

  React.useImperativeHandle(ref, () => ({
    disturb(x, y, velocityX, velocityY) {
      const simulation = simulationRef.current;
      if (!simulation || reduceMotion) return;
      const speed = Math.min(1.4, Math.hypot(velocityX, velocityY));
      if (speed < 0.015) return;
      const cursorX = simulation.width * (0.2 + x * 0.6);
      const cursorY = simulation.height * (0.15 + y * 0.7);
      const influence = Math.max(28, Math.min(52, simulation.height * 1.2));
      simulation.clouds.forEach((cloud) => {
        const distance = Math.hypot(cloud.x - cursorX, cloud.y - cursorY);
        const falloff = Math.exp(-(distance * distance) / (2 * influence * influence));
        const forwardX = velocityX * (0.72 + falloff * 0.9);
        const forwardY = velocityY * (0.72 + falloff * 0.9);
        const perpendicularX = -velocityY * 0.34 * cloud.spin * falloff;
        const perpendicularY = velocityX * 0.34 * cloud.spin * falloff;
        cloud.vx = Math.max(-2.2, Math.min(2.2, cloud.vx + (forwardX + perpendicularX) * 0.52));
        cloud.vy = Math.max(-2.2, Math.min(2.2, cloud.vy + (forwardY + perpendicularY) * 0.52));
      });
      simulation.lastInput = performance.now();
      settlingRef.current = true;
      setSettling(true);
      resumeRef.current();
    },
  }), [reduceMotion]);

  return (
    <span className={`fluid-step-fluid-wrap ${active ? "is-active" : ""} ${settling ? "is-settling" : ""}`} aria-hidden="true">
      <canvas ref={canvasRef} className="fluid-step-fluid-canvas" />
    </span>
  );
});

function FluidStepNavigation({
  pages,
  currentPage,
  onSelect,
  activePillRef,
  styleReceive,
}: {
  pages: WorkflowSetupPage[];
  currentPage: number;
  onSelect: (page: number) => void;
  activePillRef: React.RefObject<HTMLSpanElement | null>;
  styleReceive: MotionValue<number>;
}) {
  const [hoveredPage, setHoveredPage] = useState<number | null>(null);
  const stepScroll = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    const viewport = stepScroll.current;
    const selected = viewport?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!viewport || !selected) return;
    // Scroll only the stepper, never its modal or the page behind it.
    const reveal = () => {
      if (viewport.scrollWidth <= viewport.clientWidth) return;
      const outer = viewport.getBoundingClientRect(), pill = selected.getBoundingClientRect();
      if (pill.left < outer.left + 12 || pill.right > outer.right - 12)
        viewport.scrollTo({ left: viewport.scrollLeft + pill.left - outer.left - (outer.width - pill.width) / 2, behavior: reduceMotion ? "instant" : "smooth" });
    };
    reveal();
    const observer = new ResizeObserver(reveal); observer.observe(selected); observer.observe(viewport);
    return () => observer.disconnect();
  }, [currentPage, reduceMotion]);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const pointerScale = useMotionValue(1);
  const fluidRef = useRef<FluidLayerHandle | null>(null);
  const fluidPointerRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const outerX = useSpring(pointerX, { stiffness: 165, damping: 20, mass: 0.9 });
  const outerY = useSpring(pointerY, { stiffness: 165, damping: 20, mass: 0.9 });
  const outerScale = useSpring(pointerScale, { stiffness: 165, damping: 20, mass: 0.9 });
  const receivedScale = useTransform(() => outerScale.get() * (1 + styleReceive.get() * .025));
  const receivedBrightness = useTransform(styleReceive, value => `brightness(${1 + value * .14})`);
  const receivedShadow = useTransform(styleReceive, value => `0 ${6 + value * 2}px ${18 + value * 4}px rgba(40,110,190,${value * .14})`);
  const titleX = useSpring(useTransform(pointerX, (value) => value * 0.42), { stiffness: 175, damping: 21, mass: 0.86 });
  const titleY = useSpring(useTransform(pointerY, (value) => value * 0.42), { stiffness: 175, damping: 21, mass: 0.86 });
  const highlightX = useSpring(useTransform(pointerX, (value) => value * 2.25), { stiffness: 125, damping: 19, mass: 1 });
  const highlightY = useSpring(useTransform(pointerY, (value) => value * 2.5), { stiffness: 125, damping: 19, mass: 1 });
  const current = pages[currentPage];
  const textTransition = reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const };
  const spring = reduceMotion
    ? { duration: 0.01 }
    : { type: "spring" as const, stiffness: 245, damping: 24, mass: 0.9 };
  const resetPointer = () => {
    pointerX.set(0);
    pointerY.set(0);
    pointerScale.set(1);
  };
  const updatePointer = (
    event: React.PointerEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (index !== currentPage || reduceMotion || event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
    const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
    const normalizedX = (x + 1) / 2;
    const normalizedY = (y + 1) / 2;
    const previous = fluidPointerRef.current;
    const at = event.timeStamp;
    if (previous) {
      const elapsed = Math.max(8, Math.min(48, at - previous.at));
      fluidRef.current?.disturb(
        normalizedX,
        normalizedY,
        ((normalizedX - previous.x) * bounds.width) / elapsed,
        ((normalizedY - previous.y) * bounds.height) / elapsed,
      );
    }
    fluidPointerRef.current = { x: normalizedX, y: normalizedY, at };
    pointerX.set(x * 3.6);
    pointerY.set(y * 2.5);
    pointerScale.set(1.014);
  };

  return (
    <LayoutGroup id="email-workflow-stepper">
      <nav className="fluid-step-navigation" aria-label="Email workflow setup">
        <div ref={stepScroll} className="fluid-step-scroll">
          <div className="fluid-step-track">
          {pages.map((page, index) => {
            const selected = index === currentPage;
            const hovered = hoveredPage === index;
            const expanded = selected || hovered;
            return (
              <React.Fragment key={page.title}>
                {index > 0 && (
                  <motion.span
                    layout
                    aria-hidden="true"
                    className={`fluid-step-connector ${index <= currentPage ? "is-complete" : ""}`}
                    transition={spring}
                  />
                )}
                <motion.button
                  layout
                  type="button"
                  aria-current={selected ? "step" : undefined}
                  aria-label={`Step ${index + 1}: ${page.title}`}
                  onClick={() => {
                    setHoveredPage(index);
                    if (index !== currentPage) resetPointer();
                    onSelect(index);
                  }}
                  onMouseEnter={() => {
                    setHoveredPage(index);
                    if (index === currentPage && !reduceMotion)
                      pointerScale.set(1.012);
                  }}
                  onMouseLeave={() => {
                    setHoveredPage(null);
                    fluidPointerRef.current = null;
                    if (index === currentPage) resetPointer();
                  }}
                  onFocus={() => setHoveredPage(index)}
                  onBlur={() => {
                    setHoveredPage(null);
                    if (index === currentPage) resetPointer();
                  }}
                  onPointerMove={(event) => updatePointer(event, index)}
                  transition={spring}
                  whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                  className={`fluid-step ${expanded ? "is-expanded" : ""} ${selected ? "is-selected" : ""} ${selected && hovered ? "is-hovered" : ""}`}
                >
                  {selected && (
                    <motion.span
                      ref={activePillRef}
                      layoutId="fluid-selected-material"
                      transition={spring}
                      className="fluid-step-material"
                      style={{ x: outerX, y: outerY, scale: receivedScale, filter: receivedBrightness }}
                    >
                      <motion.span aria-hidden="true" className="workflow-style-pill-receive"
                        style={{ opacity: styleReceive, boxShadow: receivedShadow }} />
                      {!reduceMotion && (
                        <span key={currentPage} className="fluid-step-liquid" />
                      )}
                      <InteractiveFluidLayer
                        ref={fluidRef}
                        active={selected && hovered}
                        reduceMotion={reduceMotion}
                      />
                      <span aria-hidden="true" className="fluid-step-frost" />
                      <motion.span
                        aria-hidden="true"
                        className="fluid-step-pointer-highlight"
                        style={{ x: highlightX, y: highlightY }}
                      />
                    </motion.span>
                  )}
                  <motion.span
                    className="fluid-step-content"
                    style={selected ? { x: titleX, y: titleY } : undefined}
                    animate={hovered && !selected && !reduceMotion ? { scale: [0.975, 1.012, 1], y: [0, -0.5, 0] } : { scale: 1 }}
                    transition={selected ? spring : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <AnimatePresence initial={false} mode="popLayout">
                      {expanded ? (
                        <motion.span
                          key="title"
                          initial={
                            reduceMotion
                              ? { opacity: 0 }
                              : { opacity: 0, scale: 0.95, filter: "blur(3px)" }
                          }
                          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                          exit={
                            reduceMotion
                              ? { opacity: 0 }
                              : { opacity: 0, scale: 0.88, filter: "blur(3px)" }
                          }
                          transition={textTransition}
                          className="fluid-step-title"
                        >
                          {page.title}
                        </motion.span>
                      ) : (
                        <motion.span
                          key="number"
                          initial={
                            reduceMotion
                              ? { opacity: 0 }
                              : { opacity: 0, scale: 0.88, filter: "blur(3px)" }
                          }
                          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                          exit={
                            reduceMotion
                              ? { opacity: 0 }
                              : { opacity: 0, scale: 0.88, filter: "blur(3px)" }
                          }
                          transition={textTransition}
                          className="fluid-step-number"
                        >
                          {index + 1}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.span>
                </motion.button>
              </React.Fragment>
            );
          })}
          </div>
        </div>
        <div className="fluid-step-description" aria-live="polite">
        <AnimatePresence initial={false} mode="wait">
          <motion.p
            key={currentPage}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 7, filter: "blur(3px)" }
            }
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -5, filter: "blur(3px)" }
            }
            transition={reduceMotion ? { duration: 0.01 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            {current.description}
          </motion.p>
        </AnimatePresence>
        </div>
      </nav>
    </LayoutGroup>
  );
}

function TrackerEmailWorkflowEditor({
  workflow,
  reviewIssues,
  otherReviewWorkflows,
  fields,
  managedDocuments,
  startPage,
  onBack,
  onPreviewCombinations,
  onTestClients,
  analysis,
  analysisCurrent,
  validationTarget,
  onChange,
  onRemove,
}: {
  workflow: TrackerEmailWorkflow;
  reviewIssues: EmailWorkflowIssue[];
  otherReviewWorkflows: { name: string; issues: number }[];
  fields: TrackerField[];
  managedDocuments: ManagedDocumentOption[];
  startPage: number;
  onBack: () => void;
  onPreviewCombinations: () => void;
  onTestClients: (ruleId?: string) => void;
  analysis: DraftScenarioAnalysis | null;
  analysisCurrent: boolean;
  validationTarget: { ruleId: string; conditionIndex?: number; request: number } | null;
  onChange: (patch: WorkflowDraftChange) => void;
  onRemove: () => void;
}) {
  const fieldValues = (field?: TrackerField) =>
    field?.type === "toggle" ? ["Yes", "No"] : field?.options || [];
  const conditionGroup: TrackerConditionGroup = workflow.conditionGroup || {
    mode: "ALL",
    conditions: [
      {
        fieldKey: workflow.mainFieldKey,
        operator: "equals",
        value: workflow.mainValue,
      },
    ],
  };
  const updateConditions = (patch: Partial<TrackerConditionGroup>) =>
    onChange(current => ({ conditionGroup: { ...(current.conditionGroup || conditionGroup), ...patch } }));
  const attachments = workflow.attachments || [];
  const contentRules = workflow.contentRules || [];
  const contentMode = emailWorkflowContentMode(workflow);
  const reduceMotion = useReducedMotion();
  const editorRef = useRef<HTMLElement>(null);
  const styleTileRef = useRef<HTMLButtonElement>(null);
  const stylePillRef = useRef<HTMLSpanElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [headerName, setHeaderName] = useState(workflow.name);
  // Form state stays live; only the title's visual presentation is debounced.
  useEffect(() => {
    const timer = window.setTimeout(() => setHeaderName(workflow.name), 160);
    return () => window.clearTimeout(timer);
  }, [workflow.name]);
  const updateEditorCompactness = useCallback((compactness: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.style.setProperty("--workflow-header-progress", String(compactness));
    editor.style.setProperty("--workflow-description-height", `${20 * (1 - compactness)}px`);
    editor.style.setProperty("--workflow-description-margin", `${4 * (1 - compactness)}px`);
    editor.style.setProperty("--workflow-summary-height", `${88 - 56 * compactness}px`);
    editor.style.setProperty("--workflow-identity-y", `${40 * (1 - compactness)}px`);
    editor.style.setProperty("--workflow-identity-x", `${44 * compactness}px`);
    editor.style.setProperty("--workflow-badge-y", `${3 + 40 * (1 - compactness)}px`);
  }, []);
  const workflowModeLabel =
    contentMode === "combinations"
      ? "Combination"
      : contentMode === "statements"
        ? "Statements"
        : "Bullet points";
  const contentRuleType: TrackerEmailContentRule["type"] =
    contentMode === "combinations"
      ? "combination"
      : contentMode === "statements"
        ? "statement"
        : "point";
  // Inspect a retained inactive-style error without changing the sending style.
  const [dismissedValidationView, setDismissedValidationView] = useState(0);
  const targetRule = validationTarget?.request !== dismissedValidationView ? contentRules.find(rule => rule.id === validationTarget?.ruleId) : undefined;
  const editingRuleType = targetRule?.type || contentRuleType;
  const messageMode = editingRuleType === "combination" ? "combinations" : editingRuleType === "statement" ? "statements" : "points";
  const updateContentRule = (id: string, patch: DraftRuleChange) =>
    onChange(current => updateDraftRule(current, id, patch));
  const addContentRule = (type: TrackerEmailContentRule["type"]) => {
    const id = emailId();
    const rule: TrackerEmailContentRule = { id, type, action: "include", content: "", conditionGroup: { mode: "ALL", conditions: [{ fieldKey: "", operator: "equals", value: "" }] } };
    onChange(current => addDraftRule(current, rule));
    return id;
  };
  const moveScenario = (id: string, direction: -1 | 1) => onChange(current => moveDraftRule(current, id, direction));
  const updateAttachment = (
    id: string,
    patch: Partial<TrackerEmailAttachment>,
  ) =>
    onChange({
      attachments: attachments.map((attachment) =>
        attachment.id === id ? { ...attachment, ...patch } : attachment,
      ),
    });
  const addAttachment = () => {
    const id = emailId();
    onChange({
      attachments: [
        ...attachments,
        {
          id,
          source: "client_latest",
          category: "certificates",
          documentKind: "general",
          financialYear: "tracker",
        },
      ],
    });
    return id;
  };
  const editorVariables = useMemo(() => emailEditorVariables(fields), [fields]);
  const setupPages = [
    { title: "About", description: "Name and describe this workflow." },
    { title: "Send rule", description: "Choose which clients should receive it." },
    { title: "Email style", description: "Choose how matching columns add to the email." },
    { title: "Messages", description: "Set the message for each matching condition." },
    { title: "Template", description: "Write the shared part of the email." },
    { title: "Delivery", description: "Set recipients, reminders, and attachments." },
    { title: "Review", description: "Check the workflow before saving." },
  ];
  const { setupPage, stepDirection, commit, styleCommit, styleClock, selectStyleAndAdvance, navigateToStep, navigateStep } =
    useWorkflowStepNavigation(workflow.id, startPage, setupPages, Boolean(reduceMotion));
  useEffect(() => {
    if (validationTarget) navigateToStep(3);
    // Each failed validation requests navigation once, without resetting edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validationTarget?.request]);
  const styleReceive = useTransform(styleClock, elapsed => styleCommit && !reduceMotion
    ? handoffReceive(elapsed - styleCommit.selectionDelay) : 0);
  useLayoutEffect(() => {
    const textarea = descriptionRef.current;
    if (!textarea || setupPage !== 0) return;
    const resize = () => {
      textarea.style.height = "0px";
      const height = Math.max(100, Math.min(240, textarea.scrollHeight + 2));
      textarea.style.height = `${height}px`;
      textarea.style.overflowY = textarea.scrollHeight > textarea.clientHeight ? "auto" : "hidden";
    };
    // Reflow existing text on entry, edits, and changes to the column width.
    resize();
    let width = textarea.clientWidth;
    const observer = new ResizeObserver(() => {
      if (textarea.clientWidth === width) return;
      width = textarea.clientWidth;
      resize();
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [setupPage, workflow.description]);
  return (
    <motion.section
      ref={editorRef}
      className="tracker-email-editor"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 7, filter: "blur(3px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 3, filter: "blur(2px)" }}
      transition={{ duration: reduceMotion ? 0.01 : 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="tracker-email-sticky-header">
        <motion.div
          layoutId={`email-workflow-surface-${workflow.id}`}
          transition={{ type: "spring", stiffness: 280, damping: 29, mass: 0.9 }}
          className="tracker-email-workflow-summary"
        >
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to workflows"
            className="tracker-email-back inline-flex items-center gap-1.5 text-sm font-medium text-muted"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="tracker-email-back-label" aria-hidden="true">Workflows</span>
          </button>
          <div className="tracker-email-identity-copy min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              <motion.span layoutId={`email-workflow-icon-${workflow.id}`} className="tracker-email-workflow-icon"><Mail className="h-4 w-4" /></motion.span>
              <motion.p layoutId={`email-workflow-title-${workflow.id}`} className="min-w-0 flex-1 truncate text-lg font-semibold tracking-[-0.025em] text-default">
                <AnimatePresence initial={false} mode="wait">
                  <motion.span key={headerName || "Email workflow"} className="block truncate"
                    initial={{ opacity: 0, filter: reduceMotion ? "blur(0px)" : "blur(1px)" }}
                    animate={{ opacity: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, filter: reduceMotion ? "blur(0px)" : "blur(1px)" }}
                    transition={{ duration: reduceMotion ? 0.01 : 0.1, ease: [0.22, 1, 0.36, 1] }}>
                    {headerName || "Email workflow"}
                  </motion.span>
                </AnimatePresence>
              </motion.p>
            </div>
            <p className="tracker-email-workflow-description text-[13px] leading-5 text-muted">
              {contentMode === "combinations"
                ? "Combination email · clients are sent only when a defined scenario matches."
                : contentMode === "statements"
                  ? "Statement email · each matching condition adds a full message."
                  : "Bullet-point email · each matching condition adds a short item."}
            </p>
          </div>
          <motion.span layoutId={`email-workflow-badge-${workflow.id}`} className="tracker-email-workflow-badge">{workflowModeLabel}</motion.span>
        </motion.div>
        <motion.div
          className="tracker-email-stepper-shell"
          inert={styleCommit?.phase === "committing"}
          aria-busy={styleCommit?.phase === "committing"}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.28, delay: reduceMotion ? 0 : 0.11, ease: [0.22, 1, 0.36, 1] }}
        >
          <FluidStepNavigation
            activePillRef={stylePillRef}
            styleReceive={styleReceive}
            pages={setupPages}
            currentPage={setupPage}
            onSelect={navigateToStep}
          />
        </motion.div>
      </div>
      <WorkflowStepContentStage page={setupPage} direction={stepDirection}
        reduceMotion={Boolean(reduceMotion)} title={setupPages[setupPage].title}
        focusOnEntry={Boolean(commit?.keyboard || styleCommit?.keyboard)} onCompactnessChange={updateEditorCompactness}
        styleHandoff={!!styleCommit}
        navigation={
          <WorkflowStepNavigationDock
            page={setupPage}
            pages={setupPages}
            commit={commit}
            hideNext={setupPage === 2}
            locked={styleCommit?.phase === "committing"}
            onNavigate={navigateStep}
            reduceMotion={Boolean(reduceMotion)}
          />
        }>
      {setupPage === 0 && <>
      <div className="tracker-email-about-form">
        <div className="tracker-email-about-heading">
          <div>
            <h4 className="tracker-email-about-title">Workflow details</h4>
            <p className="tracker-email-about-helper">Give this workflow a clear name and purpose.</p>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="tracker-email-remove-workflow"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Remove workflow
          </button>
        </div>
        <label className="tracker-email-about-field">
          <span className="tracker-email-input-label">Workflow name</span>
          <input
            value={workflow.name}
            onChange={(event) => onChange({ name: event.target.value })}
            onBlur={(event) => setHeaderName(event.currentTarget.value)}
            className="tracker-email-editor-input w-full px-3.5 py-2.5 text-sm"
            placeholder="For example, GST document reminder"
          />
        </label>
        <label className="tracker-email-about-field">
          <span className="tracker-email-input-label tracker-email-description-label">Description <span>Optional</span></span>
          <textarea
            ref={descriptionRef}
            rows={3}
            value={workflow.description || ""}
            onChange={(event) => onChange({ description: event.target.value })}
            placeholder="What is this workflow for?"
            className="tracker-email-editor-input w-full px-3.5 py-2.5 text-sm"
          />
        </label>
      </div>
      </>}
      {setupPage === 1 && (
        <WorkflowSendRuleComposer
          key={workflow.id}
          group={conditionGroup}
          fields={fields}
          onChange={updateConditions}
          onChangeCurrent={change => onChange(current => { const group = current.conditionGroup || conditionGroup; return { conditionGroup: { ...group, ...change(group) } }; })}
          valuesForField={fieldValues}
          operatorsForField={emailOperatorsForField}
          reduced={Boolean(reduceMotion)}
        />
      )}
      {setupPage === 2 && (
        <WorkflowEmailStyleChooser workflow={workflow} fields={fields} value={contentMode}
          commit={styleCommit}
          onConfirm={(mode, keyboard, tile) => selectStyleAndAdvance(mode, contentMode, keyboard, () => {
            styleTileRef.current = tile;
            onChange({ contentMode: mode });
          })}
          onChange={mode => onChange({ contentMode: mode })} reduced={Boolean(reduceMotion)} />
      )}
      {setupPage === 4 && <WorkflowTemplateWorkspace subject={workflow.subject} body={workflow.body}
        variables={editorVariables} onChange={onChange} />}
      {setupPage === 5 && <WorkflowDeliveryWorkspace workflow={workflow} fields={fields} managedDocuments={managedDocuments}
        variables={editorVariables} onChange={onChange} onAddAttachment={addAttachment} onUpdateAttachment={updateAttachment}
        onRemoveAttachment={id => onChange({ attachments: attachments.filter(item => item.id !== id) })}
        valuesForField={fieldValues} operatorsForField={emailOperatorsForField} />}
      {setupPage === 3 && editingRuleType !== contentRuleType && <p className="workflow-rule-helper">Editing retained {messageMode} content. The active email style remains {workflowModeLabel}. <button type="button" onClick={() => setDismissedValidationView(validationTarget?.request || 0)}>Return to active messages</button></p>}
      {setupPage === 3 && <WorkflowMessagesWorkspace key={workflow.id} mode={messageMode}
        matchingMode={workflow.combinationMatchingMode} onMatchingMode={combinationMatchingMode => onChange({ combinationMatchingMode })}
        resolveFromStyle={!!styleCommit}
        rules={contentRules.filter(rule => rule.type === editingRuleType).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))} fields={fields}
        variables={editorVariables}
        onAdd={addContentRule} onUpdate={updateContentRule}
        allRules={contentRules} totalRuleCount={contentRules.length}
        onRemove={(id, expected) => onChange(current => removeDraftRule(current, id, expected))}
        onRestore={snapshot => onChange(current => restoreDraftRule(current, snapshot))}
        onMove={moveScenario} onPreview={onPreviewCombinations}
        onTestClients={onTestClients} analysis={analysis} analysisCurrent={analysisCurrent} validationTarget={validationTarget}
        valuesForField={fieldValues} operatorsForField={emailOperatorsForField} reduced={Boolean(reduceMotion)} />}
      {setupPage === 6 && <WorkflowReviewWorkspace workflow={workflow} fields={fields} variables={editorVariables}
        mode={contentMode} issues={reviewIssues} otherWorkflows={otherReviewWorkflows}
        onEdit={navigateToStep} onPreview={onPreviewCombinations} onBack={onBack} />}
      </WorkflowStepContentStage>
      {styleCommit && !reduceMotion && <StyleToStepperHandoff
        tileRef={styleTileRef} pillRef={stylePillRef} editorRef={editorRef}
        clock={styleClock} selectionDelay={styleCommit.selectionDelay} />}
    </motion.section>
  );
}

type TrackerRowProps = {
  entry: Entry; fields: TrackerField[]; clientColumns?: ClientTrackerDetailKey[];
  active: boolean; bulkSaving: boolean; canSelect: boolean; selected: boolean;
  emailEnabled?: boolean; communicationStatus: string; savingCells: Set<string>;
  onToggle: (id: string) => void;
  onSave: SaveTrackerValue;
  feedback: Map<string, CellFeedback>;
  onDraftStart: (id: string) => void;
};
const TrackerRow = React.memo(function TrackerRow({ entry, fields, clientColumns, active, bulkSaving,
  canSelect, selected, emailEnabled, communicationStatus, savingCells, feedback, onDraftStart, onToggle, onSave }: TrackerRowProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const rowDetailsId = React.useId();
  return (<tr role="row" className="tracker-client-row hover:bg-surface/60" data-mobile-expanded={mobileExpanded}>
                    <td role="cell" className="tracker-row-selection px-3 py-3">
                      <input
                        disabled={
                          !active ||
                          !canSelect
                        }
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggle(entry._id)}
                        aria-label={`Select ${entry.client?.companyName || entry.clientId}`}
                      />
                    </td>
                    <td role="cell" className="tracker-row-identity sticky left-0 z-[1] bg-card px-4 py-3">
                      <Link
                        href={`/dashboard/clients/${entry.clientId}`}
                        prefetch={false}
                        className="font-medium text-default hover:text-blue-600"
                      >
                        {entry.client?.companyName || entry.clientId}
                      </Link>
                      <p className="text-xs text-faint">{entry.clientId}</p>
                      <button type="button" className="tracker-mobile-toggle hidden" aria-expanded={mobileExpanded}
                        aria-controls={fields.length ? rowDetailsId : undefined} aria-label={`${mobileExpanded ? "Collapse" : "Edit"} fields for ${entry.client?.companyName || entry.clientId}`}
                        onClick={() => setMobileExpanded(value => !value)}>
                        {mobileExpanded ? "Hide fields" : "View / edit fields"}<ChevronDown size={14} aria-hidden="true" />
                      </button>
                    </td>
                    <td role="cell" data-label="Category" className="tracker-row-category px-4 py-3 text-muted">
                      {entry.client?.category || "—"}
                    </td>
                    {emailEnabled &&
                      (() => {
                        const status =
                          communicationStatus;
                        const tone =
                          status === "Replied"
                            ? "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-200"
                            : status === "Sent" || status === "Reminder Sent"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                              : status === "Draft Created"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
                                : status === "Failed"
                                  ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200"
                                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
                        return (
                          <td role="cell" data-label="Communication" className="tracker-row-communication px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${tone}`}
                            >
                              {status}
                            </span>
                          </td>
                        );
                      })()}
                    {(clientColumns || ["state"]).map((column) => (
                      <td
                        key={column}
                        role="cell" data-label={CLIENT_TRACKER_DETAIL_OPTIONS.find(option => option.key === column)?.label || column}
                        className="tracker-row-detail max-w-52 truncate px-4 py-3 text-muted"
                        title={clientDetailValue(entry.client, column)}
                      >
                        {clientDetailValue(entry.client, column)}
                      </td>
                    ))}
                    {fields.map((field) => (
                      <td key={field.key} role="cell" id={field === fields[0] ? rowDetailsId : undefined} data-label={field.label} data-tracker-field={field.key} className="tracker-row-detail relative px-4 py-3">
                        {renderEditor(
                          entry,
                          field,
                          savingCells.has(`${entry._id}-${field.key}`),
                          onSave,
                          bulkSaving || !active,
                          onDraftStart,
                        )}
                        {(savingCells.has(`${entry._id}-${field.key}`) || feedback.has(`${entry._id}-${field.key}`)) && <span
                          aria-hidden="true" title={`${field.label}: ${savingCells.has(`${entry._id}-${field.key}`) ? "Saving" : feedback.get(`${entry._id}-${field.key}`)}`}
                          className="pointer-events-none absolute right-1 top-1 inline-flex h-3 w-3 items-center justify-center">
                          {savingCells.has(`${entry._id}-${field.key}`) ? <LoaderCircle size={10} className="animate-spin text-muted motion-reduce:animate-none" />
                            : feedback.get(`${entry._id}-${field.key}`) === "saved" ? <Check size={10} className="text-emerald-600" /> : <CircleAlert size={10} className="text-rose-500" />}
                        </span>}
                      </td>
                    ))}
                    <td role="cell" data-label="Updated" className="tracker-row-detail whitespace-nowrap px-4 py-3 text-xs text-faint">
                      {new Date(entry.updatedAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </td>
                  </tr>);
}, (previous, next) => previous.entry === next.entry && previous.fields === next.fields
  && previous.clientColumns === next.clientColumns && previous.active === next.active
  && previous.bulkSaving === next.bulkSaving && previous.canSelect === next.canSelect
  && previous.selected === next.selected && previous.emailEnabled === next.emailEnabled
  && previous.communicationStatus === next.communicationStatus && previous.onToggle === next.onToggle
  && previous.onSave === next.onSave && previous.onDraftStart === next.onDraftStart && next.fields.every(field => {
    const key = next.entry._id + "-" + field.key;
    return previous.savingCells.has(key) === next.savingCells.has(key) && previous.feedback.get(key) === next.feedback.get(key);
  }));

const TrackerEditor = React.memo(function TrackerEditor({
  entry,
  field,
  saving,
  disabled,
  onDraftStart,
  onSave,
}: {
  entry: Entry;
  field: TrackerField;
  saving: boolean;
  disabled: boolean;
  onDraftStart: (id: string) => void;
  onSave: SaveTrackerValue;
}) {
  const value = entry.values[field.key];
  const [draft, setDraft] = useState(valueText(value));
  const focused = useRef(false), dirty = useRef(false);
  const draftRevision = useRef(trackerMarkRevision(entry.fieldRevisions, field.key));
  React.useEffect(() => {
    if (!focused.current || !dirty.current) setDraft(valueText(value));
  }, [value]);
  const changeDraft = (next: string) => { if (!dirty.current) onDraftStart(`${entry._id}-${field.key}`); dirty.current = true; setDraft(next); };
  const commitDraft = () => {
    focused.current = false; dirty.current = false;
    if (draft !== valueText(value)) onSave(entry, field, draft, { expectedRevision: draftRevision.current });
  };
  const focusDraft = () => { focused.current = true; draftRevision.current = trackerMarkRevision(entry.fieldRevisions, field.key); };
  const draftKey = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); dirty.current = false;
      setDraft(valueText(value)); draftRevision.current = trackerMarkRevision(entry.fieldRevisions, field.key);
    } else if (event.key === "Enter" && field.type !== "date" && (field.type !== "longText" || event.ctrlKey || event.metaKey)) {
      event.preventDefault(); event.currentTarget.blur();
    }
  };
  if (field.dataLink || field.computed)
    return (
      <span
        data-option-color={trackerHasOptionColors(field) ? trackerOptionColor(field, valueText(value)) : undefined}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium ${trackerHasOptionColors(field) ? trackerOptionTone(field, valueText(value)) : field.computed ? "bg-violet-50 text-violet-800 dark:bg-violet-950/30 dark:text-violet-200" : "bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-200"}`}
      >
        <span>
          {field.computed?.kind === "percentage" && value !== ""
            ? `${valueText(value)}%`
            : valueText(value)}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide opacity-65">
          {field.computed ? "Computed" : "Live"}
        </span>
      </span>
    );
  if (field.type === "toggle")
    return (
      <button
        type="button"
        role="switch"
        aria-checked={Boolean(value)}
        disabled={disabled}
        aria-busy={saving}
        onClick={() => onSave(entry, field, !Boolean(value))}
        className={`relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-2xl transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${value ? "bg-[#34C759] dark:bg-[#30D158]" : "bg-[#E5E5EA] dark:bg-[#3A3A3C]"}`}
        aria-label={`${field.label}: ${value ? "Yes" : "No"}`}
      >
        <span
          className={`absolute left-0.5 h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.30),0_1px_3px_rgba(0,0,0,0.15)] transition-transform duration-200 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] ${value ? "translate-x-5" : "translate-x-0"}`}
        />
      </button>
    );
  if (field.type === "status" || field.type === "select")
    return (
      <select
        disabled={disabled}
        aria-busy={saving}
        value={String(value ?? "")}
        onChange={(event) => onSave(entry, field, event.target.value)}
        aria-label={field.label}
        data-option-color={trackerOptionColor(field, String(value ?? ""))}
        className={`rounded-lg border border-transparent px-2 py-1.5 text-sm outline-none focus:border-blue-500 ${value === "" || value == null ? "bg-surface text-default" : trackerOptionTone(field, String(value))}`}
      >
        {(value === "" || value == null) && <option value="" disabled>Choose…</option>}
        {value != null && value !== "" && !field.options?.includes(String(value)) && <option value={String(value)} disabled>{String(value)}</option>}
        {(field.options || []).map((option) => (
          <option key={option} value={option} className={trackerOptionTone(field, option)}>
            {option}
          </option>
        ))}
      </select>
    );
  if (field.type === "multiSelect" || field.type === "tags") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div role="group" aria-label={field.label} className="flex min-w-32 max-w-64 flex-wrap gap-1">
        {[...new Set([...(field.options || []), ...selected])].map(option => {
          const checked = selected.includes(option), color = trackerOptionColor(field, option);
          return <label key={option} data-option-color={color} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs ${checked ? trackerOptionTone(field, option) : "bg-surface text-muted"} ${disabled ? "opacity-60" : ""}`}>
            <input type="checkbox" aria-label={option} disabled={disabled} aria-busy={saving} checked={checked}
              style={{ accentColor: TRACKER_OPTION_PALETTE[color].swatch }}
              onChange={event => onSave(entry, field, event.target.checked ? [...selected, option] : selected.filter(value => value !== option))} />
            <span>{option}</span>
          </label>;
        })}
      </div>
    );
  }
  if (field.type === "longText")
    return (
      <textarea
        disabled={disabled}
        aria-busy={saving}
        value={draft}
        onChange={(event) => changeDraft(event.target.value)}
        onFocus={focusDraft}
        onKeyDown={draftKey}
        aria-label={field.label}
        onBlur={commitDraft}
        rows={2}
        className="min-w-52 rounded-lg border border-base bg-surface px-2 py-1.5 text-sm outline-none focus:border-blue-500"
      />
    );
  const numeric = [
    "number",
    "percentage",
    "quantity",
    "currency",
    "progress",
  ].includes(field.type);
  const numericInput = (
    <input
      disabled={disabled}
      aria-busy={saving}
      type={numeric ? "number" : field.type === "date" ? "date" : "text"}
      min={
        field.type === "percentage" || field.type === "progress" ? 0 : undefined
      }
      max={
        field.type === "percentage" || field.type === "progress"
          ? 100
          : undefined
      }
      step={numeric ? "any" : undefined}
      value={draft}
      onChange={(event) => changeDraft(event.target.value)}
      onFocus={focusDraft}
      onKeyDown={draftKey}
      aria-label={field.label}
      onBlur={commitDraft}
      className="w-full min-w-28 rounded-lg border border-base bg-surface px-2 py-1.5 text-sm outline-none focus:border-blue-500"
    />
  );
  if (field.type === "progress") {
    const percentage = Math.max(0, Math.min(100, Number(value) || 0));
    return (
      <div className="min-w-36 space-y-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className="h-full rounded-full bg-blue-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
        {numericInput}
      </div>
    );
  }
  if (["percentage", "quantity", "currency"].includes(field.type)) {
    return (
      <div className="flex min-w-32 items-center gap-1">
        <span className="text-xs text-muted">
          {field.type === "currency" ? "₹" : ""}
        </span>
        {numericInput}
        <span className="text-xs text-muted">
          {field.type === "percentage"
            ? "%"
            : field.type === "quantity"
              ? field.unit || ""
              : ""}
        </span>
      </div>
    );
  }
  return numericInput;
}, (previous, next) => previous.entry._id === next.entry._id
  && sameTrackerValue(previous.entry.values[previous.field.key], next.entry.values[next.field.key])
  && previous.field === next.field && previous.saving === next.saving
  && trackerMarkRevision(previous.entry.fieldRevisions, previous.field.key) === trackerMarkRevision(next.entry.fieldRevisions, next.field.key)
  && previous.disabled === next.disabled && previous.onSave === next.onSave && previous.onDraftStart === next.onDraftStart);

function renderEditor(
  entry: Entry,
  field: TrackerField,
  saving: boolean,
  onSave: SaveTrackerValue,
  disabled: boolean,
  onDraftStart: (id: string) => void,
) {
  return (
    <TrackerEditor
      entry={entry}
      field={field}
      saving={saving}
      disabled={disabled}
      onDraftStart={onDraftStart}
      onSave={onSave}
    />
  );
}

function SavedViewEditor({
  fields,
  draft,
  onChange,
}: {
  fields: TrackerField[];
  draft: TrackerSavedView;
  onChange: (view: TrackerSavedView) => void;
}) {
  const operators: Array<{ value: TrackerRuleOperator; label: string }> = [
    { value: "equals", label: "equals" },
    { value: "not_equals", label: "does not equal" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "does not contain" },
    { value: "greater_than", label: "greater than" },
    { value: "greater_than_or_equal", label: "at least" },
    { value: "less_than", label: "less than" },
    { value: "less_than_or_equal", label: "at most" },
  ];
  const updateGroup = (patch: Partial<TrackerConditionGroup>) =>
    onChange({
      ...draft,
      conditionGroup: { ...draft.conditionGroup, ...patch },
    });
  const choicesFor = (field?: TrackerField) =>
    field?.type === "toggle" ? ["Yes", "No"] : field?.options || [];

  return (
    <div className="space-y-5 p-5">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-default">
          View name
        </span>
        <input
          autoFocus
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          placeholder="Example: Purchase pending, sale received"
          className="w-full rounded-xl border border-base bg-surface px-3 py-2 text-sm"
        />
      </label>

      <div className="rounded-xl border border-base bg-surface p-3">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-default">
              Include clients when
            </p>
            <p className="text-xs text-muted">
              ALL requires every condition. ANY requires at least one condition.
            </p>
          </div>
          <select
            value={draft.conditionGroup.mode}
            onChange={(event) =>
              updateGroup({ mode: event.target.value as "ALL" | "ANY" })
            }
            className="rounded-lg border border-base bg-card px-2 py-1.5 text-sm"
          >
            <option value="ALL">ALL conditions</option>
            <option value="ANY">ANY condition</option>
          </select>
        </div>

        <div className="space-y-2">
          {draft.conditionGroup.conditions.map((condition, index) => {
            const field = fields.find(
              (item) => item.key === condition.fieldKey,
            );
            const choices = choicesFor(field);
            const needsValue = !["is_empty", "is_not_empty"].includes(
              condition.operator,
            );
            return (
              <div
                key={index}
                className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_minmax(0,1fr)_auto]"
              >
                <select
                  value={condition.fieldKey}
                  onChange={(event) => {
                    const conditions = [...draft.conditionGroup.conditions];
                    conditions[index] = {
                      fieldKey: event.target.value,
                      operator: "equals",
                      value: "",
                    };
                    updateGroup({ conditions });
                  }}
                  className="rounded-lg border border-base bg-card px-2 py-2 text-sm"
                >
                  {fields.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <select
                  value={condition.operator}
                  onChange={(event) => {
                    const conditions = [...draft.conditionGroup.conditions];
                    conditions[index] = {
                      ...condition,
                      operator: event.target.value as TrackerRuleOperator,
                    };
                    updateGroup({ conditions });
                  }}
                  className="rounded-lg border border-base bg-card px-2 py-2 text-sm"
                >
                  {operators.map((operator) => (
                    <option key={operator.value} value={operator.value}>
                      {operator.label}
                    </option>
                  ))}
                </select>
                {needsValue ? (
                  choices.length ? (
                    <select
                      value={String(condition.value ?? "")}
                      onChange={(event) => {
                        const conditions = [...draft.conditionGroup.conditions];
                        conditions[index] = {
                          ...condition,
                          value: event.target.value,
                        };
                        updateGroup({ conditions });
                      }}
                      className="rounded-lg border border-base bg-card px-2 py-2 text-sm"
                    >
                      <option value="">Choose value</option>
                      {choices.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={
                        field?.type === "number"
                          ? "number"
                          : field?.type === "date"
                            ? "date"
                            : "text"
                      }
                      value={String(condition.value ?? "")}
                      onChange={(event) => {
                        const conditions = [...draft.conditionGroup.conditions];
                        conditions[index] = {
                          ...condition,
                          value: event.target.value,
                        };
                        updateGroup({ conditions });
                      }}
                      placeholder="Value"
                      className="rounded-lg border border-base bg-card px-2 py-2 text-sm"
                    />
                  )
                ) : (
                  <span className="rounded-lg bg-card px-2 py-2 text-xs text-faint">
                    No value needed
                  </span>
                )}
                <button
                  type="button"
                  disabled={draft.conditionGroup.conditions.length === 1}
                  onClick={() =>
                    updateGroup({
                      conditions: draft.conditionGroup.conditions.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    })
                  }
                  className="px-1 text-sm text-rose-600 disabled:opacity-30"
                  aria-label="Remove condition"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          disabled={
            draft.conditionGroup.conditions.length >= 12 || !fields.length
          }
          onClick={() =>
            updateGroup({
              conditions: [
                ...draft.conditionGroup.conditions,
                {
                  fieldKey: fields[0]?.key || "",
                  operator: "equals",
                  value: "",
                },
              ],
            })
          }
          className="mt-3 text-sm font-medium text-blue-600 disabled:opacity-50"
        >
          + Add condition
        </button>
      </div>
    </div>
  );
}

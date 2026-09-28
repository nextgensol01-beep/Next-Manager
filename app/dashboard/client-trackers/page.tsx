"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import {
  Archive,
  CheckCircle2,
  ClipboardList,
  Plus,
  Search,
  Users,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import TrackerModal from "@/components/client-trackers/TrackerModal";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useCache, invalidate } from "@/lib/useCache";
import { FINANCIAL_YEARS } from "@/lib/utils";
import {
  CLIENT_TRACKER_CATEGORIES,
  CLIENT_TRACKER_DETAIL_OPTIONS,
  TRACKER_OPTION_COLORS,
  type ClientTrackerCategory,
  type ClientTrackerDetailKey,
  type TrackerDataLinkDisplay,
  type TrackerDataLinkSource,
  type TrackerField,
  type TrackerFieldType,
  type TrackerOptionColor,
  trackerFieldKey,
} from "@/lib/clientTrackers";

type Client = {
  clientId: string;
  companyName: string;
  category: string;
  state: string;
};
type Tracker = {
  _id: string;
  name: string;
  description?: string;
  financialYear?: string;
  fields: TrackerField[];
  clientIds: string[];
  clientColumns?: ClientTrackerDetailKey[];
  clientMembershipMode?: "snapshot" | "categorySync";
  entryCount: number;
  updatedAt: string;
};

const FIELD_TYPES: Array<{ id: TrackerFieldType; label: string }> = [
  { id: "toggle", label: "Yes / No toggle" },
  { id: "select", label: "Dropdown" },
  { id: "text", label: "Short text" },
  { id: "longText", label: "Long text" },
  { id: "multiSelect", label: "Multi-select" },
  { id: "tags", label: "Tags" },
  { id: "number", label: "Number" },
  { id: "percentage", label: "Percentage" },
  { id: "quantity", label: "Quantity" },
  { id: "currency", label: "Currency" },
  { id: "progress", label: "Progress" },
  { id: "date", label: "Date" },
];
const COLOR_SWATCH: Record<TrackerOptionColor, string> = {
  slate: "bg-slate-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
};
const LIVE_DATA_SOURCES: Array<{
  value: TrackerDataLinkSource;
  label: string;
}> = [
  { value: "purchaseInvoices", label: "Purchase invoice collection" },
  { value: "saleInvoices", label: "Sale invoice collection" },
  { value: "annualReturn", label: "Annual return" },
  { value: "purchaseUploads", label: "CPCB purchase uploads" },
  { value: "saleUploads", label: "CPCB sale uploads" },
];
const LIVE_DATA_DISPLAYS: Record<
  TrackerDataLinkSource,
  Array<{ value: TrackerDataLinkDisplay; label: string }>
> = {
  purchaseInvoices: [
    { value: "coverageStatus", label: "Coverage status" },
    { value: "monthsCovered", label: "Months covered" },
    { value: "requiredMonths", label: "Required months" },
    { value: "missingMonths", label: "Missing months" },
    { value: "yesNo", label: "Received / covered (legacy)" },
    { value: "count", label: "Number of records" },
    { value: "status", label: "Latest status" },
    { value: "latestDate", label: "Latest period end" },
  ],
  saleInvoices: [
    { value: "coverageStatus", label: "Coverage status" },
    { value: "monthsCovered", label: "Months covered" },
    { value: "requiredMonths", label: "Required months" },
    { value: "missingMonths", label: "Missing months" },
    { value: "yesNo", label: "Received / covered (legacy)" },
    { value: "count", label: "Number of records" },
    { value: "status", label: "Latest status" },
    { value: "latestDate", label: "Latest period end" },
  ],
  annualReturn: [
    { value: "yesNo", label: "Filed / verified" },
    { value: "status", label: "Current status" },
    { value: "latestDate", label: "Filing date" },
  ],
  purchaseUploads: [
    { value: "uploadStatus", label: "Upload status" },
    { value: "yesNo", label: "Has purchase upload" },
    { value: "quantity", label: "Total quantity (MT)" },
    { value: "invoiceCount", label: "Invoices uploaded" },
    { value: "cat1", label: "CAT-I quantity (MT)" },
    { value: "cat2", label: "CAT-II quantity (MT)" },
    { value: "cat3", label: "CAT-III quantity (MT)" },
    { value: "cat4", label: "CAT-IV quantity (MT)" },
    { value: "count", label: "Upload records" },
  ],
  saleUploads: [
    { value: "uploadStatus", label: "Upload status" },
    { value: "yesNo", label: "Has sale upload" },
    { value: "quantity", label: "Total quantity (MT)" },
    { value: "invoiceCount", label: "Invoices uploaded" },
    { value: "cat1", label: "CAT-I quantity (MT)" },
    { value: "cat2", label: "CAT-II quantity (MT)" },
    { value: "cat3", label: "CAT-III quantity (MT)" },
    { value: "cat4", label: "CAT-IV quantity (MT)" },
    { value: "count", label: "Upload records" },
  ],
  uploadedData: [
    { value: "yesNo", label: "Has uploaded data" },
    { value: "quantity", label: "Invoice quantity (MT)" },
    { value: "invoiceCount", label: "Number of invoices" },
    { value: "count", label: "Upload records" },
  ],
};
function liveFieldType(display: TrackerDataLinkDisplay): TrackerFieldType {
  if (display === "yesNo") return "toggle";
  if (display === "latestDate") return "date";
  if (
    [
      "count",
      "quantity",
      "invoiceCount",
      "cat1",
      "cat2",
      "cat3",
      "cat4",
      "requiredMonths",
    ].includes(display)
  )
    return "number";
  return "text";
}

function blankField(): TrackerField {
  return { key: "", label: "", type: "toggle" };
}
const TRACKER_STARTERS: Array<{
  id: string;
  label: string;
  fields: TrackerField[];
}> = [
  { id: "blank", label: "Blank tracker", fields: [] },
  {
    id: "follow-up",
    label: "Client follow-up worklist",
    fields: [
      { key: "assignee", label: "Assignee", type: "text" },
      { key: "dueDate", label: "Due date", type: "date" },
      {
        key: "priority",
        label: "Priority",
        type: "select",
        options: ["Low", "Medium", "High"],
        optionInput: "Low, Medium, High",
      },
      { key: "nextAction", label: "Next action", type: "text" },
    ],
  },
  {
    id: "cpcb",
    label: "CPCB invoice and upload follow-up",
    fields: [
      {
        key: "purchaseInvoiceCollection",
        label: "Purchase invoices received",
        type: "toggle",
        dataLink: { source: "purchaseInvoices", display: "yesNo" },
      },
      {
        key: "saleInvoiceCollection",
        label: "Sale invoices received",
        type: "toggle",
        dataLink: { source: "saleInvoices", display: "yesNo" },
      },
      {
        key: "purchaseUpload",
        label: "Purchase uploaded on CPCB",
        type: "toggle",
        dataLink: { source: "purchaseUploads", display: "yesNo" },
      },
      {
        key: "saleUpload",
        label: "Sale uploaded on CPCB",
        type: "toggle",
        dataLink: { source: "saleUploads", display: "yesNo" },
      },
      {
        key: "purchaseInvoiceCount",
        label: "Purchase invoices uploaded",
        type: "number",
        dataLink: { source: "purchaseUploads", display: "invoiceCount" },
      },
      {
        key: "saleInvoiceCount",
        label: "Sale invoices uploaded",
        type: "number",
        dataLink: { source: "saleUploads", display: "invoiceCount" },
      },
      {
        key: "purchaseMt",
        label: "Purchase plastic uploaded (MT)",
        type: "number",
        dataLink: { source: "purchaseUploads", display: "quantity" },
      },
      {
        key: "saleMt",
        label: "Sale plastic uploaded (MT)",
        type: "number",
        dataLink: { source: "saleUploads", display: "quantity" },
      },
      { key: "nextAction", label: "Next action", type: "text" },
      { key: "dueDate", label: "Due date", type: "date" },
    ],
  },
];

export default function ClientTrackersPage() {
  const { data: session } = useSession();
  const isAdmin =
    session?.user && (session.user as { role?: string }).role === "admin";
  const { data: rawClients } = useCache<Client[]>("/api/clients");
  const clients = Array.isArray(rawClients) ? rawClients : [];
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    financialYear: "",
    includeStatus: true,
    emailEnabled: false,
    fields: [] as TrackerField[],
    clientColumns: ["state"] as ClientTrackerDetailKey[],
    scope: "all" as "all" | "categories" | "selected",
    membershipMode: "snapshot" as "snapshot" | "categorySync",
    selectedCategories: [] as ClientTrackerCategory[],
    selected: [] as string[],
  });
  const [clientQuery, setClientQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [starterId, setStarterId] = useState("blank");

  const trackerUrl = showArchived
    ? "/api/client-trackers?status=archived"
    : "/api/client-trackers";
  const {
    data: trackerData,
    loading: trackerLoading,
    refetch: refetchTrackerData,
  } = useCache<Tracker[]>(trackerUrl);
  const displayedTrackers = Array.isArray(trackerData) ? trackerData : [];

  const matchingClients = useMemo(
    () =>
      clients.filter((client) => {
        const term = clientQuery.toLowerCase().trim();
        return (
          !term ||
          `${client.companyName} ${client.clientId} ${client.category}`
            .toLowerCase()
            .includes(term)
        );
      }),
    [clientQuery, clients],
  );
  const visibleTrackers = displayedTrackers.filter((tracker) =>
    `${tracker.name} ${tracker.description || ""}`
      .toLowerCase()
      .includes(query.toLowerCase().trim()),
  );
  const categoryClientCount = clients.filter((client) =>
    form.selectedCategories.includes(client.category as ClientTrackerCategory),
  ).length;

  const openCreate = () => {
    setForm({
      name: "",
      description: "",
      financialYear: "",
      includeStatus: true,
      emailEnabled: false,
      fields: [],
      clientColumns: ["state"],
      scope: "all",
      membershipMode: "snapshot",
      selectedCategories: [],
      selected: [],
    });
    setClientQuery("");
    setStarterId("blank");
    setCreateOpen(true);
  };
  const updateField = (index: number, patch: Partial<TrackerField>) =>
    setForm((current) => ({
      ...current,
      fields: current.fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field,
      ),
    }));
  const removeField = (index: number) =>
    setForm((current) => ({
      ...current,
      fields: current.fields.filter((_, fieldIndex) => fieldIndex !== index),
    }));
  const toggleClient = (clientId: string) =>
    setForm((current) => ({
      ...current,
      selected: current.selected.includes(clientId)
        ? current.selected.filter((id) => id !== clientId)
        : [...current.selected, clientId],
    }));
  const toggleCategory = (category: ClientTrackerCategory) =>
    setForm((current) => ({
      ...current,
      selectedCategories: current.selectedCategories.includes(category)
        ? current.selectedCategories.filter((item) => item !== category)
        : [...current.selectedCategories, category],
    }));
  const toggleClientColumn = (key: ClientTrackerDetailKey) =>
    setForm((current) => ({
      ...current,
      clientColumns: current.clientColumns.includes(key)
        ? current.clientColumns.filter((column) => column !== key)
        : [...current.clientColumns, key],
    }));
  const applyStarter = (id: string) => {
    setStarterId(id);
    const starter =
      TRACKER_STARTERS.find((item) => item.id === id) || TRACKER_STARTERS[0];
    setForm((current) => ({
      ...current,
      fields: starter.fields.map((field) => ({
        ...field,
        dataLink: field.dataLink ? { ...field.dataLink } : undefined,
        options: field.options ? [...field.options] : undefined,
      })),
      includeStatus: true,
    }));
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error("Give this tracker a name.");
      return;
    }
    if (
      form.fields.some((field) =>
        ["purchaseUploads", "saleUploads"].includes(
          field.dataLink?.source || "",
        ),
      ) &&
      !form.financialYear
    ) {
      toast.error("Choose a financial year for CPCB upload data.");
      return;
    }
    if (form.scope === "categories" && !form.selectedCategories.length) {
      toast.error("Choose at least one client category.");
      return;
    }
    if (form.scope === "selected" && !form.selected.length) {
      toast.error("Select at least one client.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/client-trackers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          clientMembershipMode:
            form.scope === "categories" ? form.membershipMode : "snapshot",
          clientIds: form.scope === "selected" ? form.selected : [],
          clientCategories:
            form.scope === "categories" ? form.selectedCategories : [],
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to create tracker.");
      invalidate("/api/client-trackers");
      refetchTrackerData();
      setCreateOpen(false);
      toast.success(
        `Tracker created for ${result.entryCount} client${result.entryCount === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to create tracker.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="client-trackers-page space-y-5">
      <PageHeader
        title="Client Trackers"
        description="Mark and monitor a task across every selected client."
      >
        <div className="flex gap-2">
          <button
            className="glass-pill"
            onClick={() => setShowArchived((current) => !current)}
          >
            <Archive className="h-4 w-4" />{" "}
            {showArchived ? "Active trackers" : "Archived"}
          </button>
          {isAdmin && (
            <button
              className="glass-pill glass-pill-active"
              onClick={openCreate}
            >
              <Plus className="h-4 w-4" /> Create tracker
            </button>
          )}
        </div>
      </PageHeader>

      <section className="tracker-premium-intro">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-blue-50 p-2 text-blue-600 dark:bg-blue-950/40">
              <ClipboardList className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold text-default">
                {showArchived
                  ? "Archived worklists"
                  : "Reusable task worklists"}
              </p>
              <p className="text-sm text-muted">
                {showArchived
                  ? "Restore a tracker or permanently delete it."
                  : "Each tracker keeps its own columns, client marks, and history."}
              </p>
            </div>
          </div>
          <label className="relative block sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search trackers"
              className="w-full rounded-xl border border-base bg-surface py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
        </div>
      </section>

      {trackerLoading ? (
        <LoadingSpinner />
      ) : visibleTrackers.length === 0 ? (
        <section className="tracker-premium-empty">
          <span className="tracker-premium-empty-icon">
            <ClipboardList className="h-7 w-7" />
          </span>
          <h2 className="font-semibold text-default">
            {showArchived ? "No archived trackers" : "No trackers yet"}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            {showArchived
              ? "Archived trackers will appear here until restored or permanently deleted."
              : "Create a worklist for collections, document follow-ups, registrations, or any client-wide task."}
          </p>
          {!showArchived && isAdmin && (
            <button
              className="tracker-premium-primary mt-5"
              onClick={openCreate}
            >
              Create your first tracker
            </button>
          )}
        </section>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleTrackers.map((tracker) => (
            <Link
              key={tracker._id}
              href={`/dashboard/client-trackers/${tracker._id}`}
              className="tracker-premium-card group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-default group-hover:text-blue-600">
                    {tracker.name}
                  </h2>
                  <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted">
                    {tracker.description || "No description"}
                  </p>
                </div>
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
              </div>
              <div className="tracker-premium-meta mt-5 text-xs">
                <span>
                  <Users className="mr-1 inline h-3.5 w-3.5" />
                  {tracker.entryCount} clients
                </span>
                {tracker.financialYear && (
                  <span>FY {tracker.financialYear}</span>
                )}
                <span>{tracker.fields.length} columns</span>
              </div>
              <p className="mt-4 text-xs text-faint">
                Updated{" "}
                {new Date(tracker.updatedAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </Link>
          ))}
        </div>
      )}

      <TrackerModal
        open={createOpen}
        onClose={() => !saving && setCreateOpen(false)}
        title="Create client tracker"
        subtitle="Set up a task worklist for your clients"
        icon={ClipboardList}
        size="2xl"
        fixedHeight
        footer={
          <div className="tracker-modal-footer flex flex-col-reverse justify-end gap-2 sm:flex-row sm:gap-3">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            >
              Cancel
            </button>
            <button
              form="create-client-tracker"
              disabled={saving}
              className="tracker-modal-primary rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Creating…" : "Create tracker"}
            </button>
          </div>
        }
      >
        <form
          id="create-client-tracker"
          onSubmit={save}
          className="tracker-modal-form space-y-5"
        >
          <section className="tracker-modal-section">
            <div className="mb-4">
              <p className="text-sm font-semibold text-default">
                Tracker details
              </p>
              <p className="mt-0.5 text-xs leading-5 text-muted">
                Give this worklist a clear purpose and decide who it starts
                with.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-sm font-medium text-default">
                  Start from a template
                </span>
                <select
                  value={starterId}
                  onChange={(event) => applyStarter(event.target.value)}
                  className="w-full rounded-xl border border-base bg-surface px-3 py-2.5 text-sm"
                >
                  {TRACKER_STARTERS.map((starter) => (
                    <option key={starter.id} value={starter.id}>
                      {starter.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-muted">
                  You can add, remove, or rename columns before creating the
                  tracker.
                </span>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-sm font-medium text-default">
                  Tracker name
                </span>
                <input
                  autoFocus
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="e.g. September invoice collection"
                  className="w-full rounded-xl border border-base bg-surface px-3 py-2.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-default">
                  Financial year{" "}
                  <span className="font-normal text-faint">
                    required for CPCB upload data
                  </span>
                </span>
                <select
                  value={form.financialYear}
                  onChange={(event) =>
                    setForm({ ...form, financialYear: event.target.value })
                  }
                  className="w-full rounded-xl border border-base bg-surface px-3 py-2.5 text-sm"
                >
                  {" "}
                  <option value="">Not tied to a FY</option>
                  {FINANCIAL_YEARS.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-default">
                  Client scope
                </span>
                <select
                  value={form.scope}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      scope: event.target.value as
                        | "all"
                        | "categories"
                        | "selected",
                    })
                  }
                  className="w-full rounded-xl border border-base bg-surface px-3 py-2.5 text-sm"
                >
                  <option value="all">
                    All current clients ({clients.length})
                  </option>
                  <option value="categories">Choose client categories</option>
                  <option value="selected">Choose specific clients</option>
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-sm font-medium text-default">
                  Description{" "}
                  <span className="font-normal text-faint">optional</span>
                </span>
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="What does this worklist help the team complete?"
                  rows={2}
                  className="w-full resize-none rounded-xl border border-base bg-surface px-3 py-2.5 text-sm"
                />
              </label>
            </div>
          </section>

          {form.scope === "categories" && (
            <section className="tracker-modal-section">
              <div className="mb-3">
                <p className="text-sm font-semibold text-default">
                  Client categories
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  The tracker will start with the {categoryClientCount} current
                  client{categoryClientCount === 1 ? "" : "s"} in these
                  categories.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {CLIENT_TRACKER_CATEGORIES.map((category) => {
                  const count = clients.filter(
                    (client) => client.category === category,
                  ).length;
                  return (
                    <label
                      key={category}
                      className="flex cursor-pointer items-center justify-between rounded-xl border border-base bg-surface px-3 py-2.5 text-sm hover:border-blue-300"
                    >
                      <span className="inline-flex items-center gap-2 text-default">
                        <input
                          type="checkbox"
                          checked={form.selectedCategories.includes(category)}
                          onChange={() => toggleCategory(category)}
                        />
                        {category}
                      </span>
                      <span className="text-xs text-faint">{count}</span>
                    </label>
                  );
                })}
              </div>
              <label className="mt-3 block">
                <span className="mb-1.5 block text-sm font-medium text-default">
                  Future clients in these categories
                </span>
                <select
                  value={form.membershipMode}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      membershipMode: event.target.value as
                        | "snapshot"
                        | "categorySync",
                    }))
                  }
                  className="w-full rounded-xl border border-base bg-surface px-3 py-2.5 text-sm"
                >
                  <option value="snapshot">Keep this fixed client list</option>
                  <option value="categorySync">
                    Automatically add and remove category clients
                  </option>
                </select>
                <span className="mt-1 block text-xs text-muted">
                  Automatic mode follows category changes whenever the tracker
                  is opened.
                </span>
              </label>
            </section>
          )}

          {form.scope === "selected" && (
            <section className="tracker-modal-section">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-default">
                    Selected clients{" "}
                    <span className="font-normal text-muted">
                      ({form.selected.length})
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Choose the clients that should receive this worklist.
                  </p>
                </div>
                <input
                  value={clientQuery}
                  onChange={(event) => setClientQuery(event.target.value)}
                  placeholder="Find a client"
                  className="w-36 rounded-lg border border-base bg-surface px-2.5 py-1.5 text-xs sm:w-44"
                />
              </div>
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl bg-black/[0.025] p-1.5 dark:bg-white/[0.035]">
                {matchingClients.map((client) => (
                  <label
                    key={client.clientId}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/70 dark:hover:bg-white/[0.06]"
                  >
                    <input
                      type="checkbox"
                      checked={form.selected.includes(client.clientId)}
                      onChange={() => toggleClient(client.clientId)}
                    />
                    <span className="min-w-0 text-sm text-default">
                      {client.companyName}{" "}
                      <span className="text-faint">· {client.clientId}</span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}

          <section className="tracker-modal-section space-y-4">
            <label className="flex items-center justify-between gap-4 rounded-xl bg-black/[0.025] p-3.5 dark:bg-white/[0.035]">
              <span>
                <span className="block text-sm font-semibold text-default">
                  Enable client email updates
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-muted">
                  Set up workflows, drafts, and reminders after the tracker is
                  created.
                </span>
              </span>
              <input
                type="checkbox"
                checked={form.emailEnabled}
                onChange={(event) =>
                  setForm({ ...form, emailEnabled: event.target.checked })
                }
              />
            </label>
            <div>
              <p className="text-sm font-semibold text-default">
                Client details in the worklist
              </p>
              <p className="mb-2.5 mt-0.5 text-xs text-muted">
                Client name and category are always shown.
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {CLIENT_TRACKER_DETAIL_OPTIONS.map((option) => (
                  <label
                    key={option.key}
                    className="inline-flex items-center gap-2 text-sm text-default"
                  >
                    <input
                      type="checkbox"
                      checked={form.clientColumns.includes(option.key)}
                      onChange={() => toggleClientColumn(option.key)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
          </section>
          <section className="tracker-modal-section">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-default">
                  Tracker columns
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Add manual or live client information from the start.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    fields: [...current.fields, blankField()],
                  }))
                }
                className="rounded-xl border border-base bg-white/70 px-3 py-2 text-sm font-semibold text-blue-600 shadow-sm dark:bg-white/[0.06]"
              >
                Add column
              </button>
            </div>
            <label className="mb-3 inline-flex items-center gap-2 rounded-xl bg-black/[0.025] px-3 py-2.5 text-sm text-default dark:bg-white/[0.035]">
              <input
                type="checkbox"
                checked={form.includeStatus}
                onChange={(event) =>
                  setForm({ ...form, includeStatus: event.target.checked })
                }
              />{" "}
              Include Status column
            </label>
            <div className="space-y-2">
              {form.fields.map((field, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-base bg-surface p-3"
                >
                  <div className="grid gap-2 sm:grid-cols-[1fr_170px_1fr_auto]">
                    <input
                      value={field.label}
                      onChange={(event) => {
                        const label = event.target.value;
                        updateField(index, {
                          label,
                          key: trackerFieldKey(label),
                        });
                      }}
                      placeholder="Column name"
                      className="rounded-lg border border-base bg-card px-2.5 py-2 text-sm"
                    />
                    <select
                      value={field.type}
                      onChange={(event) =>
                        updateField(index, {
                          type: event.target.value as TrackerFieldType,
                          options: ["select", "multiSelect", "tags"].includes(
                            event.target.value,
                          )
                            ? ["Option 1", "Option 2"]
                            : undefined,
                          optionInput: [
                            "select",
                            "multiSelect",
                            "tags",
                          ].includes(event.target.value)
                            ? "Option 1, Option 2"
                            : undefined,
                        })
                      }
                      className="rounded-lg border border-base bg-card px-2.5 py-2 text-sm"
                    >
                      {FIELD_TYPES.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                    {["select", "multiSelect", "tags"].includes(field.type) ? (
                      <input
                        value={
                          field.optionInput ?? (field.options || []).join(", ")
                        }
                        onChange={(event) =>
                          updateField(index, {
                            optionInput: event.target.value,
                            options: event.target.value
                              .split(",")
                              .map((option) => option.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="Options, separated by commas"
                        className="rounded-lg border border-base bg-card px-2.5 py-2 text-sm"
                      />
                    ) : (
                      <span className="hidden sm:block" />
                    )}
                    <button
                      type="button"
                      onClick={() => removeField(index)}
                      aria-label="Remove column"
                      className="rounded-lg px-2 text-sm text-rose-600 hover:bg-rose-50"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-base pt-2">
                    <span className="text-xs text-muted">Data source</span>
                    <select
                      value={
                        field.computed
                          ? "computed"
                          : field.dataLink
                            ? "live"
                            : "manual"
                      }
                      onChange={(event) => {
                        const source = event.target.value;
                        if (source === "manual") {
                          updateField(index, {
                            dataLink: undefined,
                            computed: undefined,
                          });
                          return;
                        }
                        if (source === "computed") {
                          const sourceFields = form.fields.filter(
                            (item) =>
                              item.key &&
                              item.key !== field.key &&
                              !item.computed,
                          );
                          updateField(index, {
                            dataLink: undefined,
                            computed: {
                              kind: "percentage",
                              primaryFieldKey: sourceFields[0]?.key || "",
                              secondaryFieldKey:
                                sourceFields[1]?.key ||
                                sourceFields[0]?.key ||
                                "",
                            },
                            type: "number",
                            options: undefined,
                            optionInput: undefined,
                          });
                          return;
                        }
                        updateField(index, { computed: undefined });
                      }}
                      className="rounded-lg border border-base bg-card px-2 py-1 text-xs"
                    >
                      <option value="manual">Manual value</option>
                      <option value="live">Live client data</option>
                      <option value="computed">Computed</option>
                    </select>
                    {!field.computed && (
                      <select
                        value={field.dataLink?.source || ""}
                        onChange={(event) => {
                          const source = event.target
                            .value as TrackerDataLinkSource;
                          const display = source
                            ? LIVE_DATA_DISPLAYS[source][0].value
                            : undefined;
                          updateField(index, {
                            dataLink:
                              source && display
                                ? { source, display }
                                : undefined,
                            computed: undefined,
                            ...(display
                              ? {
                                  type: liveFieldType(display),
                                  options: undefined,
                                  optionInput: undefined,
                                }
                              : {}),
                          });
                        }}
                        className="rounded-lg border border-base bg-card px-2 py-1 text-xs"
                      >
                        <option value="">Manual value</option>
                        {LIVE_DATA_SOURCES.map((source) => (
                          <option key={source.value} value={source.value}>
                            {source.label}
                          </option>
                        ))}
                      </select>
                    )}
                    {field.dataLink && (
                      <select
                        value={field.dataLink.display}
                        onChange={(event) => {
                          const display = event.target
                            .value as TrackerDataLinkDisplay;
                          updateField(index, {
                            dataLink: { ...field.dataLink!, display },
                            type: liveFieldType(display),
                            options: undefined,
                            optionInput: undefined,
                          });
                        }}
                        className="rounded-lg border border-base bg-card px-2 py-1 text-xs"
                      >
                        {LIVE_DATA_DISPLAYS[field.dataLink.source].map(
                          (display) => (
                            <option key={display.value} value={display.value}>
                              {display.label}
                            </option>
                          ),
                        )}
                      </select>
                    )}
                  </div>
                  {field.computed && (
                    <div className="mt-2 grid gap-2 rounded-lg border border-violet-200 bg-violet-50/50 p-3 sm:grid-cols-2 dark:border-violet-900/50 dark:bg-violet-950/20">
                      <span className="text-xs font-medium text-violet-800 sm:col-span-2 dark:text-violet-200">
                        COMPUTED · Coverage percentage
                      </span>
                      <label className="text-xs text-muted">
                        Covered value
                        <select
                          value={field.computed.primaryFieldKey || ""}
                          onChange={(event) =>
                            updateField(index, {
                              computed: {
                                ...field.computed!,
                                primaryFieldKey: event.target.value,
                              },
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-base bg-card px-2 py-1.5 text-sm text-default"
                        >
                          <option value="">Choose column</option>
                          {form.fields
                            .filter(
                              (item) =>
                                item.key &&
                                item.key !== field.key &&
                                !item.computed,
                            )
                            .map((item) => (
                              <option key={item.key} value={item.key}>
                                {item.label}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="text-xs text-muted">
                        Required value
                        <select
                          value={field.computed.secondaryFieldKey || ""}
                          onChange={(event) =>
                            updateField(index, {
                              computed: {
                                ...field.computed!,
                                secondaryFieldKey: event.target.value,
                              },
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-base bg-card px-2 py-1.5 text-sm text-default"
                        >
                          <option value="">Choose column</option>
                          {form.fields
                            .filter(
                              (item) =>
                                item.key &&
                                item.key !== field.key &&
                                !item.computed,
                            )
                            .map((item) => (
                              <option key={item.key} value={item.key}>
                                {item.label}
                              </option>
                            ))}
                        </select>
                      </label>
                      <p className="text-xs text-muted sm:col-span-2">
                        After creation, Configure lets you switch this to upload
                        difference, progress, or combined status.
                      </p>
                    </div>
                  )}
                  {field.type === "quantity" &&
                    !field.dataLink &&
                    !field.computed && (
                      <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                        Unit
                        <input
                          value={field.unit || ""}
                          onChange={(event) =>
                            updateField(index, { unit: event.target.value })
                          }
                          placeholder="MT"
                          className="w-24 rounded-lg border border-base bg-card px-2 py-1 text-xs text-default"
                        />
                      </label>
                    )}
                  {["select", "multiSelect", "tags"].includes(field.type) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(field.options || []).map((option, optionIndex) => {
                        const selectedColor =
                          field.optionColors?.[option] ||
                          TRACKER_OPTION_COLORS[
                            optionIndex % TRACKER_OPTION_COLORS.length
                          ];
                        return (
                          <div
                            key={option}
                            className="inline-flex items-center gap-2 rounded-lg bg-card px-2 py-1 text-xs text-muted"
                          >
                            <span>{option}</span>
                            <span
                              className="flex gap-1"
                              aria-label={`Color for ${option}`}
                            >
                              {TRACKER_OPTION_COLORS.map((color) => (
                                <button
                                  key={color}
                                  type="button"
                                  title={color}
                                  onClick={() =>
                                    updateField(index, {
                                      optionColors: {
                                        ...field.optionColors,
                                        [option]: color,
                                      },
                                    })
                                  }
                                  className={`h-4 w-4 rounded-full ${COLOR_SWATCH[color]} ${selectedColor === color ? "ring-2 ring-offset-1 ring-blue-500" : "opacity-45 hover:opacity-100"}`}
                                />
                              ))}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </form>
      </TrackerModal>
    </div>
  );
}

"use client";

import { readJsonResponse } from "@/lib/http-response";
import Link from "next/link";
import React, { useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Archive, CheckCircle2, ClipboardList, Plus, Search, Users } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import TrackerModal from "@/components/client-trackers/TrackerModal";
import CreateTrackerBuilder from "@/components/client-trackers/create/CreateTrackerBuilder";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useCache, invalidate } from "@/lib/useCache";
import type { ClientTrackerDetailKey, TrackerField } from "@/lib/clientTrackers";
import { emptyTrackerDraft, trackerCreateErrors, trackerCreatePayload, type TrackerBuilderClient } from "@/lib/tracker-create";

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

export default function ClientTrackersPage() {
  const { data: session } = useSession();
  const isAdmin =
    session?.user && (session.user as { role?: string }).role === "admin";
  const { data: rawClients, loading: loadingClients, error: clientLoadError } = useCache<TrackerBuilderClient[]>("/api/clients");
  const clients = useMemo(() => Array.isArray(rawClients) ? rawClients : [], [rawClients]);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState(emptyTrackerDraft);
  const [attempted, setAttempted] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const savingRef = useRef(false);
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

  const visibleTrackers = displayedTrackers.filter((tracker) =>
    `${tracker.name} ${tracker.description || ""}`
      .toLowerCase()
      .includes(query.toLowerCase().trim()),
  );

  const openCreate = () => {
    setForm(emptyTrackerDraft());
    setAttempted(false);
    setSubmissionError(null);
    setStarterId("blank");
    setCreateOpen(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    setAttempted(true);
    const errors = trackerCreateErrors(form);
    const firstError = Object.values(errors)[0];
    if (firstError) {
      toast.error(firstError);
      requestAnimationFrame(() => {
        const target = errors.name ? "#create-tracker-name" : errors.financialYear ? ".create-fy button"
          : form.scope === "selected" ? ".create-client-search input" : '.create-chips[aria-label="Client categories"] button';
        document.querySelector<HTMLElement>(target)?.focus();
      });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSubmissionError(null);
    try {
      const response = await fetch("/api/client-trackers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trackerCreatePayload(form)),
      });
      const result = await readJsonResponse(response);
      if (!response.ok) throw new Error(result.error || "Unable to create tracker.");
      invalidate("/api/client-trackers");
      refetchTrackerData();
      setCreateOpen(false);
      toast.success(
        `Tracker created for ${result.entryCount} client${result.entryCount === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create tracker.";
      setSubmissionError(message);
      toast.error(message);
    } finally {
      savingRef.current = false;
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
        subtitle="Build a reusable worklist for your clients"
        scrollable={false}
        className="tracker-create-modal"
        icon={ClipboardList}
        size="2xl"
        fixedHeight
        footer={
          <div className="tracker-modal-footer flex flex-col-reverse justify-end gap-2 sm:flex-row sm:gap-3">
            <button
              type="button"
              onClick={() => !saving && setCreateOpen(false)}
              disabled={saving}
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
        <CreateTrackerBuilder form={form} clients={clients} saving={saving}
          errors={attempted ? trackerCreateErrors(form) : {}} serverError={submissionError}
          loadingClients={loadingClients} clientLoadError={clientLoadError}
          starterId={starterId} onStarterChange={setStarterId}
          onChange={next => { setForm(next); setSubmissionError(null); }} onSubmit={save} />
      </TrackerModal>
    </div>
  );
}

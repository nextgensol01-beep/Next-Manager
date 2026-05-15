"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";
import { formatCurrency } from "@/lib/utils";
import {
  AlertTriangle, CheckCircle2, Clock, Mail, MailX,
  Pause, RefreshCw, Send, Shield, SkipForward, XCircle,
} from "lucide-react";
import type { Billing, Client } from "./types";

interface Recipient {
  clientId: string;
  clientName: string;
  email: string;
  financialYear: string;
  pendingAmount: number;
  totalAmount: number;
  totalPaid: number;
  status: "pending" | "sent" | "failed" | "skipped";
  error?: string;
  sentAt?: string;
}

interface BulkJob {
  _id: string;
  fy: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  recipients: Recipient[];
  totalCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  delayMs: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface BulkReminderModalProps {
  open: boolean;
  billings: Billing[];
  clients: Client[];
  fy: string;
  onClose: () => void;
}

const DELAY_OPTIONS = [
  { label: "6 sec (safe)", value: 6000 },
  { label: "10 sec (very safe)", value: 10000 },
  { label: "15 sec (conservative)", value: 15000 },
  { label: "30 sec (maximum safety)", value: 30000 },
];

function StatusIcon({ status }: { status: Recipient["status"] }) {
  if (status === "sent") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
  if (status === "failed") return <XCircle className="w-3.5 h-3.5 text-red-500" />;
  if (status === "skipped") return <SkipForward className="w-3.5 h-3.5 text-amber-500" />;
  return <Clock className="w-3.5 h-3.5 text-faint animate-pulse" />;
}

function JobStatusBadge({ status }: { status: BulkJob["status"] }) {
  const map = {
    pending:   { label: "Ready",     cls: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
    running:   { label: "Sending…",  cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
    completed: { label: "Done",      cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
    failed:    { label: "Failed",    cls: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
    cancelled: { label: "Cancelled", cls: "bg-surface text-faint" },
  };
  const m = map[status];
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>;
}

export default function BulkReminderModal({ open, billings, clients, fy, onClose }: BulkReminderModalProps) {
  const [step, setStep] = useState<"configure" | "running">("configure");
  const [delayMs, setDelayMs] = useState(6000);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [job, setJob] = useState<BulkJob | null>(null);
  const [creating, setCreating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Eligible billings: pending amount > 0 and client has at least one contact email
  const eligible = useMemo(() => {
    return billings
      .filter((b) => b.pendingAmount > 0)
      .map((b) => {
        const client = clients.find((c) => c.clientId === b.clientId);
        const contacts = client?.contacts || [];
        const emails = contacts.flatMap((ct) =>
          (ct.allEmails?.length ? ct.allEmails : ct.emails?.length ? ct.emails : ct.email ? [ct.email] : [])
        );
        const primaryEmail = emails[0] || "";
        return { billing: b, client, primaryEmail, hasEmail: Boolean(primaryEmail) };
      })
      .filter((item) => item.hasEmail);
  }, [billings, clients]);

  const noEmailBillings = useMemo(() => {
    return billings.filter((b) => {
      if (b.pendingAmount <= 0) return false;
      const client = clients.find((c) => c.clientId === b.clientId);
      const contacts = client?.contacts || [];
      const emails = contacts.flatMap((ct) =>
        (ct.allEmails?.length ? ct.allEmails : ct.emails?.length ? ct.emails : ct.email ? [ct.email] : [])
      );
      return !emails[0];
    });
  }, [billings, clients]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep("configure");
      setJob(null);
      setCreating(false);
      setSelected(new Set(eligible.map((e) => e.billing.clientId)));
    } else {
      stopPolling();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-select when eligible list changes
  useEffect(() => {
    setSelected(new Set(eligible.map((e) => e.billing.clientId)));
  }, [eligible]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollJob = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/email/bulk-reminder?jobId=${jobId}`);
      if (!res.ok) return;
      const data: BulkJob = await res.json();
      setJob(data);
      if (["completed", "failed", "cancelled"].includes(data.status)) {
        stopPolling();
      }
    } catch { /* ignore poll errors */ }
  }, [stopPolling]);

  const startPolling = useCallback((jobId: string) => {
    stopPolling();
    pollRef.current = setInterval(() => pollJob(jobId), 2000);
  }, [pollJob, stopPolling]);

  const handleCreate = async () => {
    const recipients = eligible
      .filter((e) => selected.has(e.billing.clientId))
      .map((e) => ({
        clientId: e.billing.clientId,
        clientName: e.client?.companyName || e.billing.clientId,
        email: e.primaryEmail,
        financialYear: e.billing.financialYear,
        pendingAmount: e.billing.pendingAmount,
        totalAmount: e.billing.totalAmount,
        totalPaid: e.billing.totalPaid,
      }));

    if (recipients.length === 0) {
      toast.error("Select at least one recipient");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/email/bulk-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fy, recipients, delayMs }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create job");
        return;
      }

      // Start the job immediately
      const startRes = await fetch("/api/email/bulk-reminder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: data.jobId, action: "start" }),
      });
      if (!startRes.ok) {
        toast.error("Job created but failed to start");
        return;
      }

      await pollJob(data.jobId);
      setStep("running");
      startPolling(data.jobId);
    } catch {
      toast.error("Network error");
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async () => {
    if (!job) return;
    try {
      await fetch("/api/email/bulk-reminder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job._id, action: "cancel" }),
      });
      await pollJob(job._id);
      stopPolling();
    } catch {
      toast.error("Failed to cancel");
    }
  };

  const toggleAll = () => {
    if (selected.size === eligible.length) setSelected(new Set());
    else setSelected(new Set(eligible.map((e) => e.billing.clientId)));
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const selectedCount = selected.size;
  const estimatedMinutes = Math.ceil((selectedCount * delayMs) / 60000);

  // ── Running view ──────────────────────────────────────────────────────────
  if (step === "running" && job) {
    const done = ["completed", "failed", "cancelled"].includes(job.status);
    const progress = job.totalCount > 0 ? Math.round(((job.sentCount + job.failedCount + job.skippedCount) / job.totalCount) * 100) : 0;

    return (
      <Modal open={open} onClose={done ? onClose : () => {}} title="Bulk Reminder — Sending" size="lg">
        <div className="space-y-4">
          {/* Status bar */}
          <div className="flex items-center justify-between">
            <JobStatusBadge status={job.status} />
            <span className="text-xs text-faint">
              {job.sentCount} sent · {job.failedCount} failed · {job.skippedCount} skipped
            </span>
          </div>

          {/* Progress bar */}
          <div>
            <div className="w-full bg-surface rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  job.status === "failed" ? "bg-red-500" :
                  job.status === "completed" ? "bg-emerald-500" : "bg-blue-500"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-faint mt-1">{progress}% — {job.sentCount + job.failedCount + job.skippedCount} of {job.totalCount}</p>
          </div>

          {/* Rate limit warning */}
          {job.status === "failed" && job.skippedCount > 0 && (
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">Gmail rate limit detected</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                  {job.skippedCount} remaining emails were skipped. Wait a few hours before retrying. Consider using a longer delay next time.
                </p>
              </div>
            </div>
          )}

          {/* Completion summary */}
          {job.status === "completed" && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 flex gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                All done — {job.sentCount} reminder{job.sentCount !== 1 ? "s" : ""} sent successfully.
                {job.failedCount > 0 && ` ${job.failedCount} failed.`}
              </p>
            </div>
          )}

          {/* Throttle reminder while running */}
          {job.status === "running" && (
            <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-3 py-2.5 flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Sending one email every {job.delayMs / 1000}s to stay within Gmail limits.
                <strong className="ml-1">Do not close this tab.</strong>
              </p>
            </div>
          )}

          {/* Recipient list */}
          <div className="max-h-72 overflow-y-auto rounded-xl border border-base divide-y divide-soft">
            {job.recipients.map((r, i) => (
              <div key={`${r.clientId}-${i}`} className="flex items-center gap-3 px-3 py-2.5">
                <StatusIcon status={r.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-default truncate">{r.clientName}</p>
                  <p className="text-xs text-faint truncate">{r.email}</p>
                  {r.error && <p className="text-xs text-red-500 mt-0.5 truncate" title={r.error}>{r.error}</p>}
                </div>
                <span className="text-xs font-semibold text-red-500 flex-shrink-0">{formatCurrency(r.pendingAmount)}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {job.status === "running" && (
              <button onClick={handleCancel} className="btn-secondary flex-1 justify-center gap-1.5">
                <Pause className="w-4 h-4" /> Stop sending
              </button>
            )}
            {done && (
              <button onClick={onClose} className="btn-primary flex-1 justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Close
              </button>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  // ── Configure view ────────────────────────────────────────────────────────
  return (
    <Modal open={open} onClose={onClose} title="Bulk Payment Reminders" size="lg">
      <div className="space-y-4">
        {/* Safety explainer */}
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 flex gap-2.5">
          <Shield className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">Gmail-safe bulk sending</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              Emails are sent one at a time with a configurable delay — not all at once. If Gmail signals a rate limit, the job stops automatically to protect your account.
            </p>
          </div>
        </div>

        {/* Delay picker */}
        <div>
          <label className="label">Delay between emails</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DELAY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDelayMs(opt.value)}
                className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors text-left ${
                  delayMs === opt.value
                    ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                    : "border-base text-muted hover:border-soft"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* No-email warning */}
        {noEmailBillings.length > 0 && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 flex gap-2">
            <MailX className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              <strong>{noEmailBillings.length} client{noEmailBillings.length !== 1 ? "s" : ""}</strong> with pending amount have no contact email and will be excluded:{" "}
              {noEmailBillings.slice(0, 3).map((b) => clients.find(c => c.clientId === b.clientId)?.companyName || b.clientId).join(", ")}
              {noEmailBillings.length > 3 && ` +${noEmailBillings.length - 3} more`}.
            </p>
          </div>
        )}

        {/* Recipient selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label !mb-0">
              Recipients — {selectedCount} of {eligible.length} selected
            </label>
            <button type="button" onClick={toggleAll} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
              {selected.size === eligible.length ? "Deselect all" : "Select all"}
            </button>
          </div>

          {eligible.length === 0 ? (
            <div className="rounded-xl border border-base bg-surface p-6 text-center">
              <Mail className="w-8 h-8 text-faint mx-auto mb-2" />
              <p className="text-sm text-faint">No pending billings with contact emails found for FY {fy}.</p>
            </div>
          ) : (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-base divide-y divide-soft">
              {eligible.map((item) => {
                const isSelected = selected.has(item.billing.clientId);
                return (
                  <label
                    key={item.billing.clientId}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${isSelected ? "bg-brand-50/50 dark:bg-brand-900/10" : "hover:bg-surface"}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(item.billing.clientId)}
                      className="rounded border-base"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-default truncate">{item.client?.companyName || item.billing.clientId}</p>
                      <p className="text-xs text-faint truncate">{item.primaryEmail}</p>
                    </div>
                    <span className="text-xs font-semibold text-red-500 flex-shrink-0">{formatCurrency(item.billing.pendingAmount)}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Time estimate */}
        {selectedCount > 0 && (
          <div className="rounded-xl border border-base bg-surface px-4 py-3 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-faint">
              <Clock className="w-4 h-4" />
              <span>Estimated time</span>
            </div>
            <span className="font-semibold text-default">
              ~{estimatedMinutes < 1 ? "<1" : estimatedMinutes} min for {selectedCount} email{selectedCount !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || selectedCount === 0}
            className="btn-primary flex-1 justify-center gap-1.5"
          >
            {creating
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Starting…</>
              : <><Send className="w-4 h-4" /> Send {selectedCount} reminder{selectedCount !== 1 ? "s" : ""}</>
            }
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

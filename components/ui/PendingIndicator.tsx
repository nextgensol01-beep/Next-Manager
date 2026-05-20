"use client";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import type { PendingStatus } from "@/lib/usePendingList";

interface PendingIndicatorProps {
  status?: PendingStatus;
  /** For table rows: applies opacity + border styling to a <tr>. Default: false (inline chip mode). */
  asRowClass?: false;
}

/**
 * Inline chip shown next to a record while it's being saved/confirmed/errored.
 * Disappears automatically after "confirmed" fades out.
 */
export function PendingChip({ status }: { status?: PendingStatus }) {
  if (!status) return null;

  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full animate-pulse whitespace-nowrap">
        <Loader2 className="w-2.5 h-2.5 animate-spin" />
        Saving…
      </span>
    );
  }

  if (status === "confirmed") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full whitespace-nowrap">
        <CheckCircle2 className="w-2.5 h-2.5" />
        Saved
      </span>
    );
  }

  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full whitespace-nowrap">
        <AlertCircle className="w-2.5 h-2.5" />
        Failed
      </span>
    );
  }

  return null;
}

/**
 * Returns Tailwind classes to apply to a row/card based on its pending status.
 * Use: className={`your-base-classes ${pendingRowClass(item._status)}`}
 */
export function pendingRowClass(status?: PendingStatus): string {
  if (status === "pending") return "opacity-60 pointer-events-none";
  if (status === "error")   return "bg-red-50 dark:bg-red-900/10 ring-1 ring-red-300 dark:ring-red-800";
  if (status === "confirmed") return "bg-emerald-50/40 dark:bg-emerald-900/10";
  return "";
}

/**
 * Left-border accent shown on card-style items.
 * Place as the first child of a relative-positioned container.
 */
export function PendingBorder({ status }: { status?: PendingStatus }) {
  if (!status) return null;
  const color =
    status === "pending"   ? "bg-amber-400"
    : status === "confirmed" ? "bg-emerald-400"
    : status === "error"     ? "bg-red-400"
    : null;
  if (!color) return null;
  return <span className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-full ${color}`} />;
}

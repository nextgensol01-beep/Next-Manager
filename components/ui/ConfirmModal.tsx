"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  /** Extra detail shown in a muted note below the description (e.g. side-effect warnings) */
  note?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Visual intent of the confirm button */
  variant?: "danger" | "warning";
  loading?: boolean;
  /**
   * When set, the confirm button stays disabled until the user types this
   * exact string into an input. Use for irreversible destructive actions.
   * The input placeholder will read: Type "…" to confirm
   */
  confirmText?: string;
}

export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  note,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  loading = false,
  confirmText,
}: ConfirmModalProps) {
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typedValue, setTypedValue] = useState("");

  useEffect(() => {
    if (open) {
      setRendered(true);
      setTypedValue("");
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setRendered(false), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!rendered) return null;

  const isLoading = loading || busy;
  const typedOk = !confirmText || typedValue === confirmText;
  const confirmDisabled = isLoading || !typedOk;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  const iconBg =
    variant === "danger"
      ? "bg-red-50 dark:bg-red-900/25 text-red-600 dark:text-red-400"
      : "bg-amber-50 dark:bg-amber-900/25 text-amber-600 dark:text-amber-400";

  const confirmBtn =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700 active:bg-red-800 text-white dark:bg-red-700 dark:hover:bg-red-600"
      : "bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white dark:bg-amber-700 dark:hover:bg-amber-600";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backdropFilter: "blur(4px)",
        backgroundColor: visible ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0)",
        transition: "background-color 0.2s",
      }}
      onClick={(e) => e.target === e.currentTarget && !isLoading && onClose()}
    >
      <div
        className="w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--color-card)",
          borderColor: "var(--color-border)",
          opacity: visible ? 1 : 0,
          transform: visible
            ? "scale(1) translateY(0)"
            : "scale(0.93) translateY(14px)",
          transition:
            "opacity 0.22s cubic-bezier(0.34,1.4,0.64,1), transform 0.22s cubic-bezier(0.34,1.4,0.64,1)",
        }}
      >
        {/* Body */}
        <div className="p-5">
          <div className="flex gap-4">
            {/* Icon */}
            <div
              className={cn(
                "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
                iconBg
              )}
            >
              {variant === "danger" ? (
                <Trash2 className="w-4.5 h-4.5" />
              ) : (
                <AlertTriangle className="w-4.5 h-4.5" />
              )}
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-default text-sm leading-snug">
                {title}
              </h3>
              {description && (
                <p className="text-sm text-muted mt-1 leading-relaxed">
                  {description}
                </p>
              )}
              {note && (
                <p className="text-xs text-faint mt-2 leading-relaxed border-l-2 border-base pl-2">
                  {note}
                </p>
              )}
              {confirmText && (
                <div className="mt-3">
                  <p className="text-xs text-muted mb-1.5">
                    Type <span className="font-mono font-semibold text-default">&quot;{confirmText}&quot;</span> to confirm
                  </p>
                  <input
                    type="text"
                    autoComplete="off"
                    value={typedValue}
                    onChange={(e) => setTypedValue(e.target.value)}
                    placeholder={`Type "${confirmText}" to confirm`}
                    className="w-full text-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-default px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400 transition font-mono"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirmDisabled}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              confirmBtn
            )}
          >
            {isLoading ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                {confirmLabel}…
              </>
            ) : (
              confirmLabel
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium border border-base bg-card text-default hover:bg-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

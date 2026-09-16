"use client";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  /** When true the built-in header is hidden; caller renders its own sticky header inside children */
  hideHeader?: boolean;
  className?: string;
  /** Override the modal body background color (e.g. "var(--color-card)") */
  bgColor?: string;
  /** Optional backdrop tuning for premium expanded sheets */
  backdropFilter?: string;
  backdropColor?: string;
  /** Opt in to the Reports workspace's fluid spring motion. */
  fluidMotion?: boolean;
}

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  size = "md",
  hideHeader = false,
  className,
  bgColor,
  backdropFilter,
  backdropColor,
  fluidMotion = false,
}: ModalProps) {
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (open) {
      setRendered(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setRendered(false), fluidMotion && !reduceMotion ? 360 : 220);
      return () => clearTimeout(t);
    }
  }, [fluidMotion, open, reduceMotion]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus trap
  useEffect(() => {
    if (!open || !modalRef.current) return;
    const el = modalRef.current;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const getFocusable = () => Array.from(el.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    )).filter((entry) => entry.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => (getFocusable()[0] || el).focus());
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = getFocusable();
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) { e.preventDefault(); el.focus(); return; }
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", trap);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", trap);
      previousFocusRef.current?.focus();
    };
  }, [open, rendered]);

  if (!rendered) return null;

  return createPortal(
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      initial={false}
      animate={{ backgroundColor: visible ? (backdropColor ?? "rgba(0,0,0,0.55)") : "rgba(0,0,0,0)" }}
      transition={fluidMotion ? { duration: reduceMotion ? 0.01 : 0.2, ease: [0.32, 0.72, 0, 1] } : { duration: 0.22 }}
      style={{ backdropFilter: backdropFilter ?? "blur(6px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={hideHeader ? undefined : titleId}
        aria-label={hideHeader ? title : undefined}
        tabIndex={-1}
        className={cn(
          cn("modal-panel w-full max-h-[90vh] rounded-2xl shadow-2xl border overflow-hidden flex flex-col", hideHeader && "h-full", className),
          size === "2xl" && "max-w-[1100px]",
          size === "xl" && "max-w-3xl",
          size === "lg" && "max-w-2xl",
          size === "sm" && "max-w-sm",
          size === "md" && "max-w-lg"
        )}
        initial={false}
        animate={{
          opacity: visible ? 1 : 0,
          scale: visible ? 1 : (fluidMotion ? 0.975 : 0.94),
          y: visible ? 0 : (fluidMotion ? 20 : 16),
        }}
        transition={fluidMotion
          ? (reduceMotion ? { duration: 0.01 } : { type: "spring", stiffness: 360, damping: 32, mass: 0.82 })
          : { duration: 0.24, ease: [0.34, 1.4, 0.64, 1] }}
        style={{ backgroundColor: bgColor ?? "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        {/* Built-in header — only rendered when hideHeader is false */}
        {!hideHeader && (
          <div
            className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
            style={{
              backgroundColor: "var(--color-card)",
              borderColor: "var(--color-border-soft)",
            }}
          >
            <div>
              <h3 id={titleId} className="font-semibold text-default leading-tight">{title}</h3>
              {subtitle && (
                <p className="text-xs mt-0.5 font-mono" style={{ color: "var(--color-text-faint)" }}>{subtitle}</p>
              )}
            </div>
            <button
              type="button"
              aria-label={`Close ${title}`}
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90 flex-shrink-0"
              style={{ backgroundColor: "var(--color-surface)", color: "var(--color-text-faint)" }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Content area */}
        <div className={cn(hideHeader ? "flex-1 flex flex-col min-h-0" : "overflow-y-auto flex-1 p-5")}>
          {children}
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

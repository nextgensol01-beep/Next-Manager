"use client";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
}: ModalProps) {
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setRendered(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setRendered(false), 220);
      return () => clearTimeout(t);
    }
  }, [open]);

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
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", trap);
    return () => window.removeEventListener("keydown", trap);
  }, [open, rendered]);

  if (!rendered) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      style={{
        backdropFilter: backdropFilter ?? "blur(6px)",
        backgroundColor: visible ? (backdropColor ?? "rgba(0,0,0,0.55)") : "rgba(0,0,0,0)",
        transition: "background-color 0.22s ease",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={modalRef}
        className={cn(
          cn("w-full max-h-[90vh] rounded-2xl shadow-2xl border overflow-hidden flex flex-col", hideHeader && "h-full", className),
          size === "2xl" && "max-w-[1100px]",
          size === "xl" && "max-w-3xl",
          size === "lg" && "max-w-2xl",
          size === "sm" && "max-w-sm",
          size === "md" && "max-w-lg"
        )}
        style={{
          backgroundColor: bgColor ?? "var(--color-surface)",
          borderColor: "var(--color-border)",
          opacity: visible ? 1 : 0,
          transform: visible ? "scale(1) translateY(0)" : "scale(0.94) translateY(16px)",
          transition: "opacity 0.24s cubic-bezier(0.34,1.4,0.64,1), transform 0.24s cubic-bezier(0.34,1.4,0.64,1)",
        }}
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
              <h3 className="font-semibold text-default leading-tight">{title}</h3>
              {subtitle && (
                <p className="text-xs mt-0.5 font-mono" style={{ color: "var(--color-text-faint)" }}>{subtitle}</p>
              )}
            </div>
            <button
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
      </div>
    </div>,
    document.body
  );
}

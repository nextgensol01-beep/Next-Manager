"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { ClipboardList, X } from "lucide-react";
import Modal from "@/components/ui/Modal";

type TrackerModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ComponentType<{ className?: string }>;
  children: ReactNode;
  /** Persistent actions rendered outside the scrolling sheet content. */
  footer?: ReactNode;
  /** Set false when a child owns the single scrolling region for a complex sheet. */
  scrollable?: boolean;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  fixedHeight?: boolean;
  className?: string;
  compactHeader?: boolean;
  inert?: boolean;
  /** Local sheets may tune their backdrop; all existing callers retain Modal defaults. */
  backdropColor?: string;
  backdropFilter?: string;
};

/** A calm, focused sheet used throughout the client-tracker workspace. */
export default function TrackerModal({ open, onClose, title, subtitle, icon: Icon = ClipboardList, children, footer, size = "xl", fixedHeight = false, scrollable = true, className, compactHeader = false, inert = false, backdropColor, backdropFilter }: TrackerModalProps) {
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open || !frame) return;
    const panel = frame.closest<HTMLElement>(".tracker-modal"), overlay = panel?.parentElement;
    if (!panel || !overlay) return;
    const viewport = window.visualViewport;
    const media = matchMedia("(max-width: 1023px), (max-height: 600px)");
    let scheduled = 0;
    const update = () => {
      scheduled = 0;
      if (!media.matches) {
        delete overlay.dataset.trackerOverlay;
        panel.classList.remove("is-short-viewport");
        for (const name of ["--tracker-visual-height", "--tracker-visual-top"]) overlay.style.removeProperty(name);
        return;
      }
      overlay.dataset.trackerOverlay = "true";
      const height = Math.round(viewport?.height || window.innerHeight);
      panel.classList.toggle("is-short-viewport", height <= 600);
      overlay.style.setProperty("--tracker-visual-height", `${height}px`);
      overlay.style.setProperty("--tracker-visual-top", `${Math.round(viewport?.offsetTop || 0)}px`);
    };
    const schedule = () => { if (!scheduled) scheduled = requestAnimationFrame(update); };
    // Only this tracker sheet opts in; global modal geometry is untouched.
    update(); viewport?.addEventListener("resize", schedule); viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(scheduled);
      viewport?.removeEventListener("resize", schedule); viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      // Keep the last geometry through the sheet's exit animation. These
      // properties live only on its own portal and disappear with that node.
    };
  }, [open, frame]);
  return <Modal open={open} onClose={onClose} title={title} size={size} hideHeader fluidMotion inert={inert} backdropColor={backdropColor} backdropFilter={backdropFilter}
    className={`tracker-modal ${fixedHeight ? "is-complex-sheet" : ""} ${compactHeader ? "is-header-compact" : ""} ${className || ""} mt-auto ${fixedHeight ? "h-[94dvh] sm:h-[90vh]" : "h-auto"} max-h-[94dvh] rounded-b-none rounded-t-[28px] border-white/70 shadow-[0_34px_110px_rgba(0,0,0,0.28)] backdrop-blur-2xl sm:mt-0 sm:max-h-[90vh] sm:rounded-[28px] dark:border-white/[0.12] dark:shadow-[0_38px_120px_rgba(0,0,0,0.74)]`}
    bgColor="rgba(var(--color-card-rgb),0.92)">
    <div ref={setFrame} className="tracker-modal-frame flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
      <div className="tracker-modal-header flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.35] bg-white/20 px-4 py-4 backdrop-blur-2xl sm:gap-4 sm:px-6 sm:py-5 dark:border-white/[0.10] dark:bg-white/[0.04]">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-brand-500/10 text-brand-600 shadow-sm sm:h-11 sm:w-11"><Icon className="h-5 w-5" /></div>
          <div className="min-w-0"><h3 className="text-[17px] font-semibold tracking-[-0.01em] text-default">{title}</h3>{subtitle && <p className="mt-0.5 truncate text-[13px] leading-5 text-muted">{subtitle}</p>}</div>
        </div>
        <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/60 bg-white/[0.55] text-muted shadow-sm backdrop-blur-xl transition duration-200 hover:bg-white/80 hover:text-default focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/15 active:scale-[0.96] dark:border-white/[0.12] dark:bg-white/[0.07] dark:hover:bg-white/[0.12]" aria-label={`Close ${title}`}><X className="h-4 w-4" /></button>
      </div>
      <div className={`tracker-modal-body min-h-0 flex-1 ${scrollable ? "overflow-y-auto" : "overflow-hidden"} bg-[#eef0f4]/[0.74] backdrop-blur-2xl dark:bg-[#0b0b0d]/[0.92]`}>{children}</div>
      {footer}
    </div>
  </Modal>;
}

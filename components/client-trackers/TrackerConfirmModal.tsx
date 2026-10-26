"use client";

import { useEffect, useState } from "react";
import ConfirmModal, { type ConfirmModalProps } from "@/components/ui/ConfirmModal";

/** Keep the established confirmation material and confirmation semantics.
 * Focus/viewport behavior is opted into only by Client Tracker consumers. */
export default function TrackerConfirmModal(props: ConfirmModalProps) {
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!props.open || !panel) return;
    const overlay = panel.parentElement;
    if (!overlay) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.inert = false;
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.setAttribute("aria-label", props.title); panel.tabIndex = -1;
    const controls = () => [...panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[href],[tabindex="0"]')].filter(node => node.getClientRects().length && !node.closest("[inert]"));
    const focus = requestAnimationFrame(() => (controls()[0] || panel).focus({ preventScroll: true }));
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const nodes = controls(), first = nodes[0], last = nodes.at(-1);
      if (!first) { event.preventDefault(); panel.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    const viewport = window.visualViewport;
    let frame = 0;
    const resize = () => {
      frame = 0;
      if (!matchMedia("(max-width: 1023px), (max-height: 600px)").matches) {
        delete overlay.dataset.trackerConfirmationOverlay;
        overlay.style.removeProperty("--tracker-confirm-height"); overlay.style.removeProperty("--tracker-confirm-top");
        return;
      }
      overlay.dataset.trackerConfirmationOverlay = "true";
      overlay.style.setProperty("--tracker-confirm-height", `${viewport?.height || innerHeight}px`);
      overlay.style.setProperty("--tracker-confirm-top", `${viewport?.offsetTop || 0}px`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(resize); };
    resize(); window.addEventListener("keydown", trap); window.addEventListener("resize", schedule);
    viewport?.addEventListener("resize", schedule); viewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(focus); cancelAnimationFrame(frame);
      // A containing tracker sheet owns an existing lock. Never reinstate that
      // lock after the parent has already unmounted during navigation.
      if (overflow !== "hidden") document.body.style.overflow = overflow;
      panel.inert = true;
      window.removeEventListener("keydown", trap); window.removeEventListener("resize", schedule);
      viewport?.removeEventListener("resize", schedule); viewport?.removeEventListener("scroll", schedule);
      // The parent sheet removes its inert state in this same React commit.
      requestAnimationFrame(() => { if (previous?.isConnected) previous.focus({ preventScroll: true }); });
    };
  }, [props.open, panel, props.title]);
  return <ConfirmModal {...props} className={`tracker-confirmation-modal ${props.className || ""}`} panelRef={setPanel} />;
}

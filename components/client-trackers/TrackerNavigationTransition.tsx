"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { createContext, useContext, useLayoutEffect, useMemo, useRef } from "react";
import type { ClientTrackerDetailKey, TrackerField } from "@/lib/clientTrackers";

const LIST = "/dashboard/client-trackers";
const easing = "cubic-bezier(.22,.72,.18,1)";
type Direction = "open" | "close";
type Phase = "navigating" | "waiting-for-destination" | "morphing" | "settling";
type ListState = { query: string; showArchived: boolean; scrollTop: number; windowY: number };
export type TrackerNavigationSeed = {
  id: string; name: string; description?: string; financialYear?: string; entryCount?: number;
  fields?: TrackerField[]; clientColumns?: ClientTrackerDetailKey[];
};
type Font = Pick<CSSStyleDeclaration, "fontFamily" | "fontSize" | "fontWeight" | "lineHeight" | "letterSpacing" | "color">;
type TextSnapshot = { rect: DOMRect; text: string; font: Font };
type Snapshot = { rect: DOMRect; title: TextSnapshot; description: TextSnapshot;
  surface: Pick<CSSStyleDeclaration, "background" | "border" | "borderRadius" | "boxShadow"> };
type Journey = {
  id: string; direction: Direction; expected: string; phase: Phase; source: Snapshot | null; spatial: boolean;
  sourceNode: HTMLElement | null; targetNode?: HTMLElement; surface: HTMLDivElement | null;
  ghost: HTMLDivElement | null; animations: Animation[]; deadline: number; timeout: number;
  observer?: MutationObserver; frame?: number; scrollTop?: number; windowY?: number;
};
type Coordinator = {
  begin: (id: string, direction: Direction, node: HTMLElement, seed?: TrackerNavigationSeed) => boolean;
  saveList: (state: Omit<ListState, "scrollTop" | "windowY">) => void;
  restoredList: () => ListState | null;
  listReady: () => void; workspaceReady: () => void;
  identity: (id: string) => TrackerNavigationSeed | null;
  retainLoadingSurface: (node: HTMLElement) => void;
};
const Context = createContext<Coordinator | null>(null);
export const useTrackerNavigation = () => useContext(Context);
function scrollArea() { return document.getElementById("dashboard-scroll-area"); }
function viewport() {
  const main = scrollArea()?.getBoundingClientRect();
  return { top: Math.max(0, main?.top ?? 0), left: Math.max(0, main?.left ?? 0),
    right: Math.min(innerWidth, main?.right ?? innerWidth), bottom: Math.min(innerHeight, main?.bottom ?? innerHeight) };
}
function visible(rect: DOMRect) {
  const view = viewport();
  return rect.width > 0 && rect.height > 0 && rect.bottom > view.top && rect.top < view.bottom && rect.right > view.left && rect.left < view.right;
}
function snapshot(node: HTMLElement | null): Snapshot | null {
  const title = node?.querySelector<HTMLElement>("[data-tracker-title]");
  const description = node?.querySelector<HTMLElement>("[data-tracker-description]");
  if (!node || !title || !description || !visible(title.getBoundingClientRect())) return null;
  const capture = (element: HTMLElement): TextSnapshot => {
    const font = getComputedStyle(element);
    return { rect: element.getBoundingClientRect(), text: element.textContent || "", font: {
      fontFamily: font.fontFamily, fontSize: font.fontSize, fontWeight: font.fontWeight,
      lineHeight: font.lineHeight, letterSpacing: font.letterSpacing, color: font.color } };
  };
  const material = getComputedStyle(node);
  return { rect: node.getBoundingClientRect(), title: capture(title), description: capture(description),
    surface: { background: material.background, border: material.border, borderRadius: material.borderRadius, boxShadow: material.boxShadow } };
}
function layer(className: string, top?: number) {
  const view = viewport(), element = document.createElement("div");
  element.className = className;
  element.setAttribute("aria-hidden", "true"); element.inert = true;
  element.style.clipPath = "inset(" + (top ?? view.top) + "px " + (innerWidth - view.right) + "px " + (innerHeight - view.bottom) + "px " + view.left + "px)";
  return element;
}
/** A bounded, inert picture of the outgoing content; never a second live route.
 * Offscreen table cells are omitted before cloning, while spacer rows retain geometry. */
function retainSurface(page: HTMLElement, id?: string, regionsOnly = false) {
  const bounds = page.getBoundingClientRect(), view = viewport();
  const rows = Array.from(page.querySelectorAll<HTMLElement>("tbody tr"));
  const rowBounds = rows.map(row => row.getBoundingClientRect());
  const excluded = new Map<Node, number>();
  rows.forEach((row, index) => { if (!visible(rowBounds[index])) excluded.set(row, rowBounds[index].height); });
  const headers = Array.from(page.querySelectorAll<HTMLElement>("thead th")).map(node => node.getBoundingClientRect().width);
  const copy = (node: Node): Node => {
    const clone = node.cloneNode(false);
    if (excluded.has(node)) { (clone as HTMLElement).style.height = excluded.get(node) + "px"; return clone; }
    node.childNodes.forEach(child => clone.appendChild(copy(child)));
    if (node instanceof HTMLInputElement && clone instanceof HTMLInputElement) { clone.value = node.value; clone.checked = node.checked; }
    if (node instanceof HTMLSelectElement && clone instanceof HTMLSelectElement) clone.selectedIndex = node.selectedIndex;
    if (node instanceof HTMLTextAreaElement && clone instanceof HTMLTextAreaElement) clone.value = node.value;
    return clone;
  };
  const clone = copy(page) as HTMLElement;
  const selected = Array.from(clone.querySelectorAll<HTMLElement>("[data-tracker-transition-id], [data-tracker-detail-heading]"))
    .find(node => node.dataset.trackerTransitionId === id || node.dataset.trackerDetailHeading === id);
  selected?.querySelectorAll("[data-tracker-title], [data-tracker-description]").forEach(node => node.setAttribute("data-tracker-snapshot-text", ""));
  clone.querySelectorAll("thead th").forEach((node, index) => { (node as HTMLElement).style.width = headers[index] + "px"; });
  [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))].forEach(node => {
    node.removeAttribute("id"); node.removeAttribute("autofocus");
    Array.from(node.attributes).forEach(attr => { if (attr.name.startsWith("data-tracker-") && attr.name !== "data-tracker-snapshot-text") node.removeAttribute(attr.name); });
  });
  const firstRegion = page.querySelector<HTMLElement>("section");
  const top = regionsOnly ? Math.max(view.top, firstRegion?.getBoundingClientRect().top ?? view.top) : view.top;
  const surface = layer(regionsOnly ? "tracker-loading-resolve-surface" : "tracker-navigation-surface", top);
  const background = document.createElement("div");
  Object.assign(background.style, { position: "absolute", left: view.left + "px", top: top + "px", width: (view.right - view.left) + "px", height: (view.bottom - top) + "px", background: "var(--color-surface)" });
  Object.assign(clone.style, { position: "absolute", margin: "0", left: bounds.x + "px", top: bounds.y + "px", width: bounds.width + "px" });
  surface.append(background, clone); document.body.append(surface);
  return surface;
}

export function TrackerNavigationTransitionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(), root = useRef<HTMLDivElement>(null), journey = useRef<Journey | null>(null);
  const list = useRef<ListState | null>(null), restore = useRef(false), selected = useRef<TrackerNavigationSeed | null>(null);
  const pendingFocus = useRef<string | null>(null), previousPath = useRef(pathname), currentPath = useRef(pathname);
  const resolves = useRef(new Map<HTMLDivElement, Animation | null>());
  const mounted = useRef(true);
  currentPath.current = pathname;

  const coordinator = useMemo(() => {
    function find(id: string, direction: Direction) {
      const attr = direction === "open" ? "data-tracker-detail-heading" : "data-tracker-transition-id";
      return Array.from(root.current?.querySelectorAll<HTMLElement>("[" + attr + "]") || []).find(node => node.getAttribute(attr) === id) || null;
    }
    function phase(active: Journey, value: Phase) {
      active.phase = value; root.current?.setAttribute("data-tracker-phase", value);
    }
    function clearResolves() { resolves.current.forEach((animation, node) => { animation?.cancel(); node.remove(); }); resolves.current.clear(); }
    function focusDestination(active: Journey) {
      if (currentPath.current !== active.expected) return;
      const target = find(active.id, active.direction);
      if (active.direction === "open" && (!target || target.hasAttribute("data-tracker-loading-identity"))) { pendingFocus.current = active.id; return; }
      const node = active.direction === "open" ? target?.querySelector<HTMLElement>("[data-tracker-title]") : target || root.current?.querySelector<HTMLElement>("h1");
      if (node) { if (node.tagName === "H1") node.tabIndex = -1; node.focus({ preventScroll: true }); }
    }
    function cleanup(focus = false) {
      const active = journey.current;
      if (!active) return;
      journey.current = null;
      clearTimeout(active.timeout); clearTimeout(active.deadline); active.observer?.disconnect();
      if (active.frame) cancelAnimationFrame(active.frame);
      // One synchronous ownership exchange: reveal semantic text before discarding ghosts.
      root.current?.removeAttribute("data-tracker-handoff");
      active.targetNode?.removeAttribute("data-tracker-selected"); active.sourceNode?.removeAttribute("data-tracker-selected");
      active.ghost?.remove(); active.surface?.remove();
      active.animations.forEach(animation => animation.cancel());
      root.current?.removeAttribute("data-tracker-direction"); root.current?.removeAttribute("data-tracker-phase");
      if (focus) focusDestination(active);
    }
    function restoreScroll() {
      if (!restore.current || !list.current) return;
      const main = scrollArea(); if (main) main.scrollTop = list.current.scrollTop;
      window.scrollTo({ top: list.current.windowY, behavior: "instant" });
    }
    function animate(active: Journey, element: Element, frames: Keyframe[], duration: number) {
      const animation = element.animate(frames, { duration, easing, fill: "both" }); active.animations.push(animation); return animation;
    }
    function ghost(from: Snapshot) {
      const overlay = layer("tracker-navigation-ghost");
      const shell = document.createElement("div"); shell.dataset.trackerGhostShell = "";
      Object.assign(shell.style, { position: "absolute", left: from.rect.x + "px", top: from.rect.y + "px", width: from.rect.width + "px", height: from.rect.height + "px",
        transformOrigin: "0 0", ...from.surface });
      overlay.append(shell);
      for (const key of ["title", "description"] as const) {
        const part = from[key], text = document.createElement("div");
        text.setAttribute("data-tracker-ghost-" + key, ""); text.textContent = part.text;
        Object.assign(text.style, { position: "absolute", margin: "0", left: part.rect.x + "px", top: part.rect.y + "px", width: part.rect.width + "px",
          height: part.rect.height + "px", ...part.font, overflow: "hidden" }); overlay.append(text);
      }
      document.body.append(overlay); return overlay;
    }
    function handoff(active: Journey, target: HTMLElement | null, destination: Snapshot | null) {
      if (journey.current !== active) return;
      clearTimeout(active.timeout); clearTimeout(active.deadline); active.observer?.disconnect();
      phase(active, "morphing"); active.scrollTop = scrollArea()?.scrollTop || 0; active.windowY = window.scrollY;
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const animations: Animation[] = [];
      if (active.spatial && active.source && target && destination) {
        const from = active.source, duration = active.direction === "open" ? 400 : 360;
        active.ghost = ghost(from); active.targetNode = target;
        active.surface?.setAttribute("data-tracker-snapshot-handoff", "");
        active.sourceNode?.setAttribute("data-tracker-selected", ""); target.setAttribute("data-tracker-selected", "");
        root.current?.setAttribute("data-tracker-handoff", "");
        const shell = active.ghost.querySelector<HTMLElement>("[data-tracker-ghost-shell]")!;
        const radius = (value: string, rect: DOMRect) => {
          const pixels = Number.parseFloat(value) || 0; return (100 * pixels / rect.width) + "% / " + (100 * pixels / rect.height) + "%";
        };
        if (active.direction === "close") Object.assign(shell.style, destination.surface);
        animations.push(animate(active, shell, [
          { transform: "translate(0,0) scale(1,1)", borderRadius: radius(from.surface.borderRadius, from.rect), opacity: active.direction === "open" ? .8 : 0 },
          { transform: "translate(" + (destination.rect.x - from.rect.x) + "px," + (destination.rect.y - from.rect.y) + "px) scale(" + (destination.rect.width / from.rect.width) + "," + (destination.rect.height / from.rect.height) + ")", borderRadius: radius(destination.surface.borderRadius, destination.rect), opacity: active.direction === "open" ? 0 : .8 },
        ], duration));
        for (const key of ["title", "description"] as const) {
          const text = active.ghost.querySelector<HTMLElement>("[data-tracker-ghost-" + key + "]")!, first = from[key], last = destination[key];
          // Font-weight interpolation can otherwise wrap a single-line title and clip
          // its second word before the real heading takes over.
          if (key === "title" && last.rect.height < Number.parseFloat(last.font.lineHeight) * 1.5) {
            text.style.whiteSpace = "nowrap";
            text.style.overflow = "visible";
          }
          animations.push(animate(active, text, [
            { transform: "translate(0,0)", width: first.rect.width + "px", height: first.rect.height + "px", ...first.font, opacity: 1 },
            { transform: "translate(" + (last.rect.x - first.rect.x) + "px," + (last.rect.y - first.rect.y) + "px)", width: last.rect.width + "px", height: last.rect.height + "px", ...last.font, opacity: key === "description" && first.text !== last.text ? 0 : 1 },
          ], duration));
        }
      }
      // Incoming grid/workspace is already fully painted. Only the retained source fades.
      if (active.surface && !reduced) animations.push(animate(active, active.surface, [{ opacity: 1 }, { opacity: 0 }], 180));
      if (!animations.length) { cleanup(true); return; }
      void Promise.all(animations.map(animation => animation.finished)).then(() => {
        if (journey.current !== active) return;
        phase(active, "settling"); cleanup(true);
      }).catch(() => { /* Cancellation owns cleanup, never a stale completion callback. */ });
    }
    function attempt() {
      const active = journey.current;
      if (!active || active.phase === "morphing" || active.phase === "settling" || currentPath.current !== active.expected || active.frame) return;
      phase(active, "waiting-for-destination");
      if (active.direction === "close") {
        if (!root.current?.querySelector("[data-tracker-list-ready]")) return;
        restoreScroll();
      } else {
        const main = scrollArea(); if (main) main.scrollTop = 0;
        window.scrollTo({ top: 0, behavior: "instant" });
        if (!root.current?.querySelector("[data-tracker-workspace-shell], [data-tracker-route-error]")) return;
      }
      const target = find(active.id, active.direction), first = snapshot(target);
      // A loaded list with no real visible card uses surface overlap, never guessed geometry.
      if (!target || !first) { handoff(active, null, null); return; }
      // Two boundary samples confirm that route commit/scroll restoration has settled.
      active.frame = requestAnimationFrame(() => {
        active.frame = undefined;
        if (journey.current !== active) return;
        const nextTarget = find(active.id, active.direction), last = snapshot(nextTarget);
        if (!last || nextTarget !== target || Math.abs(last.title.rect.y - first.title.rect.y) > .75 || Math.abs(last.title.rect.x - first.title.rect.x) > .75) { attempt(); return; }
        handoff(active, nextTarget, last);
      });
    }
    const api: Coordinator = {
      begin(id, direction, node, seed) {
        if (journey.current?.id === id && journey.current.direction === direction) return false;
        cleanup(); clearResolves(); pendingFocus.current = null;
        const sourceNode = direction === "open" ? node : find(id, "open"), from = snapshot(sourceNode);
        if (direction === "open") {
          if (list.current) { list.current.scrollTop = scrollArea()?.scrollTop || 0; list.current.windowY = window.scrollY; }
          selected.current = seed || (from ? { id, name: from.title.text, description: from.description.text } : null);
          restore.current = false;
        } else restore.current = Boolean(list.current && selected.current?.id === id);
        const page = root.current?.querySelector<HTMLElement>(".client-trackers-page");
        const active: Journey = { id, direction, expected: direction === "open" ? LIST + "/" + id : LIST, phase: "navigating",
          source: from, sourceNode, spatial: Boolean(from && innerWidth >= 768 && !matchMedia("(prefers-reduced-motion: reduce)").matches),
          surface: page ? retainSurface(page, id) : null, ghost: null, animations: [], timeout: 0, deadline: 0 };
        journey.current = active;
        root.current?.setAttribute("data-tracker-direction", direction); phase(active, "navigating");
        if (direction === "open" && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
          const pressed = active.surface?.querySelector<HTMLElement>("[data-tracker-snapshot-text]")?.parentElement?.parentElement;
          if (pressed) animate(active, pressed, [{ transform: "scale(1)" }, { transform: "scale(.988)", offset: .65 }, { transform: "scale(1)" }], 110);
        }
        active.observer = new MutationObserver(attempt);
        if (root.current) active.observer.observe(root.current, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-tracker-list-ready", "data-tracker-workspace-shell", "data-tracker-route-error"] });
        // A timeout abandons travel, not destination readiness or the established surface.
        active.timeout = window.setTimeout(() => { active.spatial = false; attempt(); }, 1000);
        active.deadline = window.setTimeout(() => cleanup(true), 4000);
        return true;
      },
      saveList(state) { list.current = { ...state, scrollTop: list.current?.scrollTop || 0, windowY: list.current?.windowY || 0 }; },
      restoredList: () => restore.current ? list.current : null,
      listReady() { restoreScroll(); attempt(); restore.current = false; },
      workspaceReady() {
        attempt();
        const id = pendingFocus.current;
        if (id && currentPath.current === LIST + "/" + id) {
          const target = find(id, "open");
          if (target && !target.hasAttribute("data-tracker-loading-identity")) { target.querySelector<HTMLElement>("[data-tracker-title]")?.focus({ preventScroll: true }); pendingFocus.current = null; }
        }
      },
      identity: id => selected.current?.id === id && (currentPath.current === LIST + "/" + id || journey.current?.expected === LIST + "/" + id) ? selected.current : null,
      retainLoadingSurface(node) {
        if (!mounted.current || !node.isConnected || matchMedia("(prefers-reduced-motion: reduce)").matches || !currentPath.current.startsWith(LIST + "/")) return;
        const surface = retainSurface(node, undefined, true);
        resolves.current.set(surface, null);
        requestAnimationFrame(() => {
          if (!resolves.current.has(surface)) return;
          const animation = surface.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing, fill: "both" });
          resolves.current.set(surface, animation);
          void animation.finished.catch(() => {}).finally(() => { surface.remove(); resolves.current.delete(surface); });
        });
      },
    };
    return Object.assign(api, { cleanup, attempt, clearResolves });
  }, []);

  useLayoutEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    if (pendingFocus.current && pathname !== LIST + "/" + pendingFocus.current) pendingFocus.current = null;
    const active = journey.current;
    if (active && active.expected !== pathname) coordinator.cleanup();
    else if (active) coordinator.attempt();
    else if (pathname === LIST) restore.current = false;
  }, [pathname, coordinator]);

  useLayoutEffect(() => {
    const pop = () => {
      const from = currentPath.current, to = location.pathname;
      const id = from.startsWith(LIST + "/") ? from.slice(LIST.length + 1) : "";
      if (to === LIST && id && !id.includes("/")) coordinator.begin(id, "close", root.current!);
      else if (from === LIST && to.startsWith(LIST + "/")) {
        const next = to.slice(LIST.length + 1);
        const card = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-tracker-transition-id]") || []).find(node => node.dataset.trackerTransitionId === next);
        if (card) coordinator.begin(next, "open", card); else coordinator.cleanup();
      } else coordinator.cleanup();
    };
    mounted.current = true;
    const cancel = () => { coordinator.cleanup(); coordinator.clearResolves(); };
    const visibility = () => { if (document.hidden) cancel(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    const scroll = () => {
      const active = journey.current;
      if (active?.phase === "morphing" && (active.scrollTop !== (scrollArea()?.scrollTop || 0) || active.windowY !== window.scrollY)) cancel();
    };
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    window.addEventListener("popstate", pop); window.addEventListener("resize", cancel); window.addEventListener("pagehide", cancel);
    window.addEventListener("scroll", scroll, true); window.addEventListener("touchmove", cancel, { passive: true });
    scrollArea()?.addEventListener("wheel", cancel, { passive: true });
    document.addEventListener("visibilitychange", visibility); document.addEventListener("keydown", escape); media.addEventListener("change", cancel);
    return () => {
      mounted.current = false; cancel(); window.removeEventListener("popstate", pop); window.removeEventListener("resize", cancel); window.removeEventListener("pagehide", cancel);
      window.removeEventListener("scroll", scroll, true); window.removeEventListener("touchmove", cancel); scrollArea()?.removeEventListener("wheel", cancel);
      document.removeEventListener("visibilitychange", visibility); document.removeEventListener("keydown", escape); media.removeEventListener("change", cancel);
    };
  }, [coordinator]);
  return <Context.Provider value={coordinator}><div ref={root} className="tracker-navigation-boundary">{children}</div></Context.Provider>;
}

export function TrackerTransitionLink({ trackerId, direction = "open", seed, ...props }: React.ComponentProps<typeof Link> & { trackerId: string; direction?: Direction; seed?: TrackerNavigationSeed }) {
  const navigation = useTrackerNavigation();
  return <Link {...props} scroll={false} onClick={event => {
    props.onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target === "_blank") return;
    if (navigation && !navigation.begin(trackerId, direction, event.currentTarget, seed)) event.preventDefault();
  }} />;
}

"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { Client } from "./types";

const ROW_HEIGHT = 60;
const MENU_HEIGHT = 320;
type Position = { left: number; top?: number; bottom?: number; width: number; maxHeight: number };

/** Search is a draft: only choosing an option changes the billing account. */
export default function BillingClientCombobox({ clients, value, onChange, disabled, active }: {
  clients: Client[];
  value: string;
  onChange: (clientId: string) => void;
  disabled: boolean;
  active: boolean;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);
  const reduceMotion = useReducedMotion();
  const open = expanded && active && !disabled;
  const index = useMemo(() => clients.map(client => ({
    client, name: client.companyName.toLowerCase(), identifier: client.clientId.toLowerCase(),
  })), [clients]);
  const selected = useMemo(() => clients.find(client => client.clientId === value), [clients, value]);
  const normalizedQuery = query.trim().toLowerCase();
  const results = useMemo(() => normalizedQuery
    ? index.filter(entry => entry.name.includes(normalizedQuery) || entry.identifier.includes(normalizedQuery))
    : index, [index, normalizedQuery]);
  const currentIndex = Math.min(activeIndex, results.length - 1);

  const show = () => {
    if (disabled || !active || open) return;
    setQuery("");
    setActiveIndex(0);
    setExpanded(true);
  };
  const choose = (client: Client) => {
    onChange(client.clientId);
    setExpanded(false);
    inputRef.current?.focus({ preventScroll: true });
  };

  // Native constraint validation must check the committed ID, never the query.
  useLayoutEffect(() => {
    inputRef.current?.setCustomValidity(value ? "" : "Please select a client from the results.");
  }, [value]);
  useEffect(() => {
    if (!active || disabled) setExpanded(false);
  }, [active, disabled]);

  const positionMenu = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const viewport = window.visualViewport;
    const leftEdge = (viewport?.offsetLeft ?? 0) + 12;
    const topEdge = (viewport?.offsetTop ?? 0) + 12;
    const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth) - 24;
    const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight) - 24;
    // Do not leave a detached popup when its field scrolls behind the header/footer.
    let ancestor = input.parentElement;
    while (ancestor && ancestor !== document.body && ancestor !== document.documentElement) {
      if (/(auto|scroll|hidden)/.test(getComputedStyle(ancestor).overflowY)) {
        const bounds = ancestor.getBoundingClientRect();
        if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) { setExpanded(false); return; }
      }
      ancestor = ancestor.parentElement;
    }
    if (rect.bottom <= topEdge || rect.top >= bottomEdge) { setExpanded(false); return; }
    const below = Math.max(0, bottomEdge - rect.bottom - 7);
    const above = Math.max(0, rect.top - topEdge - 7);
    const downward = below >= Math.min(MENU_HEIGHT, Math.max(1, results.length) * ROW_HEIGHT) || below >= above;
    const width = Math.min(rect.width, rightEdge - leftEdge);
    setPosition({
      left: Math.max(leftEdge, Math.min(rect.left, rightEdge - width)), width,
      maxHeight: Math.min(MENU_HEIGHT, downward ? below : above),
      ...(downward ? { top: rect.bottom + 7 } : { bottom: window.innerHeight - rect.top + 7 }),
    });
  }, [results.length]);

  useLayoutEffect(() => {
    if (!open) return;
    positionMenu();
    // Follow modal spring motion and scrolling without moving focus into a body portal.
    let frame = 0;
    let trackingFrame = 0;
    let previousBounds = "";
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(positionMenu); };
    const trackAnchor = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      const bounds = rect ? `${rect.x},${rect.y},${rect.width},${rect.height}` : "";
      if (bounds !== previousBounds) { previousBounds = bounds; update(); }
      trackingFrame = requestAnimationFrame(trackAnchor);
    };
    trackingFrame = requestAnimationFrame(trackAnchor);
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (target !== inputRef.current && !menuRef.current?.contains(target)) setExpanded(false);
    };
    const observer = new ResizeObserver(update);
    if (inputRef.current) observer.observe(inputRef.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    document.addEventListener("pointerdown", outside);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(trackingFrame);
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open, positionMenu]);

  useLayoutEffect(() => {
    setActiveIndex(0);
    setScrollTop(0);
    if (menuRef.current) menuRef.current.scrollTop = 0;
  }, [normalizedQuery, index, open]);
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu || currentIndex < 0) return;
    const top = currentIndex * ROW_HEIGHT;
    if (top < menu.scrollTop) menu.scrollTop = top;
    else if (top + ROW_HEIGHT > menu.scrollTop + menu.clientHeight) menu.scrollTop = top + ROW_HEIGHT - menu.clientHeight;
    setScrollTop(menu.scrollTop);
  }, [currentIndex, open, position?.maxHeight]);

  // Bound DOM work even for thousands of loaded clients; all matches remain scrollable.
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 3);
  const last = Math.min(results.length, first + Math.ceil(MENU_HEIGHT / ROW_HEIGHT) + 7);
  const visibleIndexes = Array.from({ length: Math.max(0, last - first) }, (_, offset) => first + offset);
  if (currentIndex >= 0 && !visibleIndexes.includes(currentIndex)) visibleIndexes.push(currentIndex);

  return <div className="relative min-w-0">
    <label className="label" htmlFor={id}>Client *</label>
    <div className="relative">
      <input ref={inputRef} id={id} role="combobox" type="text" autoComplete="off" spellCheck={false}
        aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={open}
        aria-controls={open ? `${id}-results` : undefined} aria-owns={open ? `${id}-results` : undefined}
        aria-activedescendant={open && currentIndex >= 0 ? `${id}-option-${currentIndex}` : undefined}
        aria-describedby={disabled ? `${id}-locked` : undefined} aria-required="true"
        className="input-field h-12 rounded-2xl bg-white pr-10 shadow-sm dark:bg-white/[0.06]"
        placeholder={open ? "Search company name or Client ID" : "Select Client"}
        title={!open ? selected?.companyName || value || undefined : undefined}
        value={open ? query : selected?.companyName || value} disabled={disabled} required={!value}
        onFocus={show} onClick={show}
        onChange={event => { setQuery(event.target.value); setActiveIndex(0); setExpanded(true); }}
        onPaste={() => { if (!open) { inputRef.current?.select(); setQuery(""); setExpanded(true); } }}
        onBlur={() => setExpanded(false)}
        onInvalid={() => { show(); inputRef.current?.focus(); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape" && open) {
            event.preventDefault(); event.stopPropagation(); setExpanded(false); return;
          }
          if (event.key === "Tab") { setExpanded(false); return; }
          if (event.key === "Enter") {
            event.preventDefault();
            if (open && results[currentIndex]) choose(results[currentIndex].client);
            else show();
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) { show(); return; }
            setActiveIndex(current => results.length ? (current + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length : 0);
          } else if (!open && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            inputRef.current?.select(); setQuery(""); setExpanded(true);
          }
        }} />
      <ChevronDown aria-hidden="true" className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
    </div>
    <input type="hidden" name="clientId" value={value} disabled={disabled} />
    {disabled && <p id={`${id}-locked`} className="text-xs text-faint mt-1">Client cannot be changed while editing.</p>}
    {open && position && createPortal(
      <motion.div initial={reduceMotion ? false : { opacity: 0, y: position.top === undefined ? 4 : -4 }}
        animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.14, ease: "easeOut" }}
        style={{ position: "fixed", zIndex: 180, ...position }}
        className="overflow-hidden rounded-2xl border border-black/[0.10] bg-white/95 shadow-[0_18px_52px_rgba(0,0,0,0.18)] backdrop-blur-2xl dark:border-white/[0.14] dark:bg-[#242426]/95 dark:shadow-[0_22px_60px_rgba(0,0,0,0.58)]">
        <div ref={menuRef} id={`${id}-results`} role="listbox" aria-label="Clients" style={{ maxHeight: position.maxHeight }}
          className="overflow-y-auto overscroll-contain" onScroll={event => setScrollTop(event.currentTarget.scrollTop)}>
          {results.length ? <div className="relative" style={{ height: results.length * ROW_HEIGHT }}>
            {visibleIndexes.map(resultIndex => {
              const client = results[resultIndex].client;
              return <button key={client.clientId} id={`${id}-option-${resultIndex}`} type="button" role="option" tabIndex={-1}
                aria-selected={client.clientId === value} aria-posinset={resultIndex + 1} aria-setsize={results.length}
                onMouseDown={event => event.preventDefault()} onClick={() => choose(client)}
                onMouseMove={() => setActiveIndex(resultIndex)}
                style={{ position: "absolute", top: resultIndex * ROW_HEIGHT, height: ROW_HEIGHT, left: 4, right: 4 }}
                className={`flex items-center gap-3 rounded-xl px-3 text-left transition-colors ${resultIndex === currentIndex ? "bg-brand-50 dark:bg-brand-500/15" : "hover:bg-black/[0.04] dark:hover:bg-white/[0.07]"}`}>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-default" title={client.companyName}>{client.companyName}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted">{client.clientId}{client.category ? ` · ${client.category}` : ""}</span></span>
                {client.clientId === value && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-500" />}
              </button>;
            })}
          </div> : <p role="status" className="px-3 py-5 text-center text-sm text-muted">No matching clients</p>}
        </div>
      </motion.div>, document.body)}
  </div>;
}

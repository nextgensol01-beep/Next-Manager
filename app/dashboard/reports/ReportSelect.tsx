"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { reportControlSpring } from "./report-motion";

export type ReportSelectOption = {
  value: string;
  label: string;
  group?: string;
  disabled?: boolean;
};

type ReportSelectProps = {
  value: string;
  options: ReportSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  variant?: "default" | "bare";
};

type MenuPosition = { left: number; top?: number; bottom?: number; width: number; maxHeight: number };

export default function ReportSelect({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = "Select",
  searchable = false,
  disabled = false,
  className = "",
  buttonClassName = "",
  variant = "default",
}: ReportSelectProps) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const reduceMotion = useReducedMotion();
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => `${option.label} ${option.group || ""}`.toLowerCase().includes(query));
  }, [options, search]);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = filtered.findIndex((option) => option.value === value && !option.disabled);
    const firstEnabled = filtered.findIndex((option) => !option.disabled);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : Math.max(0, firstEnabled));
  }, [filtered, open, value]);

  const positionMenu = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const viewportPadding = 12;
    const preferredHeight = searchable ? 340 : 300;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openUpward = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(140, Math.min(preferredHeight, openUpward ? spaceAbove - 8 : spaceBelow - 8));
    const width = Math.min(Math.max(rect.width, 210), window.innerWidth - viewportPadding * 2);
    const left = Math.min(Math.max(viewportPadding, rect.left), window.innerWidth - width - viewportPadding);
    setPosition(openUpward
      ? { left, bottom: window.innerHeight - rect.top + 7, width, maxHeight }
      : { left, top: rect.bottom + 7, width, maxHeight });
  }, [searchable]);

  useEffect(() => {
    if (!open) return;
    positionMenu();
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onViewportChange = (event: Event) => {
      // The capture listener also sees the options panel's own scroll events.
      // That is an interaction inside the menu, so keep it open. When an
      // ancestor scrolls, update the fixed portal position instead of closing.
      if (event.type === "scroll" && menuRef.current?.contains(event.target as Node)) return;
      positionMenu();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    window.setTimeout(() => (searchable ? searchRef.current : menuRef.current)?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open, positionMenu, searchable]);

  const choose = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    setSearch("");
    buttonRef.current?.focus();
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Enter" || event.key === " ") {
      const option = filtered[activeIndex];
      if (option && !option.disabled) choose(option.value);
      return;
    }
    const enabledIndexes = filtered.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0);
    if (enabledIndexes.length === 0) return;
    if (event.key === "Home") { setActiveIndex(enabledIndexes[0]); return; }
    if (event.key === "End") { setActiveIndex(enabledIndexes[enabledIndexes.length - 1]); return; }
    const currentPosition = Math.max(0, enabledIndexes.indexOf(activeIndex));
    const offset = event.key === "ArrowDown" ? 1 : -1;
    setActiveIndex(enabledIndexes[(currentPosition + offset + enabledIndexes.length) % enabledIndexes.length]);
  };

  const groupedOptions = useMemo(() => {
    const groups = new Map<string, ReportSelectOption[]>();
    filtered.forEach((option) => {
      const group = option.group || "";
      groups.set(group, [...(groups.get(group) || []), option]);
    });
    return Array.from(groups);
  }, [filtered]);

  return <div className={`relative min-w-0 ${className}`}>
    <button
      ref={buttonRef}
      type="button"
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={`${id}-menu`}
      disabled={disabled}
      onClick={() => setOpen((current) => !current)}
      onKeyDown={(event) => {
        if (["ArrowDown", "Enter", " "].includes(event.key) && !open) {
          event.preventDefault();
          setOpen(true);
        }
      }}
      className={`${variant === "bare" ? "report-select-button-bare" : "report-select-button"} ${open ? "is-open" : ""} ${buttonClassName}`}
    >
      <span className="min-w-0 flex-1 truncate text-left">{selected?.label || placeholder}</span>
      <motion.span className="shrink-0 text-faint" animate={{ rotate: open ? 180 : 0 }} transition={reduceMotion ? { duration: 0.01 } : reportControlSpring}><ChevronDown className="h-3.5 w-3.5" /></motion.span>
    </button>

    {position && createPortal(<AnimatePresence initial={false}>{open && <motion.div
      ref={menuRef}
      id={`${id}-menu`}
      role="listbox"
      aria-label={ariaLabel}
      aria-activedescendant={filtered[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
      tabIndex={-1}
      className="report-select-menu"
      initial={reduceMotion ? false : { opacity: 0, scale: 0.975, y: position.bottom === undefined ? -7 : 7 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985, y: position.bottom === undefined ? -4 : 4 }}
      transition={reduceMotion ? { duration: 0.01 } : reportControlSpring}
      style={{ left: position.left, top: position.top, bottom: position.bottom, width: position.width, maxHeight: position.maxHeight, transformOrigin: position.bottom === undefined ? "top center" : "bottom center" }}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={handleMenuKeyDown}
    >
      {searchable && <div className="report-select-search-wrap">
        <Search className="h-3.5 w-3.5 shrink-0 text-faint" />
        <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${ariaLabel.toLowerCase()}`} aria-label={`Search ${ariaLabel.toLowerCase()}`} className="min-w-0 flex-1 bg-transparent text-xs text-default outline-none placeholder:text-faint" />
        {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="rounded-full p-1 text-faint hover:bg-surface"><X className="h-3 w-3" /></button>}
      </div>}
      <div className="report-select-options" style={{ maxHeight: searchable ? position.maxHeight - 58 : position.maxHeight }}>
        {groupedOptions.length === 0 ? <p className="px-3 py-6 text-center text-xs text-muted">No matching options</p> : groupedOptions.map(([group, groupOptions]) => <div key={group || "options"}>
          {group && <p className="report-select-group-label">{group}</p>}
          {groupOptions.map((option) => {
            const active = option.value === value;
            const optionIndex = filtered.indexOf(option);
            return <button key={option.value} id={`${id}-option-${optionIndex}`} type="button" role="option" tabIndex={-1} aria-selected={active} disabled={option.disabled} onMouseEnter={() => setActiveIndex(optionIndex)} onFocus={() => setActiveIndex(optionIndex)} onClick={() => choose(option.value)} className={`report-select-option ${active ? "is-selected" : ""} ${activeIndex === optionIndex ? "is-active" : ""}`}>
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {active && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>;
          })}
        </div>)}
      </div>
    </motion.div>}</AnimatePresence>, document.body)}
  </div>;
}

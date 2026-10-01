"use client";

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLiquidGlassLight } from "@/components/ui/useLiquidGlassLight";
import { GlassSurface } from "@/components/ui/liquid-glass/GlassSurface";

export interface LiquidGlassDropdownOption {
  label: string;
  value: string;
}

interface LiquidGlassDropdownProps {
  label: string;
  options: LiquidGlassDropdownOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  portal?: boolean;
  variant?: "glass" | "soft" | "condition";
}

export default function LiquidGlassDropdown({
  className,
  disabled = false,
  icon,
  label,
  onChange,
  options,
  portal = false,
  variant = "glass",
  value,
}: LiquidGlassDropdownProps) {
  const listboxId = useId();
  const conditionStyle = variant === "condition";
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const triggerLight = useLiquidGlassLight<HTMLButtonElement>();
  const menuLight = useLiquidGlassLight<HTMLDivElement>();
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<React.CSSProperties | null>(null);
  const unavailable = disabled || options.length === 0;
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [keyboardHighlight, setKeyboardHighlight] = useState(false);
  const typeahead = useRef({ text: "", time: 0 });
  const selectedOption = options[selectedIndex] ?? options[0];

  const optionIds = useMemo(
    () => options.map((_, index) => `${listboxId}-option-${index}`),
    [listboxId, options]
  );

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    setHoveredIndex(null);
    setKeyboardHighlight(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus(conditionStyle ? { preventScroll: true } : undefined));
  }, [conditionStyle]);

  const updateMenuPosition = useCallback(() => {
    if (!portal || !triggerRef.current || typeof window === "undefined") return;

    const rect = triggerRef.current.getBoundingClientRect();
    const gutter = 12;
    const menuGap = 8;
    const menuMaxHeight = 288;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(rect.width, viewportWidth - gutter * 2);
    const left = Math.min(Math.max(gutter, rect.left), Math.max(gutter, viewportWidth - width - gutter));
    const spaceBelow = viewportHeight - rect.bottom - gutter;
    const spaceAbove = rect.top - gutter;
    if (conditionStyle) {
      if (rect.bottom < gutter || rect.top > viewportHeight - gutter) { setOpen(false); return; }
      const desiredHeight = Math.min(menuMaxHeight, options.length * 40 + 14);
      const below = spaceBelow - menuGap >= desiredHeight || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(0, Math.min(menuMaxHeight, (below ? spaceBelow : spaceAbove) - menuGap));
      setMenuPosition({ left, width, maxHeight, position: "fixed", zIndex: 180,
        ...(below ? { top: rect.bottom + menuGap } : { bottom: viewportHeight - rect.top + menuGap }) });
      return;
    }
    const openBelow = spaceBelow >= 220 || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(160, Math.min(menuMaxHeight, openBelow ? spaceBelow : spaceAbove));
    const top = openBelow
      ? Math.min(rect.bottom + menuGap, viewportHeight - maxHeight - gutter)
      : Math.max(gutter, rect.top - maxHeight - menuGap);

    setMenuPosition({
      left,
      maxHeight,
      position: "fixed",
      top,
      width,
      zIndex: 180,
    });
  }, [conditionStyle, options.length, portal]);

  // The compact portal measures before paint, so it never flashes at a guessed position.
  useLayoutEffect(() => {
    if (!open || !portal || !conditionStyle) return;
    updateMenuPosition();
    const observer = new ResizeObserver(updateMenuPosition);
    if (triggerRef.current) observer.observe(triggerRef.current);
    return () => observer.disconnect();
  }, [conditionStyle, open, portal, updateMenuPosition]);

  const selectIndex = useCallback((index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setActiveIndex(index);
    close(true);
  }, [close, onChange, options]);

  useEffect(() => {
    if (!open) return;

    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };

    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [close, open]);

  useEffect(() => {
    if (!open || !portal) return;

    updateMenuPosition();
    const handleLayoutChange = () => updateMenuPosition();

    window.addEventListener("resize", handleLayoutChange);
    window.addEventListener("scroll", handleLayoutChange, true);
    return () => {
      window.removeEventListener("resize", handleLayoutChange);
      window.removeEventListener("scroll", handleLayoutChange, true);
    };
  }, [open, portal, updateMenuPosition]);

  useEffect(() => {
    if (open) setActiveIndex(selectedIndex);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(optionIds[activeIndex])?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeIndex, open, optionIds]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (unavailable) return;

    if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      setKeyboardHighlight(true);
      setHoveredIndex(null);
      setOpen(true);
      setActiveIndex(selectedIndex);
      return;
    }

    if (!open) return;

    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      setKeyboardHighlight(true);
      setHoveredIndex(null);
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (conditionStyle) event.stopPropagation();
      close(true);
      return;
    }

    if (event.key === "Tab") {
      close();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % options.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + options.length) % options.length);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(options.length - 1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectIndex(activeIndex);
      return;
    }

    if (conditionStyle && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      setKeyboardHighlight(true);
      setHoveredIndex(null);
      const now = Date.now();
      const text = (now - typeahead.current.time < 500 ? typeahead.current.text : "") + event.key.toLowerCase();
      typeahead.current = { text, time: now };
      const match = options.findIndex(option => option.label.toLowerCase().startsWith(text));
      if (match >= 0) setActiveIndex(match);
    }
  };

  const items = options.map((option, index) => {
    const selected = option.value === value;
    const active = conditionStyle
      ? hoveredIndex === index || (keyboardHighlight && index === activeIndex)
      : index === activeIndex;
    return <button key={option.value} id={optionIds[index]} type="button" role="option"
      tabIndex={conditionStyle ? -1 : undefined} aria-selected={selected}
      onMouseEnter={conditionStyle ? undefined : () => setActiveIndex(index)}
      onPointerEnter={conditionStyle ? event => {
        if (event.pointerType === "touch") return;
        setActiveIndex(index);
        setHoveredIndex(index);
        setKeyboardHighlight(false);
      } : undefined}
      onPointerLeave={conditionStyle ? () => setHoveredIndex(null) : undefined}
      onClick={() => selectIndex(index)}
      className={conditionStyle ? cn("condition-select-option", selected && "is-selected", active && "is-active") : cn(
        "liquid-dropdown-option flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 text-left text-sm",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500",
        selected && "liquid-dropdown-option-selected font-semibold", active && !selected && "liquid-dropdown-option-active"
      )}>
      <span className="min-w-0 flex-1 truncate">{option.label}</span>
      {conditionStyle ? <span className="condition-select-check" aria-hidden="true">{selected && <Check className="h-4 w-4 shrink-0" />}</span>
        : selected && <Check className="h-4 w-4 shrink-0" />}
    </button>;
  });

  const dropdownMenu = open ? (
    <motion.div
      ref={menuRef}
      id={listboxId}
      role="listbox"
      aria-label={label}
      aria-activedescendant={optionIds[activeIndex]}
      initial={reducedMotion ? false : { opacity: 0, y: conditionStyle ? -3 : -7, scale: conditionStyle ? 0.985 : 0.975 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: conditionStyle ? -3 : -5, scale: conditionStyle ? 0.985 : 0.982 }}
      transition={reducedMotion ? { duration: conditionStyle ? 0.01 : 0.1 } : conditionStyle ? { duration: .15, ease: [0.22, 1, 0.36, 1] } : { type: "spring", stiffness: 420, damping: 30, mass: 0.62 }}
      onPointerDown={(event) => { if (conditionStyle) event.preventDefault(); event.stopPropagation(); }}
      onWheel={(event) => event.stopPropagation()}
      style={{
        transformOrigin: menuPosition?.bottom !== undefined ? "bottom center" : "top center",
        ...(portal ? menuPosition ?? { position: "fixed", visibility: "hidden" } : null),
      }}
      onPointerEnter={menuLight.onPointerEnter}
      onPointerLeave={event => {
        menuLight.onPointerLeave(event);
        if (conditionStyle) setHoveredIndex(null);
      }}
      onPointerMove={menuLight.onPointerMove}
      className={cn(
        conditionStyle ? "condition-select-menu" : "liquid-glass-dropdown surrounding-light max-h-72 overflow-y-auto rounded-[18px] p-1.5",
        portal
          ? !conditionStyle && "clients-filter-dropdown-portal"
          : "!absolute left-0 right-0 top-full z-50 mt-2"
      )}
    >
      {conditionStyle ? <GlassSurface radius="md" className="condition-select-surface">
        <div className="condition-select-options">{items}</div>
      </GlassSurface> : items}
    </motion.div>
  ) : null;

  return (
    <div
      ref={rootRef}
      className={cn("relative min-w-0", open && "z-[70]", className)}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={unavailable}
        aria-label={label}
        role={conditionStyle ? "combobox" : undefined}
        aria-describedby={conditionStyle ? `${listboxId}-value` : undefined}
        aria-activedescendant={conditionStyle && open ? optionIds[activeIndex] : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={event => {
          if (conditionStyle) { setHoveredIndex(null); setKeyboardHighlight(event.detail === 0); }
          setOpen((current) => !current);
        }}
        onPointerEnter={triggerLight.onPointerEnter}
        onPointerLeave={triggerLight.onPointerLeave}
        onPointerMove={triggerLight.onPointerMove}
        className={cn(
          conditionStyle ? "condition-select-trigger workflow-rule-control" : "flex h-11 w-full items-center gap-2.5 rounded-[18px] px-3.5 text-left text-sm font-medium text-default transition-all duration-200",
          conditionStyle ? null : variant === "glass"
            ? "liquid-glass-control liquid-glass-trigger surrounding-light"
            : "border border-black/[0.08] bg-white/[0.58] hover:border-black/[0.14] hover:bg-white/[0.78] dark:border-white/[0.10] dark:bg-white/[0.055] dark:hover:border-white/[0.18] dark:hover:bg-white/[0.085]",
          !conditionStyle && "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
          "disabled:pointer-events-none disabled:opacity-50",
          !conditionStyle && open && "border-brand-400 shadow-[0_0_0_1px_rgba(0,113,227,0.18),0_0_24px_rgba(0,113,227,0.12)]"
        )}
      >
        {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center text-faint">{icon}</span>}
        <span id={`${listboxId}-value`} className="min-w-0 flex-1 truncate">{selectedOption?.label ?? label}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-faint transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      {portal && typeof document !== "undefined" ? (
        createPortal(<AnimatePresence>{dropdownMenu}</AnimatePresence>, document.body)
      ) : (
        <AnimatePresence>{dropdownMenu}</AnimatePresence>
      )}
    </div>
  );
}

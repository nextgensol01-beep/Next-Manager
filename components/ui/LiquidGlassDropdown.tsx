"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLiquidGlassLight } from "@/components/ui/useLiquidGlassLight";

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
}

export default function LiquidGlassDropdown({
  className,
  disabled = false,
  icon,
  label,
  onChange,
  options,
  value,
}: LiquidGlassDropdownProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const triggerLight = useLiquidGlassLight<HTMLButtonElement>();
  const menuLight = useLiquidGlassLight<HTMLDivElement>();
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const unavailable = disabled || options.length === 0;
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selectedOption = options[selectedIndex] ?? options[0];

  const optionIds = useMemo(
    () => options.map((_, index) => `${listboxId}-option-${index}`),
    [listboxId, options]
  );

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

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
      if (!rootRef.current?.contains(event.target as Node)) close();
    };

    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [close, open]);

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
      setOpen(true);
      setActiveIndex(selectedIndex);
      return;
    }

    if (!open) return;

    if (event.key === "Escape") {
      event.preventDefault();
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
    }
  };

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
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((current) => !current)}
        onPointerEnter={triggerLight.onPointerEnter}
        onPointerLeave={triggerLight.onPointerLeave}
        onPointerMove={triggerLight.onPointerMove}
        className={cn(
          "liquid-glass-control liquid-glass-trigger surrounding-light flex h-11 w-full items-center gap-2.5 rounded-[18px] px-3.5 text-left text-sm font-medium text-default",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
          "disabled:pointer-events-none disabled:opacity-50",
          open && "border-brand-400 shadow-[0_0_0_1px_rgba(0,113,227,0.18),0_0_24px_rgba(0,113,227,0.12)]"
        )}
      >
        {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center text-faint">{icon}</span>}
        <span className="min-w-0 flex-1 truncate">{selectedOption?.label ?? label}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-faint transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={listboxId}
            role="listbox"
            aria-label={label}
            aria-activedescendant={optionIds[activeIndex]}
            initial={reducedMotion ? false : { opacity: 0, y: -7, scale: 0.975 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -5, scale: 0.982 }}
            transition={reducedMotion ? { duration: 0.1 } : { type: "spring", stiffness: 420, damping: 30, mass: 0.62 }}
            style={{ transformOrigin: "top center" }}
            onPointerEnter={menuLight.onPointerEnter}
            onPointerLeave={menuLight.onPointerLeave}
            onPointerMove={menuLight.onPointerMove}
            className="liquid-glass-dropdown surrounding-light !absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-y-auto rounded-[18px] p-1.5"
          >
            {options.map((option, index) => {
              const selected = option.value === value;
              const active = index === activeIndex;
              return (
                <button
                  key={option.value}
                  id={optionIds[index]}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectIndex(index)}
                  className={cn(
                    "liquid-dropdown-option flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 text-left text-sm",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500",
                    selected && "liquid-dropdown-option-selected font-semibold",
                    active && !selected && "liquid-dropdown-option-active"
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {selected && <Check className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

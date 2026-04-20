"use client";
import React, { useRef, useState, useEffect, useCallback } from "react";
import { FINANCIAL_YEARS } from "@/lib/utils";

interface FYTabBarProps {
  value: string;
  onChange: (fy: string) => void;
}

export default function FYTabBar({ value, onChange }: FYTabBarProps) {
  const scrollRef   = useRef<HTMLDivElement>(null);
  const isDragging  = useRef(false);
  const dragStartX  = useRef(0);
  const scrollStart = useRef(0);

  const [showLeftFade,  setShowLeftFade]  = useState(false);
  const [showRightFade, setShowRightFade] = useState(true);

  const updateFades = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 4);
    setShowRightFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  const scrollToSelected = useCallback((year: string) => {
    const el = scrollRef.current;
    if (!el) return;
    const btn = el.querySelector<HTMLElement>(`[data-fy="${year}"]`);
    if (!btn) return;
    const offset =
      btn.offsetLeft - el.clientWidth / 2 + btn.offsetWidth / 2;
    el.scrollTo({ left: offset, behavior: "smooth" });
  }, []);

  // Scroll to selected year on mount
  useEffect(() => {
    const t = setTimeout(() => { scrollToSelected(value); updateFades(); }, 100);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    isDragging.current  = true;
    dragStartX.current  = e.pageX;
    scrollStart.current = scrollRef.current?.scrollLeft ?? 0;
    if (scrollRef.current) scrollRef.current.style.cursor = "grabbing";
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    e.preventDefault();
    scrollRef.current.scrollLeft = scrollStart.current - (e.pageX - dragStartX.current);
  };
  const onMouseUp = () => {
    isDragging.current = false;
    if (scrollRef.current) scrollRef.current.style.cursor = "grab";
  };

  const handleSelect = (y: string) => {
    onChange(y);
    scrollToSelected(y);
  };

  return (
    <div className="bg-card rounded-2xl p-4 mb-4 shadow-sm border border-base flex items-center gap-3">
      {/* Static label */}
      <span className="text-sm font-medium text-muted flex-shrink-0">Financial Year:</span>

      {/* Scrollable years */}
      <div className="relative flex-1 min-w-0 overflow-hidden">
        {/* Left fade */}
        <div
          className="pointer-events-none absolute left-[-5px] top-0 h-full w-10 z-10 transition-opacity duration-200"
          style={{
            background: "linear-gradient(to right, var(--color-card) 20%, transparent)",
            opacity: showLeftFade ? 1 : 0,
          }}
        />
        {/* Right fade */}
        <div
          className="pointer-events-none absolute right-[-5px] top-0 h-full w-10 z-10 transition-opacity duration-200"
          style={{
            background: "linear-gradient(to left, var(--color-card) 20%, transparent)",
            opacity: showRightFade ? 1 : 0,
          }}
        />

        <div
          ref={scrollRef}
          className="flex items-center gap-2 overflow-x-auto scroll-smooth snap-x snap-mandatory"
          style={{
            cursor: "grab",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
          }}
          onScroll={updateFades}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <style>{`[data-fy-tabbar]::-webkit-scrollbar { display: none; }`}</style>
          {FINANCIAL_YEARS.map((y) => (
            <button
              key={y}
              data-fy={y}
              onClick={() => handleSelect(y)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex-shrink-0 snap-start ${
                value === y
                  ? "bg-brand-600 text-white"
                  : "bg-surface text-muted hover:bg-hover hover:text-default"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

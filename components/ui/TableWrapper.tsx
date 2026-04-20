"use client";
import { useEffect, useRef, useState } from "react";

interface Props {
  children: React.ReactNode;
  className?: string;
}

export default function TableWrapper({ children, className = "" }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrollable, setIsScrollable] = useState(false);
  const [atEnd, setAtEnd] = useState(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const check = () => {
      const scrollable = el.scrollWidth > el.clientWidth + 2;
      const end = !scrollable || el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      setIsScrollable(scrollable);
      setAtEnd(end);
    };

    const raf = requestAnimationFrame(check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener("scroll", check, { passive: true });
    return () => { cancelAnimationFrame(raf); ro.disconnect(); el.removeEventListener("scroll", check); };
  }, []);

  return (
    // Outer div: holds the ::after fade gradient, does NOT scroll
    <div className={`table-scroll-outer ${atEnd ? "at-end" : ""}`}>
      {/* Scroll hint — floats above table on mobile when not at end */}
      {isScrollable && !atEnd && (
        <div className="scroll-hint-pill" aria-hidden="true">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          scroll
        </div>
      )}
      {/* Inner div: the actual scrollable container */}
      <div ref={scrollRef} className={`table-scroll-wrap ${className}`}>
        {children}
      </div>
    </div>
  );
}

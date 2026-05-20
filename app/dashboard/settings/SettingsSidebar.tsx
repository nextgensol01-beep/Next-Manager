"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { CalendarDays, UserPlus, LayoutList, Search, X } from "lucide-react";
import { useFinancialYearPreference } from "@/app/providers";
import { useSettingsSearch, STATIC_SECTIONS, type SearchResult } from "./SettingsSearchContext";
import toast from "react-hot-toast";

export interface TabDef {
  label: string;
  icon: React.ReactNode;
  iconBg: string;
  activeIconBg: string;
}

export const SETTINGS_TABS: TabDef[] = [
  {
    label: "General",
    icon: <CalendarDays className="w-[18px] h-[18px]" />,
    iconBg: "bg-brand-500 text-white",
    activeIconBg: "bg-white/25 text-white",
  },
  {
    label: "Access & Users",
    icon: <UserPlus className="w-[18px] h-[18px]" />,
    iconBg: "bg-indigo-500 text-white",
    activeIconBg: "bg-white/25 text-white",
  },
  {
    label: "Custom Fields",
    icon: <LayoutList className="w-[18px] h-[18px]" />,
    iconBg: "bg-emerald-500 text-white",
    activeIconBg: "bg-white/25 text-white",
  },
];

/** iOS-style toggle */
function InlineToggle({ checked, onChange }: { checked: boolean; onChange: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${
        checked ? "bg-[#34C759]" : "bg-[var(--color-border)]"
      }`}
      style={{ width: "44px", height: "24px", boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.1)" }}
    >
      <span
        className="inline-block rounded-full bg-white transition-transform duration-200"
        style={{
          width: "20px", height: "20px", marginTop: "2px",
          transform: checked ? "translateX(21px)" : "translateX(2px)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(0,0,0,0.06)",
        }}
      />
    </button>
  );
}

/** Group label for dropdown */
function DropdownGroup({ label }: { label: string }) {
  return (
    <div className="px-3 pt-2 pb-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-faint">{label}</p>
    </div>
  );
}

interface SettingsSidebarProps {
  activeTab: number;
  onSelect: (index: number, sectionId?: string) => void;
  mobile?: boolean;
}

export default function SettingsSidebar({ activeTab, onSelect, mobile = false }: SettingsSidebarProps) {
  const { settings, setFeatureEnabled, isLoaded } = useFinancialYearPreference();
  const { users } = useSettingsSearch();
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !settings.enabled;
    setFeatureEnabled(next);
    try {
      const response = await fetch("/api/financial-year-preference", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { ...settings, enabled: next, pendingReminderCurrentFy: next ? settings.pendingReminderCurrentFy : null } }),
      });
      if (!response.ok) { setFeatureEnabled(!next); toast.error("Failed to update FY setting"); }
      else toast.success(next ? "FY override enabled" : "FY override disabled");
    } catch { setFeatureEnabled(!next); toast.error("Failed to update FY setting"); }
  };

  // Build search results from query
  const results: SearchResult[] = search.trim().length < 1 ? [] : (() => {
    const q = search.toLowerCase().trim();
    const matched: SearchResult[] = [];

    // Static sections (tabs + section headers)
    STATIC_SECTIONS.forEach((s, i) => {
      if (s.label.toLowerCase().includes(q) || s.sublabel?.toLowerCase().includes(q)) {
        matched.push({ ...s, id: `static-${i}` });
      }
    });

    // Live users
    users.forEach((u) => {
      if (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.loginId.toLowerCase().includes(q)
      ) {
        matched.push({
          id: `user-${u.id}`,
          type: "user",
          label: u.name,
          sublabel: u.email || u.loginId,
          tabIndex: 1,
          sectionId: "section-users",
          icon: "👤",
        });
      }
    });

    return matched.slice(0, 12);
  })();

  useEffect(() => { setHighlightedIdx(0); }, [search]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectResult = useCallback((result: SearchResult) => {
    onSelect(result.tabIndex, result.sectionId);
    setSearch("");
    setShowDropdown(false);
    inputRef.current?.blur();
  }, [onSelect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlightedIdx((i) => Math.min(i + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setHighlightedIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter")     { e.preventDefault(); selectResult(results[highlightedIdx]); }
    if (e.key === "Escape")    { setShowDropdown(false); setSearch(""); inputRef.current?.blur(); }
  };

  // Group results by type for display
  const tabResults     = results.filter((r) => r.type === "tab");
  const sectionResults = results.filter((r) => r.type === "section");
  const userResults    = results.filter((r) => r.type === "user");

  // ── Mobile list ──────────────────────────────────────────────────────────
  if (mobile) {
    return (
      <div className="pb-4 px-3">
        <div className="overflow-hidden border border-[var(--color-border)] bg-card" style={{ borderRadius: "12px" }}>
          {SETTINGS_TABS.map((tab, index) => {
            const isGeneral = index === 0;
            const isLast = index === SETTINGS_TABS.length - 1;
            const rowClass = "w-full flex items-center gap-3 px-4 hover:bg-[var(--color-hover)] transition-colors text-left active:opacity-60";
            const rowStyle = { minHeight: "52px", paddingTop: "10px", paddingBottom: "10px", borderBottom: isLast ? "none" : "1px solid var(--color-border)" };
            const rowInner = (
              <>
                <span className={`flex items-center justify-center flex-shrink-0 ${tab.iconBg}`} style={{ width: "29px", height: "29px", borderRadius: "6.5px" }}>
                  {tab.icon}
                </span>
                <span className="flex-1 text-[16px] font-normal text-default">{tab.label}</span>
                {isGeneral ? (
                  isLoaded ? (
                    <InlineToggle checked={settings.enabled} onChange={handleToggle} />
                  ) : (
                    <div className="rounded-full bg-[var(--color-border)] opacity-40" style={{ width: "44px", height: "24px" }} />
                  )
                ) : (
                  <svg width="8" height="14" viewBox="0 0 8 14" fill="none" style={{ color: "#C7C7CC", flexShrink: 0 }}>
                    <path d="M1 1l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </>
            );
            if (isGeneral) {
              return <div key={tab.label} className={rowClass} style={{ ...rowStyle, cursor: "pointer" }} onClick={() => onSelect(index)}>{rowInner}</div>;
            }
            return <button key={tab.label} type="button" onClick={() => onSelect(index)} className={rowClass} style={rowStyle}>{rowInner}</button>;
          })}
        </div>
      </div>
    );
  }

  // ── Desktop sidebar ──────────────────────────────────────────────────────
  const filteredTabs = search.trim()
    ? SETTINGS_TABS.filter((t) => t.label.toLowerCase().includes(search.toLowerCase()))
    : SETTINGS_TABS;

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", position: "relative" }}>

      {/* Search bar */}
      <div className="px-3 pb-3 flex-shrink-0">
        <div
          className="flex items-center gap-2 px-3"
          style={{ height: "34px", borderRadius: "9999px", backgroundColor: "rgba(128,128,128,0.18)" }}
        >
          <Search className="flex-shrink-0 text-faint" style={{ width: "14px", height: "14px", opacity: 0.7 }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search settings"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-[13px] text-default focus:outline-none settings-search"
            style={{ letterSpacing: "0.01em" }}
            autoComplete="off"
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(""); setShowDropdown(false); inputRef.current?.focus(); }}
              className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-faint hover:text-default transition-colors"
              style={{ backgroundColor: "rgba(128,128,128,0.3)" }}
            >
              <X style={{ width: "9px", height: "9px" }} />
            </button>
          )}
        </div>

        {/* ── Spotlight dropdown ── */}
        {showDropdown && search.trim().length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute left-3 right-3 z-50 rounded-2xl overflow-hidden border border-[var(--color-border)]"
            style={{
              top: "calc(34px + 8px)",
              backgroundColor: "var(--color-surface)",
              boxShadow: "0 8px 40px rgba(0,0,0,0.18), 0 2px 12px rgba(0,0,0,0.10)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }}
          >
            {results.length === 0 ? (
              <div className="px-4 py-5 text-center">
                <p className="text-[13px] text-faint">No results for "{search}"</p>
              </div>
            ) : (
              <div className="py-1.5 max-h-[320px] overflow-y-auto">
                {tabResults.length > 0 && (
                  <>
                    <DropdownGroup label="Settings" />
                    {tabResults.map((r) => {
                      const globalIdx = results.indexOf(r);
                      return (
                        <DropdownRow
                          key={r.id}
                          result={r}
                          highlighted={highlightedIdx === globalIdx}
                          onMouseEnter={() => setHighlightedIdx(globalIdx)}
                          onClick={() => selectResult(r)}
                        />
                      );
                    })}
                  </>
                )}
                {sectionResults.length > 0 && (
                  <>
                    <DropdownGroup label="Sections" />
                    {sectionResults.map((r) => {
                      const globalIdx = results.indexOf(r);
                      return (
                        <DropdownRow
                          key={r.id}
                          result={r}
                          highlighted={highlightedIdx === globalIdx}
                          onMouseEnter={() => setHighlightedIdx(globalIdx)}
                          onClick={() => selectResult(r)}
                        />
                      );
                    })}
                  </>
                )}
                {userResults.length > 0 && (
                  <>
                    <DropdownGroup label="Users" />
                    {userResults.map((r) => {
                      const globalIdx = results.indexOf(r);
                      return (
                        <DropdownRow
                          key={r.id}
                          result={r}
                          highlighted={highlightedIdx === globalIdx}
                          onMouseEnter={() => setHighlightedIdx(globalIdx)}
                          onClick={() => selectResult(r)}
                        />
                      );
                    })}
                  </>
                )}
              </div>
            )}

            {/* Footer hint */}
            {results.length > 0 && (
              <div className="px-3 py-2 border-t border-[var(--color-border)] flex items-center gap-3 bg-[var(--color-hover)]">
                <span className="text-[10px] text-faint">↑↓ navigate</span>
                <span className="text-[10px] text-faint">↵ select</span>
                <span className="text-[10px] text-faint">esc close</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-[2px] px-2 overflow-y-auto" style={{ flex: "1 1 0", minHeight: 0 }}>
        {filteredTabs.length === 0 && (
          <p className="px-3 py-4 text-[13px] text-faint text-center">No results</p>
        )}
        {filteredTabs.map((tab) => {
          const index = SETTINGS_TABS.indexOf(tab);
          const isActive = activeTab === index;
          return (
            <button
              key={tab.label}
              type="button"
              onClick={() => onSelect(index)}
              className={`w-full flex items-center gap-3 rounded-[10px] px-3 text-left transition-all duration-150 ${
                isActive ? "bg-[#007AFF] shadow-sm" : "hover:bg-[var(--color-hover)]"
              }`}
              style={{ height: "40px" }}
            >
              <span
                className={`flex items-center justify-center flex-shrink-0 transition-all ${isActive ? tab.activeIconBg : tab.iconBg}`}
                style={{ width: "28px", height: "28px", borderRadius: "7px" }}
              >
                {tab.icon}
              </span>
              <span className={`flex-1 text-[13.5px] font-medium transition-colors ${isActive ? "text-white" : "text-default"}`}>
                {tab.label}
              </span>
              {!isActive && (
                <svg width="7" height="12" viewBox="0 0 7 12" fill="none" className="flex-shrink-0 text-faint opacity-40">
                  <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/** Single dropdown result row */
function DropdownRow({
  result,
  highlighted,
  onMouseEnter,
  onClick,
}: {
  result: SearchResult;
  highlighted: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  const tabLabel = ["General", "Access & Users", "Custom Fields"][result.tabIndex] ?? "";
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors"
      style={{ backgroundColor: highlighted ? "var(--color-hover)" : "transparent" }}
    >
      {/* Icon */}
      <span className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[15px]"
        style={{ backgroundColor: highlighted ? "rgba(0,122,255,0.12)" : "var(--color-hover)" }}>
        {result.icon}
      </span>

      {/* Label + sublabel */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-default truncate">{result.label}</p>
        {result.sublabel && (
          <p className="text-[11px] text-faint truncate">{result.sublabel}</p>
        )}
      </div>

      {/* Tab breadcrumb */}
      {result.type !== "tab" && (
        <span className="flex-shrink-0 text-[10px] text-faint px-1.5 py-0.5 rounded border border-[var(--color-border)]">
          {tabLabel}
        </span>
      )}

      {/* Arrow */}
      {highlighted && (
        <svg width="6" height="10" viewBox="0 0 6 10" fill="none" className="flex-shrink-0 text-faint">
          <path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  );
}

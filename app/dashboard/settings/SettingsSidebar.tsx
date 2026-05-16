"use client";
import { CalendarDays, UserPlus, LayoutList, ChevronRight } from "lucide-react";
import { useFinancialYearPreference } from "@/app/providers";
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
    icon: <CalendarDays className="w-[17px] h-[17px]" />,
    iconBg: "bg-brand-500 text-white",
    activeIconBg: "bg-white/25 text-white",
  },
  {
    label: "Access & Users",
    icon: <UserPlus className="w-[17px] h-[17px]" />,
    iconBg: "bg-indigo-500 text-white",
    activeIconBg: "bg-white/25 text-white",
  },
  {
    label: "Custom Fields",
    icon: <LayoutList className="w-[17px] h-[17px]" />,
    iconBg: "bg-emerald-500 text-white",
    activeIconBg: "bg-white/25 text-white",
  },
];

/** Inline iOS-style toggle — used in the General row */
function InlineToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${
        checked ? "bg-[#34C759]" : "bg-[var(--color-border)]"
      }`}
      style={{
        width: "44px",
        height: "24px",
        boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.1)",
      }}
    >
      <span
        className={`inline-block rounded-full bg-white transition-transform duration-200`}
        style={{
          width: "20px",
          height: "20px",
          marginTop: "2px",
          transform: checked ? "translateX(21px)" : "translateX(2px)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(0,0,0,0.06)",
        }}
      />
    </button>
  );
}

interface SettingsSidebarProps {
  activeTab: number;
  onSelect: (index: number) => void;
  mobile?: boolean;
}

export default function SettingsSidebar({
  activeTab,
  onSelect,
  mobile = false,
}: SettingsSidebarProps) {
  const { settings, setFeatureEnabled, isLoaded } = useFinancialYearPreference();

  const handleToggle = async (e: React.MouseEvent) => {
    // Stop propagation so the row click (navigate) doesn't fire
    e.stopPropagation();
    const next = !settings.enabled;
    setFeatureEnabled(next);
    try {
      const response = await fetch("/api/financial-year-preference", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            ...settings,
            enabled: next,
            pendingReminderCurrentFy: next ? settings.pendingReminderCurrentFy : null,
          },
        }),
      });
      if (!response.ok) {
        // Revert on failure
        setFeatureEnabled(!next);
        toast.error("Failed to update FY setting");
      } else {
        toast.success(next ? "FY override enabled" : "FY override disabled");
      }
    } catch {
      setFeatureEnabled(!next);
      toast.error("Failed to update FY setting");
    }
  };

  if (mobile) {
    return (
      <div className="pb-4 px-3">
        <div
          className="overflow-hidden border border-[var(--color-border)] bg-card"
          style={{ borderRadius: "12px" }}
        >
          {SETTINGS_TABS.map((tab, index) => {
            const isGeneral = index === 0;
            const rowClass = "w-full flex items-center gap-3 px-4 hover:bg-[var(--color-hover)] transition-colors text-left active:opacity-60";
            const rowStyle = { minHeight: "52px", paddingTop: "10px", paddingBottom: "10px" };
            const rowInner = (
              <>
                {/* iOS squircle icon */}
                <span
                  className={`flex items-center justify-center flex-shrink-0 ${tab.iconBg}`}
                  style={{ width: "29px", height: "29px", borderRadius: "6.5px" }}
                >
                  {tab.icon}
                </span>
                <span className="flex-1 text-[16px] font-normal text-default">
                  {tab.label}
                </span>
                {/* General row: FY toggle; others: chevron */}
                {isGeneral ? (
                  isLoaded ? (
                    <InlineToggle checked={settings.enabled} onChange={handleToggle} />
                  ) : (
                    <div
                      className="rounded-full bg-[var(--color-border)] opacity-40"
                      style={{ width: "44px", height: "24px" }}
                    />
                  )
                ) : (
                  <ChevronRight
                    className="flex-shrink-0"
                    style={{ width: "14px", height: "14px", color: "#C7C7CC", strokeWidth: 2.5 }}
                  />
                )}
              </>
            );

            // General row: use <div> to avoid button-in-button.
            // Row click navigates; toggle stopPropagation prevents it from also navigating.
            if (isGeneral) {
              return (
                <div
                  key={tab.label}
                  className={rowClass}
                  style={{ ...rowStyle, cursor: "pointer" }}
                  onClick={() => onSelect(index)}
                >
                  {rowInner}
                </div>
              );
            }

            return (
              <button
                key={tab.label}
                type="button"
                onClick={() => onSelect(index)}
                className={rowClass}
                style={rowStyle}
              >
                {rowInner}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Desktop / iPad sidebar ──
  return (
    <nav className="flex flex-col gap-0.5 px-2 py-1">
      {SETTINGS_TABS.map((tab, index) => {
        const isActive = activeTab === index;
        const isGeneral = index === 0;
        return (
          <button
            key={tab.label}
            type="button"
            onClick={() => onSelect(index)}
            className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150 ${
              isActive ? "bg-[#007AFF] shadow-sm" : "hover:bg-[var(--color-hover)]"
            }`}
          >
            <span
              className={`w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0 transition-all ${
                isActive ? tab.activeIconBg : tab.iconBg
              }`}
            >
              {tab.icon}
            </span>
            <span
              className={`flex-1 text-sm font-medium transition-colors ${
                isActive ? "text-white" : "text-default"
              }`}
            >
              {tab.label}
            </span>
            <ChevronRight
              className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${
                isActive ? "text-white/60" : "text-faint"
              }`}
            />
          </button>
        );
      })}
    </nav>
  );
}

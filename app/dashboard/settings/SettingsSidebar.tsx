"use client";
import { CalendarDays, UserPlus, LayoutList, ChevronRight } from "lucide-react";

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

interface SettingsSidebarProps {
  activeTab: number;
  onSelect: (index: number) => void;
  mobile?: boolean;
}

export default function SettingsSidebar({ activeTab, onSelect, mobile = false }: SettingsSidebarProps) {
  if (mobile) {
    return (
      // No top "SETTINGS" label here — the large title in SettingsShell handles it
      <div className="pb-4 px-3">
        <div
          className="overflow-hidden border border-[var(--color-border)] bg-card"
          style={{ borderRadius: "12px" }}
        >
          {SETTINGS_TABS.map((tab, index) => {
            const isLast = index === SETTINGS_TABS.length - 1;
            return (
              <button
                key={tab.label}
                type="button"
                onClick={() => onSelect(index)}
                className="w-full flex items-center gap-3 px-4 hover:bg-[var(--color-hover)] transition-colors text-left active:opacity-60"
                style={{ minHeight: "52px", paddingTop: "10px", paddingBottom: "10px" }}
              >
                {/* iOS squircle icon */}
                <span
                  className={`flex items-center justify-center flex-shrink-0 ${tab.iconBg}`}
                  style={{
                    width: "29px",
                    height: "29px",
                    borderRadius: "6.5px",
                  }}
                >
                  {tab.icon}
                </span>

                <span className="flex-1 text-[16px] font-normal text-default">{tab.label}</span>

                {/* iOS chevron: grey, slightly heavier */}
                <ChevronRight
                  className="flex-shrink-0"
                  style={{ width: "14px", height: "14px", color: "#C7C7CC", strokeWidth: 2.5 }}
                />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // iPad / desktop sidebar — unchanged
  return (
    <nav className="flex flex-col gap-0.5 px-2 py-1">
      {SETTINGS_TABS.map((tab, index) => {
        const isActive = activeTab === index;
        return (
          <button
            key={tab.label}
            type="button"
            onClick={() => onSelect(index)}
            className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150 ${
              isActive
                ? "bg-[#007AFF] shadow-sm"
                : "hover:bg-[var(--color-hover)]"
            }`}
          >
            <span className={`w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0 transition-all ${
              isActive ? tab.activeIconBg : tab.iconBg
            }`}>
              {tab.icon}
            </span>
            <span className={`flex-1 text-sm font-medium transition-colors ${isActive ? "text-white" : "text-default"}`}>
              {tab.label}
            </span>
            <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${isActive ? "text-white/60" : "text-faint"}`} />
          </button>
        );
      })}
    </nav>
  );
}

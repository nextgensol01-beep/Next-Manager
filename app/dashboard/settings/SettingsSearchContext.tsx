"use client";
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type SearchResult = {
  id: string;
  type: "tab" | "section" | "user" | "field";
  label: string;
  sublabel?: string;
  tabIndex: number;        // which tab to navigate to
  sectionId?: string;      // optional DOM id to scroll to after navigation
  icon?: string;           // emoji or lucide name hint
};

type SettingsSearchContextType = {
  users: { id: string; name: string; email: string; loginId: string }[];
  setUsers: (users: { id: string; name: string; email: string; loginId: string }[]) => void;
};

const SettingsSearchContext = createContext<SettingsSearchContextType>({
  users: [],
  setUsers: () => {},
});

export function SettingsSearchProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<{ id: string; name: string; email: string; loginId: string }[]>([]);
  return (
    <SettingsSearchContext.Provider value={{ users, setUsers }}>
      {children}
    </SettingsSearchContext.Provider>
  );
}

export function useSettingsSearch() {
  return useContext(SettingsSearchContext);
}

// Static searchable sections per tab
export const STATIC_SECTIONS: Omit<SearchResult, "id">[] = [
  // Tab 0 — General
  { type: "tab",     label: "General",            tabIndex: 0, icon: "📅" },
  { type: "section", label: "Financial Year",     tabIndex: 0, sectionId: "section-fy",       sublabel: "General", icon: "📅" },
  { type: "section", label: "FY Override",        tabIndex: 0, sectionId: "section-fy",       sublabel: "General", icon: "📅" },
  { type: "section", label: "About Reminders",    tabIndex: 0, sectionId: "section-reminders", sublabel: "General", icon: "🔔" },
  { type: "section", label: "Current Status",     tabIndex: 0, sectionId: "section-status",   sublabel: "General", icon: "📊" },
  { type: "section", label: "How It Works",       tabIndex: 0, sectionId: "section-how",      sublabel: "General", icon: "ℹ️" },
  // Tab 1 — Access & Users
  { type: "tab",     label: "Access & Users",     tabIndex: 1, icon: "👥" },
  { type: "section", label: "Users",              tabIndex: 1, sectionId: "section-users",    sublabel: "Access & Users", icon: "👤" },
  { type: "section", label: "Active Sessions",    tabIndex: 1, sectionId: "section-sessions", sublabel: "Access & Users", icon: "🖥" },
  { type: "section", label: "Add New User",       tabIndex: 1, sectionId: "section-users",    sublabel: "Access & Users", icon: "➕" },
  // Tab 2 — Custom Fields
  { type: "tab",     label: "Custom Fields",      tabIndex: 2, icon: "🗂" },
  { type: "section", label: "Client Fields",      tabIndex: 2, sectionId: "section-fields",   sublabel: "Custom Fields", icon: "🗂" },
  { type: "section", label: "Add Custom Field",   tabIndex: 2, sectionId: "section-fields",   sublabel: "Custom Fields", icon: "➕" },
];

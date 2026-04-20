"use client";
import { useCallback, useState } from "react";
import { Session } from "next-auth";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

export default function DashboardShell({ session, children }: { session: Session; children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const handleSidebarClose = useCallback(() => {
    setSidebarOpen(false);
  }, []);
  const handleMenuClick = useCallback(() => {
    setSidebarOpen((open) => !open);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-surface transition-colors">
      <Sidebar open={sidebarOpen} onClose={handleSidebarClose} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar session={session} onMenuClick={handleMenuClick} sidebarOpen={sidebarOpen} />
        <main id="dashboard-scroll-area" className="flex-1 overflow-y-auto p-4 md:p-6 page-fade-in">{children}</main>
      </div>
    </div>
  );
}

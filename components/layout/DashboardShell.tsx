"use client";
import { useCallback, useState } from "react";
import { Session } from "next-auth";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { EmailDeliveryActivityProvider } from "@/components/client-trackers/EmailDeliveryActivityProvider";

export default function DashboardShell({ session, children }: { session: Session; children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const handleSidebarClose = useCallback(() => {
    setSidebarOpen(false);
  }, []);
  const handleMenuClick = useCallback(() => {
    setSidebarOpen((open) => !open);
  }, []);

  return (
    <EmailDeliveryActivityProvider enabled={(session.user as { role?: string } | undefined)?.role === "admin"}>
    <div className="dashboard-shell flex bg-surface transition-colors">
      <Sidebar open={sidebarOpen} onClose={handleSidebarClose} />
      <div className="dashboard-content flex-1 flex flex-col min-w-0">
        <TopBar session={session} onMenuClick={handleMenuClick} sidebarOpen={sidebarOpen} />
        <main id="dashboard-scroll-area" className="dashboard-main flex-1 p-4 md:p-6 page-fade-in">{children}</main>
      </div>
    </div>
    </EmailDeliveryActivityProvider>
  );
}

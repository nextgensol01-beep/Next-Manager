import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "react-hot-toast";
import ReportStudio from "@/app/dashboard/reports/ReportStudio";

function Fixture() {
  const [fy, setFy] = useState("2025-26");
  return <SessionProvider session={null}><main className="p-3 sm:p-6"><ReportStudio fy={fy} ready customFields={[]} onFyChange={setFy}
    onOpenCustomExport={() => {}} onDownloadQuickReport={() => {}} quickDownloading={[]} /><Toaster /></main></SessionProvider>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);

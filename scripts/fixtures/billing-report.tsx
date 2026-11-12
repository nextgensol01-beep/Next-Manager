import React from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "react-hot-toast";
import BillingReport from "@/app/dashboard/reports/BillingReport";
createRoot(document.getElementById("root")!).render(<main className="reports-page report-workspace mx-auto max-w-7xl p-3 sm:p-6"><BillingReport financialYear="2025-26" ready /><Toaster /></main>);

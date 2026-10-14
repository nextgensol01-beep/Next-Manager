import React from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "react-hot-toast";
import ClientProfilePage from "@/app/dashboard/clients/[clientId]/page";
import FinancialYearPage from "@/app/dashboard/financial-year/page";
import { FinancialYearFixtureProvider } from "./financial-year-providers";
createRoot(document.getElementById("root")!).render(
  <FinancialYearFixtureProvider>
    {location.pathname.includes("/clients/") ? (
      <ClientProfilePage />
    ) : (
      <FinancialYearPage />
    )}
    <Toaster />
  </FinancialYearFixtureProvider>,
);

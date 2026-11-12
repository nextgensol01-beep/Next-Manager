import React from "react";
import { createRoot } from "react-dom/client";
import Providers from "@/app/providers";
import AccessPanel from "@/app/dashboard/settings/AccessPanel";
import { SettingsSearchProvider } from "@/app/dashboard/settings/SettingsSearchContext";

createRoot(document.getElementById("root")!).render(<Providers><SettingsSearchProvider><div id="dashboard-scroll-area" style={{ maxWidth: 960, margin: "auto", padding: 16 }}><AccessPanel /></div></SettingsSearchProvider></Providers>);

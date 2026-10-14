import React from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "react-hot-toast";
import Page from "../../app/dashboard/client-trackers/page";

createRoot(document.getElementById("root")!).render(<React.StrictMode><Page /><Toaster /></React.StrictMode>);

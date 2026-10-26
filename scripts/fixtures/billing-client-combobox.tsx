import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import BillingModal from "@/app/dashboard/billing/BillingModal";
import type { Billing, Client } from "@/app/dashboard/billing/types";

const categories = ["Producer", "Importer", "Brand Owner", "PWP"];
const clients: Client[] = Array.from({ length: 5000 }, (_, i) => ({
  clientId: `TEST-${String(i).padStart(5, "0")}`,
  companyName: i < 2 ? "Fictional Duplicate Industries" : `Fictional ${categories[i % 4]} Company ${i}`,
  category: categories[i % 4],
}));
const editing: Billing = {
  _id: "fictional-bill", clientId: "TEST-00001", financialYear: "2025-26", billType: "general",
  billTitle: "Fictional service", billDate: "2026-10-23", govtCharges: 0, consultancyCharges: 0,
  targetCharges: 0, otherCharges: 0, totalAmount: 236, totalPaid: 0, pendingAmount: 236, paymentStatus: "unpaid",
  lineItems: [{ description: "Fictional service", quantity: 2, rate: 100, taxableAmount: 200, gstPercent: 18, gstAmount: 36, totalAmount: 236 }],
};
function App() {
  const [open, setOpen] = useState(true);
  const params = new URLSearchParams(location.search);
  return <>
    <button id="reopen" onClick={() => setOpen(true)}>Open billing fixture</button>
    <BillingModal open={open} clients={params.has("missing") ? clients.slice(2) : clients}
      editingBilling={params.has("edit") ? editing : null} fy="2025-26"
      onClose={() => setOpen(false)} onSaved={() => setOpen(false)} />
  </>;
}
createRoot(document.getElementById("root")!).render(<App />);

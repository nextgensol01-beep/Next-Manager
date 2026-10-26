import React, { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { EmailDeliveryActivityProvider, useEmailDeliveryActivity } from "@/components/client-trackers/EmailDeliveryActivityProvider";
function Pages() {
  const [page, setPage] = useState("Tracker");
  const activity = useEmailDeliveryActivity();
  (window as any).deliveryFixture = { observe: activity.observe };
  return <main><h1>{page}</h1>{["reports", "clients", "settings", "client-trackers/other"].map(route => <button key={route} onClick={() => { history.pushState(null, "", "/dashboard/" + route); setPage(route === "reports" ? "Reports" : route); }}>Navigate to {route}</button>)}
    <button onClick={activity.showHistory}>Delivery history</button>
    <button onClick={async () => { const response = await fetch("/api/email-delivery/jobs/campaign-first"); const result = await response.json(); activity.watch(result.job); }}>Start fixture campaign</button>
    <p>Keep this website open while sending. Internal navigation preserves coordination.</p></main>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><EmailDeliveryActivityProvider><Pages /></EmailDeliveryActivityProvider></StrictMode>);

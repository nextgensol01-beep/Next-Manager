import React, { Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import Detail from "@/app/dashboard/client-trackers/[id]/page";
import Listing from "@/app/dashboard/client-trackers/page";
import TrackerModal from "@/components/client-trackers/TrackerModal";
import HoldToSendButton from "@/components/client-trackers/HoldToSendButton";
import { EmailDeliveryActivityProvider } from "@/components/client-trackers/EmailDeliveryActivityProvider";

const params = Promise.resolve({ id: "0123456789abcdef01234567" });
function HoldFixture() {
  const [open, setOpen] = useState(true), [epoch, setEpoch] = useState(0);
  (window as any).reopenHold = () => { setEpoch(value => value + 1); setOpen(true); };
  return open ? <TrackerModal open onClose={() => setOpen(false)} title="Safe hold fixture" size="md"
    footer={<div className="tracker-modal-footer"><button onClick={() => setOpen(false)}>Cancel</button></div>}>
    <div className="p-5"><HoldToSendButton key={epoch} count={3} onCommit={() => { (window as any).mockCommits = ((window as any).mockCommits || 0) + 1; }} /></div>
  </TrackerModal> : null;
}
function App() {
  const view = new URLSearchParams(location.search).get("view");
  if (view === "hold") return <HoldFixture />;
  if (view === "dock") return <EmailDeliveryActivityProvider><div className="client-trackers-page p-4"><h1>Tracker progress fixture</h1></div></EmailDeliveryActivityProvider>;
  return <main id="dashboard-scroll-area" className="p-4"><Suspense fallback={<p>Loading fixture…</p>}>
    {view === "list" ? <Listing /> : <Detail params={params} />}
  </Suspense></main>;
}
createRoot(document.getElementById("root")!).render(<App />);

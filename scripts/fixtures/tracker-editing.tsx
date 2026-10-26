import React, { Profiler, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "react-hot-toast";
import ClientTrackerDetailPage from "@/app/dashboard/client-trackers/[id]/page";

const params = Promise.resolve({ id: "0123456789abcdef01234567" });
const measurements = globalThis as typeof globalThis & { trackerCommits: number[] };
measurements.trackerCommits = [];
createRoot(document.getElementById("root")!).render(<>
  <Toaster />
  <Profiler id="tracker" onRender={(_id, _phase, duration) => measurements.trackerCommits.push(duration)}>
    <Suspense fallback={<p>Loading fixture…</p>}><ClientTrackerDetailPage params={params} /></Suspense>
  </Profiler>
</>);

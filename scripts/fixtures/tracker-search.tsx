import React, { Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import ClientTrackerDetailPage from "@/app/dashboard/client-trackers/[id]/page";
import { useFreshTrackerData } from "@/lib/useFreshTrackerData";

const opening = new URLSearchParams(location.search).has("opening");
type PendingRead = { url: string; cache?: RequestCache; complete: (value: number, fail?: boolean) => void };
declare global {
  interface Window {
    freshReads: PendingRead[];
    freshControls: { next: (key: string) => void; pause: (value: boolean) => void; mutate: (value: { value: number }) => void; refetch: () => Promise<void> };
    setTrackerMounted: (value: boolean) => void;
  }
}
if (opening) {
  const actualFetch = window.fetch.bind(window);
  window.freshReads = [];
  window.fetch = (input, init) => String(input).startsWith("/fixture/fresh/")
    // Deliberately ignore abort: request generations must still reject late responses.
    ? new Promise(resolve => window.freshReads.push({ url: String(input), cache: init?.cache,
      complete: (value, fail) => resolve(Response.json(fail ? { error: "Fixture failure" } : { value }, { status: fail ? 500 : 200 })) }))
    : actualFetch(input, init);
}
function FreshHarness() {
  const [key, next] = useState("first");
  const [paused, pause] = useState(false);
  const resource = useFreshTrackerData<{ value: number }>(`/fixture/fresh/${key}`, "harness", { paused });
  window.freshControls = { next, pause, mutate: resource.mutate, refetch: resource.refetch };
  return <output id="fresh-result">{JSON.stringify({ data: resource.data, loading: resource.loading, error: resource.error })}</output>;
}
function App() {
  const [mounted, setMounted] = useState(true);
  window.setTrackerMounted = setMounted;
  return <>
    {mounted && <Suspense fallback={<p>Loading fixture…</p>}><ClientTrackerDetailPage params={params} /></Suspense>}
    {opening && <FreshHarness />}
  </>;
}

const params = Promise.resolve({ id: "0123456789abcdef01234567" });
createRoot(document.getElementById("root")!).render(<App />);

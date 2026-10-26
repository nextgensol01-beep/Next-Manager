import React, { Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Context } from "./tracker-navigation-router.cjs";
import { TrackerNavigationTransitionProvider } from "@/components/client-trackers/TrackerNavigationTransition";
import Listing from "@/app/dashboard/client-trackers/page";
import Detail from "@/app/dashboard/client-trackers/[id]/page";
import { invalidate } from "@/lib/useCache";

const promises = new Map<string, Promise<{ id: string }>>();
let paramDelay = 0;
function params(id: string) {
  if (!promises.has(id)) promises.set(id, paramDelay ? new Promise(resolve => setTimeout(() => resolve({ id }), paramDelay)) : Promise.resolve({ id }));
  return promises.get(id)!;
}
function Fixture() {
  const [route, setRoute] = useState(location.pathname);
  useEffect(() => {
    const listener = () => setRoute(location.pathname);
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);
  (window as any).navigationFixture = {
    invalidateList() { invalidate("/api/client-trackers"); invalidate("/api/client-trackers?status=archived"); },
    setParamDelay(value: number) { paramDelay = value; },
    go(path: string, replace = false) {
      history[replace ? "replaceState" : "pushState"]({}, "", path);
      setRoute(path);
    },
  };
  const id = route.split("/")[3];
  return <Context.Provider value={route}>
    <aside id="fixture-sidebar">NextGen · Client Trackers</aside>
    <header id="fixture-topbar">NextGen Solutions</header>
    <main id="dashboard-scroll-area" className="fixture-main">
      {route.startsWith("/dashboard/client-trackers") ? <TrackerNavigationTransitionProvider>
        <Suspense fallback={<p>Route loading…</p>}>
          {id ? <Detail key={id} params={params(id)} /> : <Listing />}
        </Suspense>
      </TrackerNavigationTransitionProvider> : <h1>Other dashboard page</h1>}
    </main>
  </Context.Provider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);

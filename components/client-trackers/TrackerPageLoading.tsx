"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, Search, Users } from "lucide-react";
import { CLIENT_TRACKER_DETAIL_OPTIONS } from "@/lib/clientTrackers";
import { TrackerTransitionLink, useTrackerNavigation } from "./TrackerNavigationTransition";

/** Establish real workspace regions immediately. Only unresolved feedback is delayed. */
export default function TrackerPageLoading({ trackerId, hasActivity = false }: { trackerId?: string; hasActivity?: boolean }) {
  const pathname = usePathname();
  const id = trackerId || pathname?.split("/")[3] || "";
  const navigation = useTrackerNavigation();
  const identity = navigation?.identity(id);
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    navigation?.workspaceReady();
    const node = root.current;
    return () => { if (node) navigation?.retainLoadingSurface(node); };
  }, [navigation, id]);
  const fields = identity?.fields || [];
  const summaries = fields.filter(field => ["status", "toggle", "select"].includes(field.type));
  const columns = identity?.clientColumns || ["state"];
  return (
    <div ref={root} className="client-trackers-page space-y-5" data-tracker-workspace-shell={id || "loading"} data-tracker-loading-shell aria-busy="true">
      <header className="tracker-page-header" data-tracker-detail-heading={identity ? id : undefined} data-tracker-loading-identity>
        <div className="min-w-0">
          <TrackerTransitionLink trackerId={id} direction="close" href="/dashboard/client-trackers" className="tracker-back-link">
            <ArrowLeft className="h-3.5 w-3.5" /> All trackers
          </TrackerTransitionLink>
          <h1 data-tracker-title tabIndex={-1}>
            {identity?.name || <span className="tracker-loading-feedback"><span className="sr-only">Loading tracker</span><span aria-hidden="true" className="tracker-loading-placeholder" style={{ width: 180, height: 24 }} /></span>}
          </h1>
          <p data-tracker-description>{identity ? identity.description || "Client task worklist" : <span aria-hidden="true" className="tracker-loading-placeholder tracker-loading-feedback" style={{ width: 130 }} />}</p>
        </div>
      </header>
      <section className="tracker-premium-summary tracker-loading-region">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
          {identity?.entryCount !== undefined ? <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" /> {identity.entryCount} clients</span> : <span aria-hidden="true" className="tracker-loading-placeholder tracker-loading-feedback" />}
          {identity?.financialYear && <span>Financial year: <strong className="text-default">{identity.financialYear}</strong></span>}
          {identity?.fields && <span>{fields.length} tracker columns</span>}
        </div>
      </section>
      {hasActivity && <section className="tracker-activity-panel"><div className="tracker-activity-trigger"><span><strong>Recent activity</strong><small>Latest tracker updates</small></span><span className="tracker-loading-feedback text-xs text-muted">Loading activity…</span></div></section>}
      {summaries.length > 0 && <section className="tracker-status-strip">
        {summaries.map(field => <article key={field.key} className="tracker-status-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{field.label}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(field.type === "toggle" ? ["Yes", "No"] : field.options || []).map(value => <span key={value} className="tracker-status-value bg-surface text-default"><span className="block text-lg font-bold">—</span><span className="text-xs">{value}</span></span>)}
          </div>
          <p className="mt-2 text-xs text-muted tracker-loading-feedback">Updating totals…</p>
        </article>)}
      </section>}
      <section className="overflow-hidden rounded-2xl border border-base bg-card" data-tracker-loading-records>
        <div className="flex flex-col gap-3 border-b border-base p-4 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="font-semibold text-default">Client marks</h2><p className="text-sm text-muted"><span className="tracker-loading-feedback">Loading client records…</span></p></div>
          <div className="flex flex-wrap gap-2" aria-hidden="true"><span className="tracker-table-control">All clients</span><span className="tracker-table-control inline-flex items-center gap-2"><Search className="h-4 w-4" /> Find client</span></div>
        </div>
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-surface text-xs uppercase tracking-wide text-muted"><tr>
          <th className="w-10 px-3 py-3" /><th className="px-4 py-3 font-semibold">Client</th><th className="px-4 py-3 font-semibold">Category</th>
          {columns.map(column => <th key={column} className="min-w-32 px-4 py-3 font-semibold">{CLIENT_TRACKER_DETAIL_OPTIONS.find(option => option.key === column)?.label || column}</th>)}
          {fields.map(field => <th key={field.key} className="min-w-36 px-4 py-3 font-semibold">{field.label}</th>)}
          <th className="px-4 py-3 font-semibold">Updated</th>
        </tr></thead></table></div>
        <div className="tracker-loading-records" role="status" aria-label="Loading tracker">
          <span className="tracker-loading-feedback text-sm text-muted">Loading client records…</span>
        </div>
      </section>
    </div>
  );
}

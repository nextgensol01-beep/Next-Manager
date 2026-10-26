"use client";
import { useClientSearch } from "@/lib/search/use-client-search";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import type { TrackerBuilderClient } from "@/lib/tracker-create";
import { BuilderSection } from "../create/BuilderControls";

export default function TrackerClientManager({ clients, selectedIds, baselineIds, loading, error, categorySync, onChange }: {
  clients: TrackerBuilderClient[]; selectedIds: string[]; baselineIds: string[];
  loading: boolean; error: string | null; categorySync?: string; onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("all"), [limit, setLimit] = useState(100);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const matchedClientIds = useClientSearch(clients, query);
  const matching = useMemo(() => {
    const term = query.trim().toLowerCase();
    return clients.filter(client => (filter !== "selected" || selected.has(client.clientId))
      && (!term || matchedClientIds.has(client.clientId) || `${client.companyName} ${client.clientId} ${client.category}`.toLowerCase().includes(term)));
  }, [clients, query, filter, selected, matchedClientIds]);
  const removed = useMemo(() => baselineIds.filter(id => !selected.has(id)).length, [baselineIds, selected]);
  return <BuilderSection title="Clients in this tracker">
    <div className="configure-client-toolbar"><span aria-live="polite"><strong>{selectedIds.length}</strong> selected</span>
      <button type="button" className="create-text-action" disabled={loading || Boolean(error) || !clients.length}
        onClick={() => onChange(Array.from(new Set([...selectedIds, ...clients.map(client => client.clientId)])))}>Select all</button></div>
    <div className="configure-client-picker">
      <label className="create-client-search"><Search size={14} /><input aria-label="Search tracker clients" value={query} placeholder="Search name, client ID, or category"
        onChange={event => { setQuery(event.target.value); setLimit(100); }} /></label>
      <div className="configure-client-filters" role="group" aria-label="Client list filter">{["all", "selected"].map(value => <button type="button" key={value}
        aria-pressed={filter === value} onClick={() => { setFilter(value); setLimit(100); }}>{value === "all" ? "All" : "Selected"}</button>)}</div>
      <div className="create-client-results" role="group" aria-label="Tracker clients">
        {matching.slice(0, limit).map(client => <label key={client.clientId} className={`create-client-row ${selected.has(client.clientId) ? "is-selected" : ""}`}>
          <input type="checkbox" checked={selected.has(client.clientId)} disabled={loading || Boolean(error)} onChange={() => onChange(selected.has(client.clientId)
            ? selectedIds.filter(id => id !== client.clientId) : [...selectedIds, client.clientId])} />
          <span className="create-client-check"><Check size={12} /></span><span className="create-client-name">{client.companyName || client.clientId}<small>{client.clientId} · {client.category || "Client"}</small></span>
        </label>)}
        {!matching.length && <p className="create-picker-empty">{loading ? "Loading clients…" : "No clients match this view."}</p>}
        {matching.length > limit && <button type="button" className="create-text-action create-load-more" onClick={() => setLimit(value => value + 100)}>Show more · {limit} of {matching.length}</button>}
      </div>
    </div>
    {error && <p role="alert" className="create-error">Unable to load clients. Close Configure and try again.</p>}
    {!selectedIds.length && <p className="create-error">Keep at least one client in this tracker.</p>}
    {removed > 0 && <p className="configure-removal-note">{removed} client{removed === 1 ? "" : "s"} will leave this worklist. Their saved marks are kept for re-adding; Client Master is unchanged.</p>}
    {categorySync && <p className="create-help configure-sync-note">Auto Sync adds new matching clients for {categorySync}. Clients you remove stay excluded; saved marks are retained.</p>}
  </BuilderSection>;
}

"use client";
import { useClientSearch } from "@/lib/search/use-client-search";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import LiquidGlassDropdown from "@/components/ui/LiquidGlassDropdown";
import { CLIENT_TRACKER_CATEGORIES, type ClientTrackerCategory } from "@/lib/clientTrackers";
import { FINANCIAL_YEARS } from "@/lib/utils";
import { trackerNeedsFinancialYear, type TrackerBuilderClient, type TrackerCreateDraft, type TrackerCreateErrors } from "@/lib/tracker-create";
import { BuilderChoices, BuilderError, BuilderSection } from "./BuilderControls";

export default function TrackerAudienceSection({ form, clients, count, errors, loading, loadError, onChange }: {
  form: TrackerCreateDraft; clients: TrackerBuilderClient[]; count: number; errors: TrackerCreateErrors;
  loading: boolean; loadError: string | null; onChange: (form: TrackerCreateDraft) => void;
}) {
  const [query, setQuery] = useState(""), [limit, setLimit] = useState(100);
  const selected = useMemo(() => new Set(form.selected), [form.selected]);
  const matchedClientIds = useClientSearch(clients, query);
  const matching = useMemo(() => {
    const term = query.trim().toLowerCase();
    return clients.filter(client => !term || matchedClientIds.has(client.clientId) || `${client.companyName} ${client.clientId} ${client.category}`.toLowerCase().includes(term));
  }, [clients, query, matchedClientIds]);
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const client of clients) counts[client.category] = (counts[client.category] || 0) + 1;
    return counts;
  }, [clients]);
  const needsFY = trackerNeedsFinancialYear(form.fields);
  const patch = (change: Partial<TrackerCreateDraft>) => onChange({ ...form, ...change });
  const toggleCategory = (category: ClientTrackerCategory) => patch({ selectedCategories: form.selectedCategories.includes(category)
    ? form.selectedCategories.filter(value => value !== category) : [...form.selectedCategories, category] });
  return <BuilderSection title="Audience" description="Choose who this worklist starts with.">
    <div aria-describedby={errors.audience ? "create-audience-error" : undefined}>
      <BuilderChoices label="Client scope" value={form.scope} invalid={Boolean(errors.audience)} descriptionId={errors.audience ? "create-audience-error" : undefined} options={[
        { value: "all", label: "All clients", description: `${clients.length} clients` },
        { value: "categories", label: "By category", description: "Choose categories" },
        { value: "selected", label: "Specific clients", description: "Choose individually" },
      ]} onChange={scope => patch({ scope: scope as TrackerCreateDraft["scope"] })} />
    </div>
    <div className="create-audience-count" aria-live="polite"><strong>{loading ? "Loading clients…" : `${count} ${count === 1 ? "client" : "clients"}`}</strong><span>in this audience</span></div>
    {loadError && <p className="create-error" role="status">Client data could not be loaded.</p>}
    {form.scope === "categories" && <div className="create-audience-context">
      <div className="create-chips" role="group" aria-label="Client categories" aria-describedby={errors.audience ? "create-audience-error" : undefined}>
        {CLIENT_TRACKER_CATEGORIES.map(category => <button type="button" key={category} aria-pressed={form.selectedCategories.includes(category)}
          onClick={() => toggleCategory(category)} className={`create-chip ${form.selectedCategories.includes(category) ? "is-selected" : ""}`}>
          <span className="create-chip-check"><Check size={12} /></span>{category}<small>{categoryCounts[category] || 0}</small>
        </button>)}
      </div>
    </div>}
    {form.scope !== "selected" && <div className="create-membership"><span className="create-label">Client synchronization</span>
      <BuilderChoices label="Client synchronization" value={form.membershipMode} options={[
        { value: "snapshot", label: "Manual Sync" }, { value: "categorySync", label: "Auto Sync" },
      ]} onChange={membershipMode => patch({ membershipMode: membershipMode as TrackerCreateDraft["membershipMode"] })} />
      <p className="create-help">{form.membershipMode === "snapshot" ? "Add new clients only after reviewing them." : "Add future matching clients. Existing clients, marks and history are preserved. No emails are sent."}</p>
    </div>}
    {form.scope === "selected" && <div className="create-client-picker">
      <label className="create-client-search"><Search size={15} /><input aria-label="Search clients" placeholder="Search name, client ID, or category"
        value={query} onChange={event => { setQuery(event.target.value); setLimit(100); }} /></label>
      <div className="create-client-results" role="group" aria-label="Choose clients" aria-describedby={errors.audience ? "create-audience-error" : undefined}>
        {matching.slice(0, limit).map(client => <label key={client.clientId} className={`create-client-row ${selected.has(client.clientId) ? "is-selected" : ""}`}>
          <input type="checkbox" checked={selected.has(client.clientId)} onChange={() => patch({ selected: selected.has(client.clientId)
            ? form.selected.filter(value => value !== client.clientId) : [...form.selected, client.clientId] })} />
          <span className="create-client-check"><Check size={13} /></span><span className="create-client-name">{client.companyName}<small>{client.clientId} · {client.category}</small></span>
        </label>)}
        {!matching.length && <p className="create-picker-empty">{loading ? "Loading clients…" : clients.length ? "No clients match your search." : "No clients are currently available."}</p>}
        {matching.length > limit && <button type="button" className="create-text-action create-load-more" onClick={() => setLimit(value => value + 100)}>Show more · {limit} of {matching.length}</button>}
      </div>
      <p className="create-help">{form.selected.length} selected · Selections stay when you search.</p>
    </div>}
    <BuilderError id="create-audience-error">{errors.audience}</BuilderError>
    <div className="create-fy" aria-describedby={errors.financialYear ? "create-fy-error" : needsFY ? "create-fy-context" : undefined}>
      <div className="create-label">Financial year {needsFY && !form.financialYear ? <span className="create-required">Required</span> : <span className="create-optional">{needsFY ? "Required" : "Optional"}</span>}</div>
      <LiquidGlassDropdown label="Financial year" variant="condition" portal value={form.financialYear} required={needsFY} invalid={Boolean(errors.financialYear)}
        describedBy={errors.financialYear ? "create-fy-error" : needsFY && !form.financialYear ? "create-fy-context" : undefined} options={[
        { value: "", label: "Not tied to a FY" }, ...FINANCIAL_YEARS.map(year => ({ value: year, label: year })),
      ]} onChange={financialYear => patch({ financialYear })} />
      {needsFY && !form.financialYear && <p id="create-fy-context" className="create-help create-fy-reason">CPCB upload columns need a financial year to find the matching uploads.</p>}
      <BuilderError id="create-fy-error">{errors.financialYear}</BuilderError>
    </div>
  </BuilderSection>;
}

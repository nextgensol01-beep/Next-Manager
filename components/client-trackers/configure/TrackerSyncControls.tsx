"use client";
import { useRef, useState } from "react";
import { Check, Eye, LoaderCircle } from "lucide-react";
import { CLIENT_TRACKER_CATEGORIES } from "@/lib/clientTrackers";
import { readJsonResponse } from "@/lib/http-response";
import type { TrackerSyncDraft, TrackerSyncPreview } from "@/lib/tracker-sync";
import { BuilderChoices, BuilderSection } from "../create/BuilderControls";

export default function TrackerSyncControls({ trackerId, value, savedMode, onChange }: {
  trackerId: string; value: TrackerSyncDraft; savedMode?: string; onChange: (draft: TrackerSyncDraft) => void;
}) {
  const [preview, setPreview] = useState<TrackerSyncPreview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const generation = useRef(0);
  const patch = (change: Partial<TrackerSyncDraft>) => {
    generation.current++; setPreview(null); setError("");
    onChange({ ...value, ...change, syncRequested: false, syncPreviewToken: undefined, syncCount: undefined });
  };
  const inspect = async () => {
    const requestGeneration = ++generation.current;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/client-trackers/${trackerId}/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
      const result = await readJsonResponse(response);
      if (!response.ok) throw new Error(result.error || "Unable to preview clients.");
      if (requestGeneration === generation.current) setPreview(result);
    } catch (error) { if (requestGeneration === generation.current) setError(error instanceof Error ? error.message : "Unable to preview clients."); }
    finally { setBusy(false); }
  };
  return <BuilderSection title="Audience / Clients" description="Synchronization adds clients while preserving existing marks and history.">
    <BuilderChoices label="Eligible client audience" value={value.clientScope} options={[
      { value: "selected", label: "Specific clients" }, { value: "all", label: "All clients" }, { value: "categories", label: "By category" },
    ]} onChange={scope => patch({ clientScope: scope as TrackerSyncDraft["clientScope"], ...(scope === "selected" ? { clientMembershipMode: "snapshot" } : {}) })} />
    {value.clientScope === "categories" && <div className="create-chips" role="group" aria-label="Eligible categories">
      {CLIENT_TRACKER_CATEGORIES.map(category => <button type="button" key={category} aria-pressed={value.clientCategories.includes(category)}
        className={`create-chip ${value.clientCategories.includes(category) ? "is-selected" : ""}`}
        onClick={() => patch({ clientCategories: value.clientCategories.includes(category) ? value.clientCategories.filter(item => item !== category) : [...value.clientCategories, category] })}>
        <span className="create-chip-check"><Check size={12} /></span>{category}
      </button>)}
      {!value.clientCategories.length && <p className="create-error" role="alert">Choose at least one client category.</p>}
    </div>}
    {value.clientScope === "selected" ? <p className="create-help">Specific clients remain a fixed manual selection. Choose All clients or categories to enable Auto Sync.</p> : <>
      <span className="create-label">Client synchronization</span>
      <BuilderChoices label="Client synchronization" value={value.clientMembershipMode} options={[
        { value: "snapshot", label: "Manual Sync", description: "Review before adding clients" },
        { value: "categorySync", label: "Auto Sync", description: "Include future matching clients" },
      ]} onChange={mode => patch({ clientMembershipMode: mode as TrackerSyncDraft["clientMembershipMode"] })} />
      <p className="create-help">{value.clientMembershipMode === "categorySync" ? savedMode === "categorySync" ? "Auto Sync enabled. Intentional exclusions stay excluded." : "Preview existing additions and confirm before saving Auto Sync." : "New clients are added only after preview and confirmation."} No emails are sent by synchronization.</p>
      <button type="button" className="configure-sync-button configure-sync-preview" disabled={busy || (value.clientScope === "categories" && !value.clientCategories.length)} aria-busy={busy} onClick={() => void inspect()}>
        {busy ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}{busy ? "Checking clients…" : "Preview sync"}
      </button>
    </>}
    {error && <p className="create-error" role="alert">{error}</p>}
    {preview && <div className="create-audience-context" aria-label="Client sync preview">
      <p className="create-help" role="status">Current tracker: {preview.existingCount} · New matching clients: {preview.missingCount} · After sync: {preview.projectedCount}</p>
      <div className="create-client-results">{preview.clients.map(client => <div className="create-client-row" key={client.clientId}>
        <span className="create-client-name">{client.companyName}<small>{client.clientId} · {client.category}{client.state ? ` · ${client.state}` : ""}</small></span>
      </div>)}</div>
      {preview.truncated && <p className="create-help">Showing the first {preview.clients.length} of {preview.missingCount} eligible additions. All {preview.missingCount} will be added.</p>}
      <div className="configure-sync-actions">
        <button type="button" className="configure-sync-button" onClick={() => { setPreview(null); onChange({ ...value, syncRequested: false, syncPreviewToken: undefined, syncCount: undefined }); }}>Cancel</button>
        <button type="button" className="configure-sync-button configure-sync-primary" onClick={() => { onChange({ ...value, syncRequested: true, syncPreviewToken: preview.token, syncCount: preview.missingCount }); setPreview(null); }}>
          <Check size={14} aria-hidden="true" />{value.clientMembershipMode === "categorySync" && savedMode !== "categorySync" ? "Enable and sync" : "Add eligible clients"}
        </button>
      </div>
    </div>}
    {value.syncRequested && <p className="create-help" role="status">{value.syncCount} clients ready to add. Save changes to apply; existing rows will stay intact.</p>}
  </BuilderSection>;
}

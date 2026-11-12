"use client";

import { useState } from "react";
import { readJsonResponse } from "@/lib/http-response";
import { type ReportManualField } from "@/lib/report-manual";

const endpoint = "/api/reports/studio/manual";
const types = [["boolean", "Yes / No"], ["select", "Dropdown"], ["text", "Text"], ["number", "Number"], ["date", "Date"]] as const;

export default function ReportManualEditor({ fields, canEdit, financialYear, onCreate, onSave }: { fields: ReportManualField[]; canEdit: boolean; financialYear: string; onCreate: (field: ReportManualField) => void; onSave: () => void }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<ReportManualField["type"]>("boolean");
  const [scope, setScope] = useState<ReportManualField["scope"]>("financial-year");
  const [options, setOptions] = useState("");
  const [fieldId, setFieldId] = useState("");
  const [clientId, setClientId] = useState("");
  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const field = fields.find(entry => entry.id === fieldId);
  const key = { fieldId, clientId: clientId.trim(), financialYear };
  const encodedKey = new URLSearchParams(key).toString();
  const request = async (url: string, init: RequestInit = {}) => {
    const response = await fetch(url, { cache: "no-store", ...init });
    const body = await readJsonResponse(response);
    if (!response.ok) throw new Error(body.error || "Unable to update manual data.");
    return body;
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); setStatus("");
    try { await action(); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Unable to update manual data."); }
    finally { setBusy(false); }
  };
  const create = () => void run(async () => {
    const body = await request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, type, scope, options: type === "select" ? options.split("\n").map(option => option.trim()).filter(Boolean) : [] }) });
    onCreate(body.field); setFieldId(body.field.id); setLabel(""); setOptions(""); setStatus("Field created. Select a client to enter its value.");
  });
  const load = () => void run(async () => {
    const body = await request(`${endpoint}?${encodedKey}`);
    setValue(body.value == null ? "" : String(body.value)); setLoaded(encodedKey);
  });
  const save = () => void run(async () => {
    const stored = value === "" ? null : field?.type === "boolean" ? value === "true" : field?.type === "number" ? Number(value) : value;
    await request(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...key, value: stored }) });
    onSave(); setStatus("Manual value saved.");
  });
  return <details className="report-builder-disclosure">
    <summary>Manage manual data</summary>
    <p className="report-caption">Values belong to the client or client and FY. Other reports can reuse them.</p>
    {canEdit ? <div className="mt-3 grid gap-4 lg:grid-cols-2">
      <form className="space-y-2" onSubmit={event => { event.preventDefault(); create(); }}>
        <h3 className="text-sm font-semibold">Create a manual field</h3>
        <input aria-label="Manual field name" className="input-field" value={label} onChange={event => setLabel(event.target.value)} maxLength={100} required placeholder="Field name" disabled={busy} />
        <label className="block text-xs">Field type<select className="input-field" value={type} onChange={event => setType(event.target.value as ReportManualField["type"])} disabled={busy}>{types.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>
        <label className="block text-xs">Scope<select className="input-field" value={scope} onChange={event => setScope(event.target.value as ReportManualField["scope"])} disabled={busy}><option value="financial-year">Client and financial year</option><option value="client">Client across financial years</option></select></label>
        {type === "select" && <textarea aria-label="Dropdown options" className="input-field" value={options} onChange={event => setOptions(event.target.value)} required placeholder="One option per line" disabled={busy} />}
        <button className="report-secondary-button" disabled={busy}>Create field</button>
      </form>
      <form className="space-y-2" onSubmit={event => { event.preventDefault(); if (loaded === encodedKey) save(); else load(); }}>
        <h3 className="text-sm font-semibold">Enter a client value</h3>
        <select aria-label="Manual field" className="input-field" value={fieldId} onChange={event => { setFieldId(event.target.value); setLoaded(""); }} required disabled={busy}><option value="">Choose a manual field</option>{fields.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select>
        <input aria-label="Client ID" className="input-field" value={clientId} onChange={event => { setClientId(event.target.value); setLoaded(""); }} required placeholder="Client ID" disabled={busy} />
        <p className="report-caption">{field?.scope === "client" ? "Client-wide value" : `Financial year ${financialYear}`}</p>
        {loaded === encodedKey && (field?.type === "boolean" || field?.type === "select" ? <select aria-label="Manual value" className="input-field" value={value} onChange={event => setValue(event.target.value)} disabled={busy}><option value="">Unknown / clear value</option>{(field.type === "boolean" ? [["true", "Yes"], ["false", "No"]] : field.options.map(option => [option, option])).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select> :
          <input aria-label="Manual value" className="input-field" type={field?.type === "number" || field?.type === "date" ? field.type : "text"} step="any" maxLength={1000} value={value} onChange={event => setValue(event.target.value)} disabled={busy} />)}
        <button className="report-secondary-button" disabled={busy || !field || !key.clientId}>{loaded === encodedKey ? "Save value" : "Load value"}</button>
      </form>
    </div> : <p className="mt-2 text-xs text-muted">Administrators manage manual fields and values.</p>}
    {error && <p className="mt-2 text-xs text-rose-600" role="alert">{error}</p>}{status && <p className="mt-2 text-xs text-muted" role="status">{status}</p>}
  </details>;
}

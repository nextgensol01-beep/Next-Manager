"use client";

import { useMemo } from "react";
import { ClipboardList } from "lucide-react";
import TrackerStructurePreview from "./TrackerStructurePreview";
import { CLIENT_TRACKER_DETAIL_OPTIONS } from "@/lib/clientTrackers";
import type { TrackerBuilderClient, TrackerCreateDraft } from "@/lib/tracker-create";

type PreviewColumn = { id: string; label: string; source?: "live" | "computed"; type?: string; detail?: string };
export default function TrackerLivePreview({ form, audience, saving, loading }: {
  form: TrackerCreateDraft; audience: TrackerBuilderClient[]; saving: boolean; loading: boolean;
}) {
  const columns = useMemo<PreviewColumn[]>(() => [
    { id: "client", label: "Client name", detail: "companyName" }, { id: "category", label: "Category", detail: "category" },
    ...form.clientColumns.map(key => ({ id: `detail-${key}`, label: CLIENT_TRACKER_DETAIL_OPTIONS.find(option => option.key === key)?.label || key, detail: key })),
    ...(form.includeStatus ? [{ id: "system-status", label: "Status", type: "status" }] : []),
    ...form.fields.map(field => ({ id: field.uiId, label: field.label || "Untitled column", type: field.type,
      source: field.dataLink ? "live" as const : field.computed ? "computed" as const : undefined })),
  ], [form.clientColumns, form.includeStatus, form.fields]);
  const rows = audience.slice(0, 4);
  const cellText = (column: PreviewColumn, client: TrackerBuilderClient) => {
    if (column.detail === "companyName") return client.companyName || "—";
    if (column.detail === "category") return client.category || "—";
    if (column.detail === "state") return client.state || "—";
    if (column.detail) return "—";
    if (column.source === "live") return "Live";
    if (column.source === "computed") return "—";
    return ["select", "multiSelect", "tags", "status"].includes(column.type || "") ? "Select…" : "—";
  };
  return <div className={`create-preview ${saving ? "is-creating" : ""}`} aria-label="Live tracker preview">
    <div className="create-eyebrow"><span className="create-preview-dot" />Live preview</div>
    <div className="create-preview-identity"><span className="create-preview-icon"><ClipboardList size={19} /></span><h4>{form.name.trim() || "Untitled tracker"}</h4></div>
    <p className="create-preview-meta">{loading ? "Loading audience…" : `${audience.length} ${audience.length === 1 ? "client" : "clients"}`}{form.financialYear && <> · FY {form.financialYear}</>}</p>
    <TrackerStructurePreview columns={columns.map(column => ({ ...column, client: column.detail === "companyName" }))}
      rows={rows.map(client => ({ id: client.clientId, cells: Object.fromEntries(columns.map(column => [column.id, cellText(column, client)])) }))}
      empty={loading ? "Loading clients…" : "Choose an audience to see its clients here."} />
    <p className="create-preview-caption">{rows.length ? `Showing ${rows.length} of ${audience.length} clients. ` : ""}Structure preview · Values populate after creation.</p>
    <div className="create-preview-summary"><span>{columns.length} columns</span><span>{form.scope === "categories" ? form.membershipMode === "categorySync" ? "Category sync" : "Fixed snapshot" : form.scope === "selected" ? "Selected clients" : "All current clients"}</span></div>
    {form.emailEnabled && <p className="create-preview-email">Email tools enabled</p>}
  </div>;
}

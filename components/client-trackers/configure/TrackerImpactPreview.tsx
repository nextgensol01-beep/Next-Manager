"use client";

import { useMemo, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDownUp, Check, Minus, Plus, SlidersHorizontal } from "lucide-react";
import { CLIENT_TRACKER_DETAIL_OPTIONS, type TrackerValues } from "@/lib/clientTrackers";
import { canPreviewSavedValue, configurationPreviousField, type TrackerConfiguration, type TrackerConfigurationChange } from "@/lib/tracker-configuration";
import type { TrackerBuilderClient, TrackerDraftField } from "@/lib/tracker-create";
import TrackerStructurePreview, { type StructureColumn } from "../create/TrackerStructurePreview";
import TrackerOptionBadge from "../TrackerOptionBadge";
import { trackerHasOptionColors } from "@/lib/tracker-option-colors";

export type ConfigurePreviewClient = TrackerBuilderClient & { legalName?: string; gstNumber?: string; registrationNumber?: string; address?: string };
export type ConfigurePreviewEntry = { clientId: string; values: TrackerValues; client: ConfigurePreviewClient | null };
export default function TrackerImpactPreview({ draft, baseline, fields, clients, entries, changes, loading, saved }: {
  draft: TrackerConfiguration; baseline: TrackerConfiguration; fields: TrackerDraftField[];
  clients: ConfigurePreviewClient[]; entries: ConfigurePreviewEntry[]; changes: TrackerConfigurationChange[]; loading: boolean; saved: boolean;
}) {
  const reduced = useReducedMotion();
  const columns = useMemo<StructureColumn[]>(() => [
    { id: "client", label: "Client name", client: true }, { id: "category", label: "Category" },
    ...draft.clientColumns.map(key => ({ id: `detail-${key}`, label: CLIENT_TRACKER_DETAIL_OPTIONS.find(option => option.key === key)?.label || key })),
    ...fields.map(field => ({ id: field.uiId, label: field.label || "Untitled column", source: field.dataLink ? "live" as const : field.computed ? "computed" as const : undefined })),
  ], [draft.clientColumns, fields]);
  const rows = useMemo(() => {
    const byClient = new Map(clients.map(client => [client.clientId, client]));
    const byEntry = new Map(entries.map(entry => [entry.clientId, entry]));
    return draft.clientIds.slice(0, 4).map(id => {
      const entry = byEntry.get(id), client = { ...byClient.get(id), ...entry?.client };
      const cells: Record<string, ReactNode> = { client: client.companyName || id, category: client.category || "—" };
      for (const key of draft.clientColumns) cells[`detail-${key}`] = client[key] || "—";
      for (const field of fields) {
        const before = configurationPreviousField(field, baseline);
        const value = entry?.values[field.key];
        cells[field.uiId] = !entry || !canPreviewSavedValue(before, field, draft.financialYear !== baseline.financialYear) ? "—"
          : Array.isArray(value) ? value.join(", ") || "—" : value === true ? "Yes" : value === false ? "No" : String(value ?? "") || "—";
        if (cells[field.uiId] !== "—" && trackerHasOptionColors(field)) {
          const values = Array.isArray(value) ? value : [String(value)];
          cells[field.uiId] = <span className="flex flex-wrap gap-1">{values.map(option => <TrackerOptionBadge key={option} field={field} value={option} />)}</span>;
        }
      }
      return { id, cells };
    });
  }, [clients, entries, draft.clientIds, draft.clientColumns, draft.financialYear, baseline, fields]);
  return <>
    <div className="configure-preview-stats"><strong>{draft.clientIds.length} clients</strong><span>{columns.length} columns · {fields.length} tracker columns</span>{draft.financialYear && <span>FY {draft.financialYear}</span>}</div>
    <TrackerStructurePreview columns={columns} rows={rows} empty={loading ? "Loading clients…" : "Choose clients to preview this worklist."} />
    <p className="create-preview-caption">Showing {rows.length} selected clients. Saved values appear where already loaded. New or changed sources refresh after saving.</p>
    {changes.length > 0 && <section className="configure-changes" aria-label="Pending configuration changes"><h5>Changes <span>{changes.length}</span></h5>
      <ul><AnimatePresence initial={false}>{changes.map(change => {
        const Icon = change.kind === "added" ? Plus : change.kind === "removed" ? Minus : change.kind === "reordered" ? ArrowDownUp : SlidersHorizontal;
        return <motion.li key={change.id} layout="position" data-change-kind={change.kind} initial={{ opacity: 0, y: reduced ? 0 : 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : .2 }}><Icon size={12} aria-hidden="true" /><span>{change.label}</span></motion.li>;
      })}</AnimatePresence></ul>
    </section>}
    {saved && <p className="configure-saved" role="status"><Check size={13} />Changes saved</p>}
  </>;
}

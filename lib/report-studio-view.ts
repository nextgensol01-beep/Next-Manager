import type { ReportStudioConfig, ReportStudioFilterGroup, ReportStudioResultRow } from "./report-studio";

/** Stable identity keeps a result attached to the exact configuration it describes. */
export function reportConfigKey(config: ReportStudioConfig): string {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stable(entry)])) : value;
  return JSON.stringify(stable({ ...config, search: config.search || "" }));
}

export function targetProgress(target: number | null | undefined, achieved: number | null | undefined) {
  return target != null && target > 0 && achieved != null ? achieved / target * 100 : null;
}

export function rankReportRows(rows: ReportStudioResultRow[], metric: string, limit = 20) {
  return rows.map((row, index) => ({ row, index, value: Number(row.values[metric]) || 0 }))
    .sort((a, b) => b.value - a.value).slice(0, limit);
}

export function chartRowAt(rows: ReportStudioResultRow[], data: Array<{ index: number }>, displayedIndex: unknown) {
  if (displayedIndex == null || displayedIndex === "") return undefined;
  const index = Number(displayedIndex);
  return Number.isInteger(index) && index >= 0 && data[index] ? rows[data[index].index] : undefined;
}

export function withoutFilter(group: ReportStudioFilterGroup, id: string): ReportStudioFilterGroup {
  return { ...group, children: group.children.filter((child) => child.id !== id)
    .map((child) => child.kind === "group" ? withoutFilter(child, id) : child)
    .filter((child) => child.kind !== "group" || child.children.length > 0) };
}

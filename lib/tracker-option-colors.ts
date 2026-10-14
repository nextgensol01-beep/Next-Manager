import {
  TRACKER_OPTION_COLORS,
  type TrackerField,
  type TrackerOptionColor,
} from "@/lib/clientTrackers";

/** One palette for builder swatches, previews, table cells and client summaries. */
export const TRACKER_OPTION_PALETTE: Record<
  TrackerOptionColor,
  { swatch: string; tone: string }
> = {
  slate: {
    swatch: "#64748b",
    tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  },
  blue: {
    swatch: "#3b82f6",
    tone: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
  },
  violet: {
    swatch: "#8b5cf6",
    tone: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200",
  },
  amber: {
    swatch: "#f59e0b",
    tone: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  },
  emerald: {
    swatch: "#10b981",
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  },
  rose: {
    swatch: "#f43f5e",
    tone: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200",
  },
};
const STATUS_COLORS: Record<string, TrackerOptionColor> = {
  "Not Started": "slate",
  "In Progress": "amber",
  Done: "emerald",
  Blocked: "rose",
  "Not Applicable": "blue",
};
export function defaultTrackerOptionColor(index: number): TrackerOptionColor {
  return TRACKER_OPTION_COLORS[
    Math.max(0, index) % TRACKER_OPTION_COLORS.length
  ];
}
function validColor(color: unknown): color is TrackerOptionColor {
  return TRACKER_OPTION_COLORS.includes(color as TrackerOptionColor);
}
export function trackerOptionColor(
  field: Pick<TrackerField, "type" | "options" | "optionColors">,
  value: string,
): TrackerOptionColor {
  const explicit = field.optionColors?.[value];
  if (validColor(explicit)) return explicit;
  if (field.type === "status") return STATUS_COLORS[value] || "slate";
  // Legacy definitions must look the same in the editor and table before a save.
  return defaultTrackerOptionColor(field.options?.indexOf(value) ?? -1);
}
export function trackerOptionTone(
  field: Pick<TrackerField, "type" | "options" | "optionColors">,
  value: string,
) {
  return TRACKER_OPTION_PALETTE[trackerOptionColor(field, value)].tone;
}
export function trackerHasOptionColors(field: Pick<TrackerField, "type">) {
  return ["status", "select", "multiSelect", "tags"].includes(field.type);
}
/** Store defaults too, so removing/reordering options cannot change their colors. */
export function normalizeTrackerOptionColors(
  options: string[] = [],
  colors: Record<string, unknown> = {},
): Record<string, TrackerOptionColor> {
  return Object.fromEntries(
    [...new Set(options.map((option) => option.trim()).filter(Boolean))].map(
      (option, index) => [
        option,
        validColor(colors[option])
          ? colors[option]
          : defaultTrackerOptionColor(index),
      ],
    ),
  );
}
/** Retain a row's color while its label is edited, including an unfinished blank row. */
export function trackerOptionEdit(
  field: TrackerField,
  values: string[],
  renamedIndex?: number,
): Partial<TrackerField> {
  const colors: Record<string, TrackerOptionColor> = {
    ...normalizeTrackerOptionColors(field.options, field.optionColors),
    ...(validColor(field.optionColors?.[""])
      ? { "": field.optionColors![""] }
      : {}),
  };
  if (renamedIndex !== undefined) {
    const oldValues = (
      field.optionInput ??
      field.options?.join(",") ??
      ""
    ).split(",");
    const oldName = oldValues[renamedIndex]?.trim() || "",
      name = values[renamedIndex]?.trim() || "";
    if (name !== oldName && !Object.hasOwn(colors, name)) {
      colors[name] =
        colors[oldName] ||
        defaultTrackerOptionColor(
          oldValues.slice(0, renamedIndex).filter((value) => value.trim())
            .length,
        );
    }
  }
  const options = values.map((value) => value.trim()).filter(Boolean);
  return {
    optionInput: values.join(","),
    options,
    optionColors: {
      ...normalizeTrackerOptionColors(options, colors),
      ...(values.some((value) => !value.trim()) && colors[""]
        ? { "": colors[""] }
        : {}),
    },
  };
}

import { targetTrackingProvenance } from "@/lib/financial-year-coverage";

export type FinancialYearEntry = {
  categoryId: string;
  type: "RECYCLING" | "EOL";
  value: number;
};
export type FinancialYearClient = {
  clientId: string;
  companyName: string;
  category: string;
};
export type FinancialYearRecord = {
  targetTracking?: import("./financial-year-coverage").TargetTracking;
  _id?: string;
  clientId: string;
  financialYear: string;
  createdAt?: string;
  updatedAt?: string;
  targets?: FinancialYearEntry[];
  generated?: FinancialYearEntry[];
  achievedByType?: FinancialYearEntry[];
  soldByType?: FinancialYearEntry[];
  totalTarget?: number;
  totalGenerated?: number;
  totalAchieved?: number;
  totalSold?: number;
  cat1Target?: number;
  cat2Target?: number;
  cat3Target?: number;
  cat4Target?: number;
  cat1Generated?: number;
  cat2Generated?: number;
  cat3Generated?: number;
  cat4Generated?: number;
  targetCat1?: number;
  targetCat2?: number;
  targetCat3?: number;
  targetCat4?: number;
  creditsCat1?: number;
  creditsCat2?: number;
  creditsCat3?: number;
  creditsCat4?: number;
  achievedCat1?: number;
  achievedCat2?: number;
  achievedCat3?: number;
  achievedCat4?: number;
  soldCat1?: number;
  soldCat2?: number;
  soldCat3?: number;
  soldCat4?: number;
};
export type FinancialYearDraftRow = Omit<FinancialYearEntry, "value"> & {
  id: string;
  value: string;
};
export const FY_CATEGORIES = ["1", "2", "3", "4"] as const;
export const FY_CREDIT_TYPES = ["RECYCLING", "EOL"] as const;
export const FY_CATEGORY_LABELS: Record<string, string> = {
  "1": "CAT-I",
  "2": "CAT-II",
  "3": "CAT-III",
  "4": "CAT-IV",
};
let rowSequence = 0;
export function financialYearDraftRow(
  entry: FinancialYearEntry = { categoryId: "1", type: "RECYCLING", value: 0 },
): FinancialYearDraftRow {
  return {
    ...entry,
    id: `fy-row-${++rowSequence}`,
    value: entry.value === 0 ? "" : String(entry.value),
  };
}
export function financialYearEntries(
  record: FinancialYearRecord | null,
  section: "targets" | "generated",
): FinancialYearEntry[] {
  if (!record) return [];
  const structured = record[section]?.filter(
    (entry) => Number.isFinite(Number(entry.value)) && Number(entry.value) > 0,
  );
  if (structured?.length)
    return structured.map((entry) => ({
      ...entry,
      value: Number(entry.value),
    }));
  return FY_CATEGORIES.flatMap((categoryId) => {
    const data = record as unknown as Record<string, unknown>;
    const value = Number(
      section === "generated"
        ? (data[`cat${categoryId}Generated`] ??
            data[`creditsCat${categoryId}`] ??
            0)
        : (data[`cat${categoryId}Target`] ??
            data[`targetCat${categoryId}`] ??
            0),
    );
    return value > 0 ? [{ categoryId, type: "RECYCLING" as const, value }] : [];
  });
}
export function financialYearDraftRows(
  record: FinancialYearRecord | null,
  section: "targets" | "generated",
) {
  const rows = financialYearEntries(record, section).map(financialYearDraftRow);
  return rows.length ? rows : [financialYearDraftRow()];
}
export function nextFinancialYearRow(rows: FinancialYearDraftRow[]) {
  const selected = new Set(rows.map((row) => `${row.categoryId}|${row.type}`));
  for (const categoryId of FY_CATEGORIES)
    for (const type of FY_CREDIT_TYPES) {
      if (!selected.has(`${categoryId}|${type}`))
        return financialYearDraftRow({ categoryId, type, value: 0 });
    }
  return null;
}
export function financialYearRowErrors(rows: FinancialYearDraftRow[]) {
  const errors: Record<string, string> = {},
    first = new Map<string, string>();
  for (const row of rows) {
    const value = Number(row.value),
      key = `${row.categoryId}|${row.type}`;
    if (
      !FY_CATEGORIES.includes(
        row.categoryId as (typeof FY_CATEGORIES)[number],
      ) ||
      !FY_CREDIT_TYPES.includes(row.type)
    )
      errors[row.id] = "Choose a valid category and type.";
    else if (!Number.isFinite(value) || value < 0)
      errors[row.id] = "Enter a quantity of 0 or more.";
    if (value <= 0) continue;
    if (first.has(key)) {
      errors[row.id] = "This category and type already has a quantity.";
      errors[first.get(key)!] = errors[row.id];
    } else first.set(key, row.id);
  }
  return errors;
}
export function activeFinancialYearEntries(
  rows: FinancialYearDraftRow[],
): FinancialYearEntry[] {
  return rows
    .filter((row) => Number(row.value) > 0)
    .map(({ categoryId, type, value }) => ({
      categoryId,
      type,
      value: Number(value),
    }));
}
export function financialYearDraftSignature(rows: FinancialYearDraftRow[]) {
  return JSON.stringify(
    rows.map(({ categoryId, type, value }) => ({
      categoryId,
      type,
      value: Number(value) || value || 0,
    })),
  );
}
export function mergeFinancialYearImport(
  rows: FinancialYearDraftRow[],
  imported: FinancialYearEntry[],
) {
  const existing = activeFinancialYearEntries(rows),
    keys = new Set(
      existing.map((entry) => `${entry.categoryId}|${entry.type}`),
    );
  return [
    ...existing,
    ...imported.filter(
      (entry) =>
        entry.value > 0 && !keys.has(`${entry.categoryId}|${entry.type}`),
    ),
  ].map(financialYearDraftRow);
}
export function financialYearUsage(
  record: FinancialYearRecord | null,
  pwp: boolean,
) {
  const typed = pwp ? record?.soldByType : record?.achievedByType;
  const total = pwp ? record?.totalSold : record?.totalAchieved;
  return {
    entries: typed || [],
    total: total ?? typed?.reduce((sum, entry) => sum + entry.value, 0) ?? 0,
  };
}
/** Keep the last server-confirmed ledger usage when a save succeeds but its follow-up read fails.
 * Recalculate every editable balance so the profile never displays the previous target total. */
export function financialYearSavedSnapshot(
  stored: FinancialYearRecord,
  previous: FinancialYearRecord | null,
): FinancialYearRecord {
  const saved = { ...previous, ...stored } as FinancialYearRecord &
    Record<string, unknown>;
  saved.targetTracking = { ...targetTrackingProvenance(stored as unknown as Record<string, unknown>), usageIssues: previous?.targetTracking?.usageIssues ?? [] };
  const targets = financialYearEntries(stored, "targets"),
    generated = financialYearEntries(stored, "generated");
  const achieved = financialYearUsage(previous, false),
    sold = financialYearUsage(previous, true);
  saved.totalTarget = targets.reduce((sum, entry) => sum + entry.value, 0);
  saved.totalGenerated = generated.reduce((sum, entry) => sum + entry.value, 0);
  saved.totalAchieved = achieved.total;
  saved.totalSold = sold.total;
  for (const categoryId of FY_CATEGORIES) {
    const target = targets
      .filter((entry) => entry.categoryId === categoryId)
      .reduce((sum, entry) => sum + entry.value, 0);
    const generation = generated
      .filter((entry) => entry.categoryId === categoryId)
      .reduce((sum, entry) => sum + entry.value, 0);
    saved[`cat${categoryId}Target`] = target;
    saved[`cat${categoryId}Generated`] = generation;
    saved[`remainingTargetCat${categoryId}`] =
      target -
      Number(
        previous?.[`achievedCat${categoryId}` as keyof FinancialYearRecord] ||
          0,
      );
    saved[`remainingCat${categoryId}`] =
      generation -
      Number(
        previous?.[`soldCat${categoryId}` as keyof FinancialYearRecord] || 0,
      );
  }
  saved.totalRemainingTarget = saved.remainingTarget =
    saved.totalTarget - achieved.total;
  saved.totalRemaining = saved.remainingCredits =
    saved.totalGenerated - sold.total;
  saved.totalCredits = saved.availableCredits = saved.totalGenerated;
  saved.totalUsed = sold.total;
  saved.targetAmount = saved.totalTarget;
  return saved;
}
export function financialYearQuantity(value: number) {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 10 });
}

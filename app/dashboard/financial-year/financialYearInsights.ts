import type { Client, FYRecord, TargetEntry } from "./FinancialYearSupport";

export type CreditType = "RECYCLING" | "EOL";
export type ClientGroup = "pibo" | "pwp";
export type MetricKey = "base" | "used" | "remaining" | "excess";

export type MetricSet = {
  base: number;
  used: number;
  remaining: number;
  excess: number;
};

export type InsightStats = MetricSet & {
  byType: Record<CreditType, MetricSet>;
  byCategory: Record<string, MetricSet>;
  byTypeCategory: Record<CreditType, Record<string, MetricSet>>;
};

export type InsightClientRow = {
  record: FYRecord;
  client: Client | undefined;
  clientId: string;
  clientName: string;
  category: string;
  stats: InsightStats;
};

export type GroupSummary = {
  rows: InsightClientRow[];
  stats: InsightStats;
  clientCount: number;
};

export type FinancialYearInsights = {
  pibo: GroupSummary & {
    byCategoryName: Record<string, GroupSummary>;
  };
  pwp: GroupSummary;
};

export const CREDIT_TYPES: CreditType[] = ["RECYCLING", "EOL"];
export const PIBO_CATEGORIES = ["Producer", "Importer", "Brand Owner"] as const;
export const PIBO_CATEGORY_SET = new Set<string>(PIBO_CATEGORIES);

export const CAT_IDS = ["1", "2", "3", "4"] as const;
export const CAT_DISPLAY: Record<string, string> = {
  "1": "CAT-I",
  "2": "CAT-II",
  "3": "CAT-III",
  "4": "CAT-IV",
};

export const GROUP_LABELS: Record<ClientGroup, {
  title: string;
  baseLabel: string;
  usedLabel: string;
  remainingLabel: string;
  excessLabel: string;
  clientLabel: string;
}> = {
  pibo: {
    title: "PIBO Targets",
    baseLabel: "Total Target",
    usedLabel: "Achieved",
    remainingLabel: "Remaining",
    excessLabel: "Excess",
    clientLabel: "clients with targets",
  },
  pwp: {
    title: "PWP Credits",
    baseLabel: "Generated",
    usedLabel: "Sold",
    remainingLabel: "Remaining",
    excessLabel: "Oversold",
    clientLabel: "clients with credits",
  },
};

export const METRIC_LABELS: Record<ClientGroup, Record<MetricKey, string>> = {
  pibo: {
    base: "Total Target",
    used: "Achieved",
    remaining: "Remaining",
    excess: "Excess",
  },
  pwp: {
    base: "Generated",
    used: "Sold",
    remaining: "Remaining",
    excess: "Oversold",
  },
};

function emptyMetric(): MetricSet {
  return { base: 0, used: 0, remaining: 0, excess: 0 };
}

function emptyStats(): InsightStats {
  const byType = {
    RECYCLING: emptyMetric(),
    EOL: emptyMetric(),
  };
  const byCategory = Object.fromEntries(CAT_IDS.map((catId) => [catId, emptyMetric()])) as Record<string, MetricSet>;
  const byTypeCategory = {
    RECYCLING: Object.fromEntries(CAT_IDS.map((catId) => [catId, emptyMetric()])) as Record<string, MetricSet>,
    EOL: Object.fromEntries(CAT_IDS.map((catId) => [catId, emptyMetric()])) as Record<string, MetricSet>,
  };

  return { ...emptyMetric(), byType, byCategory, byTypeCategory };
}

function addMetric(target: MetricSet, source: MetricSet) {
  target.base += source.base;
  target.used += source.used;
  target.remaining += source.remaining;
  target.excess += source.excess;
}

function addStats(target: InsightStats, source: InsightStats) {
  addMetric(target, source);
  CREDIT_TYPES.forEach((type) => addMetric(target.byType[type], source.byType[type]));
  CAT_IDS.forEach((catId) => addMetric(target.byCategory[catId], source.byCategory[catId]));
  CREDIT_TYPES.forEach((type) => {
    CAT_IDS.forEach((catId) => addMetric(target.byTypeCategory[type][catId], source.byTypeCategory[type][catId]));
  });
}

function groupFromRows(rows: InsightClientRow[]): GroupSummary {
  const stats = emptyStats();
  rows.forEach((row) => addStats(stats, row.stats));
  return {
    rows,
    stats,
    clientCount: rows.filter((row) => row.stats.base > 0).length,
  };
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isValidCategoryId(categoryId: string) {
  return (CAT_IDS as readonly string[]).includes(categoryId);
}

function normaliseEntries(entries: TargetEntry[] | undefined): TargetEntry[] {
  return (entries ?? [])
    .map((entry) => ({
      categoryId: String(entry.categoryId),
      type: String(entry.type).toUpperCase() === "EOL" ? "EOL" as const : "RECYCLING" as const,
      value: numberValue(entry.value),
    }))
    .filter((entry) => isValidCategoryId(entry.categoryId) && entry.value > 0);
}

function flatEntries(
  record: FYRecord,
  fields: [keyof FYRecord, keyof FYRecord, keyof FYRecord, keyof FYRecord]
) {
  return CAT_IDS.map((categoryId, index) => ({
    categoryId,
    type: "RECYCLING" as const,
    value: numberValue(record[fields[index]]),
  })).filter((entry) => entry.value > 0);
}

function baseEntries(record: FYRecord, group: ClientGroup) {
  if (group === "pwp") {
    const generated = normaliseEntries(record.generated);
    return generated.length > 0
      ? generated
      : flatEntries(record, ["cat1Generated", "cat2Generated", "cat3Generated", "cat4Generated"]);
  }

  const targets = normaliseEntries(record.targets);
  return targets.length > 0
    ? targets
    : flatEntries(record, ["cat1Target", "cat2Target", "cat3Target", "cat4Target"]);
}

function usedEntries(record: FYRecord, group: ClientGroup) {
  if (group === "pwp") {
    const sold = normaliseEntries(record.soldByType);
    return sold.length > 0
      ? sold
      : flatEntries(record, ["soldCat1", "soldCat2", "soldCat3", "soldCat4"]);
  }

  const achieved = normaliseEntries(record.achievedByType);
  return achieved.length > 0
    ? achieved
    : flatEntries(record, ["achievedCat1", "achievedCat2", "achievedCat3", "achievedCat4"]);
}

function entryMap(entries: TargetEntry[]) {
  const map: Record<string, number> = {};
  entries.forEach((entry) => {
    const key = `${entry.categoryId}|${entry.type}`;
    map[key] = (map[key] ?? 0) + entry.value;
  });
  return map;
}

function statsFromEntries(base: TargetEntry[], used: TargetEntry[]): InsightStats {
  const stats = emptyStats();
  const baseMap = entryMap(base);
  const usedMap = entryMap(used);

  CREDIT_TYPES.forEach((type) => {
    CAT_IDS.forEach((catId) => {
      const baseValue = baseMap[`${catId}|${type}`] ?? 0;
      const usedValue = usedMap[`${catId}|${type}`] ?? 0;
      const metric = {
        base: baseValue,
        used: usedValue,
        remaining: Math.max(0, baseValue - usedValue),
        excess: Math.max(0, usedValue - baseValue),
      };

      stats.byTypeCategory[type][catId] = metric;
      addMetric(stats.byType[type], metric);
      addMetric(stats.byCategory[catId], metric);
      addMetric(stats, metric);
    });
  });

  return stats;
}

export function buildFinancialYearInsights(records: FYRecord[], clients: Client[]): FinancialYearInsights {
  const clientMap = new Map(clients.map((client) => [client.clientId, client]));
  const piboRows: InsightClientRow[] = [];
  const pwpRows: InsightClientRow[] = [];

  records.forEach((record) => {
    const client = clientMap.get(record.clientId);
    const category = client?.category || "";
    const group: ClientGroup | null =
      category === "PWP" ? "pwp" :
      PIBO_CATEGORY_SET.has(category) ? "pibo" :
      null;

    if (!group) return;

    const stats = statsFromEntries(baseEntries(record, group), usedEntries(record, group));
    if (stats.base <= 0 && stats.used <= 0) return;

    const row: InsightClientRow = {
      record,
      client,
      clientId: record.clientId,
      clientName: client?.companyName || record.clientId,
      category,
      stats,
    };

    if (group === "pwp") pwpRows.push(row);
    else piboRows.push(row);
  });

  return {
    pibo: {
      ...groupFromRows(piboRows),
      byCategoryName: Object.fromEntries(
        PIBO_CATEGORIES.map((category) => [category, groupFromRows(piboRows.filter((row) => row.category === category))])
      ) as Record<string, GroupSummary>,
    },
    pwp: groupFromRows(pwpRows),
  };
}

export function getRowsForMetric(rows: InsightClientRow[], metric: MetricKey) {
  return rows
    .filter((row) => row.stats[metric] > 0)
    .sort((a, b) => b.stats[metric] - a.stats[metric] || a.clientName.localeCompare(b.clientName));
}

export function formatInsightNumber(value: number) {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function getProgress(used: number, base: number) {
  if (base <= 0) return 0;
  return Math.max(0, Math.min(100, (used / base) * 100));
}

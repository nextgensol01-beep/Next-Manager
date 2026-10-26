import type { FinancialYearRecord } from "./financial-year-form";

export const COVERAGE_CATEGORIES = ["1", "2", "3", "4"] as const;
export const COVERAGE_TYPES = ["RECYCLING", "EOL"] as const;
export type TargetSource = "typed" | "legacy" | "missing";
export type TargetTracking = { source: TargetSource; issues: string[]; usageIssues?: string[]; missingCategories?: string[] };
export type CoverageBucket = {
  categoryId: string; type: "RECYCLING" | "EOL";
  target: number | null; recorded: number | null; covered: number | null;
  pending: number | null; excess: number | null; percentage: number | null;
};
export type CoverageTotal = Omit<CoverageBucket, "categoryId" | "type">;
export type TargetCoverage = CoverageTotal & {
  status: "Not started" | "Partially achieved" | "Fully achieved" | "No target" | "Needs verification";
  issues: string[]; buckets: CoverageBucket[];
  categories: Array<CoverageTotal & { categoryId: string; buckets: CoverageBucket[] }>;
};
type Input = FinancialYearRecord & { targetTracking?: TargetTracking };
type Data = Record<string, unknown>;
const dataOf = (record: Input) => record as unknown as Data;
const own = (record: Data, key: string) => Object.prototype.hasOwnProperty.call(record, key);
const quantity = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Sum the decimal representations without rounding intermediate quantities. */
export function sumQuantities(values: number[]): number {
  if (!values.length) return 0;
  if (values.some(value => !Number.isFinite(value))) return NaN;
  const parts = values.map(value => {
    const [mantissa, exponent = "0"] = String(value).toLowerCase().split("e");
    return { coefficient: BigInt(mantissa.replace(".", "")), exponent: Number(exponent) - (mantissa.split(".")[1]?.length || 0) };
  });
  const exponent = Math.min(...parts.map(part => part.exponent));
  const total = parts.reduce((sum, part) => sum + part.coefficient * BigInt(10) ** BigInt(part.exponent - exponent), BigInt(0));
  return Number(`${total}e${exponent}`);
}
const difference = (a: number, b: number) => sumQuantities([a, -b]);
const unequal = (a: number, b: number) => Math.abs(a - b) > Math.max(1e-10, Math.max(a, b) * Number.EPSILON * 8);

function entries(raw: unknown, issues: string[], label: string) {
  const result = new Map<string, number>();
  if (!Array.isArray(raw)) { if (raw != null) issues.push(`Invalid ${label} list.`); return result; }
  for (const value of raw) {
    const entry = value as { categoryId?: string; type?: string; value?: unknown } | null;
    if (!entry || !(COVERAGE_CATEGORIES as readonly unknown[]).includes(entry.categoryId) ||
      !(COVERAGE_TYPES as readonly unknown[]).includes(entry.type) || !quantity(entry.value)) {
      issues.push(`Invalid ${label} category, type or quantity.`); continue;
    }
    const key = `${entry.categoryId}|${entry.type}`;
    if (result.has(key)) { issues.push(`Duplicate ${label} bucket ${key}; allocation requires review.`); continue; }
    result.set(key, entry.value);
  }
  return result;
}

/** Capture provenance BEFORE the legacy API compatibility fallback synthesizes typed entries. */
export function targetTrackingProvenance(record: Data): TargetTracking {
  const issues: string[] = [];
  entries(record.targets, issues, "target");
  const typed = Array.isArray(record.targets) && record.targets.length > 0;
  const hasFlat = COVERAGE_CATEGORIES.some(id => own(record, `cat${id}Target`) || own(record, `targetCat${id}`));
  for (const id of COVERAGE_CATEGORIES) {
    const value = record[`cat${id}Target`] ?? record[`targetCat${id}`];
    if (value != null && !quantity(value)) issues.push(`Invalid CAT-${id} target quantity.`);
  }
  const source = typed ? "typed" : hasFlat ? "legacy" : Array.isArray(record.targets) ? "typed" : "missing";
  return { source, issues, missingCategories: source === "typed" ? [] : COVERAGE_CATEGORIES.filter(id => record[`cat${id}Target`] == null && record[`targetCat${id}`] == null) };
}

function totals(buckets: CoverageBucket[]): CoverageTotal {
  const aggregate = (key: "target" | "recorded" | "covered" | "pending" | "excess") =>
    buckets.some(bucket => bucket[key] === null) ? null : sumQuantities(buckets.map(bucket => bucket[key] as number));
  const target = aggregate("target"), covered = aggregate("covered");
  return { target, covered, pending: aggregate("pending"), recorded: aggregate("recorded"), excess: aggregate("excess"),
    percentage: target !== null && target > 0 && covered !== null ? Math.max(0, Math.min(100, covered / target * 100)) : null };
}

/** Internal recorded coverage only. This engine never creates statutory targets,
 * verifies certificates, applies offsets, allocates legacy totals, or writes data. */
export function calculateTargetCoverage(record: Input, scope?: { clientId: string; financialYear: string }): TargetCoverage {
  const raw = dataOf(record), provenance = record.targetTracking ?? targetTrackingProvenance(raw);
  const issues = [...provenance.issues];
  if (scope && (record.clientId !== scope.clientId || record.financialYear !== scope.financialYear)) issues.push("Client or financial year does not match the selected record.");
  const targetIssues: string[] = [];
  const targetMap = entries(record.targets, targetIssues, "target");
  issues.push(...targetIssues);
  const usageIssues: string[] = [...(provenance.usageIssues ?? [])];
  const usageMap = entries(record.achievedByType, usageIssues, "achievement");
  issues.push(...usageIssues);
  const buckets: CoverageBucket[] = [];
  const legacyCategories = new Map<string, { target: number | null; recorded: number | null }>();
  for (const categoryId of COVERAGE_CATEGORIES) {
    const flatTarget = raw[`cat${categoryId}Target`] ?? raw[`targetCat${categoryId}`];
    const flatRecorded = raw[`achievedCat${categoryId}`];
    const typedRecorded = sumQuantities(COVERAGE_TYPES.map(type => usageMap.get(`${categoryId}|${type}`) ?? 0));
    const hasTypedUsage = Array.isArray(record.achievedByType);
    const unallocated = flatRecorded != null && (!quantity(flatRecorded) || unequal(flatRecorded, typedRecorded));
    if (unallocated) issues.push(`CAT-${categoryId} recorded achievement has unresolved type allocation.`);
    const legacyPositive = provenance.source === "legacy" && quantity(flatTarget) && flatTarget > 0;
    const missingTarget = provenance.source === "missing" || provenance.missingCategories?.includes(categoryId) || (provenance.source === "legacy" && flatTarget == null);
    if (legacyPositive) issues.push(`CAT-${categoryId} target type is unavailable; legacy quantities were not allocated.`);
    if (missingTarget) issues.push(`CAT-${categoryId} target unavailable.`);
    legacyCategories.set(categoryId, { target: !missingTarget && quantity(flatTarget) ? flatTarget : null,
      recorded: quantity(flatRecorded) ? flatRecorded : hasTypedUsage ? typedRecorded : null });
    for (const type of COVERAGE_TYPES) {
      const key = `${categoryId}|${type}`;
      const target = missingTarget || legacyPositive || targetIssues.length || provenance.issues.length ? null :
        provenance.source === "typed" ? targetMap.get(key) ?? 0 : 0;
      const recorded = unallocated || usageIssues.length ? null : hasTypedUsage ? usageMap.get(key) ?? 0 :
        flatRecorded === 0 ? 0 : null;
      if (target !== null && target > 0 && recorded === null && !unallocated) issues.push(`CAT-${categoryId} ${type} achievement unavailable.`);
      const covered = target === 0 ? 0 : target !== null && recorded !== null ? Math.min(recorded, target) : null;
      const pending = target === 0 ? 0 : target !== null && covered !== null ? Math.max(0, difference(target, covered)) : null;
      buckets.push({ categoryId, type, target, recorded, covered, pending,
        excess: target !== null && recorded !== null ? Math.max(0, difference(recorded, target)) : null,
        percentage: target !== null && target > 0 && covered !== null ? Math.min(100, covered / target * 100) : null });
    }
  }
  const categories = COVERAGE_CATEGORIES.map(categoryId => {
    const rows = buckets.filter(bucket => bucket.categoryId === categoryId), total = totals(rows), legacy = legacyCategories.get(categoryId)!;
    // Preserve category-level legacy amounts without fabricating a Recycling/EOL split.
    return { ...total, categoryId, buckets: rows,
      target: provenance.source === "legacy" ? legacy.target : total.target,
      recorded: total.recorded ?? legacy.recorded };
  });
  const overall = totals(buckets);
  const target = provenance.source === "legacy" && categories.every(row => row.target !== null)
    ? sumQuantities(categories.map(row => row.target!)) : overall.target;
  const recorded = categories.every(row => row.recorded !== null) ? sumQuantities(categories.map(row => row.recorded!)) : null;
  if ([target, recorded, overall.covered, overall.pending].some(value => value !== null && !Number.isFinite(value))) issues.push("Quantity total is outside the supported numeric range.");
  const incomplete = issues.length > 0 || target === null || (target > 0 && overall.covered === null);
  return { ...overall, target, recorded,
    covered: incomplete ? null : overall.covered, pending: incomplete ? null : overall.pending,
    percentage: incomplete ? null : overall.percentage,
    status: incomplete ? "Needs verification" : target === 0 ? "No target" : overall.pending === 0 ? "Fully achieved" : overall.covered === 0 ? "Not started" : "Partially achieved",
    issues: [...new Set(issues)], buckets, categories };
}

export function coveragePercentageText(value: number | null) {
  // A tiny outstanding bucket must not round to an apparent 100% completion.
  return value === null ? "—" : `${value >= 100 ? 100 : Math.min(99.9, Math.round(value * 10) / 10)}%`;
}
export function coverageQuantityText(value: number | null) {
  return value === null ? "—" : value.toLocaleString("en-IN", { maximumFractionDigits: 10 });
}

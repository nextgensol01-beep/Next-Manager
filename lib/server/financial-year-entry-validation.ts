import type { ITargetEntry } from "@/models/FinancialYear";

const VALID_TARGET_TYPES = new Set(["RECYCLING", "EOL"]);
const VALID_TARGET_CATEGORIES = new Set(["1", "2", "3", "4"]);

export function validateReviewedTargetImport(raw: unknown): string | null {
  if (!Array.isArray(raw)) return "Reviewed screenshot targets must be an array.";
  if (raw.length > 8) return "Reviewed screenshot targets contain too many rows.";

  const combinations = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") return "A reviewed screenshot target row is invalid.";
    const entry = item as { categoryId?: unknown; type?: unknown; value?: unknown };
    const categoryId = String(entry.categoryId ?? "");
    const type = String(entry.type ?? "").toUpperCase();
    const value = Number(entry.value);
    if (!VALID_TARGET_CATEGORIES.has(categoryId)) return `Invalid target category: ${categoryId || "missing"}.`;
    if (!VALID_TARGET_TYPES.has(type)) return `Invalid target type for CAT ${categoryId}.`;
    if (!Number.isFinite(value) || value < 0) return `Invalid target value for CAT ${categoryId} ${type}.`;
    const combination = `${categoryId}|${type}`;
    if (combinations.has(combination)) return `Duplicate target row for CAT ${categoryId} ${type}.`;
    combinations.add(combination);
  }
  return null;
}

export function normaliseEntries(raw: unknown[]): ITargetEntry[] {
  const entries = new Map<string, ITargetEntry>();

  for (const item of raw) {
    const entry = item as Partial<ITargetEntry>;
    const categoryId = String(entry.categoryId ?? "");
    const rawType = String(entry.type ?? "").toUpperCase();
    const type = VALID_TARGET_TYPES.has(rawType) ? rawType as ITargetEntry["type"] : null;
    const value = Number(entry.value);

    if (!VALID_TARGET_CATEGORIES.has(categoryId) || !type || !Number.isFinite(value) || value <= 0) {
      continue;
    }

    const key = `${categoryId}|${type}`;
    const existing = entries.get(key);
    entries.set(key, {
      categoryId,
      type,
      value: (existing?.value ?? 0) + value,
    });
  }

  return Array.from(entries.values());
}

export function deriveFlat(entries: ITargetEntry[], prefix: string): Record<string, number> {
  const flat: Record<string, number> = {
    [`${prefix}1`]: 0, [`${prefix}2`]: 0, [`${prefix}3`]: 0, [`${prefix}4`]: 0,
  };
  for (const e of entries) {
    const k = `${prefix}${e.categoryId}`;
    flat[k] = (flat[k] ?? 0) + e.value;
  }
  return flat;
}

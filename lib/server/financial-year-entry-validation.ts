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

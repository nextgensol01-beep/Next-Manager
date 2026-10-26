/** Canonical FY metadata; an absent year stays absent, never inferred from today's date. */
export function normalizeDocumentFinancialYear(
  value: unknown,
): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string")
    throw new Error("Choose a valid financial year.");
  if (!value.trim()) return undefined;
  const match = value
    .trim()
    .replace(/[–—]/g, "-")
    .match(/^(\d{4})-(\d{2}|\d{4})$/);
  if (!match)
    throw new Error("Choose a valid financial year (for example, 2025-26).");
  const start = Number(match[1]),
    end = Number(match[2]);
  if (
    start < 1900 ||
    start > 2200 ||
    (match[2].length === 2 ? (start + 1) % 100 : start + 1) !== end
  )
    throw new Error("Choose a valid consecutive financial year.");
  return `${start}-${String(start + 1).slice(-2)}`;
}

export function documentFinancialYearMatches(
  documentYear: unknown,
  expected: unknown,
) {
  try {
    const year = normalizeDocumentFinancialYear(documentYear),
      target = normalizeDocumentFinancialYear(expected);
    return Boolean(year && target && year === target);
  } catch {
    return false;
  }
}

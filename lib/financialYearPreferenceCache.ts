const FINANCIAL_YEAR_PREFERENCE_CACHE_PREFIX = "financial-year-preference:";

export function getFinancialYearPreferenceCacheKey(accountKey: string) {
  return `${FINANCIAL_YEAR_PREFERENCE_CACHE_PREFIX}${accountKey}`;
}

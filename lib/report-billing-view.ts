import { REPORT_DETAIL_DATASETS } from "./report-datasets";
import type { ReportStudioConfig, ReportStudioFilterClause, ReportStudioResultRow } from "./report-studio";

export function billingReportDrilldown(config: ReportStudioConfig, row: ReportStudioResultRow): ReportStudioConfig | null {
  const detail = row.billingDrilldown;
  if (!detail) return null;
  const filters = config.billingScope?.filters;
  const groupId = `billing-drill-${detail.source}`;
  const equals = (field: string, value: string): ReportStudioFilterClause => ({ id: `${groupId}-${field}`, kind: "condition", field, operator: "eq", value });
  const identity = [equals("financialYear.year", detail.financialYear),
    detail.billId ? equals("bill.id", detail.billId) : equals("client.clientId", detail.clientId)];
  const columns = REPORT_DETAIL_DATASETS[detail.source].columns;
  const suffix = detail.billId ? " · Charges" : " · Bills";
  return {
    ...config, source: detail.source, name: config.name.slice(0, 120 - suffix.length) + suffix,
    billingScope: { ...config.billingScope, filters: { id: groupId, kind: "group", logic: "and", children: [...(filters?.children.length ? [filters] : []), ...identity] } },
    columns, filters: { id: "root", kind: "group", logic: "and", children: [] },
    analysis: { ...config.analysis, field: columns[0], transform: "presence" },
    metrics: [detail.billId ? "charge.gross" : "charge.selectedGross"], sort: [], groupBy: [], calculatedColumns: undefined,
    businessResultIds: null, excelColumnColors: {}, view: "table", page: 1,
  };
}

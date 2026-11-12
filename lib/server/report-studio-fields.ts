import { buildReportStudioCustomFields, reportManualDefinition } from "@/lib/report-studio";
import { loadManualReportFields } from "./report-manual-data";
import type { ClientCustomFieldDefinition } from "@/lib/clientCustomFields";
import ClientCustomField from "@/models/ClientCustomField";

export async function loadReportStudioCustomFields(includeManual = false) {
  const definitions = await ClientCustomField.find({
    active: true,
    type: { $ne: "password" },
  })
    .select("key label type active applicableCategories order")
    .sort({ order: 1, label: 1 })
    .lean() as unknown as Array<Pick<ClientCustomFieldDefinition, "key" | "label" | "type" | "active" | "applicableCategories">>;

  return [...buildReportStudioCustomFields(definitions), ...(includeManual ? (await loadManualReportFields()).map(reportManualDefinition) : [])];
}

import { buildReportStudioCustomFields } from "@/lib/report-studio";
import type { ClientCustomFieldDefinition } from "@/lib/clientCustomFields";
import ClientCustomField from "@/models/ClientCustomField";

export async function loadReportStudioCustomFields() {
  const definitions = await ClientCustomField.find({
    active: true,
    type: { $ne: "password" },
  })
    .select("key label type active applicableCategories order")
    .sort({ order: 1, label: 1 })
    .lean() as unknown as Array<Pick<ClientCustomFieldDefinition, "key" | "label" | "type" | "active" | "applicableCategories">>;

  return buildReportStudioCustomFields(definitions);
}

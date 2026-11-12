import { ReportManualFieldModel, ReportManualValueModel } from "@/models/ReportManualData";
import { type ReportManualField, manualFieldId } from "@/lib/report-manual";

export function serializeManualField(row: Omit<ReportManualField, "id"> & { _id: unknown }): ReportManualField {
  return { id: String(row._id), label: row.label, scope: row.scope, type: row.type, options: row.options };
}

export async function loadManualReportFields() {
  const rows = await ReportManualFieldModel.find({}).select("label scope type options").sort({ label: 1, _id: 1 }).lean<Array<Omit<ReportManualField, "id"> & { _id: unknown }>>();
  return rows.map(serializeManualField);
}

export async function manualReportValues(fields: string[], clientIds: string[], financialYear: string) {
  const values = new Map<string, Map<string, string | number | boolean | null>>();
  if (!fields.length || !clientIds.length) return values;
  const [definitions, records] = await Promise.all([
    loadManualReportFields(),
    ReportManualValueModel.find({ fieldId: { $in: fields }, clientId: { $in: clientIds }, financialYear: { $in: ["", financialYear] } })
      .select("fieldId clientId financialYear value").lean<Array<{ fieldId: string; clientId: string; financialYear: string; value: string | number | boolean | null }>>(),
  ]);
  const scope = new Map(definitions.map(definition => [definition.id, definition.scope]));
  for (const record of records) {
    const kind = scope.get(record.fieldId);
    if (!kind || record.financialYear !== (kind === "client" ? "" : financialYear)) continue;
    const clientValues = values.get(record.clientId) || new Map();
    clientValues.set(manualFieldId(record.fieldId), record.value);
    values.set(record.clientId, clientValues);
  }
  return values;
}

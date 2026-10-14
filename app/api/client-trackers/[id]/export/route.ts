import { trackerEntrySearchStages } from "@/lib/server/client-search";
import { MAX_SEARCH_LENGTH } from "@/lib/search/client-search";
import { withTrackerApiErrors } from "@/lib/server/tracker-api-errors";
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminSession } from "@/lib/authUsers";
import { connectDB } from "@/lib/mongoose";
import ClientTracker from "@/models/ClientTracker";
import ClientTrackerEntry from "@/models/ClientTrackerEntry";
import Client from "@/models/Client";
import EmailLog from "@/models/EmailLog";
import { syncCategoryTrackerMembership } from "@/lib/server/tracker-membership";
import { resolveTrackerLinkedValues } from "@/lib/server/tracker-linked-data";
import { resolveTrackerComputedValues } from "@/lib/server/tracker-computed-values";
import { evaluateTrackerConditionGroup } from "@/lib/server/tracker-conditions";
import { finaliseReadableReportSheet } from "@/lib/server/excel-report-style";
import { matchesTrackerFieldFilter, trackerFieldFilterQuery } from "@/lib/tracker-filters";
import {
  CLIENT_TRACKER_DETAIL_OPTIONS,
  type ClientTrackerDetailKey,
  type TrackerField,
  type TrackerSavedView,
  type TrackerValue,
  type TrackerValues,
} from "@/lib/clientTrackers";

const textValue = (value: TrackerValue | undefined) =>
  Array.isArray(value)
    ? value.join(", ")
    : value === true
      ? "Yes"
      : value === false
        ? "No"
        : String(value ?? "");


const clientDetail = (client: unknown, key: ClientTrackerDetailKey) =>
  String((client as Record<string, unknown> | null)?.[key] || "—");

export const GET = withTrackerApiErrors(async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!(await isAdminSession(session)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await connectDB();
  const trackerDocument = await ClientTracker.findById(id);
  if (!trackerDocument)
    return NextResponse.json({ error: "Tracker not found." }, { status: 404 });
  await syncCategoryTrackerMembership(trackerDocument);
  const tracker = trackerDocument.toObject() as {
    _id: string;
    name: string;
    financialYear?: string;
    fields: TrackerField[];
    clientColumns?: ClientTrackerDetailKey[];
    savedViews?: TrackerSavedView[];
    clientIds?: string[];
    emailEnabled?: boolean;
  };
  const searchParams = req.nextUrl.searchParams;
  const search = searchParams.get("search")?.trim() || "";
  const category = searchParams.get("category")?.trim() || "";
  const fieldKey = searchParams.get("field")?.trim() || "";
  const fieldValue = searchParams.get("value")?.trim() || "";
  const savedViewId = searchParams.get("view")?.trim() || "";
  const field = tracker.fields.find((item) => item.key === fieldKey);
  const savedView = (tracker.savedViews || []).find(
    (view) => view.id === savedViewId,
  );
  if (search.length > MAX_SEARCH_LENGTH) return NextResponse.json({ error: "Search is too long" }, { status: 400 });
  const searchStages = await trackerEntrySearchStages(search, category);
  const entryFilter: Record<string, unknown> = {
    trackerId: tracker._id,
    inScope: { $ne: false },
  };
  if (search || category) entryFilter.clientId = { $in: tracker.clientIds || [] };
  const dynamicFilter = Boolean(
    savedView || (field && fieldValue && (field.dataLink || field.computed)),
  );
  if (field && fieldValue && !dynamicFilter) {
    const valuePath = `values.${field.key}`;
    entryFilter[valuePath] = trackerFieldFilterQuery(field, fieldValue);
  }
  const entries = (await (searchStages.length
    ? ClientTrackerEntry.aggregate([{ $match: entryFilter }, ...searchStages, { $sort: { updatedAt: -1, _id: -1 } }])
    : ClientTrackerEntry.find(entryFilter).sort({ updatedAt: -1, _id: -1 }).lean())) as unknown as Array<{
    clientId: string;
    values: TrackerValues;
    updatedAt: Date;
  }>;
  const linkedValues = await resolveTrackerLinkedValues(
    tracker.fields,
    entries.map((entry) => entry.clientId),
    tracker.financialYear,
  );
  const resolved = entries
    .map((entry) => ({
      ...entry,
      values: resolveTrackerComputedValues(tracker.fields, {
        ...entry.values,
        ...(linkedValues.get(entry.clientId) || {}),
      }),
    }))
    .filter((entry) => {
      if (
        savedView &&
        !evaluateTrackerConditionGroup(savedView.conditionGroup, entry.values)
      )
        return false;
      if (!field || !fieldValue || !dynamicFilter) return true;
      return matchesTrackerFieldFilter(field, entry.values[field.key], fieldValue);
    });
  const clientIds = resolved.map((entry) => entry.clientId);
  const [clients, logs] = await Promise.all([
    Client.find({ clientId: { $in: clientIds } })
      .select("clientId companyName category state legalName gstNumber registrationNumber address")
      .lean(),
    tracker.emailEnabled
      ? EmailLog.find({ trackerId: id })
          .sort({ sentAt: -1 })
          .select("clientId status communicationStatus mailKind")
          .lean()
      : Promise.resolve([]),
  ]);
  const clientsById = new Map(clients.map((client) => [client.clientId, client]));
  const communication = new Map<string, string>();
  logs.forEach((log) => {
    if (communication.has(log.clientId)) return;
    communication.set(
      log.clientId,
      log.communicationStatus === "replied"
        ? "Replied"
        : log.status === "draft"
          ? "Draft Created"
          : log.status === "failed"
            ? "Failed"
            : log.mailKind === "reminder"
              ? "Reminder Sent"
              : "Sent",
    );
  });
  const clientColumns = tracker.clientColumns || ["state"];
  const headers = [
    "Client",
    "Client ID",
    "Category",
    ...(tracker.emailEnabled ? ["Communication"] : []),
    ...clientColumns.map(
      (key) =>
        CLIENT_TRACKER_DETAIL_OPTIONS.find((option) => option.key === key)
          ?.label || key,
    ),
    ...tracker.fields.map((field) => field.label),
    "Updated",
  ];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nextgen Solutions";
  const sheet = workbook.addWorksheet("Current tracker");
  sheet.addRow(headers);
  resolved.forEach((entry) => {
    const client = clientsById.get(entry.clientId);
    sheet.addRow([
      client?.companyName || entry.clientId,
      entry.clientId,
      client?.category || "—",
      ...(tracker.emailEnabled
        ? [communication.get(entry.clientId) || "Not Contacted"]
        : []),
      ...clientColumns.map((column) => clientDetail(client, column)),
      ...tracker.fields.map((field) => textValue(entry.values[field.key])),
      entry.updatedAt,
    ]);
  });
  sheet.getColumn(sheet.columnCount).numFmt = "dd-mmm-yyyy";
  for (let index = 1; index <= sheet.columnCount; index += 1) {
    const header = String(sheet.getRow(1).getCell(index).value || "");
    sheet.getColumn(index).width = Math.min(
      42,
      Math.max(14, header.length + 3),
    );
  }
  finaliseReadableReportSheet(sheet, { freezeColumns: 2 });
  const buffer = await workbook.xlsx.writeBuffer();
  const safeName = tracker.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "client-tracker";
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}-current-state.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
});

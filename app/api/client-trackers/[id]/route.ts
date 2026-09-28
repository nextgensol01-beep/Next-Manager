import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Client from "@/models/Client";
import ClientTracker from "@/models/ClientTracker";
import ClientTrackerEntry from "@/models/ClientTrackerEntry";
import {
  CLIENT_TRACKER_CATEGORIES,
  CLIENT_TRACKER_DETAIL_OPTIONS,
  initialTrackerValues,
  type ClientTrackerCategory,
  type ClientTrackerDetailKey,
  type TrackerField,
  type TrackerSavedView,
  type TrackerValues,
} from "@/lib/clientTrackers";
import { cleanTrackerFields } from "@/lib/server/tracker-fields";
import { isAdminSession } from "@/lib/authUsers";
import { cleanTrackerEmailWorkflows } from "@/lib/server/tracker-email-workflows";
import { resolveTrackerLinkedValues } from "@/lib/server/tracker-linked-data";
import { resolveTrackerComputedValues } from "@/lib/server/tracker-computed-values";
import { syncCategoryTrackerMembership } from "@/lib/server/tracker-membership";
import { evaluateTrackerConditionGroup } from "@/lib/server/tracker-conditions";
import { recordActivityEvent } from "@/lib/server/activity-events";

function usesCpcbUploadData(fields: { dataLink?: { source: string } }[]) {
  return fields.some((field) =>
    ["purchaseUploads", "saleUploads", "uploadedData"].includes(
      field.dataLink?.source || "",
    ),
  );
}

function escapedRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function valueText(value: unknown) {
  return value === true ? "Yes" : value === false ? "No" : String(value ?? "");
}

const TRACKER_RULE_OPERATORS = new Set([
  "equals",
  "not_equals",
  "is_empty",
  "is_not_empty",
  "contains",
  "not_contains",
  "greater_than",
  "greater_than_or_equal",
  "less_than",
  "less_than_or_equal",
]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const trackerDocument = (await ClientTracker.findById(id)) as unknown as {
    _id: string;
    fields: TrackerField[];
    clientMembershipMode?: "snapshot" | "categorySync";
    clientCategories?: ClientTrackerCategory[];
    clientIds?: string[];
    createdBy?: string;
    save: () => Promise<unknown>;
    toObject: () => unknown;
  } | null;
  if (!trackerDocument)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  await syncCategoryTrackerMembership(trackerDocument);
  const tracker = trackerDocument.toObject() as {
    _id: string;
    fields: TrackerField[];
    [key: string]: unknown;
  };
  const searchParams = new URL(req.url).searchParams;
  const requestedLimit = Number(searchParams.get("limit") || 100);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(Math.floor(requestedLimit), 250))
    : 100;
  const requestedOffset = Number(searchParams.get("offset") || 0);
  const offset = Number.isFinite(requestedOffset)
    ? Math.max(0, Math.min(Math.floor(requestedOffset), 100000))
    : 0;
  const search = searchParams.get("search")?.trim() || "";
  const category = searchParams.get("category")?.trim() || "";
  const fieldKey = searchParams.get("field")?.trim() || "";
  const fieldValue = searchParams.get("value")?.trim() || "";
  const savedViewId = searchParams.get("view")?.trim() || "";
  const includeOverview = searchParams.get("overview") !== "0";
  const field = tracker.fields.find((item) => item.key === fieldKey);
  const savedViews = Array.isArray(tracker.savedViews)
    ? (tracker.savedViews as TrackerSavedView[])
    : [];
  const savedView = savedViews.find((view) => view.id === savedViewId);
  let eligibleClientIds: string[] | undefined;
  if (search || category) {
    const clientFilter: Record<string, unknown> = {};
    if (category) clientFilter.category = category;
    if (search) {
      const term = new RegExp(escapedRegExp(search), "i");
      clientFilter.$or = [
        { companyName: term },
        { clientId: term },
        { category: term },
      ];
    }
    eligibleClientIds = (
      await Client.find(clientFilter).select("clientId").lean()
    ).map((client) => client.clientId);
  }
  const entryFilter: Record<string, unknown> = {
    trackerId: tracker._id,
    inScope: { $ne: false },
  };
  if (eligibleClientIds) entryFilter.clientId = { $in: eligibleClientIds };
  const dynamicFilter = Boolean(
    savedView || (field && fieldValue && (field.dataLink || field.computed)),
  );
  if (field && fieldValue && !dynamicFilter) {
    const valuePath = `values.${field.key}`;
    if (["text", "longText"].includes(field.type)) {
      entryFilter[valuePath] = new RegExp(escapedRegExp(fieldValue), "i");
    } else if (["multiSelect", "tags"].includes(field.type)) {
      entryFilter[valuePath] = { $in: [fieldValue] };
    } else if (
      ["number", "percentage", "quantity", "currency", "progress"].includes(
        field.type,
      )
    ) {
      const numericValue = Number(fieldValue);
      entryFilter[valuePath] = Number.isFinite(numericValue)
        ? numericValue
        : fieldValue;
    } else {
      entryFilter[valuePath] = fieldValue;
    }
  }
  const [totalEntryCount, matchingEntryCount, overviewCounts] =
    await Promise.all([
      ClientTrackerEntry.countDocuments({
        trackerId: tracker._id,
        inScope: { $ne: false },
      }),
      dynamicFilter
        ? Promise.resolve(undefined)
        : ClientTrackerEntry.countDocuments(entryFilter),
      includeOverview
        ? ClientTrackerEntry.aggregate<{
            _id: { key: string; value: unknown };
            count: number;
          }>([
            { $match: { trackerId: tracker._id, inScope: { $ne: false } } },
            { $project: { values: { $objectToArray: "$values" } } },
            { $unwind: "$values" },
            {
              $group: {
                _id: { key: "$values.k", value: "$values.v" },
                count: { $sum: 1 },
              },
            },
          ])
        : Promise.resolve([]),
    ]);
  const resolveEntryValues = async (
    entries: Array<{
      clientId: string;
      values: unknown;
      [key: string]: unknown;
    }>,
  ) => {
    const linkedValues = await resolveTrackerLinkedValues(
      tracker.fields,
      entries.map((entry) => entry.clientId),
      typeof tracker.financialYear === "string"
        ? tracker.financialYear
        : undefined,
    );
    return entries.map((entry) => ({
      ...entry,
      values: resolveTrackerComputedValues(tracker.fields, {
        ...(entry.values as TrackerValues),
        ...(linkedValues.get(entry.clientId) || {}),
      }),
    }));
  };
  const matchesDynamicFilter = (entry: { values: TrackerValues }) => {
    if (
      savedView &&
      !evaluateTrackerConditionGroup(savedView.conditionGroup, entry.values)
    )
      return false;
    if (!field || !fieldValue) return true;
    const rawValue = entry.values[field.key];
    const value = valueText(rawValue);
    if (["multiSelect", "tags"].includes(field.type))
      return Array.isArray(rawValue) && rawValue.includes(fieldValue);
    return ["text", "longText"].includes(field.type)
      ? value.toLowerCase().includes(fieldValue.toLowerCase())
      : value === fieldValue;
  };
  let pageEntries: Array<{
    clientId: string;
    values: TrackerValues;
    [key: string]: unknown;
  }> = [];
  let hasMore = false;
  if (dynamicFilter) {
    const batchSize = Math.min(Math.max(limit * 2, 250), 1000);
    const matched: Array<{
      clientId: string;
      values: TrackerValues;
      [key: string]: unknown;
    }> = [];
    let scanOffset = 0;
    while (matched.length <= offset + limit) {
      const batch = await ClientTrackerEntry.find(entryFilter)
        .sort({ updatedAt: -1, _id: -1 })
        .skip(scanOffset)
        .limit(batchSize)
        .lean();
      if (!batch.length) break;
      const resolvedBatch = await resolveEntryValues(
        batch as unknown as Array<{
          clientId: string;
          values: unknown;
          [key: string]: unknown;
        }>,
      );
      matched.push(...resolvedBatch.filter(matchesDynamicFilter));
      scanOffset += batch.length;
      if (batch.length < batchSize) break;
    }
    pageEntries = matched.slice(offset, offset + limit);
    hasMore = matched.length > offset + limit;
  } else {
    const entries = await ClientTrackerEntry.find(entryFilter)
      .sort({ updatedAt: -1, _id: -1 })
      .skip(offset)
      .limit(limit + 1)
      .lean();
    hasMore = entries.length > limit;
    pageEntries = await resolveEntryValues(
      entries.slice(0, limit) as unknown as Array<{
        clientId: string;
        values: unknown;
        [key: string]: unknown;
      }>,
    );
  }
  const clients = await Client.find({
    clientId: { $in: pageEntries.map((entry) => entry.clientId) },
  })
    .select(
      "clientId companyName category state legalName gstNumber registrationNumber address",
    )
    .lean();
  const clientsById = new Map(
    clients.map((client) => [client.clientId, client]),
  );
  const resolvedEntries = pageEntries.map((entry) => ({
    ...entry,
    client: clientsById.get(entry.clientId) || null,
  }));
  const dynamicFields = tracker.fields.filter(
    (field) => field.dataLink || field.computed,
  );
  let resolvedOverviewCounts = overviewCounts.map((item) => ({
    key: item._id.key,
    value: item._id.value,
    count: item.count,
  }));
  if (includeOverview && dynamicFields.length) {
    const overviewEntries = await ClientTrackerEntry.find({
      trackerId: tracker._id,
      inScope: { $ne: false },
    })
      .select("clientId values")
      .lean();
    const overviewLinkedValues = await resolveTrackerLinkedValues(
      tracker.fields,
      overviewEntries.map((entry) => entry.clientId),
      typeof tracker.financialYear === "string"
        ? tracker.financialYear
        : undefined,
    );
    const dynamicKeys = new Set(dynamicFields.map((field) => field.key));
    const liveCounts = new Map<
      string,
      { key: string; value: unknown; count: number }
    >();
    overviewEntries.forEach((entry) => {
      const values = resolveTrackerComputedValues(tracker.fields, {
        ...(entry.values as TrackerValues),
        ...(overviewLinkedValues.get(entry.clientId) || {}),
      });
      dynamicFields.forEach((field) => {
        const value = values[field.key];
        const countKey = `${field.key}:${typeof value}:${String(value)}`;
        const current = liveCounts.get(countKey) || {
          key: field.key,
          value,
          count: 0,
        };
        current.count += 1;
        liveCounts.set(countKey, current);
      });
    });
    resolvedOverviewCounts = [
      ...resolvedOverviewCounts.filter((item) => !dynamicKeys.has(item.key)),
      ...liveCounts.values(),
    ];
  }
  return NextResponse.json({
    ...tracker,
    totalEntryCount,
    liveDataAsOf: dynamicFields.length ? new Date().toISOString() : undefined,
    entryCount: matchingEntryCount,
    offset,
    nextOffset: hasMore ? offset + limit : null,
    hasMore,
    overviewCounts: includeOverview ? resolvedOverviewCounts : undefined,
    entries: resolvedEntries,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdminSession(session)))
    return NextResponse.json(
      {
        error: "Administrator access required to change tracker configuration.",
      },
      { status: 403 },
    );
  await connectDB();
  const { id } = await params;
  const body = await req.json();
  const current = (await ClientTracker.findById(id)) as unknown as {
    _id: string;
    fields: TrackerField[];
    name: string;
    description?: string;
    financialYear?: string;
    clientIds?: string[];
    status: "active" | "archived";
    emailEnabled?: boolean;
    emailWorkflows?: unknown[];
  } | null;
  if (!current)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (current.status === "archived" && body.status !== "active")
    return NextResponse.json(
      { error: "Restore this tracker before changing its configuration." },
      { status: 409 },
    );
  const update: Record<string, unknown> = {};
  if (typeof body.name !== "undefined") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name)
      return NextResponse.json(
        { error: "Tracker name is required." },
        { status: 400 },
      );
    update.name = name;
  }
  if (typeof body.description !== "undefined")
    update.description =
      typeof body.description === "string" ? body.description.trim() : "";
  if (typeof body.financialYear !== "undefined")
    update.financialYear =
      typeof body.financialYear === "string" ? body.financialYear.trim() : "";
  if (body.status === "archived" || body.status === "active")
    update.status = body.status;
  if (typeof body.fields !== "undefined") {
    const fields = cleanTrackerFields(
      body.fields,
      body.includeStatus !== false,
    );
    if (!fields)
      return NextResponse.json(
        {
          error:
            "Keep at least one tracker column; dropdowns need at least two options.",
        },
        { status: 400 },
      );
    update.fields = fields;
    const oldKeys = new Set(
      current.fields.map((field: TrackerField) => field.key),
    );
    const removedFields = current.fields.filter(
      (field) => !fields.some((next) => next.key === field.key),
    );
    const changedChoiceFields = fields.filter(
      (field) =>
        (field.type === "select" || field.type === "status") &&
        current.fields.some(
          (previous) =>
            previous.key === field.key &&
            (previous.type !== field.type ||
              !previous.options?.every((option) =>
                field.options?.includes(option),
              )),
        ),
    );
    if (changedChoiceFields.length) {
      const affectedKeys = changedChoiceFields.map((field) => field.key);
      const affectedEntries = await ClientTrackerEntry.find({
        trackerId: current._id,
        inScope: { $ne: false },
      })
        .select("values")
        .lean();
      const invalid = affectedEntries.some((entry) =>
        affectedKeys.some((key) => {
          const field = fields.find((item) => item.key === key);
          const value = String(
            (entry.values as Record<string, unknown>)?.[key] ?? "",
          );
          return value && !field?.options?.includes(value);
        }),
      );
      if (invalid)
        return NextResponse.json(
          {
            error:
              "This change would invalidate existing dropdown marks. Update those client marks first, or keep their current options.",
          },
          { status: 400 },
        );
    }
    const addedFields = fields.filter((field) => !oldKeys.has(field.key));
    if (addedFields.length) {
      const defaults = initialTrackerValues(addedFields);
      await ClientTrackerEntry.updateMany(
        { trackerId: current._id, inScope: { $ne: false } },
        {
          $set: Object.fromEntries(
            Object.entries(defaults).map(([key, value]) => [
              `values.${key}`,
              value,
            ]),
          ),
        },
      );
    }
    if (removedFields.length)
      await ClientTrackerEntry.updateMany(
        { trackerId: current._id, inScope: { $ne: false } },
        {
          $unset: Object.fromEntries(
            removedFields.map((field) => [`values.${field.key}`, ""]),
          ),
        },
      );
  }
  const fieldsForFinancialYearCheck =
    (update.fields as TrackerField[] | undefined) || current.fields;
  const financialYearForCheck =
    typeof body.financialYear === "string"
      ? body.financialYear.trim()
      : current.financialYear || "";
  if (
    usesCpcbUploadData(fieldsForFinancialYearCheck) &&
    !financialYearForCheck
  ) {
    return NextResponse.json(
      { error: "Choose a financial year for CPCB upload live data." },
      { status: 400 },
    );
  }
  if (typeof body.emailEnabled !== "undefined")
    update.emailEnabled = body.emailEnabled === true;
  if (typeof body.emailWorkflows !== "undefined") {
    const fields =
      (update.fields as TrackerField[] | undefined) || current.fields;
    const workflows = cleanTrackerEmailWorkflows(body.emailWorkflows, fields);
    if (!workflows)
      return NextResponse.json(
        { error: "One or more email workflows are invalid." },
        { status: 400 },
      );
    update.emailWorkflows = workflows;
  }
  if (typeof body.savedViews !== "undefined") {
    if (!Array.isArray(body.savedViews) || body.savedViews.length > 20)
      return NextResponse.json(
        { error: "A tracker can have up to 20 saved views." },
        { status: 400 },
      );
    const keys = new Set(current.fields.map((field) => field.key));
    const ids = new Set<string>();
    const views: Array<{
      id: string;
      name: string;
      conditionGroup: unknown;
    } | null> = body.savedViews.map((raw: unknown) => {
      const view = raw as {
        id?: unknown;
        name?: unknown;
        conditionGroup?: { mode?: unknown; conditions?: unknown };
      };
      const id = typeof view.id === "string" ? view.id.trim().slice(0, 64) : "";
      const name =
        typeof view.name === "string" ? view.name.trim().slice(0, 80) : "";
      const group = view.conditionGroup;
      const validConditions =
        group &&
        Array.isArray(group.conditions) &&
        group.conditions.length <= 12 &&
        group.conditions.every(
          (condition: {
            fieldKey?: unknown;
            operator?: unknown;
            value?: unknown;
          }) => {
            const operator =
              typeof condition?.operator === "string" ? condition.operator : "";
            const valueType = typeof condition?.value;
            return (
              typeof condition?.fieldKey === "string" &&
              keys.has(condition.fieldKey) &&
              TRACKER_RULE_OPERATORS.has(operator) &&
              (valueType === "undefined" ||
                valueType === "string" ||
                valueType === "number" ||
                valueType === "boolean")
            );
          },
        );
      if (
        !id ||
        ids.has(id) ||
        !name ||
        !group ||
        (group.mode !== "ALL" && group.mode !== "ANY") ||
        !validConditions
      )
        return null;
      ids.add(id);
      return { id, name, conditionGroup: group };
    });
    if (
      views.some(
        (view: { id: string; name: string; conditionGroup: unknown } | null) =>
          !view,
      )
    )
      return NextResponse.json(
        { error: "One or more saved views are invalid." },
        { status: 400 },
      );
    update.savedViews = views;
  }
  if (typeof body.clientColumns !== "undefined") {
    const allowed = new Set(
      CLIENT_TRACKER_DETAIL_OPTIONS.map((option) => option.key),
    );
    update.clientColumns = Array.isArray(body.clientColumns)
      ? [
          ...new Set(
            body.clientColumns.filter(
              (key: unknown): key is ClientTrackerDetailKey =>
                typeof key === "string" &&
                allowed.has(key as ClientTrackerDetailKey),
            ),
          ),
        ]
      : [];
  }
  if (typeof body.clientCategories !== "undefined") {
    const allowed = new Set<string>(CLIENT_TRACKER_CATEGORIES);
    update.clientCategories = Array.isArray(body.clientCategories)
      ? [
          ...new Set(
            body.clientCategories.filter(
              (category: unknown): category is ClientTrackerCategory =>
                typeof category === "string" && allowed.has(category),
            ),
          ),
        ]
      : [];
  }
  if (typeof body.clientMembershipMode !== "undefined") {
    if (
      body.clientMembershipMode !== "snapshot" &&
      body.clientMembershipMode !== "categorySync"
    )
      return NextResponse.json(
        { error: "Choose a valid client membership mode." },
        { status: 400 },
      );
    if (
      body.clientMembershipMode === "categorySync" &&
      !(
        body.clientCategories ||
        (current as unknown as { clientCategories?: string[] })
          .clientCategories ||
        []
      ).length
    )
      return NextResponse.json(
        { error: "Choose categories before enabling automatic membership." },
        { status: 400 },
      );
    update.clientMembershipMode = body.clientMembershipMode;
  }
  if (typeof body.clientIds !== "undefined") {
    const requestedIds = Array.isArray(body.clientIds)
      ? [
          ...new Set(
            body.clientIds
              .filter(
                (clientId: unknown): clientId is string =>
                  typeof clientId === "string",
              )
              .map((clientId: string) => clientId.trim())
              .filter(Boolean),
          ),
        ]
      : [];
    const clients = await Client.find({ clientId: { $in: requestedIds } })
      .select("clientId")
      .lean();
    const clientIds = clients.map((client) => client.clientId);
    if (!clientIds.length)
      return NextResponse.json(
        { error: "Keep at least one client in this tracker." },
        { status: 400 },
      );
    const previousIds = new Set(
      (current as unknown as { clientIds?: string[] }).clientIds || [],
    );
    const addedIds = clientIds.filter((clientId) => !previousIds.has(clientId));
    const entryFields =
      (update.fields as TrackerField[] | undefined) || current.fields;
    if (addedIds.length)
      await ClientTrackerEntry.bulkWrite(
        addedIds.map((clientId) => ({
          updateOne: {
            filter: { trackerId: current._id, clientId },
            update: {
              $setOnInsert: {
                values: initialTrackerValues(entryFields),
                updatedBy: session.user?.email || undefined,
                inScope: true,
              },
              $set: { inScope: true },
              $unset: { removedAt: "", removalReason: "" },
            },
            upsert: true,
          },
        })),
      );
    await ClientTrackerEntry.updateMany(
      {
        trackerId: current._id,
        clientId: { $nin: clientIds },
        inScope: { $ne: false },
      },
      {
        $set: {
          inScope: false,
          removedAt: new Date(),
          removalReason: "Removed manually from tracker scope",
        },
      },
    );
    update.clientIds = clientIds;
  }
  if (!Object.keys(update).length)
    return NextResponse.json(
      { error: "No tracker changes supplied" },
      { status: 400 },
    );
  const tracker = await ClientTracker.findByIdAndUpdate(
    id,
    { $set: update },
    { new: true },
  );
  if (!tracker)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auditEvents = [];
  if (typeof update.emailWorkflows !== "undefined") {
    const workflowCount = Array.isArray(update.emailWorkflows)
      ? update.emailWorkflows.length
      : 0;
    auditEvents.push(
      recordActivityEvent(
        {
          clientId: `tracker:${id}`,
          category: "communications",
          type: "tracker_workflows_saved",
          label: "Email workflows updated",
          detail: `${workflowCount} workflow${workflowCount === 1 ? "" : "s"} configured for ${tracker.name}.`,
          color: "blue",
          badge: "Workflow",
          financialYear: tracker.financialYear,
          entityId: id,
          entityType: "client_tracker",
        },
        session,
      ),
    );
  }
  if (typeof update.emailEnabled !== "undefined") {
    auditEvents.push(
      recordActivityEvent(
        {
          clientId: `tracker:${id}`,
          category: "communications",
          type: "tracker_email_updates_toggled",
          label: update.emailEnabled
            ? "Client email updates enabled"
            : "Client email updates disabled",
          detail: `${tracker.name} email workflows are ${update.emailEnabled ? "available" : "disabled"}.`,
          color: update.emailEnabled ? "emerald" : "amber",
          badge: "Email",
          financialYear: tracker.financialYear,
          entityId: id,
          entityType: "client_tracker",
        },
        session,
      ),
    );
  }
  if (typeof update.savedViews !== "undefined") {
    auditEvents.push(
      recordActivityEvent(
        {
          clientId: `tracker:${id}`,
          category: "system",
          type: "tracker_saved_views_updated",
          label: "Saved views updated",
          detail: `${Array.isArray(update.savedViews) ? update.savedViews.length : 0} saved view(s) configured for ${tracker.name}.`,
          color: "violet",
          badge: "Views",
          financialYear: tracker.financialYear,
          entityId: id,
          entityType: "client_tracker",
        },
        session,
      ),
    );
  }
  if (typeof update.status !== "undefined") {
    const archived = update.status === "archived";
    auditEvents.push(
      recordActivityEvent(
        {
          clientId: `tracker:${id}`,
          category: "system",
          type: archived ? "tracker_archived" : "tracker_restored",
          label: archived ? "Tracker archived" : "Tracker restored",
          detail: archived
            ? `${tracker.name} is now read-only; communication history remains available.`
            : `${tracker.name} is active again.`,
          color: archived ? "amber" : "emerald",
          badge: archived ? "Archived" : "Active",
          financialYear: tracker.financialYear,
          entityId: id,
          entityType: "client_tracker",
        },
        session,
      ),
    );
  }
  await Promise.all(auditEvents);
  return NextResponse.json(tracker);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdminSession(session)))
    return NextResponse.json(
      { error: "Administrator access required to delete trackers." },
      { status: 403 },
    );
  await connectDB();
  const { id } = await params;
  const tracker = await ClientTracker.findById(id);
  if (!tracker)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Remove entries first: a failed child delete must not leave an inaccessible parent behind.
  await ClientTrackerEntry.deleteMany({ trackerId: tracker._id });
  await ClientTracker.deleteOne({ _id: tracker._id });
  return NextResponse.json({ success: true });
}

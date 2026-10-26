import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminSession } from "@/lib/authUsers";
import { connectDB } from "@/lib/mongoose";
import ClientTracker from "@/models/ClientTracker";
import ClientTrackerEntry from "@/models/ClientTrackerEntry";
import Client from "@/models/Client";
import EmailLog from "@/models/EmailLog";
import { withTrackerApiErrors, readTrackerRequestBody } from "@/lib/server/tracker-api-errors";
import { cleanTrackerEmailWorkflows } from "@/lib/server/tracker-email-workflows";
import { validateEmailWorkflowDrafts } from "@/lib/tracker-email-validation";
import { createTrackerEmailContext, emailCommunicationStatus } from "@/lib/tracker-email-context";
import { resolveTrackerLinkedValues } from "@/lib/server/tracker-linked-data";
import { resolveTrackerComputedValues } from "@/lib/server/tracker-computed-values";
import { analyzeScenarioClient, summarizeScenarioAnalysis, type ScenarioClientResult } from "@/lib/tracker-scenario-analysis";
import type { TrackerField, TrackerValues } from "@/lib/clientTrackers";

export const maxDuration = 60;
const LIMIT = 2000, CHUNK = 250;
export const POST = withTrackerApiErrors(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await isAdminSession(session)) return NextResponse.json({ error: "Administrator access required to test tracker workflows." }, { status: 403 });
  const body = await readTrackerRequestBody(req);
  if (!body.workflow || typeof body.workflow !== "object" || JSON.stringify(body.workflow).length > 150000) return NextResponse.json({ error: "Choose a valid workflow draft." }, { status: 400 });
  if (body.entryId !== undefined && (typeof body.entryId !== "string" || !/^[a-f\d]{24}$/i.test(body.entryId))) return NextResponse.json({ error: "Choose a valid tracker entry." }, { status: 400 });
  await connectDB();
  const { id } = await params;
  const tracker = await ClientTracker.findById(id).select("name fields financialYear status").lean() as unknown as { name: string; fields: TrackerField[]; financialYear?: string; status: string } | null;
  if (!tracker) return NextResponse.json({ error: "Tracker not found." }, { status: 404 });
  if (tracker.status !== "active") return NextResponse.json({ error: "Restore this tracker before testing workflows." }, { status: 409 });
  const workflows = cleanTrackerEmailWorkflows([body.workflow], tracker.fields);
  if (!workflows?.length) return NextResponse.json({ error: "The workflow draft contains invalid conditions, content, or delivery settings. Review the highlighted scenario before testing." }, { status: 400 });
  const issue = validateEmailWorkflowDrafts(workflows, tracker.fields);
  if (issue) return NextResponse.json({ error: issue }, { status: 400 });
  const workflow = workflows[0], filter = { trackerId: id, inScope: { $ne: false }, ...(body.entryId ? { _id: body.entryId } : {}) };
  const [total, entries] = await Promise.all([
    ClientTrackerEntry.countDocuments(filter),
    ClientTrackerEntry.find(filter).select("_id clientId values").sort({ _id: 1 }).limit(body.entryId ? 1 : LIMIT).lean(),
  ]);
  if (body.entryId && !entries.length) return NextResponse.json({ error: "This client is no longer in the tracker audience." }, { status: 404 });
  const rows: ScenarioClientResult[] = [];
  const needsStatus = JSON.stringify(workflow).includes("client.communicationStatus");
  const started = Date.now();
  for (let offset = 0; offset < entries.length; offset += CHUNK) {
    if (req.signal.aborted || Date.now() - started > 45000) break;
    const batch = entries.slice(offset, offset + CHUNK), ids = batch.map(entry => entry.clientId);
    const [clients, linked, logs] = await Promise.all([
      Client.find({ clientId: { $in: ids } }).select("clientId companyName category state gstNumber").lean(),
      resolveTrackerLinkedValues(tracker.fields, ids, tracker.financialYear),
      needsStatus ? EmailLog.aggregate([
        { $match: { trackerId: id, clientId: { $in: ids } } }, { $sort: { sentAt: -1, _id: -1 } },
        { $group: { _id: "$clientId", status: { $first: "$status" }, communicationStatus: { $first: "$communicationStatus" }, mailKind: { $first: "$mailKind" } } },
      ]) : Promise.resolve([]),
    ]);
    const byClient = new Map(clients.map(client => [client.clientId, client])), statuses = new Map(logs.map(log => [log._id, emailCommunicationStatus(log)]));
    for (const entry of batch) {
      const client = byClient.get(entry.clientId);
      if (!client) {
        rows.push({ entryId: String(entry._id), clientId: entry.clientId, companyName: entry.clientId, decision: "invalid", reason: "The linked client record is unavailable.", sendRuleMatched: false, matchedRuleIds: [], selectedRuleIds: [], issues: ["Missing client context."], selection: { matchingMode: workflow.combinationMatchingMode || "legacy", matchedScenarioIds: [], selectedScenarioIds: [], ignoredScenarioIds: [], matchedStatementIds: [], matchedPointIds: [], scenarios: [] } }); continue;
      }
      const values = resolveTrackerComputedValues(tracker.fields, { ...(entry.values as TrackerValues), ...(linked.get(entry.clientId) || {}) });
      const context = createTrackerEmailContext({ entry: { clientId: entry.clientId, _id: entry._id }, client: { clientId: client.clientId, companyName: client.companyName, category: client.category, state: client.state, gstNumber: client.gstNumber }, values, fields: tracker.fields, financialYear: tracker.financialYear, trackerName: tracker.name, workflowName: workflow.name, communicationStatus: statuses.get(entry.clientId) });
      rows.push(analyzeScenarioClient(workflow, context, Boolean(body.entryId)));
    }
  }
  return NextResponse.json(summarizeScenarioAnalysis(workflow, rows, total, LIMIT), { headers: { "Cache-Control": "private, no-store" } });
});

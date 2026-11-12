import { activeEmailRules, createTrackerEmailContext, emailCommunicationStatus, emailWorkflowConditionIssue, evaluateEmailConditionGroup } from "@/lib/tracker-email-context";
import { renderTrackerEmail } from "@/lib/tracker-email-renderer";
import { withTrackerApiErrors, readTrackerRequestBody } from "@/lib/server/tracker-api-errors";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminSession } from "@/lib/authUsers";
import { connectDB } from "@/lib/mongoose";
import ClientTracker from "@/models/ClientTracker";
import ClientTrackerEntry from "@/models/ClientTrackerEntry";
import Client from "@/models/Client";
import ClientContact from "@/models/ClientContact";
import Person from "@/models/Person";
import EmailLog from "@/models/EmailLog";
import Document from "@/models/Document";
import { resolveTrackerLinkedValues } from "@/lib/server/tracker-linked-data";
import { resolveTrackerComputedValues } from "@/lib/server/tracker-computed-values";
import { trackedDrafts, trackerDraftBlock } from "@/lib/server/tracker-email-drafts";
import type { CampaignDraftReview } from "@/lib/tracker-email-delivery-review";
import {
  type ManagedTrackerEmailDocument,
} from "@/lib/server/tracker-email-attachments";
import { createAttachmentMetadataReader, prepareTrackerAttachmentSelection } from "@/lib/server/tracker-attachment-snapshot";
import type {
  TrackerEmailWorkflow,
  TrackerField,
  TrackerValues,
} from "@/lib/clientTrackers";
import {
  legacyWorkflowCondition,
} from "@/lib/server/tracker-conditions";

export const GET = withTrackerApiErrors(async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const searchParams = new URL(req.url).searchParams;
  if (searchParams.get("compact") === "1") {
    let clientIds: unknown;
    try { clientIds = JSON.parse(searchParams.get("clientIds") || "[]"); }
    catch { return NextResponse.json({ error: "Choose valid page clients." }, { status: 400 }); }
    if (!Array.isArray(clientIds) || clientIds.length > 250 || clientIds.some(value => typeof value !== "string" || !value || value.length > 200))
      return NextResponse.json({ error: "Choose valid page clients." }, { status: 400 });
    // One stream provides authoritative whole-tracker totals and only the latest
    // communication metadata for this page. Bodies never enter this response.
    const [result] = await EmailLog.aggregate([
      { $match: { trackerId: id } },
      { $project: { clientId: 1, status: 1, communicationStatus: 1, mailKind: 1, sentAt: 1 } },
      { $facet: {
        counts: [{ $group: { _id: "$status", count: { $sum: 1 }, reminders: { $sum: { $cond: [{ $eq: ["$mailKind", "reminder"] }, 1, 0] } } } }],
        logs: [
          { $match: { clientId: { $in: [...new Set(clientIds as string[])] } } },
          { $sort: { sentAt: -1, _id: -1 } },
          { $group: { _id: "$clientId", log: { $first: "$$ROOT" } } },
          { $replaceRoot: { newRoot: "$log" } },
        ],
      } },
    ]);
    const summary: Record<string, number> = { total: 0, reminders: 0 };
    for (const row of result?.counts || []) {
      summary[row._id] = row.count; summary.total += row.count; summary.reminders += row.reminders;
    }
    return NextResponse.json({ logs: result?.logs || [], summary }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const logs = await EmailLog.find({ trackerId: id })
    .sort({ sentAt: -1 })
    .limit(200)
    .lean();
  const summary = logs.reduce<Record<string, number>>((counts, log) => {
    counts[log.status] = (counts[log.status] || 0) + 1;
    counts.total = (counts.total || 0) + 1;
    return counts;
  }, {});
  return NextResponse.json({ logs, summary }, { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = withTrackerApiErrors(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdminSession(session)))
    return NextResponse.json(
      { error: "Administrator access required to prepare tracker emails." },
      { status: 403 },
    );
  await connectDB();
  const { id } = await params;
  const body = await readTrackerRequestBody(req);
  const workflowId = typeof body.workflowId === "string" ? body.workflowId : "";
  const kind = body.kind === "reminder" ? "reminder" : "initial";
  const selectedIds = Array.isArray(body.entryIds)
    ? body.entryIds
        .filter((item: unknown): item is string => typeof item === "string")
        .slice(0, 500)
    : [];
  const tracker = (await ClientTracker.findById(id).lean()) as unknown as {
    _id: string;
    name: string;
    financialYear?: string;
    status: "active" | "archived";
    fields: TrackerField[];
    emailEnabled?: boolean;
    emailWorkflows?: TrackerEmailWorkflow[];
  } | null;
  if (!tracker)
    return NextResponse.json({ error: "Tracker not found." }, { status: 404 });
  if (tracker.status !== "active")
    return NextResponse.json(
      { error: "Restore this tracker before preparing client emails." },
      { status: 409 },
    );
  if (!tracker.emailEnabled)
    return NextResponse.json(
      { error: "Enable email updates in Configure tracker first." },
      { status: 409 },
    );
  const workflow = tracker.emailWorkflows?.find(
    (item) => item.id === workflowId,
  );
  if (!workflow)
    return NextResponse.json(
      { error: "Choose an email workflow." },
      { status: 400 },
    );
  const configurationIssue = emailWorkflowConditionIssue(workflow, tracker.fields);
  if (configurationIssue) return NextResponse.json({ error: configurationIssue, code: "invalid_workflow_configuration" }, { status: 409 });
  const entries = await ClientTrackerEntry.find({
    trackerId: id,
    inScope: { $ne: false },
    ...(selectedIds.length ? { _id: { $in: selectedIds } } : {}),
  }).lean();
  const clientIds = entries.map((entry) => entry.clientId);
  const sharedDocumentIds = (workflow.attachments || [])
    .filter(
      (attachment) =>
        attachment.source === "shared" && Boolean(attachment.documentId),
    )
    .map((attachment) => attachment.documentId!);
  const [clients, contacts, linkedValues, documents, existingDrafts] = await Promise.all([
    Client.find({ clientId: { $in: clientIds } })
      .select("clientId companyName category state gstNumber")
      .lean(),
    ClientContact.find({ clientId: { $in: clientIds } }).lean(),
    resolveTrackerLinkedValues(
      tracker.fields,
      clientIds,
      tracker.financialYear,
    ),
    workflow.attachments?.length
      ? Document.find({
          $or: [
            { clientId: { $in: clientIds } },
            ...(sharedDocumentIds.length
              ? [{ _id: { $in: sharedDocumentIds } }]
              : []),
          ],
        })
          .select("_id clientId documentName category documentKind financialYear storageType driveFileId mimeType fileSize uploadedDate updatedAt")
          .sort({ uploadedDate: -1, _id: -1 })
          .lean()
      : Promise.resolve([]),
    trackedDrafts({ trackerId: id, workflowId, mailKind: kind }, { clientIds }),
  ]);
  const draftByClient = new Map(existingDrafts.map(draft => [draft.clientId, draft]));
  const needsCommunication = JSON.stringify([workflow.conditionGroup, workflow.contentRules]).includes("client.communicationStatus");
  const communicationLogs = needsCommunication ? await EmailLog.find({ trackerId: id, clientId: { $in: clientIds } }).select("clientId status mailKind sentAt communicationStatus").sort({ sentAt: -1, _id: -1 }).lean() : [];
  const communicationByClient = new Map<string, string>();
  for (const log of communicationLogs) if (!communicationByClient.has(log.clientId)) communicationByClient.set(log.clientId, emailCommunicationStatus({ communicationStatus: log.communicationStatus, status: log.status, mailKind: log.mailKind }));
  const cooldownSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentLogs =
    kind === "reminder"
      ? await EmailLog.find({
          trackerId: id,
          workflowId,
          clientId: { $in: clientIds },
          mailKind: { $in: ["initial", "reminder"] },
          status: "sent",
          sentAt: { $gte: cooldownSince },
        })
          .select("clientId deliverySource")
          .lean()
      : [];
  const recentlySentClientIds = new Set(recentLogs.map((log) => log.clientId));
  const initialLogs = await EmailLog.find({
    trackerId: id,
    workflowId,
    clientId: { $in: clientIds },
    mailKind: "initial",
    status: "sent",
  }).select("clientId deliverySource").lean();
  const initialSentClientIds = new Set(initialLogs.map(log => log.clientId));
  const sentInGmail = new Set((kind === "initial" ? initialLogs : recentLogs).filter(log => log.deliverySource).map(log => log.clientId));
  const repliedClientIds = new Set(
    kind === "reminder"
      ? (
          await EmailLog.find({
            trackerId: id,
            workflowId,
            clientId: { $in: clientIds },
            status: "sent",
            communicationStatus: "replied",
          })
            .select("clientId")
            .lean()
        ).map((log) => log.clientId)
      : [],
  );
  const people = await Person.find({
    _id: { $in: contacts.map((contact) => contact.personId) },
  }).lean();
  const peopleById = new Map(
    people.map((person) => [String(person._id), person]),
  );
  const clientsById = new Map(
    clients.map((client) => [client.clientId, client]),
  );
  type Recipient = {
    email: string;
    name: string;
    designation: string;
    isPrimary: boolean;
  };
  const recipientsByClient = new Map<string, Recipient[]>();
  const preferredEmailsByClient = new Map<string, string[]>();
  contacts
    .sort((a, b) => Number(b.isPrimaryContact) - Number(a.isPrimaryContact))
    .forEach((contact) => {
      const person = peopleById.get(String(contact.personId));
      const selectedEmails = (
        contact.selectedEmails?.length
          ? contact.selectedEmails
          : person?.emails || []
      ).filter(Boolean) as string[];
      const allEmails = Array.from(
        new Set(
          (
            [
              ...(person?.emails || []),
              ...(contact.selectedEmails || []),
            ] as string[]
          )
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean),
        ),
      );
      if (
        selectedEmails.length &&
        !preferredEmailsByClient.has(contact.clientId)
      )
        preferredEmailsByClient.set(
          contact.clientId,
          selectedEmails.map((email: string) => email.trim().toLowerCase()),
        );
      const current = recipientsByClient.get(contact.clientId) || [];
      for (const email of allEmails) {
        if (!current.some((item) => item.email === email))
          current.push({
            email,
            name: person?.name || "Client contact",
            designation: contact.designation || "",
            isPrimary: Boolean(contact.isPrimaryContact),
          });
      }
      if (current.length) recipientsByClient.set(contact.clientId, current);
    });
  const messages: Array<Record<string, unknown>> = [];
  const documentsByClient = new Map<string, ManagedTrackerEmailDocument[]>();
  const sharedIds = new Set(sharedDocumentIds);
  const sharedDocuments: ManagedTrackerEmailDocument[] = [];
  for (const document of documents as unknown as ManagedTrackerEmailDocument[]) {
    const current = documentsByClient.get(document.clientId) || [];
    current.push(document);
    documentsByClient.set(document.clientId, current);
    if (sharedIds.has(String(document._id))) sharedDocuments.push(document);
  }
  const skipped: Array<{
    clientId: string;
    companyName: string;
    reason: string;
    reasonCode: string;
    reasons?: string[];
    gmailDraft?: CampaignDraftReview;
  }> = [];
  const clientMatches: Array<{ clientId: string; companyName: string; category?: string; selection: ReturnType<typeof renderTrackerEmail>["selection"]; sendRuleMatched: boolean }> = [];
  const inspectAttachments = createAttachmentMetadataReader();
  await Promise.all(entries.map(async (entry) => {
    const client = clientsById.get(entry.clientId);
    const companyName = client?.companyName || entry.clientId;
    const values = resolveTrackerComputedValues(tracker.fields, {
      ...(entry.values as TrackerValues),
      ...(linkedValues.get(entry.clientId) || {}),
    });
    if (!client) { skipped.push({ clientId: entry.clientId, companyName, reason: "The linked client record is unavailable.", reasonCode: "missing_client_context" }); return; }
    const context = createTrackerEmailContext({ entry: { clientId: entry.clientId, _id: entry._id }, client: { clientId: client.clientId, companyName: client.companyName, category: client.category, state: client.state, gstNumber: client.gstNumber }, values, fields: tracker.fields, financialYear: tracker.financialYear, trackerName: tracker.name, workflowName: workflow.name, communicationStatus: communicationByClient.get(entry.clientId) });
    const message = renderTrackerEmail(workflow, context, kind);
    const conditions =
      workflow.conditionGroup ||
      legacyWorkflowCondition(workflow.mainFieldKey, workflow.mainValue);
    const sendRuleMatched = evaluateEmailConditionGroup(conditions, context);
    clientMatches.push({ clientId: entry.clientId, companyName, category: client.category, selection: message.selection, sendRuleMatched });
    const draft = draftByClient.get(entry.clientId);
    if (draft) {
      const block = trackerDraftBlock(draft);
      const suggestion = draft.draftSuggestion;
      skipped.push({ clientId: entry.clientId, companyName, ...block, gmailDraft: {
        campaignId: draft.campaignId,
        state: block.reasonCode === "gmail_draft_review" ? "review" : "pending",
        canResolve: draft.draftResolution === "review",
        ...(block.reasonCode === "gmail_draft_pending" && (draft.deliveryId || draft.draftCheckedAt) ? { url: draft.deliveryId ? `https://mail.google.com/mail/#drafts/${encodeURIComponent(draft.deliveryId)}` : "https://mail.google.com/mail/#drafts" } : {}),
        ...(suggestion ? { suggestion: { messageId: suggestion.messageId, sentAt: suggestion.sentAt.toISOString(), url: `https://mail.google.com/mail/#sent/${encodeURIComponent(suggestion.threadId)}` } } : {}),
      } });
      return;
    }
    if (sentInGmail.has(entry.clientId) && (kind === "initial" || (sendRuleMatched && initialSentClientIds.has(entry.clientId) && !repliedClientIds.has(entry.clientId)))) {
      skipped.push({ clientId: entry.clientId, companyName, reason: kind === "initial" ? "Sent via Gmail · Use a reminder campaign" : "Sent via Gmail · Within the seven-day cooldown", reasonCode: "sent_via_gmail" });
      return;
    }
    if (!sendRuleMatched) {
      skipped.push({
        clientId: entry.clientId,
        companyName,
        reason: "Workflow eligibility conditions do not match",
        reasonCode: "conditions_not_matched",
      });
      return;
    }
    if (kind === "initial" && initialSentClientIds.has(entry.clientId)) {
      skipped.push({
        clientId: entry.clientId,
        companyName,
        reason: "Initial email already sent; use a reminder campaign",
        reasonCode: "initial_already_sent",
      });
      return;
    }
    if (kind === "reminder" && !initialSentClientIds.has(entry.clientId)) {
      skipped.push({
        clientId: entry.clientId,
        companyName,
        reason: "Initial email has not been sent",
        reasonCode: "initial_required",
      });
      return;
    }
    if (kind === "reminder" && repliedClientIds.has(entry.clientId)) {
      skipped.push({
        clientId: entry.clientId,
        companyName,
        reason: "Client has replied to this workflow email",
        reasonCode: "replied",
      });
      return;
    }
    if (recentlySentClientIds.has(entry.clientId)) {
      skipped.push({
        clientId: entry.clientId,
        companyName,
        reason: "Sent recently; 7-day safety cooldown",
        reasonCode: "recently_sent",
      });
      return;
    }
    const recipients = recipientsByClient.get(entry.clientId) || [];
    const selected = (preferredEmailsByClient.get(entry.clientId) || []).filter(
      (email) => recipients.some((recipient) => recipient.email === email),
    );
    const primary = recipients
      .filter((recipient) => recipient.isPrimary)
      .map((recipient) => recipient.email);
    const all = recipients.map((recipient) => recipient.email);
    const strategy = workflow.recipientStrategy || "selected";
    const suggestedTo =
      strategy === "all"
        ? all
        : strategy === "primary"
          ? primary.length
            ? primary.slice(0, 1)
            : selected.length
              ? selected.slice(0, 1)
              : all.slice(0, 1)
          : strategy === "per_client"
            ? primary.length
              ? primary.slice(0, 1)
              : selected.length
                ? selected.slice(0, 1)
                : all.slice(0, 1)
            : selected.length
              ? selected.slice(0, 1)
              : primary.length
                ? primary.slice(0, 1)
                : all.slice(0, 1);
    const to = suggestedTo[0];
    if (!to) {
      skipped.push({
        clientId: entry.clientId,
        companyName,
        reason: "No contact email matches the selected recipient strategy",
        reasonCode: "no_recipient",
      });
      return;
    }
    if (!message.subject || !message.body) {
      skipped.push({
        clientId: entry.clientId,
        companyName,
        reason: message.skipReason || "Email content is empty",
        reasonCode: message.skipReason === "Matched a combination rule configured not to send" ? "combination_skipped" : message.skipReason === "No combination rule matches this client" ? "combination_not_matched" : "empty_content",
      });
      return;
    }
    if (message.unresolvedVariables.length) {
      skipped.push({
        clientId: entry.clientId,
        companyName,
        reasonCode: message.variableIssues[0]?.code || "missing_variables",
        reason: message.variableIssues.map(issue => issue.message).join("; "),
      });
      return;
    }
    const attachmentSelection = await prepareTrackerAttachmentSelection({
      workflow,
      documents: [...(documentsByClient.get(entry.clientId) || []), ...sharedDocuments.filter(document => document.clientId !== entry.clientId)],
      clientId: entry.clientId,
      values,
      financialYear: tracker.financialYear,
      trackerId: id, entryId: String(entry._id), kind,
    }, inspectAttachments);
    const missingRequired = attachmentSelection.issues.filter(issue => issue.required);
    if (missingRequired.length) {
      skipped.push({ clientId: entry.clientId, companyName, reason: missingRequired.map(issue => issue.message).join("; "),
        reasons: missingRequired.map(issue => issue.message), reasonCode: "required_attachment_unavailable" });
      return;
    }
    messages.push({
      entryId: String(entry._id),
      clientId: entry.clientId,
      companyName,
      category: context.client.category,
      to,
      suggestedTo,
      recipients,
      attachments: attachmentSelection.attachments,
      attachmentWarnings: attachmentSelection.issues,
      ...(attachmentSelection.attachmentSnapshot ? { attachmentSnapshot: attachmentSelection.attachmentSnapshot } : {}),
      ...message,
    });
  }));
  const entryOrder = new Map(entries.map((entry, index) => [String(entry._id), index]));
  const clientOrder = new Map(entries.map((entry, index) => [entry.clientId, index]));
  messages.sort((a, b) => (entryOrder.get(String(a.entryId)) || 0) - (entryOrder.get(String(b.entryId)) || 0));
  skipped.sort((a, b) => (clientOrder.get(a.clientId) || 0) - (clientOrder.get(b.clientId) || 0));
  return NextResponse.json({
    trackerName: tracker.name,
    workflow: {
      id: workflow.id,
      name: workflow.name,
      signatureGap: workflow.signatureGap ?? 2,
    },
    kind,
    clientMatches: clientMatches.map(match => ({ ...match, eligible: messages.some(message => message.clientId === match.clientId), skippedReason: skipped.find(row => row.clientId === match.clientId)?.reason })),
    scenarioSummary: activeEmailRules(workflow).filter(rule => rule.type === "combination").map((rule, index) => ({ id: rule.id, name: `Scenario ${index + 1}${rule.name ? ` — ${rule.name}` : ""}`, matched: clientMatches.filter(row => row.selection.matchedScenarioIds.includes(rule.id)).length, selected: clientMatches.filter(row => row.selection.selectedScenarioIds.includes(rule.id)).length, eligible: messages.filter(message => (message.selection as ReturnType<typeof renderTrackerEmail>["selection"]).selectedScenarioIds.includes(rule.id)).length })),
    messages,
    skipped,
  });
});

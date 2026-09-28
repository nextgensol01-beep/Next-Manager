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
import {
  resolveTrackerEmailAttachmentDocuments,
  type ManagedTrackerEmailDocument,
} from "@/lib/server/tracker-email-attachments";
import type {
  TrackerEmailWorkflow,
  TrackerField,
  TrackerValue,
  TrackerValues,
} from "@/lib/clientTrackers";
import {
  evaluateTrackerConditionGroup,
  legacyWorkflowCondition,
} from "@/lib/server/tracker-conditions";

const valueText = (value: TrackerValue | undefined) =>
  Array.isArray(value)
    ? value.join(", ")
    : value === true
      ? "Yes"
      : value === false
        ? "No"
        : String(value ?? "");
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] || character,
  );

function trackerEmailHtml(
  body: string,
  clientName: string,
  financialYear?: string,
) {
  const emphasise = (html: string, value: string) =>
    value
      ? html
          .split(escapeHtml(value))
          .join(
            `<strong style="font-weight:700;color:#222222;">${escapeHtml(value)}</strong>`,
          )
      : html;
  const formatted = escapeHtml(body)
    .replace(
      /&lt;strong&gt;/gi,
      '<strong style="font-weight:700;color:#222222;">',
    )
    .replace(/&lt;\/strong&gt;/gi, "</strong>")
    .replace(/&lt;em&gt;/gi, '<em style="font-style:italic;">')
    .replace(/&lt;\/em&gt;/gi, "</em>")
    .replace(/&lt;u&gt;/gi, '<u style="text-decoration:underline;">')
    .replace(/&lt;\/u&gt;/gi, "</u>")
    .replace(/&lt;p&gt;/gi, '<p style="margin:0 0 12px;">')
    .replace(/&lt;\/p&gt;/gi, "</p>")
    .replace(/&lt;ul&gt;/gi, '<ul style="margin:0 0 12px;padding-left:22px;">')
    .replace(/&lt;\/ul&gt;/gi, "</ul>")
    .replace(/&lt;ol&gt;/gi, '<ol style="margin:0 0 12px;padding-left:22px;">')
    .replace(/&lt;\/ol&gt;/gi, "</ol>")
    .replace(/&lt;li&gt;/gi, '<li style="margin:0 0 4px;">')
    .replace(/&lt;\/li&gt;/gi, "</li>")
    .replace(
      /&lt;blockquote&gt;/gi,
      '<blockquote style="margin:0 0 12px;padding-left:12px;border-left:3px solid #d1d5db;color:#4b5563;">',
    )
    .replace(/&lt;\/blockquote&gt;/gi, "</blockquote>")
    .replace(/&lt;a href=&quot;([^"<>]*)&quot;&gt;/gi, (_match, href) =>
      `<a href="${String(href).replace(/&amp;amp;/g, "&amp;")}" style="color:#0071e3;text-decoration:underline;">`,
    )
    .replace(/&lt;\/a&gt;/gi, "</a>")
    .replace(/&lt;br\s*\/?&gt;/gi, "<br />")
    .replace(/\n/g, "<br />");
  const content = [
    clientName,
    financialYear ? `FY ${financialYear}` : "",
    "Nextgen Solutions",
  ].reduce((html, value) => emphasise(html, value), formatted);
  return `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff;"><div style="width:100%;max-width:780px;box-sizing:border-box;margin:0 auto;padding:4px 12px 0;color:#222222;font-family:Arial,'Helvetica Neue',sans-serif;font-size:14px;line-height:1.65;">${content}</div></body></html>`;
}

function plainRichText(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:div|p|li|ul|ol|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function messageFor(input: {
  workflow: TrackerEmailWorkflow;
  trackerName: string;
  client: {
    clientId: string;
    companyName: string;
    category?: string;
    state?: string;
    gstNumber?: string;
  };
  values: TrackerValues;
  financialYear?: string;
  kind: "initial" | "reminder";
}) {
  const { workflow, trackerName, client, values, financialYear, kind } = input;
  const allContentRules = [...(workflow.contentRules || [])].sort(
    (left, right) => (left.order || 0) - (right.order || 0),
  );
  // New workflows deliberately use one content method. Older workflows keep
  // their original mixed-rule behaviour until they are edited and saved.
  const contentRules = workflow.contentMode
    ? allContentRules.filter(
        (rule) =>
          rule.type ===
          (workflow.contentMode === "combinations"
            ? "combination"
            : workflow.contentMode === "statements"
              ? "statement"
              : "point"),
      )
    : allContentRules;
  const combination = contentRules.find(
    (rule) =>
      rule.type === "combination" &&
      evaluateTrackerConditionGroup(rule.conditionGroup, values),
  );
  if (
    (contentRules.some((rule) => rule.type === "combination") &&
      !combination) ||
    combination?.action === "skip"
  ) {
    return {
      subject: "",
      body: "",
      html: "",
      points: [],
      statements: [],
      combinationMessage: "",
      skipReason: combination
        ? "Matched a combination rule configured not to send"
        : "No combination rule matches this client",
      unresolvedVariables: [],
    };
  }
  const matchingStatements = contentRules.filter(
    (rule) =>
      rule.type === "statement" &&
      rule.action !== "skip" &&
      evaluateTrackerConditionGroup(rule.conditionGroup, values),
  );
  const matchingContentPoints = contentRules.filter(
    (rule) =>
      rule.type === "point" &&
      rule.action !== "skip" &&
      evaluateTrackerConditionGroup(rule.conditionGroup, values),
  );
  const matchingPoints = workflow.points.filter(
    (point) => valueText(values[point.fieldKey]) === point.value,
  );
  const points = [
    ...matchingPoints.map((point) => plainRichText(point.statement)),
    ...matchingContentPoints.map((rule) => plainRichText(rule.content || "")),
  ].filter(Boolean);
  const statements = matchingStatements
    .map((rule) => plainRichText(rule.content || ""))
    .filter(Boolean);
  const combinationMessage = combination?.content || "";
  const subjectTemplate =
    kind === "reminder" && workflow.reminderSubject
      ? workflow.reminderSubject
      : workflow.subject;
  const bodyTemplate =
    kind === "reminder" && workflow.reminderBody
      ? workflow.reminderBody
      : workflow.body;
  const pointMarkup = matchingPoints
    .map((point) =>
      point.format === "statement" ? point.statement : `• ${point.statement}`,
    )
    .join("\n");
  const contentPointMarkup = matchingContentPoints
    .map((rule) => `• ${rule.content || ""}`)
    .join("\n");
  const allPointMarkup = [pointMarkup, contentPointMarkup]
    .filter(Boolean)
    .join("\n");
  const statementMarkup = matchingStatements
    .map((rule) => rule.content || "")
    .filter(Boolean)
    .join("\n\n");
  const replace = (template: string, appendMissingPoints = false) => {
    const includesPointsPlaceholder = template.includes("{{points}}");
    const includesStatementsPlaceholder = template.includes("{{statements}}");
    const includesCombinationPlaceholder = template.includes(
      "{{combinationMessage}}",
    );
    const replaced = template
      .replace(/{{client\.companyName}}/g, client.companyName)
      .replace(/{{client\.clientId}}/g, client.clientId)
      .replace(/{{client\.category}}/g, client.category || "")
      .replace(/{{client\.state}}/g, client.state || "")
      .replace(/{{client\.gstNumber}}/g, client.gstNumber || "")
      .replace(/{{tracker\.financialYear}}/g, financialYear || "")
      .replace(/{{tracker\.name}}/g, trackerName)
      .replace(/{{workflow\.name}}/g, workflow.name)
      .replace(/{{points}}/g, allPointMarkup)
      .replace(/{{statements}}/g, statementMarkup)
      .replace(/{{combinationMessage}}/g, combinationMessage);
    if (!appendMissingPoints) return replaced;
    const additions = [
      !includesCombinationPlaceholder && combinationMessage,
      !includesStatementsPlaceholder && statementMarkup,
      !includesPointsPlaceholder && allPointMarkup,
    ].filter(Boolean);
    return additions.length
      ? `${replaced.trim()}\n\n${additions.join("\n\n")}`
      : replaced;
  };
  const replaceColumns = (template: string) =>
    template.replace(/{{column\.([a-zA-Z0-9]+)}}/g, (_match, key) =>
      valueText(values[key]),
    );
  const subject = replaceColumns(replace(subjectTemplate)).trim();
  const richBody = replaceColumns(replace(bodyTemplate, true))
    .replace(/(?:<br>\s*){3,}/gi, "<br><br>")
    .trim();
  const body = plainRichText(richBody)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const unresolvedVariables = Array.from(
    new Set(`${subject}\n${body}`.match(/{{[^}]+}}/g) || []),
  );
  return {
    subject,
    body,
    html: trackerEmailHtml(richBody, client.companyName, financialYear),
    points,
    statements,
    combinationMessage: plainRichText(combinationMessage),
    unresolvedVariables,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const { id } = await params;
  const logs = await EmailLog.find({ trackerId: id })
    .sort({ sentAt: -1 })
    .limit(200)
    .lean();
  const summary = logs.reduce<Record<string, number>>((counts, log) => {
    counts[log.status] = (counts[log.status] || 0) + 1;
    counts.total = (counts.total || 0) + 1;
    return counts;
  }, {});
  return NextResponse.json({ logs, summary });
}

export async function POST(
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
  const body = await req.json();
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
  const [clients, contacts, linkedValues, documents] = await Promise.all([
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
          storageType: "google-drive",
          driveFileId: { $exists: true, $ne: "" },
          mimeType: { $exists: true, $ne: "" },
          $or: [
            { clientId: { $in: clientIds } },
            ...(sharedDocumentIds.length
              ? [{ _id: { $in: sharedDocumentIds } }]
              : []),
          ],
        })
          .sort({ uploadedDate: -1 })
          .lean()
      : Promise.resolve([]),
  ]);
  const cooldownSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentLogs =
    kind === "reminder"
      ? await EmailLog.find({
          trackerId: id,
          workflowId,
          mailKind: { $in: ["initial", "reminder"] },
          status: "sent",
          sentAt: { $gte: cooldownSince },
        })
          .select("clientId")
          .lean()
      : [];
  const recentlySentClientIds = new Set(recentLogs.map((log) => log.clientId));
  const initialSentClientIds = new Set(
    (
      await EmailLog.find({
        trackerId: id,
        workflowId,
        mailKind: "initial",
        status: "sent",
      })
        .select("clientId")
        .lean()
    ).map((log) => log.clientId),
  );
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
  const skipped: Array<{
    clientId: string;
    companyName: string;
    reason: string;
  }> = [];
  entries.forEach((entry) => {
    const client = clientsById.get(entry.clientId);
    const companyName = client?.companyName || entry.clientId;
    const values = resolveTrackerComputedValues(tracker.fields, {
      ...(entry.values as TrackerValues),
      ...(linkedValues.get(entry.clientId) || {}),
    });
    const conditions =
      workflow.conditionGroup ||
      legacyWorkflowCondition(workflow.mainFieldKey, workflow.mainValue);
    if (!evaluateTrackerConditionGroup(conditions, values)) {
      skipped.push({
        clientId: entry.clientId,
        companyName,
        reason: "Workflow eligibility conditions do not match",
      });
      return;
    }
    if (kind === "initial" && initialSentClientIds.has(entry.clientId)) {
      skipped.push({
        clientId: entry.clientId,
        companyName,
        reason: "Initial email already sent; use a reminder campaign",
      });
      return;
    }
    if (kind === "reminder" && !initialSentClientIds.has(entry.clientId)) {
      skipped.push({
        clientId: entry.clientId,
        companyName,
        reason: "Initial email has not been sent",
      });
      return;
    }
    if (kind === "reminder" && repliedClientIds.has(entry.clientId)) {
      skipped.push({
        clientId: entry.clientId,
        companyName,
        reason: "Client has replied to this workflow email",
      });
      return;
    }
    if (recentlySentClientIds.has(entry.clientId)) {
      skipped.push({
        clientId: entry.clientId,
        companyName,
        reason: "Sent recently; 7-day safety cooldown",
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
      });
      return;
    }
    const message = messageFor({
      workflow,
      trackerName: tracker.name,
      client: {
        clientId: entry.clientId,
        companyName,
        category: client?.category,
        state: client?.state,
        gstNumber: client?.gstNumber,
      },
      values,
      financialYear: tracker.financialYear,
      kind,
    });
    if (!message.subject || !message.body) {
      skipped.push({
        clientId: entry.clientId,
        companyName,
        reason: message.skipReason || "Email content is empty",
      });
      return;
    }
    if (message.unresolvedVariables.length) {
      skipped.push({
        clientId: entry.clientId,
        companyName,
        reason: `Missing variables: ${message.unresolvedVariables.join(", ")}`,
      });
      return;
    }
    const attachments = resolveTrackerEmailAttachmentDocuments({
      workflow,
      documents: documents as unknown as ManagedTrackerEmailDocument[],
      clientId: entry.clientId,
      values,
      financialYear: tracker.financialYear,
    });
    messages.push({
      entryId: String(entry._id),
      clientId: entry.clientId,
      companyName,
      to,
      suggestedTo,
      recipients,
      attachments,
      ...message,
    });
  });
  return NextResponse.json({
    trackerName: tracker.name,
    workflow: {
      id: workflow.id,
      name: workflow.name,
      signatureGap: workflow.signatureGap ?? 2,
    },
    kind,
    messages,
    skipped,
  });
}

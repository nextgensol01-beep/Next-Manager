import type {
  TrackerCondition,
  TrackerConditionGroup,
  TrackerEmailAttachment,
  TrackerEmailContentRule,
  TrackerEmailWorkflow,
  TrackerField,
  TrackerRecipientStrategy,
  TrackerRuleOperator,
} from "@/lib/clientTrackers";

const MAX_WORKFLOWS = 8;
const MAX_POINTS = 16;
const MAX_CONDITIONS = 12;
const MAX_ATTACHMENTS = 4;
// Supports migration of up to 16 legacy matching messages alongside 24 rules.
const MAX_CONTENT_RULES = 40;
const OPERATORS = new Set<TrackerRuleOperator>([
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
const ATTACHMENT_CATEGORIES = new Set<
  NonNullable<TrackerEmailAttachment["category"]>
>(["compliance", "financial", "invoices", "certificates", "other"]);
const ATTACHMENT_KINDS = new Set<
  NonNullable<TrackerEmailAttachment["documentKind"]>
>(["general", "epr-certificate"]);
const RECIPIENT_STRATEGIES = new Set<TrackerRecipientStrategy>([
  "selected",
  "primary",
  "all",
  "per_client",
]);

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Keep email rich text deliberately small, semantic, and safe to render in outbound HTML. */
function richText(value: unknown, max: number) {
  const source = typeof value === "string" ? value.slice(0, max) : "";
  return source
    .replace(/<[^>]*>/g, (tag) => {
      const match = tag.match(
        /^<\s*(\/?)\s*(strong|b|em|i|u|br|div|p|ul|ol|li|blockquote|a)(?:\s+([^>]*?))?\s*\/?\s*>$/i,
      );
      if (!match) return "";
      const [, closing, rawName, rawAttributes = ""] = match;
      const name = rawName.toLowerCase();
      if (name === "br") return "<br>";
      if (name === "div") return closing ? "</p>" : "<p>";
      if (name === "a") {
        if (closing) return "</a>";
        const href = rawAttributes.match(
          /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
        );
        const value = (href?.[1] || href?.[2] || href?.[3] || "").trim();
        if (!/^(https?:\/\/|mailto:)/i.test(value)) return "";
        const safeHref = value
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        return `<a href="${safeHref}">`;
      }
      const canonical = name === "b" ? "strong" : name === "i" ? "em" : name;
      return `<${closing ? "/" : ""}${canonical}>`;
    })
    .replace(/(?:<br>\s*){3,}/g, "<br><br>")
    .trim();
}

function supportsEmailOperator(field: TrackerField, operator: TrackerRuleOperator) {
  const equality = new Set<TrackerRuleOperator>([
    "equals",
    "not_equals",
    "is_empty",
    "is_not_empty",
  ]);
  if (equality.has(operator)) return true;
  if (field.type === "number" || field.type === "date")
    return [
      "greater_than",
      "greater_than_or_equal",
      "less_than",
      "less_than_or_equal",
    ].includes(operator);
  if (["text", "longText", "tags", "multiSelect"].includes(field.type))
    return operator === "contains" || operator === "not_contains";
  return false;
}

function cleanConditionGroup(
  value: unknown,
  fieldsByKey: Map<string, TrackerField>,
): TrackerConditionGroup | null | undefined {
  if (typeof value === "undefined") return undefined;
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const mode =
    source.mode === "ANY" ? "ANY" : source.mode === "ALL" ? "ALL" : null;
  const rawConditions = Array.isArray(source.conditions)
    ? source.conditions
    : [];
  if (!mode || !rawConditions.length || rawConditions.length > MAX_CONDITIONS)
    return null;
  const conditions: TrackerCondition[] = [];
  for (const item of rawConditions) {
    if (!item || typeof item !== "object") return null;
    const condition = item as Record<string, unknown>;
    const fieldKey = text(condition.fieldKey, 80);
    const operator = condition.operator as TrackerRuleOperator;
    const rawValue = condition.value;
    const field = fieldsByKey.get(fieldKey);
    if (!field || !OPERATORS.has(operator) || !supportsEmailOperator(field, operator))
      return null;
    if (
      !["is_empty", "is_not_empty"].includes(operator) &&
      !(
        typeof rawValue === "string" ||
        typeof rawValue === "number" ||
        typeof rawValue === "boolean"
      )
    )
      return null;
    conditions.push({
      fieldKey,
      operator,
      ...(typeof rawValue === "string" ||
      typeof rawValue === "number" ||
      typeof rawValue === "boolean"
        ? { value: rawValue }
        : {}),
    });
  }
  return { mode, conditions };
}

export function cleanTrackerEmailWorkflows(
  raw: unknown,
  fields: TrackerField[],
): TrackerEmailWorkflow[] | null {
  if (!Array.isArray(raw)) return [];
  if (raw.length > MAX_WORKFLOWS) return null;
  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
  const seen = new Set<string>();
  const workflows: TrackerEmailWorkflow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const source = item as Record<string, unknown>;
    const id = text(source.id, 64);
    const name = text(source.name, 100);
    const description = text(source.description, 500);
    const signatureGap =
      typeof source.signatureGap === "number" &&
      Number.isFinite(source.signatureGap)
        ? Math.max(0, Math.min(6, Math.round(source.signatureGap)))
        : undefined;
    const contentMode =
      source.contentMode === "statements" ||
      source.contentMode === "combinations" ||
      source.contentMode === "points"
        ? source.contentMode
        : undefined;
    const mainFieldKey = text(source.mainFieldKey, 80);
    const mainValue = text(source.mainValue, 400);
    const subject = text(source.subject, 200);
    const body = richText(source.body, 6000);
    if (
      !id ||
      seen.has(id) ||
      !name ||
      !fieldsByKey.has(mainFieldKey) ||
      !subject ||
      !body
    )
      return null;
    seen.add(id);
    const points = Array.isArray(source.points) ? source.points : [];
    const conditionGroup = cleanConditionGroup(
      source.conditionGroup,
      fieldsByKey,
    );
    if (conditionGroup === null) return null;
    if (points.length > MAX_POINTS) return null;
    const cleanPoints = points.map((point) => {
      if (!point || typeof point !== "object") return null;
      const row = point as Record<string, unknown>;
      const pointId = text(row.id, 64);
      const fieldKey = text(row.fieldKey, 80);
      const value = text(row.value, 400);
      const statement = richText(row.statement, 1200);
      const format = row.format === "statement" ? "statement" : "point";
      return pointId && fieldsByKey.has(fieldKey) && statement
        ? { id: pointId, fieldKey, value, statement, format }
        : null;
    });
    if (cleanPoints.some((point) => !point)) return null;
    const followUpSource =
      source.followUp && typeof source.followUp === "object"
        ? (source.followUp as Record<string, unknown>)
        : null;
    const followUp =
      followUpSource?.enabled === true
        ? {
            enabled: true,
            daysAfter: Math.max(
              1,
              Math.min(90, Number(followUpSource.daysAfter) || 3),
            ),
            ownerEmail: text(followUpSource.ownerEmail, 200) || undefined,
          }
        : undefined;
    const recipientStrategy = RECIPIENT_STRATEGIES.has(
      source.recipientStrategy as TrackerRecipientStrategy,
    )
      ? (source.recipientStrategy as TrackerRecipientStrategy)
      : undefined;
    const rawContentRules = Array.isArray(source.contentRules)
      ? source.contentRules
      : [];
    if (rawContentRules.length > MAX_CONTENT_RULES) return null;
    const contentRuleIds = new Set<string>();
    const contentRules: TrackerEmailContentRule[] = [];
    for (const rawRule of rawContentRules) {
      if (!rawRule || typeof rawRule !== "object") return null;
      const rule = rawRule as Record<string, unknown>;
      const ruleId = text(rule.id, 64);
      const type = rule.type;
      const action = rule.action === "skip" ? "skip" : "include";
      const content = richText(rule.content, 1800);
      const ruleConditions = cleanConditionGroup(
        rule.conditionGroup,
        fieldsByKey,
      );
      if (
        !ruleId ||
        contentRuleIds.has(ruleId) ||
        !["combination", "statement", "point"].includes(String(type)) ||
        !ruleConditions ||
        (action === "skip" && type !== "combination") ||
        (action === "include" && !content)
      )
        return null;
      contentRuleIds.add(ruleId);
      contentRules.push({
        id: ruleId,
        type: type as TrackerEmailContentRule["type"],
        conditionGroup: ruleConditions,
        action,
        ...(content ? { content } : {}),
        order: Math.max(
          0,
          Math.min(99, Number(rule.order) || contentRules.length),
        ),
      });
    }
    const rawAttachments = Array.isArray(source.attachments)
      ? source.attachments
      : [];
    if (rawAttachments.length > MAX_ATTACHMENTS) return null;
    const attachmentIds = new Set<string>();
    const attachments: TrackerEmailAttachment[] = [];
    for (const rawAttachment of rawAttachments) {
      if (!rawAttachment || typeof rawAttachment !== "object") return null;
      const attachment = rawAttachment as Record<string, unknown>;
      const attachmentId = text(attachment.id, 64);
      const source =
        attachment.source === "shared" ? "shared" : "client_latest";
      const documentId = text(attachment.documentId, 100);
      const category = attachment.category as
        | TrackerEmailAttachment["category"]
        | undefined;
      const documentKind = attachment.documentKind as
        | TrackerEmailAttachment["documentKind"]
        | undefined;
      const financialYear =
        attachment.financialYear === "any" ? "any" : "tracker";
      const attachmentConditions = cleanConditionGroup(
        attachment.conditionGroup,
        fieldsByKey,
      );
      if (
        !attachmentId ||
        attachmentIds.has(attachmentId) ||
        (source === "shared" && !documentId) ||
        (category && !ATTACHMENT_CATEGORIES.has(category)) ||
        (documentKind && !ATTACHMENT_KINDS.has(documentKind)) ||
        attachmentConditions === null
      )
        return null;
      attachmentIds.add(attachmentId);
      attachments.push({
        id: attachmentId,
        source,
        ...(source === "shared" && documentId ? { documentId } : {}),
        ...(category ? { category } : {}),
        ...(documentKind ? { documentKind } : {}),
        financialYear,
        ...(attachmentConditions
          ? { conditionGroup: attachmentConditions }
          : {}),
      });
    }
    workflows.push({
      id,
      name,
      ...(description ? { description } : {}),
      ...(contentMode ? { contentMode } : {}),
      mainFieldKey,
      mainValue,
      subject,
      body,
      points: cleanPoints as TrackerEmailWorkflow["points"],
      reminderSubject: text(source.reminderSubject, 200) || undefined,
      reminderBody: richText(source.reminderBody, 6000) || undefined,
      ...(typeof signatureGap === "number" ? { signatureGap } : {}),
      ...(conditionGroup ? { conditionGroup } : {}),
      ...(followUp ? { followUp } : {}),
      ...(attachments.length ? { attachments } : {}),
      ...(recipientStrategy ? { recipientStrategy } : {}),
      ...(contentRules.length ? { contentRules } : {}),
    });
  }
  return workflows;
}

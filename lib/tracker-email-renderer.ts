import type { TrackerEmailWorkflow } from "./clientTrackers";
import { activeEmailRules, emailValueText, evaluateEmailCondition, evaluateEmailConditionGroup, type TrackerEmailContext } from "./tracker-email-context";

export const escapeEmailText = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
function decodeText(value: string) {
  return value.replace(/&nbsp;/gi, " ").replace(/&quot;/gi, '"').replace(/&#(?:39|x27);/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&");
}
export function plainEmailText(value: string) {
  return decodeText(value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/(?:div|p|li|ul|ol|blockquote)>/gi, "\n").replace(/<[^>]*>/g, ""));
}
/** The existing semantic allow-list; dynamic data is inserted only AFTER sanitizing. */
export function sanitizeEmailMarkup(value: string) {
  return value.replace(/<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "").replace(/<[^>]*>/g, tag => {
    const m = tag.match(/^<\s*(\/?)\s*(strong|b|em|i|u|br|div|p|ul|ol|li|blockquote|a)(?:\s+([^>]*?))?\s*\/?\s*>$/i);
    if (!m) return "";
    const [, closing, raw, attributes = ""] = m, name = raw.toLowerCase();
    if (name === "br") return "<br>";
    if (name === "a") {
      if (closing) return "</a>";
      const href = attributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const url = decodeText(href?.[1] || href?.[2] || href?.[3] || "").trim();
      // The URL scheme must be authored explicitly. Dynamic path/query values
      // are URL-encoded by the resolver rather than treated as HTML.
      return /^(https?:\/\/|mailto:)/i.test(url) && !/[\r\n]/.test(url) ? `<a href="${escapeEmailText(url)}">` : "";
    }
    const canonical = name === "b" ? "strong" : name === "i" ? "em" : name === "div" ? "p" : name;
    return `<${closing ? "/" : ""}${canonical}>`;
  });
}
export type EmailVariableIssue = { code: "unsupported_variable" | "missing_variables" | "invalid_column_variable" | "invalid_variable_context"; token: string; message: string };
export function emailEditorVariables(fields: TrackerEmailContext["fields"], fragment = false) {
  return [
    { label: "Client company", token: "{{client.companyName}}" }, { label: "Client ID", token: "{{client.clientId}}" },
    { label: "Category", token: "{{client.category}}" }, { label: "State", token: "{{client.state}}" }, { label: "GST number", token: "{{client.gstNumber}}" },
    { label: "Tracker name", token: "{{tracker.name}}" }, { label: "Financial year", token: "{{tracker.financialYear}}" }, { label: "Workflow name", token: "{{workflow.name}}" },
    ...(!fragment ? [{ label: "Combination message", token: "{{combinationMessage}}" }, { label: "Matching statements", token: "{{statements}}" }, { label: "Matching points", token: "{{points}}" }] : []),
    ...fields.map(field => ({ label: field.label, token: `{{column.${field.key}}}` })),
  ];
}
const compositionKeys = ["points", "statements", "combinationMessage"];
const tokenSource = (value: string) => value.replace(/&#(?:123|x7b);|&lbrace;|&lcub;/gi, "{").replace(/&#(?:125|x7d);|&rbrace;|&rcub;/gi, "}");
/** Single pass over authored text only. Substituted client values are never parsed as templates. */
function resolveTemplate(source: string, context: TrackerEmailContext, issues: EmailVariableIssue[], html: boolean, composition?: Record<string, string>) {
  const values: Record<string, unknown> = {
    "client.companyName": context.client.companyName, "client.clientId": context.clientId,
    "client.category": context.client.category, "client.state": context.client.state, "client.gstNumber": context.client.gstNumber,
    "tracker.name": context.trackerName, "tracker.financialYear": context.financialYear, financialYear: context.financialYear,
    "workflow.name": context.workflowName,
  };
  const authored = tokenSource(source);
  return authored.replace(/{{([^{}]+)}}/g, (token, raw: string, offset: number) => {
    const key = raw.trim();
    const attribute = html && authored.lastIndexOf("<", offset) > authored.lastIndexOf(">", offset);
    if (compositionKeys.includes(key)) {
      if (composition && !attribute) return composition[key];
      issues.push({ code: "invalid_variable_context", token, message: `Message fragments cannot reference ${token}.` }); return token;
    }
    let value: unknown;
    if (key.startsWith("column.")) {
      const column = key.slice(7);
      if (!context.fields.some(field => field.key === column)) {
        issues.push({ code: "invalid_column_variable", token, message: `Removed tracker column: ${token}.` }); return token;
      }
      value = context.values[column];
    } else if (Object.hasOwn(values, key)) value = values[key];
    else { issues.push({ code: "unsupported_variable", token, message: `Unsupported variable: ${token}.` }); return token; }
    if (value == null || typeof value === "string" && !value.trim() || Array.isArray(value) && !value.length) {
      issues.push({ code: "missing_variables", token, message: `Missing required data: ${token}.` }); return token;
    }
    const text = emailValueText(value as Parameters<typeof emailValueText>[0]);
    return html ? escapeEmailText(attribute ? encodeURIComponent(text) : text) : text;
  });
}
export function selectEmailContent(workflow: TrackerEmailWorkflow, context: TrackerEmailContext) {
  const rules = activeEmailRules(workflow);
  const scenarios = rules.filter(rule => rule.type === "combination");
  const matched = scenarios.filter(rule => evaluateEmailConditionGroup(rule.conditionGroup, context));
  // Absence is an explicit legacy policy, not a migration to the new UI default.
  const mode = workflow.combinationMatchingMode || "legacy";
  const selected = mode === "combine" ? matched : matched.slice(0, 1);
  const statements = rules.filter(rule => !rule.legacyPoint && rule.type === "statement" && rule.action !== "skip" && evaluateEmailConditionGroup(rule.conditionGroup, context));
  const contentPoints = rules.filter(rule => !rule.legacyPoint && rule.type === "point" && rule.action !== "skip" && evaluateEmailConditionGroup(rule.conditionGroup, context));
  const migratedPoints = rules.filter(rule => rule.legacyPoint && evaluateEmailConditionGroup(rule.conditionGroup, context)).map(rule => ({ id: rule.id, fieldKey: "", value: "", statement: rule.content || "", format: rule.type === "statement" ? "statement" as const : "point" as const }));
  const points = [...(workflow.points || []).filter(point => evaluateEmailCondition({ fieldKey: point.fieldKey, operator: "equals", value: point.value }, context)), ...migratedPoints];
  return {
    points, statements, contentPoints, selected,
    skipReason: scenarios.length && !matched.length ? "No combination rule matches this client" : selected.some(rule => rule.action === "skip") ? "Matched a combination rule configured not to send" : undefined,
    selection: { matchingMode: mode, matchedScenarioIds: matched.map(rule => rule.id), selectedScenarioIds: selected.map(rule => rule.id),
      ignoredScenarioIds: matched.filter(rule => !selected.includes(rule)).map(rule => rule.id),
      matchedStatementIds: statements.map(rule => rule.id), matchedPointIds: [...points, ...contentPoints].map(rule => rule.id),
      scenarios: scenarios.map((rule, index) => ({ id: rule.id, name: `Scenario ${index + 1}${rule.name?.trim() ? ` — ${rule.name.trim()}` : ""}`, matched: matched.includes(rule), selected: selected.includes(rule), excluded: rule.action === "skip" })) },
  };
}
function emailHtml(body: string, context: TrackerEmailContext) {
  for (const value of [context.client.companyName, context.financialYear ? `FY ${context.financialYear}` : "", "Nextgen Solutions"]) {
    if (value) body = body.split(escapeEmailText(value)).join(`<strong>${escapeEmailText(value)}</strong>`);
  }
  const formatted = body.replace(/<strong>/g, '<strong style="font-weight:700;color:#222222;">').replace(/<em>/g, '<em style="font-style:italic;">')
    .replace(/<u>/g, '<u style="text-decoration:underline;">').replace(/<p>/g, '<p style="margin:0 0 12px;">')
    .replace(/<(ul|ol)>/g, '<$1 style="margin:0 0 12px;padding-left:22px;">').replace(/<li>/g, '<li style="margin:0 0 4px;">')
    .replace(/<blockquote>/g, '<blockquote style="margin:0 0 12px;padding-left:12px;border-left:3px solid #d1d5db;color:#4b5563;">')
    .replace(/<a href=/g, '<a style="color:#0071e3;text-decoration:underline;" href=').replace(/\n/g, "<br />");
  return `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff;"><div style="width:100%;max-width:780px;box-sizing:border-box;margin:0 auto;padding:4px 12px 0;color:#222222;font-family:Arial,'Helvetica Neue',sans-serif;font-size:14px;line-height:1.65;">${formatted}</div></body></html>`;
}
export function renderTrackerEmail(workflow: TrackerEmailWorkflow, context: TrackerEmailContext, kind: "initial" | "reminder" = "initial") {
  const chosen = selectEmailContent(workflow, context), issues: EmailVariableIssue[] = [];
  const fragment = (value: string) => resolveTemplate(sanitizeEmailMarkup(value), context, issues, true);
  const pointParts = chosen.points.map(point => fragment(point.statement));
  const contentPointParts = chosen.contentPoints.map(rule => fragment(rule.content || ""));
  const statementParts = chosen.statements.map(rule => fragment(rule.content || ""));
  const pointMarkup = [...pointParts.map((part, index) => `${chosen.points[index].format === "statement" ? "" : "• "}${part}`), ...contentPointParts.map(part => `• ${part}`)].join("\n");
  const statementMarkup = statementParts.filter(Boolean).join("\n\n");
  const combinationMarkup = chosen.selected.filter(rule => rule.action !== "skip").map(rule => fragment(rule.content || "")).filter(Boolean).join("\n\n");
  const composition = { points: pointMarkup, statements: statementMarkup, combinationMessage: combinationMarkup };
  const subjectSource = kind === "reminder" && workflow.reminderSubject ? workflow.reminderSubject : workflow.subject;
  const bodySource = kind === "reminder" && workflow.reminderBody ? workflow.reminderBody : workflow.body;
  const subject = resolveTemplate(plainEmailText(subjectSource), context, issues, false, Object.fromEntries(Object.entries(composition).map(([key, value]) => [key, plainEmailText(value)]))).replace(/[\r\n]+/g, " ").trim();
  const authoredBody = sanitizeEmailMarkup(bodySource);
  const body = resolveTemplate(authoredBody, context, issues, true, composition);
  const additions = ["combinationMessage", "statements", "points"].filter(key => !new RegExp(`{{\\s*${key}\\s*}}`).test(tokenSource(authoredBody))).map(key => composition[key as keyof typeof composition]).filter(Boolean);
  const richBody = [body.trim(), ...additions].filter(Boolean).join("\n\n").replace(/(?:<br>\s*){3,}/gi, "<br><br>").trim();
  const uniqueIssues = [...new Map(issues.map(issue => [`${issue.code}:${issue.token}`, issue])).values()];
  return {
    subject: chosen.skipReason ? "" : subject, body: chosen.skipReason ? "" : plainEmailText(richBody).replace(/\n{3,}/g, "\n\n").trim(),
    html: chosen.skipReason ? "" : emailHtml(richBody, context), richBody,
    points: [...pointParts, ...contentPointParts].map(plainEmailText),
    statements: statementParts.map(plainEmailText), combinationMessage: plainEmailText(combinationMarkup),
    skipReason: chosen.skipReason, selection: chosen.selection, variableIssues: uniqueIssues, unresolvedVariables: [...new Set(uniqueIssues.map(issue => issue.token))],
  };
}

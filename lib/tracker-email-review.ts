import { variableLabel, type EmailEditorVariable } from "./tracker-editor-document";

export type EmailPreviewPart = { text: string; token?: string };
const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeText(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    if (entity[0] !== "#") return entities[entity.toLowerCase()] || match;
    const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}
/** Review renders React text and semantic tokens only, never authored HTML. */
export function compactEmailPreview(value: string, variables: EmailEditorVariable[], body = false): EmailPreviewPart[] {
  const text = body ? decodeText(value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<span\b[^>]*data-email-variable\s*=\s*(["'])(\{\{[\w.-]+\}\})\1[^>]*>[\s\S]*?<\/span\s*>/gi, (_match, _quote, token) => token)
    .replace(/<br\s*\/?\s*>|<\/(p|div|li|blockquote|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
  ).replace(/[\t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim() : value.trim();
  const parts: EmailPreviewPart[] = [];
  let cursor = 0, remaining = body ? 360 : 240;
  const addText = (chunk: string) => {
    if (!chunk || remaining <= 0) return;
    const clipped = chunk.length > remaining;
    parts.push({ text: clipped ? `${chunk.slice(0, remaining).trimEnd()}…` : chunk });
    remaining -= chunk.length;
  };
  for (const match of text.matchAll(/\{\{[\w.-]+\}\}/g)) {
    addText(text.slice(cursor, match.index));
    if (remaining <= 0) return parts;
    const label = variableLabel(match[0], variables);
    parts.push({ text: label, token: match[0] });
    remaining -= label.length;
    cursor = match.index! + match[0].length;
  }
  addText(text.slice(cursor));
  return parts;
}

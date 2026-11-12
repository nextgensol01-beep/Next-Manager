// Shared wire format; preserve empty-string fallbacks and timestamp values.
export function serializeTemplate(template: Record<string, unknown>) {
  return {
    _id: String(template._id || ""),
    name: String(template.name || ""),
    bodyHtml: String(template.bodyHtml || ""),
    bodyText: String(template.bodyText || ""),
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

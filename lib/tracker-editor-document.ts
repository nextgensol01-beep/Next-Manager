import { Extension, InputRule, Node, type Editor } from "@tiptap/core";
import { DOMSerializer } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type EmailEditorVariable = { label: string; token: string; group?: "Client" | "Workflow" | "Tracker" | "Tracker / columns" };
const tokenPattern = /\{\{[a-zA-Z0-9_.-]+\}\}/g;
const validToken = (value: string) => /^\{\{[a-zA-Z0-9_.-]+\}\}$/.test(value);
const defaultLabels: Record<string, string> = {
  "{{client.companyName}}": "Client company", "{{client.clientId}}": "Client ID",
  "{{client.category}}": "Category", "{{client.state}}": "State", "{{client.gstNumber}}": "GST number",
  "{{tracker.name}}": "Tracker name", "{{tracker.financialYear}}": "Financial year",
  "{{workflow.name}}": "Workflow name", "{{combinationMessage}}": "Combination message",
  "{{statements}}": "Matching statements", "{{points}}": "Matching points",
};
export const variableLabel = (token: string, variables: EmailEditorVariable[]) =>
  variables.find(variable => variable.token === token)?.label || defaultLabels[token] ||
  (token.startsWith("{{column.") ? "Unavailable column" : "Unavailable variable");
export const variableGroup = (variable: EmailEditorVariable) =>
  variable.group === "Tracker / columns" ? "Tracker" : variable.group ||
  (variable.token.startsWith("{{client.") ? "Client" : variable.token.startsWith("{{column.") || variable.token === "{{tracker.name}}" ? "Tracker" : "Workflow");
export const escapeEditorText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const safeEditorLink = (value: string | null) => /^(https?:\/\/|mailto:)/i.test((value || "").trim()) ? value!.trim() : "";

/** A document decoration computed from the current transaction state. It adds
 * attributes to the empty paragraph only; no placeholder text enters the model. */
export function emailPlaceholder(getPlaceholder: () => string) {
  return Extension.create({
    name: "emailPlaceholder",
    addProseMirrorPlugins() {
      return [new Plugin({ key: new PluginKey("emailPlaceholder"), props: {
        decorations: state => {
          const paragraph = state.doc.firstChild;
          if (state.doc.childCount !== 1 || !paragraph?.isTextblock || paragraph.content.size !== 0) return DecorationSet.empty;
          return DecorationSet.create(state.doc, [Decoration.node(0, paragraph.nodeSize, {
            class: "is-empty is-editor-empty", "data-placeholder": getPlaceholder(),
          })]);
        },
      } })];
    },
  });
}

/** The live atom is an editor node, never editable token text. Clipboard HTML
 * retains its identity; application/email serialization uses the original token. */
export function emailVariableNode(getVariables: () => EmailEditorVariable[]) {
  return Node.create({
    name: "emailVariable", group: "inline", inline: true, atom: true, selectable: true, draggable: false,
    addAttributes() {
      return { token: { default: "", rendered: false, parseHTML: element => element.getAttribute("data-email-variable") } };
    },
    parseHTML() {
      return [{ tag: "span[data-email-variable]", getAttrs: element => validToken(element.getAttribute("data-email-variable") || "") ? {} : false }];
    },
    renderHTML({ node }) {
      const label = variableLabel(node.attrs.token, getVariables());
      return ["span", { "data-email-variable": node.attrs.token, class: "tracker-editor-variable", contenteditable: "false", "aria-label": `${label} variable` }, label];
    },
    renderText({ node }) { return node.attrs.token; },
    addKeyboardShortcuts() {
      const remove = (backwards: boolean) => {
        const { state, view } = this.editor;
        const { selection } = state;
        if (!selection.empty) return false;
        const adjacent = backwards ? selection.$from.nodeBefore : selection.$from.nodeAfter;
        if (adjacent?.type.name !== this.name) return false;
        const from = backwards ? selection.from - adjacent.nodeSize : selection.from;
        view.dispatch(state.tr.delete(from, from + adjacent.nodeSize).scrollIntoView());
        return true;
      };
      return { Backspace: () => remove(true), Delete: () => remove(false) };
    },
    addInputRules() {
      return [new InputRule({ find: /\{\{[a-zA-Z0-9_.-]+\}\}$/, handler: ({ state, range, match }) => {
        state.tr.replaceWith(range.from, range.to, this.type.create({ token: match[0] }, null, state.storedMarks || state.selection.$from.marks()));
      } })];
    },
  });
}

/** Sanitize loaded/pasted HTML, then decode legacy template text into atoms.
 * Known clipboard atoms are reconstructed from their token, not untrusted labels. */
export function editorMarkup(value: string, variables: EmailEditorVariable[] = []) {
  if (typeof DOMParser === "undefined") return "";
  const source = new DOMParser().parseFromString(value, "text/html");
  const visit = (node: globalThis.Node): string => {
    if (node.nodeType === 3) return escapeEditorText(node.textContent || "");
    if (node.nodeType !== 1) return "";
    const element = node as HTMLElement, tag = element.tagName.toLowerCase();
    if (["script", "style", "iframe", "object", "embed"].includes(tag)) return "";
    const token = element.getAttribute("data-email-variable");
    if (token && validToken(token)) return escapeEditorText(token);
    const children = Array.from(element.childNodes).map(visit).join("");
    const style = element.getAttribute("style")?.toLowerCase() || "";
    const styled = (markup: string) => {
      let result = markup;
      if (/font-weight\s*:\s*(bold|[5-9]00)/.test(style)) result = `<strong>${result}</strong>`;
      if (/font-style\s*:\s*italic/.test(style)) result = `<em>${result}</em>`;
      if (/text-decoration[^;]*underline/.test(style)) result = `<u>${result}</u>`;
      return result;
    };
    if (tag === "br") return "<br>";
    if (tag === "strong" || tag === "b") return `<strong>${children}</strong>`;
    if (tag === "em" || tag === "i") return `<em>${children}</em>`;
    if (tag === "u") return `<u>${children}</u>`;
    if (tag === "p" || tag === "div") return `<p>${styled(children) || "<br>"}</p>`;
    if (["ul", "ol", "li", "blockquote"].includes(tag)) return `<${tag}>${children}</${tag}>`;
    if (tag === "a") {
      const href = safeEditorLink(element.getAttribute("href"));
      return href ? `<a href="${escapeEditorText(href).replace(/"/g, "&quot;")}">${children}</a>` : styled(children);
    }
    return styled(children);
  };
  const clean = new DOMParser().parseFromString(Array.from(source.body.childNodes).map(visit).join(""), "text/html");
  const walker = clean.createTreeWalker(clean.body, 4);
  const texts: globalThis.Node[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const text of texts) {
    const value = text.textContent || "", matches = [...value.matchAll(tokenPattern)];
    if (!matches.length) continue;
    const fragment = clean.createDocumentFragment();
    let cursor = 0;
    for (const match of matches) {
      fragment.append(clean.createTextNode(value.slice(cursor, match.index)));
      const atom = clean.createElement("span");
      atom.setAttribute("data-email-variable", match[0]);
      atom.textContent = variableLabel(match[0], variables);
      fragment.append(atom);
      cursor = match.index! + match[0].length;
    }
    fragment.append(clean.createTextNode(value.slice(cursor)));
    text.parentNode?.replaceChild(fragment, text);
  }
  return clean.body.innerHTML;
}

export function serializeEmailDocument(editor: Editor) {
  if (editor.isEmpty) return "";
  const serializer = DOMSerializer.fromSchema(editor.schema);
  const wrapper = document.createElement("div");
  wrapper.append(serializer.serializeFragment(editor.state.doc.content));
  wrapper.querySelectorAll("span[data-email-variable]").forEach(atom => {
    atom.replaceWith(document.createTextNode(atom.getAttribute("data-email-variable") || ""));
  });
  return wrapper.innerHTML;
}

/** Subjects keep their existing plain string format, including atom identities. */
export function serializeEmailSubject(editor: Editor) {
  return editor.state.doc.textBetween(0, editor.state.doc.content.size, " ", node =>
    node.type.name === "emailVariable" ? node.attrs.token : node.type.name === "hardBreak" ? " " : "",
  ).replace(/[\r\n\u2028\u2029]+/g, " ");
}

export function subjectMarkup(value: string, variables: EmailEditorVariable[] = []) {
  if (!value) return "";
  return editorMarkup(`<p>${escapeEditorText(value.replace(/[\r\n\u2028\u2029]+/g, " "))}</p>`, variables);
}

export function readableEmailPreview(value: string, variables: EmailEditorVariable[]) {
  return value.replace(tokenPattern, token => variableLabel(token, variables));
}

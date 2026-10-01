"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, List, ListOrdered, Link2, RemoveFormatting, Undo2, Redo2 } from "lucide-react";

export type EmailEditorVariable = { label: string; token: string };

const escapeEditorText = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const safeEditorLink = (value: string | null) => {
  const href = (value || "").trim();
  return /^(https?:\/\/|mailto:)/i.test(href) ? href : "";
};

/**
 * Converts pasted Word, Gmail, and browser HTML into the small semantic subset
 * supported by email delivery. This keeps useful structure without ever putting
 * untrusted attributes or executable markup into a contentEditable surface.
 */
function editorMarkup(value: string) {
  if (typeof DOMParser === "undefined")
    return escapeEditorText(value).replace(/\n/g, "<br>");
  const documentFragment = new DOMParser().parseFromString(value, "text/html");
  const visit = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE)
      return escapeEditorText(node.textContent || "");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    if (["script", "style", "iframe", "object", "embed"].includes(tag))
      return "";
    const children = Array.from(element.childNodes).map(visit).join("");
    const style = element.getAttribute("style")?.toLowerCase() || "";
    const withInlineStyle = (markup: string) => {
      let result = markup;
      if (/font-weight\s*:\s*(bold|[5-9]00)/.test(style))
        result = `<strong>${result}</strong>`;
      if (/font-style\s*:\s*italic/.test(style)) result = `<em>${result}</em>`;
      if (/text-decoration[^;]*underline/.test(style)) result = `<u>${result}</u>`;
      return result;
    };
    switch (tag) {
      case "br":
        return "<br>";
      case "strong":
      case "b":
        return `<strong>${children}</strong>`;
      case "em":
      case "i":
        return `<em>${children}</em>`;
      case "u":
        return `<u>${children}</u>`;
      case "p":
      case "div":
        return `<p>${withInlineStyle(children) || "<br>"}</p>`;
      case "ul":
      case "ol":
      case "li":
      case "blockquote":
        return `<${tag}>${children}</${tag}>`;
      case "a": {
        const href = safeEditorLink(element.getAttribute("href"));
        return href
          ? `<a href="${escapeEditorText(href).replace(/"/g, "&quot;")}">${children}</a>`
          : withInlineStyle(children);
      }
      default:
        return withInlineStyle(children);
    }
  };
  return Array.from(documentFragment.body.childNodes)
    .map(visit)
    .join("")
    .replace(/(?:<br>\s*){3,}/g, "<br><br>");
}


type Command = "bold" | "italic" | "underline" | "removeFormat" | "insertUnorderedList" | "insertOrderedList" | "undo" | "redo";
const tools = [
  { command: "bold", label: "Bold", Icon: Bold },
  { command: "italic", label: "Italic", Icon: Italic },
  { command: "underline", label: "Underline", Icon: Underline },
  { command: "insertUnorderedList", label: "Bullet list", Icon: List },
  { command: "insertOrderedList", label: "Numbered list", Icon: ListOrdered },
  { command: "removeFormat", label: "Clear formatting", Icon: RemoveFormatting },
  { command: "undo", label: "Undo", Icon: Undo2 },
  { command: "redo", label: "Redo", Icon: Redo2 },
] as const;

/** Retains the existing native email editor engine and its sanitised paste format.
 * Local transactions never rewrite innerHTML, preserving the caret and native history. */
export default function TrackerRichTextEditor({ value, onChange, placeholder, compact = false, label = "Email content", variables, mode }: {
  value: string; onChange: (value: string) => void; placeholder: string; compact?: boolean;
  label?: string; variables?: EmailEditorVariable[]; mode?: "point" | "statement" | "combination";
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const restoringSelection = useRef(false);
  const lastEmitted = useRef<string | null>(null);
  const [active, setActive] = useState<string[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkAddress, setLinkAddress] = useState("");
  const [linkError, setLinkError] = useState("");
  const rememberSelection = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount || restoringSelection.current || document.activeElement !== editor) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return;
    savedRange.current = range.cloneRange();
    setActive(["bold", "italic", "underline", "insertUnorderedList", "insertOrderedList"].filter(command => document.queryCommandState(command)));
  }, []);
  useEffect(() => {
    document.addEventListener("selectionchange", rememberSelection);
    return () => document.removeEventListener("selectionchange", rememberSelection);
  }, [rememberSelection]);
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || lastEmitted.current === value) return;
    const next = editorMarkup(value);
    if (editor.innerHTML !== next) {
      editor.innerHTML = next;
      savedRange.current = null;
    }
  }, [value]);
  const publish = () => {
    const editor = editorRef.current;
    if (!editor) return;
    lastEmitted.current = editor.innerHTML;
    onChange(editor.innerHTML);
    rememberSelection();
  };
  const restoreSelection = () => {
    const editor = editorRef.current;
    if (!editor) return false;
    let range = savedRange.current?.cloneRange();
    restoringSelection.current = true;
    editor.focus({ preventScroll: true });
    restoringSelection.current = false;
    const selection = window.getSelection();
    if (!selection) return false;
    if (!range || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  };
  const format = (command: Command) => {
    if (!restoreSelection()) return;
    document.execCommand(command);
    publish();
  };
  const insertVariable = (token: string) => {
    if (!restoreSelection()) return;
    document.execCommand("insertText", false, token);
    publish();
  };
  const insertLink = () => {
    rememberSelection();
    if (mode) {
      setLinkAddress("");
      setLinkError("");
      setLinkOpen(true);
      return;
    }
    const href = window.prompt("Paste a web address or email address");
    if (!href) return;
    const safeHref = safeEditorLink(href);
    if (!safeHref) {
      window.alert("Use a link starting with https://, http://, or mailto:.");
      return;
    }
    if (!restoreSelection()) return;
    document.execCommand("createLink", false, safeHref);
    publish();
  };
  const applyLink = () => {
    const href = safeEditorLink(linkAddress);
    if (!href) {
      setLinkError("Use https://, http://, or mailto:.");
      return;
    }
    if (!restoreSelection()) return;
    document.execCommand("createLink", false, href);
    publish();
    setLinkOpen(false);
  };
  const cancelLink = () => {
    setLinkOpen(false);
    restoreSelection();
  };
  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const pastedHtml = event.clipboardData.getData("text/html");
    const pastedText = event.clipboardData.getData("text/plain");
    if (!pastedHtml && !pastedText) return;
    event.preventDefault();
    document.execCommand("insertHTML", false, pastedHtml ? editorMarkup(pastedHtml) : escapeEditorText(pastedText).replace(/\n/g, "<br>"));
    publish();
  };
  return <div className={`tracker-message-editor-group${mode ? " is-" + mode : ""}`}>
    <div className={`tracker-rich-text-editor ${compact ? "tracker-rich-text-editor-compact" : ""}`}>
      <div className="tracker-rich-text-toolbar" role="toolbar" aria-label={mode ? `${label} formatting` : "Text formatting"}>
        {tools.slice(0, 5).map(({ command, label: name, Icon }) => <button key={command} type="button"
          onMouseDown={event => event.preventDefault()} onClick={() => format(command)} aria-label={name} aria-pressed={active.includes(command)} data-tooltip={mode ? undefined : name}>
          <Icon className="h-3.5 w-3.5" /></button>)}
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={insertLink} aria-label="Add link" data-tooltip={mode ? undefined : "Add link"}><Link2 className="h-3.5 w-3.5" /></button>
        {tools.slice(5, mode ? undefined : 6).map(({ command, label: name, Icon }) => <button key={command} type="button"
          onMouseDown={event => event.preventDefault()} onClick={() => format(command)} aria-label={name} data-tooltip={mode ? undefined : name}><Icon className="h-3.5 w-3.5" /></button>)}
      </div>
      {linkOpen && <div className="workflow-message-link" role="group" aria-label={`Add link to ${label}`}>
        <input autoFocus type="text" inputMode="url" aria-label="Link address" aria-invalid={Boolean(linkError)}
          placeholder="https://example.com" value={linkAddress} onChange={event => { setLinkAddress(event.target.value); setLinkError(""); }}
          onKeyDown={event => {
            if (event.key === "Enter") { event.preventDefault(); applyLink(); }
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelLink(); }
          }} />
        <button type="button" onClick={applyLink}>Apply link</button>
        <button type="button" onClick={cancelLink}>Cancel link</button>
        {linkError && <span role="alert">{linkError}</span>}
      </div>}
      <div ref={editorRef} contentEditable suppressContentEditableWarning role="textbox" aria-label={label} aria-multiline
        data-placeholder={placeholder} onInput={publish} onPaste={handlePaste} onKeyUp={rememberSelection} onMouseUp={rememberSelection}
        onFocus={rememberSelection} onBlur={rememberSelection} className="tracker-rich-text" />
    </div>
    {variables && <div className="workflow-message-variable-tray" role="group" aria-label={`Insert variable into ${label}`}>
      <span>Insert variable</span>
      <div>{variables.map(variable => <button key={variable.token} type="button" onMouseDown={event => event.preventDefault()}
        onClick={() => insertVariable(variable.token)}>{variable.label}</button>)}</div>
    </div>}
  </div>;
}


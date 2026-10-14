"use client";

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { DOMParser as EditorDOMParser, Fragment, Slice, type Node as EditorNode } from "@tiptap/pm/model";
import { Selection, type SelectionBookmark } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { Bold, Italic, Underline, List, ListOrdered, Link2, RemoveFormatting, Undo2, Redo2, Plus, Search, X } from "lucide-react";
import { editorMarkup, emailPlaceholder, emailVariableNode, escapeEditorText, safeEditorLink, serializeEmailDocument, serializeEmailSubject, subjectMarkup, variableGroup, type EmailEditorVariable } from "@/lib/tracker-editor-document";
import { WorkflowOverlayScrollbar } from "./WorkflowStepNavigation";
export type { EmailEditorVariable } from "@/lib/tracker-editor-document";

const tools = [
  { command: "bold", label: "Bold", Icon: Bold }, { command: "italic", label: "Italic", Icon: Italic },
  { command: "underline", label: "Underline", Icon: Underline }, { command: "insertUnorderedList", label: "Bullet list", Icon: List },
  { command: "insertOrderedList", label: "Numbered list", Icon: ListOrdered }, { command: "removeFormat", label: "Clear formatting", Icon: RemoveFormatting },
  { command: "undo", label: "Undo", Icon: Undo2 }, { command: "redo", label: "Redo", Icon: Redo2 },
] as const;
type Command = typeof tools[number]["command"];

/** Shared transaction-based editor. Canonical HTML keeps template tokens, while
 * the live document owns atomic variables, selection, and its own history. */
export default function TrackerRichTextEditor({ value, onChange, placeholder, compact = false, label = "Email content", variables = [], mode, singleLine = false, labelledBy }: {
  value: string; onChange: (value: string) => void; placeholder: string; compact?: boolean;
  label?: string; variables?: EmailEditorVariable[]; mode?: "point" | "statement" | "combination"; singleLine?: boolean; labelledBy?: string;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const inputResponse = useRef<Animation | null>(null);
  const composing = useRef(false);
  const compositionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const variablesButtonRef = useRef<HTMLButtonElement>(null);
  const paletteId = useId(), scrollId = useId();
  const bookmark = useRef<SelectionBookmark | null>(null);
  const lastEmitted = useRef<string | null>(null);
  const current = useRef({ variables, placeholder, onChange, mode });
  current.current = { variables, placeholder, onChange, mode };
  const [linkOpen, setLinkOpen] = useState(false), [linkAddress, setLinkAddress] = useState(""), [linkError, setLinkError] = useState("");
  const [variablesOpen, setVariablesOpen] = useState(false), [variableSearch, setVariableSearch] = useState("");
  const markup = singleLine ? subjectMarkup : editorMarkup;
  const serialize = singleLine ? serializeEmailSubject : serializeEmailDocument;
  const [initialContent] = useState(() => markup(value, variables));
  const respondToInput = useCallback((duration = 120) => {
    if (!current.current.mode || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    inputResponse.current?.cancel();
    inputResponse.current = surfaceRef.current?.animate([{ borderColor: "var(--editor-response-edge)" }, { borderColor: "var(--editor-rest-edge)" }], { duration, easing: "ease-out" }) || null;
  }, []);
  const extensions = useMemo(() => [
    StarterKit.configure({ heading: false, code: false, codeBlock: false, strike: false, horizontalRule: false, trailingNode: false,
      ...(singleLine ? { bold: false, italic: false, underline: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false, blockquote: false, hardBreak: false } : {}),
      link: singleLine ? false : { openOnClick: false, autolink: false, linkOnPaste: false, isAllowedUri: url => Boolean(safeEditorLink(url)), HTMLAttributes: { target: null, rel: null } } }),
    emailPlaceholder(() => current.current.placeholder),
    emailVariableNode(() => current.current.variables),
  ], [singleLine]);
  const editor: Editor | null = useEditor({
    extensions, immediatelyRender: false, shouldRerenderOnTransaction: false, content: initialContent, parseOptions: { preserveWhitespace: "full" },
    editorProps: {
      attributes: { class: "tracker-rich-text", role: "textbox", "aria-label": label, ...(labelledBy ? { "aria-labelledby": labelledBy } : {}), "aria-multiline": String(!singleLine) },
      handleKeyDown: (view, event) => singleLine && event.key === "Enter" && !view.composing && !event.isComposing,
      transformPasted: slice => {
        if (!singleLine || !editor) return slice;
        const text = slice.content.textBetween(0, slice.content.size, " ", node => node.type.name === "emailVariable" ? node.attrs.token : " ");
        const container = document.createElement("div"); container.innerHTML = subjectMarkup(text, current.current.variables);
        return EditorDOMParser.fromSchema(editor.schema).parseSlice(container, { preserveWhitespace: true });
      },
      handlePaste: (view, event) => {
        const html = event.clipboardData?.getData("text/html"), text = event.clipboardData?.getData("text/plain");
        if (!html && !text) return false;
        const container = document.createElement("div");
        container.innerHTML = editorMarkup(html || `<p>${escapeEditorText(text || "").replace(/\r\n?|\n/g, "</p><p>")}</p>`, current.current.variables);
        let slice = EditorDOMParser.fromSchema(view.state.schema).parseSlice(container, { preserveWhitespace: true, context: view.state.selection.$from });
        if (singleLine) {
          const text = slice.content.textBetween(0, slice.content.size, " ", node => node.type.name === "emailVariable" ? node.attrs.token : " ");
          container.innerHTML = subjectMarkup(text, current.current.variables);
          slice = EditorDOMParser.fromSchema(view.state.schema).parseSlice(container, { preserveWhitespace: true, context: view.state.selection.$from });
        }
        if (!html) {
          const { selection, storedMarks } = view.state;
          const marks = storedMarks ?? (selection.empty ? selection.$from.marks() : selection.$from.marksAcross(selection.$to)) ?? [];
          const inheritMarks = (content: Fragment): Fragment => {
            const children: EditorNode[] = [];
            content.forEach(node => children.push(node.isInline ? node.mark(marks) : node.copy(inheritMarks(node.content))));
            return Fragment.fromArray(children);
          };
          slice = new Slice(inheritMarks(slice.content), slice.openStart, slice.openEnd);
        }
        view.dispatch(closeHistory(view.state.tr).replaceSelection(slice).scrollIntoView().setMeta("paste", true).setMeta("uiEvent", "paste"));
        view.dispatch(closeHistory(view.state.tr)); respondToInput(150); return true;
      },
      handleDOMEvents: {
        beforeinput: (_view, event) => {
          const input = event as InputEvent;
          if (singleLine && !input.isComposing && ["insertParagraph", "insertLineBreak"].includes(input.inputType)) { event.preventDefault(); return true; }
          return false;
        },
        compositionstart: () => { composing.current = true; return false; },
        compositionend: () => {
          composing.current = false;
          if (compositionTimer.current) clearTimeout(compositionTimer.current);
          // Publish only after ProseMirror flushes the native composition mutation.
          compositionTimer.current = setTimeout(() => {
            if (!editor || editor.isDestroyed || composing.current) return;
            const next = serialize(editor); lastEmitted.current = next; current.current.onChange(next);
          }, 30);
          return false;
        },
        input: (_view, event) => { if (!composing.current && !(event as InputEvent).isComposing) respondToInput(); return false; },
      },
    },
    onUpdate: ({ editor: updated }) => {
      if (composing.current || updated.view.composing) return;
      const next = serialize(updated); lastEmitted.current = next; current.current.onChange(next);
    },
  });
  const active = useEditorState({ editor, selector: ({ editor: instance }) => instance ? [
    ["bold", "bold"], ["italic", "italic"], ["underline", "underline"], ["bulletList", "insertUnorderedList"], ["orderedList", "insertOrderedList"],
  ].filter(([name]) => instance.isActive(name)).map(([, command]) => command) : [] }) || [];
  useEffect(() => () => { if (compositionTimer.current) clearTimeout(compositionTimer.current); inputResponse.current?.cancel(); }, []);
  useEffect(() => {
    if (!editor || editor.isDestroyed || composing.current || editor.view.composing || value === lastEmitted.current) return;
    if (serialize(editor) !== value) {
      editor.commands.setContent(markup(value, current.current.variables), { emitUpdate: false, parseOptions: { preserveWhitespace: "full" } }); bookmark.current = null;
    }
  }, [editor, value, markup, serialize]); // Local echoes never replace the editor document.
  const rememberSelection = () => { if (editor && !editor.isDestroyed) bookmark.current = editor.state.selection.getBookmark(); };
  const restoreSelection = () => {
    if (!editor || editor.isDestroyed) return false;
    if (bookmark.current) editor.view.dispatch(editor.state.tr.setSelection(bookmark.current.resolve(editor.state.doc)));
    editor.view.focus(); return true;
  };
  const format = (command: Command) => {
    rememberSelection();
    if (!restoreSelection() || !editor) return;
    const chain = editor.chain().command(({ tr }) => { closeHistory(tr); return true; });
    switch (command) {
      case "bold": chain.toggleBold().run(); break;
      case "italic": chain.toggleItalic().run(); break;
      case "underline": chain.toggleUnderline().run(); break;
      case "insertUnorderedList": chain.toggleBulletList().run(); break;
      case "insertOrderedList": chain.toggleOrderedList().run(); break;
      case "removeFormat": chain.unsetAllMarks().clearNodes().run(); break;
      case "undo": editor.commands.undo(); break;
      case "redo": editor.commands.redo(); break;
    }
    rememberSelection();
  };
  const insertVariable = (token: string) => {
    if (!restoreSelection() || !editor) return;
    const tr = closeHistory(editor.state.tr).replaceSelectionWith(editor.schema.nodes.emailVariable.create({ token }), true);
    const after = tr.selection.to; tr.setSelection(Selection.near(tr.doc.resolve(after), 1));
    editor.view.dispatch(tr.scrollIntoView()); editor.view.dispatch(closeHistory(editor.state.tr));
    rememberSelection(); setVariablesOpen(false); editor.view.focus();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const atom = editor.view.nodeDOM(after - 1);
      if (atom instanceof HTMLElement) atom.animate([{ opacity: .6, transform: "scale(.92)" }, { opacity: 1, transform: "scale(1.015)" }, { opacity: 1, transform: "scale(1)" }], { duration: 160, easing: "ease-out" });
    }
    respondToInput(150);
  };
  const insertLink = () => { rememberSelection(); setVariablesOpen(false); setLinkAddress(""); setLinkError(""); setLinkOpen(true); };
  const applyLink = () => {
    const href = safeEditorLink(linkAddress);
    if (!href) { setLinkError("Use https://, http://, or mailto:."); return; }
    if (!restoreSelection() || !editor) return;
    editor.chain().setLink({ href }).run(); rememberSelection(); setLinkOpen(false);
  };
  const cancelLink = () => { setLinkOpen(false); restoreSelection(); };
  useLayoutEffect(() => {
    const palette = paletteRef.current;
    if (!palette || !variablesOpen) return;
    const position = () => {
      const trigger = variablesButtonRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const width = Math.min(340, window.innerWidth - 24), below = window.innerHeight - trigger.bottom - 16, above = trigger.top - 16;
      const opensBelow = below >= Math.min(300, above);
      palette.style.width = `${width}px`; palette.style.maxHeight = `${Math.max(100, Math.min(380, Math.max(below, above)))}px`;
      const left = Math.max(12, Math.min(trigger.right - width, window.innerWidth - width - 12));
      palette.style.left = `${left}px`; palette.style.top = `${opensBelow ? trigger.bottom + 8 : Math.max(12, trigger.top - palette.getBoundingClientRect().height - 8)}px`;
      palette.style.transformOrigin = `${Math.min(width, Math.max(0, trigger.right - left - 16))}px ${opensBelow ? "top" : "bottom"}`;
    };
    palette.showPopover(); position(); palette.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    const observer = new ResizeObserver(position); observer.observe(palette);
    window.addEventListener("resize", position); document.addEventListener("scroll", position, true);
    return () => {
      observer.disconnect(); window.removeEventListener("resize", position); document.removeEventListener("scroll", position, true);
      if (palette.matches(":popover-open")) palette.hidePopover();
    };
  }, [variablesOpen]);
  const filteredVariables = variables.filter(variable => variable.label.toLocaleLowerCase().includes(variableSearch.trim().toLocaleLowerCase()));

  return <div className={`tracker-message-editor-group${mode ? " is-" + mode : ""}`}>
    <div ref={surfaceRef} className={`tracker-rich-text-editor ${compact ? "tracker-rich-text-editor-compact" : ""}${singleLine ? " tracker-rich-text-editor-subject" : ""}`}>
      <div className="tracker-rich-text-toolbar" role="toolbar" aria-label={singleLine ? `${label} variables` : mode ? `${label} formatting` : "Text formatting"}>
        {!singleLine && <>{tools.slice(0, 5).map(({ command, label: name, Icon }) => <button key={command} type="button"
          onMouseDown={event => event.preventDefault()} onClick={() => format(command)} aria-label={name} aria-pressed={active.includes(command)} data-tooltip={mode ? undefined : name}>
          <Icon className="h-3.5 w-3.5" /></button>)}
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={insertLink} aria-label="Add link" data-tooltip={mode ? undefined : "Add link"}><Link2 className="h-3.5 w-3.5" /></button>
        {tools.slice(5).map(({ command, label: name, Icon }) => <button key={command} type="button"
          onMouseDown={event => event.preventDefault()} onClick={() => format(command)} aria-label={name} data-tooltip={mode ? undefined : name}><Icon className="h-3.5 w-3.5" /></button>)}</>}
        {!!variables?.length && <button ref={variablesButtonRef} type="button" disabled={!editor} className="workflow-variables-trigger"
          aria-label={`Variables for ${label}`} aria-expanded={variablesOpen} aria-controls={paletteId}
          onPointerDown={rememberSelection} onClick={() => {
            rememberSelection(); setLinkOpen(false); setVariableSearch(""); setVariablesOpen(open => !open);
          }}><Plus size={14} aria-hidden="true" /><span>Variables</span></button>}
      </div>
      {!!variables?.length && <div ref={paletteRef} id={paletteId} popover="auto" className="workflow-variable-palette"
        role="group" aria-label={`Insert variable into ${label}`}
        onToggle={event => { if (event.newState === "closed" && !event.currentTarget.matches(":popover-open")) setVariablesOpen(false); }}
        onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setVariablesOpen(false); restoreSelection(); }
        }}>
        <div className="workflow-variable-palette-heading"><strong>Insert variable</strong>
          <button type="button" aria-label="Close variables" onClick={() => { setVariablesOpen(false); restoreSelection(); }}><X size={14} /></button></div>
        <label className="workflow-variable-search"><Search size={14} aria-hidden="true" />
          <input type="search" aria-label="Search variables" placeholder="Search variables…" value={variableSearch} onChange={event => setVariableSearch(event.target.value)} /></label>
        <div className="workflow-variable-scroll-frame"><div ref={resultsRef} id={scrollId} className="workflow-variable-results-scroll"><div className="workflow-variable-results">
          {(["Client", "Workflow", "Tracker"] as const).map(group => {
            const items = filteredVariables.filter(variable => variableGroup(variable) === group);
            return items.length ? <section key={group} aria-label={group}><h5>{group}</h5><div>
              {items.map(variable => <button key={variable.token} type="button" onMouseDown={event => event.preventDefault()}
                onClick={() => insertVariable(variable.token)}><span>{variable.label}</span></button>)}
            </div></section> : null;
          })}
          {!filteredVariables.length && <p role="status">No matching variables</p>}
        </div></div><WorkflowOverlayScrollbar scrollRef={resultsRef} scrollId={scrollId} label="Scroll variables" /></div>
      </div>}
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
      <EditorContent editor={editor} className="tracker-rich-text-content" />
    </div>
  </div>;
}


"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";

type Document = { id: number; html: string; title: string };

/** In-memory, two-document handoff. Keep the loaded iframe itself until its replacement loads. */
export default function EmailPreviewFrame({ html, title }: { html: string; title: string }) {
  const sequence = useRef(0), requested = useRef(0);
  const [loaded, setLoaded] = useState<Document | null>(null);
  const pending = useMemo(() => ({ id: ++sequence.current, html, title }), [html, title]);
  useLayoutEffect(() => { requested.current = pending.id; }, [pending.id]);
  const updating = loaded?.html !== html;
  const documents = updating ? [...(loaded ? [loaded] : []), pending] : [loaded!];
  return <div className="email-review-preview-viewport" aria-busy={updating}>
    {documents.map(document => {
      const visible = document.id === loaded?.id;
      return <iframe key={document.id} title={visible && !updating ? title : document.title}
        srcDoc={document.html} sandbox="" className={visible ? "is-ready" : "is-loading"}
        aria-hidden={!visible || updating || undefined} inert={!visible || updating || undefined}
        onLoad={() => {
          // Removed/superseded documents must never overwrite a newer selection.
          if (requested.current === document.id) setLoaded(document);
        }} />;
    })}
    {updating && <span className="email-review-preview-loading" role="status">Updating {title.toLowerCase()}…</span>}
  </div>;
}

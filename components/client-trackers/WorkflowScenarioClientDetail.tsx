"use client";

import { Check, Minus, Ban, ArrowLeft, MessageSquare, ChevronDown, CircleAlert } from "lucide-react";
import { forwardRef, useState, type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";
import type { ScenarioAnalysis, ScenarioClientResult } from "@/lib/tracker-scenario-analysis";
import { explainScenarioClient } from "@/lib/tracker-scenario-explanations";

const InspectorFrame = forwardRef<HTMLDivElement, { children: ReactNode }>(function InspectorFrame({ children }, ref) {
  const present = useIsPresent(), reduce = useReducedMotion();
  return <motion.div ref={ref} className="scenario-client-frame" data-current={present} inert={!present || undefined} aria-hidden={!present || undefined}
    initial={reduce ? false : { opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduce ? 0 : -4 }}
    transition={{ duration: reduce ? 0 : present ? .18 : .1, ease: [.22, 1, .36, 1] }}>{children}</motion.div>;
});

function MessagePreview({ row }: { row: ScenarioClientResult }) {
  const [open, setOpen] = useState(false), present = useIsPresent();
  return <details className="workflow-test-message scenario-message" onToggle={event => setOpen(event.currentTarget.open)}><summary><MessageSquare size={15} />Message preview<ChevronDown size={14} /></summary><div><p className="scenario-support">{row.issues.length ? "Required values are missing. This is not a complete email." : "Rendered for this client; recipients, attachments and Gmail signature are omitted."}</p><p className="scenario-message-subject"><span>Subject</span>{row.message?.subject}</p>{open && present && <iframe title={`Draft message for ${row.clientId}`} sandbox="" srcDoc={row.message?.html} />}</div></details>;
}

export default function WorkflowScenarioClientDetail({ row, pending, result, busy, error, stale, readAt, root, onBack }: {
  row: ScenarioClientResult | null; pending?: ScenarioClientResult; result: ScenarioAnalysis; busy: boolean; error: string; stale: boolean; readAt: string;
  root: RefObject<HTMLElement | null>; onBack: () => void;
}) {
  const client = row || pending, reduce = useReducedMotion();
  const proof = row ? explainScenarioClient(row, result.scenarios) : null;
  const matched = row?.selection.scenarios.filter(rule => rule.matched) || [];
  const chosen = row?.sendRuleMatched ? matched.filter(rule => rule.selected) : [];
  const label = (rule: typeof matched[number]) => rule.name.split(" — ")[0];
  const selectedName = chosen.map(label).join(" + ");
  const headline = !row ? "" : row.decision === "send" ? chosen.length ? selectedName + " selected" : "Message selected" : row.decision === "excluded" ? "Excluded by " + (chosen.filter(rule => rule.excluded).map(label).join(" + ") || "rule") : row.decision === "outside_rule" ? "Not selected" : row.decision === "no_match" ? "No scenario matches" : "Decision unavailable";
  const brief = !row ? "" : row.decision === "outside_rule" ? "Overall sending conditions were not met." : row.decision === "invalid" ? "Check the linked client information." : row.decision === "no_match" ? "Overall conditions passed, but no message scenario applied." : row.decision === "excluded" ? row.selection.matchingMode === "combine" ? "An Exclude scenario stops sending, including matching Send messages." : "The first matching scenario excludes this client." : chosen.length ? row.selection.matchingMode === "combine" ? "Matching Send scenarios are included." : matched.length > 1 ? matched.filter(rule => !rule.selected).map(label).join(" + ") + " also matched; " + selectedName + " comes first." : "Only matching scenario." : "The shared template and matching fragments are included.";
  return <section ref={root} id="scenario-client-detail" className="scenario-detail-host" aria-label="Selected client details" aria-busy={busy}>
    <button type="button" className="scenario-back" onClick={onBack}><ArrowLeft size={14} />Back to client results</button>
    <AnimatePresence initial={false} mode="popLayout">{!client && !error ? <div key="empty" className="scenario-inspector-empty"><h4 tabIndex={-1}>Select a client</h4><p>See which message was chosen and why.</p></div> : <InspectorFrame key={client?.entryId || "error"}>
      <header className="scenario-detail-heading"><h4 tabIndex={-1}>{client?.companyName || "Client details"}</h4><p>{client?.clientId} · {client?.category || "Category unavailable"}</p></header>
      {busy && <div className="scenario-detail-loading" role="status">Loading client explanation…</div>}
      {error && <p className="scenario-inline-error" role="alert"><CircleAlert size={15} />{error}</p>}
      {row && proof && <motion.div className="workflow-client-test-detail scenario-detail-content" data-decision={row.decision} initial={reduce ? false : { opacity: .6, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : .18, ease: [.22, 1, .36, 1] }}>
        {stale && <p className="scenario-inline-error">Previous result · retest to confirm.</p>}
        <div className="scenario-decision"><span className="scenario-decision-icon">{row.decision === "send" ? <Check size={17} /> : row.decision === "excluded" ? <Ban size={17} /> : <Minus size={17} />}</span><div><h5>{headline}</h5><p>{brief}</p></div></div>
        {row.issues.length > 0 && <div className="scenario-data-issues"><strong>Information to check</strong>{row.issues.map(issue => <p key={issue}>{issue}</p>)}</div>}
        {row.decision === "send" && row.message?.html ? <MessagePreview key={row.entryId} row={row} /> : <p className="scenario-support">{row.decision === "send" ? "No message body could be rendered. Check the template." : "No sending message selected."}</p>}
        <details className="scenario-more-proof"><summary>Why this decision?<ChevronDown size={14} /></summary><div className="scenario-proof-body"><p>{proof.result}</p><p>{proof.selection}</p>
          {matched.length > 0 && <ol className="scenario-decision-path" aria-label="Matching scenario priority">{matched.map(rule => {
            const applied = row.sendRuleMatched && rule.selected;
            const state = !row.sendRuleMatched ? "outside" : applied ? row.decision === "excluded" ? rule.excluded ? "excluded" : "blocked" : "selected" : "bypassed";
            return <li key={rule.id} data-state={state}><span className="scenario-path-icon">{state === "selected" ? <Check size={13} /> : state === "excluded" ? <Ban size={13} /> : <Minus size={13} />}</span><div><strong>{rule.name}</strong><small>{state === "outside" ? "Matched · overall send conditions not met" : state === "excluded" ? "Exclude action applied" : state === "blocked" ? "Matched · another Exclude rule stopped sending" : state === "selected" ? row.selection.matchingMode === "combine" ? "Included with matching scenarios" : "Selected · first matching scenario" : "Also matched · bypassed by earlier scenario"}</small></div></li>;
          })}</ol>}
          <p>{proof.why}</p><p>{proof.others}</p>
        </div></details>
        <p className="scenario-eligibility">Final recipient, history and attachment checks happen in Email Clients.</p>
        <p className="scenario-detail-time">Test: {new Date(result.evaluatedAt).toLocaleTimeString()}{readAt ? " · Details checked separately: " + new Date(readAt).toLocaleTimeString() : ""}. Client records may have changed; these are separate reads.</p>
      </motion.div>}
    </InspectorFrame>}</AnimatePresence>
  </section>;
}



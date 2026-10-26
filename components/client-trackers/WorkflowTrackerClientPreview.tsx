"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import TrackerModal from "./TrackerModal";
import LiquidGlassDropdown from "@/components/ui/LiquidGlassDropdown";
import type { TrackerEmailWorkflow } from "@/lib/clientTrackers";
import type { ScenarioAnalysis, ScenarioClientResult } from "@/lib/tracker-scenario-analysis";

export type DraftScenarioAnalysis = { fingerprint: string; result: ScenarioAnalysis };
const decisionText = { send: "Send decision · eligibility not checked", excluded: "Excluded", no_match: "No matching scenario", outside_rule: "Workflow send rule not met", invalid: "Unresolved client data" };
export default function WorkflowTrackerClientPreview({ open, onClose, trackerId, workflow, fingerprint, analysis, onAnalysis, initialRuleId = "" }: {
  open: boolean; onClose: () => void; trackerId: string; workflow: TrackerEmailWorkflow; fingerprint: string;
  analysis: DraftScenarioAnalysis | null; onAnalysis: (value: DraftScenarioAnalysis) => void; initialRuleId?: string;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [filter, setFilter] = useState("all"), [ruleId, setRuleId] = useState(""), [search, setSearch] = useState(""), [page, setPage] = useState(0);
  const [selected, setSelected] = useState(""), [detail, setDetail] = useState<ScenarioClientResult | null>(null), [detailBusy, setDetailBusy] = useState(false);
  const request = useRef<AbortController | null>(null), detailRequest = useRef<AbortController | null>(null);
  const detailRoot = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const node = detailRoot.current, port = node?.closest<HTMLElement>(".tracker-modal-body");
    if (detail && node && port) { node.querySelector<HTMLElement>("h4")?.focus({ preventScroll: true }); port.scrollTop += node.getBoundingClientRect().top - port.getBoundingClientRect().top - 12; }
  }, [detail]);
  const latest = useRef({ workflow, fingerprint, trackerId, onAnalysis }); latest.current = { workflow, fingerprint, trackerId, onAnalysis };
  const result = analysis?.result, stale = Boolean(analysis && analysis.fingerprint !== fingerprint);
  const run = async () => {
    request.current?.abort(); detailRequest.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const input = latest.current; setBusy(true); setError(""); setDetail(null); setSelected("");
    try {
      const response = await fetch(`/api/client-trackers/${encodeURIComponent(input.trackerId)}/email/scenario-preview`, { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workflow: input.workflow }) });
      const data = await response.json(); if (!response.ok) throw Error(data.error || "Unable to test tracker clients.");
      if (!controller.signal.aborted && latest.current.fingerprint === input.fingerprint) { input.onAnalysis({ fingerprint: input.fingerprint, result: data }); setPage(0); }
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to test tracker clients."); }
    finally { if (request.current === controller) setBusy(false); }
  };
  useEffect(() => { request.current?.abort(); detailRequest.current?.abort(); setBusy(false); setDetailBusy(false); setDetail(null); }, [fingerprint]);
  useEffect(() => {
    if (open) { setRuleId(initialRuleId); setPage(0); setFilter("all"); setSearch(""); if (!analysis || analysis.fingerprint !== latest.current.fingerprint) void run(); }
    else { request.current?.abort(); detailRequest.current?.abort(); }
    return () => { request.current?.abort(); detailRequest.current?.abort(); };
    // Opening is an explicit test request; draft keystrokes never fetch clients.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const inspect = async (row: ScenarioClientResult) => {
    if (stale || busy) return;
    detailRequest.current?.abort(); const controller = new AbortController(); detailRequest.current = controller;
    const input = latest.current; setSelected(row.entryId); setDetail(null); setDetailBusy(true); setError("");
    try {
      const response = await fetch(`/api/client-trackers/${encodeURIComponent(input.trackerId)}/email/scenario-preview`, { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workflow: input.workflow, entryId: row.entryId }) });
      const data = await response.json(); if (!response.ok) throw Error(data.error || "Unable to inspect this client.");
      if (!controller.signal.aborted && input.fingerprint === latest.current.fingerprint) setDetail(data.clients[0] || null);
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to inspect this client."); }
    finally { if (detailRequest.current === controller) setDetailBusy(false); }
  };
  const rows = (result?.clients || []).filter(row => (!ruleId || row.matchedRuleIds.includes(ruleId)) && (filter === "all" || (filter === "overlap" ? row.selection.matchedScenarioIds.length > 1 : filter === "invalid" ? row.decision === "invalid" || row.issues.length > 0 : row.decision === filter)) && `${row.companyName} ${row.clientId} ${row.category}`.toLowerCase().includes(search.toLowerCase()));
  return <TrackerModal open={open} onClose={onClose} title="Test against tracker clients" subtitle="Current unsaved draft · no emails created or sent" size="2xl" fixedHeight className="workflow-client-test-modal"
    footer={<footer className="tracker-modal-footer flex justify-end gap-3"><button type="button" className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted hover:bg-black/[0.04] dark:hover:bg-white/[0.06]" onClick={onClose}>Close</button><button type="button" className="tracker-modal-primary rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60" disabled={busy} onClick={() => void run()}>{busy ? "Testing…" : "Retest current draft"}</button></footer>}>
    <div className="workflow-client-test" aria-busy={busy}>
      <p className="workflow-rule-helper">This tests the full current tracker audience, independent of the table page and filters. A Send decision still needs recipient, history, attachment and other email eligibility checks. Match, overlap and unresolved-data counts can overlap; they are not separate recipient totals.</p>
      {stale && <p role="status" className="workflow-scenario-issue">Outdated analysis — the draft changed. Retest before using these counts.</p>}
      {error && <p role="alert" className="workflow-scenario-issue">{error}</p>}
      {!result && !error && <p role="status">{busy ? "Evaluating tracker clients…" : "Test the draft to inspect real client matches."}</p>}
      {result && <>
        <p className="workflow-rule-helper">Evaluated {result.evaluated} of {result.total} tracker clients · {new Date(result.evaluatedAt).toLocaleString()}{!result.complete ? ` · Partial analysis (up to ${result.limit} clients or the execution time limit). Counts describe evaluated records only.` : " · Complete audience at test time."}</p>
        <dl className="workflow-client-test-counts">{[["Evaluated", result.evaluated], ["Matched", result.counts.matched], ["No rule match", result.counts.noMatch], ["Overlapping", result.counts.overlapping], ["Excluded", result.counts.excluded], ["Send decision", result.counts.send], ["Unresolved data", result.counts.invalid], ["Send rule not met", result.counts.outsideRule]].map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>
        <details className="workflow-client-test-scenarios"><summary>Matches per message rule{result.counts.overlapping ? " · Overlapping scenarios detected" : ""}</summary>
          <p className="workflow-rule-helper">{workflow.combinationMatchingMode === "combine" ? "All matching scenarios are selected. Any selected Exclude scenario blocks sending." : "The highest-priority matching scenario wins. Later matching scenarios are bypassed, including later Exclude rules."}</p>
          {result.scenarios.map(rule => <button key={rule.id} type="button" onClick={() => { setRuleId(rule.id); setPage(0); }}><span>{rule.name} · Priority {rule.priority} · {rule.action === "skip" ? "Exclude" : "Send"}</span><span>{rule.matched} matched · {rule.selected} selected · {rule.overlapping} overlapping</span></button>)}
        </details>
        <div className="workflow-client-test-controls"><label>Find client<input aria-label="Find tracker preview client" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Company, Client ID or category" /></label>
          <div className="min-w-0 flex-1"><LiquidGlassDropdown portal variant="condition" label="Filter tracker matching decision" value={filter} onChange={value => { setFilter(value); setPage(0); }} options={[{ value: "all", label: "All decisions" }, { value: "overlap", label: "Overlapping scenarios" }, ...Object.entries(decisionText).map(([value, label]) => ({ value, label }))]} /></div>
          {ruleId && <button type="button" onClick={() => { setRuleId(""); setPage(0); }}>Clear scenario filter</button>}</div>
        <div className="workflow-client-test-list" aria-label="Actual tracker client results">{rows.slice(page * 25, page * 25 + 25).map(row => <button key={row.entryId} type="button" disabled={stale || busy} aria-pressed={selected === row.entryId} onClick={() => void inspect(row)}><span><strong>{row.companyName}</strong><small>{row.clientId} · {row.category || "Category unavailable"}</small></span><span>{decisionText[row.decision]}<small>{row.selection.scenarios.filter(rule => rule.selected).map(rule => rule.name).join(", ") || "Shared content / no selected scenario"}</small></span></button>)}</div>
        {!rows.length && <p>No evaluated clients in this filter. A valid rule with zero matches can still be saved.</p>}
        <div className="workflow-client-test-pagination"><button type="button" disabled={!page} onClick={() => setPage(value => value - 1)}>Previous clients</button><span>{rows.length ? page * 25 + 1 : 0}–{Math.min(rows.length, page * 25 + 25)} of {rows.length}</span><button type="button" disabled={(page + 1) * 25 >= rows.length} onClick={() => setPage(value => value + 1)}>Next clients</button></div>
        {detailBusy && <p role="status">Rendering this client’s message…</p>}
        {detail && !stale && <section ref={detailRoot} className="workflow-client-test-detail" aria-label="Client matching explanation"><h4 tabIndex={-1}>{detail.companyName} · {detail.clientId}</h4><p>{detail.category} · {decisionText[detail.decision]}</p>
          <p>Matched: {detail.selection.scenarios.filter(rule => rule.matched).map(rule => `${rule.name}${rule.excluded ? " (Exclude)" : " (Send)"}`).join(", ") || detail.matchedRuleIds.map(id => result.scenarios.find(rule => rule.id === id)?.name || id).join(", ") || "None"}</p>
          <p>Selected: {detail.selectedRuleIds.map(id => result.scenarios.find(rule => rule.id === id)?.name || id).join(", ") || "None"}</p>
          <p>Bypassed: {detail.selection.scenarios.filter(rule => detail.selection.ignoredScenarioIds.includes(rule.id)).map(rule => rule.name).join(", ") || "None"}</p><p>{detail.reason}</p>
          {detail.issues.map(issue => <p key={issue} className="workflow-scenario-issue">{issue}</p>)}
          {detail.message?.html && <><p>Subject: {detail.message.subject}</p><iframe title={`Draft message for ${detail.clientId}`} sandbox="" srcDoc={detail.message.html} /></>}
          <p className="workflow-rule-helper">Client values were read again for this detail. This is draft message content before Gmail signature, recipients, attachments and final eligibility checks.</p>
        </section>}
      </>}
    </div>
  </TrackerModal>;
}

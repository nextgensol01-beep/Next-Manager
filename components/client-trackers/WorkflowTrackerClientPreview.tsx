"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useId } from "react";
import { Check, CircleAlert, ShieldCheck, RefreshCw, ArrowUpRight, Search, ChevronLeft, ChevronRight, Layers3, X } from "lucide-react";
import TrackerModal from "./TrackerModal";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { ScenarioGlassTabs, ScenarioView } from "./ScenarioWorkspaceMotion";
import LiquidGlassDropdown from "@/components/ui/LiquidGlassDropdown";
import WorkflowScenarioResults from "./WorkflowScenarioResults";
import WorkflowScenarioClientDetail from "./WorkflowScenarioClientDetail";
import WorkflowScenarioTestHelp from "./WorkflowScenarioTestHelp";
import type { TrackerEmailWorkflow, TrackerField } from "@/lib/clientTrackers";
import type { ScenarioAnalysis, ScenarioClientResult } from "@/lib/tracker-scenario-analysis";
import { clientNeedsReview, matchesScenarioResultFilter, matchesScenarioRuleView, scenarioNextStep, scenarioOutcomeTotals, scenarioRuleBreakdown, type ScenarioResultFilter, type ScenarioRuleView } from "@/lib/tracker-scenario-explanations";

export type DraftScenarioAnalysis = { fingerprint: string; result: ScenarioAnalysis; workflow?: TrackerEmailWorkflow; fields?: TrackerField[]; trackerId?: string };
const filterOptions: { value: ScenarioResultFilter; label: string }[] = [{ value: "all", label: "All checked clients" }, { value: "send", label: "Selected by send rules" }, { value: "not_selected", label: "Not selected" }, { value: "review", label: "Clients needing review" }, { value: "overlap", label: "Clients matching multiple scenarios" }, { value: "excluded", label: "Exclude rule applied" }, { value: "outside_rule", label: "Overall send conditions not met" }, { value: "no_match", label: "No scenario applies" }, { value: "invalid", label: "Missing client or message information" }, { value: "unresolved", label: "Decision could not be made" }, { value: "matched", label: "At least one rule matched" }, { value: "no_rule_match", label: "No rule conditions matched" }];
const viewLabels: Record<ScenarioRuleView, string> = { matched: "Matching", used: "Chosen by", outside: "Overall send conditions not met · matching", bypassed: "Bypassed by priority · matching", blocked: "Another rule stopped sending · matching", overlap: "Multiple matches including" };
const compactDecision = { send: "Message chosen", excluded: "Excluded by rule", no_match: "No scenario applies", outside_rule: "Send conditions not met", invalid: "Missing client data" };

export default function WorkflowTrackerClientPreview({ open, onClose, trackerId, workflow, fields = [], fingerprint, analysis, onAnalysis, initialRuleId = "" }: {
  open: boolean; onClose: () => void; trackerId: string; workflow: TrackerEmailWorkflow; fields?: TrackerField[]; fingerprint: string;
  analysis: DraftScenarioAnalysis | null; onAnalysis: (value: DraftScenarioAnalysis) => void; initialRuleId?: string;
}) {
  const reduceMotion = useReducedMotion(), selectionGroup = useId(), previousPage = useRef(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [failedRefresh, setFailedRefresh] = useState(false);
  const [filter, setFilter] = useState<ScenarioResultFilter>("all"), [ruleId, setRuleId] = useState(""), [ruleView, setRuleView] = useState<ScenarioRuleView>("matched"), [search, setSearch] = useState(""), [page, setPage] = useState(0), [focusResults, setFocusResults] = useState(0);
  const [selected, setSelected] = useState(""), [detail, setDetail] = useState<ScenarioClientResult | null>(null), [detailBusy, setDetailBusy] = useState(false), [detailError, setDetailError] = useState(""), [detailTime, setDetailTime] = useState("");
  const [surface, setSurface] = useState<HTMLDivElement | null>(null), [compact, setCompact] = useState(true), [mobileDetail, setMobileDetail] = useState(false);
  const [view, setView] = useState<"overview" | "explore">("overview");
  const overviewPort = useRef<HTMLDivElement>(null), explorePort = useRef<HTMLDivElement>(null), listPort = useRef<HTMLDivElement>(null), refreshSelected = useRef("");
  const request = useRef<AbortController | null>(null), detailRequest = useRef<AbortController | null>(null), cache = useRef(new Map<string, { row: ScenarioClientResult; readAt: string }>());
  const detailRoot = useRef<HTMLElement>(null), resultsRoot = useRef<HTMLElement>(null), rowRefs = useRef(new Map<string, HTMLButtonElement>()), returnPosition = useRef(0), returning = useRef(false), focusDetail = useRef(false);
  const latest = useRef({ workflow, fields, fingerprint, trackerId, onAnalysis }); latest.current = { workflow, fields, fingerprint, trackerId, onAnalysis };
  const result = analysis?.result, stale = Boolean(analysis && (analysis.fingerprint !== fingerprint || analysis.trackerId !== trackerId || failedRefresh));
  const testedWorkflow = analysis?.workflow || (!stale ? workflow : undefined), testedFields = analysis?.fields || fields;
  const totals = useMemo(() => result ? scenarioOutcomeTotals(result) : null, [result]);
  const rules = useMemo(() => result ? result.scenarios.map(rule => ({ ...rule, ...scenarioRuleBreakdown(result, rule.id) })) : [], [result]);
  const testedMode = result?.clients[0]?.selection.matchingMode || testedWorkflow?.combinationMatchingMode || "legacy";
  const hasScenarios = Boolean(result?.clients.some(row => row.selection.scenarios.length) || rules.some(rule => testedWorkflow?.contentRules?.some(draft => draft.id === rule.id && draft.type === "combination")));
  const rows = useMemo(() => (result?.clients || []).filter(row => matchesScenarioResultFilter(row, filter) && matchesScenarioRuleView(row, ruleId, ruleView) && `${row.companyName} ${row.clientId} ${row.category || ""}`.toLowerCase().includes(search.trim().toLowerCase())), [result, filter, ruleId, ruleView, search]);
  const findings = useMemo(() => (result?.clients || []).filter(clientNeedsReview), [result]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 25) - 1)), pendingClient = result?.clients.find(row => row.entryId === selected);
  const clearDetail = useCallback(() => { refreshSelected.current = ""; focusDetail.current = false; detailRequest.current?.abort(); setDetail(null); setSelected(""); setDetailBusy(false); setDetailError(""); setDetailTime(""); setMobileDetail(false); }, []);
  const showClients = (next: ScenarioResultFilter = "all", id = "", ruleView: ScenarioRuleView = "matched", preserveSearch = false) => { setView("explore"); setFilter(next); setRuleId(id); setRuleView(ruleView); if (!preserveSearch) setSearch(""); setPage(0); setMobileDetail(false); setFocusResults(value => value + 1); };
  useLayoutEffect(() => {
    if (!surface) return;
    const measure = () => { setCompact(surface.clientWidth < 908); };
    const observer = new ResizeObserver(measure); observer.observe(surface); measure(); return () => observer.disconnect();
  }, [surface]);
  useLayoutEffect(() => {
    if (!error || !surface) return;
    // A failed explicit retest must be visible even when the user was inspecting
    // clients lower in the modal. Ordinary selections keep their scroll position.
    surface.querySelector<HTMLElement>('.scenario-inline-error[role="alert"]')?.focus({ preventScroll: true });
  }, [error, surface]);
  useEffect(() => { if (selected && !rows.some(row => row.entryId === selected)) clearDetail(); }, [rows, selected, clearDetail]);
  useLayoutEffect(() => {
    const node = resultsRoot.current;
    if (focusResults && !mobileDetail && node) { node.querySelector<HTMLElement>("h4")?.focus({ preventScroll: true }); if (explorePort.current) explorePort.current.scrollTop = 0; if (listPort.current) listPort.current.scrollTop = 0; }
    // A filter request moves focus once. Returning from mobile detail has its own anchor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusResults]);
  useLayoutEffect(() => {
    const node = detailRoot.current, port = explorePort.current;
    if (!node || !port) return;
    if (view !== "explore") return;
    if (compact && mobileDetail && focusDetail.current) { focusDetail.current = false; node.querySelector<HTMLElement>('[data-current="true"] h4, .scenario-inspector-empty h4')?.focus({ preventScroll: true }); port.scrollTop = 0; }
    else if (!compact && detail && focusDetail.current) { focusDetail.current = false; node.querySelector<HTMLElement>('[data-current="true"] h4, .scenario-inspector-empty h4')?.focus({ preventScroll: true }); }
    if (returning.current && !mobileDetail) { returning.current = false; port.scrollTop = returnPosition.current; const row = rowRefs.current.get(selected); row?.focus({ preventScroll: true }); if (row) { const r = row.getBoundingClientRect(), p = port.getBoundingClientRect(); if (r.top < p.top) port.scrollTop += r.top - p.top - 8; else if (r.bottom > p.bottom) port.scrollTop += r.bottom - p.bottom + 8; } }
  }, [selected, detail, compact, mobileDetail, view]);
  const run = async () => {
    request.current?.abort(); detailRequest.current?.abort(); setDetailBusy(false); cache.current.clear();
    const controller = new AbortController(); request.current = controller;
    const input = latest.current; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/client-trackers/${encodeURIComponent(input.trackerId)}/email/scenario-preview`, { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workflow: input.workflow }) });
      const data = await response.json(); if (!response.ok) throw Error(data.error || "We could not check the clients. Try testing again.");
      if (!controller.signal.aborted && latest.current.fingerprint === input.fingerprint && latest.current.trackerId === input.trackerId) {
        input.onAnalysis({ fingerprint: input.fingerprint, result: data, workflow: input.workflow, fields: input.fields, trackerId: input.trackerId }); setFailedRefresh(false);
        if (selected && data.clients?.some((row: ScenarioClientResult) => row.entryId === selected)) { refreshSelected.current = selected; setDetail(null); setDetailTime(""); setDetailError(""); }
        else clearDetail();
      }
    } catch (failure) { if (!controller.signal.aborted) { setError(failure instanceof Error ? failure.message : "We could not check the clients. Try testing again."); setFailedRefresh(true); } }
    finally { if (request.current === controller) setBusy(false); }
  };
  useEffect(() => { request.current?.abort(); clearDetail(); cache.current.clear(); setBusy(false); }, [fingerprint, trackerId, clearDetail]);
  useEffect(() => {
    if (open) { setRuleId(initialRuleId); setRuleView("matched"); setPage(0); setFilter("all"); setSearch(""); if (initialRuleId) setView("explore"); if (!analysis || analysis.fingerprint !== latest.current.fingerprint || analysis.trackerId !== latest.current.trackerId || failedRefresh) void run(); }
    else { request.current?.abort(); detailRequest.current?.abort(); }
    return () => { request.current?.abort(); detailRequest.current?.abort(); };
    // Explicit opening/retesting owns requests; visual interactions never run analysis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const inspect = async (row: ScenarioClientResult, keyboard = false, finding = false, refresh = false) => {
    if (stale || busy) return;
    const port = explorePort.current;
    if (!refresh) { if (port) returnPosition.current = finding ? 0 : port.scrollTop; focusDetail.current = compact || keyboard || finding; setMobileDetail(compact); }
    if (selected === row.entryId && detail) { if (!compact && keyboard && !finding) { detailRoot.current?.querySelector<HTMLElement>('[data-current="true"] h4')?.focus({ preventScroll: true }); focusDetail.current = false; } return; }
    detailRequest.current?.abort(); setSelected(row.entryId); setDetailError("");
    const cached = cache.current.get(row.entryId);
    if (cached) { setDetail(cached.row); setDetailTime(cached.readAt); setDetailBusy(false); return; }
    setDetail(null); setDetailBusy(true);
    const controller = new AbortController(); detailRequest.current = controller; const input = latest.current;
    try {
      const response = await fetch(`/api/client-trackers/${encodeURIComponent(input.trackerId)}/email/scenario-preview`, { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workflow: input.workflow, entryId: row.entryId }) });
      const data = await response.json(); if (!response.ok) throw Error(data.error || "We could not open this client’s explanation. Select the client to try again.");
      if (!data.clients?.[0]) throw Error("This client could not be checked completely. Test again to see updated information.");
      if (!controller.signal.aborted && input.fingerprint === latest.current.fingerprint && input.trackerId === latest.current.trackerId) { const readAt = new Date().toISOString(); cache.current.set(row.entryId, { row: data.clients[0], readAt }); setDetail(data.clients[0]); setDetailTime(readAt); }
    } catch (failure) { if (!controller.signal.aborted) setDetailError(failure instanceof Error ? failure.message : "We could not open this client’s explanation."); }
    finally { if (detailRequest.current === controller) setDetailBusy(false); }
  };
  useEffect(() => {
    if (busy || stale || !refreshSelected.current) return;
    const row = rows.find(item => item.entryId === refreshSelected.current); refreshSelected.current = "";
    if (row) void inspect(row, false, false, true);
    // Only a confirmed retest refreshes the selected detail; tabs never fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, busy, stale]);
  useEffect(() => {
    const direction = currentPage >= previousPage.current ? 1 : -1; previousPage.current = currentPage;
    if (!listPort.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = listPort.current.animate([{ opacity: .65, transform: "translateX(" + (direction * 4) + "px)" }, { opacity: 1, transform: "translateX(0)" }], { duration: 170, easing: "cubic-bezier(.22,1,.36,1)" });
    return () => animation.cancel();
  }, [currentPage]);
  const reviewClient = (row: ScenarioClientResult) => { showClients("review"); const index = findings.findIndex(item => item.entryId === row.entryId); setPage(Math.floor(Math.max(index, 0) / 25)); void inspect(row, true, true); };
  const applied = [filter !== "all" ? filterOptions.find(option => option.value === filter)?.label : "", ruleId ? `${viewLabels[ruleView]} ${result?.scenarios.find(rule => rule.id === ruleId)?.name || "the selected scenario"}` : "", search.trim() ? `Search: “${search.trim()}”` : ""].filter(Boolean);
  const segments = totals ? [{ label: "Selected by send rules", count: totals.selected, filter: "send", className: "is-selected" }, { label: "Not selected", count: totals.notSelected, filter: "not_selected", className: "is-not-selected" }, { label: "Decision unavailable", count: totals.unresolved, filter: "unresolved", className: "is-unresolved" }] : [];
  const metricDetails: { label: string; count: number; help: string; filter: ScenarioResultFilter }[] = result ? [
    { label: "At least one rule matched", count: result.counts.matched, help: "The client met a message rule’s conditions. Overall sending conditions and priority still decide the result.", filter: "matched" },
    { label: "No rule conditions matched", count: result.counts.noMatch, help: "No message rule matched. A workflow with no scenarios can still choose its shared template.", filter: "no_rule_match" },
    { label: "Matches multiple scenarios", count: result.counts.overlapping, help: "Review which scenario takes priority or how their messages are combined.", filter: "overlap" },
    { label: "Exclude rule applied", count: result.counts.excluded, help: "The overall send conditions were met, then a selected Exclude scenario stopped sending.", filter: "excluded" },
    { label: "Selected by send rules", count: result.counts.send, help: "The rules chose a sending message for these clients.", filter: "send" },
    { label: "Missing client or message information", count: result.counts.invalid, help: "Linked client records are unavailable, or required message values are missing.", filter: "invalid" },
    { label: "Overall send conditions not met", count: result.counts.outsideRule, help: "The workflow ruled the client out before scenario selection could apply. Later Exclude matches do not change this result.", filter: "outside_rule" },
  ] : [];
  const changePage = (next: number) => { setPage(next); if (listPort.current) listPort.current.scrollTop = 0; if (compact && explorePort.current && resultsRoot.current) { explorePort.current.scrollTop = 0; resultsRoot.current.querySelector<HTMLElement>("h4")?.focus({ preventScroll: true }); } };
  return <TrackerModal open={open} onClose={onClose} title="Check who matches your email rules" subtitle="Test your draft against tracker clients." size="2xl" fixedHeight scrollable={false} icon={Layers3} backdropColor="rgba(18,20,28,0.32)" backdropFilter="blur(3px)" className="workflow-client-test-modal scenario-premium-modal scenario-refined-modal scenario-liquid-modal"
    footer={<footer className="tracker-modal-footer scenario-test-footer"><span>Testing does not save your changes.</span><div><button type="button" className="scenario-close" onClick={onClose}>Close</button><button type="button" className="tracker-modal-primary scenario-retest" disabled={busy} onClick={() => void run()}><RefreshCw size={14} className={busy ? "is-spinning" : ""} /><span>{busy ? "Checking clients…" : "Retest current draft"}</span></button></div></footer>}>
    <div ref={setSurface} className="workflow-client-test scenario-test scenario-refined" aria-busy={busy} data-view={view}>
      <div className="scenario-workspace-top">
        <div className="scenario-test-context"><span><ShieldCheck size={13} />Preview only · No emails created or sent</span><span>{result ? "Tested " + new Date(result.evaluatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Current draft"}</span></div>
        <ScenarioGlassTabs value={view} onChange={setView} />
        <div className="workflow-test-progress scenario-status" role="status" aria-live="polite">{busy && <p><span className="scenario-loading-dot" />{result ? "Retesting · previous results shown" : "Checking tracker clients…"}</p>}{stale && !error && <p><CircleAlert size={14} /><span><strong>Results are outdated.</strong> Your scenarios have changed since this test. Retest the latest draft.</span></p>}</div>
        {error && <div className="scenario-inline-error" role="alert" tabIndex={-1}><CircleAlert size={16} /><div><strong>The test could not finish.</strong><p>{error} {result ? "Previous results are outdated." : "Your draft is kept."} Retest to try again.</p></div></div>}
        {result && !result.complete && <p className="workflow-test-partial scenario-partial" role="status"><CircleAlert size={14} /><span>Partial test · {result.evaluated} of {result.total} clients checked within the {result.limit}-client and time limits.</span></p>}
      </div>
      {!result && <div className="scenario-initial-state"><Layers3 size={23} /><h4>{busy ? "Checking your rules" : "See your rules in action"}</h4><p>{busy ? "Finding the message for each tracker client." : "Retest to see the selected messages and clients needing review."}</p></div>}
      {result && totals && <div className="scenario-view-stage">
        <ScenarioView root={overviewPort} active={view === "overview"} view="overview">
          <section className="scenario-overview" aria-label="Main test results">
            <div className="scenario-section-heading"><h4><button type="button" className="scenario-checked-total" aria-label="Clients checked" data-count={totals.checked} onClick={() => showClients()}>{totals.checked} clients checked <ChevronRight size={13} /></button></h4><span className="scenario-completion">{busy ? "Retesting" : stale ? "Retest needed" : result.complete ? "Test completed" : "Partial test"}</span></div>
            <div className="workflow-test-primary scenario-metrics">{[{ label: "Selected", aria: "Selected by send rules", count: totals.selected, filter: "send" }, { label: "Not selected", aria: "Not selected", count: totals.notSelected, filter: "not_selected" }, { label: "Needs review", aria: "Needs review", count: totals.review, filter: "review" }].map(item => <button type="button" key={item.label} aria-label={item.aria} aria-pressed={filter === item.filter && !ruleId && !search} onClick={() => showClients(item.filter as ScenarioResultFilter)}><strong>{item.count}</strong><span>{item.label}</span></button>)}</div>
            <div className="scenario-distribution" role="group" aria-label="Rule decision distribution">{totals.checked ? segments.map(segment => <button key={segment.filter} type="button" className={segment.className} style={{ flexGrow: segment.count, flexBasis: 0 }} disabled={!segment.count} aria-pressed={filter === segment.filter && !ruleId} aria-label={segment.label + ": " + segment.count + " of " + totals.checked + " clients"} title={segment.label + ": " + segment.count} onClick={() => showClients(segment.filter as ScenarioResultFilter)} />) : <span className="scenario-distribution-empty" />}</div>
            {totals.unresolved > 0 && <button type="button" className="scenario-unavailable" onClick={() => showClients("unresolved")}>{totals.unresolved} {totals.unresolved === 1 ? "decision unavailable" : "decisions unavailable"} <ChevronRight size={12} /></button>}
            <p className="scenario-readiness">Selected by rules. Final email checks happen in Email Clients.</p>
          </section>
          {findings.length > 0 ? <section className="workflow-test-review scenario-attention" aria-label="Needs review"><div className="scenario-section-heading"><h4>Needs review <small>{findings.length}</small></h4><button type="button" onClick={() => showClients("review")}>View all <ArrowUpRight size={13} /></button></div><div className="scenario-findings">{findings.slice(0, 3).map(row => <button key={row.entryId} type="button" disabled={stale || busy} onClick={() => reviewClient(row)}><CircleAlert size={15} className="scenario-finding-icon" /><span><strong>{row.companyName}</strong><small>{row.decision === "invalid" ? "Client information unavailable" : row.issues.length ? "Missing client or message information" : !row.sendRuleMatched ? "Multiple matches · overall send conditions not met" : row.selection.matchedScenarioIds.length > 1 ? row.selection.matchingMode === "combine" ? "Multiple matching scenarios combined" : (row.selection.scenarios.find(rule => rule.selected)?.name.split(" — ")[0] || "Earlier scenario") + " takes priority · multiple matches" : "No message scenario applies"}</small></span><span className="scenario-finding-action">Review <ChevronRight size={14} /></span></button>)}</div></section> : <p className="scenario-no-findings"><Check size={14} />No review findings</p>}
          <WorkflowScenarioResults rules={rules} workflow={testedWorkflow} fields={testedFields} mode={testedMode} hasScenarios={hasScenarios} showClients={(next, id, ruleView) => showClients(next, id, ruleView, true)} />
          <section className="workflow-test-next scenario-next" aria-label="What to do next"><p>{stale ? "Retest the current draft before preparing emails." : scenarioNextStep(result)}</p></section>
          <WorkflowScenarioTestHelp result={result} workflow={testedWorkflow} fields={testedFields} mode={testedMode} hasScenarios={hasScenarios} metrics={metricDetails} stale={stale || busy} showClients={showClients} />
        </ScenarioView>
        <ScenarioView root={explorePort} active={view === "explore"} view="explore">
          <div className="scenario-inspection" data-inspecting={mobileDetail || undefined}>
            <section ref={resultsRoot} className="workflow-test-results scenario-client-pane" aria-label="Client results">
              <div className="scenario-client-toolbar"><div className="scenario-section-heading"><h4 tabIndex={-1}>Client results</h4><span className="scenario-result-total">{rows.length} of {totals.checked}</span></div>
                <div className="workflow-client-test-controls scenario-client-controls"><label className="scenario-search"><Search size={15} /><input aria-label="Find tracker preview client" value={search} onChange={event => { setSearch(event.target.value); setPage(0); if (listPort.current) listPort.current.scrollTop = 0; }} placeholder="Search company, Client ID, or category" />{search && <button type="button" className="scenario-search-clear" aria-label="Clear client search" onClick={event => { event.preventDefault(); event.currentTarget.parentElement?.querySelector("input")?.focus({ preventScroll: true }); setSearch(""); setPage(0); }}><X size={13} /></button>}</label><div><LiquidGlassDropdown portal variant="condition" label="Filter tracker matching decision" value={filter} onChange={value => { setFilter(value as ScenarioResultFilter); setPage(0); }} options={filterOptions} /></div><div><LiquidGlassDropdown portal variant="condition" label="Filter by scenario" value={ruleId} onChange={value => { setRuleId(value); setRuleView("matched"); setPage(0); }} options={[{ value: "", label: "All scenarios" }, ...result.scenarios.map(rule => ({ value: rule.id, label: rule.name }))]} /></div></div>
                <div className="workflow-test-showing scenario-applied" role="status"><span className="sr-only">Showing: {applied.length ? applied.join(" · ") : "All checked clients"}. {rows.length} of {totals.checked} checked clients match these filters.</span>{filter !== "all" && <button type="button" className="scenario-filter-chip" aria-label="Remove decision filter" onClick={() => { setFilter("all"); setPage(0); }}>{filterOptions.find(option => option.value === filter)?.label}<X size={12} /></button>}{ruleId && <button type="button" className="scenario-filter-chip" aria-label="Remove scenario filter" onClick={() => { setRuleId(""); setPage(0); }}>{viewLabels[ruleView]} {result.scenarios.find(rule => rule.id === ruleId)?.name}<X size={12} /></button>}{search.trim() && <button type="button" className="scenario-filter-chip" aria-label="Remove search filter" onClick={() => { setSearch(""); setPage(0); }}>{search.trim()}<X size={12} /></button>}{applied.length > 0 && <button type="button" className="workflow-test-link" onClick={() => showClients()}>Clear filters</button>}</div>
              </div>
              <div ref={listPort} className="scenario-list-scroll">
                <LayoutGroup id={selectionGroup}><div className="workflow-client-test-list scenario-client-list" aria-label="Actual tracker client results">{rows.slice(currentPage * 25, currentPage * 25 + 25).map(row => <button ref={node => { if (node) rowRefs.current.set(row.entryId, node); else rowRefs.current.delete(row.entryId); }} data-client-entry={row.entryId} key={row.entryId} type="button" disabled={stale || busy} aria-pressed={selected === row.entryId} aria-controls="scenario-client-detail" onClick={event => void inspect(row, event.detail === 0)}>{selected === row.entryId && <motion.span className="scenario-client-selection" aria-hidden="true" layoutId="selected-client" transition={{ duration: reduceMotion ? 0 : .18, ease: [.22, 1, .36, 1] }} />}<span className="scenario-client-identity"><strong title={row.companyName}>{row.companyName}</strong><small>{row.clientId} · {row.category || "Category unavailable"}</small></span><span className="scenario-client-decision" data-decision={row.decision}>{compactDecision[row.decision]}</span><ChevronRight size={13} /></button>)}</div></LayoutGroup>
                {!rows.length && <div className="scenario-quiet-state"><div><strong>{totals.checked ? "No clients in this view" : "No tracker clients to check"}</strong><p>{totals.checked ? "Try another filter or clear the search." : "Include tracker clients, then retest."}</p></div></div>}
              </div>
              <div className="workflow-client-test-pagination scenario-pagination"><button type="button" disabled={!currentPage} onClick={() => changePage(currentPage - 1)}><ChevronLeft size={14} />Previous</button><span>Page {currentPage + 1} of {Math.max(1, Math.ceil(rows.length / 25))}<small>{rows.length ? currentPage * 25 + 1 : 0}–{Math.min(rows.length, currentPage * 25 + 25)} of {rows.length} · {totals.checked} checked</small></span><button type="button" disabled={(currentPage + 1) * 25 >= rows.length} onClick={() => changePage(currentPage + 1)}>Next<ChevronRight size={14} /></button></div>
            </section>
            <WorkflowScenarioClientDetail row={detail} pending={pendingClient} result={result} busy={detailBusy} error={detailError} stale={stale || busy} readAt={detailTime} root={detailRoot} onBack={() => { returning.current = true; setMobileDetail(false); }} />
          </div>
        </ScenarioView>
      </div>}
    </div>
  </TrackerModal>;
}






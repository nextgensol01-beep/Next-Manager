"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, LayoutGroup, motion, useIsPresent, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Layers3, Mail, Minus, X } from "lucide-react";
import type { TrackerCondition, TrackerConditionGroup, TrackerEmailContentRule, TrackerEmailWorkflow, TrackerField } from "@/lib/clientTrackers";
import { evaluateTrackerCondition, evaluateTrackerConditionGroup, legacyWorkflowCondition, trackerValueText } from "@/lib/server/tracker-conditions";
import { buildEmailCombinationPreviews, type EmailCombinationPreview } from "@/lib/tracker-email-combinations";
import { editorMarkup, escapeEditorText, variableLabel, type EmailEditorVariable } from "@/lib/tracker-editor-document";
import { WorkflowOverlayScrollbar } from "./WorkflowStepNavigation";

const ease = [.22, 1, .36, 1] as const;
const filters = [{ value: "all", label: "All" }, { value: "matched", label: "Matched" }, { value: "unmatched", label: "No match" }] as const;
type Filter = typeof filters[number]["value"];
const visibleFor = (previews: EmailCombinationPreview[], filter: Filter) => previews.filter(preview => filter === "all" || preview.eligible === (filter === "matched"));

/** A read-only inspector of the existing synthetic preview, never recipient data. */
export default function WorkflowCombinationPreview({ open, onClose, workflow, fields }: {
  open: boolean; onClose: () => void; workflow: TrackerEmailWorkflow | null; fields: TrackerField[];
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<AnimatePresence>{open && workflow && <PreviewDialog key={workflow.id} workflow={workflow} fields={fields} onClose={onClose} />}</AnimatePresence>, document.body);
}

function ScrollRegion({ children, label, className = "" }: { children: ReactNode; label: string; className?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null), scrollId = useId();
  return <div className={`rule-preview-scroll-frame ${className}`}>
    <div ref={scrollRef} id={scrollId} className="rule-preview-scroll">{children}</div>
    <WorkflowOverlayScrollbar scrollRef={scrollRef} scrollId={scrollId} label={label} />
  </div>;
}

function PreviewDialog({ workflow, fields, onClose }: { workflow: TrackerEmailWorkflow; fields: TrackerField[]; onClose: () => void }) {
  const reduced = Boolean(useReducedMotion()), present = useIsPresent(), id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const close = useRef(onClose); close.current = onClose;
  const { previews, possibleCount, limited } = useMemo(() => buildEmailCombinationPreviews(workflow, fields), [workflow, fields]);
  const scenarios = useMemo(() => (workflow.contentRules || []).filter(rule => rule.type === "combination" && (!workflow.contentMode || workflow.contentMode === "combinations")).sort((a, b) => (a.order || 0) - (b.order || 0)), [workflow.contentRules, workflow.contentMode]);
  const [filter, setFilter] = useState<Filter>("all"), [selectedId, setSelectedId] = useState(() => previews[0]?.id);
  const visible = visibleFor(previews, filter), selected = visible.find(preview => preview.id === selectedId) || visible[0];
  const selectedRowId = selected?.id;
  const matched = previews.filter(preview => preview.eligible).length, unmatched = previews.length - matched;
  const variables = useMemo<EmailEditorVariable[]>(() => [
    { label: "Gmail signature", token: "{{gmail.defaultSignature}}" },
    ...fields.map(field => ({ label: field.label, token: `{{column.${field.key}}}` })),
  ], [fields]);
  useLayoutEffect(() => {
    if (selectedRowId) rowRefs.current.get(selectedRowId)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [filter, selectedRowId]);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const triggerRect = trigger?.getBoundingClientRect(), rect = dialog.getBoundingClientRect();
    if (triggerRect && triggerRect.width) dialog.style.transformOrigin = `${Math.max(15, Math.min(85, (triggerRect.left + triggerRect.width / 2 - rect.left) / rect.width * 100))}% ${Math.max(15, Math.min(85, (triggerRect.top + triggerRect.height / 2 - rect.top) / rect.height * 100))}%`;
    // A secondary dialog owns focus; the underlying editor retains its state.
    const parents = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).filter(parent => parent !== dialog);
    const previous = parents.map(parent => ({ parent, inert: parent.inert, hidden: parent.getAttribute("aria-hidden") }));
    previous.forEach(({ parent }) => { parent.inert = true; parent.setAttribute("aria-hidden", "true"); });
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => (dialog.querySelector<HTMLElement>('[role="option"][aria-selected="true"]') || dialog.querySelector<HTMLElement>("button") || dialog).focus({ preventScroll: true }));
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
      if (event.key !== "Tab") return;
      event.stopImmediatePropagation();
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex="0"]')).filter(node => node.tabIndex >= 0 && node.getClientRects().length && !node.closest("[inert]"));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", keydown, true);
    return () => {
      cancelAnimationFrame(frame); window.removeEventListener("keydown", keydown, true); document.body.style.overflow = overflow;
      previous.forEach(({ parent, inert, hidden }) => { parent.inert = inert; if (hidden === null) parent.removeAttribute("aria-hidden"); else parent.setAttribute("aria-hidden", hidden); });
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  const selectFilter = (next: Filter) => {
    const nextRows = visibleFor(previews, next);
    setFilter(next); setSelectedId(nextRows.some(preview => preview.id === selected?.id) ? selected?.id : nextRows[0]?.id);
  };
  const selectRow = (preview: EmailCombinationPreview, focus = false) => {
    setSelectedId(preview.id);
    if (focus) { const row = rowRefs.current.get(preview.id); row?.focus({ preventScroll: true }); row?.scrollIntoView({ block: "nearest" }); }
  };
  const filterCounts = { all: previews.length, matched, unmatched };
  return <motion.div className="rule-preview-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? .01 : .24 }}
    onPointerDown={event => { if (event.target === event.currentTarget && present) close.current(); }}>
    <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} tabIndex={-1} inert={!present}
      className="rule-preview-dialog" initial={{ opacity: 0, scale: reduced ? 1 : .965, y: reduced ? 0 : 10, filter: reduced ? "blur(0px)" : "blur(3px)" }}
      animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, scale: reduced ? 1 : .975, y: reduced ? 0 : 6, filter: reduced ? "blur(0px)" : "blur(2px)" }} transition={{ duration: reduced ? .01 : .32, ease }}>
      <header className="rule-preview-header">
        <div className="rule-preview-header-icon" aria-hidden="true"><Layers3 size={20} /></div>
        <div><h3 id={`${id}-title`}>Rule combinations</h3><p id={`${id}-description`}>Synthetic preview only · no client records used.</p></div>
        <button type="button" className="rule-preview-close" aria-label="Close Rule combinations" onClick={onClose}><X size={16} /></button>
      </header>
      <div className="rule-preview-overview">
        <dl className="rule-preview-stats">
          <div><dt>Combinations</dt><dd>{possibleCount}</dd></div><div><dt>Scenarios</dt><dd>{scenarios.length}</dd></div>
          <div><dt>Matched{limited ? " · shown" : ""}</dt><dd>{matched}</dd></div><div><dt>No match{limited ? " · shown" : ""}</dt><dd>{unmatched}</dd></div>
        </dl>
        <div className="rule-preview-coverage"><div><span>Coverage</span><strong>{matched} / {previews.length}{limited ? " shown" : ""}</strong></div>
          <div className="rule-preview-coverage-track" role="meter" aria-label={limited ? "Coverage of shown combinations" : "Combination coverage"} aria-valuemin={0} aria-valuemax={previews.length} aria-valuenow={matched}><span style={{ width: `${previews.length ? matched / previews.length * 100 : 0}%` }} /></div>
          <p>{unmatched ? `${unmatched} ${limited ? "shown " : ""}combination${unmatched === 1 ? " has" : "s have"} no matching message` : <><Check size={12} aria-hidden="true" />All {limited ? "shown " : ""}combinations are covered</>}</p>
        </div>
      </div>
      {limited && <p className="rule-preview-limit">Showing the first {previews.length} of {possibleCount} possible combinations. Results and coverage refer to those shown.</p>}
      <LayoutGroup id={id}>
        <div className="rule-preview-filter-row"><div className="rule-preview-filters" role="radiogroup" aria-label="Filter combinations">
          {filters.map((item, index) => <button key={item.value} type="button" role="radio" aria-checked={filter === item.value} tabIndex={filter === item.value ? 0 : -1} onClick={() => selectFilter(item.value)}
            onKeyDown={event => {
              const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
              const next = event.key === "Home" ? 0 : event.key === "End" ? filters.length - 1 : step ? (index + step + filters.length) % filters.length : null;
              if (next === null) return; event.preventDefault(); selectFilter(filters[next].value); (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
            }}>
            {filter === item.value && <motion.span className="rule-preview-filter-glass" layoutId="filter-glass" transition={{ duration: reduced ? .01 : .22, ease }} aria-hidden="true" />}
            <span>{item.label}<small>{filterCounts[item.value]}</small></span>
          </button>)}
        </div><span className="rule-preview-priority-note">First matching scenario wins</span></div>
        <div className="rule-preview-panes">
          <section className="rule-preview-navigator" aria-labelledby={`${id}-navigator`}>
            <div className="rule-preview-pane-heading"><h4 id={`${id}-navigator`}>Combinations</h4><span>{visible.length} shown</span></div>
            <ScrollRegion label="Scroll combinations" className="rule-preview-list-frame">
              <div className="rule-preview-list" role="listbox" aria-label="Combinations" aria-orientation="vertical">
                <AnimatePresence initial={false} mode="popLayout">
                  {visible.map((preview, index) => <motion.button key={preview.id} ref={node => { if (node) rowRefs.current.set(preview.id, node); else rowRefs.current.delete(preview.id); }} type="button" role="option" aria-selected={selected?.id === preview.id} tabIndex={selected?.id === preview.id ? 0 : -1}
                    className="rule-preview-row" onClick={() => selectRow(preview)} initial={{ opacity: 0, y: reduced ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -3 }} transition={{ duration: reduced ? .01 : .2, ease }}
                    onKeyDown={event => {
                      const next = event.key === "ArrowDown" ? Math.min(visible.length - 1, index + 1) : event.key === "ArrowUp" ? Math.max(0, index - 1) : event.key === "Home" ? 0 : event.key === "End" ? visible.length - 1 : null;
                      if (next === null) return; event.preventDefault(); selectRow(visible[next], true);
                    }}>
                    {selected?.id === preview.id && <motion.span className="rule-preview-row-glass" layoutId="row-glass" transition={{ duration: reduced ? .01 : .22, ease }} aria-hidden="true" />}
                    <span className="rule-preview-row-number">{String(previews.indexOf(preview) + 1).padStart(2, "0")}</span>
                    <span className="rule-preview-row-content"><span className="rule-preview-row-inputs">{preview.inputs.length ? preview.inputs.map(input => <span key={input.key}>{input.label} <b>{input.value || "Not set"}</b></span>) : <span>No condition values</span>}</span>
                      <span className="rule-preview-row-status">{preview.eligible ? <Check size={12} aria-hidden="true" /> : <Minus size={12} aria-hidden="true" />}{resultLabel(preview, scenarios)}</span>
                    </span>
                  </motion.button>)}
                </AnimatePresence>
              </div>
              {!visible.length && <div className="rule-preview-list-empty"><Layers3 size={20} aria-hidden="true" /><p>{filter === "matched" ? "No combinations are matched." : "Every combination has a match."}</p><button type="button" onClick={() => selectFilter("all")}>Show all combinations</button></div>}
            </ScrollRegion>
          </section>
          <section className="rule-preview-detail" aria-labelledby={`${id}-result`}>
            <div className="rule-preview-pane-heading"><h4 id={`${id}-result`}>Selected result</h4><span>{selected ? `Combination ${previews.indexOf(selected) + 1}` : "No selection"}</span></div>
            <div className="rule-preview-result-stage"><AnimatePresence initial={false} mode="wait">
              {selected ? <ResultPanel key={selected.id} preview={selected} scenarios={scenarios} workflow={workflow} fields={fields} variables={variables} reduced={reduced} /> : <motion.div key="empty" className="rule-preview-result-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Mail size={28} aria-hidden="true" /><p>{filter === "matched" ? "No matching results to preview." : "All combinations are covered."}</p><span>Choose All to inspect a combination.</span></motion.div>}
            </AnimatePresence></div>
          </section>
        </div>
      </LayoutGroup>
      <span className="sr-only" role="status">{selected ? `Combination ${previews.indexOf(selected) + 1}. ${resultLabel(selected, scenarios)}.` : "No combinations in this filter."}</span>
    </motion.div>
  </motion.div>;
}

function resultLabel(preview: EmailCombinationPreview, scenarios: TrackerEmailContentRule[]) {
  const index = scenarios.findIndex(rule => rule.id === preview.scenarioId), scenario = scenarios[index];
  if (!preview.sendRuleMatched) return scenario ? `Send rule not met · Scenario ${index + 1}` : "Send rule not met";
  if (scenario?.action === "skip") return `Excluded · Scenario ${index + 1}`;
  if (!preview.eligible) return "No matching scenario";
  return scenario ? `Scenario ${index + 1}` : "Shared email";
}

const operatorText: Record<TrackerCondition["operator"], string> = {
  equals: "is", not_equals: "is not", is_empty: "is empty", is_not_empty: "is not empty", contains: "contains", not_contains: "does not contain",
  greater_than: "is greater than", greater_than_or_equal: "is at least", less_than: "is less than", less_than_or_equal: "is at most",
};
function describeCondition(condition: TrackerCondition, fields: TrackerField[]) {
  const label = fields.find(field => field.key === condition.fieldKey)?.label || "Removed column";
  return `${label} ${operatorText[condition.operator]}${condition.operator === "is_empty" || condition.operator === "is_not_empty" ? "" : ` ${trackerValueText(condition.value) || "Not set"}`}`;
}
function semanticMarkup(html: string, variables: EmailEditorVariable[]) {
  const container = document.createElement("div"); container.innerHTML = editorMarkup(html, variables);
  container.querySelectorAll<HTMLElement>("[data-email-variable]").forEach(atom => {
    atom.className = "tracker-preview-variable";
    atom.setAttribute("aria-label", `${variableLabel(atom.dataset.emailVariable || "", variables)} placeholder`);
  });
  return container.innerHTML;
}

function ResultPanel({ preview, scenarios, workflow, fields, variables, reduced }: {
  preview: EmailCombinationPreview; scenarios: TrackerEmailContentRule[]; workflow: TrackerEmailWorkflow; fields: TrackerField[]; variables: EmailEditorVariable[]; reduced: boolean;
}) {
  const present = useIsPresent(), whyId = useId(), [whyOpen, setWhyOpen] = useState(false);
  const scenarioIndex = scenarios.findIndex(rule => rule.id === preview.scenarioId), scenario = scenarios[scenarioIndex];
  const eligibility = workflow.conditionGroup || legacyWorkflowCondition(workflow.mainFieldKey, workflow.mainValue);
  const subject = useMemo(() => semanticMarkup(escapeEditorText(preview.subject || "No email subject"), variables), [preview.subject, variables]);
  const body = useMemo(() => semanticMarkup(`${preview.body.replace(/\n/g, "<br>")}<br><br>{{gmail.defaultSignature}}`, variables), [preview.body, variables]);
  const heading = preview.eligible && scenario ? `Matched Scenario ${scenarioIndex + 1}` : scenario?.action === "skip" ? `Excluded by Scenario ${scenarioIndex + 1}` : !preview.sendRuleMatched ? "Send rule not met" : !preview.eligible ? "No matching scenario" : "Shared email";
  return <motion.article className="rule-preview-result" inert={!present} aria-hidden={!present} initial={{ opacity: 0, y: reduced ? 0 : 5, filter: reduced ? "blur(0px)" : "blur(2px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: reduced ? 0 : -3, filter: reduced ? "blur(0px)" : "blur(2px)", transition: { duration: reduced ? .01 : .08, ease } }} transition={{ duration: reduced ? .01 : .14, ease }}>
    <ScrollRegion label="Scroll selected result">
      <div className="rule-preview-result-content">
        <div className="rule-preview-result-heading"><span className="rule-preview-result-symbol" aria-hidden="true">{preview.eligible ? <Check size={16} /> : <Minus size={16} />}</span><h4>{heading}</h4></div>
        <dl className="rule-preview-selected-inputs">{preview.inputs.map(input => <div key={input.key}><dt>{input.label}</dt><dd>{input.value || "Not set"}</dd></div>)}</dl>
        {scenario && <div className="rule-preview-cause"><p>{scenario.conditionGroup.conditions.map((condition, index) => <span key={index}>{index > 0 && <b className="rule-preview-connector">{scenario.conditionGroup.mode === "ALL" ? "AND" : "OR"}</b>}{describeCondition(condition, fields)}</span>)}</p><span>{scenario.action === "skip" ? "This scenario excludes matching combinations." : `${preview.eligible ? "Message used" : "Matched message"}: Combination message ${scenarioIndex + 1}`}{!preview.sendRuleMatched && " The send rule is not met."}</span></div>}
        <div className="rule-preview-why">
          <button type="button" aria-expanded={whyOpen} aria-controls={whyId} onClick={() => setWhyOpen(open => !open)}><span>Why this result?</span><ChevronDown size={14} className={whyOpen ? "is-open" : ""} /></button>
          <motion.div id={whyId} className="rule-preview-proof" inert={!whyOpen} aria-hidden={!whyOpen} initial={false} animate={{ height: whyOpen ? "auto" : 0, opacity: whyOpen ? 1 : 0, filter: whyOpen || reduced ? "blur(0px)" : "blur(2px)" }} transition={{ duration: reduced ? .01 : .2, ease }}>
            <div><ProofGroup title="Send rule" group={eligibility} fields={fields} preview={preview} />
              {scenarios.map((rule, index) => <ProofGroup key={rule.id} title={`Scenario ${index + 1}`} group={rule.conditionGroup} fields={fields} preview={preview} note={rule.id === preview.scenarioId ? rule.action === "skip" ? "Selected · excludes" : "Selected" : evaluateTrackerConditionGroup(rule.conditionGroup, preview.values) ? "Lower priority" : undefined} />)}
              {scenarios.length > 0 && <p className="rule-preview-proof-note">Scenarios are checked in priority order. The first match determines the result.</p>}
            </div>
          </motion.div>
        </div>
        {preview.eligible ? <section className="rule-preview-mail-sheet" aria-label="Synthetic email preview">
          <div className="rule-preview-mail-subject"><span>Subject</span><h5 dangerouslySetInnerHTML={{ __html: subject }} /></div>
          <div className="rule-preview-mail-body" onClick={event => { if ((event.target as Element).closest("a")) event.preventDefault(); }} dangerouslySetInnerHTML={{ __html: body }} />
        </section> : <div className="rule-preview-no-message"><Mail size={24} aria-hidden="true" /><strong>No message is produced for this combination.</strong><p>{scenario?.action === "skip" ? "The matching scenario excludes it." : !preview.sendRuleMatched ? "Its values do not meet the workflow’s send rule." : "None of the configured scenarios match these values."}</p></div>}
      </div>
    </ScrollRegion>
  </motion.article>;
}

function ProofGroup({ title, group, fields, preview, note }: { title: string; group: TrackerConditionGroup; fields: TrackerField[]; preview: EmailCombinationPreview; note?: string }) {
  const matched = evaluateTrackerConditionGroup(group, preview.values);
  return <section className="rule-preview-proof-group"><h5>{title}<small>{group.mode === "ALL" ? "AND" : "OR"}</small><span>{note || (matched ? "Matches" : "No match")}</span></h5>
    <ul>{group.conditions.map((condition, index) => {
      const passed = evaluateTrackerCondition(condition, preview.values);
      return <li key={index}><span className="rule-preview-proof-check" aria-label={passed ? "Condition met" : "Condition not met"}>{passed ? <Check size={12} /> : <X size={12} />}</span><span>{describeCondition(condition, fields)}<small>Actual: {trackerValueText(preview.values[condition.fieldKey]) || "Not set"}</small></span></li>;
    })}{!group.conditions.length && <li>No conditions configured.</li>}</ul>
  </section>;
}

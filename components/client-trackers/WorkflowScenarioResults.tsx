"use client";

import { ChevronDown, ArrowUpRight, Send, Ban, BarChart3 } from "lucide-react";
import { useState } from "react";
import type { TrackerEmailWorkflow, TrackerField } from "@/lib/clientTrackers";
import type { ScenarioAnalysis } from "@/lib/tracker-scenario-analysis";
import { plainScenarioConditions, type scenarioRuleBreakdown, type ScenarioResultFilter, type ScenarioRuleView } from "@/lib/tracker-scenario-explanations";
import ScenarioDisclosure from "./ScenarioDisclosure";

type Rule = ScenarioAnalysis["scenarios"][number] & ReturnType<typeof scenarioRuleBreakdown>;
type ShowClients = (filter?: ScenarioResultFilter, id?: string, view?: ScenarioRuleView) => void;

function ScenarioNumbers({ rule, mode, combination, showClients }: { rule: Rule; mode: string; combination: boolean; showClients: ShowClients }) {
  const entries = [
    { key: "matched", label: "Matched", count: rule.matched, detail: "Met this rule’s matching conditions, before overall sending conditions and priority were applied." },
    { key: "used", label: rule.action === "skip" ? "Excluded" : "Chosen", count: rule.used, detail: rule.action === "skip" ? "This Exclude action determined the final rule decision for these clients." : "This message was used in the final rule decision after overall sending conditions and any exclusions." },
    { key: "bypassed", label: "Bypassed", count: rule.bypassed, detail: !combination ? "Matching statements and points are retained independently of scenario priority." : mode === "combine" ? "Combine considers every matching scenario; it does not bypass later matches by priority." : "An earlier matching scenario took priority after the overall sending conditions were met." },
    { key: "overlap", label: "Overlapping", count: rule.overlapping, detail: combination ? "Also matched another scenario. This can be intentional." : "Also matched multiple combination scenarios. This does not stop matching fragments from being included." },
    ...(rule.outside > 0 ? [{ key: "outside", label: "Overall conditions not met", count: rule.outside, detail: "Ruled out before this rule could determine the decision." }] : []),
    ...(rule.selected !== rule.used ? [{ key: "selected", label: "Selected before final exclusions", count: rule.selected, detail: "Selected at the rule stage. The final decision can still prevent this message from being used." }] : []),
    ...(rule.blocked > 0 ? [{ key: "blocked", label: "Stopped by another rule", count: rule.blocked, detail: mode === "combine" ? "A selected Exclude scenario stopped this matching Send fragment in Combine mode." : "Another rule prevented this selected message from being used." }] : []),
  ];
  return <ScenarioDisclosure name={"numbers-" + rule.id} className="scenario-rule-diagnostic" title="Understand these numbers" description="What matched, was chosen, or bypassed." context={rule.name} icon={BarChart3}>
    <dl className="scenario-number-definitions">{entries.map(entry => <div key={entry.key} className={entry.count ? "" : "is-zero"} data-metric={entry.key}>
      <dt><strong>{entry.label}</strong><p>{entry.detail}</p>{entry.key === "overlap" && entry.count > 0 && <button type="button" className="workflow-test-link" onClick={() => showClients("all", rule.id, "overlap")}>Inspect overlaps <ArrowUpRight size={12} /></button>}</dt><dd>{entry.count}</dd>
    </div>)}</dl>
  </ScenarioDisclosure>;
}

export default function WorkflowScenarioResults({ rules, workflow, fields, mode, hasScenarios, showClients }: {
  rules: Rule[]; workflow?: TrackerEmailWorkflow; fields: TrackerField[]; mode: string; hasScenarios: boolean; showClients: ShowClients;
}) {
  const [showAll, setShowAll] = useState(false);
  const visibleRules = showAll ? rules : rules.slice(0, 4);
  return <section className="workflow-client-test-scenarios scenario-rules" aria-label="Scenario results">
    <div className="scenario-section-heading"><h4>{rules.length && !hasScenarios ? "Message rule results" : "Scenario results"} <small>{rules.length}</small></h4><span className="scenario-mode">{!rules.length ? "Shared template" : !hasScenarios ? "Matching message fragments" : mode === "combine" ? "Combine matching scenarios" : "First matching scenario"}</span></div>
    {!rules.length && <div className="scenario-quiet-state"><Send size={19} /><div><strong>No scenario rules configured</strong><p>The shared email template can still be selected when the overall sending conditions are met.</p></div></div>}
    <div className="scenario-rule-list">{visibleRules.map(rule => {
      const draft = workflow?.contentRules?.find(item => item.id === rule.id);
      return <details key={rule.id} className="workflow-test-scenario scenario-rule" data-scenario-id={rule.id}>
        <summary><span className="scenario-priority" aria-label={`Priority ${rule.priority}`}>{String(rule.priority).padStart(2, "0")}</span><span className="scenario-rule-title"><button type="button" className="scenario-rule-open" aria-label={"Explore clients matching " + rule.name} onClick={event => { event.preventDefault(); event.stopPropagation(); showClients("all", rule.id); }}><strong title={rule.name}>{rule.name}</strong><ArrowUpRight size={12} /></button><small>{rule.action === "skip" ? <Ban size={12} /> : <Send size={12} />}{rule.action === "skip" ? "Exclude" : "Send message"}</small></span><span className="scenario-rule-outcome"><b>{rule.used}</b> {rule.action === "skip" ? "excluded" : "chosen"}{rule.bypassed > 0 && <small> · {rule.bypassed} bypassed</small>}</span><ChevronDown className="scenario-disclosure" size={15} /></summary>
        <div className="scenario-rule-expanded"><p className="scenario-condition-copy">{draft ? plainScenarioConditions(draft.conditionGroup, fields) : "Retest to see the conditions used for these results."}</p>
          <div className="scenario-rule-counts"><span><b>{rule.matched}</b> matched</span><span><b>{rule.used}</b> {rule.action === "skip" ? "excluded" : "chosen"}</span>{rule.bypassed > 0 && <span><b>{rule.bypassed}</b> bypassed</span>}{rule.overlapping > 0 && <span><b>{rule.overlapping}</b> overlapping</span>}</div>
          {rule.outside > 0 && <p>{rule.outside} matched but did not meet the workflow’s overall sending conditions. {rule.action === "skip" ? "This Exclude action was not applied because those clients had already been ruled out." : "This message was not chosen for them."} <button type="button" className="workflow-test-link" onClick={() => showClients("all", rule.id, "outside")}>See clients</button></p>}
          {rule.bypassed > 0 && <p>{rule.bypassed} matched an earlier scenario. {rule.action === "skip" ? "This Exclude action was bypassed." : "That earlier scenario determined the decision instead."} <button type="button" className="workflow-test-link" onClick={() => showClients("all", rule.id, "bypassed")}>Review priority</button></p>}
          {rule.blocked > 0 && <p>{rule.blocked} matched this message rule, but another rule prevented sending. <button type="button" className="workflow-test-link" onClick={() => showClients("all", rule.id, "blocked")}>See clients</button></p>}
          <div className="scenario-rule-actions"><button type="button" onClick={() => showClients("all", rule.id)}>See matching clients <ArrowUpRight size={13} /></button><button type="button" onClick={() => showClients("all", rule.id, "used")}>See {rule.action === "skip" ? "excluded" : "chosen"} clients <ArrowUpRight size={13} /></button></div>
          <ScenarioNumbers rule={rule} mode={mode} combination={draft ? draft.type === "combination" : rule.name.startsWith("Scenario ")} showClients={showClients} />
        </div>
      </details>;
    })}</div>{rules.length > 4 && <button type="button" className="scenario-show-more" onClick={() => setShowAll(value => !value)}>{showAll ? "Show fewer scenarios" : `Show all ${rules.length} scenarios`}</button>}
  </section>;
}

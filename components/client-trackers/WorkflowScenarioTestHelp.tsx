"use client";

import { BookOpen, ArrowUpRight } from "lucide-react";
import type { TrackerEmailWorkflow, TrackerField } from "@/lib/clientTrackers";
import type { ScenarioAnalysis } from "@/lib/tracker-scenario-analysis";
import { plainScenarioConditions, scenarioTestSummary, workflowSendConditions, type ScenarioResultFilter } from "@/lib/tracker-scenario-explanations";
import ScenarioDisclosure from "./ScenarioDisclosure";

export type ScenarioHelpMetric = { label: string; count: number; help: string; filter: ScenarioResultFilter };
export default function WorkflowScenarioTestHelp({ result, workflow, fields, mode, hasScenarios, metrics, stale, showClients }: {
  result: ScenarioAnalysis; workflow?: TrackerEmailWorkflow; fields: TrackerField[]; mode: string; hasScenarios: boolean; metrics: ScenarioHelpMetric[]; stale: boolean;
  showClients: (filter?: ScenarioResultFilter) => void;
}) {
  return <div className="scenario-method"><ScenarioDisclosure name="general" className="workflow-test-help scenario-general-help" title="How this test works" description="Scenario priority, client coverage, and email checks." icon={BookOpen}>
    <div className="scenario-test-help-sections">
      <section><h5>How scenarios are chosen</h5><p>The overall sending conditions are checked first.</p><p>{!hasScenarios ? "The shared template and all matching statements and points can be used; they do not compete in scenario priority." : mode === "combine" ? "All matching scenarios are combined. A selected Exclude scenario prevents sending, including matching Send fragments." : "The first matching scenario in priority order determines the decision. Later matches are bypassed; priority does not imply message accuracy."}</p>{hasScenarios && <p>Matching statements and points, when present, are retained independently of scenario priority.</p>}{workflow && <p className="scenario-help-condition">Overall sending conditions: {plainScenarioConditions(workflowSendConditions(workflow), fields)}</p>}</section>
      <section><h5>Which clients were checked</h5><p><strong>{result.evaluated} of {result.total} clients</strong> · {result.complete ? "Complete audience" : "Partial test"}</p><p>Checked <time dateTime={result.evaluatedAt}>{new Date(result.evaluatedAt).toLocaleString()}</time>. {stale ? "These results are outdated; retest the current draft." : ""}</p><p>Coverage includes all tracker pages, independent of the table’s filters.{!result.complete ? ` This run stopped within the ${result.limit}-client or execution-time limits; unchecked clients are not included in the counts.` : ""}</p>{!result.evaluated && <p className="workflow-test-summary">{scenarioTestSummary(result)}</p>}</section>
      <section><h5>What happens next</h5><p>This is a read-only test of the unsaved workflow. No client records, Gmail drafts, or emails are changed or created. Recipient, history, attachment, and other eligibility checks happen separately in Email Clients.</p></section>
      <section><h5>Reading the result totals</h5><p>Needs review overlaps the decision groups. The detailed measures below can overlap too; they are not additional clients.</p><dl className="scenario-number-definitions scenario-test-measures">{metrics.map(metric => <div key={metric.filter} className={metric.count ? "" : "is-zero"}><dt><strong>{metric.label}</strong><p>{metric.help}</p><button type="button" className="workflow-test-link" onClick={() => showClients(metric.filter)}>See clients <ArrowUpRight size={12} /></button></dt><dd>{metric.count}</dd></div>)}</dl></section>
    </div>
  </ScenarioDisclosure></div>;
}



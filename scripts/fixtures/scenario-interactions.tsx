import React, { useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Modal from "../../components/client-trackers/TrackerModal";
import Workspace from "../../components/client-trackers/WorkflowMessagesWorkspace";
import { WorkflowStepContentStage } from "../../components/client-trackers/WorkflowStepNavigation";
import { addDraftRule, updateDraftRule, removeDraftRule, restoreDraftRule, moveDraftRule, orderedDraftRules, type WorkflowDraftChange } from "../../lib/tracker-email-draft-rules";
import { emailWorkflowValidationIssues, validateEmailWorkflowDrafts } from "../../lib/tracker-email-validation";
import ClientPreview, { type DraftScenarioAnalysis } from "../../components/client-trackers/WorkflowTrackerClientPreview";
import { emailConditionOperators, emailConditionValues } from "../../lib/tracker-email-context";
import type { TrackerEmailContentRule, TrackerEmailWorkflow } from "../../lib/clientTrackers";

const fields = [{ key: "ready", label: "Ready", type: "toggle" as const }];
const rule = (id: string, order: number): TrackerEmailContentRule => ({ id, type: "combination", order, action: "include", content: `<p><strong>${id}</strong> has formatted <em>message content</em>.</p>`, conditionGroup: { mode: "ALL", conditions: [{ fieldKey: "ready", operator: "equals", value: "Yes" }] } });
const initial: TrackerEmailWorkflow = { id: "interaction-workflow", name: "Interaction workflow", mainFieldKey: "ready", mainValue: "Yes", contentMode: "combinations", subject: "Fixture", body: "{{combinationMessage}}", points: [], contentRules: [rule("first", 0), rule("middle", 1), rule("last", 2)] };
function Fixture() {
  const [workflow, setWorkflow] = useState(initial), [saved, setSaved] = useState(JSON.stringify(initial));
  const [open, setOpen] = useState(true), [epoch, setEpoch] = useState(0), [status, setStatus] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false), [analysis, setAnalysis] = useState<DraftScenarioAnalysis | null>(null);
  const [target, setTarget] = useState<{ ruleId: string; conditionIndex?: number; request: number } | null>(null);
  const fingerprint = JSON.stringify([workflow, fields]);
  const editor = useRef<HTMLElement>(null);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const patch = (change: WorkflowDraftChange) => setWorkflow(current => ({ ...current, ...(typeof change === "function" ? change(current) : change) }));
  const add = (type: TrackerEmailContentRule["type"]) => { const id = crypto.randomUUID(); patch(current => addDraftRule(current, { ...rule(id, 0), type, content: "", conditionGroup: { mode: "ALL", conditions: [{ fieldKey: "", operator: "equals", value: "" }] } })); return id; };
  const compact = useCallback((value: number) => editor.current?.style.setProperty('--workflow-header-progress', String(value)), []);
  const visible = orderedDraftRules(workflow.contentRules || [], 'combination');
  (window as any).scenarioFixture = {
    workflow, saved, status, open, analysis, previewOpen,
    target: (ruleId: string, conditionIndex?: number) => setTarget({ ruleId, conditionIndex, request: Date.now() }),
    patch,
    load: (count: number, inactive = 0) => { setWorkflow({ ...initial, contentRules: Array.from({ length: count }, (_, i) => ({ ...rule('loaded-' + i, i), type: i < inactive ? 'statement' as const : 'combination' as const })) }); setEpoch(value => value + 1); },
    loadEmpty: () => { setWorkflow({ ...initial, contentRules: [] }); setEpoch(value => value + 1); },
    burst: () => { for (let i = 0; i < 3; i++) add('combination'); },
    edit: (id: string, content: string) => patch(current => updateDraftRule(current, id, { content })),
  };
  return <><div className="fixture-controls"><button onClick={() => { setWorkflow(JSON.parse(saved)); setEpoch(value => value + 1); setOpen(true); }}>Reopen workflow</button><output>{status}</output></div>
    <Modal open={open} inert={previewOpen} onClose={() => setOpen(false)} title="Email Updates" size="2xl" fixedHeight scrollable={false} className="tracker-email-modal is-workflow-editing"
      footer={<footer className="tracker-modal-footer tracker-email-footer flex justify-end gap-3"><button onClick={() => { setWorkflow(JSON.parse(saved)); setOpen(false); }}>Discard fixture draft</button><button onClick={() => { const error = validateEmailWorkflowDrafts([workflow], fields); setStatus(error || 'saved'); const issue = emailWorkflowValidationIssues(workflow, fields)[0]; if (issue?.ruleId) setTarget({ ruleId: issue.ruleId, conditionIndex: issue.conditionIndex, request: Date.now() }); if (!error) { setSaved(JSON.stringify(workflow)); setOpen(false); } }}>Save Email Updates</button></footer>}>
      <div className="tracker-email-workspace is-editing h-full min-h-0 p-5 overflow-hidden flex flex-col"><section ref={editor} className="tracker-email-editor">
        <header className="tracker-email-sticky-header fixture-floating-header"><h3>Interaction workflow</h3><nav aria-label="Workflow steps">About · Send rule · Email style · <strong>Messages</strong> · Template · Delivery · Review</nav><p>Configure matching messages</p></header>
        <WorkflowStepContentStage page={3} direction={1} title="Messages" reduceMotion={reduced} focusOnEntry={false} navigation={null} onCompactnessChange={compact}>
          <Workspace key={epoch} mode="combinations" rules={visible} allRules={workflow.contentRules} totalRuleCount={workflow.contentRules?.length || 0} fields={fields} variables={[]} reduced={reduced}
            onAdd={add} onUpdate={(id, change) => patch(current => updateDraftRule(current, id, change))}
            matchingMode={workflow.combinationMatchingMode} onMatchingMode={combinationMatchingMode => patch({ combinationMatchingMode })}
            analysis={analysis} analysisCurrent={analysis?.fingerprint === fingerprint} validationTarget={target} onTestClients={() => setPreviewOpen(true)}
            onRemove={(id, expected) => patch(current => removeDraftRule(current, id, expected))} onRestore={snapshot => patch(current => restoreDraftRule(current, snapshot))}
            onMove={(id, direction) => patch(current => moveDraftRule(current, id, direction))} onPreview={() => {}} valuesForField={emailConditionValues} operatorsForField={emailConditionOperators} />
        </WorkflowStepContentStage>
      </section></div>
    </Modal><ClientPreview open={previewOpen} onClose={() => setPreviewOpen(false)} trackerId="fixture" workflow={workflow} fields={fields} fingerprint={fingerprint} analysis={analysis} onAnalysis={setAnalysis} /></>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture /></React.StrictMode>);

import React, { useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Modal from "../../components/client-trackers/TrackerModal";
import Review from "../../components/client-trackers/WorkflowReviewWorkspace";
import Template from "../../components/client-trackers/WorkflowTemplateWorkspace";
import Preview from "../../components/client-trackers/WorkflowCombinationPreview";
import { WorkflowStepContentStage, useWorkflowStepNavigation } from "../../components/client-trackers/WorkflowStepNavigation";
import { emailWorkflowValidationIssues, validateEmailWorkflowDrafts } from "../../lib/tracker-email-validation";
import type { TrackerEmailWorkflow } from "../../lib/clientTrackers";
import { ready, cases, fields } from "./workflow-review-data";

const variables = [{ label: "Client company", token: "{{client.companyName}}" }, { label: "Financial year", token: "{{tracker.financialYear}}" }, { label: "Combination message", token: "{{combinationMessage}}" }];
const pages = ["About", "Send rule", "Email style", "Messages", "Template", "Delivery", "Review"].map(title => ({ title, description: title === "Review" ? "Check the workflow before saving." : "" }));
function Fixture() {
  const [workflow, setWorkflow] = useState(ready), [preview, setPreview] = useState(false), [other, setOther] = useState(false), [library, setLibrary] = useState(false), [saveResult, setSaveResult] = useState("");
  const editorRef = useRef<HTMLElement>(null);
  const nav = useWorkflowStepNavigation("review", 6, pages, false);
  const update = (patch: Partial<TrackerEmailWorkflow>) => setWorkflow(value => ({ ...value, ...patch }));
  const compact = useCallback((value: number) => {
    editorRef.current?.style.setProperty("--workflow-header-progress", String(value));
    editorRef.current?.style.setProperty("--workflow-summary-height", `${88 - 56 * value}px`);
  }, []);
  const mode = workflow.contentMode || "points";
  (window as any).reviewFixture = {
    workflow, page: nav.setupPage, preview, library, saveResult,
    choose: (name: string) => { setWorkflow(cases[name]); setOther(false); setLibrary(false); nav.navigateToStep(6); },
    patch: update, other: () => setOther(true), returnToReview: () => nav.navigateToStep(6),
  };
  return <><Modal open onClose={() => {}} title="Email updates" size="2xl" fixedHeight scrollable={false} className="tracker-email-modal is-workflow-editing"
    footer={<footer className="tracker-modal-footer tracker-email-footer flex justify-end gap-3"><button type="button">Cancel</button><button className="tracker-modal-primary" type="button" onClick={() => setSaveResult(validateEmailWorkflowDrafts(other ? [workflow, cases.incomplete] : [workflow], fields) || "saved")}>Save email updates</button></footer>}>
    <div className="tracker-email-workspace is-editing h-full min-h-0 p-5 overflow-hidden flex flex-col"><section className="tracker-email-editor" ref={editorRef}>
      <header className="tracker-email-sticky-header"><div className="tracker-email-workflow-summary"><h3>{workflow.name || "Email workflow"}</h3></div><nav className="fixture-stepper" aria-label="Workflow steps">{pages.map((page, index) => <button type="button" key={page.title} aria-current={nav.setupPage === index ? "step" : undefined} onClick={() => nav.navigateToStep(index)}>{page.title}</button>)}</nav><p className="fixture-description">{pages[nav.setupPage].description}</p></header>
      <WorkflowStepContentStage page={nav.setupPage} direction={nav.stepDirection} reduceMotion={false} title={pages[nav.setupPage].title} focusOnEntry={false} navigation={null} onCompactnessChange={compact}>
        {nav.setupPage === 6 ? <Review workflow={workflow} fields={fields} variables={variables} mode={mode} issues={emailWorkflowValidationIssues(workflow, fields)} otherWorkflows={other ? [{ name: "Other workflow", issues: 2 }] : []}
          onEdit={nav.navigateToStep} onPreview={() => setPreview(true)} onBack={() => setLibrary(true)} />
          : nav.setupPage === 4 ? <Template subject={workflow.subject} body={workflow.body} variables={variables} onChange={update} />
          : <div className="fixture-edit-step"><h3>{library ? "Workflow library" : pages[nav.setupPage].title}</h3><p>Existing step destination</p></div>}
      </WorkflowStepContentStage>
    </section></div>
  </Modal><Preview open={preview} onClose={() => setPreview(false)} workflow={workflow} fields={fields} /></>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Fixture /></React.StrictMode>);

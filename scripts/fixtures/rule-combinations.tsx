import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import Modal from "../../components/client-trackers/TrackerModal";
import Preview from "../../components/client-trackers/WorkflowCombinationPreview";
import { cases, fields } from "./rule-combinations-data";

function Fixture() {
  const [workflow, setWorkflow] = useState(cases.base), [open, setOpen] = useState(false), [parentOpen, setParentOpen] = useState(true);
  (window as any).readPreviewFixture = () => ({ workflow, parentOpen, open });
  return <><Modal open={parentOpen} onClose={() => setParentOpen(false)} title="Email updates" subtitle="Rule preview test workspace" fixedHeight scrollable={false} size="2xl" className="tracker-email-modal is-workflow-editing">
    <div className="preview-fixture-controls">
      {Object.keys(cases).map(name => <button key={name} onClick={() => setWorkflow(cases[name])}>{name}</button>)}
      <h3>{workflow.name}</h3><p>Inspect current unsaved scenarios.</p>
      <button className="workflow-message-preview" onClick={() => setOpen(true)}>Preview rule combinations</button>
      <button onClick={() => setWorkflow(cases.unsaved)}>Edit unsaved message</button>
    </div>
  </Modal><Preview open={open} onClose={() => setOpen(false)} workflow={workflow} fields={fields} /></>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Fixture /></React.StrictMode>);

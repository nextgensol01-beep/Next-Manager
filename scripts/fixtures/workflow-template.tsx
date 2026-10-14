import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import Workspace from "../../components/client-trackers/WorkflowTemplateWorkspace";

const initial = { subject: "Quarterly update for {{client.companyName}} — {{tracker.financialYear}}", body: "<p>Dear {{client.companyName}},</p><p>Please share the requested documents.</p><p>{{points}}</p><p>Regards,</p>" };
const variables = [
  { label: "Client company", token: "{{client.companyName}}" }, { label: "Client ID", token: "{{client.clientId}}" },
  { label: "Category", token: "{{client.category}}" }, { label: "State", token: "{{client.state}}" }, { label: "GST number", token: "{{client.gstNumber}}" },
  { label: "Financial year", token: "{{tracker.financialYear}}" }, { label: "Workflow name", token: "{{workflow.name}}" },
  { label: "Combination message", token: "{{combinationMessage}}" }, { label: "Matching statements", token: "{{statements}}" }, { label: "Matching points", token: "{{points}}" },
  { label: "Tracker name", token: "{{tracker.name}}" }, { label: "Purchase Upload", token: "{{column.purchase}}" },
];
function Fixture() {
  const [template, setTemplate] = useState(initial), [saved, setSaved] = useState(""), [visible, setVisible] = useState(true), [epoch, setEpoch] = useState(0);
  (window as any).readTemplate = () => template;
  (window as any).loadTemplate = (value: typeof initial) => { setTemplate(value); setEpoch(current => current + 1); };
  return <>
    <nav className="fixture-tools" aria-label="Test controls">
      <button onClick={() => { setTemplate(initial); setEpoch(current => current + 1); }}>Reset</button>
      <button onClick={() => { setTemplate({ subject: "", body: "" }); setEpoch(current => current + 1); }}>Empty</button>
      <button onClick={() => setSaved(JSON.stringify(template))}>Save</button>
      <button onClick={() => { setTemplate(JSON.parse(saved)); setEpoch(current => current + 1); }}>Reopen</button>
      <button onClick={() => setVisible(current => !current)}>Toggle step</button>
    </nav>
    <main className="tracker-modal tracker-email-modal tracker-email-editor-stage is-workflow-editing">
      {visible ? <Workspace key={epoch} {...template} variables={variables} onChange={patch => setTemplate(current => ({ ...current, ...patch }))} /> : <p>Another workflow step</p>}
    </main>
  </>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Fixture /></React.StrictMode>);

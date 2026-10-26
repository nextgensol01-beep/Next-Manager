import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import Workspace from "../../components/client-trackers/WorkflowMessagesWorkspace";
import { createTrackerEmailContext, emailConditionOperators, emailConditionValues } from "../../lib/tracker-email-context";
import { emailEditorVariables, renderTrackerEmail } from "../../lib/tracker-email-renderer";
import type { TrackerEmailWorkflow, TrackerField } from "../../lib/clientTrackers";
const fields: TrackerField[] = [
  { key: "mail", label: "Mail to be sent", type: "toggle" }, { key: "sale", label: "Sale Upload", type: "toggle" },
  { key: "amount", label: "Amount", type: "number" }, { key: "due", label: "Due date", type: "date" },
  { key: "tags", label: "Documents", type: "multiSelect", options: ["Purchase", "Sale", "Certificate"] },
];
const initial: TrackerEmailWorkflow = { id: "ui-context", name: "Migration", contentMode: "combinations", mainFieldKey: "mail", mainValue: "Yes", subject: "Update {{client.companyName}}", body: "{{combinationMessage}}", points: [], contentRules: [0, 1].map(index => ({ id: `scenario-${index}`, type: "combination", order: index, content: index ? "<p>Additional message {{client.clientId}}</p>" : "<p>Dear {{client.companyName}}</p>", conditionGroup: { mode: "ALL", conditions: [{ fieldKey: "mail", operator: "equals", value: "Yes" }] } })) };
function Fixture() {
  const [workflow, setWorkflow] = useState(initial), [saved, setSaved] = useState("");
  const context = createTrackerEmailContext({ entry: { clientId: "BO", _id: "entry-BO" }, client: { clientId: "BO", companyName: "Shared & Sons", category: "Brand Owner", state: "Delhi" }, fields, values: { mail: true, sale: false, amount: 0, due: "2026-10-22", tags: ["Purchase", "Certificate"] }, financialYear: "2025-26", trackerName: "Migration", workflowName: workflow.name });
  const rendered = renderTrackerEmail(workflow, context);
  (window as any).emailContextFixture = { workflow, rendered };
  return <><nav className="fixture-tools"><button onClick={() => setSaved(JSON.stringify(workflow))}>Save fixture</button><button onClick={() => setWorkflow(JSON.parse(saved))}>Reopen fixture</button><button onClick={() => document.documentElement.classList.toggle("dark")}>Theme</button></nav>
    <main className="tracker-modal tracker-email-modal tracker-email-editor-stage is-workflow-editing">
      <Workspace mode="combinations" rules={workflow.contentRules || []} fields={fields} variables={emailEditorVariables(fields)} reduced={window.matchMedia('(prefers-reduced-motion: reduce)').matches}
        matchingMode={workflow.combinationMatchingMode} onMatchingMode={mode => setWorkflow(current => ({ ...current, combinationMatchingMode: mode }))}
        onAdd={type => { const id = `new-${Date.now()}`; setWorkflow(current => ({ ...current, contentRules: [...current.contentRules!, { ...initial.contentRules![0], id, type, content: "" }] })); return id; }}
        onUpdate={(id, patch) => setWorkflow(current => ({ ...current, contentRules: current.contentRules!.map(rule => rule.id === id ? { ...rule, ...(typeof patch === "function" ? patch(rule) : patch) } : rule) }))}
        onRemove={id => setWorkflow(current => ({ ...current, contentRules: current.contentRules!.filter(rule => rule.id !== id) }))}
        onMove={() => {}} onPreview={() => {}} valuesForField={emailConditionValues} operatorsForField={emailConditionOperators} />
      <output data-testid="resolved-message">{rendered.body}</output>
    </main></>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);

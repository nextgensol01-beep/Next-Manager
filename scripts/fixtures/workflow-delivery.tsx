import React, { useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Workspace from "../../components/client-trackers/WorkflowDeliveryWorkspace";
import Modal from "../../components/client-trackers/TrackerModal";
import { WorkflowStepContentStage } from "../../components/client-trackers/WorkflowStepNavigation";
import type { TrackerEmailWorkflow } from "../../lib/clientTrackers";

const initial: TrackerEmailWorkflow = { id: "test", name: "Document request", mainFieldKey: "done", mainValue: "Yes", subject: "Documents for {{client.companyName}}", body: "<p>Please share your documents for {{tracker.financialYear}}.</p>", points: [] };
const fields = [{ key: "done", label: "Purchase Upload", type: "toggle" as const }, { key: "note", label: "Client note", type: "text" as const }];
const documents = [
  { _id: "pdf", clientId: "C001", documentName: "Invoice-format.pdf", mimeType: "application/pdf", fileSize: 842 * 1024 },
  { _id: "xlsx", clientId: "C002", documentName: "Purchase-data.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileSize: Math.round(1.2 * 1024 * 1024) },
  { _id: "large", clientId: "C003", documentName: "Large-report.pdf", mimeType: "application/pdf", fileSize: 9 * 1024 * 1024 },
];
const variables = [{ label: "Client company", token: "{{client.companyName}}" }, { label: "Financial year", token: "{{tracker.financialYear}}" }, { label: "Matching points", token: "{{points}}" }, { label: "Purchase Upload", token: "{{column.done}}" }];
function Fixture() {
  const [workflow, setWorkflow] = useState(initial), [saved, setSaved] = useState(""), [epoch, setEpoch] = useState(0), [visible, setVisible] = useState(true), [noDocuments, setNoDocuments] = useState(false);
  const sequence = useRef(0);
  const modal = new URLSearchParams(location.search).has("modal");
  const [stagePage, setStagePage] = useState(5);
  (window as any).navigateStage = setStagePage;
  const editorRef = useRef<HTMLElement>(null);
  const updateCompactness = useCallback((value: number) => {
    editorRef.current?.style.setProperty("--workflow-header-progress", String(value));
    editorRef.current?.style.setProperty("--workflow-summary-height", `${88 - 56 * value}px`);
  }, []);
  (window as any).readWorkflow = () => workflow;
  const workspace = visible && <Workspace key={epoch} workflow={workflow} fields={fields} managedDocuments={noDocuments ? [] : documents} variables={variables}
    onChange={patch => setWorkflow(value => ({ ...value, ...patch }))}
    onAddAttachment={() => { const id = `attachment-${++sequence.current}`; setWorkflow(value => ({ ...value, attachments: [...value.attachments || [], { id, source: "client_latest", category: "certificates", documentKind: "general", financialYear: "tracker" }] })); return id; }}
    onUpdateAttachment={(id, patch) => setWorkflow(value => ({ ...value, attachments: (value.attachments || []).map(item => item.id === id ? { ...item, ...patch } : item) }))}
    onRemoveAttachment={id => setWorkflow(value => ({ ...value, attachments: (value.attachments || []).filter(item => item.id !== id) }))}
    valuesForField={field => field?.type === "toggle" ? ["Yes", "No"] : field?.options || []}
    operatorsForField={field => [{ value: "equals", label: "equals" }, { value: "not_equals", label: "does not equal" }, { value: "is_empty", label: "is empty" }, { value: "is_not_empty", label: "is not empty" }, ...field?.type === "text" ? [{ value: "contains" as const, label: "contains" }] : []]} />;
  return <>
    <nav className="fixture-tools" aria-label="Test controls">
      <button onClick={() => { setWorkflow(initial); setEpoch(value => value + 1); }}>Reset</button>
      <button onClick={() => setSaved(JSON.stringify(workflow))}>Save</button>
      <button onClick={() => { setWorkflow(JSON.parse(saved)); setEpoch(value => value + 1); }}>Reopen</button>
      <button onClick={() => setVisible(value => !value)}>Toggle step</button>
      <button onClick={() => setNoDocuments(value => !value)}>Toggle documents</button>
    </nav>
    {modal ? <Modal open onClose={() => {}} title="Email updates" size="2xl" fixedHeight scrollable={false}
      className="tracker-email-modal is-workflow-editing" footer={<footer className="tracker-email-footer"><button type="button">Save workflow</button></footer>}>
      <div className="tracker-email-workspace is-editing h-full min-h-0 p-5 overflow-hidden flex flex-col"><section ref={editorRef} className="tracker-email-editor h-full min-h-0">
        <header className="tracker-email-sticky-header"><div className="tracker-email-workflow-summary"><h3>Document request</h3></div><div style={{ height: 90 }}>Delivery</div></header>
        <WorkflowStepContentStage page={stagePage} direction={1} reduceMotion={false} title="Delivery" focusOnEntry={stagePage !== 5} navigation={null} onCompactnessChange={value => updateCompactness(value)}>{workspace}</WorkflowStepContentStage>
      </section></div>
    </Modal> : <main className="tracker-modal tracker-email-modal tracker-email-editor-stage is-workflow-editing">{workspace}</main>}
  </>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Fixture /></React.StrictMode>);

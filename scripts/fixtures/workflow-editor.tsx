import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import Workspace from "../../components/client-trackers/WorkflowMessagesWorkspace";
import type { TrackerEmailContentRule, TrackerEmailWorkflow } from "../../lib/clientTrackers";

const fields = [{ key: "done", label: "Done or Not", type: "toggle" as const }];
const initial: TrackerEmailContentRule[] = ["point", "statement", "combination", "combination"].map((type, index) => ({
  id: `rule-${index}`, type: type as TrackerEmailContentRule["type"], order: index,
  content: index === 3 ? "<p>Second scenario</p>" : "<p>First paragraph.</p><p>Hello world, second paragraph.</p><p>Third paragraph.</p>",
  conditionGroup: { mode: "ALL", conditions: [{ fieldKey: "done", operator: "equals", value: "Yes" }] },
}));
const variables = [
  { label: "Client company", token: "{{client.companyName}}" },
  { label: "Client ID", token: "{{client.clientId}}" },
  { label: "Category", token: "{{client.category}}" },
  { label: "State", token: "{{client.state}}" },
  { label: "GST number", token: "{{client.gstNumber}}" },
  { label: "Financial year", token: "{{tracker.financialYear}}" },
  { label: "Workflow name", token: "{{workflow.name}}" },
  { label: "Combination message", token: "{{combinationMessage}}" },
  { label: "Matching points", token: "{{points}}" },
  { label: "Matching statements", token: "{{statements}}" },
  { label: "Tracker name", token: "{{tracker.name}}" },
  { label: "Done or Not", token: "{{column.done}}" },
];

function Fixture() {
  const [mode, setMode] = useState<NonNullable<TrackerEmailWorkflow["contentMode"]>>("points");
  const [rules, setRules] = useState(initial);
  const [messages, setMessages] = useState(true);
  const [epoch, setEpoch] = useState(0);
  const [saved, setSaved] = useState("");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const type = mode === "points" ? "point" : mode === "statements" ? "statement" : "combination";
  (window as any).readRules = () => rules;
  (window as any).readVisibleRules = () => rules.filter(rule => rule.type === type);
  return <>
    <nav className="fixture-tools" aria-label="Test controls">
      {(["points", "statements", "combinations"] as const).map(value => <button key={value} onClick={() => setMode(value)}>{value}</button>)}
      <button onClick={() => setMessages(current => !current)}>Toggle step</button>
      <button onClick={() => { setRules(initial); setEpoch(current => current + 1); }}>Reset</button>
      <button onClick={() => setSaved(JSON.stringify(rules))}>Save</button>
      <button onClick={() => { setRules(current => current.map(rule => rule.type === type ? { ...rule, content: "" } : rule)); setEpoch(current => current + 1); }}>Empty</button>
      <button onClick={() => { setRules(current => current.map(rule => rule.type === type ? { ...rule, content: "<p>Hello {{client.companyName}}, your status is <strong>{{column.done}}</strong>.</p>" } : rule)); setEpoch(current => current + 1); }}>Load legacy</button>
      <button onClick={() => { setRules(JSON.parse(saved)); setEpoch(current => current + 1); }}>Reopen</button>
    </nav>
    <main className="tracker-modal tracker-email-modal tracker-email-editor-stage is-workflow-editing">
      {messages ? <Workspace key={`${epoch}-${mode}`} mode={mode} rules={rules.filter(rule => rule.type === type)} fields={fields} variables={variables} reduced={reduced}
        onAdd={ruleType => { const id = `new-${Date.now()}`; setRules(current => [...current, { ...initial[0], id, type: ruleType, content: "" }]); return id; }}
        onUpdate={(id, patch) => setRules(current => current.map(rule => rule.id === id ? { ...rule, ...(typeof patch === "function" ? patch(rule) : patch) } : rule))}
        onRemove={id => setRules(current => current.filter(rule => rule.id !== id))}
        onMove={(id, direction) => setRules(current => { const next = [...current]; const index = next.findIndex(rule => rule.id === id); [next[index], next[index + direction]] = [next[index + direction], next[index]]; return next; })}
        onPreview={() => {}} valuesForField={() => ["Yes", "No"]} operatorsForField={() => [{ value: "equals", label: "equals" }, { value: "is_empty", label: "is empty" }]} /> : <p>Another workflow step</p>}
    </main>
  </>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Fixture /></React.StrictMode>);

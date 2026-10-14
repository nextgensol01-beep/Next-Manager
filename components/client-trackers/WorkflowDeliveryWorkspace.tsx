"use client";

import React, { useId, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useIsPresent, useReducedMotion } from "framer-motion";
import { Mail, AlignVerticalSpaceAround, Clock3, Reply, Paperclip, Plus, X, ChevronDown, FileText, FileSpreadsheet, File, Copy } from "lucide-react";
import LiquidGlassDropdown from "@/components/ui/LiquidGlassDropdown";
import { GlassToggle } from "@/components/ui/liquid-glass/GlassToggle";
import RichTextEditor, { type EmailEditorVariable } from "./TrackerRichTextEditor";
import type { TrackerEmailWorkflow, TrackerEmailAttachment, TrackerField, TrackerRuleOperator, TrackerRecipientStrategy } from "@/lib/clientTrackers";

type ManagedDocument = { _id: string; clientId: string; documentName: string; mimeType?: string; fileSize?: number };
type Option = { label: string; value: string };
const recipients = [
  { value: "selected", label: "Client-profile selected email", description: "Uses the email selected on each client profile." },
  { value: "primary", label: "Primary linked contact", description: "Uses each client’s primary linked contact." },
  { value: "all", label: "All linked contacts", description: "Includes all contacts linked to each client." },
  { value: "per_client", label: "Review each client before delivery", description: "Choose recipients for each client in the delivery preview." },
];
const categories: Option[] = [{ value: "", label: "Any category" }, ...["compliance", "financial", "invoices", "certificates", "other"].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))];
const kinds = [{ value: "", label: "Any type" }, { value: "general", label: "General document" }, { value: "epr-certificate", label: "EPR certificate" }];
const years = [{ value: "tracker", label: "This tracker’s FY" }, { value: "any", label: "Any financial year" }];
const sources = [{ value: "shared", label: "One shared document for every client" }, { value: "client_latest", label: "Newest matching document for each client" }];
const ease = [.22, 1, .36, 1] as const;
const fileSize = (bytes?: number) => bytes == null ? "" : bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function DeliverySelect({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  return <div className="delivery-field"><span>{label}</span><LiquidGlassDropdown label={label} value={value} options={options} onChange={onChange} portal variant="condition" /></div>;
}

// Keep the live reminder document mounted when folded, preserving its history.
function DeliveryPanel({ open, id, reduced, children }: { open: boolean; id: string; reduced: boolean; children: React.ReactNode }) {
  return <motion.div id={id} className="delivery-panel" inert={!open} aria-hidden={!open} initial={false}
    animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0, y: open || reduced ? 0 : -5, filter: open || reduced ? "blur(0px)" : "blur(2px)" }}
    transition={{ height: { duration: reduced ? 0 : .28, delay: open && !reduced ? .1 : 0, ease }, opacity: { duration: reduced ? .01 : .18, delay: open && !reduced ? .14 : 0 }, y: { duration: reduced ? 0 : .26, ease }, filter: { duration: reduced ? 0 : .22 } }}>
    <div className="delivery-panel-inner">{children}</div>
  </motion.div>;
}

function AttachmentRow({ children, reduced }: { children: React.ReactNode; reduced: boolean }) {
  const present = useIsPresent();
  return <motion.article className="delivery-file-row" inert={!present} aria-hidden={!present}
    initial={{ height: 0, opacity: 0, y: reduced ? 0 : -5, filter: reduced ? "blur(0px)" : "blur(2px)" }}
    animate={{ height: "auto", opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
    exit={{ height: 0, opacity: 0, scale: reduced ? 1 : .985, filter: reduced ? "blur(0px)" : "blur(2px)" }}
    transition={{ duration: reduced ? .01 : .26, ease }}>{children}</motion.article>;
}

export default function WorkflowDeliveryWorkspace({ workflow, fields, managedDocuments, variables, onChange, onAddAttachment, onUpdateAttachment, onRemoveAttachment, valuesForField, operatorsForField }: {
  workflow: TrackerEmailWorkflow; fields: TrackerField[]; managedDocuments: ManagedDocument[]; variables: EmailEditorVariable[];
  onChange: (patch: Partial<TrackerEmailWorkflow>) => void;
  onAddAttachment: () => string; onUpdateAttachment: (id: string, patch: Partial<TrackerEmailAttachment>) => void; onRemoveAttachment: (id: string) => void;
  valuesForField: (field?: TrackerField) => string[]; operatorsForField: (field?: TrackerField) => { value: TrackerRuleOperator; label: string }[];
}) {
  const id = useId(), reduced = Boolean(useReducedMotion()), workspace = useRef<HTMLDivElement>(null);
  const [reminderOpen, setReminderOpen] = useState(Boolean(workflow.reminderSubject || workflow.reminderBody));
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const attachments = workflow.attachments || [], followUp = workflow.followUp?.enabled === true;
  const recipient = recipients.find(option => option.value === (workflow.recipientStrategy || "selected")) || recipients[0];
  const spacing = workflow.signatureGap ?? 2;
  const stopEntry = () => workspace.current?.classList.add("is-interacting");
  const chooseSpacing = (value: number) => { onChange({ signatureGap: value }); };

  return <div ref={workspace} className="workflow-delivery-workspace" onPointerDownCapture={stopEntry} onKeyDownCapture={stopEntry}>
    <section className="delivery-details" aria-labelledby={`${id}-details`}>
      <h3 id={`${id}-details`}>Delivery details</h3>
      <div className="delivery-recipient"><span className="delivery-label">Send to</span>
        <LiquidGlassDropdown label="Send to" value={recipient.value} options={recipients} description={recipient.description} icon={<Mail size={20} />}
          onChange={value => onChange({ recipientStrategy: value as TrackerRecipientStrategy })} portal variant="condition" />
      </div>
      <div className="delivery-signature">
        <div className="delivery-signature-heading"><AlignVerticalSpaceAround size={15} aria-hidden="true" /><span className="delivery-label" id={`${id}-signature`}>Signature spacing</span></div>
        <p>Blank lines before your Gmail signature.</p>
        <LayoutGroup id={`${id}-spacing`}><div className="delivery-spacing" role="radiogroup" aria-labelledby={`${id}-signature`}
          onKeyDown={event => {
            const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
            if (!direction && !["Home", "End"].includes(event.key)) return;
            event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? 6 : (spacing + direction + 7) % 7;
            chooseSpacing(next); event.currentTarget.querySelector<HTMLButtonElement>(`[data-gap="${next}"]`)?.focus({ preventScroll: true });
          }}>
          {[0, 1, 2, 3, 4, 5, 6].map(gap => <motion.button key={gap} type="button" role="radio" aria-checked={spacing === gap}
            aria-label={gap === 0 ? "No blank line" : `${gap} blank ${gap === 1 ? "line" : "lines"}`} data-gap={gap} tabIndex={spacing === gap ? 0 : -1}
            onClick={() => chooseSpacing(gap)} whileTap={reduced ? undefined : { scale: .98 }} transition={{ duration: .08 }}>
            {spacing === gap && <motion.span className="delivery-spacing-material" layoutId="signature-spacing"
              transition={{ duration: reduced ? 0 : .25, ease }} />}
            <span className="delivery-spacing-name">{gap === 0 ? "None" : <>{gap}<span className="delivery-spacing-unit"> {gap === 1 ? "line" : "lines"}</span></>}</span>
          </motion.button>)}
        </div></LayoutGroup>
      </div>
    </section>

    <section className="delivery-after" aria-labelledby={`${id}-after`}>
      <h3 id={`${id}-after`}>After sending</h3>
      <div className="delivery-capability">
        <div className="delivery-capability-heading"><Clock3 size={18} aria-hidden="true" /><div><h4>Reminder email</h4><p>Send manually when needed. Clients who replied are excluded.</p></div>
          <button type="button" className="delivery-configure" aria-expanded={reminderOpen} aria-controls={`${id}-reminder`}
            aria-label={reminderOpen ? "Close reminder configuration" : "Configure reminder email"} onClick={() => setReminderOpen(open => !open)}>
            <span>{reminderOpen ? "Close" : "Configure"}</span><ChevronDown size={14} /></button>
        </div>
        <DeliveryPanel id={`${id}-reminder`} open={reminderOpen} reduced={reduced}>
          <p className="delivery-config-helper">An empty subject or message uses the initial email. Reminders are never sent automatically.</p>
          <div className="delivery-reminder-label"><span id={`${id}-reminder-subject`} className="delivery-label">Reminder subject</span>
            <button type="button" className="delivery-copy" onClick={() => onChange({ reminderSubject: workflow.subject, reminderBody: workflow.body })}><Copy size={13} />Copy initial email</button></div>
          <RichTextEditor singleLine value={workflow.reminderSubject || ""} variables={variables} label="Reminder subject" labelledBy={`${id}-reminder-subject`}
            onChange={reminderSubject => onChange({ reminderSubject })} placeholder="Uses the initial subject if empty…" />
          <span className="delivery-label delivery-reminder-message" id={`${id}-reminder-message`}>Reminder message</span>
          <RichTextEditor value={workflow.reminderBody || ""} variables={variables} label="Reminder email body" labelledBy={`${id}-reminder-message`}
            onChange={reminderBody => onChange({ reminderBody })} placeholder="Uses the initial message if empty…" />
        </DeliveryPanel>
      </div>
      <div className="delivery-capability">
        <div className="delivery-capability-heading"><Reply size={18} aria-hidden="true" /><div><h4 id={`${id}-followup-title`}>No-reply follow-up</h4><p id={`${id}-followup-help`}>Create a task if a client hasn’t replied. No automatic email.</p></div>
          <div className={`delivery-capability-state${followUp ? " is-on" : ""}`}><span aria-hidden="true">{followUp ? "On" : "Off"}</span>
            <GlassToggle checked={followUp} aria-label="Create a no-reply follow-up task" aria-describedby={`${id}-followup-help`}
              aria-expanded={followUp} aria-controls={`${id}-followup`} className="tracker-email-switch" thumbClassName="tracker-email-switch-thumb"
              onCheckedChange={enabled => onChange({ followUp: { enabled, daysAfter: workflow.followUp?.daysAfter || 3, ownerEmail: workflow.followUp?.ownerEmail } })} />
          </div>
        </div>
        <DeliveryPanel id={`${id}-followup`} open={followUp} reduced={reduced}>
          <p className="delivery-config-helper">Created after the initial email is sent; completed when a client reply is synced.</p>
          <div className="delivery-followup-fields">
            <label className="delivery-field"><span>Follow up after</span><span className="delivery-days"><input type="number" min="1" max="90" aria-label="Follow up after, days" value={workflow.followUp?.daysAfter ?? 3}
              onChange={event => onChange({ followUp: { ...workflow.followUp!, daysAfter: Number(event.target.value) || 1 } })} /><span>days</span></span></label>
            <label className="delivery-field"><span>Task owner <span className="delivery-optional">Optional</span></span><input type="text" inputMode="email" value={workflow.followUp?.ownerEmail || ""}
              onChange={event => onChange({ followUp: { ...workflow.followUp!, ownerEmail: event.target.value } })} placeholder="Owner email" /></label>
          </div>
        </DeliveryPanel>
      </div>
    </section>

    <section className="delivery-attachments" aria-labelledby={`${id}-files`}>
      <div className="delivery-attachments-heading"><h3 id={`${id}-files`}>Attachments</h3><button type="button" className="delivery-add" disabled={attachments.length >= 4}
        onClick={() => setExpandedFile(onAddAttachment())}><Plus size={15} />Add files</button></div>
      <p className="delivery-attachments-helper">Managed Google Drive documents · Up to 4 files, 8 MB each.</p>
      {!attachments.length && <div className="delivery-no-files"><Paperclip size={17} aria-hidden="true" /><span>No files attached</span></div>}
      <div className="delivery-files"><AnimatePresence initial={false}>
        {attachments.map((attachment, index) => {
          const source = attachment.source || "client_latest", document = source === "shared" ? managedDocuments.find(item => item._id === attachment.documentId) : undefined;
          const title = source === "shared" ? document?.documentName || "Choose a shared document" : "Newest matching document";
          const detail = source === "shared" ? ["Shared with every client", fileSize(document?.fileSize)].filter(Boolean).join(" · ") : [categories.find(item => item.value === (attachment.category || ""))?.label, kinds.find(item => item.value === (attachment.documentKind || ""))?.label, years.find(item => item.value === (attachment.financialYear || "tracker"))?.label].filter(Boolean).join(" · ");
          const Icon = document?.mimeType?.includes("pdf") ? FileText : document?.mimeType?.match(/spreadsheet|excel/) ? FileSpreadsheet : File;
          const condition = attachment.conditionGroup?.conditions[0], field = fields.find(item => item.key === condition?.fieldKey), values = valuesForField(field);
          const needsValue = !["is_empty", "is_not_empty"].includes(condition?.operator || "equals"), open = expandedFile === attachment.id;
          const update = (patch: Partial<TrackerEmailAttachment>) => onUpdateAttachment(attachment.id, patch);
          return <AttachmentRow key={attachment.id} reduced={reduced}>
            <div className="delivery-file-heading"><Icon size={19} aria-hidden="true" /><div className="delivery-file-copy"><strong>{title}</strong><span>{detail}{condition ? " · Conditional" : ""}</span></div>
              <button type="button" className="delivery-file-edit" aria-label={`Configure attachment ${index + 1}`} aria-expanded={open} aria-controls={`${id}-file-${attachment.id}`}
                onClick={() => setExpandedFile(open ? null : attachment.id)}><ChevronDown size={15} /></button>
              <button type="button" className="delivery-file-remove" aria-label={`Remove attachment ${index + 1}`} onClick={() => onRemoveAttachment(attachment.id)}><X size={15} /></button>
            </div>
            {document?.fileSize != null && document.fileSize > 8 * 1024 * 1024 && <p className="delivery-file-error" role="alert">This file exceeds the 8 MB attachment limit.</p>}
            <DeliveryPanel id={`${id}-file-${attachment.id}`} open={open} reduced={reduced}>
              <DeliverySelect label={`Attachment ${index + 1} type`} value={source} options={sources} onChange={value => update({ source: value as "shared" | "client_latest", documentId: undefined })} />
              {source === "shared" ? <>
                <DeliverySelect label={`Attachment ${index + 1} shared document`} value={attachment.documentId || ""} options={[{ value: "", label: "Choose a document" }, ...managedDocuments.map(item => ({ value: item._id, label: `${item.documentName} · ${item.clientId}` }))]}
                  onChange={value => update({ documentId: value || undefined })} />
                {!managedDocuments.length && <p className="delivery-file-warning">No managed Google Drive documents are available yet.</p>}
              </> : <div className="delivery-file-filters">
                <DeliverySelect label={`Attachment ${index + 1} category`} value={attachment.category || ""} options={categories} onChange={value => update({ category: value as TrackerEmailAttachment["category"] || undefined })} />
                <DeliverySelect label={`Attachment ${index + 1} document type`} value={attachment.documentKind || ""} options={kinds} onChange={value => update({ documentKind: value as TrackerEmailAttachment["documentKind"] || undefined })} />
                <DeliverySelect label={`Attachment ${index + 1} financial year`} value={attachment.financialYear || "tracker"} options={years} onChange={value => update({ financialYear: value as "tracker" | "any" })} />
              </div>}
              <label className="delivery-condition-toggle"><input type="checkbox" checked={Boolean(attachment.conditionGroup)} onChange={event => update({ conditionGroup: event.target.checked ? { mode: "ALL", conditions: [{ fieldKey: fields[0]?.key || workflow.mainFieldKey, operator: "equals", value: "" }] } : undefined })} />Attach only when a tracker condition matches</label>
              {condition && <div className="delivery-file-filters">
                <DeliverySelect label={`Attachment ${index + 1} condition column`} value={condition.fieldKey} options={fields.map(item => ({ value: item.key, label: item.label }))}
                  onChange={value => update({ conditionGroup: { mode: "ALL", conditions: [{ fieldKey: value, operator: "equals", value: "" }] } })} />
                <DeliverySelect label={`Attachment ${index + 1} condition operator`} value={condition.operator} options={operatorsForField(field)} onChange={value => update({ conditionGroup: { mode: "ALL", conditions: [{ ...condition, operator: value as TrackerRuleOperator }] } })} />
                {needsValue ? values.length ? <DeliverySelect label={`Attachment ${index + 1} condition value`} value={String(condition.value || "")} options={[{ value: "", label: "Choose value" }, ...values.map(value => ({ value, label: value }))]}
                  onChange={value => update({ conditionGroup: { mode: "ALL", conditions: [{ ...condition, value }] } })} /> : <label className="delivery-field"><span>Condition value</span><input value={String(condition.value || "")} onChange={event => update({ conditionGroup: { mode: "ALL", conditions: [{ ...condition, value: event.target.value }] } })} placeholder="Value" /></label> : <span className="delivery-no-value">No value needed</span>}
              </div>}
            </DeliveryPanel>
          </AttachmentRow>;
        })}
      </AnimatePresence></div>
    </section>
  </div>;
}

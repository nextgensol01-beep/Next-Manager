"use client";

import React from "react";
import { Plus, Send, Users } from "lucide-react";
import { formatCurrency, FINANCIAL_YEARS, PAYMENT_MODES, STATES, CATEGORIES } from "@/lib/utils";
import { CategoryBreakdown } from "@/components/ui/CategoryBreakdown";
import Modal from "@/components/ui/Modal";
import {
  CAT_IDS,
  CATS,
  CREDIT_TYPES,
  PersonEntryCard,
  type Client,
  type EmailOption,
  type FYEntryForm,
  type FYRecord,
  type PersonEntry,
} from "./ClientProfileSupport";

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

type DocForm = { documentName: string; driveLink: string };
type BillingForm = {
  financialYear: string;
  govtCharges: string;
  consultancyCharges: string;
  targetCharges: string;
  otherCharges: string;
  notes: string;
};
type PaymentForm = {
  financialYear: string;
  amountPaid: string;
  paymentDate: string;
  paymentMode: string;
  paymentType: "billing" | "advance";
  referenceNumber: string;
  notes: string;
};
type FyForm = {
  financialYear: string;
  generated: FYEntryForm[];
  targets: FYEntryForm[];
};
type ReminderForm = { subject: string; message: string };
type EditForm = {
  companyName: string;
  category: string;
  state: string;
  address: string;
  gstNumber: string;
  registrationNumber: string;
  cpcbLoginId: string;
  cpcbPassword: string;
  otpMobileNumber: string;
};
type BreakdownProps = {
  entries?: Array<{ categoryId: string; type: "RECYCLING" | "EOL"; value: number }>;
  achievedMap?: Record<string, number>;
  rows?: Array<{ label: string; base: number; used: number }>;
};

interface ClientProfileModalsProps {
  client: Client;
  isPWP: boolean;
  isSIMP: boolean;
  docModal: boolean;
  docModalMode: "create" | "edit";
  docForm: DocForm;
  setDocForm: SetState<DocForm>;
  closeDocumentModal: () => void;
  saveDocument: (event: React.FormEvent) => void;
  fyModal: boolean;
  fyForm: FyForm;
  setFyForm: SetState<FyForm>;
  closeFyModal: () => void;
  saveFY: (event: React.FormEvent) => void;
  updateFyEntry: (section: "generated" | "targets", categoryId: string, type: "RECYCLING" | "EOL", value: string) => void;
  fyGeneratedTotal: number;
  fyTargetTotal: number;
  fyData: FYRecord | undefined;
  reminderModal: boolean;
  closeReminderModal: () => void;
  sendReminder: (event: React.FormEvent) => void;
  reminderRecipients: EmailOption[];
  reminderSuggestions: EmailOption[];
  removeReminderRecipient: (email: string) => void;
  addSuggestedReminderRecipient: (option: EmailOption) => void;
  customReminderEmail: string;
  setCustomReminderEmail: (value: string) => void;
  addCustomReminderEmail: () => void;
  reminderForm: ReminderForm;
  setReminderForm: SetState<ReminderForm>;
  reminderPreviewHtml: string | null;
  reminderSending: boolean;
  billingModal: boolean;
  closeBillingModal: () => void;
  editingBillingId: string | null;
  saveBilling: (event: React.FormEvent) => void;
  billingForm: BillingForm;
  setBillingForm: SetState<BillingForm>;
  billingFormTotal: number;
  paymentModal: boolean;
  closePaymentModal: () => void;
  editingPaymentId: string | null;
  savePayment: (event: React.FormEvent) => void;
  paymentForm: PaymentForm;
  setPaymentForm: SetState<PaymentForm>;
  breakdownRec: FYRecord | null;
  setBreakdownRec: SetState<FYRecord | null>;
  makeBreakdownProps: (record: FYRecord) => BreakdownProps;
  editModal: boolean;
  setEditModal: (open: boolean) => void;
  handleSaveClient: (event: React.FormEvent) => void;
  editTab: "basic" | "portal";
  setEditTab: (tab: "basic" | "portal") => void;
  editForm: EditForm;
  setEditForm: SetState<EditForm>;
  persons: PersonEntry[];
  addPerson: () => void;
  updatePerson: (index: number, updated: PersonEntry) => void;
  removePerson: (index: number) => void;
  setPrimary: (index: number) => void;
  showEditPassword: boolean;
  setShowEditPassword: (show: boolean) => void;
  saving: boolean;
  inlineSaving: boolean;
}

export default function ClientProfileModals({
  client,
  isPWP,
  isSIMP,
  docModal,
  docModalMode,
  docForm,
  setDocForm,
  closeDocumentModal,
  saveDocument,
  fyModal,
  fyForm,
  setFyForm,
  closeFyModal,
  saveFY,
  updateFyEntry,
  fyGeneratedTotal,
  fyTargetTotal,
  fyData,
  reminderModal,
  closeReminderModal,
  sendReminder,
  reminderRecipients,
  reminderSuggestions,
  removeReminderRecipient,
  addSuggestedReminderRecipient,
  customReminderEmail,
  setCustomReminderEmail,
  addCustomReminderEmail,
  reminderForm,
  setReminderForm,
  reminderPreviewHtml,
  reminderSending,
  billingModal,
  closeBillingModal,
  editingBillingId,
  saveBilling,
  billingForm,
  setBillingForm,
  billingFormTotal,
  paymentModal,
  closePaymentModal,
  editingPaymentId,
  savePayment,
  paymentForm,
  setPaymentForm,
  breakdownRec,
  setBreakdownRec,
  makeBreakdownProps,
  editModal,
  setEditModal,
  handleSaveClient,
  editTab,
  setEditTab,
  editForm,
  setEditForm,
  persons,
  addPerson,
  updatePerson,
  removePerson,
  setPrimary,
  showEditPassword,
  setShowEditPassword,
  saving,
  inlineSaving,
}: ClientProfileModalsProps) {
  return (
    <>
      <Modal open={docModal} onClose={closeDocumentModal} title={docModalMode === "edit" ? "Edit Document" : "Add Document"}>
        <form onSubmit={saveDocument} className="space-y-4">
          <div><label className="label">Document Name *</label><input className="input-field" value={docForm.documentName} onChange={(e) => setDocForm({ ...docForm, documentName: e.target.value })} required placeholder="e.g. Registration Certificate" /></div>
          <div><label className="label">Google Drive Link *</label><input className="input-field" type="url" value={docForm.driveLink} onChange={(e) => setDocForm({ ...docForm, driveLink: e.target.value })} required placeholder="https://drive.google.com/..." /></div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={inlineSaving}>{inlineSaving ? "Saving..." : docModalMode === "edit" ? "Save Changes" : "Add Document"}</button>
            <button type="button" className="btn-secondary" onClick={closeDocumentModal}>Cancel</button>
          </div>
        </form>
      </Modal>

      {!isSIMP && (
        <Modal open={fyModal} onClose={closeFyModal} title={isPWP ? "Manage Credit Data" : "Manage FY Data"} size="lg">
          <form onSubmit={saveFY} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Client</label>
                <div className="input-field bg-surface text-muted flex items-center">{client.companyName}</div>
              </div>
              <div>
                <label className="label">Financial Year *</label>
                <select className="input-field" value={fyForm.financialYear} onChange={(e) => setFyForm((current) => ({ ...current, financialYear: e.target.value }))} required>
                  {FINANCIAL_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </div>
            </div>

            <div className="rounded-xl border border-base overflow-hidden">
              <div className="px-4 py-3 border-b border-base bg-surface">
                <p className="font-semibold text-default">{isPWP ? "Generated Credits" : "Target Entries"}</p>
                <p className="text-xs text-faint mt-1">
                  {isPWP
                    ? "Enter generated credits for each category and type."
                    : "Enter target quantities for each category and type."}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="bg-surface border-b border-base">
                      <th className="text-left text-xs text-muted font-semibold px-4 py-2.5">Category</th>
                      {CREDIT_TYPES.map((type) => (
                        <th key={type} className="text-left text-xs text-muted font-semibold px-4 py-2.5">{type === "RECYCLING" ? "Recycling" : "EOL"}</th>
                      ))}
                      <th className="text-right text-xs text-muted font-semibold px-4 py-2.5">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CAT_IDS.map((categoryId, index) => {
                      const section = isPWP ? fyForm.generated : fyForm.targets;
                      const rowEntries = section.filter((entry) => entry.categoryId === categoryId);
                      const rowTotal = rowEntries.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0);
                      return (
                        <tr key={categoryId} className="border-b border-base last:border-0">
                          <td className="px-4 py-3 font-medium text-default">{CATS[index]}</td>
                          {CREDIT_TYPES.map((type) => {
                            const entry = section.find((item) => item.categoryId === categoryId && item.type === type);
                            return (
                              <td key={type} className="px-4 py-3">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="input-field"
                                  value={entry?.value || ""}
                                  onChange={(e) => updateFyEntry(isPWP ? "generated" : "targets", categoryId, type, e.target.value)}
                                  placeholder="0"
                                />
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-right font-semibold text-default">{rowTotal.toLocaleString("en-IN")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-surface rounded-xl p-3 border border-base">
                <p className="text-xs text-muted">{isPWP ? "Total Generated" : "Total Target"}</p>
                <p className="text-lg font-bold text-default">{(isPWP ? fyGeneratedTotal : fyTargetTotal).toLocaleString("en-IN")}</p>
              </div>
              {fyData && (
                <div className="bg-surface rounded-xl p-3 border border-base">
                  <p className="text-xs text-muted">{isPWP ? "Already Sold" : "Already Achieved"}</p>
                  <p className="text-lg font-bold text-default">{((isPWP ? fyData.totalSold : fyData.totalAchieved) || 0).toLocaleString("en-IN")}</p>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button type="submit" className="btn-primary flex-1 justify-center" disabled={inlineSaving}>
                {inlineSaving ? "Saving..." : isPWP ? "Save Credit Data" : "Save FY Data"}
              </button>
              <button type="button" className="btn-secondary" onClick={closeFyModal}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      <Modal open={reminderModal} onClose={closeReminderModal} title="Send Payment Reminder" size="lg">
        <form onSubmit={sendReminder} className="space-y-4">
          <div>
            <label className="label">Recipients *</label>
            <div className={`min-h-[44px] w-full rounded-lg border px-3 py-2 flex flex-wrap gap-2 items-center transition-colors ${reminderRecipients.length === 0 ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10" : "border-base bg-card"}`}>
              {reminderRecipients.map((recipient) => (
                <span key={recipient.email} className="flex items-center gap-1.5 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 text-xs font-medium px-2.5 py-1 rounded-full">
                  <span className="max-w-[200px] truncate" title={recipient.email}>
                    {recipient.label !== recipient.email ? <><span className="font-semibold">{recipient.label}</span><span className="opacity-60 ml-1">- {recipient.email}</span></> : recipient.email}
                  </span>
                  <button type="button" onClick={() => removeReminderRecipient(recipient.email)} className="text-brand-400 hover:text-red-500 transition-colors ml-0.5 flex-shrink-0" title="Remove">x</button>
                </span>
              ))}
              {reminderRecipients.length === 0 && <span className="text-xs text-red-400">No recipients - add an email below</span>}
            </div>
            <p className="text-xs text-faint mt-1">Auto-filled from the selected emails on linked contacts. You can still add manual recipients below.</p>
          </div>

          {reminderSuggestions.length > 0 && (
            <div>
              <label className="label">Suggestions From Linked Contacts</label>
              <div className="flex flex-wrap gap-2">
                {reminderSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.email}
                    type="button"
                    onClick={() => addSuggestedReminderRecipient(suggestion)}
                    className="rounded-full border border-base px-3 py-1 text-xs text-faint transition-colors hover:border-brand-300 hover:text-brand-700 dark:hover:text-brand-300"
                  >
                    {suggestion.label !== suggestion.email ? `${suggestion.label} - ${suggestion.email}` : suggestion.email}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="label">Add Another Recipient</label>
            <div className="flex gap-2">
              <input
                type="email"
                className="input-field flex-1"
                placeholder="any.email@domain.com"
                value={customReminderEmail}
                onChange={(e) => setCustomReminderEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomReminderEmail(); } }}
              />
              <button type="button" onClick={addCustomReminderEmail} className="btn-secondary !px-3 shrink-0">+ Add</button>
            </div>
          </div>

          <div><label className="label">Subject *</label><input className="input-field" value={reminderForm.subject} onChange={(e) => setReminderForm({ ...reminderForm, subject: e.target.value })} required /></div>

          {reminderPreviewHtml ? (
            <div className="rounded-xl border border-blue-200 dark:border-blue-800 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 dark:bg-blue-900/30">
                <Send className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">Branded reminder template will be sent</p>
              </div>
              <iframe srcDoc={reminderPreviewHtml} className="w-full border-0" style={{ height: 280 }} title="Reminder Preview" />
            </div>
          ) : (
            <div><label className="label">Message *</label><textarea className="input-field" rows={6} value={reminderForm.message} onChange={(e) => setReminderForm({ ...reminderForm, message: e.target.value })} /></div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={reminderSending || reminderRecipients.length === 0}>
              <Send className="w-4 h-4" />{reminderSending ? "Sending..." : `Send to ${reminderRecipients.length} Recipient${reminderRecipients.length === 1 ? "" : "s"}`}
            </button>
            <button type="button" className="btn-secondary" onClick={closeReminderModal}>Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal open={billingModal} onClose={closeBillingModal} title={editingBillingId ? "Edit Billing" : "Create Billing"}>
        <form onSubmit={saveBilling} className="space-y-4">
          <div>
            <label className="label">Financial Year *</label>
            <select className="input-field" value={billingForm.financialYear} onChange={(e) => setBillingForm({ ...billingForm, financialYear: e.target.value })} required>
              {FINANCIAL_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="label">Govt Charges</label><input type="number" className="input-field" value={billingForm.govtCharges} onChange={(e) => setBillingForm({ ...billingForm, govtCharges: e.target.value })} min="0" step="0.01" /></div>
            <div><label className="label">Consultancy Charges</label><input type="number" className="input-field" value={billingForm.consultancyCharges} onChange={(e) => setBillingForm({ ...billingForm, consultancyCharges: e.target.value })} min="0" step="0.01" /></div>
            <div><label className="label">Target Charges</label><input type="number" className="input-field" value={billingForm.targetCharges} onChange={(e) => setBillingForm({ ...billingForm, targetCharges: e.target.value })} min="0" step="0.01" /></div>
            <div><label className="label">Other Charges</label><input type="number" className="input-field" value={billingForm.otherCharges} onChange={(e) => setBillingForm({ ...billingForm, otherCharges: e.target.value })} min="0" step="0.01" /></div>
          </div>
          <div className="bg-surface rounded-xl p-3 border border-base text-center">
            <p className="text-xs text-muted">Total Amount</p>
            <p className="text-lg font-bold text-default">{formatCurrency(billingFormTotal)}</p>
          </div>
          <div><label className="label">Notes</label><textarea className="input-field" rows={3} value={billingForm.notes} onChange={(e) => setBillingForm({ ...billingForm, notes: e.target.value })} placeholder="Optional notes about this billing" /></div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={inlineSaving}>{inlineSaving ? "Saving..." : editingBillingId ? "Save Billing" : "Create Billing"}</button>
            <button type="button" className="btn-secondary" onClick={closeBillingModal}>Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal open={paymentModal} onClose={closePaymentModal} title={editingPaymentId ? "Edit Payment" : "Record Payment"}>
        <form onSubmit={savePayment} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Payment Type *</label>
              <select className="input-field" value={paymentForm.paymentType} onChange={(e) => setPaymentForm({ ...paymentForm, paymentType: e.target.value === "advance" ? "advance" : "billing" })}>
                <option value="billing">Billing Payment</option>
                <option value="advance">Advance Payment</option>
              </select>
            </div>
            <div>
              <label className="label">Financial Year *</label>
              <select className="input-field" value={paymentForm.financialYear} onChange={(e) => setPaymentForm({ ...paymentForm, financialYear: e.target.value })} required>
                {FINANCIAL_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="label">Amount Paid *</label><input type="number" className="input-field" value={paymentForm.amountPaid} onChange={(e) => setPaymentForm({ ...paymentForm, amountPaid: e.target.value })} required min="1" step="0.01" placeholder="0.00" /></div>
            <div><label className="label">Payment Date *</label><input type="date" className="input-field" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} required /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Payment Mode *</label>
              <select className="input-field" value={paymentForm.paymentMode} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMode: e.target.value })} required>
                {PAYMENT_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
              </select>
            </div>
            <div><label className="label">Reference Number</label><input className="input-field" value={paymentForm.referenceNumber} onChange={(e) => setPaymentForm({ ...paymentForm, referenceNumber: e.target.value })} placeholder="UTR / Cheque number" /></div>
          </div>
          <div><label className="label">Notes</label><textarea className="input-field" rows={3} value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} placeholder="Optional notes about this payment" /></div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={inlineSaving}>{inlineSaving ? "Saving..." : editingPaymentId ? "Save Payment" : "Record Payment"}</button>
            <button type="button" className="btn-secondary" onClick={closePaymentModal}>Cancel</button>
          </div>
        </form>
      </Modal>

      {breakdownRec && (
        <Modal open={!!breakdownRec} onClose={() => setBreakdownRec(null)}
          title={`${client.companyName} - FY ${breakdownRec.financialYear}`} size="lg">
          {(() => {
            const breakdownProps = makeBreakdownProps(breakdownRec);
            return (
              <CategoryBreakdown
                clientType={isPWP ? "PWP" : "PIBO"}
                entries={breakdownProps.entries}
                achievedMap={breakdownProps.achievedMap}
                rows={breakdownProps.rows}
              />
            );
          })()}
        </Modal>
      )}

      <Modal open={editModal} onClose={() => setEditModal(false)} title="Edit Client" size="lg">
        <form onSubmit={handleSaveClient} className="space-y-4">
          <div className="flex gap-1 bg-surface p-1 rounded-xl">
            {(["basic", "portal"] as const).map((tab) => (
              <button key={tab} type="button" onClick={() => setEditTab(tab)}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors capitalize ${editTab === tab ? "bg-card shadow-sm text-brand-700 dark:text-brand-400" : "text-faint hover:text-muted"}`}>
                {tab === "basic" ? "Basic Info" : "Portal Credentials"}
              </button>
            ))}
          </div>

          {editTab === "basic" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Client ID</label>
                  <input className="input-field font-mono bg-surface text-faint" value={client.clientId} disabled />
                </div>
                <div>
                  <label className="label">Category *</label>
                  <select className="input-field bg-surface text-faint cursor-not-allowed" value={editForm.category} disabled aria-readonly="true">
                    {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                  <p className="text-[11px] text-faint mt-1">Category is fixed after creation so the Client ID prefix stays consistent.</p>
                </div>
              </div>
              <div>
                <label className="label">Company Name *</label>
                <input className="input-field" value={editForm.companyName} onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })} required />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="label flex items-center gap-1.5"><Users className="w-3 h-3" />Contacts</label>
                  <button
                    type="button"
                    onClick={addPerson}
                    className="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add Contact
                  </button>
                </div>
                <div className="space-y-3">
                  {persons.map((entry, index) => (
                    <PersonEntryCard
                      key={`${entry.personId || "new"}-${index}`}
                      entry={entry}
                      index={index}
                      total={persons.length}
                      onChange={(updated) => updatePerson(index, updated)}
                      onRemove={() => removePerson(index)}
                      onSetPrimary={() => setPrimary(index)}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">State *</label>
                  <select className="input-field" value={editForm.state} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })} required>
                    <option value="">Select State</option>
                    {STATES.map((state) => <option key={state} value={state}>{state}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">GST Number</label>
                  <input className="input-field font-mono text-sm" value={editForm.gstNumber} onChange={(e) => setEditForm({ ...editForm, gstNumber: e.target.value })} placeholder="22AAAAA0000A1Z5" />
                </div>
              </div>
              <div>
                <label className="label">Address</label>
                <textarea className="input-field" rows={2} value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
              </div>
              <div>
                <label className="label">Registration Number</label>
                <input className="input-field font-mono text-sm" value={editForm.registrationNumber} onChange={(e) => setEditForm({ ...editForm, registrationNumber: e.target.value })} />
              </div>
            </div>
          )}

          {editTab === "portal" && (
            <div className="space-y-3">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-400">
                Warning: These credentials are stored securely and only visible to admins.
              </div>
              <div>
                <label className="label">CPCB Login ID</label>
                <input className="input-field font-mono text-sm" value={editForm.cpcbLoginId} onChange={(e) => setEditForm({ ...editForm, cpcbLoginId: e.target.value })} placeholder="e.g. username@cpcb" />
              </div>
              <div>
                <label className="label">CPCB Password</label>
                <div className="relative">
                  <input type={showEditPassword ? "text" : "password"} className="input-field font-mono text-sm pr-16"
                    value={editForm.cpcbPassword} onChange={(e) => setEditForm({ ...editForm, cpcbPassword: e.target.value })} />
                  <button type="button" onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-600 font-medium">
                    {showEditPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <div>
                <label className="label">OTP Mobile Number</label>
                <input className="input-field font-mono text-sm" value={editForm.otpMobileNumber} onChange={(e) => setEditForm({ ...editForm, otpMobileNumber: e.target.value })} placeholder="+91 XXXXX XXXXX" />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t border-base">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEditModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

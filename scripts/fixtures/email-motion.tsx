import React, { Profiler, useState } from "react";
import { createRoot } from "react-dom/client";
import * as Activity from "@/components/client-trackers/EmailDeliveryActivityProvider";
import EmailDeliveryReviewWorkspace from "@/components/client-trackers/EmailDeliveryReviewWorkspace";
import EmailDeliveryAuthorizationModal from "@/components/client-trackers/EmailDeliveryAuthorizationModal";
import HoldToSendButton from "@/components/client-trackers/HoldToSendButton";
import { initialRecipientDraft, type EmailPreview, type RecipientDraft } from "@/lib/tracker-email-delivery-review";
import type { DeliveryBatch } from "@/lib/email-delivery-security";
import type { DeliveryJobSummary } from "@/lib/email-delivery-jobs";

const metrics = { actionRenders: 0, holdCommits: 0, holdRenders: 0, holdActualDuration: 0, commitReturnedAt: 0, acceptedAt: 0, handoffAt: 0 };
const messages = Array.from({ length: 300 }, (_, index) => ({
  entryId: `E${index}`, clientId: `C${index}`, companyName: `Motion client ${index}`,
  subject: `Subject ${index}`, html: `<html><body><h1>Personalised ${index}</h1><p>Exact fixture body ${index}</p></body></html>`,
  body: `Body ${index}`, to: `client${index}@example.com`, suggestedTo: [`client${index}@example.com`],
  recipients: [{ email: `client${index}@example.com`, name: `Contact ${index}`, designation: "Director", isPrimary: true }], points: [], attachments: [],
}));
const preview: EmailPreview = { workflow: { id: "W1", name: "Motion workflow", signatureGap: 2 }, messages, skipped: [{ clientId: "C400", companyName: "Skipped fixture", reason: "No eligible contact" }] };
const batch: DeliveryBatch = { campaignId: "motion-job", workflowId: "W1", kind: "initial", mode: "send", messages: [{ ...messages[0], to: [messages[0].to], cc: [] }] };

function Controls() {
  // The fallback lets the same fixture profile the saved pre-change implementation.
  const useActions = Activity.useOptionalEmailDeliveryActions || Activity.useOptionalEmailDeliveryActivity;
  const actions = useActions()!;
  metrics.actionRenders++;
  (window as any).motionFixture.observe = (job: DeliveryJobSummary) => actions.observe(job);
  return <button onClick={actions.expand}>Fixture expand</button>;
}
function App() {
  const [review, setReview] = useState(false), [prepared, setPrepared] = useState(false), [authorization, setAuthorization] = useState(false);
  const [signature, setSignature] = useState("<p>Signature original</p>");
  const [drafts, setDrafts] = useState<Record<string, RecipientDraft>>(() => Object.fromEntries(messages.map(message => [message.entryId, initialRecipientDraft(message)])));
  (window as any).motionFixture = { metrics, updateSignature: () => setSignature("<p>Signature revised</p>"), ...(window as any).motionFixture };
  return <Activity.EmailDeliveryActivityProvider>
    <Controls />
    <button onClick={() => setReview(true)}>Open motion review</button>
    <button onClick={() => setAuthorization(true)}>Open motion authorization</button>
    <Profiler id="hold" onRender={(_, __, actualDuration) => { metrics.holdRenders++; metrics.holdActualDuration += actualDuration; }}>
      <div id="motion-hold"><HoldToSendButton count={300} onCommit={() => { metrics.holdCommits++; }} /></div>
    </Profiler>
    {review && <EmailDeliveryReviewWorkspace open onClose={() => setReview(false)} workflows={[{ id: "W1", name: "Motion workflow" } as any]} workflowId="W1" kind="initial" onWorkflow={() => {}} onKind={() => {}}
      selectedCount={0} clientCategories={{}} preview={prepared ? preview : null} drafts={drafts} onDraft={(id, draft) => setDrafts(current => ({ ...current, [id]: draft }))}
      busy={false} phase={null} deliveryMode={null} error={null} onPrepare={() => setPrepared(true)} onDrafts={() => {}} onSend={() => {}} signature={signature} signatureLoading={false} onExpand={() => {}} />}
    {authorization && <EmailDeliveryAuthorizationModal trackerId="TRACKER" batch={batch} workflowName="Motion workflow" onClose={() => setAuthorization(false)}
      onCommit={async () => { const job = await (await fetch('/api/email-delivery/jobs/motion-job')).json(); metrics.commitReturnedAt = performance.now(); return { outcome: "accepted", campaignId: batch.campaignId, job: job.job }; }}
      onAccepted={() => { metrics.acceptedAt = performance.now(); }} onHandoffComplete={() => { metrics.handoffAt = performance.now(); setAuthorization(false); }} />}
  </Activity.EmailDeliveryActivityProvider>;
}
createRoot(document.getElementById("root")!).render(<App />);

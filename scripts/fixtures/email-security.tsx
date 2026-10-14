import React, { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import EmailDeliveryPanel from "@/app/dashboard/settings/EmailDeliveryPanel";
import SettingsSidebar from "@/app/dashboard/settings/SettingsSidebar";
import { SettingsSearchProvider } from "@/app/dashboard/settings/SettingsSearchContext";
import EmailDeliveryAuthorizationModal from "@/components/client-trackers/EmailDeliveryAuthorizationModal";
import HoldToSendButton from "@/components/client-trackers/HoldToSendButton";
import { EmailSecurityProcessing } from "@/components/client-trackers/EmailSecurityControls";
import type { DeliveryBatch } from "@/lib/email-delivery-security";
import { EmailDeliverySettingsProvider, useEmailDeliverySettings } from "@/app/dashboard/settings/EmailDeliverySettingsContext";
const batch: DeliveryBatch = {
  campaignId: "fixture-campaign",
  workflowId: "WF1",
  kind: "initial",
  mode: "send",
  messages: [
    {
      entryId: "E1",
      clientId: "C1",
      companyName: "Fixture client",
      to: ["client@example.com"],
      cc: [],
      subject: "Fixture subject",
      html: "<p>Fixture body</p>",
      attachments: [{ documentId: "fixture-document" }],
    },
  ],
};
function App() {
  return <EmailDeliverySettingsProvider navigateHref={href => { history.pushState(null, "", href); }}><FixtureContent /></EmailDeliverySettingsProvider>;
}
function FixtureContent() {
  const { navigate } = useEmailDeliverySettings();
  const dual = new URLSearchParams(location.search).has("dual");
  const [modal, setModal] = useState(false),
    [commits, setCommits] = useState(0),
    [deliveryAttempts, setDeliveryAttempts] = useState(0),
    [tab, setTab] = useState(3);
  return (
    <SettingsSearchProvider>
      <div className={`security-fixture ${dual ? "is-dual" : ""}`}>
        <aside>
          <SettingsSidebar
            activeTab={tab}
            onSelect={(index, id) => {
              const commit = () => {
              setTab(index);
              const params = new URLSearchParams(location.search);
              params.set("tab", ["general", "access", "custom-fields", "email-delivery"][index]);
              history.replaceState(
                null,
                "",
                `?${params.toString()}`,
              );
              if (id)
                setTimeout(
                  () => document.getElementById(id)?.scrollIntoView(),
                  30,
                );
              };
              if (index === tab) commit(); else navigate(commit);
            }}
          />
        </aside>
        <main>
          {tab === 3 ? <>
            <div className={dual ? "fixture-desktop" : ""}><EmailDeliveryPanel /></div>
            {dual && <div className="fixture-mobile"><EmailDeliveryPanel /></div>}
          </> : <div data-fixture-tab={tab}>Selected settings tab</div>}
        </main>
      </div>
      <div className="security-fixture-tools">
        <button onClick={() => setModal(true)}>Open delivery</button>
        <HoldToSendButton
          count={1}
          onCommit={() => setCommits((value) => value + 1)}
        />
        <output id="hold-commits">{commits}</output>
        <output id="delivery-attempts">{deliveryAttempts}</output>
        <EmailSecurityProcessing>Fixture processing</EmailSecurityProcessing>
      </div>
      {modal && (
        <EmailDeliveryAuthorizationModal
          trackerId="TRACKER"
          workflowName="Fixture workflow"
          batch={batch}
          onClose={() => setModal(false)}
          onCommit={async () => {
            setDeliveryAttempts(value => value + 1);
            await new Promise(resolve => setTimeout(resolve, 900));
            if (document.documentElement.dataset.failDelivery) {
              delete document.documentElement.dataset.failDelivery;
              throw new Error("Fixture send interrupted. Try the same delivery again.");
            }
            setCommits((value) => value + 1);
            return { completed: batch.messages.length, dismiss: () => setModal(false) };
          }}
        />
      )}
    </SettingsSearchProvider>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

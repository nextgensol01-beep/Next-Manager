import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import DocumentUploadModal from "../../app/dashboard/clients/[clientId]/DocumentUploadModal";
import type { Document } from "../../app/dashboard/clients/[clientId]/ClientProfileSupport";

function Fixture() {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState<string>();
  const [purpose, setPurpose] = useState<"general" | "target-screenshot">("general");
  const [documents, setDocuments] = useState<Document[]>([]);
  const show = (financialYear?: string, target = false) => {
    setYear(financialYear); setPurpose(target ? "target-screenshot" : "general"); setOpen(true);
  };
  return <>
    <button onClick={() => show()}>Regular upload</button>
    <button onClick={() => show("2025-26")}>Upload in FY context</button>
    <button onClick={() => show("2025-26", true)}>Target screenshot</button>
    <output id="saved-documents">{JSON.stringify(documents)}</output>
    <DocumentUploadModal open={open} clientId="CLIENT-A" purpose={purpose} financialYear={year}
      onClose={() => setOpen(false)} onUploaded={added => setDocuments(current => [...current, ...added])} />
  </>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Fixture /></React.StrictMode>);

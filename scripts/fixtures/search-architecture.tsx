import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import FinancialYearPage from "@/app/dashboard/financial-year/page";
import BillingPage from "@/app/dashboard/billing/page";
import CreditTransactionsPage from "@/app/dashboard/credit-transactions/page";
import UploadRecordsPage from "@/app/dashboard/cpcb-uploads/upload-records/page";
import ContactsPage from "@/app/dashboard/contacts/page";
import EmailHistoryPage from "@/app/dashboard/email-history/page";
import TrashPage from "@/app/dashboard/trash/page";
import AnnualReturnPage from "@/app/dashboard/annual-return/page";
import Audience from "@/components/client-trackers/create/TrackerAudienceSection";
import ClientManager from "@/components/client-trackers/configure/TrackerClientManager";
import { useCache } from "@/lib/useCache";
import { type TrackerBuilderClient, type TrackerCreateDraft } from "@/lib/tracker-create";

type PendingRead = { url: string; complete: (value: string) => void };
declare global {
  interface Window {
    pendingSearchReads: PendingRead[];
    cacheControls: { next: (key: string) => void; mutate: (value: { value: string }) => void; refetch: () => void };
  }
}
const actualFetch = window.fetch.bind(window);
window.pendingSearchReads = [];
window.fetch = (input, init) => String(input).startsWith('/fixture/cache/')
  ? new Promise(resolve => window.pendingSearchReads.push({ url: String(input), complete: value => resolve(Response.json({value})) }))
  : actualFetch(input, init);

function CacheHarness() {
  const [key,next] = useState('A');
  const resource = useCache<{value:string}>(`/fixture/cache/${key}`);
  window.cacheControls = {next,mutate:resource.mutate,refetch:resource.refetch};
  return <output id="cache-result">{JSON.stringify({data:resource.data,loading:resource.loading,error:resource.error})}</output>;
}
function Pickers({ configure = false }: { configure?: boolean }) {
  const {data:clients} = useCache<TrackerBuilderClient[]>('/api/clients',{initialData:[]});
  const [selected,setSelected] = useState<string[]>([]);
  const [draft,setDraft] = useState({scope:'selected',selected:[],selectedCategories:[],fields:[],includeStatus:false} as unknown as TrackerCreateDraft);
  return configure ? <ClientManager clients={clients} selectedIds={selected} baselineIds={[]} loading={false} error={null} onChange={setSelected} />
    : <Audience clients={clients} count={clients.length} errors={{}} loading={false} loadError={null} form={draft} onChange={setDraft} />;
}
const screen = new URLSearchParams(location.search).get('screen');
const content = screen === 'annual' ? <AnnualReturnPage /> : screen === 'email' ? <EmailHistoryPage /> : screen === 'trash' ? <TrashPage /> : screen === 'billing' ? <BillingPage /> : screen === 'credits' ? <CreditTransactionsPage /> : screen === 'uploads' ? <UploadRecordsPage /> : screen === 'contacts' ? <ContactsPage /> : screen === 'audience' ? <Pickers /> : screen === 'configure' ? <Pickers configure /> : screen === 'cache' ? <CacheHarness /> : <FinancialYearPage />;
createRoot(document.getElementById('root')!).render(content);

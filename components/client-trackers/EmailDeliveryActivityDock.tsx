"use client";
import { memo, useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Check, ChevronDown, ChevronUp, CircleAlert, History, Mail, Minus, RefreshCw, X } from "lucide-react";
import { deliveryOutcomeLabel, isDeliveryActive, type DeliveryJobItem, type DeliveryJobSummary } from "@/lib/email-delivery-jobs";
import HoldToSendButton from "./HoldToSendButton";
import { deliveryActivityFetch, useEmailDeliveryActivity } from "./EmailDeliveryActivityProvider";
import { useAuthorizationReducedMotion } from "./useAuthorizationReducedMotion";

const date = (value: string | null) => value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
const sameItem = (a: DeliveryJobItem, b: DeliveryJobItem) =>
  (Object.keys(b) as Array<keyof DeliveryJobItem>).every(key =>
    key === "to" || key === "cc" ? a[key].length === b[key].length && a[key].every((value, index) => value === b[key][index]) : a[key] === b[key]);
const ActivityRow = memo(function ActivityRow({ item, mode, open, toggle }: { item: DeliveryJobItem; mode: DeliveryJobSummary["mode"]; open: boolean; toggle: (index: number) => void }) {
  return <div className="delivery-activity-item" data-status={item.status}>
    <button type="button" className="delivery-activity-item-summary" aria-expanded={open} onClick={() => toggle(item.index)}>
      <span><strong>{item.companyName}</strong><small>{item.to.join(", ") || item.clientId}</small></span>
      <span className="delivery-activity-item-status">{item.status === "draft" ? "Draft created" : item.status === "delivering" ? mode === "draft" ? "Creating" : "Sending" : item.status === "pending" ? "Queued" : item.status === "sent" ? "Sent" : item.status === "failed" ? "Failed" : "Uncertain"}<ChevronDown size={12} /></span>
    </button>
    {open && <dl className="delivery-activity-item-detail">
      <div><dt>Client</dt><dd>{item.clientId}</dd></div><div><dt>To</dt><dd>{item.to.join(", ")}</dd></div>{item.cc.length > 0 && <div><dt>CC</dt><dd>{item.cc.join(", ")}</dd></div>}
      <div><dt>Subject</dt><dd>{item.subject}</dd></div>{item.processedAt && <div><dt>Last attempt</dt><dd>{date(item.processedAt)}</dd></div>}
      {item.gmailReference && <div><dt>Gmail reference</dt><dd>{item.gmailReference}</dd></div>}{item.error && <div><dt>Review</dt><dd>{item.error}</dd></div>}
    </dl>}
  </div>;
});
function JobDetails({ job, active }: { job: DeliveryJobSummary; active: boolean }) {
  const { observe, resume, coordinatingIds } = useEmailDeliveryActivity();
  const [filter, setFilter] = useState("all"), [search, setSearch] = useState(""), [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0), [items, setItems] = useState<DeliveryJobItem[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null), [matching, setMatching] = useState(0);
  const [error, setError] = useState(""), [loading, setLoading] = useState(false), [revision, setRevision] = useState(0);
  const [openRow, setOpenRow] = useState<number | null>(null), [resuming, setResuming] = useState(false);
  const toggleRow = useCallback((index: number) => setOpenRow(current => current === index ? null : index), []);
  const [resumeConfirmation, setResumeConfirmation] = useState(false), [resumeAttempt, setResumeAttempt] = useState(0);
  const canResume = job.canResume && !coordinatingIds.includes(job.campaignId);
  const resumeRemaining = async () => {
    setResuming(true); setError("");
    try { await resume(job); setResumeConfirmation(false); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Remaining work could not resume."); setResumeAttempt(value => value + 1); }
    finally { setResuming(false); }
  };
  useEffect(() => { const timer = setTimeout(() => { setQuery(search); setOffset(0); }, 250); return () => clearTimeout(timer); }, [search]);
  // Summary lease/heartbeat changes do not require another page of message details.
  const detailRevision = `${job.processed}:${job.delivering}:${job.pending}:${job.sent}:${job.drafts}:${job.failed}:${job.uncertain}:${job.status}`;
  useEffect(() => {
    if (!active) return;
    const abort = new AbortController(); let alive = true;
    const timeout = setTimeout(() => abort.abort(), 15000);
    setLoading(true);
    void deliveryActivityFetch<{ items: DeliveryJobItem[]; matching: number; nextOffset: number | null; job: DeliveryJobSummary }>(
      `/api/email-delivery/jobs/${encodeURIComponent(job.campaignId)}/items?status=${filter}&search=${encodeURIComponent(query)}&offset=${offset}`, abort.signal,
    ).then(result => { if (alive) {
      setItems(current => { const previous = new Map(current.map(item => [item.index, item])); return result.items.map(item => { const old = previous.get(item.index); return old && sameItem(old, item) ? old : item; }); });
      setNextOffset(result.nextOffset); setMatching(result.matching); setError(""); observe(result.job);
    } })
      .catch(() => { if (alive) setError("Message activity could not refresh. Try again."); })
      .finally(() => { clearTimeout(timeout); if (alive) setLoading(false); });
    return () => { alive = false; clearTimeout(timeout); abort.abort(); };
  }, [active, job.campaignId, detailRevision, filter, query, offset, revision, observe]);
  const statuses = [["all", "All"], [job.mode === "draft" ? "draft" : "sent", job.mode === "draft" ? "Drafts" : "Sent"], ["delivering", job.mode === "draft" ? "Creating" : "Sending"], ["pending", "Pending"], ["failed", "Failed"], ["uncertain", "Uncertain"]];
  return <div className="delivery-activity-details">
    <div className="delivery-activity-meta"><span>{job.kind === "initial" ? "Initial email" : "Reminder"} · {job.total} client {job.total === 1 ? "email" : "emails"}</span><span>{date(job.createdAt)}</span></div>
    {job.message && <p className="delivery-activity-notice">{job.message}</p>}
    {job.uncertain > 0 && <p className="delivery-activity-notice">Gmail outcomes need review. Uncertain messages will not be automatically retried.</p>}
    {job.status === "paused_daily_limit" && <p className="delivery-activity-notice">The rolling 24-hour allowance is exhausted. Resume remaining work after allowance becomes available.</p>}
    <p className="delivery-activity-footnote">Keep this website open while {job.mode === "draft" ? "drafts are created" : "emails are sending"}. You can continue working anywhere in the dashboard. Refreshing, closing or suspending this site can interrupt processing.</p>
    {!coordinatingIds.includes(job.campaignId) && !job.canResume && job.status !== "queued" && (job.pending > 0 || job.delivering > 0) && <p className="delivery-activity-notice">Another browser or an in-flight batch owns this campaign. Resume becomes available after its lease expires; this page will not take over automatically.</p>}
    {canResume && !resumeConfirmation && <div className="delivery-activity-resume-confirmation"><button disabled={resuming} onClick={() => setResumeConfirmation(true)}>Resume remaining</button></div>}
    {canResume && resumeConfirmation && <div className="delivery-activity-resume-confirmation">
      <p>Resume this exact approved campaign. Confirmed successes and uncertain messages will not be resent.{job.needsHistoryRepair ? " Missing history will be repaired." : ""}</p>
      {job.mode === "send" && job.pending > 0 ? <HoldToSendButton count={job.pending} resetKey={resumeAttempt} disabled={resuming} phase={resuming ? "committing" : "ready"} onCommit={() => void resumeRemaining()} />
        : <button disabled={resuming} onClick={() => void resumeRemaining()}>{resuming ? "Starting…" : job.needsHistoryRepair && !job.pending ? "Repair delivery history" : "Resume draft creation"}</button>}
      <button disabled={resuming} onClick={() => setResumeConfirmation(false)}>Cancel resume</button>
    </div>}

    <div className="delivery-activity-counts">
      <span><b>{job.mode === "draft" ? job.drafts : job.sent}</b>{job.mode === "draft" ? "Drafts" : "Sent"}</span>
      <span><b>{job.delivering}</b>{job.mode === "draft" ? "Creating" : "Sending"}</span>
      <span><b>{job.pending}</b>Pending</span><span><b>{job.failed}</b>Failed</span><span><b>{job.uncertain}</b>Uncertain</span>
    </div>
    <div className="delivery-activity-section-heading"><h4>Individual email activity</h4>{loading && <span>Refreshing…</span>}</div>
    <input className="delivery-activity-search" type="search" placeholder="Search clients or recipients…" aria-label="Search delivery messages" value={search} onChange={event => setSearch(event.target.value)} />
    <div className="delivery-activity-filters" role="group" aria-label="Message outcome filter">{statuses.map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setOffset(0); setOpenRow(null); }}>{label}</button>)}</div>
    {error && <p role="alert" className="delivery-activity-notice">{error} <button onClick={() => setRevision(value => value + 1)}>Try again</button></p>}
    <div className="delivery-activity-items" aria-busy={loading}>
      {!items.length && !loading && <p className="delivery-activity-empty">No messages match this filter.</p>}
      {items.map(item => <ActivityRow key={item.index} item={item} mode={job.mode} open={openRow === item.index} toggle={toggleRow} />)}
    </div>
    <div className="delivery-activity-pagination"><span>{matching ? `${offset + 1}–${Math.min(offset + items.length, matching)} of ${matching}` : "0 messages"}</span>
      <div><button disabled={!offset || loading} onClick={() => setOffset(Math.max(0, offset - 25))}>Previous</button><button disabled={nextOffset === null || loading} onClick={() => { if (nextOffset !== null) setOffset(nextOffset); }}>Next</button></div>
    </div>
    <div className="delivery-activity-detail-actions"><Link href={`/dashboard/client-trackers/${encodeURIComponent(job.trackerId)}`}>Open tracker <ArrowUpRight size={12} /></Link>

    </div>
    <p className="delivery-activity-footnote">“Sent” means Gmail accepted the message. Inbox delivery and read status are not confirmed.</p>
  </div>;
}
export default function EmailDeliveryActivityDock() {
  const state = useEmailDeliveryActivity(), reduced = useAuthorizationReducedMotion(), id = useId();
  const details = useRef<HTMLDivElement>(null), heading = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!state.expanded && details.current?.contains(document.activeElement)) heading.current?.focus({ preventScroll: true });
  }, [state.expanded]);
  const job = state.jobs.find(item => item.campaignId === state.selectedId);
  const activeCount = state.jobs.filter(item => isDeliveryActive(item.status)).length;
  const attention = Boolean(job && (job.failed || job.uncertain || job.status === "interrupted" || job.status.startsWith("paused")));
  const progress = job?.total ? job.processed / job.total * 100 : 0;
  const [announcement, setAnnouncement] = useState("");
  const nextAnnouncement = job ? deliveryOutcomeLabel(job) : "";
  useEffect(() => setAnnouncement(nextAnnouncement), [nextAnnouncement]);
  if (!job && !state.history) return null;
  return <>
    <span className="sr-only" role="status" aria-atomic="true">{announcement}</span>
    <motion.aside className={`delivery-activity-dock ${state.expanded ? "is-expanded" : ""}`} data-attention={attention || undefined}
      aria-label="Email delivery activity" initial={{ opacity: 0, y: reduced ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .36, ease: [.22, .72, .24, 1] }}>
      <div className="delivery-activity-dock-header">
        <button ref={heading} type="button" className="delivery-activity-heading" onClick={() => state.expanded ? state.minimize() : job ? state.expand() : state.showHistory()} aria-expanded={state.expanded} aria-controls={id}>
          <span className="delivery-activity-icon">{attention ? <CircleAlert size={17} /> : job?.status === "completed" ? <Check size={17} /> : <Mail size={17} />}</span>
          <span><strong>{state.expanded && state.history ? "Delivery history" : job ? deliveryOutcomeLabel(job) : "Email activity"}</strong>{job && <small>{job.workflowName}{activeCount > 1 ? ` · ${activeCount} active jobs` : ""}</small>}</span>
        </button>
        <div className="delivery-activity-dock-actions"><button aria-label="Open delivery history" onClick={state.showHistory}><History size={15} /></button>
          {state.expanded ? <button aria-label="Minimize email activity" onClick={state.minimize}><Minus size={16} /></button> : job && <button aria-label="Expand email activity" onClick={state.expand}><ChevronUp size={16} /></button>}
          {job && ["completed", "completed_with_errors"].includes(job.status) && <button aria-label="Dismiss delivery notification" onClick={state.dismiss}><X size={15} /></button>}
        </div>
      </div>
      {job && !state.history && <div className="delivery-activity-progress-summary"><div><span>{job.processed} of {job.total} processed</span><span>{job.mode === "draft" ? `${job.drafts} drafts` : `${job.sent} sent`}{job.failed ? ` · ${job.failed} failed` : ""}{job.uncertain ? ` · ${job.uncertain} uncertain` : ""}</span></div>
        <div className="delivery-activity-progress" role="progressbar" aria-label="Messages processed" aria-valuemin={0} aria-valuemax={job.total} aria-valuenow={job.processed}>
          <motion.span initial={false} animate={{ width: `${progress}%` }} transition={{ duration: reduced ? 0 : .4 }} />
        </div>
      </div>}
      {state.error && <div className="delivery-activity-connection" role="alert">{state.error}<button aria-label="Refresh email activity" onClick={() => void state.refresh()}><RefreshCw size={13} /> Retry</button></div>}
      <div className="delivery-activity-expansion" aria-hidden={!state.expanded} inert={!state.expanded || undefined}>
      <div ref={details} id={id} className="delivery-activity-expanded">
        {state.history ? <div className="delivery-activity-history">
          <p className="delivery-activity-footnote">Campaigns and outcomes are saved on the server.</p>
          {!state.jobs.length && !state.loadingHistory && <p className="delivery-activity-empty">No delivery campaigns yet.</p>}
          {state.jobs.map(item => <button type="button" key={item.campaignId} className="delivery-activity-history-row" onClick={() => state.select(item.campaignId)}>
            <strong>{item.workflowName}</strong><span>{item.trackerName} · {item.kind === "initial" ? "Initial" : "Reminder"} · {item.mode === "draft" ? "Drafts" : "Emails"}</span><span>{deliveryOutcomeLabel(item)}</span><small>{date(item.createdAt)}</small>
          </button>)}
          {state.loadingHistory && <p>Loading history…</p>}{state.nextCursor && <button className="delivery-activity-load-more" disabled={state.loadingHistory} onClick={() => void state.loadHistory(true)}>Load older campaigns</button>}
        </div> : job ? <>
          {activeCount > 1 && <div className="delivery-activity-job-picker"><label htmlFor={`${id}-job`}>Campaign</label><select id={`${id}-job`} value={job.campaignId} onChange={event => state.select(event.target.value)}>{state.jobs.filter(item => isDeliveryActive(item.status) || item.campaignId === job.campaignId).map(item => <option key={item.campaignId} value={item.campaignId}>{item.workflowName} · {item.trackerName}</option>)}</select></div>}
          <JobDetails key={job.campaignId} job={job} active={state.expanded} />
        </> : <p className="delivery-activity-empty">Open history to inspect a delivery campaign.</p>}
      </div></div>
    </motion.aside>
  </>;
}

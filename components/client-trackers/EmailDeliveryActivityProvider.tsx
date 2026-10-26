"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { readJsonResponse } from "@/lib/http-response";
import { isDeliveryActive, type DeliveryJobSummary, type DeliveryBatchProgress, type DeliveryCoordinatorClaim } from "@/lib/email-delivery-jobs";
import { securityFetch } from "@/lib/email-delivery-security-client";
import { BrowserEmailDeliveryCoordinator } from "@/lib/email-delivery-coordinator";
import { coordinatedDeliverySummary, isNewerDeliverySummary } from "@/lib/email-delivery-activity-state";
import EmailDeliveryActivityDock from "./EmailDeliveryActivityDock";

type ActivityState = {
  jobs: DeliveryJobSummary[]; selectedId: string | null; expanded: boolean; history: boolean;
  error: string; loadingHistory: boolean; nextCursor: string | null;
  watch: (job: DeliveryJobSummary) => void; observe: (job: DeliveryJobSummary) => void;
  select: (id: string) => void; expand: () => void; minimize: () => void; dismiss: () => void;
  showHistory: () => void; loadHistory: (more?: boolean) => Promise<void>; refresh: () => Promise<void>;
  resume: (job: DeliveryJobSummary) => Promise<void>; coordinatingIds: string[];
};
const Context = createContext<ActivityState | null>(null);
type ActivityActions = Pick<ActivityState, "watch" | "observe" | "select" | "expand" | "minimize" | "dismiss" | "showHistory" | "loadHistory" | "refresh" | "resume">;
const ActionsContext = createContext<ActivityActions | null>(null);
export const useOptionalEmailDeliveryActions = () => useContext(ActionsContext);
export const useOptionalEmailDeliveryActivity = () => useContext(Context);
export function useEmailDeliveryActivity() {
  const context = useContext(Context);
  if (!context) throw new Error("Email delivery activity provider is missing.");
  return context;
}
export async function deliveryActivityFetch<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(data.error || "Unable to refresh email activity.");
  return data as T;
}
export function EmailDeliveryActivityProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const [jobs, setJobs] = useState<DeliveryJobSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false), [history, setHistory] = useState(false);
  const [error, setError] = useState(""), [loadingHistory, setLoadingHistory] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [coordinatingIds, setCoordinatingIds] = useState<string[]>([]);
  const [claimingIds, setClaimingIds] = useState<string[]>([]);
  const coordinator = useRef<BrowserEmailDeliveryCoordinator | null>(null), starting = useRef(new Set<string>());
  const jobsRef = useRef(jobs), selectedRef = useRef(selectedId), cursorRef = useRef(nextCursor), coordinatingRef = useRef(coordinatingIds);
  const inFlight = useRef<Promise<void> | null>(null), controller = useRef<AbortController | null>(null);
  const historyController = useRef<AbortController | null>(null), historyLoading = useRef(false);
  const dismissed = useRef(new Set<string>()), mounted = useRef(true);
  jobsRef.current = jobs; selectedRef.current = selectedId; cursorRef.current = nextCursor; coordinatingRef.current = coordinatingIds;
  const merge = useCallback((incoming: DeliveryJobSummary[]) => {
    setJobs(current => {
      const map = new Map(current.map(job => [job.campaignId, job]));
      let changed = false;
      for (const job of incoming) {
        const previous = map.get(job.campaignId);
        if ((!previous || isNewerDeliverySummary(previous, job)) &&
          (!previous || (Object.keys(job) as Array<keyof DeliveryJobSummary>).some(key => job[key] !== previous[key]))) {
          map.set(job.campaignId, job); changed = true;
        }
      }
      return changed ? [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : current;
    });
  }, []);
  const refresh = useCallback(async () => {
    if (!enabled || inFlight.current) return inFlight.current || undefined;
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 15000);
    inFlight.current = (async () => {
      try {
        const active = await deliveryActivityFetch<{ jobs: DeliveryJobSummary[] }>("/api/email-delivery/jobs?active=1&limit=50", abort.signal);
        if (!Array.isArray(active.jobs)) throw new Error("Unable to read email activity.");
        const incoming = active.jobs;
        const selected = selectedRef.current;
        // Missing active jobs may have finished elsewhere, even when not selected.
        const missing = new Set(jobsRef.current.filter(job => isDeliveryActive(job.status)).map(job => job.campaignId));
        if (selected) missing.add(selected);
        for (const job of incoming) missing.delete(job.campaignId);
        for (const id of missing) {
          const result = await deliveryActivityFetch<{ job: DeliveryJobSummary }>(`/api/email-delivery/jobs/${encodeURIComponent(id)}`, abort.signal);
          incoming.push(result.job);
        }
        if (!mounted.current) return;
        merge(incoming); setError("");
        if (!selected) setSelectedId(incoming.find(job => !dismissed.current.has(job.campaignId))?.campaignId || null);
      } catch (failure) {
        if (mounted.current) setError(failure instanceof Error && failure.name !== "AbortError" ? failure.message : "Email activity could not refresh. Check your connection before resuming delivery.");
      } finally { clearTimeout(timeout); inFlight.current = null; }
    })();
    return inFlight.current;
  }, [enabled, merge]);
  const resume = useCallback(async (job: DeliveryJobSummary) => {
    if (!enabled || starting.current.has(job.campaignId) || coordinatingRef.current.includes(job.campaignId)) return;
    starting.current.add(job.campaignId);
    setClaimingIds([...starting.current]);
    try {
      const result = await securityFetch<DeliveryCoordinatorClaim>("/api/email-delivery/jobs/" + encodeURIComponent(job.campaignId) + "/resume", { confirmed: true });
      if (!mounted.current) return;
      merge([result.job]); setError("");
      if (result.coordinatorToken) coordinator.current?.add(job.campaignId, result.coordinatorToken);
    } catch (failure) {
      if (mounted.current) { setError(failure instanceof Error ? failure.message : "Unable to resume this campaign."); void refresh(); }
      throw failure;
    } finally { starting.current.delete(job.campaignId); if (mounted.current) setClaimingIds([...starting.current]); }
  }, [enabled, merge, refresh]);
  useEffect(() => {
    if (!enabled) return;
    const instance = new BrowserEmailDeliveryCoordinator({
      batch: async (campaignId, token) => {
        const response = await fetch("/api/email-delivery/jobs/" + encodeURIComponent(campaignId) + "/batch", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coordinatorToken: token }), signal: AbortSignal.timeout(65000),
        });
        const result = await readJsonResponse<DeliveryBatchProgress>(response);
        if (!response.ok || !result.job || !["processing", "busy", "paused", "done", "attention", "unavailable"].includes(result.state)) throw new Error("Batch outcome unavailable.");
        return result;
      },
      observe: job => { if (mounted.current) merge([job]); },
      change: ids => { if (mounted.current) setCoordinatingIds(ids); },
      error: message => { if (mounted.current) { setError(message); void refresh(); } },
    });
    coordinator.current = instance;
    return () => { instance.dispose(); coordinator.current = null; };
  }, [enabled, merge, refresh]);
  useEffect(() => {
    if (!coordinatingIds.length && !claimingIds.length) return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [coordinatingIds.length, claimingIds.length]);
  const loadHistory = useCallback(async (more = false) => {
    if (!enabled || historyLoading.current) return;
    historyLoading.current = true; setLoadingHistory(true);
    const abort = new AbortController(); historyController.current = abort;
    const timer = setTimeout(() => abort.abort(), 15000);
    try {
      const result = await deliveryActivityFetch<{ jobs: DeliveryJobSummary[]; nextCursor: string | null }>(`/api/email-delivery/jobs?limit=20${more && cursorRef.current ? `&before=${encodeURIComponent(cursorRef.current)}` : ""}`, abort.signal);
      if (!mounted.current) return;
      merge(result.jobs); setNextCursor(result.nextCursor); setError("");
    } catch { if (mounted.current) setError("Delivery history could not load. Your saved campaigns remain on the server."); }
    finally { clearTimeout(timer); historyLoading.current = false; if (mounted.current) setLoadingHistory(false); }
  }, [enabled, merge]);
  useEffect(() => {
    mounted.current = true;
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined, stopped = false, generation = 0;
    const cycle = async () => {
      const current = ++generation;
      if (timer) clearTimeout(timer);
      await refresh();
      if (!stopped && current === generation) timer = setTimeout(cycle, controller.current?.signal.aborted ? 1000 : document.hidden ? 30000 : jobsRef.current.some(job => isDeliveryActive(job.status)) ? 3000 : 60000);
    };
    const wake = () => { if (!document.hidden) void cycle(); };
    void cycle();
    window.addEventListener("online", wake); window.addEventListener("focus", wake); document.addEventListener("visibilitychange", wake);
    return () => {
      stopped = true; mounted.current = false;
      if (timer) clearTimeout(timer);
      controller.current?.abort(); historyController.current?.abort();
      window.removeEventListener("online", wake); window.removeEventListener("focus", wake); document.removeEventListener("visibilitychange", wake);
    };
  }, [enabled, refresh]);
  const actions = useMemo<ActivityActions>(() => ({
    observe: job => merge([job]), refresh, loadHistory, resume,
    watch: job => { dismissed.current.delete(job.campaignId); merge([job]); selectedRef.current = job.campaignId; setSelectedId(job.campaignId); setExpanded(false); setHistory(false); void resume(job).catch(() => {}); },
    select: id => { selectedRef.current = id; setSelectedId(id); setHistory(false); setExpanded(true); },
    expand: () => setExpanded(true), minimize: () => setExpanded(false),
    dismiss: () => {
      if (selectedRef.current) dismissed.current.add(selectedRef.current);
      const next = jobsRef.current.find(job => isDeliveryActive(job.status) && !dismissed.current.has(job.campaignId))?.campaignId || null;
      selectedRef.current = next; setSelectedId(next);
      setExpanded(false);
    },
    showHistory: () => { setHistory(true); setExpanded(true); void loadHistory(); },
  }), [merge, refresh, loadHistory, resume]);
  const controllingIds = useMemo(() => [...new Set([...coordinatingIds, ...claimingIds])], [coordinatingIds, claimingIds]);
  const visibleJobs = useMemo(() => jobs.map(job => coordinatedDeliverySummary(job, claimingIds.includes(job.campaignId), coordinatingIds.includes(job.campaignId))), [jobs, claimingIds, coordinatingIds]);
  const value = useMemo<ActivityState>(() => ({ ...actions, jobs: visibleJobs, selectedId, expanded, history, error, loadingHistory, nextCursor, coordinatingIds: controllingIds }),
    [actions, visibleJobs, selectedId, expanded, history, error, loadingHistory, nextCursor, controllingIds]);
  return <ActionsContext.Provider value={actions}><Context.Provider value={value}>{children}{enabled && <EmailDeliveryActivityDock />}</Context.Provider></ActionsContext.Provider>;
}

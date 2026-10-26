import type { DeliveryJobSummary } from "./email-delivery-jobs";

const terminal = (job: DeliveryJobSummary) => job.status === "completed" || job.status === "completed_with_errors";
/** Persisted changes win first; observation time orders lease expiry without a DB write. */
export function isNewerDeliverySummary(previous: DeliveryJobSummary, incoming: DeliveryJobSummary) {
  if (incoming.updatedAt < previous.updatedAt || incoming.processed < previous.processed) return false;
  if (terminal(previous) && !terminal(incoming)) return false;
  if (incoming.updatedAt > previous.updatedAt) return true;
  if (previous.status === "processing" && incoming.status === "queued" &&
    (!incoming.controllerLeaseExpiresAt || (previous.controllerLeaseExpiresAt && incoming.controllerLeaseExpiresAt <= previous.controllerLeaseExpiresAt))) return false;
  if (previous.observedAt && (!incoming.observedAt || incoming.observedAt < previous.observedAt)) return false;
  if (incoming.observedAt && (!previous.observedAt || incoming.observedAt > previous.observedAt)) return true;
  // Equal/legacy observations must not replace a newer lease or manufacture recovery eligibility.
  if (!terminal(incoming) && previous.controllerLeaseExpiresAt &&
    (!incoming.controllerLeaseExpiresAt || incoming.controllerLeaseExpiresAt < previous.controllerLeaseExpiresAt)) return false;
  if (!previous.canResume && incoming.canResume && previous.status !== "interrupted") return false;
  return true;
}

export function coordinatedDeliverySummary(job: DeliveryJobSummary, claiming: boolean, coordinating: boolean): DeliveryJobSummary {
  if ((!claiming && !coordinating) || terminal(job)) return job;
  return { ...job, canResume: false,
    ...(claiming && ["interrupted", "recovering", "paused_daily_limit", "paused_requires_attention"].includes(job.status) ? { status: "queued" as const } : {}) };
}

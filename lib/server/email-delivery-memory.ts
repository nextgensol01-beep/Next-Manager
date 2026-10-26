import { channel } from "node:diagnostics_channel";
import { getHeapStatistics } from "node:v8";

// Temporary, opt-in numeric diagnostics. Never accept message/client data here.
const measurements = channel("email-delivery.memory");
export function deliveryMemory(stage: string) {
  if (process.env.EMAIL_DELIVERY_MEMORY_DIAGNOSTICS !== "1" && !measurements.hasSubscribers) return;
  const sample = { stage, ...process.memoryUsage() };
  measurements.publish(sample);
  if (process.env.EMAIL_DELIVERY_MEMORY_DIAGNOSTICS === "1") console.info("[email-memory]", JSON.stringify(sample));
}

/** End a serial batch early; the next browser request continues saved pending work. */
export function deliveryMemoryPressure() {
  const usage = process.memoryUsage();
  const configured = Number(process.env.EMAIL_DELIVERY_RSS_BUDGET_MB);
  const rssBudget = Number.isFinite(configured) && configured > 0 ? Math.max(128, configured) : 512;
  return usage.heapUsed >= getHeapStatistics().heap_size_limit * 0.7 ||
    usage.rss >= rssBudget * 1024 * 1024 || usage.external >= 128 * 1024 * 1024;
}

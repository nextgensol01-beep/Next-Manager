import type { DeliveryBatchProgress, DeliveryJobSummary } from "./email-delivery-jobs";

/** Memory holds only this mounted browser's capabilities, never a durable queue.
 * A new page/provider starts empty and requires an explicit server-authorized resume. */
export class BrowserEmailDeliveryCoordinator {
  private entries = new Map<string, string>();
  private running = false;
  private disposed = false;
  private wake: (() => void) | null = null;
  constructor(private callbacks: {
    batch: (campaignId: string, token: string) => Promise<DeliveryBatchProgress>;
    observe: (job: DeliveryJobSummary) => void;
    change: (ids: string[]) => void;
    error: (message: string) => void;
  }) {}
  add(campaignId: string, token: string) {
    if (this.disposed) return;
    this.entries.set(campaignId, token);
    this.callbacks.change([...this.entries.keys()]);
    void this.pump();
  }
  dispose() {
    this.disposed = true;
    this.entries.clear();
    this.wake?.();
    // Do not abort an in-flight server request and pretend that Gmail stopped.
  }
  private async delay(ms: number) {
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => { this.wake = null; resolve(); }, ms);
      this.wake = () => { clearTimeout(timer); this.wake = null; resolve(); };
    });
  }
  private async pump() {
    if (this.running || this.disposed) return;
    this.running = true;
    try {
      while (this.entries.size && !this.disposed) {
        const [campaignId, token] = this.entries.entries().next().value as [string, string];
        try {
          const result = await this.callbacks.batch(campaignId, token);
          if (this.disposed) return;
          this.callbacks.observe(result.job);
          this.entries.delete(campaignId);
          if (["processing", "busy"].includes(result.state)) this.entries.set(campaignId, token);
          this.callbacks.change([...this.entries.keys()]);
          if (this.entries.size) await this.delay(result.state === "busy" ? Math.max(1000, Math.min(10000, result.retryAfterMs || 3000)) : 250);
        } catch {
          if (this.disposed) return;
          this.entries.delete(campaignId);
          this.callbacks.change([...this.entries.keys()]);
          this.callbacks.error("Delivery paused after a connection or server interruption. A current batch may still finish. Refresh its saved status and explicitly resume after the active lease expires.");
        }
      }
    } finally { this.running = false; }
  }
}

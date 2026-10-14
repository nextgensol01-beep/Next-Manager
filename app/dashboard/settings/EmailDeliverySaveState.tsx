"use client";
import { AlertCircle, Check, LoaderCircle } from "lucide-react";
import { GlassButton } from "@/components/ui/liquid-glass";
import { useEmailDeliverySettings } from "./EmailDeliverySettingsContext";

export function EmailDeliverySaveStatus() {
  const state = useEmailDeliverySettings();
  const status = state.saving ? "saving" : state.saveError ? "error" : state.changedKeys.length ? "dirty" : "saved";
  return <div className="email-delivery-save-status" data-save-state={status} role="status" aria-live="polite" aria-atomic="true" aria-label="Email delivery save status">
    {status === "saving" ? <LoaderCircle size={14} className="email-delivery-save-spinner" aria-hidden="true" />
      : status === "error" ? <AlertCircle size={14} aria-hidden="true" />
      : status === "saved" ? <Check size={14} aria-hidden="true" />
      : <span className="email-delivery-dirty-dot" aria-hidden="true" />}
    <span>{status === "saving" ? "Saving…" : status === "error" ? "Couldn’t save" : status === "dirty" ? "Unsaved changes" : "Saved"}</span>
    {status === "error" && <button type="button" disabled={state.reviewing} onClick={() => void state.requestSave()}>Retry</button>}
  </div>;
}

export function EmailDeliverySaveBar() {
  const state = useEmailDeliverySettings();
  const count = state.changedKeys.length;
  if (!count && !state.saving && !state.saveError && !state.justSaved) return null;
  const status = state.saving ? "saving" : state.saveError ? "error" : count ? "dirty" : "saved";
  const busy = state.reviewing || state.saving || status === "saved";
  return <div className="email-delivery-save-bar" data-state={status} aria-label="Save Email & Delivery settings">
    <div className="email-delivery-save-bar-message">
      {status === "saving" ? <LoaderCircle size={15} className="email-delivery-save-spinner" aria-hidden="true" />
        : status === "saved" ? <Check size={15} aria-hidden="true" />
        : status === "error" ? <AlertCircle size={15} aria-hidden="true" />
        : <span className="email-delivery-dirty-dot" aria-hidden="true" />}
      <span>{status === "saving" ? "Saving settings…" : status === "saved" ? "Settings saved" : status === "error" ? "Couldn't save settings. Your changes are still here." : `${count} unsaved ${count === 1 ? "change" : "changes"}`}</span>
    </div>
    <div className="email-delivery-save-bar-actions">
      <GlassButton disabled={busy} onClick={state.discard}>Discard</GlassButton>
      <GlassButton className="email-delivery-save-primary" disabled={busy} onClick={() => void state.requestSave()}>
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Try again" : "Save changes"}
      </GlassButton>
    </div>
  </div>;
}

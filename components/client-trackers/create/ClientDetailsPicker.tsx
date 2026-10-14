"use client";

import { Check } from "lucide-react";
import { CLIENT_TRACKER_DETAIL_OPTIONS, type ClientTrackerDetailKey } from "@/lib/clientTrackers";
import { BuilderSection } from "./BuilderControls";

export default function ClientDetailsPicker({ value, onChange }: {
  value: ClientTrackerDetailKey[]; onChange: (value: ClientTrackerDetailKey[]) => void;
}) {
  return <BuilderSection title="Client details" description="Choose the client information visible in this worklist.">
    <p className="create-help create-detail-label">Always shown</p>
    <div className="create-chips"><span className="create-chip is-fixed"><Check size={12} />Client name</span><span className="create-chip is-fixed"><Check size={12} />Category</span></div>
    <p className="create-help create-detail-label">Additional</p>
    <div className="create-chips" role="group" aria-label="Visible client details">
      {CLIENT_TRACKER_DETAIL_OPTIONS.map(option => <button type="button" key={option.key} className={`create-chip ${value.includes(option.key) ? "is-selected" : ""}`}
        aria-pressed={value.includes(option.key)} onClick={() => onChange(value.includes(option.key) ? value.filter(key => key !== option.key) : [...value, option.key])}>
        <span className="create-chip-check"><Check size={12} /></span>{option.label}
      </button>)}
    </div>
  </BuilderSection>;
}

"use client";

import { useState, type DragEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Building2, Contact, FileCheck2, LayoutPanelTop, Sparkles } from "lucide-react";
import type {
  ClientCustomFieldFormSection,
  ClientCustomFieldFormTab,
  ClientCustomFieldProfileCluster,
  ClientCustomFieldProfileDisplay,
} from "@/lib/clientCustomFields";

type Props = {
  label: string;
  icon: React.ReactNode;
  groupLabel?: string;
  formTab: ClientCustomFieldFormTab;
  formSection: ClientCustomFieldFormSection;
  profileDisplay: ClientCustomFieldProfileDisplay;
  profileCluster: ClientCustomFieldProfileCluster;
  onFormTabChange?: (tab: ClientCustomFieldFormTab) => void;
  onFormSectionChange: (section: ClientCustomFieldFormSection) => void;
  onProfileClusterChange: (cluster: ClientCustomFieldProfileCluster) => void;
};

const FORM_SECTIONS: Record<ClientCustomFieldFormTab, Array<{ id: ClientCustomFieldFormSection; label: string }>> = {
  basic: [
    { id: "identity", label: "Client Identity" },
    { id: "company", label: "Company" },
    { id: "contacts", label: "Contacts" },
    { id: "compliance", label: "Compliance & Location" },
  ],
  portal: [{ id: "portalCredentials", label: "Portal Credentials" }],
};

const PROFILE_CLUSTERS: Array<{ id: ClientCustomFieldProfileCluster; label: string; icon: React.ElementType }> = [
  { id: "company", label: "Company", icon: Building2 },
  { id: "contact", label: "Contact", icon: Contact },
  { id: "compliance", label: "Compliance", icon: FileCheck2 },
  { id: "additional", label: "Additional", icon: LayoutPanelTop },
];

export default function CustomFieldPlacementPreview({
  label,
  icon,
  groupLabel,
  formTab,
  formSection,
  profileDisplay,
  profileCluster,
  onFormTabChange,
  onFormSectionChange,
  onProfileClusterChange,
}: Props) {
  const reducedMotion = useReducedMotion();
  const [formDropTarget, setFormDropTarget] = useState<ClientCustomFieldFormSection | null>(null);
  const [profileDropTarget, setProfileDropTarget] = useState<ClientCustomFieldProfileCluster | null>(null);
  const fieldLabel = label.trim() || "Custom Field";
  const draggableLabel = groupLabel || fieldLabel;
  const spring = reducedMotion ? { duration: 0 } : { type: "spring" as const, stiffness: 360, damping: 30 };
  const formSections = FORM_SECTIONS[formTab];
  const startDrag = (event: DragEvent<HTMLElement>, surface: "form" | "profile") => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", surface);
  };
  const moveToTab = (tab: ClientCustomFieldFormTab) => {
    if (!onFormTabChange) return;
    onFormTabChange(tab);
    onFormSectionChange(tab === "portal" ? "portalCredentials" : "company");
  };

  return (
    <div className="cf-placement-preview" aria-label="Live placement preview">
      <div className="cf-placement-preview-head">
        <span className="cf-placement-preview-title"><Sparkles size={14} /> Live placement preview</span>
        <span className="cf-placement-preview-hint">Drag the blue item or tap a location</span>
      </div>

      <div className="cf-placement-preview-grid">
        <div className="cf-mini-device">
          <div className="cf-mini-device-bar">
            <span /><span /><span />
            <strong>{formTab === "basic" ? "Client Form" : "Portal Access"}</strong>
          </div>
          <div className="cf-mini-tabs">
            <button type="button" className={formTab === "basic" ? "active" : ""} disabled={!onFormTabChange} onClick={() => moveToTab("basic")} onDragOver={(event) => { if (onFormTabChange) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); moveToTab("basic"); }}>Basic Details</button>
            <button type="button" className={formTab === "portal" ? "active" : ""} disabled={!onFormTabChange} onClick={() => moveToTab("portal")} onDragOver={(event) => { if (onFormTabChange) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); moveToTab("portal"); }}>Portal Access</button>
          </div>
          <div className="cf-mini-form-sections">
            {formSections.map((section) => {
              const selected = section.id === formSection;
              return (
                <button
                  key={section.id}
                  type="button"
                  className={`cf-mini-section ${selected ? "selected" : ""} ${formDropTarget === section.id ? "drop-target" : ""}`}
                  onClick={() => onFormSectionChange(section.id)}
                  onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setFormDropTarget(section.id); }}
                  onDragLeave={() => setFormDropTarget((current) => current === section.id ? null : current)}
                  onDrop={(event) => { event.preventDefault(); setFormDropTarget(null); onFormSectionChange(section.id); }}
                >
                  <span className="cf-mini-section-name">{section.label}</span>
                  <span className="cf-mini-line wide" />
                  <span className="cf-mini-line" />
                  <AnimatePresence initial={false}>
                    {selected && (
                      <motion.span
                        key={`${formTab}-${formSection}-${fieldLabel}`}
                        layoutId="custom-field-form-slot"
                        initial={{ opacity: 0, scale: 0.92, y: 6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.94, y: -4 }}
                        transition={spring}
                        className="cf-mini-field-shell"
                      >
                        <span className="cf-mini-field" draggable onDragStart={(event) => startDrag(event, "form")} onDragEnd={() => setFormDropTarget(null)} title={`Drag ${draggableLabel} to another form section`}>
                          <span className="cf-mini-field-icon">{icon}</span>
                          <span>{draggableLabel}</span>
                        </span>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              );
            })}
          </div>
        </div>

        <div className="cf-mini-device cf-mini-profile">
          <div className="cf-mini-device-bar">
            <span /><span /><span />
            <strong>Profile Overview</strong>
          </div>
          <div className="cf-mini-company-head">
            <span className="cf-mini-avatar">NS</span>
            <span><strong>Company Overview</strong><small>Client information</small></span>
          </div>
          <div className={`cf-mini-profile-content display-${profileDisplay}`}>
            {PROFILE_CLUSTERS.map((cluster) => {
              const ClusterIcon = cluster.icon;
              const selected = cluster.id === profileCluster;
              return (
                <button
                  key={cluster.id}
                  type="button"
                  className={`cf-mini-profile-slot ${selected ? "selected" : ""} ${profileDropTarget === cluster.id ? "drop-target" : ""}`}
                  onClick={() => onProfileClusterChange(cluster.id)}
                  onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setProfileDropTarget(cluster.id); }}
                  onDragLeave={() => setProfileDropTarget((current) => current === cluster.id ? null : current)}
                  onDrop={(event) => { event.preventDefault(); setProfileDropTarget(null); onProfileClusterChange(cluster.id); }}
                >
                  <span className="cf-mini-cluster-label"><ClusterIcon size={10} />{groupLabel && selected ? groupLabel : cluster.label}</span>
                  {selected ? (
                    <motion.span
                      layoutId="custom-field-profile-slot"
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={spring}
                      className="cf-mini-field-shell"
                    >
                      <span className="cf-mini-field" draggable onDragStart={(event) => startDrag(event, "profile")} onDragEnd={() => setProfileDropTarget(null)} title={`Drag ${draggableLabel} to another profile location`}>
                        <span className="cf-mini-field-icon">{icon}</span>
                        <span>{draggableLabel}</span>
                      </span>
                    </motion.span>
                  ) : <span className="cf-mini-line" />}
                </button>
              );
            })}
          </div>
          <span className="cf-mini-display-chip">
            {profileDisplay === "inline" ? "Inline" : profileDisplay === "subsection" ? "Subsection" : "Separate card"}
          </span>
        </div>
      </div>

      <style jsx>{`
        .cf-placement-preview{margin:0 16px 18px;padding:14px;border:1px solid color-mix(in srgb,var(--color-border) 82%,transparent);border-radius:22px;background:linear-gradient(145deg,color-mix(in srgb,var(--color-surface) 92%,#fff 8%),color-mix(in srgb,var(--color-surface) 92%,#007aff 8%));box-shadow:0 18px 45px rgba(0,0,0,.08),inset 0 1px 0 rgba(255,255,255,.55)}
        .cf-placement-preview-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}.cf-placement-preview-title{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--color-text)}.cf-placement-preview-title :global(svg){color:#007aff}.cf-placement-preview-hint{font-size:10px;color:var(--color-text-faint)}
        .cf-placement-preview-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.cf-mini-device{position:relative;min-width:0;padding:8px;border:1px solid color-mix(in srgb,var(--color-border) 82%,transparent);border-radius:15px;background:color-mix(in srgb,var(--color-surface) 94%,transparent);overflow:hidden}.cf-mini-device-bar{display:flex;align-items:center;gap:3px;padding-bottom:7px}.cf-mini-device-bar>span{width:4px;height:4px;border-radius:50%;background:var(--color-border)}.cf-mini-device-bar strong{margin-left:4px;font-size:8px;color:var(--color-text-muted)}
        .cf-mini-tabs{display:flex;gap:3px;padding:3px;border-radius:8px;background:var(--color-hover)}.cf-mini-tabs button{flex:1;padding:4px 2px;border:0;border-radius:6px;background:transparent;text-align:center;font-size:7px;color:var(--color-text-faint);cursor:pointer}.cf-mini-tabs button:disabled{cursor:default}.cf-mini-tabs button.active{background:var(--color-surface);color:#007aff;box-shadow:0 2px 8px rgba(0,0,0,.07)}
        .cf-mini-form-sections{display:grid;gap:5px;margin-top:6px}.cf-mini-section,.cf-mini-profile-slot{position:relative;width:100%;padding:6px;border:1px solid transparent;border-radius:9px;background:var(--color-surface);text-align:left;transition:border-color .2s,background .2s,transform .2s,box-shadow .2s}.cf-mini-section:hover,.cf-mini-profile-slot:hover{transform:translateY(-1px)}.cf-mini-section.selected,.cf-mini-profile-slot.selected{border-color:rgba(0,122,255,.45);background:rgba(0,122,255,.07);box-shadow:0 5px 18px rgba(0,122,255,.1)}.cf-mini-section.drop-target,.cf-mini-profile-slot.drop-target{border-color:#007aff;background:rgba(0,122,255,.13);box-shadow:0 0 0 2px rgba(0,122,255,.12),0 8px 20px rgba(0,122,255,.16)}.cf-mini-section-name,.cf-mini-cluster-label{display:flex;align-items:center;gap:3px;font-size:7px;font-weight:700;color:var(--color-text-muted)}.cf-mini-line{display:block;width:58%;height:3px;margin-top:4px;border-radius:99px;background:var(--color-border-soft)}.cf-mini-line.wide{width:85%}
        .cf-mini-field-shell{display:block}.cf-mini-field{display:flex!important;align-items:center;gap:4px;margin-top:5px;padding:5px;border-radius:7px;background:#007aff;color:#fff;font-size:7px;font-weight:700;box-shadow:0 5px 12px rgba(0,122,255,.24);cursor:grab;user-select:none}.cf-mini-field:active{cursor:grabbing}.cf-mini-field-icon{display:flex;align-items:center}.cf-mini-field-icon :global(svg){width:9px;height:9px}
        .cf-mini-company-head{display:flex;align-items:center;gap:6px;padding:4px 2px 7px}.cf-mini-avatar{display:grid;width:20px;height:20px;place-items:center;border-radius:7px;background:#007aff;color:#fff;font-size:7px;font-weight:800}.cf-mini-company-head strong,.cf-mini-company-head small{display:block}.cf-mini-company-head strong{font-size:8px;color:var(--color-text)}.cf-mini-company-head small{font-size:6px;color:var(--color-text-faint)}.cf-mini-profile-content{display:grid;grid-template-columns:1fr 1fr;gap:5px}.cf-mini-profile-slot{min-height:33px}.cf-mini-profile-content.display-card .cf-mini-profile-slot.selected{grid-column:1/-1}.cf-mini-profile-content.display-subsection .cf-mini-profile-slot.selected{grid-column:1/-1;border-radius:11px}.cf-mini-display-chip{display:inline-flex;margin-top:7px;padding:3px 6px;border-radius:999px;background:var(--color-hover);font-size:7px;font-weight:700;color:var(--color-text-muted)}
        @media(max-width:560px){.cf-placement-preview-grid{grid-template-columns:1fr}.cf-placement-preview{margin-left:12px;margin-right:12px}.cf-placement-preview-hint{display:none}}
        @media(prefers-reduced-motion:reduce){.cf-mini-section,.cf-mini-profile-slot{transition:none}}
      `}</style>
    </div>
  );
}

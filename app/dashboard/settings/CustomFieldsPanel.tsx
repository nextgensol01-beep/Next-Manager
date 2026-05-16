"use client";
import { useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, Building2, Calendar, FileText, Hash, Mail, MapPin, Phone, Shield, User, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import {
  CLIENT_CUSTOM_FIELD_ICONS,
  CLIENT_CUSTOM_FIELD_PROFILE_POSITIONS,
  CLIENT_CUSTOM_FIELD_TYPES,
  customFieldKeyFromLabel,
  type ClientCustomFieldDefinition,
  type ClientCustomFieldIcon,
  type ClientCustomFieldProfilePosition,
  type ClientCustomFieldType,
} from "@/lib/clientCustomFields";
import { invalidate, useCache } from "@/lib/useCache";
import ConfirmModal from "@/components/ui/ConfirmModal";

const emptyFieldForm = {
  label: "",
  key: "",
  type: "text" as ClientCustomFieldType,
  searchable: false,
  required: false,
  active: true,
  showInProfile: true,
  profilePosition: "beforeContact" as ClientCustomFieldProfilePosition,
  icon: "fileText" as ClientCustomFieldIcon,
  order: "",
};

const FIELD_ICON_COMPONENTS = {
  fileText: FileText,
  building: Building2,
  hash: Hash,
  user: User,
  mapPin: MapPin,
  phone: Phone,
  mail: Mail,
  calendar: Calendar,
  shield: Shield,
} as const;

type ConfirmState = {
  open: boolean;
  title: string;
  description?: string;
  note?: string;
  onConfirm: () => Promise<void>;
};

const closedConfirm: ConfirmState = { open: false, title: "", onConfirm: async () => {} };

function SettingsGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <p className="text-[11px] font-medium uppercase tracking-wider text-faint px-1">{label}</p>
      )}
      <div className="rounded-2xl overflow-hidden border border-[var(--color-border)] bg-card divide-y divide-[var(--color-border)]">
        {children}
      </div>
    </div>
  );
}

const inputClass = "w-full text-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-default px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] transition disabled:opacity-40";

export default function CustomFieldsPanel() {
  const [fieldForm, setFieldForm] = useState(emptyFieldForm);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [savingField, setSavingField] = useState(false);
  const [keyTouched, setKeyTouched] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(closedConfirm);
  const [showForm, setShowForm] = useState(false);

  const { data: clientCustomFields, loading: fieldsLoading, refetch: refetchClientCustomFields } =
    useCache<ClientCustomFieldDefinition[]>("/api/client-custom-fields?includeInactive=1", { initialData: [] });

  const resetFieldForm = () => {
    setFieldForm(emptyFieldForm);
    setEditingFieldId(null);
    setKeyTouched(false);
    setShowForm(false);
  };

  const updateFieldLabel = (label: string) => {
    setFieldForm((current) => ({
      ...current,
      label,
      key: editingFieldId || keyTouched ? current.key : customFieldKeyFromLabel(label),
    }));
  };

  const saveClientCustomField = async (event: FormEvent) => {
    event.preventDefault();
    setSavingField(true);
    try {
      const url = editingFieldId ? `/api/client-custom-fields/${editingFieldId}` : "/api/client-custom-fields";
      const response = await fetch(url, {
        method: editingFieldId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fieldForm),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) { toast.error(body?.error || "Failed to save field"); return; }
      toast.success(editingFieldId ? "Field updated" : "Field added");
      resetFieldForm();
      invalidate("/api/client-custom-fields", "/api/client-custom-fields?includeInactive=1", "/api/clients");
      refetchClientCustomFields();
    } finally {
      setSavingField(false);
    }
  };

  const editClientCustomField = (field: ClientCustomFieldDefinition) => {
    setEditingFieldId(field._id || null);
    setFieldForm({
      label: field.label,
      key: field.key,
      type: field.type,
      searchable: field.searchable,
      required: field.required,
      active: field.active,
      showInProfile: field.showInProfile !== false,
      profilePosition: field.profilePosition || "beforeContact",
      icon: field.icon || "fileText",
      order: String(field.order || ""),
    });
    setKeyTouched(true);
    setShowForm(true);
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
  };

  const disableClientCustomField = (field: ClientCustomFieldDefinition) => {
    if (!field._id) return;
    setConfirmState({
      open: true,
      title: `Disable "${field.label}"?`,
      description: "The field will be hidden from forms and profiles.",
      note: "Existing values stay saved and can be restored by re-enabling the field.",
      onConfirm: async () => {
        const response = await fetch(`/api/client-custom-fields/${field._id}`, { method: "DELETE" });
        if (!response.ok) { toast.error("Failed to disable field"); return; }
        toast.success("Field disabled");
        invalidate("/api/client-custom-fields", "/api/client-custom-fields?includeInactive=1", "/api/clients");
        refetchClientCustomFields();
        setConfirmState(closedConfirm);
      },
    });
  };

  const SelectedIcon = FIELD_ICON_COMPONENTS[fieldForm.icon];

  return (
    <div className="space-y-5">

      {/* Field list */}
      <SettingsGroup label="Client Custom Fields">
        {fieldsLoading ? (
          <div className="px-4 py-4 text-sm text-muted">Loading fields…</div>
        ) : clientCustomFields.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted">
            No custom fields yet. Add one below.
          </div>
        ) : (
          clientCustomFields.map((field) => {
            const FieldIcon = FIELD_ICON_COMPONENTS[field.icon || "fileText"] || FileText;
            return (
              <div
                key={field._id || field.key}
                className={`px-4 py-3 ${!field.active ? "opacity-60" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-[10px] bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <FieldIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-semibold text-default">{field.label}</p>
                      <span className="font-mono text-[11px] rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-muted">{field.key}</span>
                      <span className="text-[11px] rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-muted">{field.type}</span>
                      {!field.active && (
                        <span className="text-[11px] rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300">
                          Disabled
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-faint mt-0.5">
                      {[
                        field.searchable ? "Searchable" : null,
                        field.required ? "Required" : null,
                        field.showInProfile !== false ? "In profile" : null,
                      ].filter(Boolean).join(" · ") || "No special options"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => editClientCustomField(field)}
                      className="inline-flex items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-medium text-default hover:bg-[var(--color-hover)] transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {field.active && (
                      <button
                        type="button"
                        onClick={() => disableClientCustomField(field)}
                        className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-[#FF3B30] hover:bg-red-100 transition-colors dark:bg-red-900/20 dark:border-red-800"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Add field trigger */}
        <button
          type="button"
          onClick={() => { resetFieldForm(); setShowForm((v) => !v); }}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-[#007AFF] hover:bg-[var(--color-hover)] transition-colors"
        >
          <span className="w-8 h-8 rounded-[9px] bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center justify-center">
            <Plus className="w-4 h-4" />
          </span>
          <span className="flex-1 text-left text-sm font-medium">
            {editingFieldId ? "Editing a field (scroll down)" : "Add new field"}
          </span>
          <ChevronRight className={`w-4 h-4 text-faint transition-transform ${showForm && !editingFieldId ? "rotate-90" : ""}`} />
        </button>
      </SettingsGroup>

      {/* Add/Edit form */}
      {showForm && (
        <SettingsGroup label={editingFieldId ? "Edit Field" : "New Field"}>
          <form onSubmit={saveClientCustomField} className="px-4 py-4 space-y-4">

            {/* Label + Key */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-faint uppercase tracking-wide">Field Label *</label>
                <input
                  className={`mt-1 ${inputClass}`}
                  value={fieldForm.label}
                  onChange={(e) => updateFieldLabel(e.target.value)}
                  placeholder="Legal Name"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-faint uppercase tracking-wide">Field Key *</label>
                <input
                  className={`mt-1 ${inputClass} font-mono`}
                  value={fieldForm.key}
                  onChange={(e) => { setKeyTouched(true); setFieldForm((c) => ({ ...c, key: e.target.value })); }}
                  disabled={Boolean(editingFieldId)}
                  placeholder="legalName"
                  required
                />
                <p className="text-[11px] text-faint mt-1">Fixed after creation — existing values stay linked.</p>
              </div>
            </div>

            {/* Type + Icon */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-faint uppercase tracking-wide">Field Type</label>
                <select
                  className={`mt-1 ${inputClass}`}
                  value={fieldForm.type}
                  onChange={(e) => setFieldForm((c) => ({ ...c, type: e.target.value as ClientCustomFieldType }))}
                >
                  {CLIENT_CUSTOM_FIELD_TYPES.map((type) => (
                    <option key={type.id} value={type.id}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-faint uppercase tracking-wide">Icon</label>
                <div className="mt-1 flex gap-2">
                  <div className="h-9 w-9 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center text-muted flex-shrink-0">
                    <SelectedIcon className="w-4 h-4" />
                  </div>
                  <select
                    className={`${inputClass} flex-1`}
                    value={fieldForm.icon}
                    onChange={(e) => setFieldForm((c) => ({ ...c, icon: e.target.value as ClientCustomFieldIcon }))}
                  >
                    {CLIENT_CUSTOM_FIELD_ICONS.map((icon) => (
                      <option key={icon.id} value={icon.id}>{icon.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Profile position + Order */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-faint uppercase tracking-wide">Profile Position</label>
                <select
                  className={`mt-1 ${inputClass}`}
                  value={fieldForm.profilePosition}
                  onChange={(e) => setFieldForm((c) => ({ ...c, profilePosition: e.target.value as ClientCustomFieldProfilePosition }))}
                >
                  {CLIENT_CUSTOM_FIELD_PROFILE_POSITIONS.map((pos) => (
                    <option key={pos.id} value={pos.id}>{pos.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-faint uppercase tracking-wide">Display Order</label>
                <input
                  className={`mt-1 ${inputClass} font-mono`}
                  type="number"
                  value={fieldForm.order}
                  onChange={(e) => setFieldForm((c) => ({ ...c, order: e.target.value }))}
                  placeholder="Auto"
                />
              </div>
            </div>

            {/* Toggles */}
            <div className="rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)] overflow-hidden">
              {([
                { key: "searchable" as const, label: "Searchable", subtitle: "Appear in client search results" },
                { key: "required" as const, label: "Required", subtitle: "Field must be filled in forms" },
                { key: "active" as const, label: "Active", subtitle: "Show in forms and exports" },
                { key: "showInProfile" as const, label: "Show in profile", subtitle: "Display on client profile page" },
              ]).map(({ key, label, subtitle }) => (
                <label key={key} className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--color-hover)] transition-colors">
                  <div>
                    <p className="text-sm font-medium text-default">{label}</p>
                    <p className="text-xs text-muted">{subtitle}</p>
                  </div>
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded accent-[#007AFF]"
                    checked={Boolean(fieldForm[key])}
                    onChange={(e) => setFieldForm((c) => ({ ...c, [key]: e.target.checked }))}
                  />
                </label>
              ))}
            </div>

            {/* Submit */}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={savingField}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#007AFF] px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-40"
              >
                {savingField ? "Saving…" : editingFieldId ? "Update Field" : "Add Field"}
              </button>
              <button
                type="button"
                onClick={resetFieldForm}
                className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-sm font-medium text-default hover:bg-[var(--color-hover)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </SettingsGroup>
      )}

      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        note={confirmState.note}
        confirmLabel="Disable"
        onConfirm={confirmState.onConfirm}
        onClose={() => setConfirmState(closedConfirm)}
      />
    </div>
  );
}

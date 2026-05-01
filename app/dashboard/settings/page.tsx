"use client";
import { useEffect, useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import PageHeader from "@/components/ui/PageHeader";
import { useFinancialYearPreference } from "@/app/providers";
import { FINANCIAL_YEARS } from "@/lib/utils";
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
import { Building2, Calendar, CalendarDays, BellRing, FileText, Hash, Mail, MapPin, Phone, Shield, ToggleLeft, Plus, Pencil, Trash2, User, Users, KeyRound, Chrome, Eye, EyeOff } from "lucide-react";

// ── User management types ─────────────────────────────────────────────────
interface ManagedUser {
  id: string;
  name: string;
  email: string;
  loginMethod: "google" | "password";
  createdAt: string;
}

const emptyUserForm = {
  name: "",
  email: "",
  loginMethod: "google" as "google" | "password",
  password: "",
};

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

export default function SettingsPage() {
  const {
    isLoaded,
    settings,
    currentFinancialYear,
    effectiveFinancialYear,
    setFeatureEnabled,
    setDefaultFinancialYear,
  } = useFinancialYearPreference();

  const [featureEnabled, setFeatureEnabledDraft] = useState(false);
  const [defaultFinancialYear, setDefaultFinancialYearDraft] = useState<string>("");
  const [fieldForm, setFieldForm] = useState(emptyFieldForm);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [savingField, setSavingField] = useState(false);
  const [keyTouched, setKeyTouched] = useState(false);
  const { data: clientCustomFields, loading: fieldsLoading, refetch: refetchClientCustomFields } =
    useCache<ClientCustomFieldDefinition[]>("/api/client-custom-fields?includeInactive=1", { initialData: [] });

  // ── User management state ──────────────────────────────────────────────
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [savingUser, setSavingUser] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const { data: managedUsers, loading: usersLoading, refetch: refetchUsers } =
    useCache<{ users: ManagedUser[] }>("/api/users", { initialData: { users: [] } });
  const userList = managedUsers?.users ?? [];

  const resetUserForm = () => {
    setUserForm(emptyUserForm);
    setShowPassword(false);
    setEditingUserId(null);
    setResetPasswordValue("");
    setShowResetPassword(false);
  };

  const saveUser = async (e: FormEvent) => {
    e.preventDefault();
    setSavingUser(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userForm),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { toast.error(body?.error || "Failed to add user"); return; }
      toast.success("User added");
      resetUserForm();
      invalidate("/api/users");
      refetchUsers();
    } finally {
      setSavingUser(false);
    }
  };

  const deleteUser = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}"? They will no longer be able to log in.`)) return;
    setDeletingUserId(id);
    try {
      const res = await fetch(`/api/users?id=${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Failed to remove user"); return; }
      toast.success("User removed");
      invalidate("/api/users");
      refetchUsers();
    } finally {
      setDeletingUserId(null);
    }
  };

  const resetPassword = async (id: string) => {
    if (!resetPasswordValue.trim()) { toast.error("Enter a new password"); return; }
    try {
      const res = await fetch(`/api/users?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPasswordValue }),
      });
      if (!res.ok) { toast.error("Failed to update password"); return; }
      toast.success("Password updated");
      setEditingUserId(null);
      setResetPasswordValue("");
    } catch {
      toast.error("Failed to update password");
    }
  };

  useEffect(() => {
    if (!isLoaded) return;
    setFeatureEnabledDraft(settings.enabled);
    setDefaultFinancialYearDraft(settings.defaultFinancialYear || "");
  }, [isLoaded, settings.defaultFinancialYear, settings.enabled]);

  const handleSave = () => {
    setFeatureEnabled(featureEnabled);
    setDefaultFinancialYear(defaultFinancialYear || null);
    toast.success("Financial year settings saved");
  };

  const handleDisable = () => {
    setFeatureEnabledDraft(false);
    setFeatureEnabled(false);
    toast.success("Custom default FY disabled");
  };

  const resetFieldForm = () => {
    setFieldForm(emptyFieldForm);
    setEditingFieldId(null);
    setKeyTouched(false);
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
      if (!response.ok) {
        toast.error(body?.error || "Failed to save client field");
        return;
      }

      toast.success(editingFieldId ? "Client field updated" : "Client field added");
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
  };

  const disableClientCustomField = async (field: ClientCustomFieldDefinition) => {
    if (!field._id) return;
    if (!confirm(`Disable "${field.label}"? Existing values stay saved but the field will be hidden.`)) return;

    const response = await fetch(`/api/client-custom-fields/${field._id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Failed to disable client field");
      return;
    }

    toast.success("Client field disabled");
    invalidate("/api/client-custom-fields", "/api/client-custom-fields?includeInactive=1", "/api/clients");
    refetchClientCustomFields();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configure your website-wide financial year preference and reminder behavior"
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="space-y-6">
        <section className="bg-card rounded-2xl border border-base shadow-sm p-5">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-11 h-11 rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-900/25 dark:text-brand-300 flex items-center justify-center">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-default">Default Financial Year</h2>
              <p className="text-sm text-muted mt-1">
                Choose an optional FY override for this user. If it is disabled or left empty,
                the website automatically uses the current FY.
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border border-base bg-surface p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-default">Enable website-wide default FY</p>
                  <p className="text-sm text-muted mt-1">
                    When enabled, pages use your selected FY by default after reloads.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFeatureEnabledDraft((current) => !current)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                    featureEnabled
                      ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                      : "border-base bg-card text-muted hover:text-default"
                  }`}
                >
                  <ToggleLeft className={`w-4 h-4 transition-transform ${featureEnabled ? "rotate-180" : ""}`} />
                  {featureEnabled ? "Enabled" : "Disabled"}
                </button>
              </div>
            </div>

            <div>
              <label className="label">Default Financial Year</label>
              <select
                className="input-field"
                value={defaultFinancialYear}
                onChange={(event) => setDefaultFinancialYearDraft(event.target.value)}
                disabled={!featureEnabled}
              >
                <option value="">Use current FY automatically</option>
                {FINANCIAL_YEARS.map((financialYear) => (
                  <option key={financialYear} value={financialYear}>
                    FY {financialYear}
                  </option>
                ))}
              </select>
              <p className="text-xs text-faint mt-2">
                Leaving this empty keeps the app on FY {currentFinancialYear} until you choose a different year.
              </p>
            </div>

            <div className="rounded-2xl border border-base bg-surface p-4">
              <div className="flex items-start gap-3">
                <BellRing className="w-4 h-4 text-amber-500 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-default">New FY reminder</p>
                  <p className="text-sm text-muted mt-1">
                    If your saved default FY is older and the current FY changes later, the website
                    will show a popup asking whether you want to switch to the new current FY.
                  </p>
                </div>
              </div>
            </div>

            <div className="glass-tray" style={{flexWrap:"wrap", marginTop:"8px"}}>
              <button type="button" className="glass-pill glass-pill-active" onClick={handleSave}>
                Save Settings
              </button>
              <button type="button" className="glass-pill" onClick={handleDisable}>
                Disable Feature
              </button>
            </div>
          </div>
        </section>

        <section className="bg-card rounded-2xl border border-base shadow-sm p-5">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300 flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-default">Client Custom Fields</h2>
              <p className="text-sm text-muted mt-1">
                Add extra client fields that appear in create/edit forms, client profiles, search, and custom exports.
              </p>
            </div>
          </div>

          <form onSubmit={saveClientCustomField} className="rounded-2xl border border-base bg-surface p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label">Field Label *</label>
                <input
                  className="input-field"
                  value={fieldForm.label}
                  onChange={(event) => updateFieldLabel(event.target.value)}
                  placeholder="Legal Name"
                  required
                />
              </div>
              <div>
                <label className="label">Field Key *</label>
                <input
                  className="input-field font-mono text-sm"
                  value={fieldForm.key}
                  onChange={(event) => {
                    setKeyTouched(true);
                    setFieldForm((current) => ({ ...current, key: event.target.value }));
                  }}
                  disabled={Boolean(editingFieldId)}
                  placeholder="legalName"
                  required
                />
                <p className="text-[11px] text-faint mt-1">Key is fixed after creation so existing client values stay linked.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="label">Field Type</label>
                <select
                  className="input-field"
                  value={fieldForm.type}
                  onChange={(event) => setFieldForm((current) => ({ ...current, type: event.target.value as ClientCustomFieldType }))}
                >
                  {CLIENT_CUSTOM_FIELD_TYPES.map((type) => (
                    <option key={type.id} value={type.id}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Icon</label>
                <div className="flex gap-2">
                  <div className="h-10 w-10 rounded-xl border border-base bg-card flex items-center justify-center text-muted">
                    {(() => {
                      const Icon = FIELD_ICON_COMPONENTS[fieldForm.icon];
                      return <Icon className="w-4 h-4" />;
                    })()}
                  </div>
                  <select
                    className="input-field flex-1"
                    value={fieldForm.icon}
                    onChange={(event) => setFieldForm((current) => ({ ...current, icon: event.target.value as ClientCustomFieldIcon }))}
                  >
                    {CLIENT_CUSTOM_FIELD_ICONS.map((icon) => (
                      <option key={icon.id} value={icon.id}>{icon.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Profile Position</label>
                <select
                  className="input-field"
                  value={fieldForm.profilePosition}
                  onChange={(event) => setFieldForm((current) => ({ ...current, profilePosition: event.target.value as ClientCustomFieldProfilePosition }))}
                >
                  {CLIENT_CUSTOM_FIELD_PROFILE_POSITIONS.map((position) => (
                    <option key={position.id} value={position.id}>{position.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Display Order</label>
                <input
                  className="input-field font-mono text-sm"
                  type="number"
                  value={fieldForm.order}
                  onChange={(event) => setFieldForm((current) => ({ ...current, order: event.target.value }))}
                  placeholder="Auto"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {[
                ["searchable", "Searchable"],
                ["required", "Required"],
                ["active", "Active"],
                ["showInProfile", "Show In Profile"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 rounded-xl border border-base bg-card px-3 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={Boolean(fieldForm[key as "searchable" | "required" | "active" | "showInProfile"])}
                    onChange={(event) => setFieldForm((current) => ({ ...current, [key]: event.target.checked }))}
                  />
                  <span className="text-sm font-medium text-default">{label}</span>
                </label>
              ))}
            </div>

            <div className="glass-tray" style={{ flexWrap: "wrap" }}>
              <button type="submit" className="glass-pill glass-pill-active" disabled={savingField}>
                {savingField ? "Saving..." : editingFieldId ? "Update Field" : "Add Field"}
              </button>
              {editingFieldId && (
                <button type="button" className="glass-pill" onClick={resetFieldForm}>
                  Cancel Edit
                </button>
              )}
            </div>
          </form>

          <div className="mt-4 space-y-2">
            {fieldsLoading ? (
              <p className="text-sm text-muted">Loading client fields...</p>
            ) : clientCustomFields.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-base px-4 py-5 text-sm text-muted">
                No custom fields yet. Add one like Legal Name and mark it searchable if you want client search to match it.
              </div>
            ) : (
              clientCustomFields.map((field) => (
                <div key={field._id || field.key} className={`rounded-2xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${field.active ? "border-base bg-surface/50" : "border-dashed border-base bg-surface/20 opacity-70"}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-default">{field.label}</p>
                      <span className="font-mono text-[11px] rounded-full bg-card border border-base px-2 py-0.5 text-muted">{field.key}</span>
                      <span className="text-[11px] rounded-full bg-card border border-base px-2 py-0.5 text-muted">{field.type}</span>
                      <span className="text-[11px] rounded-full bg-card border border-base px-2 py-0.5 text-muted">
                        {CLIENT_CUSTOM_FIELD_ICONS.find((icon) => icon.id === (field.icon || "fileText"))?.label || "Document"}
                      </span>
                    </div>
                    <p className="text-xs text-faint mt-1">
                      {field.searchable ? "Searchable" : "Not searchable"} · {field.required ? "Required" : "Optional"} · {field.showInProfile !== false ? "Shown in profile" : "Hidden from profile"} · {field.active ? "Active" : "Disabled"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="glass-pill" onClick={() => editClientCustomField(field)}>
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    {field.active && (
                      <button type="button" className="glass-pill" onClick={() => disableClientCustomField(field)} style={{ color: "#dc2626" }}>
                        <Trash2 className="w-3.5 h-3.5" /> Disable
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ── User Management ───────────────────────────────────────────── */}
        <section className="bg-card rounded-2xl border border-base shadow-sm p-5">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-11 h-11 rounded-2xl bg-violet-50 text-violet-700 dark:bg-violet-900/25 dark:text-violet-300 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-default">User Management</h2>
              <p className="text-sm text-muted mt-1">
                Add users who can log in via Google or password. Google users must use their exact Google account email.
              </p>
            </div>
          </div>

          {/* Add user form */}
          <form onSubmit={saveUser} className="rounded-2xl border border-base bg-surface p-4 space-y-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label">Full Name *</label>
                <input
                  className="input-field"
                  value={userForm.name}
                  onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Jane Smith"
                  required
                />
              </div>
              <div>
                <label className="label">Email *</label>
                <input
                  className="input-field"
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="jane@company.com"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label">Login Method</label>
                <select
                  className="input-field"
                  value={userForm.loginMethod}
                  onChange={(e) => setUserForm((f) => ({ ...f, loginMethod: e.target.value as "google" | "password", password: "" }))}
                >
                  <option value="google">Google OAuth</option>
                  <option value="password">Password</option>
                </select>
              </div>
              {userForm.loginMethod === "password" && (
                <div>
                  <label className="label">Password *</label>
                  <div className="relative">
                    <input
                      className="input-field pr-10"
                      type={showPassword ? "text" : "password"}
                      value={userForm.password}
                      onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))}
                      placeholder="Min 8 characters"
                      required
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-default"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="glass-tray" style={{ flexWrap: "wrap" }}>
              <button type="submit" className="glass-pill glass-pill-active" disabled={savingUser}>
                <Plus className="w-3.5 h-3.5" />
                {savingUser ? "Adding..." : "Add User"}
              </button>
            </div>
          </form>

          {/* User list */}
          <div className="space-y-2">
            {usersLoading ? (
              <p className="text-sm text-muted">Loading users...</p>
            ) : userList.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-base px-4 py-5 text-sm text-muted">
                No managed users yet. Users added here can log in alongside the env-var admin account.
              </div>
            ) : (
              userList.map((u) => (
                <div key={u.id} className="rounded-2xl border border-base bg-surface/50 px-4 py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-card border border-base flex items-center justify-center text-muted flex-shrink-0 mt-0.5">
                      {u.loginMethod === "google" ? <Chrome className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-default">{u.name}</p>
                        <span className={`text-[11px] rounded-full border px-2 py-0.5 ${
                          u.loginMethod === "google"
                            ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800"
                            : "bg-card text-muted border-base"
                        }`}>
                          {u.loginMethod === "google" ? "Google" : "Password"}
                        </span>
                      </div>
                      <p className="text-xs text-muted mt-0.5">{u.email}</p>

                      {/* Inline password reset */}
                      {editingUserId === u.id && u.loginMethod === "password" && (
                        <div className="flex items-center gap-2 mt-2">
                          <div className="relative">
                            <input
                              className="input-field text-sm pr-8"
                              type={showResetPassword ? "text" : "password"}
                              placeholder="New password"
                              value={resetPasswordValue}
                              onChange={(e) => setResetPasswordValue(e.target.value)}
                            />
                            <button
                              type="button"
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted"
                              onClick={() => setShowResetPassword((v) => !v)}
                            >
                              {showResetPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          <button type="button" className="glass-pill glass-pill-active text-xs" onClick={() => resetPassword(u.id)}>
                            Save
                          </button>
                          <button type="button" className="glass-pill text-xs" onClick={resetUserForm}>
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {u.loginMethod === "password" && editingUserId !== u.id && (
                      <button type="button" className="glass-pill" onClick={() => setEditingUserId(u.id)}>
                        <KeyRound className="w-3.5 h-3.5" /> Reset password
                      </button>
                    )}
                    <button
                      type="button"
                      className="glass-pill"
                      style={{ color: "#dc2626" }}
                      disabled={deletingUserId === u.id}
                      onClick={() => deleteUser(u.id, u.name)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {deletingUserId === u.id ? "Removing..." : "Remove"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
        </div>

        <aside className="space-y-4">
          <div className="bg-card rounded-2xl border border-base shadow-sm p-5">
            <p className="text-xs uppercase tracking-wide text-faint mb-3">Current Status</p>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Current FY</span>
                <span className="font-semibold text-default">FY {currentFinancialYear}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Feature</span>
                <span className="font-semibold text-default">{settings.enabled ? "Enabled" : "Disabled"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Saved default FY</span>
                <span className="font-semibold text-default">
                  {settings.defaultFinancialYear ? `FY ${settings.defaultFinancialYear}` : "Not set"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Effective FY now</span>
                <span className="font-semibold text-default">FY {effectiveFinancialYear}</span>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-2xl border border-base shadow-sm p-5">
            <p className="text-xs uppercase tracking-wide text-faint mb-3">How It Works</p>
            <div className="space-y-2 text-sm text-muted">
              <p>1. If disabled, the whole website uses the current FY.</p>
              <p>2. If enabled with a saved FY, pages start from that FY after reload.</p>
              <p>3. You can still temporarily switch FY on individual pages whenever needed.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import type { Session } from "next-auth";
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
import { parseDevice, type ParsedDevice } from "@/lib/device";
import { DeviceOsIcon, BrowserBrandIcon } from "@/components/ui/DeviceBrandIcon";
import { Building2, Calendar, CalendarDays, BellRing, FileText, Hash, Mail, MapPin, Phone, RefreshCw, Shield, ToggleLeft, Plus, Pencil, Trash2, User, UserPlus, Power, PowerOff, CheckCircle2, XCircle, KeyRound, Wifi } from "lucide-react";

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

type ActiveSession = {
  id: string;
  userName: string;
  userEmail: string;
  provider?: "credentials" | "google";
  userAgent?: string;
  ip?: string;
  expires: string;
  createdAt: string;
  updatedAt: string;
  isCurrent: boolean;
};

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  loginId: string;
  loginMethod: "password" | "google" | "both";
  loginMethods: string[];
  hasPasswordLogin: boolean;
  role: "admin" | "user";
  status: "active" | "disabled" | "pending" | "rejected";
  googleStatus: "none" | "pending" | "approved" | "rejected";
  googleRequestedAt?: string | null;
  googleApprovedAt?: string | null;
  createdAt?: string | null;
  originalCreatedAt?: string | null;
  lastLoginAt?: string | null;
  lastLoginProvider?: "credentials" | "google" | null;
  lastLoginIp?: string | null;
  lastLoginUserAgent?: string | null;
};

const emptyUserForm = {
  name: "",
  loginId: "",
  email: "",
  password: "",
  loginMethod: "password" as "password" | "google",
};

function formatIpAddress(ip?: string | null) {
  if (!ip) return "";
  if (ip === "::1" || ip === "127.0.0.1") return `Localhost (${ip})`;
  return ip;
}

function SessionDeviceChips({ device, ip }: { device: ParsedDevice; ip?: string | null }) {
  const formattedIp = formatIpAddress(ip);
  const chipClass = "inline-flex items-center gap-1.5 rounded-full border border-base bg-card/80 px-2.5 py-1 text-[11px] font-medium text-muted";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className={chipClass}>
        <DeviceOsIcon device={device} className="w-3.5 h-3.5 text-sky-500" />
        {device.os} {device.typeLabel}
      </span>
      <span className={chipClass}>
        <BrowserBrandIcon browser={device.browser} className="w-3.5 h-3.5 text-emerald-500" />
        {device.browser}
      </span>
      {formattedIp && (
        <span className={chipClass}>
          <Wifi className="w-3.5 h-3.5 text-amber-500" />
          {formattedIp}
        </span>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const {
    isLoaded,
    settings,
    currentFinancialYear,
    effectiveFinancialYear,
    updateSettings,
  } = useFinancialYearPreference();

  const [featureEnabled, setFeatureEnabledDraft] = useState(false);
  const [defaultFinancialYear, setDefaultFinancialYearDraft] = useState<string>("");
  const [savingFinancialYearSettings, setSavingFinancialYearSettings] = useState(false);
  const [fieldForm, setFieldForm] = useState(emptyFieldForm);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [savingField, setSavingField] = useState(false);
  const [keyTouched, setKeyTouched] = useState(false);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [savingUser, setSavingUser] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const isAdmin = (session?.user as (Session["user"] & { role?: string }) | undefined)?.role === "admin";
  const { data: clientCustomFields, loading: fieldsLoading, refetch: refetchClientCustomFields } =
    useCache<ClientCustomFieldDefinition[]>("/api/client-custom-fields?includeInactive=1", { initialData: [] });
  const { data: managedUsersData, loading: usersLoading, refetch: refetchManagedUsers } =
    useCache<{ users: ManagedUser[] }>("/api/users", { enabled: isAdmin, initialData: { users: [] } });
  const managedUsers = isAdmin ? managedUsersData.users : [];

  useEffect(() => {
    if (!isLoaded) return;
    setFeatureEnabledDraft(settings.enabled);
    setDefaultFinancialYearDraft(settings.defaultFinancialYear || "");
  }, [isLoaded, settings.defaultFinancialYear, settings.enabled]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      await fetch("/api/sessions", { method: "PATCH" }).catch(() => {});
      const response = await fetch("/api/sessions", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error || "Failed to load sessions");
        return;
      }
      setSessions(Array.isArray(body) ? body : []);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const revokeSession = async (sessionId: string) => {
    if (!confirm("Revoke this session? That browser will need to sign in again.")) return;

    setRevokingSessionId(sessionId);
    try {
      const response = await fetch("/api/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error || "Failed to revoke session");
        return;
      }
      toast.success("Session revoked");
      loadSessions();
    } finally {
      setRevokingSessionId(null);
    }
  };

  const refreshManagedUsers = () => {
    if (!isAdmin) return;
    invalidate("/api/users", "/api/sessions");
    refetchManagedUsers();
    loadSessions();
  };

  const saveUser = async (event: FormEvent) => {
    event.preventDefault();
    setSavingUser(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userForm),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error || "Failed to create user");
        return;
      }

      toast.success("User created");
      setUserForm(emptyUserForm);
      refreshManagedUsers();
    } finally {
      setSavingUser(false);
    }
  };

  const updateUserStatus = async (user: ManagedUser, status: ManagedUser["status"]) => {
    const action = status === "active"
      ? user.status === "pending" ? "approve this Google request" : "enable this user"
      : status === "disabled" ? "disable this user and revoke sessions"
      : "reject this Google request";

    if (!confirm(`Are you sure you want to ${action}?`)) return;

    setUpdatingUserId(user.id);
    try {
      const response = await fetch(`/api/users?id=${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error || "Failed to update user");
        return;
      }
      toast.success("User updated");
      refreshManagedUsers();
    } finally {
      setUpdatingUserId(null);
    }
  };

  const updateGoogleStatus = async (user: ManagedUser, googleStatus: ManagedUser["googleStatus"]) => {
    const action = googleStatus === "approved"
      ? "approve Google login for this user"
      : googleStatus === "rejected"
        ? "reject Google login for this user"
        : "clear Google login access for this user";

    if (!confirm(`Are you sure you want to ${action}?`)) return;

    setUpdatingUserId(user.id);
    try {
      const response = await fetch(`/api/users?id=${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleStatus }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error || "Failed to update Google access");
        return;
      }
      toast.success("Google access updated");
      refreshManagedUsers();
    } finally {
      setUpdatingUserId(null);
    }
  };

  const resetUserPassword = async (user: ManagedUser) => {
    const password = prompt(`Enter a new password for ${user.name}`);
    if (!password?.trim()) return;

    setUpdatingUserId(user.id);
    try {
      const response = await fetch(`/api/users?id=${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error || "Failed to reset password");
        return;
      }
      toast.success("Password updated");
      refreshManagedUsers();
    } finally {
      setUpdatingUserId(null);
    }
  };

  const deleteUser = async (user: ManagedUser) => {
    if (!confirm(`Delete ${user.name}? This also revokes all their sessions.`)) return;

    setUpdatingUserId(user.id);
    try {
      const response = await fetch(`/api/users?id=${user.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error || "Failed to delete user");
        return;
      }
      toast.success("User deleted");
      refreshManagedUsers();
    } finally {
      setUpdatingUserId(null);
    }
  };

  const formatSessionDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-IN");
  };

  const formatLoginProvider = (provider?: ManagedUser["lastLoginProvider"]) => {
    if (provider === "google") return "Google";
    if (provider === "credentials") return "Password";
    return "Unknown";
  };

  const summarizeUserAgent = (userAgent?: string | null) => parseDevice(userAgent).label;

  const saveFinancialYearSettings = async (nextSettings: typeof settings) => {
    setSavingFinancialYearSettings(true);
    try {
      const response = await fetch("/api/financial-year-preference", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: nextSettings }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error || "Failed to save financial year settings");
        return false;
      }
      updateSettings(body?.settings || nextSettings);
      return true;
    } finally {
      setSavingFinancialYearSettings(false);
    }
  };

  const handleSave = async () => {
    const nextSettings = {
      ...settings,
      enabled: featureEnabled,
      defaultFinancialYear: defaultFinancialYear || null,
    };
    if (await saveFinancialYearSettings(nextSettings)) {
      toast.success("Financial year settings saved");
    }
  };

  const handleDisable = async () => {
    const nextSettings = {
      ...settings,
      enabled: false,
      pendingReminderCurrentFy: null,
    };
    setFeatureEnabledDraft(false);
    if (await saveFinancialYearSettings(nextSettings)) {
      toast.success("Custom default FY disabled");
    }
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
              <button
                type="button"
                className="glass-pill glass-pill-active"
                onClick={handleSave}
                disabled={savingFinancialYearSettings}
              >
                {savingFinancialYearSettings ? "Saving..." : "Save Settings"}
              </button>
              <button
                type="button"
                className="glass-pill"
                onClick={handleDisable}
                disabled={savingFinancialYearSettings}
              >
                Disable Feature
              </button>
            </div>
          </div>
        </section>

        {isAdmin && (
        <section className="bg-card rounded-2xl border border-base shadow-sm p-5">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-700 dark:bg-indigo-900/25 dark:text-indigo-300 flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-default">User Access</h2>
              <p className="text-sm text-muted mt-1">
                Create ID/password users, approve Google login requests, and disable access when needed.
              </p>
            </div>
          </div>

          <form onSubmit={saveUser} className="rounded-2xl border border-base bg-surface p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="label">Login Type</label>
                <select
                  className="input-field"
                  value={userForm.loginMethod}
                  onChange={(event) => setUserForm((current) => ({
                    ...current,
                    loginMethod: event.target.value as "password" | "google",
                  }))}
                >
                  <option value="password">ID + Password</option>
                  <option value="google">Google Email</option>
                </select>
              </div>
              <div>
                <label className="label">Name *</label>
                <input
                  className="input-field"
                  value={userForm.name}
                  onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Team Member"
                  required
                />
              </div>
              <div>
                <label className="label">{userForm.loginMethod === "google" ? "Email *" : "Login ID *"}</label>
                <input
                  className="input-field"
                  value={userForm.loginMethod === "google" ? userForm.email : userForm.loginId}
                  onChange={(event) => {
                    const value = event.target.value;
                    setUserForm((current) => current.loginMethod === "google"
                      ? { ...current, email: value }
                      : { ...current, loginId: value }
                    );
                  }}
                  placeholder={userForm.loginMethod === "google" ? "person@example.com" : "accounts-team"}
                  required
                />
              </div>
              <div>
                <label className="label">Password {userForm.loginMethod === "password" ? "*" : ""}</label>
                <input
                  className="input-field"
                  type="password"
                  value={userForm.password}
                  onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder={userForm.loginMethod === "password" ? "Required" : "Not used"}
                  required={userForm.loginMethod === "password"}
                  disabled={userForm.loginMethod === "google"}
                  autoComplete="new-password"
                />
              </div>
            </div>

            {userForm.loginMethod === "password" && (
              <div>
                <label className="label">Email</label>
                <input
                  className="input-field"
                  type="email"
                  value={userForm.email}
                  onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="Optional"
                />
              </div>
            )}

            <div className="glass-tray" style={{ flexWrap: "wrap" }}>
              <button type="submit" className="glass-pill glass-pill-active" disabled={savingUser}>
                <UserPlus className="w-3.5 h-3.5" />
                {savingUser ? "Creating..." : "Create User"}
              </button>
            </div>
          </form>

          <div className="mt-4 space-y-2">
            {usersLoading ? (
              <p className="text-sm text-muted">Loading users...</p>
            ) : managedUsers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-base px-4 py-5 text-sm text-muted">
                No users found yet.
              </div>
            ) : (
              managedUsers.map((entry) => {
                const isBusy = updatingUserId === entry.id;
                const statusClass = entry.status === "active"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800"
                  : entry.status === "pending"
                    ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800"
                    : "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800";

                return (
                  <div key={entry.id} className="rounded-2xl border border-base bg-surface/50 px-4 py-3 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-default">{entry.name}</p>
                        <span className={`text-[11px] rounded-full border px-2 py-0.5 ${statusClass}`}>
                          {entry.status}
                        </span>
                        <span className="text-[11px] rounded-full bg-card border border-base px-2 py-0.5 text-muted">
                          {entry.loginMethod === "both" ? "Password + Google" : entry.loginMethod === "google" ? "Google" : "Password"}
                        </span>
                        {entry.googleStatus !== "none" && (
                          <span className={`text-[11px] rounded-full border px-2 py-0.5 ${
                            entry.googleStatus === "approved"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800"
                              : entry.googleStatus === "pending"
                                ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800"
                                : "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800"
                          }`}>
                            Google {entry.googleStatus}
                          </span>
                        )}
                        {entry.role === "admin" && (
                          <span className="text-[11px] rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-brand-700 dark:bg-brand-900/25 dark:border-brand-900/50 dark:text-brand-300">
                            Admin
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted mt-1">
                        {entry.loginId || "No login ID"} {entry.email ? `- ${entry.email}` : ""}
                      </p>
                      <p className="text-xs text-faint mt-1">
                        Created {entry.createdAt ? formatSessionDate(entry.createdAt) : "-"}
                        {entry.googleRequestedAt ? ` - Google requested ${formatSessionDate(entry.googleRequestedAt)}` : ""}
                      </p>
                      <p className="text-xs text-faint mt-1">
                        Last login {entry.lastLoginAt ? formatSessionDate(entry.lastLoginAt) : "-"}
                        {entry.lastLoginAt ? ` - ${formatLoginProvider(entry.lastLoginProvider)}` : ""}
                        {entry.lastLoginIp ? ` - ${formatIpAddress(entry.lastLoginIp)}` : ""}
                        {entry.lastLoginUserAgent ? ` - ${summarizeUserAgent(entry.lastLoginUserAgent)}` : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {entry.googleStatus === "pending" && (
                        <>
                          <button type="button" className="glass-pill" onClick={() => updateGoogleStatus(entry, "approved")} disabled={isBusy} style={{ color: "#059669" }}>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button type="button" className="glass-pill" onClick={() => updateGoogleStatus(entry, "rejected")} disabled={isBusy} style={{ color: "#dc2626" }}>
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </button>
                        </>
                      )}
                      {entry.status === "active" ? (
                        <button type="button" className="glass-pill" onClick={() => updateUserStatus(entry, "disabled")} disabled={isBusy} style={{ color: "#dc2626" }}>
                          <PowerOff className="w-3.5 h-3.5" /> Disable
                        </button>
                      ) : entry.status !== "pending" && (
                        <button type="button" className="glass-pill" onClick={() => updateUserStatus(entry, "active")} disabled={isBusy} style={{ color: "#059669" }}>
                          <Power className="w-3.5 h-3.5" /> Enable
                        </button>
                      )}
                      {entry.hasPasswordLogin && (
                        <button type="button" className="glass-pill" onClick={() => resetUserPassword(entry)} disabled={isBusy}>
                          <KeyRound className="w-3.5 h-3.5" /> Password
                        </button>
                      )}
                      <button type="button" className="glass-pill" onClick={() => deleteUser(entry)} disabled={isBusy} style={{ color: "#dc2626" }}>
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
        )}

        <section className="bg-card rounded-2xl border border-base shadow-sm p-5">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-sky-50 text-sky-700 dark:bg-sky-900/25 dark:text-sky-300 flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-default">Active Sessions</h2>
                <p className="text-sm text-muted mt-1">
                  Review signed-in browsers and revoke access when needed.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="glass-pill"
              onClick={loadSessions}
              disabled={sessionsLoading}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${sessionsLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          <div className="space-y-2">
            {sessionsLoading && sessions.length === 0 ? (
              <p className="text-sm text-muted">Loading active sessions...</p>
            ) : sessions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-base px-4 py-5 text-sm text-muted">
                No active database sessions found.
              </div>
            ) : (
              sessions.map((entry) => {
                const device = parseDevice(entry.userAgent);
                const provider = entry.provider === "google" ? "Google" : "Password";

                return (
                <div key={entry.id} className="rounded-2xl border border-base bg-surface/50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-default">{entry.userName || entry.userEmail || "User session"}</p>
                      {entry.isCurrent && (
                        <span className="text-[11px] rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-brand-700 dark:bg-brand-900/25 dark:border-brand-900/50 dark:text-brand-300">
                          Current
                        </span>
                      )}
                      <span className="text-[11px] rounded-full bg-card border border-base px-2 py-0.5 text-muted">
                        {provider}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-1">{entry.userEmail || "No email saved"}</p>
                    <SessionDeviceChips device={device} ip={entry.ip} />
                    <p className="text-xs text-faint mt-1">
                      Created {formatSessionDate(entry.createdAt)} · Last active {formatSessionDate(entry.updatedAt)} · Expires {formatSessionDate(entry.expires)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="glass-pill"
                    onClick={() => revokeSession(entry.id)}
                    disabled={entry.isCurrent || revokingSessionId === entry.id}
                    style={{ color: entry.isCurrent ? undefined : "#dc2626" }}
                    title={entry.isCurrent ? "Sign out from the top bar to end this session" : "Revoke session"}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {revokingSessionId === entry.id ? "Revoking..." : entry.isCurrent ? "Current Session" : "Revoke"}
                  </button>
                </div>
                );
              })
            )}
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

"use client";
import { useState, useEffect } from "react";
import { BellRing } from "lucide-react";
import toast from "react-hot-toast";
import { useFinancialYearPreference } from "@/app/providers";
import { FINANCIAL_YEARS } from "@/lib/utils";

/** Apple-style iOS toggle */
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-[28px] w-[50px] flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-40 ${
        checked ? "bg-[#34C759]" : "bg-[var(--color-border)]"
      }`}
      style={{ boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.1)" }}
    >
      <span
        className={`inline-block h-[24px] w-[24px] transform rounded-full bg-white shadow-md transition-transform duration-200 mt-[2px] ${
          checked ? "translate-x-[23px]" : "translate-x-[2px]"
        }`}
        style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(0,0,0,0.06)" }}
      />
    </button>
  );
}

/** Apple-style grouped section */
function SettingsGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <p className="text-[11px] font-medium uppercase tracking-wider text-faint px-1">
          {label}
        </p>
      )}
      <div className="rounded-2xl overflow-hidden border border-[var(--color-border)] bg-card divide-y divide-[var(--color-border)]">
        {children}
      </div>
    </div>
  );
}

/** Single row inside a settings group */
function SettingsRow({
  label,
  subtitle,
  children,
}: {
  label: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 min-h-[52px]">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-default leading-snug">{label}</p>
        {subtitle && <p className="text-xs text-muted mt-0.5 leading-snug">{subtitle}</p>}
      </div>
      {children && <div className="flex-shrink-0">{children}</div>}
    </div>
  );
}

/** Status badge */
function Badge({ children, variant = "neutral" }: { children: React.ReactNode; variant?: "green" | "blue" | "neutral" }) {
  const colors = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800",
    blue: "bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-900/20 dark:text-brand-300 dark:border-brand-800",
    neutral: "bg-[var(--color-surface)] text-muted border-[var(--color-border)]",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors[variant]}`}>
      {children}
    </span>
  );
}

export default function GeneralPanel() {
  const {
    isLoaded,
    settings,
    currentFinancialYear,
    effectiveFinancialYear,
    updateSettings,
  } = useFinancialYearPreference();

  const [featureEnabled, setFeatureEnabledDraft] = useState(false);
  const [defaultFinancialYear, setDefaultFinancialYearDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    setFeatureEnabledDraft(settings.enabled);
    setDefaultFinancialYearDraft(settings.defaultFinancialYear || "");
  }, [isLoaded, settings.defaultFinancialYear, settings.enabled]);

  const saveFinancialYearSettings = async (nextSettings: typeof settings) => {
    setSaving(true);
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
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const nextSettings = {
      ...settings,
      enabled: featureEnabled,
      defaultFinancialYear: defaultFinancialYear || null,
    };
    if (await saveFinancialYearSettings(nextSettings)) {
      toast.success("Settings saved");
    }
  };

  const handleDisable = async () => {
    const nextSettings = { ...settings, enabled: false, pendingReminderCurrentFy: null };
    setFeatureEnabledDraft(false);
    if (await saveFinancialYearSettings(nextSettings)) {
      toast.success("FY override disabled");
    }
  };

  if (!isLoaded) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-2xl bg-[var(--color-border)] opacity-40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Financial year settings */}
      <SettingsGroup label="Financial Year">
        <SettingsRow
          label="Enable FY override"
          subtitle="Pages use your selected FY by default after reload"
        >
          <Toggle
            checked={featureEnabled}
            onChange={() => setFeatureEnabledDraft((c) => !c)}
            disabled={saving}
          />
        </SettingsRow>

        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className={`text-sm font-medium ${featureEnabled ? "text-default" : "text-muted"}`}>
              Default financial year
            </p>
          </div>
          <select
            className="w-full text-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-default px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] transition disabled:opacity-40"
            value={defaultFinancialYear}
            onChange={(e) => setDefaultFinancialYearDraft(e.target.value)}
            disabled={!featureEnabled || saving}
          >
            <option value="">Use current FY automatically</option>
            {FINANCIAL_YEARS.map((fy) => (
              <option key={fy} value={fy}>FY {fy}</option>
            ))}
          </select>
          <p className="text-xs text-faint mt-1.5">
            Leave empty to always use FY {currentFinancialYear} automatically.
          </p>
        </div>
      </SettingsGroup>

      {/* Reminder info */}
      <SettingsGroup label="About Reminders">
        <div className="flex items-start gap-3 px-4 py-3.5">
          <div className="w-8 h-8 rounded-[9px] bg-amber-50 text-amber-600 dark:bg-amber-900/25 dark:text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
            <BellRing className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-default">New FY reminder</p>
            <p className="text-xs text-muted mt-0.5 leading-relaxed">
              If your saved FY becomes outdated when a new financial year begins, a prompt will appear asking if you want to switch.
            </p>
          </div>
        </div>
      </SettingsGroup>

      {/* Current status */}
      <SettingsGroup label="Current Status">
        <SettingsRow label="Current FY">
          <Badge variant="blue">FY {currentFinancialYear}</Badge>
        </SettingsRow>
        <SettingsRow label="Override feature">
          <Badge variant={settings.enabled ? "green" : "neutral"}>
            {settings.enabled ? "Enabled" : "Disabled"}
          </Badge>
        </SettingsRow>
        <SettingsRow label="Saved default">
          <span className="text-sm text-muted">
            {settings.defaultFinancialYear ? `FY ${settings.defaultFinancialYear}` : "Not set"}
          </span>
        </SettingsRow>
        <SettingsRow label="Effective FY now">
          <span className="text-sm font-semibold text-default">FY {effectiveFinancialYear}</span>
        </SettingsRow>
      </SettingsGroup>

      {/* How it works */}
      <SettingsGroup label="How It Works">
        {[
          "If disabled, every page uses the current financial year.",
          "If enabled with a saved FY, pages load with that FY after reload.",
          "You can still switch FY temporarily on any individual page.",
        ].map((text, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3">
            <span className="w-5 h-5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">
              {i + 1}
            </span>
            <p className="text-sm text-muted leading-relaxed">{text}</p>
          </div>
        ))}
      </SettingsGroup>

      {/* Actions */}
      <SettingsGroup>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full px-4 py-3.5 text-sm font-semibold text-[#007AFF] text-center hover:bg-[var(--color-hover)] active:opacity-70 transition-colors disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
        <button
          type="button"
          onClick={handleDisable}
          disabled={saving}
          className="w-full px-4 py-3.5 text-sm font-medium text-[#FF3B30] text-center hover:bg-[var(--color-hover)] active:opacity-70 transition-colors disabled:opacity-40"
        >
          Disable Feature
        </button>
      </SettingsGroup>

    </div>
  );
}

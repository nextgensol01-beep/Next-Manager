"use client";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import PageHeader from "@/components/ui/PageHeader";
import { useFinancialYearPreference } from "@/app/providers";
import { FINANCIAL_YEARS } from "@/lib/utils";
import { CalendarDays, BellRing, ToggleLeft } from "lucide-react";

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configure your website-wide financial year preference and reminder behavior"
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
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

"use client";
import { SessionProvider, useSession } from "next-auth/react";
import { Toaster } from "react-hot-toast";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import { CURRENT_FY, FINANCIAL_YEARS } from "@/lib/utils";
import { getFinancialYearPreferenceCacheKey } from "@/lib/financialYearPreferenceCache";

interface ThemeContextValue {
  dark: boolean;
  toggle: () => void;
}

interface FinancialYearSettings {
  enabled: boolean;
  defaultFinancialYear: string | null;
  lastKnownCurrentFy: string | null;
  pendingReminderCurrentFy: string | null;
}

interface FinancialYearContextValue {
  isLoaded: boolean;
  currentFinancialYear: string;
  effectiveFinancialYear: string;
  hasCustomDefault: boolean;
  settings: FinancialYearSettings;
  updateSettings: (next: Partial<FinancialYearSettings>) => void;
  setFeatureEnabled: (enabled: boolean) => void;
  setDefaultFinancialYear: (financialYear: string | null) => void;
  applyCurrentFinancialYear: () => void;
  dismissReminderUntilLater: () => void;
}

const ThemeCtx = createContext<ThemeContextValue>({ dark: false, toggle: () => {} });
export const ThemeContext = ThemeCtx;
export const useTheme = () => useContext(ThemeCtx);

const DEFAULT_FINANCIAL_YEAR_SETTINGS: FinancialYearSettings = {
  enabled: false,
  defaultFinancialYear: null,
  lastKnownCurrentFy: null,
  pendingReminderCurrentFy: null,
};

const FinancialYearCtx = createContext<FinancialYearContextValue>({
  isLoaded: false,
  currentFinancialYear: CURRENT_FY,
  effectiveFinancialYear: CURRENT_FY,
  hasCustomDefault: false,
  settings: DEFAULT_FINANCIAL_YEAR_SETTINGS,
  updateSettings: () => {},
  setFeatureEnabled: () => {},
  setDefaultFinancialYear: () => {},
  applyCurrentFinancialYear: () => {},
  dismissReminderUntilLater: () => {},
});

export const FinancialYearContext = FinancialYearCtx;
export const useFinancialYearPreference = () => useContext(FinancialYearCtx);

function isValidFinancialYear(financialYear: unknown): financialYear is string {
  return typeof financialYear === "string" && FINANCIAL_YEARS.includes(financialYear);
}

function normalizeFinancialYearSettings(value: unknown): FinancialYearSettings {
  const source = value && typeof value === "object"
    ? value as Partial<FinancialYearSettings>
    : {};

  const enabled = Boolean(source.enabled);
  const defaultFinancialYear = isValidFinancialYear(source.defaultFinancialYear)
    ? source.defaultFinancialYear
    : null;

  const lastKnownCurrentFy = isValidFinancialYear(source.lastKnownCurrentFy)
    ? source.lastKnownCurrentFy
    : null;

  let pendingReminderCurrentFy = isValidFinancialYear(source.pendingReminderCurrentFy)
    ? source.pendingReminderCurrentFy
    : null;

  if (!enabled || !defaultFinancialYear || defaultFinancialYear === CURRENT_FY) {
    pendingReminderCurrentFy = null;
  }

  return {
    enabled,
    defaultFinancialYear,
    lastKnownCurrentFy,
    pendingReminderCurrentFy,
  };
}

function getSessionAccountKey(user?: { email?: string | null; id?: string | null; name?: string | null }) {
  return user?.id || user?.email?.toLowerCase() || user?.name || "anonymous";
}

function prepareFinancialYearSettings(value: unknown) {
  const settings = normalizeFinancialYearSettings(value);
  let shouldShowReminder = false;

  if (settings.enabled && settings.defaultFinancialYear && settings.defaultFinancialYear !== CURRENT_FY) {
    if (settings.lastKnownCurrentFy && settings.lastKnownCurrentFy !== CURRENT_FY) {
      settings.pendingReminderCurrentFy = CURRENT_FY;
      shouldShowReminder = true;
    } else if (settings.pendingReminderCurrentFy === CURRENT_FY) {
      shouldShowReminder = true;
    }
  }

  settings.lastKnownCurrentFy = CURRENT_FY;
  return { settings: normalizeFinancialYearSettings(settings), shouldShowReminder };
}

function AppClientProviders({ children, dark }: { children: React.ReactNode; dark: boolean }) {
  const { data: session, status } = useSession();
  const sessionUser = session?.user as { email?: string | null; id?: string | null; name?: string | null } | undefined;
  const accountKey = useMemo(
    () => getSessionAccountKey(sessionUser),
    [sessionUser]
  );
  const cacheKey = useMemo(
    () => getFinancialYearPreferenceCacheKey(accountKey),
    [accountKey]
  );

  const [financialYearSettings, setFinancialYearSettings] = useState<FinancialYearSettings>(DEFAULT_FINANCIAL_YEAR_SETTINGS);
  const [loadedFinancialYearAccountKey, setLoadedFinancialYearAccountKey] = useState<string | null>(null);
  const [accountSettingsReady, setAccountSettingsReady] = useState(false);
  const [showFinancialYearReminder, setShowFinancialYearReminder] = useState(false);
  const financialYearLoaded = loadedFinancialYearAccountKey === accountKey;

  useEffect(() => {
    if (status === "loading") return;

    let cancelled = false;
    setLoadedFinancialYearAccountKey(null);
    setAccountSettingsReady(false);

    const loadSettings = async () => {
      let cachedSettings: FinancialYearSettings | null = null;

      const applySettings = (value: unknown, loadedFromAccount: boolean) => {
        if (cancelled) return;
        const prepared = prepareFinancialYearSettings(value);
        setFinancialYearSettings(prepared.settings);
        setShowFinancialYearReminder(prepared.shouldShowReminder);
        setAccountSettingsReady(loadedFromAccount);
        setLoadedFinancialYearAccountKey(accountKey);
      };

      if (status === "authenticated") {
        const rawCache = window.localStorage.getItem(cacheKey);
        if (rawCache) {
          try {
            cachedSettings = normalizeFinancialYearSettings(JSON.parse(rawCache));
            applySettings(cachedSettings, false);
          } catch {
            window.localStorage.removeItem(cacheKey);
          }
        }

        try {
          const response = await fetch("/api/financial-year-preference", { cache: "no-store" });
          const body = await response.json().catch(() => null);
          if (response.ok) {
            const accountSettings = normalizeFinancialYearSettings(body?.settings);
            window.localStorage.setItem(cacheKey, JSON.stringify(accountSettings));
            applySettings(accountSettings, true);
            return;
          }
        } catch {
          // The account-scoped cache remains available while the server is unreachable.
        }

        applySettings(cachedSettings || DEFAULT_FINANCIAL_YEAR_SETTINGS, false);
        return;
      }

      applySettings(DEFAULT_FINANCIAL_YEAR_SETTINGS, false);
    };

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, [accountKey, cacheKey, status]);

  useEffect(() => {
    if (!financialYearLoaded || status !== "authenticated") return;
    window.localStorage.setItem(cacheKey, JSON.stringify(financialYearSettings));
    if (!accountSettingsReady) return;

    const timer = window.setTimeout(() => {
      fetch("/api/financial-year-preference", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: financialYearSettings }),
      }).catch(() => {});
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [accountSettingsReady, cacheKey, financialYearLoaded, financialYearSettings, status]);

  const setFeatureEnabled = (enabled: boolean) => {
    setFinancialYearSettings((current) => normalizeFinancialYearSettings({
      ...current,
      enabled,
      pendingReminderCurrentFy: enabled ? current.pendingReminderCurrentFy : null,
    }));

    if (!enabled) {
      setShowFinancialYearReminder(false);
    }
  };

  const setDefaultFinancialYear = (financialYear: string | null) => {
    setFinancialYearSettings((current) => normalizeFinancialYearSettings({
      ...current,
      defaultFinancialYear: isValidFinancialYear(financialYear) ? financialYear : null,
    }));

    if (!financialYear || financialYear === CURRENT_FY) {
      setShowFinancialYearReminder(false);
    }
  };

  const updateSettings = (next: Partial<FinancialYearSettings>) => {
    setFinancialYearSettings((current) => normalizeFinancialYearSettings({
      ...current,
      ...next,
    }));

    if (
      next.enabled === false ||
      next.defaultFinancialYear === null ||
      next.defaultFinancialYear === CURRENT_FY
    ) {
      setShowFinancialYearReminder(false);
    }
  };

  const applyCurrentFinancialYear = () => {
    setFinancialYearSettings((current) => normalizeFinancialYearSettings({
      ...current,
      enabled: true,
      defaultFinancialYear: CURRENT_FY,
      lastKnownCurrentFy: CURRENT_FY,
      pendingReminderCurrentFy: null,
    }));
    setShowFinancialYearReminder(false);
  };

  const dismissReminderUntilLater = () => {
    setShowFinancialYearReminder(false);
  };

  const effectiveFinancialYear = (
    financialYearSettings.enabled && financialYearSettings.defaultFinancialYear
      ? financialYearSettings.defaultFinancialYear
      : CURRENT_FY
  );

  return (
    <FinancialYearCtx.Provider
      value={{
        isLoaded: financialYearLoaded,
        currentFinancialYear: CURRENT_FY,
        effectiveFinancialYear,
        hasCustomDefault: Boolean(financialYearSettings.enabled && financialYearSettings.defaultFinancialYear),
        settings: financialYearSettings,
        updateSettings,
        setFeatureEnabled,
        setDefaultFinancialYear,
        applyCurrentFinancialYear,
        dismissReminderUntilLater,
      }}
    >
      {children}
      <Modal
        open={showFinancialYearReminder}
        onClose={dismissReminderUntilLater}
        title="New Financial Year Started"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted leading-6">
            A new financial year has started. Your default FY is still{" "}
            <span className="font-semibold text-default">FY {financialYearSettings.defaultFinancialYear}</span>,
            while the current FY is{" "}
            <span className="font-semibold text-default">FY {CURRENT_FY}</span>.
            Would you like to update your default FY to the current FY?
          </p>
          <div className="bg-surface rounded-xl border border-base p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Current website default</span>
              <span className="font-semibold text-default">FY {effectiveFinancialYear}</span>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" className="btn-primary flex-1 justify-center" onClick={applyCurrentFinancialYear}>
              OK
            </button>
            <button type="button" className="btn-secondary" onClick={dismissReminderUntilLater}>
              Remind Me Later
            </button>
          </div>
        </div>
      </Modal>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: dark ? "#161b22" : "#fff",
            color: dark ? "#e6edf3" : "#1e293b",
            border: `1px solid ${dark ? "#30363d" : "#e2e8f0"}`,
          },
        }}
      />
    </FinancialYearCtx.Provider>
  );
}

export function useFinancialYearState() {
  const { effectiveFinancialYear, isLoaded } = useFinancialYearPreference();
  const previousDefaultRef = useRef(effectiveFinancialYear);
  const [financialYear, setFinancialYear] = useState(effectiveFinancialYear);
  const displayFinancialYear = isLoaded && financialYear === previousDefaultRef.current
    ? effectiveFinancialYear
    : financialYear;

  useEffect(() => {
    const previousDefault = previousDefaultRef.current;
    setFinancialYear((current) => (
      current === previousDefault ? effectiveFinancialYear : current
    ));
    previousDefaultRef.current = effectiveFinancialYear;
  }, [effectiveFinancialYear]);

  return [displayFinancialYear, setFinancialYear, isLoaded] as const;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = saved ? saved === "dark" : prefersDark;
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <ThemeCtx.Provider value={{ dark, toggle }}>
      <SessionProvider>
        <AppClientProviders dark={dark}>{children}</AppClientProviders>
      </SessionProvider>
    </ThemeCtx.Provider>
  );
}

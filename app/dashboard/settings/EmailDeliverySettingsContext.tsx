"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Modal from "@/components/ui/Modal";
import { GlassButton } from "@/components/ui/liquid-glass";
import type { DeliveryPolicy, DeliverySecurityView } from "@/lib/email-delivery-security";
import { changedDeliveryPolicyKeys, normalizeDeliveryPolicy, rebaseDeliveryPolicy } from "@/lib/email-delivery-settings-draft";
import { securityFetch } from "@/lib/email-delivery-security-client";

type DraftData = { settings: DeliverySecurityView | null; policy: DeliveryPolicy | null };
type PanelRegistration = { element: () => HTMLElement | null; openSave: () => void };
type DeliverySettingsState = DraftData & {
  loadingError: string;
  saving: boolean;
  reviewing: boolean;
  saveError: string;
  justSaved: boolean;
  changedKeys: Array<keyof DeliveryPolicy>;
  load: () => Promise<void>;
  update: <K extends keyof DeliveryPolicy>(key: K, value: DeliveryPolicy[K]) => void;
  discard: () => void;
  requestSave: () => Promise<void>;
  saveStarted: () => void;
  saveFailed: (message: string) => void;
  acceptSaved: (result: DeliverySecurityView, policySave: boolean) => void;
  cancelReview: (preserveNavigation?: boolean) => void;
  navigate: (proceed: () => void) => void;
  registerPanel: (id: string, panel: PanelRegistration) => () => void;
};
const Context = createContext<DeliverySettingsState | null>(null);
export const useOptionalEmailDeliverySettings = () => useContext(Context);
export function useEmailDeliverySettings() {
  const context = useContext(Context);
  if (!context) throw new Error("Email delivery settings provider is missing.");
  return context;
}

/** Shared by the shell's desktop and mobile panels, including across tab switches. */
export function EmailDeliverySettingsProvider({ children, navigateHref }: { children: ReactNode; navigateHref?: (href: string) => void }) {
  const [data, setData] = useState<DraftData>({ settings: null, policy: null });
  const dataRef = useRef(data);
  const [loadingError, setLoadingError] = useState("");
  const [saving, setSaving] = useState(false), [reviewing, setReviewing] = useState(false);
  const [saveError, setSaveError] = useState(""), [justSaved, setJustSaved] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const busyRef = useRef(false);
  const loadRef = useRef<Promise<void> | null>(null);
  const panels = useRef(new Map<string, PanelRegistration>());
  const pendingNavigation = useRef<(() => void) | null>(null);
  const errorRef = useRef(saveError);
  errorRef.current = saveError;
  const changedKeys = data.settings && data.policy ? changedDeliveryPolicyKeys(data.settings, data.policy) : [];
  const dirty = changedKeys.length > 0;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const publish = useCallback((result: DeliverySecurityView, policySave: boolean) => {
    const current = dataRef.current;
    const next = {
      settings: result,
      policy: !policySave && current.settings && current.policy
        ? rebaseDeliveryPolicy(current.settings, current.policy, result)
        : normalizeDeliveryPolicy(result),
    };
    dataRef.current = next;
    setData(next);
  }, []);

  const load = useCallback(async () => {
    if (dataRef.current.settings) return;
    if (loadRef.current) return loadRef.current;
    loadRef.current = (async () => {
      try {
        const result = await securityFetch<DeliverySecurityView>("/api/settings/email-delivery-security");
        publish(result, false);
        setLoadingError("");
      } catch (error) {
        setLoadingError(error instanceof Error ? error.message : "Unable to load delivery settings.");
      } finally { loadRef.current = null; }
    })();
    return loadRef.current;
  }, [publish]);

  const discard = useCallback(() => {
    const current = dataRef.current;
    if (!current.settings || busyRef.current) return;
    const next = { ...current, policy: normalizeDeliveryPolicy(current.settings) };
    dataRef.current = next;
    setData(next);
    setSaveError("");
    setJustSaved(false);
    pendingNavigation.current = null;
  }, []);

  const requestSave = useCallback(async () => {
    if (busyRef.current || (!dirtyRef.current && !errorRef.current)) return;
    busyRef.current = true;
    setReviewing(true);
    setJustSaved(false);
    try {
      // Retry against the current server version without losing the user's edits.
      if (errorRef.current) {
        const result = await securityFetch<DeliverySecurityView>("/api/settings/email-delivery-security");
        publish(result, false);
        const latest = dataRef.current;
        if (latest.policy && !changedDeliveryPolicyKeys(result, latest.policy).length) {
          setSaveError("");
          setReviewing(false);
          busyRef.current = false;
          setJustSaved(true);
          const proceed = pendingNavigation.current;
          pendingNavigation.current = null;
          proceed?.();
          return;
        }
      }
      const panel = [...panels.current.values()].find(panel => panel.element()?.getClientRects().length);
      if (!panel) throw new Error("Open Email & Delivery to save these changes.");
      setSaveError("");
      panel.openSave();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Couldn't save settings. Your changes are still here.");
      busyRef.current = false;
      setReviewing(false);
    }
  }, [publish]);

  const cancelReview = useCallback((preserveNavigation = false) => {
    busyRef.current = false;
    setReviewing(false);
    if (!preserveNavigation) pendingNavigation.current = null;
  }, []);
  const acceptSaved = useCallback((result: DeliverySecurityView, policySave: boolean) => {
    publish(result, policySave);
    if (policySave) {
      busyRef.current = false;
      setSaving(false);
      setReviewing(false);
      setSaveError("");
      setJustSaved(true);
      const proceed = pendingNavigation.current;
      pendingNavigation.current = null;
      proceed?.();
    }
  }, [publish]);
  const navigate = useCallback((proceed: () => void) => {
    if (!dirtyRef.current) { proceed(); return; }
    pendingNavigation.current = proceed;
    setLeaveOpen(true);
  }, []);
  const registerPanel = useCallback((id: string, panel: PanelRegistration) => {
    panels.current.set(id, panel);
    return () => { panels.current.delete(id); };
  }, []);

  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), 550);
    return () => clearTimeout(timer);
  }, [justSaved]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!dirty || !navigateHref) return;
    // Scoped to this settings provider while dirty; no router/history patching.
    const guardLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      event.preventDefault();
      event.stopPropagation();
      navigate(() => navigateHref(`${url.pathname}${url.search}${url.hash}`));
    };
    document.addEventListener("click", guardLink, true);
    return () => document.removeEventListener("click", guardLink, true);
  }, [dirty, navigateHref, navigate]);

  return <Context.Provider value={{
    ...data, loadingError, saving, reviewing, saveError, justSaved, changedKeys, load, discard, requestSave,
    update: (key, value) => {
      if (busyRef.current || !dataRef.current.policy) return;
      const next = { ...dataRef.current, policy: { ...dataRef.current.policy, [key]: value } };
      dataRef.current = next;
      setData(next);
      setSaveError("");
      setJustSaved(false);
    },
    saveStarted: () => { setSaving(true); setSaveError(""); },
    saveFailed: message => { setSaving(false); setSaveError(message); },
    acceptSaved, cancelReview, navigate, registerPanel,
  }}>
    {children}
    {leaveOpen && <Modal open title="Unsaved changes" hideHeader className="email-delivery-unsaved-modal h-auto" onClose={() => { setLeaveOpen(false); pendingNavigation.current = null; }}>
      <div className="email-security-content">
        <h3 className="text-lg font-semibold">Unsaved changes</h3>
        <p>You have changes in Email &amp; Delivery that haven&apos;t been saved.</p>
        <div className="email-security-actions">
          <GlassButton autoFocus onClick={() => { setLeaveOpen(false); pendingNavigation.current = null; }}>Keep editing</GlassButton>
          <GlassButton onClick={() => {
            const proceed = pendingNavigation.current;
            discard();
            setLeaveOpen(false);
            proceed?.();
          }}>Discard changes</GlassButton>
          <GlassButton className="email-delivery-save-primary" onClick={() => {
            setLeaveOpen(false);
            // Let the warning's focus trap unmount before opening verification.
            requestAnimationFrame(() => { void requestSave(); });
          }}>Save &amp; continue</GlassButton>
        </div>
      </div>
    </Modal>}
  </Context.Provider>;
}

"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import SettingsSidebar, { SETTINGS_TABS } from "./SettingsSidebar";
import GeneralPanel from "./GeneralPanel";
import AccessPanel from "./AccessPanel";
import CustomFieldsPanel from "./CustomFieldsPanel";

const PANELS = [GeneralPanel, AccessPanel, CustomFieldsPanel];
const ANIM_DURATION = 280;
const LARGE_TITLE_THRESHOLD = 52;

// Map tab index <-> URL param value
const TAB_SLUGS = ["general", "access", "custom-fields"];

export default function SettingsShell() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Desktop: local state only (URL param ignored) ──
  const [desktopTab, setDesktopTab] = useState(0);
  const [exitingTab, setExitingTab] = useState<number | null>(null);
  const animatingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Mobile: derive active tab + view from URL param ──
  const tabParam = searchParams.get("tab");
  const mobileTabIndex = TAB_SLUGS.indexOf(tabParam ?? "");
  const activeTabMobile = mobileTabIndex >= 0 ? mobileTabIndex : 0;
  const mobileView = tabParam ? "detail" : "list";

  // ── Scroll tracking for large title ──
  const [listScrollY, setListScrollY] = useState(0);
  const listScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Reset scroll when going back to list
  useEffect(() => {
    if (!tabParam && listScrollRef.current) {
      listScrollRef.current.scrollTop = 0;
      setListScrollY(0);
    }
  }, [tabParam]);

  const handleListScroll = useCallback(() => {
    if (listScrollRef.current) setListScrollY(listScrollRef.current.scrollTop);
  }, []);

  const largeTitleOpacity = Math.max(0, 1 - listScrollY / LARGE_TITLE_THRESHOLD);
  const smallTitleOpacity = Math.min(1, listScrollY / LARGE_TITLE_THRESHOLD);
  const largeTitleTranslate = Math.min(16, listScrollY * 0.3);
  const isScrolled = listScrollY > 0;

  // ── Desktop tab selection (local state + animation) ──
  const selectDesktopTab = (index: number) => {
    if (animatingRef.current || index === desktopTab) return;
    animatingRef.current = true;
    setExitingTab(desktopTab);
    setDesktopTab(index);
    timerRef.current = setTimeout(() => {
      setExitingTab(null);
      animatingRef.current = false;
    }, ANIM_DURATION);
  };

  // ── Mobile tab selection (push URL param → browser history) ──
  const selectMobileTab = (index: number) => {
    router.push(`?tab=${TAB_SLUGS[index]}`);
  };

  // ── Mobile go back (pop URL → browser back) ──
  const goBack = () => router.back();

  const DesktopActivePanel = PANELS[desktopTab];
  const DesktopExitingPanel = exitingTab !== null ? PANELS[exitingTab] : null;
  const MobileActivePanel = PANELS[activeTabMobile];

  return (
    <>
      {/* ── Desktop / iPad layout (md+) ── */}
      <div className="hidden md:flex h-full rounded-2xl overflow-hidden border border-[var(--color-border)] bg-card shadow-sm">
        <div className="w-[220px] flex-shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] py-3 flex flex-col">
          <p className="px-4 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-widest text-faint">
            Settings
          </p>
          <SettingsSidebar activeTab={desktopTab} onSelect={selectDesktopTab} />
        </div>
        <div className="flex-1 min-w-0 overflow-y-auto bg-[var(--color-surface)]">
          <div className="relative overflow-hidden min-h-full">
            {DesktopExitingPanel && (
              <div
                key={`exit-${exitingTab}`}
                className="panel-exit absolute inset-0 px-6 py-5"
                style={{ pointerEvents: "none" }}
              >
                <DesktopExitingPanel />
              </div>
            )}
            <div
              key={`enter-${desktopTab}`}
              className={exitingTab !== null ? "panel-enter" : ""}
              style={{ padding: "20px 24px 32px" }}
            >
              <DesktopActivePanel />
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile layout ── */}
      <div className="md:hidden" style={{ position: "relative", height: "100%", overflow: "hidden" }}>

        {/* ── LIST VIEW ── */}
        <div
          className={`absolute inset-0 transition-transform duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
            mobileView === "list" ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{ zIndex: mobileView === "list" ? 10 : 5, backgroundColor: "var(--color-surface)" }}
        >
          {/* Scroll area */}
          <div
            ref={listScrollRef}
            onScroll={handleListScroll}
            className="absolute inset-0 overflow-y-auto overflow-x-hidden"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div style={{ height: "44px" }} />

            {/* Large title */}
            <div
              className="px-4 pt-1 pb-2"
              style={{
                opacity: largeTitleOpacity,
                transform: `translateY(-${largeTitleTranslate}px)`,
                willChange: "opacity, transform",
              }}
            >
              <h1 className="text-[34px] font-bold tracking-tight text-default leading-tight">
                Settings
              </h1>
            </div>

            <SettingsSidebar activeTab={activeTabMobile} onSelect={selectMobileTab} mobile />
          </div>

          {/* Floating nav bar */}
          <div
            className="absolute top-0 left-0 right-0 flex items-center justify-center"
            style={{
              height: "44px",
              zIndex: 20,
              backgroundColor: isScrolled
                ? "color-mix(in srgb, var(--color-surface) 88%, transparent)"
                : "transparent",
              backdropFilter: isScrolled ? "blur(16px)" : "none",
              WebkitBackdropFilter: isScrolled ? "blur(16px)" : "none",
              borderBottom: isScrolled ? "1px solid var(--color-border)" : "1px solid transparent",
              transition: "background-color 150ms ease, border-color 150ms ease",
            }}
          >
            <span
              className="text-[15px] font-semibold text-default"
              style={{ opacity: smallTitleOpacity, transition: "opacity 80ms linear" }}
            >
              Settings
            </span>
          </div>
        </div>

        {/* ── DETAIL VIEW ── */}
        <div
          className={`absolute inset-0 flex flex-col transition-transform duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
            mobileView === "detail" ? "translate-x-0" : "translate-x-full"
          }`}
          style={{ zIndex: mobileView === "detail" ? 10 : 5, backgroundColor: "var(--color-surface)" }}
        >
          {/* iOS nav bar */}
          <div
            className="flex-shrink-0 flex items-center px-2 border-b border-[var(--color-border)]"
            style={{
              height: "44px",
              backgroundColor: "color-mix(in srgb, var(--color-surface) 92%, transparent)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            <button
              type="button"
              onClick={goBack}
              className="flex items-center gap-0.5 text-[#007AFF] text-[15px] font-medium py-1.5 px-2 rounded-lg hover:bg-[var(--color-hover)] transition-colors"
            >
              <ChevronLeft className="w-[18px] h-[18px]" strokeWidth={2.5} />
              Settings
            </button>
            <span className="absolute left-1/2 -translate-x-1/2 text-[15px] font-semibold text-default pointer-events-none">
              {SETTINGS_TABS[activeTabMobile]?.label}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ WebkitOverflowScrolling: "touch" }}>
            <div className="px-0 py-2">
              <MobileActivePanel />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

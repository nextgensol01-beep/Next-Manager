"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import SettingsSidebar, { SETTINGS_TABS } from "./SettingsSidebar";
import { SettingsSearchProvider } from "./SettingsSearchContext";
import GeneralPanel from "./GeneralPanel";
import AccessPanel from "./AccessPanel";
import CustomFieldsPanel from "./CustomFieldsPanel";

const PANELS = [GeneralPanel, AccessPanel, CustomFieldsPanel];
const ANIM_DURATION = 280;
const LARGE_TITLE_THRESHOLD = 52;
const TAB_SLUGS = ["general", "access", "custom-fields"];

export default function SettingsShell() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Desktop: pure local state, URL param ignored
  const [desktopTab, setDesktopTab] = useState(0);
  const [exitingTab, setExitingTab] = useState<number | null>(null);
  const animatingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mobile: derived from URL param
  const tabParam = searchParams.get("tab");
  const mobileTabIndex = TAB_SLUGS.indexOf(tabParam ?? "");
  const activeTabMobile = mobileTabIndex >= 0 ? mobileTabIndex : 0;
  const mobileView = tabParam ? "detail" : "list";

  // Scroll tracking for mobile large title
  const [listScrollY, setListScrollY] = useState(0);
  const listScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

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

  const selectDesktopTab = (index: number, sectionId?: string) => {
    if (animatingRef.current || index === desktopTab) {
      // Even if same tab, scroll to section
      if (sectionId) {
        setTimeout(() => {
          document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
      return;
    }
    animatingRef.current = true;
    setExitingTab(desktopTab);
    setDesktopTab(index);
    timerRef.current = setTimeout(() => {
      setExitingTab(null);
      animatingRef.current = false;
      if (sectionId) {
        setTimeout(() => {
          document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
      }
    }, ANIM_DURATION);
  };

  const selectMobileTab = (index: number) => {
    router.push(`?tab=${TAB_SLUGS[index]}`);
  };

  const goBack = () => router.back();

  const DesktopActivePanel = PANELS[desktopTab];
  const DesktopExitingPanel = exitingTab !== null ? PANELS[exitingTab] : null;
  const MobileActivePanel = PANELS[activeTabMobile];

  return (
    <SettingsSearchProvider>
      {/* ── Desktop / iPad layout (md+) ── */}
      <div
        className="hidden md:flex h-full border border-[var(--color-border)] shadow-sm"
        style={{ borderRadius: "16px", overflow: "hidden" }}
      >
        {/* Sidebar */}
        <div
          className="flex-shrink-0 flex flex-col"
          style={{
            width: "260px",
            borderRight: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface)",
            // Fix 4: give sidebar a real height so h-full inside works
            height: "100%",
            overflow: "hidden",
          }}
        >
          {/* Sidebar "Settings" title */}
          <div className="px-5 pt-4 pb-3 flex-shrink-0">
            <p className="text-[22px] font-bold tracking-tight text-default">Settings</p>
          </div>

          {/* SettingsSidebar gets remaining height */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <SettingsSidebar activeTab={desktopTab} onSelect={selectDesktopTab} />
          </div>
        </div>

        {/* Panel area — position:relative so the absolute title bar is anchored here.
            NO overflow:hidden — sticky/absolute + backdrop-filter needs a clear stacking context. */}
        <div
          className="flex-1 min-w-0 flex flex-col"
          style={{ backgroundColor: "var(--color-surface)", position: "relative", minWidth: 0 }}
        >
          {/* Frosted-glass title bar — absolutely positioned ABOVE the scroll div.
              Being a sibling (not child) of the scroll area means:
              1. overflow:hidden on parent doesn't trap it
              2. backdrop-filter correctly blurs the scroll content behind it */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 10,
              height: "52px",
              display: "flex",
              alignItems: "center",
              paddingLeft: "28px",
              paddingRight: "28px",
              backgroundColor: "color-mix(in srgb, var(--color-surface) 78%, transparent)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              borderBottom: "1px solid color-mix(in srgb, var(--color-border) 70%, transparent)",
            }}
          >
            <h2 className="text-[17px] font-semibold text-default">
              {SETTINGS_TABS[desktopTab]?.label}
            </h2>
          </div>

          {/* Scroll area — paddingTop:52px so content starts below the absolute title bar */}
          <div
            className="flex-1 overflow-y-auto overflow-x-hidden"
            style={{ minHeight: 0, paddingTop: "52px" }}
          >
            <div style={{ position: "relative", minHeight: "100%" }}>
              {DesktopExitingPanel && (
                <div
                  key={`exit-${exitingTab}`}
                  className="panel-exit"
                  style={{
                    position: "absolute",
                    inset: 0,
                    padding: "24px 28px 40px",
                    pointerEvents: "none",
                    overflow: "hidden",
                  }}
                >
                  <DesktopExitingPanel />
                </div>
              )}
              <div
                key={`enter-${desktopTab}`}
                className={exitingTab !== null ? "panel-enter" : ""}
                style={{ padding: "24px 28px 40px" }}
              >
                <DesktopActivePanel />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile layout ── */}
      <div
        className="md:hidden"
        style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}
      >
        {/* LIST VIEW */}
        <div
          className={`absolute inset-0 transition-transform duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
            mobileView === "list" ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{
            zIndex: mobileView === "list" ? 10 : 5,
            backgroundColor: "var(--color-surface)",
          }}
        >
          {/* Scroll area */}
          <div
            ref={listScrollRef}
            onScroll={handleListScroll}
            className="absolute inset-0 overflow-y-auto overflow-x-hidden"
            style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {/* Spacer under floating nav bar */}
            <div style={{ height: "56px" }} />

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
              height: "56px",
              zIndex: 20,
              backgroundColor: isScrolled
                ? "color-mix(in srgb, var(--color-surface) 88%, transparent)"
                : "transparent",
              backdropFilter: isScrolled ? "blur(16px)" : "none",
              WebkitBackdropFilter: isScrolled ? "blur(16px)" : "none",
              borderBottom: isScrolled
                ? "1px solid var(--color-border)"
                : "1px solid transparent",
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

        {/* DETAIL VIEW — outer div handles slide animation only */}
        <div
          className={`absolute inset-0 transition-transform duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
            mobileView === "detail" ? "translate-x-0" : "translate-x-full"
          }`}
          style={{ zIndex: mobileView === "detail" ? 10 : 5 }}
        >
          {/* Inner wrapper: position:relative so nav bar anchors to THIS div, not the grandparent */}
          <div style={{ position: "relative", width: "100%", height: "100%", backgroundColor: "var(--color-surface)" }}>

            {/* Scroll area — fills full height, content starts at top, spacer pushes below nav bar */}
            <div
              className="absolute inset-0 overflow-y-auto overflow-x-hidden"
              style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              <div style={{ height: "56px" }} />
              <div className="px-3 pt-3 pb-6">
                <MobileActivePanel />
              </div>
            </div>

            {/* iOS nav bar — absolute on top of scroll, blurs content scrolling behind it */}
            <div
              className="flex items-center px-2"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                zIndex: 20,
                height: "56px",
                backgroundColor: "color-mix(in srgb, var(--color-surface) 82%, transparent)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                borderBottom: "1px solid color-mix(in srgb, var(--color-border) 70%, transparent)",
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
              <span
                className="text-[15px] font-semibold text-default pointer-events-none"
                style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}
              >
                {SETTINGS_TABS[activeTabMobile]?.label}
              </span>
            </div>
          </div>
        </div>
      </div>
    </SettingsSearchProvider>
  );
}

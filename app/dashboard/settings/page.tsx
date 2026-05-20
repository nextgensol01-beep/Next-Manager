"use client";
import { Suspense } from "react";
import SettingsShell from "./SettingsShell";

export default function SettingsPage() {
  return (
    <>
      {/* Mobile: break out of dashboard-main's p-4 (16px) padding so the shell
          sits flush edge-to-edge and touches the top bar with no gap */}
      <style>{`
        @media (max-width: 767px) {
          .settings-page-wrapper {
            margin: -16px;
            width: calc(100% + 32px);
            height: calc(100% + 32px);
          }
        }
        @media (min-width: 768px) {
          .settings-page-wrapper {
            height: 100%;
          }
        }
      `}</style>
      <div className="settings-page-wrapper">
        <Suspense fallback={<div className="h-full" />}>
          <SettingsShell />
        </Suspense>
      </div>
    </>
  );
}

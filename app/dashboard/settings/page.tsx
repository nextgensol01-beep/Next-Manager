"use client";
import { Suspense } from "react";
import SettingsShell from "./SettingsShell";

export default function SettingsPage() {
  return (
    <div className="h-full">
      {/* Suspense required for useSearchParams() inside SettingsShell */}
      <Suspense fallback={<div className="h-full" />}>
        <SettingsShell />
      </Suspense>
    </div>
  );
}

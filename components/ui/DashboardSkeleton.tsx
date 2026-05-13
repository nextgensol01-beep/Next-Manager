/**
 * DashboardSkeleton
 *
 * Mirrors the exact layout of DashboardPage while data loads:
 *   - 2 rows of 4 stat cards
 *   - Bar chart card + progress metrics card (side by side)
 *   - Full-width area chart card
 *
 * Drop-in replacement for the LoadingSpinner on the dashboard.
 */

import { Sk } from "@/components/ui/Skeleton";

/* Reusable mini-skeleton for the progress metric rows */
function ProgressRowSk() {
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <Sk.Box h={13} w="38%" />
        <Sk.Box h={13} w="28px" />
      </div>
      <Sk.Box h={5} w="100%" radius={999} style={{ marginBottom: 6 }} />
      <div className="flex justify-between">
        <Sk.Box h={11} w="42%" />
        <Sk.Box h={11} w="32%" />
      </div>
    </div>
  );
}

export default function DashboardSkeleton() {
  return (
    <div>
      {/* ── Row 1: 4 stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        {[0, 1, 2, 3].map((i) => (
          <Sk.StatCard key={i} index={i} />
        ))}
      </div>

      {/* ── Row 2: 4 stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[4, 5, 6, 7].map((i) => (
          <Sk.StatCard key={i} index={i} />
        ))}
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">

        {/* Bar chart card */}
        <Sk.Card className="p-5">
          {/* Title + subtitle */}
          <Sk.Box h={16} w="65%" style={{ marginBottom: 8 }} />
          <Sk.Box h={11} w="80%" style={{ marginBottom: 24 }} />

          {/* Y-axis labels + bar columns */}
          <div className="flex gap-3 items-end" style={{ height: 220 }}>
            {/* Y-axis stub */}
            <div className="flex flex-col justify-between" style={{ height: "100%", paddingBottom: 20 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Sk.Box key={i} h={10} w={28} />
              ))}
            </div>

            {/* Bar groups */}
            <div className="flex-1 flex items-end gap-3" style={{ height: "100%" }}>
              {[85, 60, 100, 72, 90, 55].map((pct, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1" style={{ height: "100%", justifyContent: "flex-end" }}>
                  {/* Two bars per group */}
                  <div className="flex gap-1 w-full" style={{ height: `${pct}%` }}>
                    <Sk.Box h="100%" w="100%" radius={4} />
                    <Sk.Box h="100%" w="100%" radius={4} style={{ opacity: 0.6 }} />
                  </div>
                  <Sk.Box h={10} w="70%" />
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex gap-4 mt-3">
            <div className="flex items-center gap-2"><Sk.Circle size={7} /><Sk.Box h={11} w={50} /></div>
            <div className="flex items-center gap-2"><Sk.Circle size={7} /><Sk.Box h={11} w={55} /></div>
          </div>
        </Sk.Card>

        {/* Progress metrics card */}
        <Sk.Card className="p-5">
          <Sk.Box h={16} w="50%" style={{ marginBottom: 8 }} />
          <Sk.Box h={11} w="72%" style={{ marginBottom: 20 }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <ProgressRowSk />
            <ProgressRowSk />
            <ProgressRowSk />
          </div>

          {/* Mini stat pills */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl p-3 text-center bg-surface">
                <Sk.Box h={22} w="55%" style={{ margin: "0 auto 6px" }} radius={4} />
                <Sk.Box h={10} w="80%" style={{ margin: "0 auto" }} />
              </div>
            ))}
          </div>
        </Sk.Card>
      </div>

      {/* ── Area chart card ── */}
      <Sk.Card className="p-5 mb-5">
        <Sk.Box h={16} w="42%" style={{ marginBottom: 8 }} />
        <Sk.Box h={11} w="58%" style={{ marginBottom: 20 }} />

        {/* Area chart body */}
        <div className="flex gap-3 items-end" style={{ height: 160 }}>
          {/* Y-axis stub */}
          <div className="flex flex-col justify-between" style={{ height: "100%", paddingBottom: 16 }}>
            {[0, 1, 2, 3].map((i) => (
              <Sk.Box key={i} h={10} w={28} />
            ))}
          </div>

          {/* Area — simulate the wave shape with staggered heights */}
          <div className="flex-1 flex items-end gap-2" style={{ height: "100%" }}>
            {[40, 55, 45, 70, 60, 88, 75, 92, 80].map((pct, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1" style={{ height: "100%", justifyContent: "flex-end" }}>
                <Sk.Box h={`${pct}%`} w="100%" radius={4} style={{ opacity: 0.55 + i * 0.04 }} />
                {i % 2 === 0 && <Sk.Box h={10} w="80%" />}
              </div>
            ))}
          </div>
        </div>
      </Sk.Card>
    </div>
  );
}

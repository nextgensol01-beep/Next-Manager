/**
 * BillingSkeleton
 *
 * Mirrors the loading state of the billing page:
 *   - 6 stat cards (2-col on mobile, 3+3 on xl)
 *   - 4 aging bucket pills
 *   - Advance payments section
 *   - Search + filter bar
 *   - 3 billing cards (collapsed shape)
 *
 * Each section shimmers independently so it reads as a real page shape.
 */

import { Sk } from "@/components/ui/Skeleton";

/* Single collapsed billing card skeleton */
function BillingCardSk({ index = 0 }: { index?: number }) {
  return (
    <Sk.Card
      className="overflow-hidden"
      style={{
        borderLeft: "3px solid var(--color-border)",
        animationDelay: `${index * 80}ms`,
      }}
    >
      <div className="p-5">
        {/* Header row: name + badges */}
        <div className="flex items-start justify-between mb-4">
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <Sk.Box h={16} w={160} />
            <Sk.Box h={11} w={110} />
          </div>
          <div className="flex items-center gap-2">
            <Sk.Box h={22} w={55} radius={999} />
            <Sk.Box h={22} w={88} radius={999} />
            <Sk.Box h={28} w={28} radius={8} />
            <Sk.Box h={28} w={28} radius={8} />
          </div>
        </div>

        {/* Charge grid: 4 mini tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-surface rounded-lg px-3 py-2">
              <Sk.Box h={10} w="50%" style={{ marginBottom: 6 }} />
              <Sk.Box h={14} w="70%" />
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between mb-1.5">
            <Sk.Box h={11} w={80} />
            <Sk.Box h={14} w={90} />
          </div>
          <Sk.Box h={8} w="100%" radius={999} />
          <div className="flex justify-between mt-1">
            <Sk.Box h={10} w={70} />
            <Sk.Box h={10} w={70} />
          </div>
        </div>

        {/* Action tray */}
        <div
          className="glass-tray"
          style={{ flexWrap: "wrap", pointerEvents: "none" }}
        >
          {[90, 100, 60, 110, 75].map((w, i) => (
            <Sk.Box key={i} h={30} w={w} radius={10} style={{ opacity: 0.5 }} />
          ))}
        </div>
      </div>
    </Sk.Card>
  );
}

/* Advance payment table skeleton */
function AdvanceTableSk() {
  return (
    <div className="rounded-2xl border border-base bg-surface p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <Sk.Box h={14} w={140} />
        <Sk.Box h={11} w={55} />
      </div>
      {/* Table-like rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4 py-2 border-t border-soft">
            <div style={{ flex: 2 }}>
              <Sk.Box h={13} w="75%" style={{ marginBottom: 5 }} />
              <Sk.Box h={10} w="50%" />
            </div>
            <Sk.Box h={13} w={70} style={{ flex: "0 0 auto" }} />
            <Sk.Box h={13} w={80} style={{ flex: "0 0 auto" }} />
            <Sk.Box h={22} w={50} radius={4} style={{ flex: "0 0 auto" }} />
            <Sk.Box h={13} w={50} style={{ flex: "0 0 auto" }} />
            <div className="flex gap-1">
              <Sk.Box h={24} w={24} radius={6} />
              <Sk.Box h={24} w={24} radius={6} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BillingSkeleton() {
  return (
    <div>
      {/* ── 6 stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Sk.StatCard key={i} index={i} />
        ))}
      </div>

      {/* ── 4 aging bucket pills ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[0, 1, 2, 3].map((i) => (
          <Sk.Card key={i} className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <Sk.Box h={11} w={55} />
              <Sk.Box h={11} w={24} />
            </div>
            <Sk.Box h={18} w="65%" style={{ marginBottom: 8 }} />
            <Sk.Box h={4} w="100%" radius={999} />
          </Sk.Card>
        ))}
      </div>

      {/* ── Advance payments section ── */}
      <Sk.Card className="p-4 mb-4">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4">
          <div className="flex items-start gap-3">
            <Sk.Box h={40} w={40} radius={12} />
            <div>
              <Sk.Box h={16} w={160} style={{ marginBottom: 7 }} />
              <Sk.Box h={11} w={240} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2" style={{ minWidth: 360 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl border border-base bg-surface px-3 py-2">
                <Sk.Box h={10} w="60%" style={{ marginBottom: 6 }} />
                <Sk.Box h={14} w="75%" />
              </div>
            ))}
          </div>
        </div>
        <AdvanceTableSk />
      </Sk.Card>

      {/* ── Search + filter bar ── */}
      <Sk.Card className="mb-3 overflow-hidden">
        {/* Search row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-soft">
          <Sk.Box h={16} w={16} radius={4} />
          <Sk.Box h={14} w="50%" />
          <div className="flex items-center gap-1 ml-auto pl-3 border-l border-soft">
            <Sk.Box h={28} w={28} radius={8} />
            <Sk.Box h={28} w={28} radius={8} />
          </div>
        </div>
        {/* Filter pills row */}
        <div className="flex flex-wrap gap-2 px-4 py-2.5">
          {[56, 70, 58, 62, 46, 80, 62, 95, 88].map((w, i) => (
            <Sk.Box key={i} h={28} w={w} radius={999} style={{ opacity: i === 0 ? 0.9 : 0.45 }} />
          ))}
        </div>
      </Sk.Card>

      {/* ── 3 billing card skeletons ── */}
      <div className="space-y-3">
        <BillingCardSk index={0} />
        <BillingCardSk index={1} />
        <BillingCardSk index={2} />
      </div>
    </div>
  );
}

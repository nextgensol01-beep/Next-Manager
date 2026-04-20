"use client";
import React from "react";
import {
  TrendingUp, TrendingDown, Lightbulb, AlertTriangle,
  Info, Loader2, CheckCircle2, PackageOpen,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CatQty {
  cat1: number; cat2: number; cat3: number; cat4: number;
}
interface CatQtyWithTotal extends CatQty { total: number; }

export interface InsightsData {
  pwp: {
    isExternal: true;
  } | {
    isExternal: false;
    generated: CatQty;
    sold:      CatQty;
    available: CatQtyWithTotal;
  } | null;
  pibo: {
    target:    CatQty;
    purchased: CatQty;
    pending:   CatQtyWithTotal;
    excess:    CatQtyWithTotal;
  } | null;
}

interface Props {
  insights:     InsightsData | null;
  loading:      boolean;
  formQty:      CatQty;           // what the user has typed in the form right now
  isExternalPwp: boolean;         // true when "External" is selected in From (PWP)
  hasPibo:       boolean;         // true when a PIBO is selected in To
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATS  = ["CAT-I", "CAT-II", "CAT-III", "CAT-IV"] as const;
const CKEYS = ["cat1",  "cat2",   "cat3",    "cat4"  ] as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function MiniBar({
  value, max, color,
}: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex-1 h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-300 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function CatRow({
  label, value, max, color, dimIfZero,
}: { label: string; value: number; max: number; color: string; dimIfZero?: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${dimIfZero && value === 0 ? "opacity-40" : ""}`}>
      <span className="w-12 text-[var(--color-text-muted)] shrink-0">{label}</span>
      <MiniBar value={value} max={max} color={color} />
      <span className="w-14 text-right font-mono font-semibold text-[var(--color-text)]">
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function SectionHeader({
  icon, label, badge, badgeColor,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  badge?: string;
  badgeColor?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-2.5">
      {icon}
      <span className="text-xs font-semibold text-[var(--color-text)]">{label}</span>
      {badge && (
        <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
          {badge}
        </span>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CreditInsightsPanel({
  insights, loading, formQty, isExternalPwp, hasPibo,
}: Props) {

  const anyQtyEntered = CKEYS.some((k) => formQty[k] > 0);

  // ── Derive PWP data ──────────────────────────────────────────────────────
  const pwpData  = (!insights?.pwp || insights.pwp.isExternal) ? null
    : insights.pwp as Exclude<InsightsData["pwp"], { isExternal: true } | null>;

  // ── Derive PIBO data ─────────────────────────────────────────────────────
  const piboData = insights?.pibo ?? null;

  // ── Hard errors (per-cat) ────────────────────────────────────────────────
  // Block submit when user entered > available (only for non-zero entries)
  const hardErrors: { label: string; entered: number; avail: number }[] = [];
  if (pwpData && anyQtyEntered) {
    CKEYS.forEach((k, i) => {
      const entered = formQty[k];
      const avail   = pwpData.available[k];
      if (entered > 0 && entered > avail) {
        hardErrors.push({ label: CATS[i], entered, avail });
      }
    });
  }

  // ── Soft warnings (per-cat) ──────────────────────────────────────────────
  // Warn when user entered > pending target (still allowed)
  const softWarnings: { label: string; excess: number }[] = [];
  if (piboData && anyQtyEntered) {
    CKEYS.forEach((k, i) => {
      const entered  = formQty[k];
      const pending  = piboData.pending[k];
      if (entered > 0 && entered > pending) {
        softWarnings.push({ label: CATS[i], excess: entered - pending });
      }
    });
  }

  // ── Suggested quantity = min(available, pending) per cat ─────────────────
  const suggestedQty: (CatQty & { total: number }) | null =
    pwpData && piboData
      ? (() => {
          const s = {
            cat1: Math.min(pwpData.available.cat1, piboData.pending.cat1),
            cat2: Math.min(pwpData.available.cat2, piboData.pending.cat2),
            cat3: Math.min(pwpData.available.cat3, piboData.pending.cat3),
            cat4: Math.min(pwpData.available.cat4, piboData.pending.cat4),
            total: 0,
          };
          s.total = s.cat1 + s.cat2 + s.cat3 + s.cat4;
          return s;
        })()
      : null;

  // ── Scale for bar chart ──────────────────────────────────────────────────
  const barMax = Math.max(
    pwpData  ? pwpData.available.total  : 0,
    piboData ? piboData.pending.total   : 0,
    1,
  );

  // ── Nothing selected yet ─────────────────────────────────────────────────
  if (!isExternalPwp && !hasPibo && !loading) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-border)] text-xs
                      text-[var(--color-text-faint)] px-4 py-3 flex items-center gap-2">
        <Info className="w-3.5 h-3.5 shrink-0" />
        <span>Select a PWP or PIBO to see real-time credit insights</span>
      </div>
    );
  }

  // ── Panel ─────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]
                    overflow-hidden text-sm transition-colors">

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--color-border)]
                      bg-[var(--color-card)]">
        <Info className="w-3.5 h-3.5 text-brand-500 shrink-0" />
        <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
          Credit Insights
        </span>
        {loading && (
          <Loader2 className="w-3.5 h-3.5 ml-auto text-[var(--color-text-muted)] animate-spin" />
        )}
      </div>

      <div className="p-4 space-y-4">

        {/* ── External PWP notice ── */}
        {isExternalPwp && (
          <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400
                          bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2.5">
            <PackageOpen className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>External PWP — no credit data available</span>
          </div>
        )}

        {/* ── PWP Available Credits ── */}
        {!isExternalPwp && (
          <div>
            <SectionHeader
              icon={<TrendingUp className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />}
              label={<>Available Credits <span className="font-normal text-[var(--color-text-faint)]">(PWP Supply)</span></>}
              badge={pwpData ? pwpData.available.total.toLocaleString() : undefined}
              badgeColor="bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400"
            />

            {loading ? (
              <div className="space-y-2">
                {CATS.map((c) => (
                  <div key={c} className="flex items-center gap-2 text-xs">
                    <span className="w-12 text-[var(--color-text-faint)] shrink-0">{c}</span>
                    <div className="flex-1 h-1.5 bg-[var(--color-border)] rounded-full animate-pulse" />
                    <span className="w-14" />
                  </div>
                ))}
              </div>
            ) : pwpData ? (
              <>
                <div className="space-y-1.5">
                  {CKEYS.map((k, i) => (
                    <CatRow
                      key={k}
                      label={CATS[i]}
                      value={pwpData.available[k]}
                      max={barMax}
                      color="bg-teal-500"
                      dimIfZero
                    />
                  ))}
                </div>
                {/* Generated vs Sold summary */}
                <div className="mt-2 pt-2 border-t border-[var(--color-border-soft)]
                                flex gap-3 text-[10px] text-[var(--color-text-faint)]">
                  <span>Generated: <strong className="text-[var(--color-text)]">
                    {(pwpData.generated.cat1 + pwpData.generated.cat2 +
                      pwpData.generated.cat3 + pwpData.generated.cat4).toLocaleString()}
                  </strong></span>
                  <span className="text-[var(--color-border-soft)]">|</span>
                  <span>Sold: <strong className="text-[var(--color-text)]">
                    {(pwpData.sold.cat1 + pwpData.sold.cat2 +
                      pwpData.sold.cat3 + pwpData.sold.cat4).toLocaleString()}
                  </strong></span>
                  <span className="text-[var(--color-border-soft)]">|</span>
                  <span>Available: <strong className="text-teal-600 dark:text-teal-400">
                    {pwpData.available.total.toLocaleString()}
                  </strong></span>
                </div>
              </>
            ) : (
              <p className="text-xs text-[var(--color-text-faint)] italic">
                {loading ? "Loading…" : "Select a PWP to see available credits"}
              </p>
            )}
          </div>
        )}

        {/* ── Divider ── */}
        {!isExternalPwp && hasPibo && (
          <div className="border-t border-[var(--color-border-soft)]" />
        )}

        {/* ── PIBO Required Credits ── */}
        {hasPibo && (
          <div>
            <SectionHeader
              icon={<TrendingDown className="w-3.5 h-3.5 text-brand-500 dark:text-brand-400 shrink-0" />}
              label={<>Required Credits <span className="font-normal text-[var(--color-text-faint)]">(PIBO Demand)</span></>}
              badge={piboData
                ? piboData.pending.total > 0
                  ? `${piboData.pending.total.toLocaleString()} pending`
                  : "Target met ✓"
                : undefined}
              badgeColor={piboData?.pending.total === 0
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                : "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-400"}
            />

            {loading ? (
              <div className="space-y-2">
                {CATS.map((c) => (
                  <div key={c} className="flex items-center gap-2 text-xs">
                    <span className="w-12 text-[var(--color-text-faint)] shrink-0">{c}</span>
                    <div className="flex-1 h-1.5 bg-[var(--color-border)] rounded-full animate-pulse" />
                    <span className="w-14" />
                  </div>
                ))}
              </div>
            ) : piboData ? (
              <>
                {/* Pending rows */}
                <div className="space-y-1.5">
                  {CKEYS.map((k, i) => (
                    <CatRow
                      key={k}
                      label={CATS[i]}
                      value={piboData.pending[k]}
                      max={Math.max(
                        piboData.target.cat1 + piboData.target.cat2 +
                        piboData.target.cat3 + piboData.target.cat4, 1
                      )}
                      color="bg-brand-500"
                      dimIfZero
                    />
                  ))}
                </div>

                {/* Target / Purchased / Excess summary */}
                <div className="mt-2 pt-2 border-t border-[var(--color-border-soft)]
                                flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[var(--color-text-faint)]">
                  <span>Target: <strong className="text-[var(--color-text)]">
                    {(piboData.target.cat1 + piboData.target.cat2 +
                      piboData.target.cat3 + piboData.target.cat4).toLocaleString()}
                  </strong></span>
                  <span className="text-[var(--color-border-soft)]">|</span>
                  <span>Purchased: <strong className="text-brand-600 dark:text-brand-400">
                    {(piboData.purchased.cat1 + piboData.purchased.cat2 +
                      piboData.purchased.cat3 + piboData.purchased.cat4).toLocaleString()}
                  </strong></span>
                  {piboData.excess.total > 0 && (
                    <>
                      <span className="text-[var(--color-border-soft)]">|</span>
                      <span>
                        Excess: <strong className="text-amber-600 dark:text-amber-400">
                          +{piboData.excess.total.toLocaleString()}
                        </strong>
                      </span>
                    </>
                  )}
                  {piboData.pending.total === 0 && piboData.excess.total === 0 && (
                    <>
                      <span className="text-[var(--color-border-soft)]">|</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        Target fully met
                      </span>
                    </>
                  )}
                </div>

                {/* Per-cat excess chips (if any over-bought) */}
                {piboData.excess.total > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {CKEYS.map((k, i) =>
                      piboData.excess[k] > 0 ? (
                        <span key={k}
                          className="text-[10px] px-2 py-0.5 rounded-full
                                     bg-amber-50 dark:bg-amber-900/30
                                     text-amber-700 dark:text-amber-400 font-medium">
                          {CATS[i]}: +{piboData.excess[k].toLocaleString()} over
                        </span>
                      ) : null
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-[var(--color-text-faint)] italic">
                Select a PIBO to see required credits
              </p>
            )}
          </div>
        )}

        {/* ── Suggested Quantity ── */}
        {suggestedQty && suggestedQty.total > 0 && (
          <>
            <div className="border-t border-[var(--color-border-soft)]" />
            <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/20
                            rounded-lg px-3 py-2.5">
              <Lightbulb className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">
                  Suggested Quantity
                  <span className="font-normal text-blue-500 dark:text-blue-500 ml-1">
                    = min(available, pending)
                  </span>
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs
                                text-blue-700 dark:text-blue-400">
                  {CKEYS.map((k, i) =>
                    suggestedQty[k] > 0 ? (
                      <span key={k} className="font-mono">
                        {CATS[i]}: <strong>{suggestedQty[k].toLocaleString()}</strong>
                      </span>
                    ) : null
                  )}
                </div>
                <p className="text-[10px] text-blue-500 mt-1">
                  Total: <strong>{suggestedQty.total.toLocaleString()}</strong> — hint only, not auto-filled
                </p>
              </div>
            </div>
          </>
        )}

        {/* ── Target already fully met notice ── */}
        {piboData && piboData.pending.total === 0 && piboData.excess.total === 0 && !loading && (
          <>
            <div className="border-t border-[var(--color-border-soft)]" />
            <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400
                            bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>This PIBO has fully met its credit target for the selected FY and type.</span>
            </div>
          </>
        )}

        {/* ── Hard Validation Errors ── */}
        {hardErrors.length > 0 && (
          <>
            <div className="border-t border-[var(--color-border-soft)]" />
            <div className="space-y-1.5">
              {hardErrors.map(({ label, entered, avail }) => (
                <div key={label}
                  className="flex items-start gap-2 text-xs text-red-700 dark:text-red-400
                             bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    <strong>{label}:</strong> entered{" "}
                    <strong>{entered.toLocaleString()}</strong> but only{" "}
                    <strong>{avail.toLocaleString()}</strong> available — reduce to proceed
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Soft Warnings (only when no hard errors) ── */}
        {softWarnings.length > 0 && hardErrors.length === 0 && (
          <>
            <div className="border-t border-[var(--color-border-soft)]" />
            <div className="space-y-1.5">
              {softWarnings.map(({ label, excess }) => (
                <div key={label}
                  className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400
                             bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    <strong>{label}:</strong> exceeds required target by{" "}
                    <strong>{excess.toLocaleString()}</strong> — allowed but noted
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

      </div>
    </div>
  );
}

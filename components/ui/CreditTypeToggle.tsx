/**
 * CreditTypeToggle — shared segmented toggle for Recycling / End-of-Life.
 * Used in:
 *  - Credit Transactions form
 *  - Financial Year add/edit form
 */
"use client";
import { Recycle, Leaf } from "lucide-react";

export type CreditType = "RECYCLING" | "EOL";

/** Normalise legacy values ("Recycling" → "RECYCLING", "EOL" → "EOL") */
export function normaliseCreditType(v?: string): CreditType {
  if (!v) return "RECYCLING";
  if (v.toUpperCase() === "EOL") return "EOL";
  return "RECYCLING";
}

/** Display label + icon for a given type value */
export function CreditTypeBadge({ type }: { type?: string }) {
  const t = normaliseCreditType(type);
  if (t === "EOL") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 px-2 py-0.5 rounded-full">
        <Leaf className="w-3 h-3" />E.O.L
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400 px-2 py-0.5 rounded-full">
      <Recycle className="w-3 h-3" />Recycling
    </span>
  );
}

const OPTIONS: { value: CreditType; label: string; icon: React.ReactNode }[] = [
  { value: "RECYCLING", label: "Recycling",         icon: <Recycle className="w-4 h-4" /> },
  { value: "EOL",       label: "End of Life (E.O.L)", icon: <Leaf    className="w-4 h-4" /> },
];

interface Props {
  value: CreditType;
  onChange: (v: CreditType) => void;
  /** Optional label shown above the toggle */
  label?: string;
}

export default function CreditTypeToggle({ value, onChange, label }: Props) {
  return (
    <div>
      {label && <label className="label mb-2">{label}</label>}
      <div className="flex gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
              value === opt.value
                ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400"
                : "border-base text-muted hover:border-brand-300"
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

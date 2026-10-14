"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Leaf, Plus, Recycle, X } from "lucide-react";
import LiquidGlassDropdown from "@/components/ui/LiquidGlassDropdown";
import {
  FY_CATEGORIES,
  FY_CATEGORY_LABELS,
  FY_CREDIT_TYPES,
} from "@/lib/financial-year-form";
import type { useFinancialYearForm } from "./useFinancialYearForm";

export default function FinancialYearTargetRows({
  form,
  onImport,
}: {
  form: ReturnType<typeof useFinancialYearForm>;
  onImport: () => void;
}) {
  const reduced = useReducedMotion();
  return (
    <section
      className="fy-targets"
      aria-label={form.isPWP ? "Generated credits" : "EPR targets"}
    >
      <div className="fy-section-heading">
        <div>
          <h4>{form.isPWP ? "Generated Credits" : "EPR Targets"}</h4>
          <p>
            Category-wise {form.isPWP ? "credit generation" : "obligations"} ·
            quantities in MT
          </p>
        </div>
        {!form.isPWP && (
          <button
            type="button"
            className="fy-text-button"
            data-fy-import
            onClick={onImport}
          >
            Import from Screenshot
          </button>
        )}
      </div>
      <div className="fy-row-head" aria-hidden="true">
        <span>Category</span>
        <span>Type</span>
        <span>{form.isPWP ? "Generated" : "Target"}</span>
        <span />
      </div>
      <div className="fy-rows">
        <AnimatePresence initial={false}>
          {form.rows.map((row, index) => {
            const error = form.rowErrors[row.id],
              errorId = `${row.id}-error`;
            const patch = (value: Partial<typeof row>) =>
              form.setRows((previous) =>
                previous.map((item) =>
                  item.id === row.id ? { ...item, ...value } : item,
                ),
              );
            return (
              <motion.div
                key={row.id}
                data-fy-row={row.id}
                className={`fy-target-row ${error ? "has-error" : ""}`}
                layout="position"
                initial={{ opacity: 0, y: reduced ? 0 : 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: reduced ? 0 : 0.2 }}
              >
                <LiquidGlassDropdown
                  label={`Row ${index + 1} category`}
                  variant="condition"
                  portal
                  value={row.categoryId}
                  invalid={Boolean(error)}
                  describedBy={error ? errorId : undefined}
                  options={FY_CATEGORIES.map((value) => ({
                    value,
                    label: FY_CATEGORY_LABELS[value],
                  }))}
                  onChange={(categoryId) => patch({ categoryId })}
                />
                <div
                  className="fy-type-control"
                  role="group"
                  aria-label={`Row ${index + 1} credit type`}
                >
                  {FY_CREDIT_TYPES.map((type) => {
                    const Icon = type === "RECYCLING" ? Recycle : Leaf;
                    return (
                      <button
                        key={type}
                        type="button"
                        aria-pressed={type === row.type}
                        onClick={() => patch({ type })}
                        onKeyDown={(event) => {
                          if (!["ArrowLeft", "ArrowRight"].includes(event.key))
                            return;
                          event.preventDefault();
                          patch({
                            type: row.type === "EOL" ? "RECYCLING" : "EOL",
                          });
                          (
                            event.currentTarget.parentElement?.querySelectorAll(
                              "button",
                            )[row.type === "EOL" ? 0 : 1] as HTMLButtonElement
                          )?.focus({ preventScroll: true });
                        }}
                      >
                        {row.type === type && (
                          <motion.span
                            className="fy-type-selection"
                            layoutId={`${row.id}-type`}
                            transition={{ duration: reduced ? 0 : 0.18 }}
                          />
                        )}
                        <span>
                          <Icon size={13} />
                          {type === "RECYCLING" ? "Recycling" : "EOL"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <label className="fy-quantity">
                  <span className="sr-only">
                    Row {index + 1} {form.isPWP ? "generated" : "target"}{" "}
                    quantity in MT
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    aria-label={`Row ${index + 1} quantity`}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? errorId : undefined}
                    value={row.value}
                    placeholder="0"
                    onChange={(event) => patch({ value: event.target.value })}
                  />
                  <span aria-hidden="true">MT</span>
                </label>
                <button
                  type="button"
                  className="fy-icon-button fy-remove-row"
                  aria-label={`Remove row ${index + 1}`}
                  disabled={form.rows.length === 1}
                  title={
                    form.rows.length === 1
                      ? "Keep one editable row; use 0 to clear the quantity"
                      : "Remove this editable quantity row"
                  }
                  onClick={() =>
                    form.setRows((previous) =>
                      previous.filter((item) => item.id !== row.id),
                    )
                  }
                >
                  <X size={15} />
                </button>
                {error && (
                  <p id={errorId} role="alert" className="fy-row-error">
                    {error}
                  </p>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      <div className="fy-row-actions">
        <button
          type="button"
          className="fy-text-button"
          onClick={form.add}
          disabled={!form.canAdd}
        >
          <Plus size={14} />
          {form.isPWP ? "Add Generated Row" : "Add Target Row"}
        </button>
        <span>Recycling and EOL can share a category.</span>
      </div>
      {form.reviewedImport && (
        <p className="fy-import-applied" role="status">
          Reviewed screenshot values are in this draft. Review the rows, then
          save.
        </p>
      )}
    </section>
  );
}
